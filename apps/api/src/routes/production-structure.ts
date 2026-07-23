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
const departmentInput = z.object({ site: siteCode, code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(100), description: optional, isActive: active }).strict()
const positionInput = z.object({ code: z.string().trim().min(1).max(30), name: z.string().trim().min(1).max(100), category: z.enum(['PRODUCTION', 'STAFF', 'MANAGEMENT']), description: optional, isActive: active }).strict()
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
function enforceSuperAdmin(auth: AuthContext) {
  if (!auth.roles.includes('SUPER_ADMIN')) {
    throw new ApiError(403, 'Master Jabatan hanya dapat dikelola oleh Super Admin.')
  }
}
function pageParams(raw: unknown, rawPageSize: unknown) {
  return { page: Math.max(1, Number(raw ?? 1)), pageSize: Math.min(500, Math.max(1, Number(rawPageSize ?? 50))) }
}
function activeFilter(raw: unknown) {
  const values = String(raw ?? '')
    .split(',')
    .filter((value) => value === 'true' || value === 'false')
  return values.length === 1 ? (values[0] === 'true' ? 1 : 0) : undefined
}
async function ensureUnused(
  conn: Awaited<ReturnType<typeof pool.getConnection>>,
  references: { sql: string; params: unknown[]; label: string }[]
) {
  for (const reference of references) {
    const [rows] = await conn.query<RowDataPacket[]>(reference.sql, reference.params)
    if (rows[0]) {
      throw new ApiError(409, `Data tidak dapat dihapus karena masih digunakan oleh ${reference.label}.`)
    }
  }
}

export const productionStructureRouter = Router()
productionStructureRouter.use(authenticate)

productionStructureRouter.get('/departments', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
    const where = ['1=1']; const values: unknown[] = []
    const query = String(req.query.query ?? '').trim()
    if (query) { where.push('(d.code LIKE ? OR d.name LIKE ?)'); values.push(`%${query}%`, `%${query}%`) }
    const sites = String(req.query.site ?? '').split(',').filter((value) => siteCode.options.includes(value as 'JEPARA' | 'SEMARANG' | 'KLATEN'))
    if (sites.length) { where.push(`s.code IN (${sites.map(() => '?').join(',')})`); values.push(...sites) }
    const isActive = activeFilter(req.query.isActive)
    if (isActive !== undefined) { where.push('d.is_active=?'); values.push(isActive) }
    const scope = scopeWhere(res.locals.auth as AuthContext); where.push(scope.sql); values.push(...scope.params)
    const clause = where.join(' AND ')
    const from = 'FROM departments d JOIN sites s ON s.id=d.site_id'
    const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total ${from} WHERE ${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT d.uid,d.code,d.name,d.description,d.is_active isActive,s.code site ${from} WHERE ${clause} ORDER BY d.created_at DESC,d.id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize])
    res.json({ items: rows, total: Number(count[0].total), page, pageSize })
  } catch (error) { next(error) }
})

productionStructureRouter.post('/departments', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = departmentInput.parse(req.body); const auth = res.locals.auth as AuthContext; enforceSite(auth, input.site)
    const [sites] = await pool.query<RowDataPacket[]>('SELECT id FROM sites WHERE code=? AND is_active=1', [input.site])
    if (!sites[0]) throw new ApiError(422, 'Site tidak valid atau tidak aktif.')
    const uid = randomUUID()
    await pool.execute('INSERT INTO departments(uid,site_id,code,name,description,is_active,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?)', [uid, sites[0].id, input.code.toUpperCase(), input.name, input.description ?? null, input.isActive === false ? 0 : 1, auth.id, auth.id])
    await writeAudit({ auth, request: req, siteId: sites[0].id, action: 'CREATE', table: 'departments', recordUid: uid, description: `Menambah Departemen ${input.name}.` })
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})

productionStructureRouter.patch('/departments/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const input = departmentInput.parse(req.body); const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid)
    await conn.beginTransaction()
    const [departments] = await conn.query<RowDataPacket[]>('SELECT d.id,d.is_active isActive,s.id siteId,s.code site FROM departments d JOIN sites s ON s.id=d.site_id WHERE d.uid=? FOR UPDATE', [uid])
    const department = departments[0]
    if (!department) throw new ApiError(404, 'Departemen tidak ditemukan.')
    enforceSite(auth, department.site)
    if (department.site !== input.site) throw new ApiError(422, 'Site Departemen tidak dapat diubah.')
    if (department.isActive && input.isActive === false) {
      const [employees] = await conn.query<RowDataPacket[]>("SELECT e.id FROM employees e JOIN employee_statuses es ON es.id=e.employee_status_id WHERE e.current_department_id=? AND es.code='ACTIVE' LIMIT 1 FOR UPDATE", [department.id])
      if (employees[0]) throw new ApiError(422, 'Departemen masih dipakai karyawan Aktif. Mutasikan seluruh karyawan Aktif ke Departemen lain sebelum menonaktifkannya.')
    }
    await conn.execute('UPDATE departments SET code=?,name=?,description=?,is_active=?,updated_by=? WHERE id=?', [input.code.toUpperCase(), input.name, input.description ?? null, input.isActive === false ? 0 : 1, auth.id, department.id])
    await writeAudit({ auth, request: req, siteId: department.siteId, action: 'UPDATE', table: 'departments', recordId: department.id, recordUid: uid, description: `${input.isActive === false ? 'Menonaktifkan' : 'Memperbarui'} Departemen ${input.name}.` }, conn)
    await conn.commit()
    res.status(204).end()
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally { conn.release() }
})

productionStructureRouter.delete('/departments/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid)
    await conn.beginTransaction()
    const [departments] = await conn.query<RowDataPacket[]>('SELECT d.id,d.name,s.id siteId,s.code site FROM departments d JOIN sites s ON s.id=d.site_id WHERE d.uid=? FOR UPDATE', [uid])
    const department = departments[0]
    if (!department) throw new ApiError(404, 'Departemen tidak ditemukan.')
    enforceSite(auth, department.site)
    await ensureUnused(conn, [
      { sql: 'SELECT id FROM employees WHERE current_department_id=? LIMIT 1 FOR UPDATE', params: [department.id], label: 'data Karyawan' },
      { sql: 'SELECT id FROM employee_employment_histories WHERE department_id=? LIMIT 1 FOR UPDATE', params: [department.id], label: 'histori penempatan Karyawan' },
      { sql: 'SELECT id FROM work_groups WHERE department_id=? LIMIT 1 FOR UPDATE', params: [department.id], label: 'Kelompok Kerja' },
    ])
    await conn.execute('DELETE FROM departments WHERE id=?', [department.id])
    await writeAudit({ auth, request: req, siteId: department.siteId, action: 'DELETE', table: 'departments', recordId: department.id, recordUid: uid, description: `Menghapus Departemen ${department.name}.` }, conn)
    await conn.commit()
    res.status(204).end()
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally { conn.release() }
})

productionStructureRouter.get('/positions', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
    const where = ['1=1']; const values: unknown[] = []
    const query = String(req.query.query ?? '').trim()
    if (query) { where.push('(code LIKE ? OR name LIKE ?)'); values.push(`%${query}%`, `%${query}%`) }
    const category = String(req.query.category ?? '')
    if (['PRODUCTION', 'STAFF', 'MANAGEMENT'].includes(category)) { where.push('category=?'); values.push(category) }
    const isActive = activeFilter(req.query.isActive)
    if (isActive !== undefined) { where.push('is_active=?'); values.push(isActive) }
    const clause = where.join(' AND ')
    const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total FROM positions WHERE ${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT uid,code,name,category,description,is_active isActive FROM positions WHERE ${clause} ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize])
    res.json({ items: rows, total: Number(count[0].total), page, pageSize })
  } catch (error) { next(error) }
})

productionStructureRouter.post('/positions', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = positionInput.parse(req.body); const auth = res.locals.auth as AuthContext; enforceSuperAdmin(auth)
    const uid = randomUUID()
    await pool.execute('INSERT INTO positions(uid,code,name,category,description,is_active,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?)', [uid, input.code.toUpperCase(), input.name, input.category, input.description ?? null, input.isActive === false ? 0 : 1, auth.id, auth.id])
    await writeAudit({ auth, request: req, action: 'CREATE', table: 'positions', recordUid: uid, description: `Menambah Jabatan ${input.name}.` })
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})

productionStructureRouter.patch('/positions/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const input = positionInput.parse(req.body); const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid); enforceSuperAdmin(auth)
    await conn.beginTransaction()
    const [positions] = await conn.query<RowDataPacket[]>('SELECT id,is_active isActive FROM positions WHERE uid=? FOR UPDATE', [uid])
    const position = positions[0]
    if (!position) throw new ApiError(404, 'Jabatan tidak ditemukan.')
    if (position.isActive && input.isActive === false) {
      const [employees] = await conn.query<RowDataPacket[]>("SELECT e.id FROM employees e JOIN employee_statuses es ON es.id=e.employee_status_id WHERE e.current_position_id=? AND es.code='ACTIVE' LIMIT 1 FOR UPDATE", [position.id])
      if (employees[0]) throw new ApiError(422, 'Jabatan masih dipakai karyawan Aktif. Mutasikan seluruh karyawan Aktif ke Jabatan lain sebelum menonaktifkannya.')
    }
    await conn.execute('UPDATE positions SET code=?,name=?,category=?,description=?,is_active=?,updated_by=? WHERE id=?', [input.code.toUpperCase(), input.name, input.category, input.description ?? null, input.isActive === false ? 0 : 1, auth.id, position.id])
    await writeAudit({ auth, request: req, action: 'UPDATE', table: 'positions', recordId: position.id, recordUid: uid, description: `${input.isActive === false ? 'Menonaktifkan' : 'Memperbarui'} Jabatan ${input.name}.` }, conn)
    await conn.commit()
    res.status(204).end()
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally { conn.release() }
})

productionStructureRouter.delete('/positions/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid); enforceSuperAdmin(auth)
    await conn.beginTransaction()
    const [positions] = await conn.query<RowDataPacket[]>('SELECT id,name FROM positions WHERE uid=? FOR UPDATE', [uid])
    const position = positions[0]
    if (!position) throw new ApiError(404, 'Jabatan tidak ditemukan.')
    await ensureUnused(conn, [
      { sql: 'SELECT id FROM employees WHERE current_position_id=? LIMIT 1 FOR UPDATE', params: [position.id], label: 'data Karyawan' },
      { sql: 'SELECT id FROM employee_employment_histories WHERE position_id=? LIMIT 1 FOR UPDATE', params: [position.id], label: 'histori penempatan Karyawan' },
    ])
    await conn.execute('DELETE FROM positions WHERE id=?', [position.id])
    await writeAudit({ auth, request: req, action: 'DELETE', table: 'positions', recordId: position.id, recordUid: uid, description: `Menghapus Jabatan ${position.name}.` }, conn)
    await conn.commit()
    res.status(204).end()
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally { conn.release() }
})

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

productionStructureRouter.delete('/modules/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid)
    await conn.beginTransaction()
    const [modules] = await conn.query<RowDataPacket[]>('SELECT m.id,m.name,s.id siteId,s.code site FROM production_modules m JOIN sites s ON s.id=m.site_id WHERE m.uid=? FOR UPDATE', [uid])
    const module = modules[0]
    if (!module) throw new ApiError(404, 'Modul tidak ditemukan.')
    enforceSite(auth, module.site)
    await ensureUnused(conn, [
      { sql: 'SELECT id FROM production_module_sections WHERE production_module_id=? LIMIT 1 FOR UPDATE', params: [module.id], label: 'pemetaan Modul dan Bagian' },
    ])
    await conn.execute('DELETE FROM production_modules WHERE id=?', [module.id])
    await writeAudit({ auth, request: req, siteId: module.siteId, action: 'DELETE', table: 'production_modules', recordId: module.id, recordUid: uid, description: `Menghapus Modul produksi ${module.name}.` }, conn)
    await conn.commit()
    res.status(204).end()
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally { conn.release() }
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

productionStructureRouter.delete('/sections/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid)
    await conn.beginTransaction()
    const [sections] = await conn.query<RowDataPacket[]>('SELECT id,name FROM production_sections WHERE uid=? FOR UPDATE', [uid])
    const section = sections[0]
    if (!section) throw new ApiError(404, 'Bagian tidak ditemukan.')
    await ensureUnused(conn, [
      { sql: 'SELECT id FROM production_module_sections WHERE production_section_id=? LIMIT 1 FOR UPDATE', params: [section.id], label: 'pemetaan Modul dan Bagian' },
    ])
    await conn.execute('DELETE FROM production_sections WHERE id=?', [section.id])
    await writeAudit({ auth, request: req, action: 'DELETE', table: 'production_sections', recordId: section.id, recordUid: uid, description: `Menghapus Bagian produksi ${section.name}.` }, conn)
    await conn.commit()
    res.status(204).end()
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally { conn.release() }
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

productionStructureRouter.delete('/module-sections/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid)
    await conn.beginTransaction()
    const [mappings] = await conn.query<RowDataPacket[]>('SELECT pms.id,m.name moduleName,ps.name sectionName,s.id siteId,s.code site FROM production_module_sections pms JOIN production_modules m ON m.id=pms.production_module_id JOIN production_sections ps ON ps.id=pms.production_section_id JOIN sites s ON s.id=m.site_id WHERE pms.uid=? FOR UPDATE', [uid])
    const mapping = mappings[0]
    if (!mapping) throw new ApiError(404, 'Pemetaan tidak ditemukan.')
    enforceSite(auth, mapping.site)
    await ensureUnused(conn, [
      { sql: 'SELECT id FROM employees WHERE current_production_module_section_id=? LIMIT 1 FOR UPDATE', params: [mapping.id], label: 'data Karyawan' },
      { sql: 'SELECT id FROM employee_employment_histories WHERE production_module_section_id=? LIMIT 1 FOR UPDATE', params: [mapping.id], label: 'histori penempatan Karyawan' },
    ])
    await conn.execute('DELETE FROM production_module_sections WHERE id=?', [mapping.id])
    await writeAudit({ auth, request: req, siteId: mapping.siteId, action: 'DELETE', table: 'production_module_sections', recordId: mapping.id, recordUid: uid, description: `Menghapus pemetaan ${mapping.moduleName} dan ${mapping.sectionName}.` }, conn)
    await conn.commit()
    res.status(204).end()
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally { conn.release() }
})
