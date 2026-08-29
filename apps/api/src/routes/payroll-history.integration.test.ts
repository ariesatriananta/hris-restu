import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { payrollHistoryRouter } from './payroll-history.js'

const mocks=vi.hoisted(()=>({query:vi.fn(),execute:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),audit:vi.fn()}))
const conn={query:mocks.query,execute:mocks.execute,beginTransaction:mocks.begin,commit:mocks.commit,rollback:mocks.rollback,release:mocks.release}
vi.mock('../db.js',()=>({pool:{query:mocks.query,execute:mocks.execute,getConnection:vi.fn(async()=>conn)}}))
vi.mock('../config.js',()=>({env:{R2_PUBLIC_BASE_URL:'https://files.example.test'}}))
vi.mock('../lib/audit.js',()=>({writeAudit:mocks.audit}))
vi.mock('../middleware/authenticate.js',()=>({
  authenticate:(_req:express.Request,_res:express.Response,next:express.NextFunction)=>next(),
  requirePermission:(permission:string)=>(_req:express.Request,res:express.Response,next:express.NextFunction)=>{
    const auth=res.locals.auth as AuthContext
    if(!auth.roles.includes('SUPER_ADMIN')&&!auth.permissions.includes(permission)) return res.status(403).json({message:'Izin ditolak.'})
    next()
  },
}))

const finance:AuthContext={id:7,uid:'finance',name:'Finance',email:null,roles:['PAYROLL_FINANCE'],permissions:['payroll.view'],siteAccess:['JEPARA']}
const run={id:9,uid:'22222222-2222-4222-8222-222222222222',runId:9,periodId:3,periodUid:'11111111-1111-4111-8111-111111111111',periodCode:'PAY-JPR-1',periodName:'Payroll Jepara',
  periodStart:'2026-08-01',periodEnd:'2026-08-07',paymentDate:null,periodStatus:'CALCULATED',currentRunId:9,siteId:1,siteCode:'JEPARA',siteName:'Site Jepara',
  payrollBasis:'PIECE_RATE',payFrequency:'WEEKLY',employeeTypeCode:'BORONGAN',
  runUid:'22222222-2222-4222-8222-222222222222',runNumber:1,runType:'SIMULATION',runStatus:'COMPLETED',runEmployeeCount:1,
  runPieceRate:'100.00',runEarnings:'0.00',runDeductions:'0.00',runNetPay:'100.00',runStartedAt:'2026-08-08T08:00:00.000+07:00',runFinishedAt:'2026-08-08T08:01:00.000+07:00',runIsCurrent:1}

async function request(path:string,input:{method?:string;body?:unknown;auth?:AuthContext}={}){
  const app=express();app.use(express.json());app.use((_req,res,next)=>{res.locals.auth=input.auth??finance;next()});app.use('/api/payroll',payrollHistoryRouter);app.use(errorHandler)
  const server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve))
  try{const port=(server.address() as AddressInfo).port;return await fetch(`http://127.0.0.1:${port}/api/payroll${path}`,{method:input.method??'GET',headers:{'content-type':'application/json'},body:input.body?JSON.stringify(input.body):undefined})}
  finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
}

describe('Payroll M4 history API',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.begin.mockResolvedValue(undefined);mocks.commit.mockResolvedValue(undefined);mocks.rollback.mockResolvedValue(undefined);mocks.execute.mockResolvedValue([{affectedRows:1,insertId:1}])})

  it('menolak filter site di luar akses Finance',async()=>{
    const response=await request('/history?siteCode=SEMARANG')
    expect(response.status).toBe(403);expect(mocks.query).not.toHaveBeenCalled()
  })

  it('menolak perbandingan run sama dan run yang belum selesai',async()=>{
    const same=await request(`/periods/${run.periodUid}/compare?baseRunUid=${run.runUid}&targetRunUid=${run.runUid}`)
    expect(same.status).toBe(422)
    mocks.query.mockResolvedValueOnce([[run,{...run,uid:'33333333-3333-4333-8333-333333333333',runUid:'33333333-3333-4333-8333-333333333333',runStatus:'FAILED'}]])
    const failed=await request(`/periods/${run.periodUid}/compare?baseRunUid=${run.runUid}&targetRunUid=33333333-3333-4333-8333-333333333333`)
    expect(failed.status).toBe(409)
  })

  it('membatasi payment export berdasarkan permission dan FINAL CLOSED',async()=>{
    const denied=await request(`/runs/${run.runUid}/export`,{method:'POST',body:{type:'PAYMENT',idempotencyKey:'44444444-4444-4444-8444-444444444444'}})
    expect(denied.status).toBe(403)
    mocks.query.mockResolvedValueOnce([[run]])
    const allowedAuth={...finance,permissions:['payroll.view','payroll.payment_export']}
    const notFinal=await request(`/runs/${run.runUid}/export`,{method:'POST',auth:allowedAuth,body:{type:'PAYMENT',idempotencyKey:'44444444-4444-4444-8444-444444444444'}})
    expect(notFinal.status).toBe(409)
  })

  it('preview slip hanya mengirim empat digit rekening dan issue perlu izin print',async()=>{
    mocks.query.mockImplementation(async(sql:unknown)=>{
      const statement=String(sql)
      if(statement.includes('FROM payroll_runs pr JOIN payroll_periods')) return [[run]]
      if(statement.includes('SELECT result.* FROM payroll_employee_results')) return [[{id:5,uid:'55555555-5555-4555-8555-555555555555',employee_number_snapshot:'PKDS-1',employee_name_snapshot:'AAN',employee_type_snapshot:'BORONGAN',department_name_snapshot:'Produksi',position_name_snapshot:'Operator',bank_name_snapshot:'BCA',bank_account_number_snapshot:'1234567890',piece_rate_amount:'100.00',additional_earnings:'0.00',gross_earnings:'100.00',total_deductions:'0.00',net_pay:'100.00'}]]
      if(statement.includes('payroll_employee_component_details')||statement.includes('payroll_production_details')||statement.includes('payroll_attendance_summaries')||statement.includes('payroll_period_company_snapshots')) return [[]]
      if(statement.includes("setting_key='company.profile'")) return [[{settingValue:JSON.stringify({companyName:'PT RSIA',legalAddress:'Jepara'})}]]
      return [[]]
    })
    const preview=await request(`/runs/${run.runUid}/payslips`);expect(preview.status).toBe(200)
    const body=await preview.json() as {data:{employees:Array<{bank:{accountLast4:string;accountNumber?:string}}>}}
    expect(body.data.employees[0].bank).toEqual({bankName:'BCA',accountLast4:'7890'})
    const issue=await request(`/runs/${run.runUid}/payslips/issue`,{method:'POST',body:{idempotencyKey:'66666666-6666-4666-8666-666666666666'}})
    expect(issue.status).toBe(403);expect(mocks.audit).not.toHaveBeenCalled()
  })

  it('menolak export dan slip TIME_BASED sampai output M5D tersedia',async()=>{
    const timeRun={...run,payrollBasis:'TIME_BASED',employeeTypeCode:'HARIAN'}
    mocks.query.mockResolvedValue([[timeRun]])
    const exportResponse=await request(`/runs/${run.runUid}/export`,{
      method:'POST',auth:{...finance,permissions:['payroll.view','payroll.export']},
      body:{type:'SUMMARY',idempotencyKey:'74444444-4444-4444-8444-444444444444'},
    })
    expect(exportResponse.status).toBe(409)
    const slipResponse=await request(`/runs/${run.runUid}/payslips`)
    expect(slipResponse.status).toBe(409)
    expect(mocks.audit).not.toHaveBeenCalled()
  })
})
