import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { payrollConfigurationRouter } from './payroll-configuration.js'

const mocks=vi.hoisted(()=>({query:vi.fn(),execute:vi.fn(),begin:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),audit:vi.fn()}))
const conn={query:mocks.query,execute:mocks.execute,beginTransaction:mocks.begin,commit:mocks.commit,rollback:mocks.rollback,release:mocks.release}
vi.mock('../db.js',()=>({pool:{query:mocks.query,execute:mocks.execute,getConnection:vi.fn(async()=>conn)}}))
vi.mock('../lib/audit.js',()=>({writeAudit:mocks.audit}))
vi.mock('../middleware/authenticate.js',()=>(
  {authenticate:(_req:express.Request,_res:express.Response,next:express.NextFunction)=>next(),requirePermission:(permission:string)=>(_req:express.Request,res:express.Response,next:express.NextFunction)=>{const auth=res.locals.auth as AuthContext;if(!auth.roles.includes('SUPER_ADMIN')&&!auth.permissions.includes(permission))return res.status(403).json({message:'Izin ditolak.'});next()}}
))

const finance:AuthContext={id:7,uid:'finance',name:'Finance',email:null,roles:['PAYROLL_FINANCE'],permissions:['payroll.view','payroll.policy.view','payroll.rate.manage'],siteAccess:['JEPARA']}
const superAdmin:AuthContext={...finance,id:1,roles:['SUPER_ADMIN'],permissions:[],siteAccess:[]}
async function request(path:string,input:{method?:string;body?:unknown;auth?:AuthContext}={}){const app=express();app.use(express.json());app.use((_req,res,next)=>{res.locals.auth=input.auth??finance;next()});app.use('/api/payroll',payrollConfigurationRouter);app.use(errorHandler);const server=app.listen(0);await new Promise<void>(resolve=>server.once('listening',resolve));try{const port=(server.address() as AddressInfo).port;return await fetch(`http://127.0.0.1:${port}/api/payroll${path}`,{method:input.method??'GET',headers:{'content-type':'application/json'},body:input.body?JSON.stringify(input.body):undefined})}finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}}

describe('Payroll M5A1 configuration API',()=>{
  beforeEach(()=>{vi.clearAllMocks();mocks.begin.mockResolvedValue(undefined);mocks.commit.mockResolvedValue(undefined);mocks.rollback.mockResolvedValue(undefined);mocks.query.mockResolvedValue([[]])})

  it('menolak Finance membuat policy meskipun dapat melihatnya',async()=>{
    const response=await request('/configuration/policies',{method:'POST',body:{siteUid:'11111111-1111-4111-8111-111111111111',employeeType:'TRAINING',wageBasis:'TIME_BASED',payFrequency:'WEEKLY',cutoffType:'WEEK_END',reason:'Policy baru',idempotencyKey:'policy-training-current'}})
    expect(response.status).toBe(403);expect(mocks.begin).not.toHaveBeenCalled()
  })

  it('menolak matriks upah Training berbasis hasil sebelum query database',async()=>{
    const response=await request('/configuration/policies',{method:'POST',auth:superAdmin,body:{siteUid:'11111111-1111-4111-8111-111111111111',employeeType:'TRAINING',wageBasis:'PIECE_RATE',payFrequency:'WEEKLY',cutoffType:'WEEK_END',reason:'Policy salah',idempotencyKey:'policy-training-invalid'}})
    expect(response.status).toBe(422);expect(mocks.rollback).toHaveBeenCalled()
  })

  it('memaksa scope site Finance pada metadata employee picker',async()=>{
    mocks.query.mockResolvedValueOnce([[{uid:'site-uid',code:'JEPARA',name:'Jepara'}]]).mockResolvedValueOnce([[]])
    const response=await request('/configuration/meta');expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0][0])).toContain('s.code IN (?)')
    expect(mocks.query.mock.calls[0][1]).toEqual(['JEPARA'])
    expect(mocks.query.mock.calls[1][1]).toEqual(['JEPARA'])
  })

  it('memaksa scope site Finance pada daftar UMK',async()=>{
    mocks.query
      .mockResolvedValueOnce([[{total:1}]])
      .mockResolvedValueOnce([[{
        id:1,uid:'11111111-1111-4111-8111-111111111111',siteId:2,
        siteUid:'22222222-2222-4222-8222-222222222222',siteCode:'JEPARA',siteName:'Jepara',
        wageYear:2026,amount:'2450000.00',currency:'IDR',regulationReference:null,
        notes:null,status:'ACTIVE',cancellationReason:null,cancelledAt:null,
        createdAt:'2026-09-14T08:00:00.000Z',updatedAt:'2026-09-14T08:00:00.000Z'
      }]])
    const response=await request('/configuration/minimum-wages?year=2026')
    expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0][0])).toContain('s.code IN (?)')
    expect(mocks.query.mock.calls[0][1]).toEqual(['JEPARA',2026])
    const body=await response.json() as {data:Array<{amount:string}>}
    expect(body.data[0].amount).toBe('2450000.00')
  })

  it('memaginasi dan mengurutkan daftar policy dari server',async()=>{
    mocks.query
      .mockResolvedValueOnce([[{total:51}]])
      .mockResolvedValueOnce([[]])
    const response=await request('/configuration/policies?page=2&pageSize=50&sortBy=site&sortDirection=asc&query=jepara')
    expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0][0])).toContain('COUNT(*) total')
    expect(mocks.query.mock.calls[0][1]).toEqual(['JEPARA','%jepara%','%jepara%','%jepara%'])
    expect(String(mocks.query.mock.calls[1][0])).toContain('ORDER BY s.name ASC')
    expect(mocks.query.mock.calls[1][1]).toEqual(['JEPARA','%jepara%','%jepara%','%jepara%',50,50])
    const body=await response.json() as {meta:{page:number;total:number;totalPages:number}}
    expect(body.meta).toEqual({page:2,pageSize:50,total:51,totalPages:2})
  })

  it('memaginasi daftar tarif harian beserta pencarian dan sorting',async()=>{
    mocks.query
      .mockResolvedValueOnce([[{total:4}]])
      .mockResolvedValueOnce([[]])
    const response=await request('/configuration/daily-rates?pageSize=100&sortBy=amount&sortDirection=desc&query=siti')
    expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0][0])).toContain('employee_daily_rate_histories')
    expect(String(mocks.query.mock.calls[1][0])).toContain('ORDER BY r.daily_rate DESC')
    expect(mocks.query.mock.calls[1][1]).toEqual(['JEPARA','%siti%','%siti%','%siti%','%siti%',100,0])
    const body=await response.json() as {meta:{page:number;pageSize:number;total:number;totalPages:number}}
    expect(body.meta).toEqual({page:1,pageSize:100,total:4,totalPages:1})
  })

  it('menolak Finance membaca UMK site di luar aksesnya',async()=>{
    const response=await request('/configuration/minimum-wages?site=KLATEN')
    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('membuat UMK dengan revision dan audit trail',async()=>{
    const row={
      id:9,uid:'33333333-3333-4333-8333-333333333333',siteId:2,
      siteUid:'22222222-2222-4222-8222-222222222222',siteCode:'JEPARA',siteName:'Jepara',
      wageYear:2026,amount:'2450000.00',currency:'IDR',regulationReference:'SK Gubernur 2026',
      notes:null,status:'ACTIVE',cancellationReason:null,cancelledAt:null,
      createdAt:'2026-09-14T08:00:00.000Z',updatedAt:'2026-09-14T08:00:00.000Z'
    }
    mocks.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{id:2,uid:row.siteUid,code:'JEPARA',name:'Jepara'}]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[row]])
    mocks.execute
      .mockResolvedValueOnce([{insertId:9,affectedRows:1}])
      .mockResolvedValueOnce([{affectedRows:1}])
    const response=await request('/configuration/minimum-wages',{method:'POST',body:{
      siteUid:row.siteUid,wageYear:2026,amount:'2450000',currency:'IDR',
      regulationReference:'SK Gubernur 2026',reason:'Penetapan UMK tahun 2026',
      idempotencyKey:'umk-jepara-2026-create'
    }})
    expect(response.status).toBe(201)
    expect(String(mocks.execute.mock.calls[1][0])).toContain('site_minimum_wage_revisions')
    expect(mocks.audit).toHaveBeenCalledOnce()
    expect(mocks.commit).toHaveBeenCalledOnce()
  })
})
