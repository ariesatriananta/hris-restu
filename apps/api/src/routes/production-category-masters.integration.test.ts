import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, errorHandler } from '../lib/errors.js'
import { productionStructureRouter } from './production-structure.js'

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), audit: vi.fn(), category: vi.fn() }))
vi.mock('../db.js', () => ({ pool: { query: mocks.query, getConnection: async () => mocks } }))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))
vi.mock('../lib/production-category.js', async importOriginal => ({ ...await importOriginal<typeof import('../lib/production-category.js')>(), setProductionCategory: mocks.category }))
vi.mock('../middleware/authenticate.js', () => ({ authenticate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(), requirePermission: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next() }))
const uid = '11111111-1111-4111-8111-111111111111'
const input = { site: 'JEPARA', code: 'A', name: 'Modul A', productionCategory: 'REGULER', categoryEffectiveFrom: '2026-11-01' }
async function request(method: string, body?: unknown, path = '/modules') {
  const app = express(); app.use(express.json())
  app.use((_req,res,next) => { res.locals.auth = { id: 7, roles: ['HR_OFFICER'], permissions: ['employees.manage','employees.view'], siteAccess: ['JEPARA'] }; next() })
  app.use(productionStructureRouter); app.use(errorHandler)
  const server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve))
  try { const response = await fetch('http://127.0.0.1:'+(server.address() as AddressInfo).port+path,{method,headers:{'content-type':'application/json'},body:body?JSON.stringify(body):undefined}); return { status: response.status, body: response.status===204?null:await response.json() } }
  finally { await new Promise<void>(resolve => server.close(()=>resolve())) }
}
beforeEach(()=>{ vi.clearAllMocks(); mocks.query.mockReset().mockResolvedValue([[{id:5,site:'JEPARA',productionCategory:'REGULER',categoryEffectiveFrom:'2026-11-01'}]]); mocks.execute.mockResolvedValue([{insertId:9}]); mocks.category.mockReset().mockResolvedValue({category:'REGULER',changed:true,effectiveFrom:'2026-11-01'}) })
describe('module category master integration',()=>{
  it('creates module and effective category in one transaction',async()=>{
    expect((await request('POST',input)).status).toBe(201)
    expect(mocks.category).toHaveBeenCalledWith(mocks,{kind:'MODULE',entityId:9,category:'REGULER',effectiveFrom:'2026-11-01',actorId:7})
    expect(mocks.execute.mock.calls[0][0]).toContain('production_category) VALUES(?,?,?,?,?,?,?,?,NULL)')
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({afterData:input}),mocks)
    expect(mocks.commit).toHaveBeenCalledOnce()
  })
  it('locks existing module before updating category and audits change',async()=>{
    expect((await request('PATCH',{...input,productionCategory:'PREMIUM'},'/modules/'+uid)).status).toBe(204)
    expect(mocks.query.mock.calls[0][0]).toContain('FOR UPDATE')
    expect(mocks.category).toHaveBeenCalledWith(mocks,expect.objectContaining({kind:'MODULE',entityId:5,category:'PREMIUM'}))
    expect(mocks.audit.mock.calls[0][0]).toMatchObject({beforeData:{productionCategory:'REGULER',categoryEffectiveFrom:'2026-11-01'},afterData:{productionCategory:'PREMIUM'}})
  })
  it('rolls back entire edit when category rules reject the change',async()=>{
    mocks.category.mockRejectedValueOnce(new ApiError(409,'Histori kategori tidak konsisten. Periksa pemetaan master.'))
    expect((await request('PATCH',input,'/modules/'+uid)).status).toBe(409)
    expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled()
  })
  it('preserves compatibility when old callers omit category fields',async()=>{
    expect((await request('POST',{site:'JEPARA',code:'A',name:'Modul A'})).status).toBe(201)
    expect(mocks.category).toHaveBeenCalledWith(mocks,{kind:'MODULE',entityId:9,category:'REGULER',effectiveFrom:undefined,actorId:7})
  })
  it('rejects orphan dates and cross-site edits',async()=>{
    expect((await request('POST',{site:'JEPARA',code:'A',name:'A',categoryEffectiveFrom:'2026-11-01'})).status).toBe(422)
    mocks.query.mockResolvedValueOnce([[{id:5,site:'KLATEN'}]])
    expect((await request('PATCH',input,'/modules/'+uid)).status).toBe(403)
    expect(mocks.category).not.toHaveBeenCalled()
  })
  it('returns current mapping and effective start for editor',async()=>{
    mocks.query.mockResolvedValueOnce([[{total:1}]]).mockResolvedValueOnce([[{uid,isActive:1,productionCategory:'REGULER',categoryEffectiveFrom:'2026-11-01'}]])
    const response=await request('GET')
    expect(response.body).toMatchObject({items:[{isActive:true,productionCategory:'REGULER',categoryEffectiveFrom:'2026-11-01'}]})
    expect(mocks.query.mock.calls[1][0]).toContain('production_module_category_histories')
  })
  it('supports editing the boolean status DTO returned by listing',async()=>{
    mocks.query.mockResolvedValueOnce([[{total:1}]]).mockResolvedValueOnce([[{uid,isActive:1,site:'JEPARA',code:'A',name:'Modul A'}]])
    const response=await request('GET')
    const items=(response.body as {items:Record<string,unknown>[]}).items
    const {uid: returnedUid,...dto}=items[0]
    expect(dto.isActive).toBe(true)
    expect((await request('PATCH',dto,'/modules/'+String(returnedUid))).status).toBe(204)
    expect(mocks.category).not.toHaveBeenCalled()
  })
  it('gives an actionable field message for invalid module status',async()=>{
    const response=await request('PATCH',{site:'JEPARA',code:'A',name:'A',isActive:1},'/modules/'+uid)
    expect(response.status).toBe(422)
    expect(response.body).toMatchObject({message:'Status aktif: harus berupa pilihan aktif/nonaktif.'})
    expect(mocks.execute).not.toHaveBeenCalled()
  })
  it('explains why a module with category history cannot be deleted',async()=>{
    mocks.query.mockResolvedValueOnce([[{id:5,site:'JEPARA',siteId:2,name:'Modul A'}]])
      .mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{id:12}]])
    const response=await request('DELETE',undefined,'/modules/'+uid)
    expect(response.status).toBe(409)
    expect(response.body).toMatchObject({message:expect.stringContaining('histori kategori produksi')})
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })
})
