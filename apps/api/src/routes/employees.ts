import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import { authenticate, requirePermission, type AuthContext } from '../middleware/authenticate.js'

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const optional = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((value) => value ?? undefined)
const optionalDate = z
  .string()
  .date()
  .optional()
  .nullable()
  .transform((value) => value ?? undefined)
const employeeInput = z.object({
  employeeNumber: z.string().trim().min(1), barcode: z.string().trim().min(1), fullName: z.string().trim().min(2), nickname: optional,
  employeeType: z.enum(['BORONGAN', 'BULANAN']), employeeStatus: z.enum(['ACTIVE', 'LEAVE', 'RESIGNED', 'INACTIVE']), site: siteCode,
  department: optional, position: optional, workGroup: optional, joinDate: z.string().date(), permanentDate: optionalDate,
  resignDate: optionalDate, resignReason: optional, gender: z.enum(['MALE', 'FEMALE']), birthPlace: optional, birthDate: optionalDate,
  maritalStatus: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(), religion: optional, address: optional, city: optional, province: optional,
  postalCode: optional, phone: optional, emergencyContactName: optional, emergencyContactPhone: optional, emergencyContactRelation: optional,
  nationalIdNumber: optional, familyCardNumber: optional, taxNumber: optional, bankName: optional, bankAccountNumber: optional, bankAccountName: optional,
  bpjsHealthNumber: optional, bpjsEmploymentNumber: optional, photoUid: z.string().uuid().optional(), notes: optional,
})
const mutationInput = z.object({
  site: siteCode, department: optional, position: optional, workGroup: optional, employeeType: z.enum(['BORONGAN', 'BULANAN']),
  employeeStatus: z.enum(['ACTIVE', 'LEAVE', 'RESIGNED', 'INACTIVE']), effectiveFrom: z.string().date(),
  changeType: z.enum(['TRANSFER', 'PROMOTION', 'DEMOTION', 'STATUS_CHANGE', 'TYPE_CHANGE', 'GROUP_CHANGE', 'OTHER']), referenceNumber: optional, reason: optional, notes: optional,
})
const contractInput = z.object({
  contractNumber: z.string().trim().min(1), contractType: z.enum(['PKWT', 'PKWTT', 'OTHER']), sequenceNumber: z.number().int().positive(),
  startDate: z.string().date(), endDate: optionalDate, signedDate: optionalDate,
  status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED']), issuedFileUid: z.string().uuid().optional(), notes: optional,
}).refine((value) => !value.endDate || value.endDate >= value.startDate, { message: 'Tanggal kontrak tidak valid.', path: ['endDate'] })
const documentInput = z.object({
  documentType: z.string().trim().min(1), documentNumber: optional, name: z.string().trim().min(1), fileUid: z.string().uuid(),
  issuedDate: optionalDate, expiryDate: optionalDate, status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED']), notes: optional,
}).refine((value) => !value.issuedDate || !value.expiryDate || value.expiryDate >= value.issuedDate, { message: 'Tanggal dokumen tidak valid.', path: ['expiryDate'] })

const employeeSelect = `SELECT e.uid,e.employee_number employeeNumber,e.barcode,e.full_name fullName,e.nickname,et.code employeeType,es.code employeeStatus,s.code site,d.name department,p.name position,w.name workGroup,e.join_date joinDate,e.permanent_date permanentDate,e.resign_date resignDate,e.resign_reason resignReason,e.gender,e.birth_place birthPlace,e.birth_date birthDate,e.marital_status maritalStatus,e.religion,e.address,e.city,e.province,e.postal_code postalCode,e.phone,e.emergency_contact_name emergencyContactName,e.emergency_contact_phone emergencyContactPhone,e.emergency_contact_relation emergencyContactRelation,e.national_id_number nationalIdNumber,e.family_card_number familyCardNumber,e.tax_number taxNumber,e.bank_name bankName,e.bank_account_number bankAccountNumber,e.bank_account_name bankAccountName,e.bpjs_health_number bpjsHealthNumber,e.bpjs_employment_number bpjsEmploymentNumber,e.notes,f.uid photoUid,f.original_name photoName,f.mime_type photoMimeType,f.size_bytes photoSizeBytes,f.extension photoExtension FROM employees e JOIN employee_types et ON et.id=e.employee_type_id JOIN employee_statuses es ON es.id=e.employee_status_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN departments d ON d.id=e.current_department_id LEFT JOIN positions p ON p.id=e.current_position_id LEFT JOIN work_groups w ON w.id=e.current_work_group_id LEFT JOIN files f ON f.id=e.photo_file_id`
const empty = (value?: string) => value?.trim() || null
function enforceSite(auth: AuthContext, site: string) { if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) throw new ApiError(403, 'Akses site ditolak.') }
function mapEmployee(row: RowDataPacket) {
  const { photoUid, photoName, photoMimeType, photoSizeBytes, photoExtension, ...employee } = row
  return { ...employee, photo: photoUid ? { uid: photoUid, originalName: photoName, mimeType: photoMimeType, sizeBytes: Number(photoSizeBytes), extension: photoExtension } : undefined }
}
async function references(input: z.infer<typeof employeeInput> | z.infer<typeof mutationInput>) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id siteId,(SELECT id FROM departments WHERE site_id=s.id AND name=? LIMIT 1) departmentId,(SELECT id FROM positions WHERE name=? LIMIT 1) positionId,(SELECT id FROM work_groups WHERE site_id=s.id AND name=? LIMIT 1) workGroupId,(SELECT id FROM employee_types WHERE code=? LIMIT 1) typeId,(SELECT id FROM employee_statuses WHERE code=? LIMIT 1) statusId FROM sites s WHERE s.code=? LIMIT 1`,
    [empty(input.department), empty(input.position), empty(input.workGroup), input.employeeType, input.employeeStatus, input.site]
  )
  if (!rows[0]?.siteId || !rows[0].typeId || !rows[0].statusId) throw new ApiError(422, 'Referensi penempatan tidak valid.')
  return rows[0]
}
async function employeeAccess(uid: string, auth: AuthContext) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT e.id,s.id siteId,s.code site,p.name position FROM employees e JOIN sites s ON s.id=e.current_site_id LEFT JOIN positions p ON p.id=e.current_position_id WHERE e.uid=?`, [uid])
  if (!rows[0]) throw new ApiError(404, 'Karyawan tidak ditemukan.')
  enforceSite(auth, rows[0].site)
  return rows[0]
}
async function fileId(uid?: string) {
  if (!uid) return null
  const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM files WHERE uid=?', [uid])
  if (!rows[0]) throw new ApiError(422, 'File tidak ditemukan.')
  return rows[0].id as number
}
function scopeWhere(auth: AuthContext, column = 's.code') { return auth.roles.includes('SUPER_ADMIN') ? { sql: '1=1', params: [] as string[] } : { sql: `${column} IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`, params: auth.siteAccess } }
const routeParam = (value: string | string[]) => Array.isArray(value) ? value[0] : value

export const employeesRouter = Router()
employeesRouter.use(authenticate)

employeesRouter.get('/lookups', requirePermission('employees.view'), async (_req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const scope = scopeWhere(auth)
    const [sites] = await pool.query(`SELECT uid,code,name FROM sites WHERE is_active=1 AND ${scope.sql}`, scope.params)
    const [departments] = await pool.query(`SELECT d.uid,d.code,d.name,s.code siteCode FROM departments d JOIN sites s ON s.id=d.site_id WHERE d.is_active=1 AND ${scope.sql}`, scope.params)
    const [positions] = await pool.query('SELECT uid,code,name FROM positions WHERE is_active=1')
    const [workGroups] = await pool.query(`SELECT w.uid,w.code,w.name,s.code siteCode FROM work_groups w JOIN sites s ON s.id=w.site_id WHERE w.is_active=1 AND ${scope.sql}`, scope.params)
    res.json({ sites, departments, positions, workGroups })
  } catch (error) { next(error) }
})

employeesRouter.get('/', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1)); const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize ?? 10)))
    const where = ['1=1']; const values: unknown[] = []; const query = String(req.query.query ?? '')
    const addList = (field: string, raw: unknown) => { const list = String(raw ?? '').split(',').filter(Boolean); if (list.length) { where.push(`${field} IN (${list.map(() => '?').join(',')})`); values.push(...list) } }
    if (query) { where.push('(e.full_name LIKE ? OR e.employee_number LIKE ? OR e.barcode LIKE ?)'); values.push(`%${query}%`, `%${query}%`, `%${query}%`) }
    addList('s.code', req.query.site); addList('et.code', req.query.employeeType); addList('es.code', req.query.employeeStatus)
    const scoped = scopeWhere(res.locals.auth as AuthContext); where.push(scoped.sql); values.push(...scoped.params)
    const clause = where.join(' AND ')
    const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total FROM employees e JOIN employee_types et ON et.id=e.employee_type_id JOIN employee_statuses es ON es.id=e.employee_status_id JOIN sites s ON s.id=e.current_site_id WHERE ${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`${employeeSelect} WHERE ${clause} ORDER BY e.full_name LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize])
    res.json({ items: rows.map(mapEmployee), total: Number(count[0].total), page, pageSize })
  } catch (error) { next(error) }
})

employeesRouter.get('/histories', requirePermission('employees.view'), async (_req, res, next) => {
  try {
    const scoped = scopeWhere(res.locals.auth as AuthContext)
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT h.uid,e.uid employeeUid,s.code site,d.name department,p.name position,w.name workGroup,et.code employeeType,es.code employeeStatus,h.effective_from effectiveFrom,h.effective_to effectiveTo,h.change_type changeType,h.reference_number referenceNumber,h.reason,h.notes FROM employee_employment_histories h JOIN employees e ON e.id=h.employee_id JOIN sites s ON s.id=h.site_id LEFT JOIN departments d ON d.id=h.department_id LEFT JOIN positions p ON p.id=h.position_id LEFT JOIN work_groups w ON w.id=h.work_group_id JOIN employee_types et ON et.id=h.employee_type_id JOIN employee_statuses es ON es.id=h.employee_status_id WHERE ${scoped.sql} ORDER BY h.effective_from DESC`, scoped.params)
    res.json(rows)
  } catch (error) { next(error) }
})

employeesRouter.get('/contracts', requirePermission('employees.view'), async (_req, res, next) => {
  try { const scoped = scopeWhere(res.locals.auth as AuthContext); const [rows] = await pool.query<RowDataPacket[]>(`${contractSelect()} WHERE ${scoped.sql} ORDER BY c.start_date DESC`, scoped.params); res.json(rows.map(mapContract)) } catch (error) { next(error) }
})
employeesRouter.get('/documents', requirePermission('employees.view'), async (_req, res, next) => {
  try { const scoped = scopeWhere(res.locals.auth as AuthContext); const [rows] = await pool.query<RowDataPacket[]>(`${documentSelect()} WHERE ${scoped.sql} ORDER BY d.expiry_date`, scoped.params); res.json(rows.map(mapDocument)) } catch (error) { next(error) }
})

employeesRouter.get('/:uid', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.uid); const [rows] = await pool.query<RowDataPacket[]>(`${employeeSelect} WHERE e.uid=?`, [uid]); if (!rows[0]) throw new ApiError(404, 'Karyawan tidak ditemukan.'); enforceSite(res.locals.auth, rows[0].site); res.json(mapEmployee(rows[0])) } catch (error) { next(error) }
})

employeesRouter.post('/', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = employeeInput.parse(req.body); const auth = res.locals.auth as AuthContext; enforceSite(auth, input.site); const refs = await references(input); const photoId = await fileId(input.photoUid); const uid = randomUUID(); const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await conn.execute(`INSERT INTO employees(uid,employee_number,barcode,employee_type_id,employee_status_id,current_site_id,current_department_id,current_position_id,current_work_group_id,full_name,nickname,national_id_number,family_card_number,gender,birth_place,birth_date,marital_status,religion,address,city,province,postal_code,phone,emergency_contact_name,emergency_contact_phone,emergency_contact_relation,bank_name,bank_account_number,bank_account_name,tax_number,bpjs_health_number,bpjs_employment_number,join_date,permanent_date,resign_date,resign_reason,photo_file_id,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uid,input.employeeNumber,input.barcode,refs.typeId,refs.statusId,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,input.fullName,empty(input.nickname),empty(input.nationalIdNumber),empty(input.familyCardNumber),input.gender,empty(input.birthPlace),empty(input.birthDate),empty(input.maritalStatus),empty(input.religion),empty(input.address),empty(input.city),empty(input.province),empty(input.postalCode),empty(input.phone),empty(input.emergencyContactName),empty(input.emergencyContactPhone),empty(input.emergencyContactRelation),empty(input.bankName),empty(input.bankAccountNumber),empty(input.bankAccountName),empty(input.taxNumber),empty(input.bpjsHealthNumber),empty(input.bpjsEmploymentNumber),input.joinDate,empty(input.permanentDate),empty(input.resignDate),empty(input.resignReason),photoId,empty(input.notes),auth.id,auth.id])
      const [created] = await conn.query<RowDataPacket[]>('SELECT id FROM employees WHERE uid=?', [uid])
      await conn.execute(`INSERT INTO employee_employment_histories(uid,employee_id,site_id,department_id,position_id,work_group_id,employee_type_id,employee_status_id,effective_from,change_type,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,'INITIAL',?,?,?)`, [randomUUID(),created[0].id,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.typeId,refs.statusId,input.joinDate,'Penempatan awal.',auth.id,auth.id])
      await writeAudit({ auth, request: req, siteId: refs.siteId, action: 'CREATE', table: 'employees', recordId: created[0].id, recordUid: uid, description: `Membuat karyawan ${input.employeeNumber}.` }, conn)
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})

employeesRouter.patch('/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = employeeInput.parse(req.body); const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid); const current = await employeeAccess(uid, auth); enforceSite(auth, input.site); const photoId = await fileId(input.photoUid)
    await pool.execute(`UPDATE employees SET employee_number=?,barcode=?,full_name=?,nickname=?,national_id_number=?,family_card_number=?,gender=?,birth_place=?,birth_date=?,marital_status=?,religion=?,address=?,city=?,province=?,postal_code=?,phone=?,emergency_contact_name=?,emergency_contact_phone=?,emergency_contact_relation=?,bank_name=?,bank_account_number=?,bank_account_name=?,tax_number=?,bpjs_health_number=?,bpjs_employment_number=?,join_date=?,permanent_date=?,photo_file_id=?,notes=?,updated_by=? WHERE id=?`, [input.employeeNumber,input.barcode,input.fullName,empty(input.nickname),empty(input.nationalIdNumber),empty(input.familyCardNumber),input.gender,empty(input.birthPlace),empty(input.birthDate),empty(input.maritalStatus),empty(input.religion),empty(input.address),empty(input.city),empty(input.province),empty(input.postalCode),empty(input.phone),empty(input.emergencyContactName),empty(input.emergencyContactPhone),empty(input.emergencyContactRelation),empty(input.bankName),empty(input.bankAccountNumber),empty(input.bankAccountName),empty(input.taxNumber),empty(input.bpjsHealthNumber),empty(input.bpjsEmploymentNumber),input.joinDate,empty(input.permanentDate),photoId,empty(input.notes),auth.id,current.id])
    await writeAudit({ auth, request: req, siteId: current.siteId, action: 'UPDATE', table: 'employees', recordId: current.id, recordUid: uid, description: `Memperbarui karyawan ${input.employeeNumber}.` })
    res.status(204).end()
  } catch (error) { next(error) }
})

employeesRouter.get('/:uid/histories', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.uid); await employeeAccess(uid, res.locals.auth); const [rows] = await pool.query<RowDataPacket[]>(`SELECT h.uid,e.uid employeeUid,s.code site,d.name department,p.name position,w.name workGroup,et.code employeeType,es.code employeeStatus,h.effective_from effectiveFrom,h.effective_to effectiveTo,h.change_type changeType,h.reference_number referenceNumber,h.reason,h.notes FROM employee_employment_histories h JOIN employees e ON e.id=h.employee_id JOIN sites s ON s.id=h.site_id LEFT JOIN departments d ON d.id=h.department_id LEFT JOIN positions p ON p.id=h.position_id LEFT JOIN work_groups w ON w.id=h.work_group_id JOIN employee_types et ON et.id=h.employee_type_id JOIN employee_statuses es ON es.id=h.employee_status_id WHERE e.uid=? ORDER BY h.effective_from DESC`, [uid]); res.json(rows) } catch (error) { next(error) }
})
employeesRouter.get('/:uid/contracts', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.uid); await employeeAccess(uid, res.locals.auth); const [rows] = await pool.query<RowDataPacket[]>(`${contractSelect()} WHERE e.uid=? ORDER BY c.start_date DESC`, [uid]); res.json(rows.map(mapContract)) } catch (error) { next(error) }
})
employeesRouter.get('/:uid/documents', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.uid); await employeeAccess(uid, res.locals.auth); const [rows] = await pool.query<RowDataPacket[]>(`${documentSelect()} WHERE e.uid=? ORDER BY d.expiry_date`, [uid]); res.json(rows.map(mapDocument)) } catch (error) { next(error) }
})

employeesRouter.post('/:uid/mutations', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = mutationInput.parse(req.body); const auth = res.locals.auth as AuthContext; const employee = await employeeAccess(routeParam(req.params.uid), auth); enforceSite(auth, input.site); const refs = await references(input); const uid = randomUUID(); const conn = await pool.getConnection()
    try {
      await conn.beginTransaction(); const [active] = await conn.query<RowDataPacket[]>('SELECT id,effective_from FROM employee_employment_histories WHERE employee_id=? AND effective_to IS NULL FOR UPDATE', [employee.id])
      if (active[0] && input.effectiveFrom <= String(active[0].effective_from).slice(0, 10)) throw new ApiError(422, 'Tanggal efektif harus setelah histori aktif.')
      if (active[0]) await conn.execute('UPDATE employee_employment_histories SET effective_to=DATE_SUB(?,INTERVAL 1 DAY),updated_by=? WHERE id=?', [input.effectiveFrom,auth.id,active[0].id])
      await conn.execute(`INSERT INTO employee_employment_histories(uid,employee_id,site_id,department_id,position_id,work_group_id,employee_type_id,employee_status_id,effective_from,change_type,reference_number,reason,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uid,employee.id,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.typeId,refs.statusId,input.effectiveFrom,input.changeType,empty(input.referenceNumber),empty(input.reason),empty(input.notes),auth.id,auth.id])
      await conn.execute('UPDATE employees SET employee_type_id=?,employee_status_id=?,current_site_id=?,current_department_id=?,current_position_id=?,current_work_group_id=?,resign_date=?,resign_reason=?,updated_by=? WHERE id=?', [refs.typeId,refs.statusId,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,input.employeeStatus === 'RESIGNED' ? input.effectiveFrom : null,input.employeeStatus === 'RESIGNED' ? empty(input.reason) : null,auth.id,employee.id])
      await writeAudit({ auth, request: req, siteId: refs.siteId, action: 'CREATE', table: 'employee_employment_histories', recordUid: uid, description: `Mencatat mutasi ${input.changeType}.` }, conn); await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})

employeesRouter.post('/:uid/contracts', requirePermission('employees.manage'), async (req, res, next) => {
  try { const input = contractInput.parse(req.body); const auth = res.locals.auth as AuthContext; const employee = await employeeAccess(routeParam(req.params.uid), auth); const uid = randomUUID(); await pool.execute(`INSERT INTO employee_contracts(uid,employee_id,contract_number,contract_type,sequence_number,start_date,end_date,signed_date,status,position_name_snapshot,site_name_snapshot,issued_file_id,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uid,employee.id,input.contractNumber,input.contractType,input.sequenceNumber,input.startDate,empty(input.endDate),empty(input.signedDate),input.status,employee.position,`Site ${employee.site}`,await fileId(input.issuedFileUid),empty(input.notes),auth.id,auth.id]); await writeAudit({ auth, request: req, siteId: employee.siteId, action: 'CREATE', table: 'employee_contracts', recordUid: uid, description: `Menambah kontrak ${input.contractNumber}.` }); res.status(201).json({ uid }) } catch (error) { next(error) }
})
employeesRouter.patch('/contracts/:contractUid', requirePermission('employees.manage'), async (req, res, next) => {
  try { const input = contractInput.parse(req.body); const auth = res.locals.auth as AuthContext; const contractUid = routeParam(req.params.contractUid); const [rows] = await pool.query<RowDataPacket[]>('SELECT c.id,c.employee_id,e.uid employeeUid,s.id siteId,s.code site,p.name position FROM employee_contracts c JOIN employees e ON e.id=c.employee_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN positions p ON p.id=e.current_position_id WHERE c.uid=?', [contractUid]); if (!rows[0]) throw new ApiError(404, 'Kontrak tidak ditemukan.'); enforceSite(auth, rows[0].site); await pool.execute('UPDATE employee_contracts SET contract_number=?,contract_type=?,sequence_number=?,start_date=?,end_date=?,signed_date=?,status=?,issued_file_id=?,notes=?,updated_by=? WHERE id=?', [input.contractNumber,input.contractType,input.sequenceNumber,input.startDate,empty(input.endDate),empty(input.signedDate),input.status,await fileId(input.issuedFileUid),empty(input.notes),auth.id,rows[0].id]); await writeAudit({ auth, request: req, siteId: rows[0].siteId, action: 'UPDATE', table: 'employee_contracts', recordId: rows[0].id, recordUid: contractUid, description: `Memperbarui kontrak ${input.contractNumber}.` }); res.status(204).end() } catch (error) { next(error) }
})
employeesRouter.post('/:uid/documents', requirePermission('documents.manage'), async (req, res, next) => {
  try { const input = documentInput.parse(req.body); const auth = res.locals.auth as AuthContext; const employee = await employeeAccess(routeParam(req.params.uid), auth); const uid = randomUUID(); await pool.execute('INSERT INTO employee_documents(uid,employee_id,document_type,document_number,name,file_id,issued_date,expiry_date,status,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [uid,employee.id,input.documentType,empty(input.documentNumber),input.name,await fileId(input.fileUid),empty(input.issuedDate),empty(input.expiryDate),input.status,empty(input.notes),auth.id,auth.id]); await writeAudit({ auth, request: req, siteId: employee.siteId, action: 'CREATE', table: 'employee_documents', recordUid: uid, description: `Menambah dokumen ${input.name}.` }); res.status(201).json({ uid }) } catch (error) { next(error) }
})
employeesRouter.patch('/documents/:documentUid', requirePermission('documents.manage'), async (req, res, next) => {
  try { const input = documentInput.parse(req.body); const auth = res.locals.auth as AuthContext; const documentUid = routeParam(req.params.documentUid); const [rows] = await pool.query<RowDataPacket[]>('SELECT d.id,s.id siteId,s.code site FROM employee_documents d JOIN employees e ON e.id=d.employee_id JOIN sites s ON s.id=e.current_site_id WHERE d.uid=?', [documentUid]); if (!rows[0]) throw new ApiError(404, 'Dokumen tidak ditemukan.'); enforceSite(auth, rows[0].site); await pool.execute('UPDATE employee_documents SET document_type=?,document_number=?,name=?,file_id=?,issued_date=?,expiry_date=?,status=?,notes=?,updated_by=? WHERE id=?', [input.documentType,empty(input.documentNumber),input.name,await fileId(input.fileUid),empty(input.issuedDate),empty(input.expiryDate),input.status,empty(input.notes),auth.id,rows[0].id]); await writeAudit({ auth, request: req, siteId: rows[0].siteId, action: 'UPDATE', table: 'employee_documents', recordId: rows[0].id, recordUid: documentUid, description: `Memperbarui dokumen ${input.name}.` }); res.status(204).end() } catch (error) { next(error) }
})

function contractSelect() { return `SELECT c.uid,e.uid employeeUid,c.contract_number contractNumber,c.contract_type contractType,c.sequence_number sequenceNumber,c.start_date startDate,c.end_date endDate,c.signed_date signedDate,c.status,c.position_name_snapshot positionNameSnapshot,c.site_name_snapshot siteNameSnapshot,c.salary_or_rate_notes salaryOrRateNotes,c.notes,f.uid issuedFileUid,f.original_name issuedFileName,f.mime_type issuedFileMimeType,f.size_bytes issuedFileSizeBytes,f.extension issuedFileExtension FROM employee_contracts c JOIN employees e ON e.id=c.employee_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN files f ON f.id=c.issued_file_id` }
function mapContract(row: RowDataPacket) { const { issuedFileUid, issuedFileName, issuedFileMimeType, issuedFileSizeBytes, issuedFileExtension, ...contract } = row; return { ...contract, issuedFile: issuedFileUid ? { uid: issuedFileUid, originalName: issuedFileName, mimeType: issuedFileMimeType, sizeBytes: Number(issuedFileSizeBytes), extension: issuedFileExtension } : undefined } }
function documentSelect() { return `SELECT d.uid,e.uid employeeUid,d.document_type documentType,d.document_number documentNumber,d.name,d.issued_date issuedDate,d.expiry_date expiryDate,d.status,d.notes,f.uid fileUid,f.original_name originalName,f.mime_type mimeType,f.size_bytes sizeBytes,f.extension FROM employee_documents d JOIN employees e ON e.id=d.employee_id JOIN sites s ON s.id=e.current_site_id JOIN files f ON f.id=d.file_id` }
function mapDocument(row: RowDataPacket) { const { fileUid, originalName, mimeType, sizeBytes, extension, ...document } = row; return { ...document, file: { uid: fileUid, originalName, mimeType, sizeBytes: Number(sizeBytes), extension } } }
