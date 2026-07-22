import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { env } from '../config.js'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import {
  EmployeeNumberSequenceExhaustedError,
  reserveEmployeeNumber,
} from '../lib/employee-number.js'
import { ApiError } from '../lib/errors.js'
import {
  assertContractRules,
  businessDate,
  synchronizeActiveContractAfterEdit,
  transitionContract,
} from '../lib/contract-lifecycle.js'
import { cronConflict } from '../lib/contract-lifecycle-policy.js'
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
const apiOptionalDate = z.string().date().nullable().optional()
const optionalRtrw = z
  .string()
  .trim()
  .regex(/^\d{3}\/\d{3}$/, 'RT/RW wajib berformat 001/002.')
  .optional()
  .nullable()
  .transform((value) => value ?? undefined)
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email tidak valid.')
  .optional()
  .nullable()
  .transform((value) => value ?? undefined)
const employeeInput = z.object({
  fullName: z.string().trim().min(2), nickname: optional,
  employeeType: z.enum(['BORONGAN', 'BULANAN']), employeeStatus: z.enum(['ACTIVE', 'RESIGNED', 'INACTIVE', 'LEAVE']), site: siteCode,
  department: optional, position: optional, workGroup: optional, productionModuleSectionUid: z.string().uuid().optional(), joinDate: z.string().date(), permanentDate: optionalDate,
  resignDate: optionalDate, resignReason: optional, gender: z.enum(['LAKI-LAKI', 'PEREMPUAN', 'MALE', 'FEMALE']), birthPlace: optional, birthDate: optionalDate,
  maritalStatus: z.enum(['BELUM_KAWIN', 'KAWIN', 'CERAI_HIDUP', 'CERAI_MATI', 'SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(), religion: optional, address: optional, rtrw: optionalRtrw, kelurahan: optional, kecamatan: optional, city: optional, province: optional,
  postalCode: optional, phone: optional, email: optionalEmail, emergencyContactName: optional, emergencyContactPhone: optional, emergencyContactRelation: optional,
  nationalIdNumber: optional, familyCardNumber: optional, taxNumber: optional, bankName: optional, bankAccountNumber: optional, bankAccountName: optional,
  bpjsHealthNumber: optional, bpjsEmploymentNumber: optional, photoUid: z.string().uuid().optional(), notes: optional,
  joinDateTraining: apiOptionalDate, joinDateBorong: apiOptionalDate,
}).strict()
  .refine((value) => !value.joinDateTraining || value.joinDateTraining >= value.joinDate, { path: ['joinDateTraining'], message: 'Tanggal join training tidak boleh sebelum tanggal bergabung.' })
  .refine((value) => !value.joinDateBorong || value.joinDateBorong >= value.joinDate, { path: ['joinDateBorong'], message: 'Tanggal join borong tidak boleh sebelum tanggal bergabung.' })
const mutationInput = z.object({
  site: siteCode, department: optional, position: optional, workGroup: optional, productionModuleSectionUid: z.string().uuid().optional(), employeeType: z.enum(['BORONGAN', 'BULANAN']),
  effectiveFrom: z.string().date(),
  changeType: z.enum(['TRANSFER', 'PROMOTION', 'DEMOTION', 'TYPE_CHANGE', 'GROUP_CHANGE', 'PRODUCTION_ASSIGNMENT_CHANGE', 'OTHER']), referenceNumber: optional, reason: optional, notes: optional,
})
const contractFields = {
  contractType: z.string().trim().min(1),
  startDate: z.string().date(), endDate: optionalDate, signedDate: optionalDate,
  issuedFileUid: z.string().uuid().optional(), notes: optional,
}
const contractCreateInput = z.object(contractFields).refine((value) => !value.endDate || value.endDate >= value.startDate, { message: 'Tanggal kontrak tidak valid.', path: ['endDate'] })
const contractUpdateInput = z.object(contractFields).strict()
  .refine((value) => !value.endDate || value.endDate >= value.startDate, { message: 'Tanggal kontrak tidak valid.', path: ['endDate'] })
const documentInput = z.object({
  documentType: z.string().trim().min(1), documentNumber: optional, name: z.string().trim().min(1), fileUid: z.string().uuid(),
  issuedDate: optionalDate, expiryDate: optionalDate, status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED']), notes: optional,
}).refine((value) => !value.issuedDate || !value.expiryDate || value.expiryDate >= value.issuedDate, { message: 'Tanggal dokumen tidak valid.', path: ['expiryDate'] })

const employeeSelect = `SELECT e.uid,e.employee_number employeeNumber,e.barcode,e.full_name fullName,e.nickname,et.code employeeType,es.code employeeStatus,s.code site,d.name department,p.name position,w.name workGroup,pms.uid productionModuleSectionUid,pm.uid productionModuleUid,pm.code productionModuleCode,pm.name productionModule,ps.uid productionSectionUid,ps.code productionSectionCode,ps.name productionSection,DATE_FORMAT(e.join_date,'%Y-%m-%d') joinDate,DATE_FORMAT(e.join_date_training,'%Y-%m-%d') joinDateTraining,DATE_FORMAT(e.join_date_borong,'%Y-%m-%d') joinDateBorong,DATE_FORMAT(e.permanent_date,'%Y-%m-%d') permanentDate,DATE_FORMAT(e.resign_date,'%Y-%m-%d') resignDate,e.resign_reason resignReason,e.gender,e.birth_place birthPlace,DATE_FORMAT(e.birth_date,'%Y-%m-%d') birthDate,e.marital_status maritalStatus,e.religion,e.address,e.rtrw,e.kelurahan,e.kecamatan,e.city,e.province,e.postal_code postalCode,e.phone,e.email,e.emergency_contact_name emergencyContactName,e.emergency_contact_phone emergencyContactPhone,e.emergency_contact_relation emergencyContactRelation,e.national_id_number nationalIdNumber,e.family_card_number familyCardNumber,e.tax_number taxNumber,e.bank_name bankName,e.bank_account_number bankAccountNumber,e.bank_account_name bankAccountName,e.bpjs_health_number bpjsHealthNumber,e.bpjs_employment_number bpjsEmploymentNumber,e.notes,f.uid photoUid,f.original_name photoName,f.mime_type photoMimeType,f.size_bytes photoSizeBytes,f.extension photoExtension,f.storage_path photoPath FROM employees e JOIN employee_types et ON et.id=e.employee_type_id JOIN employee_statuses es ON es.id=e.employee_status_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN departments d ON d.id=e.current_department_id LEFT JOIN positions p ON p.id=e.current_position_id LEFT JOIN work_groups w ON w.id=e.current_work_group_id LEFT JOIN production_module_sections pms ON pms.id=e.current_production_module_section_id LEFT JOIN production_modules pm ON pm.id=pms.production_module_id LEFT JOIN production_sections ps ON ps.id=pms.production_section_id LEFT JOIN files f ON f.id=e.photo_file_id`
const empty = (value?: string) => value?.trim() || null
function enforceSite(auth: AuthContext, site: string) { if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) throw new ApiError(403, 'Akses site ditolak.') }
function mapEmployee(row: RowDataPacket) {
  const { photoUid, photoName, photoMimeType, photoSizeBytes, photoExtension, photoPath, ...employee } = row
  return { ...employee, photo: photoUid ? { uid: photoUid, originalName: photoName, mimeType: photoMimeType, sizeBytes: Number(photoSizeBytes), extension: photoExtension, url: fileUrl(photoPath) } : undefined }
}
const fileUrl = (path?: string) => path ? `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${path}` : undefined
function formatContractNumber(contractType: string, employeeNumber: string, sequenceNumber: number) {
  const prefix = contractType
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${prefix}-${employeeNumber}-${String(sequenceNumber).padStart(2, '0')}`
}
async function references(input: z.infer<typeof employeeInput> | z.infer<typeof mutationInput>, employeeStatus: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id siteId,s.employee_number_prefix employeeNumberPrefix,(SELECT id FROM departments WHERE site_id=s.id AND name=? AND is_active=1 LIMIT 1) departmentId,(SELECT id FROM positions WHERE name=? AND is_active=1 LIMIT 1) positionId,(SELECT id FROM work_groups WHERE site_id=s.id AND name=? AND is_active=1 LIMIT 1) workGroupId,(SELECT id FROM employee_types WHERE code=? AND is_active=1 LIMIT 1) typeId,(SELECT id FROM employee_statuses WHERE code=? LIMIT 1) statusId FROM sites s WHERE s.code=? AND s.is_active=1 LIMIT 1`,
    [empty(input.department), empty(input.position), empty(input.workGroup), input.employeeType, employeeStatus, input.site]
  )
  if (!rows[0]?.siteId || !rows[0].typeId || !rows[0].statusId || !rows[0].employeeNumberPrefix) throw new ApiError(422, 'Referensi penempatan tidak valid.')
  if (input.employeeType === 'BULANAN') return { ...rows[0], productionModuleSectionId: null } as RowDataPacket
  if (!input.productionModuleSectionUid) throw new ApiError(422, 'Modul dan Bagian wajib dipilih untuk karyawan Borongan.')
  const [assignments] = await pool.query<RowDataPacket[]>(`SELECT pms.id FROM production_module_sections pms JOIN production_modules pm ON pm.id=pms.production_module_id JOIN production_sections ps ON ps.id=pms.production_section_id JOIN sites s ON s.id=pm.site_id WHERE pms.uid=? AND s.code=? AND pms.is_active=1 AND pm.is_active=1 AND ps.is_active=1`, [input.productionModuleSectionUid, input.site])
  if (!assignments[0]) throw new ApiError(422, 'Pasangan Modul dan Bagian tidak valid untuk site tersebut.')
  return { ...rows[0], productionModuleSectionId: assignments[0].id } as RowDataPacket
}
async function employeeAccess(uid: string, auth: AuthContext) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT e.id,e.employee_number employeeNumber,es.code employeeStatus,s.id siteId,s.code site,p.name position,DATE_FORMAT(e.join_date_training,'%Y-%m-%d') joinDateTraining,DATE_FORMAT(e.join_date_borong,'%Y-%m-%d') joinDateBorong FROM employees e JOIN employee_statuses es ON es.id=e.employee_status_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN positions p ON p.id=e.current_position_id WHERE e.uid=?`, [uid])
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
const scheduledMutationSelect = `SELECT sm.uid,sm.status,sm.change_type changeType,DATE_FORMAT(sm.effective_from,'%Y-%m-%d') effectiveFrom,sm.reference_number referenceNumber,sm.reason,sm.notes,sm.failure_reason failureReason,DATE_FORMAT(sm.applied_at,'%Y-%m-%dT%H:%i:%s') appliedAt,e.uid employeeUid,e.employee_number employeeNumber,e.full_name employeeName,sourceSite.code sourceSite,targetSite.code site,targetDepartment.name department,targetPosition.name position,targetWorkGroup.name workGroup,targetType.code employeeType,targetMapping.uid productionModuleSectionUid,targetModule.uid productionModuleUid,targetModule.name productionModule,targetSection.uid productionSectionUid,targetSection.name productionSection FROM scheduled_employee_mutations sm JOIN employees e ON e.id=sm.employee_id JOIN sites sourceSite ON sourceSite.id=e.current_site_id JOIN sites targetSite ON targetSite.id=sm.target_site_id LEFT JOIN departments targetDepartment ON targetDepartment.id=sm.target_department_id LEFT JOIN positions targetPosition ON targetPosition.id=sm.target_position_id LEFT JOIN work_groups targetWorkGroup ON targetWorkGroup.id=sm.target_work_group_id JOIN employee_types targetType ON targetType.id=sm.target_employee_type_id LEFT JOIN production_module_sections targetMapping ON targetMapping.id=sm.target_production_module_section_id LEFT JOIN production_modules targetModule ON targetModule.id=targetMapping.production_module_id LEFT JOIN production_sections targetSection ON targetSection.id=targetMapping.production_section_id`

export const employeesRouter = Router()
employeesRouter.use(authenticate)

employeesRouter.get('/lookups', requirePermission('employees.view'), async (_req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const scope = scopeWhere(auth)
    const [sites] = await pool.query(`SELECT uid,code,name,employee_number_prefix employeeNumberPrefix FROM sites WHERE is_active=1 AND ${scope.sql}`, scope.params)
    const [departments] = await pool.query(`SELECT d.uid,d.code,d.name,s.code siteCode FROM departments d JOIN sites s ON s.id=d.site_id WHERE d.is_active=1 AND ${scope.sql}`, scope.params)
    const [positions] = await pool.query('SELECT uid,code,name FROM positions WHERE is_active=1')
    const [workGroups] = await pool.query(`SELECT w.uid,w.code,w.name,s.code siteCode FROM work_groups w JOIN sites s ON s.id=w.site_id WHERE w.is_active=1 AND ${scope.sql}`, scope.params)
    const [productionModules] = await pool.query(`SELECT pm.uid,pm.code,pm.name,s.code siteCode FROM production_modules pm JOIN sites s ON s.id=pm.site_id WHERE pm.is_active=1 AND ${scope.sql} ORDER BY pm.name`, scope.params)
    const [productionModuleSections] = await pool.query(`SELECT pms.uid,pms.is_active isActive,pm.uid moduleUid,ps.uid sectionUid,ps.code sectionCode,ps.name sectionName,s.code siteCode FROM production_module_sections pms JOIN production_modules pm ON pm.id=pms.production_module_id JOIN production_sections ps ON ps.id=pms.production_section_id JOIN sites s ON s.id=pm.site_id WHERE pms.is_active=1 AND pm.is_active=1 AND ps.is_active=1 AND ${scope.sql} ORDER BY pm.name,ps.name`, scope.params)
    const [contractTypes] = await pool.query('SELECT uid,code,name FROM contract_types WHERE is_active=1 ORDER BY id ASC')
    res.json({ sites, departments, positions, workGroups, productionModules, productionModuleSections, contractTypes })
  } catch (error) { next(error) }
})

employeesRouter.get('/', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1)); const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 100)))
    const where = ['1=1']; const values: unknown[] = []; const query = String(req.query.query ?? '')
    const addList = (field: string, raw: unknown) => { const list = String(raw ?? '').split(',').filter(Boolean); if (list.length) { where.push(`${field} IN (${list.map(() => '?').join(',')})`); values.push(...list) } }
    if (query) { where.push('(e.full_name LIKE ? OR e.employee_number LIKE ? OR e.barcode LIKE ?)'); values.push(`%${query}%`, `%${query}%`, `%${query}%`) }
    addList('s.code', req.query.site); addList('et.code', req.query.employeeType); addList('es.code', req.query.employeeStatus)
    const scoped = scopeWhere(res.locals.auth as AuthContext); where.push(scoped.sql); values.push(...scoped.params)
    const clause = where.join(' AND ')
    const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total FROM employees e JOIN employee_types et ON et.id=e.employee_type_id JOIN employee_statuses es ON es.id=e.employee_status_id JOIN sites s ON s.id=e.current_site_id WHERE ${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`${employeeSelect} WHERE ${clause} ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize])
    res.json({ items: rows.map(mapEmployee), total: Number(count[0].total), page, pageSize })
  } catch (error) { next(error) }
})

employeesRouter.get('/histories', requirePermission('employees.view'), async (_req, res, next) => {
  try {
    const scoped = scopeWhere(res.locals.auth as AuthContext)
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT h.uid,e.uid employeeUid,e.full_name employeeName,e.employee_number employeeNumber,s.code site,d.name department,p.name position,w.name workGroup,pm.uid productionModuleUid,pm.name productionModule,ps.uid productionSectionUid,ps.name productionSection,et.code employeeType,es.code employeeStatus,DATE_FORMAT(h.effective_from,'%Y-%m-%d') effectiveFrom,DATE_FORMAT(h.effective_to,'%Y-%m-%d') effectiveTo,h.change_type changeType,h.reference_number referenceNumber,h.reason,h.notes FROM employee_employment_histories h JOIN employees e ON e.id=h.employee_id JOIN sites s ON s.id=h.site_id LEFT JOIN departments d ON d.id=h.department_id LEFT JOIN positions p ON p.id=h.position_id LEFT JOIN work_groups w ON w.id=h.work_group_id LEFT JOIN production_module_sections pms ON pms.id=h.production_module_section_id LEFT JOIN production_modules pm ON pm.id=pms.production_module_id LEFT JOIN production_sections ps ON ps.id=pms.production_section_id JOIN employee_types et ON et.id=h.employee_type_id JOIN employee_statuses es ON es.id=h.employee_status_id WHERE ${scoped.sql} ORDER BY h.effective_from DESC`, scoped.params)
    res.json(rows)
  } catch (error) { next(error) }
})

employeesRouter.get('/scheduled-mutations', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1)); const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 100)))
    const where = ['1=1']; const values: unknown[] = []; const query = String(req.query.query ?? '')
    if (query) { where.push('(e.full_name LIKE ? OR e.employee_number LIKE ? OR targetPosition.name LIKE ?)'); values.push(`%${query}%`, `%${query}%`, `%${query}%`) }
    const sites = String(req.query.site ?? '').split(',').filter(Boolean); if (sites.length) { where.push(`targetSite.code IN (${sites.map(() => '?').join(',')})`); values.push(...sites) }
    const statuses = String(req.query.status ?? '').split(',').filter(Boolean); if (statuses.length) { where.push(`sm.status IN (${statuses.map(() => '?').join(',')})`); values.push(...statuses) }
    const scoped = scopeWhere(res.locals.auth as AuthContext, 'sourceSite.code'); where.push(scoped.sql); values.push(...scoped.params)
    const clause = where.join(' AND ')
    const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total FROM scheduled_employee_mutations sm JOIN employees e ON e.id=sm.employee_id JOIN sites sourceSite ON sourceSite.id=e.current_site_id JOIN sites targetSite ON targetSite.id=sm.target_site_id LEFT JOIN positions targetPosition ON targetPosition.id=sm.target_position_id WHERE ${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`${scheduledMutationSelect} WHERE ${clause} ORDER BY sm.effective_from ASC,sm.created_at DESC,sm.id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize])
    res.json({ items: rows, total: Number(count[0].total), page, pageSize })
  } catch (error) { next(error) }
})

employeesRouter.get('/contracts', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1)); const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 100)))
    const where = ['1=1']; const values: unknown[] = []; const query = String(req.query.query ?? '')
    if (query) { where.push('(c.contract_number LIKE ? OR e.full_name LIKE ? OR e.employee_number LIKE ?)'); values.push(`%${query}%`, `%${query}%`, `%${query}%`) }
    const sites = String(req.query.site ?? '').split(',').filter(Boolean); if (sites.length) { where.push(`s.code IN (${sites.map(() => '?').join(',')})`); values.push(...sites) }
    const statuses = String(req.query.status ?? '').split(',').filter(Boolean); if (statuses.length) { where.push(`c.status IN (${statuses.map(() => '?').join(',')})`); values.push(...statuses) }
    const scoped = scopeWhere(res.locals.auth as AuthContext); where.push(scoped.sql); values.push(...scoped.params)
    const clause = where.join(' AND ')
    const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total ${contractFrom()} WHERE ${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`${contractSelect()} WHERE ${clause} ORDER BY c.start_date DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize])
    res.json({ items: rows.map(mapContract), total: Number(count[0].total), page, pageSize })
  } catch (error) { next(error) }
})
employeesRouter.get('/contracts/summary', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const where = ['1=1']
    const values: unknown[] = []
    const sites = String(req.query.site ?? '').split(',').filter(Boolean)
    if (sites.length) {
      where.push(`s.code IN (${sites.map(() => '?').join(',')})`)
      values.push(...sites)
    }
    const scoped = scopeWhere(res.locals.auth as AuthContext)
    where.push(scoped.sql)
    values.push(...scoped.params)
    const today = businessDate()
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        COALESCE(SUM(CASE WHEN c.status='ACTIVE' AND c.start_date<=? AND (c.end_date IS NULL OR c.end_date>=?) THEN 1 ELSE 0 END), 0) activeValid,
        COALESCE(SUM(CASE WHEN c.status='ACTIVE' AND c.end_date BETWEEN ? AND DATE_ADD(?, INTERVAL 7 DAY) THEN 1 ELSE 0 END), 0) expiringWithin7Days,
        COALESCE(SUM(CASE WHEN c.status='ACTIVE' AND c.end_date<? THEN 1 ELSE 0 END), 0) overdueActive,
        COALESCE(SUM(CASE WHEN c.status='DRAFT' THEN 1 ELSE 0 END), 0) drafts
      ${contractFrom()} WHERE ${where.join(' AND ')}`,
      [today, today, today, today, today, ...values]
    )
    const summary = rows[0] ?? {}
    res.json({
      activeValid: Number(summary.activeValid ?? 0),
      expiringWithin7Days: Number(summary.expiringWithin7Days ?? 0),
      overdueActive: Number(summary.overdueActive ?? 0),
      drafts: Number(summary.drafts ?? 0),
    })
  } catch (error) { next(error) }
})
employeesRouter.get('/contracts/conflicts', requirePermission('employees.view'), async (_req, res, next) => {
  try {
    const scope = scopeWhere(res.locals.auth as AuthContext)
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT e.uid employeeUid,e.employee_number employeeNumber,e.full_name fullName,s.code site,es.code currentStatus,COUNT(c.id) activeContracts,GROUP_CONCAT(c.contract_number ORDER BY c.start_date SEPARATOR ', ') activeContractNumbers FROM employees e JOIN sites s ON s.id=e.current_site_id JOIN employee_statuses es ON es.id=e.employee_status_id JOIN employee_contracts c ON c.employee_id=e.id AND c.status='ACTIVE' AND c.start_date<=CURDATE() AND (c.end_date IS NULL OR c.end_date>=CURDATE()) WHERE ${scope.sql} GROUP BY e.id,e.uid,e.employee_number,e.full_name,s.code,es.code HAVING COUNT(c.id)>1 OR (es.code IN ('RESIGNED','LEAVE') AND COUNT(c.id)>0) ORDER BY s.code,e.employee_number LIMIT 50`, scope.params)
    res.json({ items: rows.map((row) => cronConflict({ employeeUid: String(row.employeeUid), employeeNumber: String(row.employeeNumber), fullName: String(row.fullName), site: String(row.site), currentStatus: String(row.currentStatus), activeContracts: Number(row.activeContracts), activeContractNumbers: row.activeContractNumbers ? String(row.activeContractNumbers) : null })), total: rows.length })
  } catch (error) { next(error) }
})
employeesRouter.get('/documents', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1)); const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 100)))
    const where = ['1=1']; const values: unknown[] = []; const query = String(req.query.query ?? '')
    if (query) { where.push('(d.name LIKE ? OR d.document_number LIKE ? OR e.full_name LIKE ? OR e.employee_number LIKE ?)'); values.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`) }
    const sites = String(req.query.site ?? '').split(',').filter(Boolean); if (sites.length) { where.push(`s.code IN (${sites.map(() => '?').join(',')})`); values.push(...sites) }
    const statuses = String(req.query.status ?? '').split(',').filter(Boolean); if (statuses.length) { where.push(`d.status IN (${statuses.map(() => '?').join(',')})`); values.push(...statuses) }
    const scoped = scopeWhere(res.locals.auth as AuthContext); where.push(scoped.sql); values.push(...scoped.params)
    const clause = where.join(' AND ')
    const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total ${documentFrom()} WHERE ${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`${documentSelect()} WHERE ${clause} ORDER BY d.expiry_date LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize])
    res.json({ items: rows.map(mapDocument), total: Number(count[0].total), page, pageSize })
  } catch (error) { next(error) }
})
employeesRouter.get('/contracts/:contractUid', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.contractUid); const [rows] = await pool.query<RowDataPacket[]>(`${contractSelect()} WHERE c.uid=?`, [uid]); if (!rows[0]) throw new ApiError(404, 'Kontrak tidak ditemukan.'); enforceSite(res.locals.auth as AuthContext, rows[0].site); res.json(mapContract(rows[0])) } catch (error) { next(error) }
})
employeesRouter.get('/documents/:documentUid', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.documentUid); const [rows] = await pool.query<RowDataPacket[]>(`${documentSelect()} WHERE d.uid=?`, [uid]); if (!rows[0]) throw new ApiError(404, 'Dokumen tidak ditemukan.'); enforceSite(res.locals.auth as AuthContext, rows[0].site); res.json(mapDocument(rows[0])) } catch (error) { next(error) }
})

employeesRouter.get('/:uid', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.uid); const [rows] = await pool.query<RowDataPacket[]>(`${employeeSelect} WHERE e.uid=?`, [uid]); if (!rows[0]) throw new ApiError(404, 'Karyawan tidak ditemukan.'); enforceSite(res.locals.auth, rows[0].site); res.json(mapEmployee(rows[0])) } catch (error) { next(error) }
})

employeesRouter.post('/', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = employeeInput.parse(req.body); if (input.employeeStatus !== 'INACTIVE') throw new ApiError(422, 'Karyawan baru harus dibuat dengan status Nonaktif. Buat dan aktifkan kontrak terlebih dahulu untuk mengaktifkannya.'); const auth = res.locals.auth as AuthContext; enforceSite(auth, input.site); const refs = await references(input, input.employeeStatus); const photoId = await fileId(input.photoUid); const uid = randomUUID(); const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const employeeNumber = await reserveEmployeeNumber(conn, {
        siteId: Number(refs.siteId),
        prefix: String(refs.employeeNumberPrefix),
        joinDate: input.joinDate,
      })
      await conn.execute(`INSERT INTO employees(uid,employee_number,employee_type_id,employee_status_id,current_site_id,current_department_id,current_position_id,current_work_group_id,current_production_module_section_id,full_name,nickname,national_id_number,family_card_number,gender,birth_place,birth_date,marital_status,religion,address,rtrw,kelurahan,kecamatan,city,province,postal_code,phone,email,emergency_contact_name,emergency_contact_phone,emergency_contact_relation,bank_name,bank_account_number,bank_account_name,tax_number,bpjs_health_number,bpjs_employment_number,join_date,join_date_training,join_date_borong,permanent_date,resign_date,resign_reason,photo_file_id,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uid,employeeNumber,refs.typeId,refs.statusId,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.productionModuleSectionId,input.fullName,empty(input.nickname),empty(input.nationalIdNumber),empty(input.familyCardNumber),input.gender,empty(input.birthPlace),empty(input.birthDate),empty(input.maritalStatus),empty(input.religion),empty(input.address),empty(input.rtrw),empty(input.kelurahan),empty(input.kecamatan),empty(input.city),empty(input.province),empty(input.postalCode),empty(input.phone),empty(input.email),empty(input.emergencyContactName),empty(input.emergencyContactPhone),empty(input.emergencyContactRelation),empty(input.bankName),empty(input.bankAccountNumber),empty(input.bankAccountName),empty(input.taxNumber),empty(input.bpjsHealthNumber),empty(input.bpjsEmploymentNumber),input.joinDate,input.joinDateTraining ?? null,input.joinDateBorong ?? null,empty(input.permanentDate),empty(input.resignDate),empty(input.resignReason),photoId,empty(input.notes),auth.id,auth.id])
      const [created] = await conn.query<RowDataPacket[]>('SELECT id FROM employees WHERE uid=?', [uid])
      await conn.execute(`INSERT INTO employee_employment_histories(uid,employee_id,site_id,department_id,position_id,work_group_id,production_module_section_id,employee_type_id,employee_status_id,effective_from,change_type,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,'INITIAL',?,?,?)`, [randomUUID(),created[0].id,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.productionModuleSectionId,refs.typeId,refs.statusId,input.joinDate,'Penempatan awal.',auth.id,auth.id])
      await writeAudit({ auth, request: req, siteId: refs.siteId, action: 'CREATE', table: 'employees', recordId: created[0].id, recordUid: uid, description: `Membuat karyawan ${employeeNumber}.` }, conn)
      await conn.commit()
    } catch (error) {
      await conn.rollback()
      if (error instanceof EmployeeNumberSequenceExhaustedError) {
        throw new ApiError(422, error.message)
      }
      throw error
    } finally { conn.release() }
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})

employeesRouter.patch('/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = employeeInput.parse(req.body); const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid); const current = await employeeAccess(uid, auth); enforceSite(auth, input.site); const photoId = await fileId(input.photoUid)
    const joinDateTraining = input.joinDateTraining === undefined ? current.joinDateTraining : input.joinDateTraining
    const joinDateBorong = input.joinDateBorong === undefined ? current.joinDateBorong : input.joinDateBorong
    if (joinDateTraining && joinDateTraining < input.joinDate) throw new ApiError(422, 'Tanggal join training tidak boleh sebelum tanggal bergabung.')
    if (joinDateBorong && joinDateBorong < input.joinDate) throw new ApiError(422, 'Tanggal join borong tidak boleh sebelum tanggal bergabung.')
    await pool.execute(`UPDATE employees SET full_name=?,nickname=?,national_id_number=?,family_card_number=?,gender=?,birth_place=?,birth_date=?,marital_status=?,religion=?,address=?,rtrw=?,kelurahan=?,kecamatan=?,city=?,province=?,postal_code=?,phone=?,email=?,emergency_contact_name=?,emergency_contact_phone=?,emergency_contact_relation=?,bank_name=?,bank_account_number=?,bank_account_name=?,tax_number=?,bpjs_health_number=?,bpjs_employment_number=?,join_date=?,join_date_training=IF(?,?,join_date_training),join_date_borong=IF(?,?,join_date_borong),permanent_date=?,photo_file_id=?,notes=?,updated_by=? WHERE id=?`, [input.fullName,empty(input.nickname),empty(input.nationalIdNumber),empty(input.familyCardNumber),input.gender,empty(input.birthPlace),empty(input.birthDate),empty(input.maritalStatus),empty(input.religion),empty(input.address),empty(input.rtrw),empty(input.kelurahan),empty(input.kecamatan),empty(input.city),empty(input.province),empty(input.postalCode),empty(input.phone),empty(input.email),empty(input.emergencyContactName),empty(input.emergencyContactPhone),empty(input.emergencyContactRelation),empty(input.bankName),empty(input.bankAccountNumber),empty(input.bankAccountName),empty(input.taxNumber),empty(input.bpjsHealthNumber),empty(input.bpjsEmploymentNumber),input.joinDate,input.joinDateTraining !== undefined,input.joinDateTraining ?? null,input.joinDateBorong !== undefined,input.joinDateBorong ?? null,empty(input.permanentDate),photoId,empty(input.notes),auth.id,current.id])
    await writeAudit({ auth, request: req, siteId: current.siteId, action: 'UPDATE', table: 'employees', recordId: current.id, recordUid: uid, description: `Memperbarui karyawan ${current.employeeNumber}.` })
    res.status(204).end()
  } catch (error) { next(error) }
})

employeesRouter.get('/:uid/histories', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.uid); await employeeAccess(uid, res.locals.auth); const [rows] = await pool.query<RowDataPacket[]>(`SELECT h.uid,e.uid employeeUid,e.full_name employeeName,e.employee_number employeeNumber,s.code site,d.name department,p.name position,w.name workGroup,pm.uid productionModuleUid,pm.name productionModule,ps.uid productionSectionUid,ps.name productionSection,et.code employeeType,es.code employeeStatus,DATE_FORMAT(h.effective_from,'%Y-%m-%d') effectiveFrom,DATE_FORMAT(h.effective_to,'%Y-%m-%d') effectiveTo,h.change_type changeType,h.reference_number referenceNumber,h.reason,h.notes FROM employee_employment_histories h JOIN employees e ON e.id=h.employee_id JOIN sites s ON s.id=h.site_id LEFT JOIN departments d ON d.id=h.department_id LEFT JOIN positions p ON p.id=h.position_id LEFT JOIN work_groups w ON w.id=h.work_group_id LEFT JOIN production_module_sections pms ON pms.id=h.production_module_section_id LEFT JOIN production_modules pm ON pm.id=pms.production_module_id LEFT JOIN production_sections ps ON ps.id=pms.production_section_id JOIN employee_types et ON et.id=h.employee_type_id JOIN employee_statuses es ON es.id=h.employee_status_id WHERE e.uid=? ORDER BY h.effective_from DESC`, [uid]); res.json(rows) } catch (error) { next(error) }
})
employeesRouter.get('/:uid/scheduled-mutations', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.uid); await employeeAccess(uid, res.locals.auth); const [rows] = await pool.query<RowDataPacket[]>(`${scheduledMutationSelect} WHERE e.uid=? AND sm.status IN ('SCHEDULED','FAILED') ORDER BY sm.effective_from ASC`, [uid]); res.json(rows) } catch (error) { next(error) }
})
employeesRouter.get('/:uid/contracts', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.uid); await employeeAccess(uid, res.locals.auth); const [rows] = await pool.query<RowDataPacket[]>(`${contractSelect()} WHERE e.uid=? ORDER BY c.start_date DESC`, [uid]); res.json(rows.map(mapContract)) } catch (error) { next(error) }
})
employeesRouter.get('/:uid/documents', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.uid); await employeeAccess(uid, res.locals.auth); const [rows] = await pool.query<RowDataPacket[]>(`${documentSelect()} WHERE e.uid=? ORDER BY d.expiry_date`, [uid]); res.json(rows.map(mapDocument)) } catch (error) { next(error) }
})

employeesRouter.post('/:uid/mutations', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = mutationInput.parse(req.body); const today = businessDate(); if (input.effectiveFrom < today) throw new ApiError(422, 'Tanggal efektif mutasi tidak boleh lampau.'); if (input.effectiveFrom > today) throw new ApiError(422, 'Gunakan jadwalkan mutasi untuk tanggal masa depan.'); const auth = res.locals.auth as AuthContext; const employee = await employeeAccess(routeParam(req.params.uid), auth); enforceSite(auth, input.site); const refs = await references(input, employee.employeeStatus); const uid = randomUUID(); const conn = await pool.getConnection()
    try {
      await conn.beginTransaction(); const [openSchedules] = await conn.query<RowDataPacket[]>("SELECT id FROM scheduled_employee_mutations WHERE employee_id=? AND status IN ('SCHEDULED','FAILED') FOR UPDATE", [employee.id]); if (openSchedules[0]) throw new ApiError(409, 'Karyawan masih memiliki mutasi terjadwal yang belum diselesaikan.'); const [active] = await conn.query<RowDataPacket[]>("SELECT id,DATE_FORMAT(effective_from, '%Y-%m-%d') effectiveFrom FROM employee_employment_histories WHERE employee_id=? AND effective_to IS NULL FOR UPDATE", [employee.id])
      if (active[0] && input.effectiveFrom <= active[0].effectiveFrom) throw new ApiError(422, 'Tanggal efektif harus setelah histori aktif.')
      if (active[0]) await conn.execute('UPDATE employee_employment_histories SET effective_to=DATE_SUB(?,INTERVAL 1 DAY),updated_by=? WHERE id=?', [input.effectiveFrom,auth.id,active[0].id])
      await conn.execute(`INSERT INTO employee_employment_histories(uid,employee_id,site_id,department_id,position_id,work_group_id,production_module_section_id,employee_type_id,employee_status_id,effective_from,change_type,reference_number,reason,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uid,employee.id,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.productionModuleSectionId,refs.typeId,refs.statusId,input.effectiveFrom,input.changeType,empty(input.referenceNumber),empty(input.reason),empty(input.notes),auth.id,auth.id])
      await conn.execute('UPDATE employees SET employee_type_id=?,current_site_id=?,current_department_id=?,current_position_id=?,current_work_group_id=?,current_production_module_section_id=?,updated_by=? WHERE id=?', [refs.typeId,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.productionModuleSectionId,auth.id,employee.id])
      await writeAudit({ auth, request: req, siteId: refs.siteId, action: 'CREATE', table: 'employee_employment_histories', recordUid: uid, description: `Mencatat mutasi ${input.changeType}.` }, conn); await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})

employeesRouter.post('/:uid/scheduled-mutations', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = mutationInput.parse(req.body); const today = businessDate(); if (input.effectiveFrom <= today) throw new ApiError(422, 'Mutasi terjadwal harus memakai tanggal setelah hari ini.'); const auth = res.locals.auth as AuthContext; const employee = await employeeAccess(routeParam(req.params.uid), auth); enforceSite(auth, input.site); const refs = await references(input, employee.employeeStatus); const uid = randomUUID(); const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [open] = await conn.query<RowDataPacket[]>("SELECT id FROM scheduled_employee_mutations WHERE employee_id=? AND status IN ('SCHEDULED','FAILED') FOR UPDATE", [employee.id]); if (open[0]) throw new ApiError(409, 'Karyawan hanya dapat memiliki satu mutasi terjadwal yang belum diselesaikan.')
      const [active] = await conn.query<RowDataPacket[]>("SELECT id,DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom FROM employee_employment_histories WHERE employee_id=? AND effective_to IS NULL FOR UPDATE", [employee.id]); if (!active[0]) throw new ApiError(409, 'Histori penempatan aktif karyawan tidak ditemukan.'); if (input.effectiveFrom <= active[0].effectiveFrom) throw new ApiError(422, 'Tanggal efektif harus setelah histori aktif.')
      await conn.execute(`INSERT INTO scheduled_employee_mutations(uid,employee_id,base_history_id,target_site_id,target_department_id,target_position_id,target_work_group_id,target_production_module_section_id,target_employee_type_id,effective_from,change_type,reference_number,reason,notes,status,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'SCHEDULED',?,?)`, [uid,employee.id,active[0].id,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.productionModuleSectionId,refs.typeId,input.effectiveFrom,input.changeType,empty(input.referenceNumber),empty(input.reason),empty(input.notes),auth.id,auth.id])
      await writeAudit({ auth, request: req, siteId: refs.siteId, action: 'CREATE', table: 'scheduled_employee_mutations', recordUid: uid, description: `Menjadwalkan mutasi ${input.changeType} pada ${input.effectiveFrom}.` }, conn); await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})

employeesRouter.patch('/scheduled-mutations/:scheduledUid', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = mutationInput.parse(req.body); const today = businessDate(); if (input.effectiveFrom <= today) throw new ApiError(422, 'Jadwal mutasi harus memakai tanggal setelah hari ini.'); const auth = res.locals.auth as AuthContext; const scheduleUid = routeParam(req.params.scheduledUid); const [existingRows] = await pool.query<RowDataPacket[]>(`SELECT sm.id,sm.employee_id employeeId,e.uid employeeUid,es.code employeeStatus,s.code sourceSite FROM scheduled_employee_mutations sm JOIN employees e ON e.id=sm.employee_id JOIN employee_statuses es ON es.id=e.employee_status_id JOIN sites s ON s.id=e.current_site_id WHERE sm.uid=?`, [scheduleUid]); const existing=existingRows[0]; if (!existing) throw new ApiError(404,'Mutasi terjadwal tidak ditemukan.'); enforceSite(auth,existing.sourceSite); enforceSite(auth,input.site); const refs=await references(input,existing.employeeStatus); const conn=await pool.getConnection()
    try { await conn.beginTransaction(); const [locked] = await conn.query<RowDataPacket[]>("SELECT id,status FROM scheduled_employee_mutations WHERE id=? FOR UPDATE",[existing.id]); if (!locked[0] || !['SCHEDULED','FAILED'].includes(locked[0].status)) throw new ApiError(409,'Mutasi terjadwal ini tidak dapat diubah.'); const [active] = await conn.query<RowDataPacket[]>("SELECT id,DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom FROM employee_employment_histories WHERE employee_id=? AND effective_to IS NULL FOR UPDATE",[existing.employeeId]); if(!active[0]) throw new ApiError(409,'Histori penempatan aktif karyawan tidak ditemukan.'); if(input.effectiveFrom<=active[0].effectiveFrom) throw new ApiError(422,'Tanggal efektif harus setelah histori aktif.'); await conn.execute(`UPDATE scheduled_employee_mutations SET base_history_id=?,target_site_id=?,target_department_id=?,target_position_id=?,target_work_group_id=?,target_production_module_section_id=?,target_employee_type_id=?,effective_from=?,change_type=?,reference_number=?,reason=?,notes=?,status='SCHEDULED',failure_reason=NULL,updated_by=? WHERE id=?`,[active[0].id,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.productionModuleSectionId,refs.typeId,input.effectiveFrom,input.changeType,empty(input.referenceNumber),empty(input.reason),empty(input.notes),auth.id,existing.id]); await writeAudit({auth,request:req,siteId:refs.siteId,action:'UPDATE',table:'scheduled_employee_mutations',recordUid:scheduleUid,description:`Memperbarui jadwal mutasi menjadi ${input.effectiveFrom}.`},conn); await conn.commit() } catch(error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(204).end()
  } catch(error) { next(error) }
})

employeesRouter.post('/scheduled-mutations/:scheduledUid/cancel', requirePermission('employees.manage'), async (req,res,next) => {
  try { const auth=res.locals.auth as AuthContext; const scheduleUid=routeParam(req.params.scheduledUid); const conn=await pool.getConnection(); try { await conn.beginTransaction(); const [rows]=await conn.query<RowDataPacket[]>(`SELECT sm.id,sm.status,e.current_site_id siteId,s.code site FROM scheduled_employee_mutations sm JOIN employees e ON e.id=sm.employee_id JOIN sites s ON s.id=e.current_site_id WHERE sm.uid=? FOR UPDATE`,[scheduleUid]); const schedule=rows[0]; if(!schedule) throw new ApiError(404,'Mutasi terjadwal tidak ditemukan.'); enforceSite(auth,schedule.site); if(!['SCHEDULED','FAILED'].includes(schedule.status)) throw new ApiError(409,'Mutasi terjadwal ini tidak dapat dibatalkan.'); await conn.execute("UPDATE scheduled_employee_mutations SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP(3),updated_by=? WHERE id=?",[auth.id,schedule.id]); await writeAudit({auth,request:req,siteId:schedule.siteId,action:'UPDATE',table:'scheduled_employee_mutations',recordUid:scheduleUid,description:'Membatalkan mutasi terjadwal.'},conn); await conn.commit() } catch(error) { await conn.rollback(); throw error } finally {conn.release()} res.status(204).end() } catch(error){next(error)}
})

employeesRouter.post('/:uid/contracts', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = contractCreateInput.parse(req.body); const auth = res.locals.auth as AuthContext; const uid = randomUUID(); const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [employees] = await conn.query<RowDataPacket[]>('SELECT e.id,e.employee_number employeeNumber,DATE_FORMAT(e.join_date,\'%Y-%m-%d\') joinDate,s.id siteId,s.code site,p.name position FROM employees e JOIN sites s ON s.id=e.current_site_id LEFT JOIN positions p ON p.id=e.current_position_id WHERE e.uid=? FOR UPDATE', [routeParam(req.params.uid)])
      const employee = employees[0]
      if (!employee) throw new ApiError(404, 'Karyawan tidak ditemukan.')
      enforceSite(auth, employee.site)
      const [contractTypes] = await conn.query<RowDataPacket[]>('SELECT id,code FROM contract_types WHERE code=? AND is_active=1 FOR UPDATE', [input.contractType])
      const contractType = contractTypes[0]
      if (!contractType) throw new ApiError(422, 'Tipe kontrak tidak valid atau tidak aktif.')
      const [sequences] = await conn.query<RowDataPacket[]>('SELECT COALESCE(MAX(sequence_number), 0) + 1 nextSequence FROM employee_contracts WHERE employee_id=?', [employee.id])
      const sequenceNumber = Number(sequences[0]?.nextSequence ?? 1)
      const contractNumber = formatContractNumber(contractType.code, employee.employeeNumber, sequenceNumber)
      await assertContractRules(conn, employee.id, contractType.code, input.startDate, input.endDate, undefined, employee.joinDate)
      await conn.execute(`INSERT INTO employee_contracts(uid,employee_id,contract_number,contract_type_id,sequence_number,start_date,end_date,signed_date,status,position_name_snapshot,site_name_snapshot,issued_file_id,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uid,employee.id,contractNumber,contractType.id,sequenceNumber,input.startDate,empty(input.endDate),empty(input.signedDate),'DRAFT',employee.position,`Site ${employee.site}`,await fileId(input.issuedFileUid),empty(input.notes),auth.id,auth.id])
      await writeAudit({ auth, request: req, siteId: employee.siteId, action: 'CREATE', table: 'employee_contracts', recordUid: uid, description: `Menambah kontrak ${contractNumber}.` }, conn)
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})
employeesRouter.patch('/contracts/:contractUid', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = contractUpdateInput.parse(req.body)
    const auth = res.locals.auth as AuthContext
    const contractUid = routeParam(req.params.contractUid)
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [rows] = await conn.query<RowDataPacket[]>(`SELECT c.id,c.uid,c.employee_id,c.contract_number,c.sequence_number,c.status,ct.code contractType,DATE_FORMAT(e.join_date,'%Y-%m-%d') joinDate,s.id siteId,s.code site FROM employee_contracts c JOIN contract_types ct ON ct.id=c.contract_type_id JOIN employees e ON e.id=c.employee_id JOIN sites s ON s.id=e.current_site_id WHERE c.uid=? FOR UPDATE`, [contractUid])
      const contract = rows[0]
      if (!contract) throw new ApiError(404, 'Kontrak tidak ditemukan.')
      enforceSite(auth, contract.site)
      if (['EXPIRED', 'TERMINATED', 'CANCELLED'].includes(contract.status)) throw new ApiError(409, 'Kontrak final tidak dapat diubah.')
      if (contract.status === 'ACTIVE' && input.contractType !== contract.contractType) throw new ApiError(422, 'Jenis kontrak aktif tidak dapat diubah.')
      const [types] = await conn.query<RowDataPacket[]>('SELECT id,code FROM contract_types WHERE code=? AND is_active=1 FOR UPDATE', [input.contractType])
      const type = types[0]
      if (!type) throw new ApiError(422, 'Tipe kontrak tidak valid atau tidak aktif.')
      await assertContractRules(conn, contract.employee_id, type.code, input.startDate, input.endDate, contract.id, contract.joinDate)
      const contractNumber = contract.status === 'ACTIVE' ? contract.contract_number : formatContractNumber(type.code, (await conn.query<RowDataPacket[]>('SELECT employee_number employeeNumber FROM employees WHERE id=? FOR UPDATE', [contract.employee_id]))[0][0].employeeNumber, contract.sequence_number)
      await conn.execute('UPDATE employee_contracts SET contract_number=?,contract_type_id=?,start_date=?,end_date=?,signed_date=?,issued_file_id=?,notes=?,updated_by=? WHERE id=?', [contractNumber,type.id,input.startDate,empty(input.endDate),empty(input.signedDate),await fileId(input.issuedFileUid),empty(input.notes),auth.id,contract.id])
      await synchronizeActiveContractAfterEdit(conn,{ id: contract.id, uid: contract.uid, employeeId: contract.employee_id, siteId: contract.siteId, status: contract.status, startDate: input.startDate, endDate: input.endDate },auth)
      await writeAudit({ auth, request:req, siteId:contract.siteId, action:'UPDATE', table:'employee_contracts', recordId:contract.id, recordUid:contractUid, description:`Memperbarui kontrak ${contractNumber}.`},conn)
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(204).end()
  } catch (error) { next(error) }
})
employeesRouter.post('/contracts/:contractUid/:action', requirePermission('employees.manage'), async (req,res,next)=>{ try { const action=z.enum(['schedule','activate','terminate','resign','cancel']).parse(req.params.action); const input=z.object({effectiveDate:z.string().date().optional(),reason:z.string().trim().min(1).max(500).optional()}).parse(req.body); res.json(await transitionContract(routeParam(req.params.contractUid),action,input,res.locals.auth)) }catch(error){next(error)} })
employeesRouter.post('/:uid/documents', requirePermission('documents.manage'), async (req, res, next) => {
  try { const input = documentInput.parse(req.body); const auth = res.locals.auth as AuthContext; const employee = await employeeAccess(routeParam(req.params.uid), auth); const uid = randomUUID(); await pool.execute('INSERT INTO employee_documents(uid,employee_id,document_type,document_number,name,file_id,issued_date,expiry_date,status,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [uid,employee.id,input.documentType,empty(input.documentNumber),input.name,await fileId(input.fileUid),empty(input.issuedDate),empty(input.expiryDate),input.status,empty(input.notes),auth.id,auth.id]); await writeAudit({ auth, request: req, siteId: employee.siteId, action: 'CREATE', table: 'employee_documents', recordUid: uid, description: `Menambah dokumen ${input.name}.` }); res.status(201).json({ uid }) } catch (error) { next(error) }
})
employeesRouter.patch('/documents/:documentUid', requirePermission('documents.manage'), async (req, res, next) => {
  try { const input = documentInput.parse(req.body); const auth = res.locals.auth as AuthContext; const documentUid = routeParam(req.params.documentUid); const [rows] = await pool.query<RowDataPacket[]>('SELECT d.id,s.id siteId,s.code site FROM employee_documents d JOIN employees e ON e.id=d.employee_id JOIN sites s ON s.id=e.current_site_id WHERE d.uid=?', [documentUid]); if (!rows[0]) throw new ApiError(404, 'Dokumen tidak ditemukan.'); enforceSite(auth, rows[0].site); await pool.execute('UPDATE employee_documents SET document_type=?,document_number=?,name=?,file_id=?,issued_date=?,expiry_date=?,status=?,notes=?,updated_by=? WHERE id=?', [input.documentType,empty(input.documentNumber),input.name,await fileId(input.fileUid),empty(input.issuedDate),empty(input.expiryDate),input.status,empty(input.notes),auth.id,rows[0].id]); await writeAudit({ auth, request: req, siteId: rows[0].siteId, action: 'UPDATE', table: 'employee_documents', recordId: rows[0].id, recordUid: documentUid, description: `Memperbarui dokumen ${input.name}.` }); res.status(204).end() } catch (error) { next(error) }
})

function contractFrom() { return `FROM employee_contracts c JOIN contract_types ct ON ct.id=c.contract_type_id JOIN employees e ON e.id=c.employee_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN files f ON f.id=c.issued_file_id` }
function contractSelect() { return `SELECT c.uid,e.uid employeeUid,e.full_name employeeName,s.code site,c.contract_number contractNumber,ct.code contractType,c.sequence_number sequenceNumber,DATE_FORMAT(c.start_date,'%Y-%m-%d') startDate,DATE_FORMAT(c.end_date,'%Y-%m-%d') endDate,DATE_FORMAT(c.signed_date,'%Y-%m-%d') signedDate,c.status,DATE_FORMAT(c.terminated_at,'%Y-%m-%d') terminatedAt,c.termination_reason terminationReason,c.position_name_snapshot positionNameSnapshot,c.site_name_snapshot siteNameSnapshot,c.salary_or_rate_notes salaryOrRateNotes,c.notes,f.uid issuedFileUid,f.original_name issuedFileName,f.mime_type issuedFileMimeType,f.size_bytes issuedFileSizeBytes,f.extension issuedFileExtension,f.storage_path issuedFilePath ${contractFrom()}` }
function mapContract(row: RowDataPacket) { const { issuedFileUid, issuedFileName, issuedFileMimeType, issuedFileSizeBytes, issuedFileExtension, issuedFilePath, employeeName, site, ...contract } = row; return { ...contract, employeeName, site, issuedFile: issuedFileUid ? { uid: issuedFileUid, originalName: issuedFileName, mimeType: issuedFileMimeType, sizeBytes: Number(issuedFileSizeBytes), extension: issuedFileExtension, url: fileUrl(issuedFilePath) } : undefined } }
function documentFrom() { return `FROM employee_documents d JOIN employees e ON e.id=d.employee_id JOIN sites s ON s.id=e.current_site_id JOIN files f ON f.id=d.file_id` }
function documentSelect() { return `SELECT d.uid,e.uid employeeUid,e.full_name employeeName,s.code site,d.document_type documentType,d.document_number documentNumber,d.name,DATE_FORMAT(d.issued_date,'%Y-%m-%d') issuedDate,DATE_FORMAT(d.expiry_date,'%Y-%m-%d') expiryDate,d.status,d.notes,f.uid fileUid,f.original_name originalName,f.mime_type mimeType,f.size_bytes sizeBytes,f.extension,f.storage_path filePath ${documentFrom()}` }
function mapDocument(row: RowDataPacket) { const { fileUid, originalName, mimeType, sizeBytes, extension, filePath, employeeName, site, ...document } = row; return { ...document, employeeName, site, file: { uid: fileUid, originalName, mimeType, sizeBytes: Number(sizeBytes), extension, url: fileUrl(filePath) } } }
