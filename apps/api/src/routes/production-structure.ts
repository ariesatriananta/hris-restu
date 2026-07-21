import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const optional = z.string().trim().max(255).optional().nullable().transform((value) => value ?? undefined)
const active = z.boolean().optional()
const moduleInput = z.object({ site: siteCode, code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(100), description: optional, isActive: active }).strict()
const sectionInput = z.object({ code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(100), description: optional, isActive: active }).strict()
const mappingInput = z.object({ moduleUid: z.string().uuid(), sectionUid: z.string().uuid(), isActive: active }).strict()
const routeParam = (value: string | string[]) => Array.isArray(value) ? value[0] : value

function scopeWhere(auth: AuthContext, column = 's.code') {
  return auth.roles.includes('SUPER_ADMIN')
    ? { sql: '1=1', params: [] as string[] }
    : { sql: `${column} IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`, params: auth.siteAccess }
}
function enforceSite(auth: AuthContext, site: string) {
  if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}
function pageParams(raw: unknown, rawPageSize: unknown) {
  return { page: Math.max(1, Number(raw ?? 1)), pageSize: Math.min(500, Math.max(1, Number(rawPageSize ?? 100))) }
}
function activeFilter(raw: unknown) {
  const values = String(raw ?? '')
    .split(',')
    .filter((value) => value === 'true' || value === 'false')
  return values.length === 1 ? (values[0] === 'true' ? 1 : 0) : undefined
}

export const productionStructureRouter = Router()
productionStructureRouter.use(authenticate)

productionStructureRouter.get('/modules', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
    const where = ['1=1']; const values: unknown[] = []
    const query = String(req.query.query ?? '').trim()
    if (query) { where.push('(m.code LIKE ? OR m.name LIKE ?)'); values.push(`%${query}%`, `%${query}%`) }
    if (req.query.site) { where.push('s.code=?'); values.push(String(req.query.site)) }
    const isActive = activeFilter(req.query.isActive)
    if (isActive !== undefined) { where.push('m.is_active=?'); values.push(isActive) }
    const scope = scopeWhere(res.locals.auth as AuthContext); where.push(scope.sql); values.push(...scope.params)
    const clause = where.join(' AND ')
    const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total FROM production_modules m JOIN sites s ON s.id=m.site_id WHERE ${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT m.uid,m.code,m.name,m.description,m.is_active isActive,s.code site FROM production_modules m JOIN sites s ON s.id=m.site_id WHERE ${clause} ORDER BY m.created_at DESC,m.id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize])
    res.json({ items: rows, total: Number(count[0].total), page, pageSize })
  } catch (error) { next(error) }
})

productionStructureRouter.post('/modules', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = moduleInput.parse(req.body); const auth = res.locals.auth as AuthContext; enforceSite(auth, input.site)
    const [sites] = await pool.query<RowDataPacket[]>('SELECT id FROM sites WHERE code=? AND is_active=1', [input.site])
    if (!sites[0]) throw new ApiError(422, 'Site tidak valid atau tidak aktif.')
    const uid = randomUUID()
    await pool.execute('INSERT INTO production_modules(uid,site_id,code,name,description,is_active,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?)', [uid, sites[0].id, input.code.toUpperCase(), input.name, input.description ?? null, input.isActive === false ? 0 : 1, auth.id, auth.id])
    await writeAudit({ auth, request: req, action: 'CREATE', table: 'production_modules', recordUid: uid, description: `Menambah modul produksi ${input.name}.` })
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})

productionStructureRouter.patch('/modules/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = moduleInput.parse(req.body); const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid)
    const [rows] = await pool.query<RowDataPacket[]>('SELECT m.id,s.code site FROM production_modules m JOIN sites s ON s.id=m.site_id WHERE m.uid=?', [uid])
    if (!rows[0]) throw new ApiError(404, 'Modul tidak ditemukan.')
    enforceSite(auth, rows[0].site); if (rows[0].site !== input.site) throw new ApiError(422, 'Site Modul tidak dapat diubah.')
    await pool.execute('UPDATE production_modules SET code=?,name=?,description=?,is_active=?,updated_by=? WHERE id=?', [input.code.toUpperCase(), input.name, input.description ?? null, input.isActive === false ? 0 : 1, auth.id, rows[0].id])
    await writeAudit({ auth, request: req, action: 'UPDATE', table: 'production_modules', recordUid: uid, description: `Memperbarui modul produksi ${input.name}.` })
    res.status(204).end()
  } catch (error) { next(error) }
})

productionStructureRouter.get('/sections', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const { page, pageSize } = pageParams(req.query.page, req.query.pageSize); const where = ['1=1']; const values: unknown[] = []
    const query = String(req.query.query ?? '').trim(); if (query) { where.push('(code LIKE ? OR name LIKE ?)'); values.push(`%${query}%`, `%${query}%`) }
    const isActive = activeFilter(req.query.isActive); if (isActive !== undefined) { where.push('is_active=?'); values.push(isActive) }
    const clause = where.join(' AND '); const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total FROM production_sections WHERE ${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT uid,code,name,description,is_active isActive FROM production_sections WHERE ${clause} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize])
    res.json({ items: rows, total: Number(count[0].total), page, pageSize })
  } catch (error) { next(error) }
})

productionStructureRouter.post('/sections', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = sectionInput.parse(req.body); const auth = res.locals.auth as AuthContext; const uid = randomUUID()
    await pool.execute('INSERT INTO production_sections(uid,code,name,description,is_active,created_by,updated_by) VALUES(?,?,?,?,?,?,?)', [uid,input.code.toUpperCase(),input.name,input.description ?? null,input.isActive === false ? 0 : 1,auth.id,auth.id])
    await writeAudit({ auth, request: req, action: 'CREATE', table: 'production_sections', recordUid: uid, description: `Menambah Bagian produksi ${input.name}.` }); res.status(201).json({ uid })
  } catch (error) { next(error) }
})

productionStructureRouter.patch('/sections/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = sectionInput.parse(req.body); const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid)
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM production_sections WHERE uid=?', [uid]); if (!rows[0]) throw new ApiError(404, 'Bagian tidak ditemukan.')
    await pool.execute('UPDATE production_sections SET code=?,name=?,description=?,is_active=?,updated_by=? WHERE id=?', [input.code.toUpperCase(),input.name,input.description ?? null,input.isActive === false ? 0 : 1,auth.id,rows[0].id])
    await writeAudit({ auth, request: req, action: 'UPDATE', table: 'production_sections', recordUid: uid, description: `Memperbarui Bagian produksi ${input.name}.` }); res.status(204).end()
  } catch (error) { next(error) }
})

productionStructureRouter.get('/module-sections', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const { page, pageSize } = pageParams(req.query.page, req.query.pageSize); const where = ['1=1']; const values: unknown[] = []
    const query = String(req.query.query ?? '').trim(); if (query) { where.push('(m.code LIKE ? OR m.name LIKE ? OR ps.code LIKE ? OR ps.name LIKE ?)'); values.push(`%${query}%`,`%${query}%`,`%${query}%`,`%${query}%`) }
    if (req.query.site) { where.push('s.code=?'); values.push(String(req.query.site)) }
    const isActive = activeFilter(req.query.isActive); if (isActive !== undefined) { where.push('pms.is_active=?'); values.push(isActive) }
    const scope = scopeWhere(res.locals.auth as AuthContext); where.push(scope.sql); values.push(...scope.params); const clause = where.join(' AND ')
    const from = 'FROM production_module_sections pms JOIN production_modules m ON m.id=pms.production_module_id JOIN production_sections ps ON ps.id=pms.production_section_id JOIN sites s ON s.id=m.site_id'
    const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total ${from} WHERE ${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT pms.uid,pms.is_active isActive,m.uid moduleUid,m.code moduleCode,m.name moduleName,ps.uid sectionUid,ps.code sectionCode,ps.name sectionName,s.code site ${from} WHERE ${clause} ORDER BY pms.created_at DESC,pms.id DESC LIMIT ? OFFSET ?`, [...values,pageSize,(page-1)*pageSize])
    res.json({ items: rows, total: Number(count[0].total), page, pageSize })
  } catch (error) { next(error) }
})

productionStructureRouter.post('/module-sections', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = mappingInput.parse(req.body); const auth = res.locals.auth as AuthContext
    const [modules] = await pool.query<RowDataPacket[]>('SELECT m.id,s.id siteId,s.code site FROM production_modules m JOIN sites s ON s.id=m.site_id WHERE m.uid=?', [input.moduleUid]); const module = modules[0]
    if (!module) throw new ApiError(422, 'Modul tidak valid.'); enforceSite(auth,module.site)
    const [sections] = await pool.query<RowDataPacket[]>('SELECT id FROM production_sections WHERE uid=?', [input.sectionUid]); if (!sections[0]) throw new ApiError(422, 'Bagian tidak valid.')
    const uid = randomUUID(); await pool.execute('INSERT INTO production_module_sections(uid,production_module_id,production_section_id,is_active,created_by,updated_by) VALUES(?,?,?,?,?,?)', [uid,module.id,sections[0].id,input.isActive === false ? 0 : 1,auth.id,auth.id])
    await writeAudit({ auth, request:req, siteId:module.siteId, action:'CREATE', table:'production_module_sections', recordUid:uid, description:'Memetakan Bagian ke Modul produksi.' }); res.status(201).json({ uid })
  } catch (error) { next(error) }
})

productionStructureRouter.patch('/module-sections/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = z.object({ isActive: z.boolean() }).parse(req.body); const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid)
    const [rows] = await pool.query<RowDataPacket[]>('SELECT pms.id,s.code site FROM production_module_sections pms JOIN production_modules m ON m.id=pms.production_module_id JOIN sites s ON s.id=m.site_id WHERE pms.uid=?', [uid]); if (!rows[0]) throw new ApiError(404,'Pemetaan tidak ditemukan.')
    enforceSite(auth,rows[0].site); await pool.execute('UPDATE production_module_sections SET is_active=?,updated_by=? WHERE id=?',[input.isActive ? 1 : 0,auth.id,rows[0].id]); await writeAudit({auth,request:req,action:'UPDATE',table:'production_module_sections',recordUid:uid,description:`${input.isActive ? 'Mengaktifkan' : 'Menonaktifkan'} pemetaan Bagian Modul.`}); res.status(204).end()
  } catch (error) { next(error) }
})
