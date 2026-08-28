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
    const response=await request('/configuration/policies',{method:'POST',body:{siteUid:'11111111-1111-4111-8111-111111111111',employeeType:'TRAINING',wageBasis:'TIME_BASED',payFrequency:'WEEKLY',cutoffType:'WEEK_END',effectiveFrom:'2026-09-01',reason:'Policy baru',idempotencyKey:'policy-training-20260901'}})
    expect(response.status).toBe(403);expect(mocks.begin).not.toHaveBeenCalled()
  })

  it('menolak matriks upah Training berbasis hasil sebelum query database',async()=>{
    const response=await request('/configuration/policies',{method:'POST',auth:superAdmin,body:{siteUid:'11111111-1111-4111-8111-111111111111',employeeType:'TRAINING',wageBasis:'PIECE_RATE',payFrequency:'WEEKLY',cutoffType:'WEEK_END',effectiveFrom:'2026-09-01',reason:'Policy salah',idempotencyKey:'policy-training-invalid'}})
    expect(response.status).toBe(422);expect(mocks.rollback).toHaveBeenCalled()
  })

  it('memaksa scope site Finance pada metadata employee picker',async()=>{
    mocks.query.mockResolvedValueOnce([[{uid:'site-uid',code:'JEPARA',name:'Jepara'}]]).mockResolvedValueOnce([[]])
    const response=await request('/configuration/meta');expect(response.status).toBe(200)
    expect(String(mocks.query.mock.calls[0][0])).toContain('s.code IN (?)')
    expect(mocks.query.mock.calls[0][1]).toEqual(['JEPARA'])
    expect(mocks.query.mock.calls[1][1]).toEqual(['JEPARA'])
  })
})
