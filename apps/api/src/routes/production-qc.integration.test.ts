import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import { productionQcRouter } from './production-qc.js'

const mocks = vi.hoisted(() => ({
  query:vi.fn(),execute:vi.fn(),beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn(),destroy:vi.fn(),audit:vi.fn(),
}))
vi.mock('../db.js', () => ({ pool:{ query:mocks.query,getConnection:async()=>mocks } }))
vi.mock('../lib/audit.js', () => ({ writeAudit:mocks.audit }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate:(_req:express.Request,_res:express.Response,next:express.NextFunction)=>next(),
  requirePermission:(permission:string)=>(_req:express.Request,res:express.Response,next:express.NextFunction)=>{
    if (!res.locals.auth.permissions.includes(permission)) return res.status(403).json({ message:'Izin ditolak.' })
    next()
  },
}))
const uid='11111111-1111-4111-8111-111111111111'
async function request(path:string,method='GET',body?:unknown,permissions=['production.view','production.manage_master']) {
  const app=express()
  app.use(express.json())
  app.use((_req,res,next)=>{ res.locals.auth={ id:7,roles:['PRODUCTION_ADMIN'],permissions,siteAccess:['JEPARA'] }; next() })
  app.use(productionQcRouter)
  app.use(errorHandler)
  const server=app.listen(0)
  await new Promise<void>(resolve=>server.once('listening',resolve))
  try {
    const response=await fetch('http://127.0.0.1:'+(server.address() as AddressInfo).port+path,{
      method,headers:{'content-type':'application/json'},body:body ? JSON.stringify(body):undefined,
    })
    return { status:response.status,body:response.status===204 ? null:await response.json() }
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())) }
}
function createQuery(sql: unknown) {
  if (String(sql).includes('GET_LOCK')) return [[{acquired:1}]]
  if (String(sql).includes('RELEASE_LOCK')) return [[{released:1}]]
  if (String(sql).includes('SELECT id FROM sites')) return [[{id:2}]]
  if (String(sql).includes('maximum FROM')) return [[{maximum:'0'}]]
  return [[]]
}
beforeEach(()=>{ vi.clearAllMocks(); mocks.query.mockReset().mockImplementation(createQuery); mocks.execute.mockReset().mockResolvedValue([{ insertId:1 }]); mocks.audit.mockResolvedValue(undefined) })
describe('QC master APIs',()=>{
  it('requires view and manage permissions',async()=>{
    expect((await request('/brands','GET',undefined,[])).status).toBe(403)
    expect((await request('/defects','POST',{name:'Cowong'},['production.view'])).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('rejects foreign site options/create before DB reads',async()=>{
    expect((await request('/qc-options?site=KLATEN')).status).toBe(403)
    expect((await request('/brands','POST',{site:'KLATEN',name:'X'})).status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it('lists brands with server site scope and pagination',async()=>{
    mocks.query.mockResolvedValueOnce([[{total:1}]]).mockResolvedValueOnce([[{uid,name:'X'}]])
    const response=await request('/brands')
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({total:1,page:1,pageSize:50})
    expect(mocks.query.mock.calls[0][0]).toContain('s.code IN (?)')
    expect(mocks.query.mock.calls[0][1]).toEqual(['JEPARA'])
    expect(mocks.query.mock.calls[1][0]).toContain('created_at DESC,m.id DESC')
  })
  it('returns only active options in configured order',async()=>{
    const response=await request('/qc-options?site=JEPARA')
    expect(response.body).toEqual({brands:[],defects:[]})
    expect(mocks.query.mock.calls[0][0]).toContain('b.is_active=1 ORDER BY b.sort_order,b.id')
    expect(mocks.query.mock.calls[1][0]).toContain('is_active=1 ORDER BY sort_order,id')
  })
  it('creates server code and atomic site audit',async()=>{
    const response=await request('/brands','POST',{site:'JEPARA',name:'Brand',sortOrder:3})
    expect(response.status).toBe(201)
    expect(response.body).toEqual(expect.objectContaining({code:'BR-0001'}))
    expect(mocks.execute.mock.calls[0][1]).toContain(2)
    expect(mocks.audit.mock.calls[0][0]).toMatchObject({siteId:2,action:'CREATE'})
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.query.mock.calls[0]).toEqual(['SELECT GET_LOCK(?, 10) acquired',['hris:production-qc-code:brands']])
    expect(mocks.query).toHaveBeenLastCalledWith('SELECT RELEASE_LOCK(?) released',['hris:production-qc-code:brands'])
    expect(mocks.destroy).not.toHaveBeenCalled()
  })
  it.each([['brands','41','BR-0042'],['defects','0','DF-0001'],['defects','9999','DF-10000']])('continues the global %s sequence from %s',async(kind,maximum,code)=>{
    mocks.query.mockImplementation(sql=>String(sql).includes('maximum FROM') ? [[{maximum}]] : createQuery(sql))
    const response=await request('/'+kind,'POST',{...(kind==='brands' ? {site:'JEPARA'} : {}),name:'Master baru'})
    expect(response.status).toBe(201)
    expect(response.body).toMatchObject({code})
    const sequenceQuery=mocks.query.mock.calls.find(([sql])=>String(sql).includes('maximum FROM'))
    expect(sequenceQuery?.[0]).toContain(kind==='brands' ? 'production_brands' : 'production_defects')
    expect(sequenceQuery?.[0]).not.toContain('is_active')
    expect(sequenceQuery?.[1]).toEqual(['^'+(kind==='brands' ? 'BR-' : 'DF-')+'[0-9]{4,20}$'])
  })
  it('does not create a master when the sequence lock is busy',async()=>{
    mocks.query.mockResolvedValueOnce([[{acquired:0}]])
    expect((await request('/defects','POST',{name:'Cowong'})).status).toBe(409)
    expect(mocks.beginTransaction).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.release).toHaveBeenCalledOnce()
    expect(mocks.query).not.toHaveBeenCalledWith('SELECT RELEASE_LOCK(?) released',expect.anything())
  })
  it('destroys the connection when the code lock cannot be released',async()=>{
    mocks.query.mockImplementation(sql=>String(sql).includes('RELEASE_LOCK') ? [[{released:0}]] : createQuery(sql))
    expect((await request('/defects','POST',{name:'Cowong'})).status).toBe(201)
    expect(mocks.destroy).toHaveBeenCalledOnce()
    expect(mocks.release).not.toHaveBeenCalled()
  })
  it('global defect update changes no snapshots or code',async()=>{
    mocks.query.mockResolvedValueOnce([[{id:3,uid,code:'DF-X',name:'Old',isActive:1,sortOrder:0}]])
    expect((await request('/defects/'+uid,'PATCH',{name:'New',isActive:false,sortOrder:4})).status).toBe(204)
    expect(mocks.execute.mock.calls[0][0]).toBe('UPDATE production_defects SET name=?,is_active=?,sort_order=?,updated_by=? WHERE id=?')
    expect(mocks.execute.mock.calls[0][1]).toEqual(['New',0,4,7,3])
    expect(mocks.audit.mock.calls[0][0]).toMatchObject({siteId:null})
  })
  it('hides foreign brand when requested by UID',async()=>{
    mocks.query.mockResolvedValueOnce([[{id:3,site:'KLATEN'}]])
    expect((await request('/brands/'+uid,'PATCH',{name:'New'})).status).toBe(404)
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })
  it('partial rename preserves inactive state and order',async()=>{
    mocks.query.mockResolvedValueOnce([[{id:3,uid,code:'DF-X',name:'Old',isActive:0,sortOrder:8}]])
    expect((await request('/defects/'+uid,'PATCH',{name:'New'})).status).toBe(204)
    expect(mocks.execute.mock.calls[0][1]).toEqual(['New',0,8,7,3])
  })
  it('partial toggle preserves name and order',async()=>{
    mocks.query.mockResolvedValueOnce([[{id:3,uid,code:'DF-X',name:'Old',isActive:0,sortOrder:8}]])
    expect((await request('/defects/'+uid,'PATCH',{isActive:true})).status).toBe(204)
    expect(mocks.execute.mock.calls[0][1]).toEqual(['Old',1,8,7,3])
  })
  it('rolls back duplicate DB constraint including concurrent creates',async()=>{
    mocks.execute.mockRejectedValueOnce({code:'ER_DUP_ENTRY'})
    expect((await request('/defects','POST',{name:'Cowong'})).status).toBe(409)
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.audit).not.toHaveBeenCalled()
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.query).toHaveBeenLastCalledWith('SELECT RELEASE_LOCK(?) released',['hris:production-qc-code:defects'])
  })
  it('rejects malformed order and update code/site',async()=>{
    expect((await request('/defects','POST',{name:'X',sortOrder:-1})).status).toBe(422)
    expect((await request('/brands/'+uid,'PATCH',{name:'X',site:'JEPARA'})).status).toBe(422)
    expect(mocks.query).not.toHaveBeenCalled()
  })
})
