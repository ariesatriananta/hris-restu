import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import { productionTransactionsRouter } from './production-transactions.js'

const mocks = vi.hoisted(() => ({query:vi.fn(),execute:vi.fn(),commit:vi.fn(),rollback:vi.fn(),audit:vi.fn(),saveQc:vi.fn()}))
vi.mock('../db.js',()=>{const conn={...mocks,beginTransaction:vi.fn(),release:vi.fn()};return {pool:{...conn,getConnection:async()=>conn}}})
vi.mock('../lib/audit.js',()=>({writeAudit:mocks.audit}))
vi.mock('../lib/production-qc-storage.js',async original => ({...await original<object>(),
  resolveProductionQc:async()=>({brand:{id:3,uid:'brand',code:'BR-1',name:'Brand'},weight1Grams:'70.00',weight2Grams:'71.00',defects:[{id:4,uid:'defect',code:'DF-1',name:'Reject',quantity:2,sortOrder:0}]}),
  readProductionQc:async()=>null,saveProductionQc:mocks.saveQc,cloneProductionQc:vi.fn(),assertProductionQcReplay:vi.fn(),
}))
vi.mock('../middleware/authenticate.js',()=>({authenticate:(_q:unknown,_s:unknown,next:()=>void)=>next(),requirePermission:()=> (_q:unknown,_s:unknown,next:()=>void)=>next()}))

const lintingJob='11111111-1111-4111-8111-111111111111'
const batilJob='22222222-2222-4222-8222-222222222222'
const rootUid='33333333-3333-4333-8333-333333333333'
const peerUid='44444444-4444-4444-8444-444444444444'
const key='55555555-5555-4555-8555-555555555555'
let site:string, partnerEligible:boolean, paired:boolean, existing:boolean, records:Record<number,Record<string,unknown>>
function record(id:number, overrides:Record<string,unknown>={}) {
  const isRoot=id===21
  return {id,uid:isRoot?rootUid:peerUid,employee_id:isRoot?11:12,employeeUid:isRoot?'linting-worker':'batil-worker',employeeNumber:isRoot?'K001':'K002',fullName:isRoot?'Linting Worker':'Batil Worker',
    site_id:3,site,siteName:'Klaten',businessDateKey:'2026-10-10',businessDate:'2026-10-10',transactionTimestamp:'2026-10-10 09:00:00.000',transactionAt:'2026-10-10T09:00:00+07:00',
    transaction_number:`PRD-${id}`,transactionNumber:`PRD-${id}`,quantity:'500.0000',status:'POSTED',jobUid:isRoot?lintingJob:batilJob,jobCode:isRoot?'BORONGAN-LINTING':'BORONGAN-BATIL',jobName:isRoot?'Linting':'Batil',
    production_job_id:isRoot?15:16,job_rate_id:isRoot?25:26,unit_id:17,attendance_record_id:isRoot?31:32,unitCode:'PCS',unitUid:'unit',unitName:'PCS',decimalPrecision:0,
    rate_snapshot:isRoot?'45.0000':'5.0000',rateSnapshot:isRoot?'45.0000':'5.0000',gross_amount:isRoot?'22500.00':'2500.00',grossAmount:isRoot?'22500.00':'2500.00',rateCurrency:'IDR',rateUid:'rate',quantity_deduction_percentage:'0.0000',quantityDeductionPercentage:'0.0000',deductedQuantity:'0.0000',payableQuantity:'500.0000',...overrides}
}
async function request(path:string,body:unknown) {
  const app=express();app.use(express.json());app.use((_q,res,next)=>{res.locals.auth={id:7,uid:'operator',roles:['SUPER_ADMIN'],permissions:[],siteAccess:['KLATEN']};next()});app.use('/production',productionTransactionsRouter);app.use(errorHandler)
  const server=app.listen(0);await new Promise<void>(r=>server.once('listening',r))
  try {return await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/production${path}`,{method:'POST',headers:{'content-type':'application/json','X-Production-Device-Token':'x'.repeat(43)},body:JSON.stringify(body)})}
  finally {await new Promise<void>(r=>server.close(()=>r()))}
}
function postBody(batilBarcode:string|undefined='K002') {return {barcode:'K001',batilBarcode,jobUid:lintingJob,quantity:'500',idempotencyKey:key}}

describe('Klaten atomic Linting/Batil pairs',()=>{
  beforeEach(()=>{
    Object.values(mocks).forEach(mock=>mock.mockReset());site='KLATEN';partnerEligible=true;paired=false;existing=false;records={21:record(21),22:record(22)}
    mocks.query.mockImplementation(async (sql:unknown,values:unknown[]=[])=>{
      const q=String(sql)
      if(q.includes('production_transaction_pairs pair')) {
        if(!paired)return [[]]
        if(q.includes('SELECT peer.*')) return [[records[Number(values[0])===21?22:21]]]
        if(q.includes('SELECT pair_member.id'))return [[{id:21,employeeId:11},{id:22,employeeId:12}]]
        return [[21,22].map(id=>({...records[id],pairUid:'pair',lintingId:21,batilId:22}))]
      }
      if(q.includes('production_token_hash'))return [[{id:9,uid:'device',isActive:1,activatedAt:'2026-10-01',site,siteId:3}]]
      if(q.includes('UTC_TIMESTAMP'))return [[{businessDate:'2026-10-10',transactionTimestamp:'2026-10-10 09:00:00.000'}]]
      if(q.includes('pt.idempotency_key=?'))return [existing?[{id:21,deviceId:9,barcode:'K001',jobUid:lintingJob,quantity:'500.0000'}]:[]]
      if(q.includes('SELECT uid FROM employees WHERE barcode'))return [[{uid:values[0]==='K002'?'batil-worker':'other-worker'}]]
      if(q.includes('FROM employees WHERE barcode=?'))return [[{id:values[0]==='K001'?11:12,uid:values[0]==='K001'?'linting-worker':'batil-worker',employeeNumber:String(values[0]),fullName:'Worker'}]]
      if(q.includes('employee_employment_histories'))return [[{siteId:3,site,employeeType:'BORONGAN',employmentStatus:'ACTIVE',allowsProduction:1,payrollBasis:'PIECE_RATE',isProduction:1,productionSectionId:3}]]
      if(q.includes('FROM attendance_records ar'))return [[{id:31,uid:'attendance',clockInAt:'2026-10-10T07:00:00+07:00',attendanceStatus:'PRESENT'}]]
      if(q.includes('FROM attendance_scan_events ase'))return [[{id:41}]]
      if(q.includes('SELECT a.id assignmentId')) {
        const peer=Number(values[0])===12 || Number(values[2])===12
        return [peer&&!partnerEligible?[]:[{assignmentId:1,isPrimary:1,isJobActive:1,jobId:peer?16:15,jobUid:peer?batilJob:lintingJob,jobCode:peer?'BORONGAN-BATIL':'BORONGAN-LINTING',jobName:peer?'Batil':'Linting',rateId:peer?26:25,rateUid:'rate',rateAmount:peer?'5.0000':'45.0000',currency:'IDR',unitId:17,unitUid:'unit',unitCode:'PCS',unitName:'PCS',decimalPrecision:0}]]
      }
      if(q.includes('SELECT r.id rateId'))return [[{rateId:25,rateUid:'rate',rateAmount:'45.0000',unitId:17,unitCode:'PCS',decimalPrecision:0}]]
      if(q.includes('SELECT job.id jobId'))return [[{jobId:16,rateId:26,unitId:17,unitCode:'PCS',decimalPrecision:0,rateAmount:'5.0000'}]]
      if(q.includes('SELECT employee_id,unit_id'))return [[{employee_id:11,unit_id:17}]]
      if(q.includes('FROM production_job_rate_tiers'))return [[{id:1,minQuantity:'1.0000',rateAmount:Number(values[0])===25?'45.0000':'5.0000'}]]
      if(q.includes('SELECT pt.*'))return [[records[values[0]===rootUid?21:22]]]
      if(q.includes('ORDER BY pt.transaction_at,pt.id FOR UPDATE'))return [[]]
      if(q.includes('SELECT pt.id,pt.uid'))return [[records[Number(values[0])]]]
      if(q.includes('MAX(revision_number)'))return [[{revisionNumber:1}]]
      return [[]]
    })
    mocks.execute.mockImplementation(async(sql:unknown,values:unknown[]=[])=>{
      const q=String(sql)
      if(q.includes('INSERT INTO production_transaction_pairs'))paired=true
      if(q.includes('INSERT INTO production_transactions')) {
        const baseId=values[2]===12?22:21
        const id=q.includes("'CORRECTION'")?baseId+10:baseId
        records[id]={...records[baseId],id,uid:values[0],transactionNumber:values[1],transaction_number:values[1],quantity:values[13],rateSnapshot:values[14],grossAmount:values[16],payableQuantity:values[15]}
        return [{insertId:id,affectedRows:1}]
      }
      if(q.includes("SET status='VOID'"))records[Number(values[3])].status='VOID'
      return [{affectedRows:1,insertId:61}]
    })
  })
  it('creates two rows and a relation on one commit, same raw quantity, separate rates and brand-only Batil QC',async()=>{
    const response=await request('/terminal/post',postBody())
    expect(response.status,await response.clone().text()).toBe(201)
    const inserts=mocks.execute.mock.calls.filter(([sql])=>String(sql).includes('INSERT INTO production_transactions'))
    expect(inserts).toHaveLength(2);expect(inserts.map(([,v])=>v[13])).toEqual(['500.0000','500.0000']);expect(inserts.map(([,v])=>v[14])).toEqual(['45.0000','5.0000'])
    expect(mocks.commit).toHaveBeenCalledOnce();expect(mocks.rollback).not.toHaveBeenCalled()
    expect(mocks.saveQc.mock.calls[1][2]).toMatchObject({brand:{code:'BR-1'},weight1Grams:null,weight2Grams:null,defects:[]})
    expect(await response.json()).toMatchObject({transaction:{pair:{role:'LINTING',partner:{uid:records[22].uid}}},pairedTransaction:{uid:records[22].uid}})
  })
  it.each(['non-klaten','same-worker','ineligible','peer-write-failure','pair-write-failure'])('rolls back both for %s',async variant=>{
    if(variant==='non-klaten')site='SEMARANG'
    if(variant==='ineligible')partnerEligible=false
    const original=mocks.execute.getMockImplementation()!
    if(variant.endsWith('write-failure'))mocks.execute.mockImplementation(async(q,v)=>{if((variant==='pair-write-failure'&&String(q).includes('INSERT INTO production_transaction_pairs')) || (variant==='peer-write-failure'&&String(q).includes('INSERT INTO production_transactions')&&v[2]===12))throw new Error('write failed');return original(q,v)})
    const response=await request('/terminal/post',postBody(variant==='same-worker'?'K001':'K002'))
    expect(response.status,await response.clone().text()).toBe(variant.endsWith('write-failure')?500:422);expect(mocks.rollback).toHaveBeenCalledOnce();expect(mocks.commit).not.toHaveBeenCalled()
  })
  it.each(['same','missing','different'])('replay validates partner identity: %s',async variant=>{
    existing=true;paired=true
    const body: Record<string,unknown>=postBody(variant==='different'?'K003':'K002')
    if(variant==='missing')body.batilBarcode=undefined
    const response=await request('/terminal/post',body)
    expect(response.status,await response.clone().text()).toBe(variant==='same'?200:409)
    expect(mocks.execute.mock.calls.filter(([sql])=>String(sql).includes('INSERT INTO'))).toHaveLength(0)
  })
  it('void cancels both members with two revisions on one commit',async()=>{
    paired=true;partnerEligible=false
    const response=await request(`/transactions/${rootUid}/void`,{reason:'Salah setoran pasangan',idempotencyKey:key})
    expect(response.status,await response.clone().text()).toBe(200);expect(records[21].status).toBe('VOID');expect(records[22].status).toBe('VOID')
    expect(mocks.execute.mock.calls.filter(([sql])=>String(sql).includes('INSERT INTO production_transaction_revisions'))).toHaveLength(2)
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.query.mock.calls.some(([sql])=>String(sql).includes('FROM attendance_records ar') || String(sql).includes('SELECT a.id assignmentId'))).toBe(false)
  })
  it('Payroll lock on partner blocks the complete pair before writes',async()=>{
    paired=true;records[22].payroll_locked_at='2026-10-10 10:00:00'
    const response=await request(`/transactions/${rootUid}/void`,{reason:'Salah setoran pasangan',idempotencyKey:key})
    expect(response.status,await response.clone().text()).toBe(409);expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.rollback).toHaveBeenCalledOnce()
  })
  it.each([rootUid,peerUid])('quantity correction from either member creates two replacements and an immutable new pair: %s',async uid=>{
    paired=true
    const response=await request(`/transactions/${uid}/correct`,{jobUid:uid===rootUid?lintingJob:batilJob,quantity:'600',reason:'Koreksi kuantitas pasangan',idempotencyKey:key})
    expect(response.status,await response.clone().text()).toBe(201)
    expect(records[21].status).toBe('VOID');expect(records[22].status).toBe('VOID')
    expect(records[31].quantity).toBe('600.0000');expect(records[32].quantity).toBe('600.0000')
    const relation=mocks.execute.mock.calls.find(([sql])=>String(sql).includes('INSERT INTO production_transaction_pairs'))!
    expect(relation[1].slice(1,3)).toEqual([31,32])
    expect(mocks.execute.mock.calls.some(([sql])=>String(sql).includes('UPDATE production_transaction_pairs'))).toBe(false)
    const afterUpdates=mocks.execute.mock.calls.filter(([sql])=>String(sql).includes('UPDATE production_transaction_revisions SET after_data'))
    expect(afterUpdates).toHaveLength(2)
    expect(afterUpdates.map(([,values])=>JSON.parse(values[0]).grossAmount).sort()).toEqual(['27000.00','3000.00'])
    expect(mocks.commit).toHaveBeenCalledOnce()
    const employeeLock=mocks.query.mock.calls.find(([sql])=>String(sql).includes('FROM employees WHERE id IN'))!
    const transactionLock=mocks.query.mock.calls.find(([sql])=>String(sql).includes('FROM production_transactions WHERE id IN'))!
    expect(employeeLock[0]).toContain('ORDER BY id FOR UPDATE');expect(employeeLock[1]).toEqual([11,12])
    expect(transactionLock[0]).toContain('ORDER BY id FOR UPDATE');expect(transactionLock[1]).toEqual([21,22])
  })
  it('paired job change is rejected before replacing either member',async()=>{
    paired=true
    const response=await request(`/transactions/${rootUid}/correct`,{jobUid:batilJob,quantity:'600',reason:'Ganti pekerjaan pasangan',idempotencyKey:key})
    expect(response.status,await response.clone().text()).toBe(422);expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.commit).not.toHaveBeenCalled()
  })
  it.each(['partner-attendance','partner-site','partner-rate-overlap','payroll-period'])('revalidates eligibility and day locks: %s',async variant=>{
    const original=mocks.query.getMockImplementation()!
    mocks.query.mockImplementation(async(sql,values=[])=>{
      const q=String(sql)
      if(variant==='partner-attendance'&&q.includes('FROM attendance_records ar')&&values[0]===12)return [[]]
      if(variant==='partner-site'&&q.includes('employee_employment_histories')&&values[0]===12)return [[{siteId:2,site:'SEMARANG',allowsProduction:1,payrollBasis:'PIECE_RATE'}]]
      if(variant==='partner-rate-overlap'&&q.includes('SELECT job.id jobId'))return [[{rateId:1},{rateId:2}]]
      if(variant==='payroll-period'&&q.includes('FROM payroll_periods pp'))return [[{id:1,status:'CLOSED'}]]
      return original(sql,values)
    })
    const response=await request('/terminal/post',postBody())
    expect(response.status,await response.clone().text()).toBe(variant==='payroll-period'?409:422)
    expect(mocks.rollback).toHaveBeenCalledOnce();expect(mocks.commit).not.toHaveBeenCalled()
  })
})
