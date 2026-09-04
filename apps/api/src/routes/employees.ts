import { randomUUID } from 'node:crypto'
import { Router, type Request } from 'express'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
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
  assertNoOpenScheduledStatusChange,
  businessDate,
  cancelActiveContractActivation,
  closeExpiredContractEmployeeStatus,
  resolveActiveContractConflict,
  synchronizeActiveContractAfterEdit,
  transitionContract,
} from '../lib/contract-lifecycle.js'
import { runContractsReconcile } from '../lib/cron-reconcile.js'
import {
  assertScheduledStatusWithinContract,
  cronConflict,
  paginationMeta,
} from '../lib/contract-lifecycle-policy.js'
import {
  contractEmployeeTypeRuleMessage,
  contractTypeRuleMessage,
  isContractEmployeeTypeCombinationAllowed,
  isContractTypeAllowed,
} from '../lib/employee-contract-policy.js'
import {
  acquireContractNumberLock,
  canPreserveContractNumberSequence,
  contractNumberSiteFromSnapshot,
  formatContractNumber,
  nextContractNumberSequence,
  releaseContractNumberLock,
} from '../lib/contract-number.js'
import { authenticate, requirePermission, type AuthContext } from '../middleware/authenticate.js'
import { employeeIdCardsRouter } from './employee-id-cards.js'
import { employeeSummaryRouter } from './employee-summary.js'
import { reconcileProductionAssignmentsAtEmploymentBoundary } from '../lib/production-assignment-lifecycle.js'

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
const employeeInputShape = {
  fullName: z.string().trim().min(2), nickname: optional,
  employeeType: z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']), employeeStatus: z.enum(['ACTIVE', 'RESIGNED', 'INACTIVE', 'LEAVE']), site: siteCode,
  department: optional, position: optional, workGroup: optional, productionModuleSectionUid: z.string().uuid().optional(), joinDate: z.string().date(), permanentDate: optionalDate,
  resignDate: optionalDate, resignReason: optional, gender: z.enum(['LAKI-LAKI', 'PEREMPUAN', 'MALE', 'FEMALE']), birthPlace: optional, birthDate: optionalDate,
  maritalStatus: z.enum(['BELUM_KAWIN', 'KAWIN', 'CERAI_HIDUP', 'CERAI_MATI', 'SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(), religion: optional, address: optional, rtrw: optionalRtrw, kelurahan: optional, kecamatan: optional, city: optional, province: optional,
  postalCode: optional, phone: optional, email: optionalEmail, emergencyContactName: optional, emergencyContactPhone: optional, emergencyContactRelation: optional,
  nationalIdNumber: optional, familyCardNumber: optional, taxNumber: optional, bankName: optional, bankAccountNumber: optional, bankAccountName: optional,
  bpjsHealthNumber: optional, bpjsEmploymentNumber: optional, photoUid: z.string().uuid().optional(), notes: optional,
  joinDateTraining: apiOptionalDate, joinDateBorong: apiOptionalDate,
}
const employeeInput = z.object(employeeInputShape).strict()
  .refine((value) => !value.joinDateTraining || value.joinDateTraining >= value.joinDate, { path: ['joinDateTraining'], message: 'Tanggal join training tidak boleh sebelum tanggal bergabung.' })
  .refine((value) => !value.joinDateBorong || value.joinDateBorong >= value.joinDate, { path: ['joinDateBorong'], message: 'Tanggal join borong tidak boleh sebelum tanggal bergabung.' })
const {
  employeeStatus: _employeeStatus,
  photoUid: _photoUid,
  productionModuleSectionUid: _productionModuleSectionUid,
  ...employeeImportShape
} = employeeInputShape
const employeeImportRowInput = z
  .object({
    ...employeeImportShape,
    employeeType: z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']),
    departmentCode: optional,
    positionCode: optional,
    workGroupCode: optional,
    productionModuleCode: optional,
    productionSectionCode: optional,
  })
  .strict()
const employeeImportInput = z.object({
  items: z.array(z.unknown()).min(1, 'File tidak memiliki baris data.').max(200, 'Satu file maksimal 200 karyawan.'),
})
const mutationInput = z.object({
  site: siteCode, department: optional, position: optional, workGroup: optional, productionModuleSectionUid: z.string().uuid().optional(), employeeType: z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']),
  effectiveFrom: z.string().date(),
  changeType: z.enum(['TRANSFER', 'PROMOTION', 'DEMOTION', 'DEPARTMENT_CHANGE', 'TYPE_CHANGE', 'GROUP_CHANGE', 'PRODUCTION_ASSIGNMENT_CHANGE', 'OTHER']), referenceNumber: optional, reason: optional, notes: optional,
})
const registrationCorrectionInput = z.object({
  site: siteCode,
  joinDate: z.string().date(),
  department: optional,
  position: optional,
  workGroup: optional,
  productionModuleSectionUid: z.string().uuid().optional(),
  employeeType: z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING']),
  reason: z.string().trim().min(3, 'Alasan koreksi wajib diisi.'),
})
const mutationBatchInput = z
  .object({
    items: z
      .array(z.object({ employeeUid: z.string().uuid(), input: mutationInput }))
      .min(1, 'Pilih minimal satu karyawan.')
      .max(25, 'Satu batch maksimal 25 karyawan.'),
  })
  .superRefine(({ items }, context) => {
    const seen = new Set<string>()
    items.forEach((item, index) => {
      if (seen.has(item.employeeUid)) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'employeeUid'],
          message: 'Karyawan tidak boleh dipilih lebih dari sekali.',
        })
      }
      seen.add(item.employeeUid)
    })
  })
const contractFields = {
  contractType: z.string().trim().min(1),
  startDate: z.string().date(), endDate: optionalDate, signedDate: optionalDate,
  issuedFileUid: z.string().uuid().optional(), notes: optional,
}
const contractCreateInput = z.object(contractFields).refine((value) => !value.endDate || value.endDate >= value.startDate, { message: 'Tanggal kontrak tidak valid.', path: ['endDate'] })
const contractUpdateInput = z.object(contractFields).strict()
  .refine((value) => !value.endDate || value.endDate >= value.startDate, { message: 'Tanggal kontrak tidak valid.', path: ['endDate'] })
const contractBatchInput = z
  .object({
    items: z
      .array(
        z.object({
          employeeUid: z.string().uuid(),
          input: z
            .object({
              contractType: z.string().trim().min(1),
              startDate: z.string().date(),
              endDate: optionalDate,
              notes: optional,
            })
            .refine((value) => !value.endDate || value.endDate >= value.startDate, {
              message: 'Tanggal kontrak tidak valid.',
              path: ['endDate'],
            }),
        })
      )
      .min(1, 'Pilih minimal satu karyawan.')
      .max(25, 'Satu batch maksimal 25 karyawan.'),
  })
  .superRefine(({ items }, context) => {
    const seen = new Set<string>()
    items.forEach((item, index) => {
      if (seen.has(item.employeeUid)) {
        context.addIssue({
          code: 'custom',
          path: ['items', index, 'employeeUid'],
          message: 'Karyawan tidak boleh dipilih lebih dari sekali.',
        })
      }
      seen.add(item.employeeUid)
    })
  })
const documentInput = z.object({
  documentType: z.string().trim().min(1), documentNumber: optional, name: z.string().trim().min(1), fileUid: z.string().uuid(),
  issuedDate: optionalDate, expiryDate: optionalDate, status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED']), notes: optional,
}).refine((value) => !value.issuedDate || !value.expiryDate || value.expiryDate >= value.issuedDate, { message: 'Tanggal dokumen tidak valid.', path: ['expiryDate'] })
const scheduledStatusChangeInput = z.object({
  action: z.enum(['TERMINATE', 'RESIGN']),
  effectiveDate: z.string().date(),
  reason: z.string().trim().min(1, 'Alasan wajib diisi.').max(500),
})
const printSnapshotsInput = z.object({
  contractUids: z.array(z.string().uuid()).min(1).max(50),
})

const registrationCorrectionEligibilitySql = `(
  es.code='INACTIVE'
  AND NOT EXISTS (SELECT 1 FROM employee_contracts c WHERE c.employee_id=e.id AND c.status<>'CANCELLED')
  AND NOT EXISTS (SELECT 1 FROM scheduled_employee_mutations sm WHERE sm.employee_id=e.id AND sm.status IN ('SCHEDULED','FAILED'))
  AND NOT EXISTS (SELECT 1 FROM scheduled_employee_status_changes sc WHERE sc.employee_id=e.id AND sc.status IN ('SCHEDULED','FAILED'))
  AND NOT EXISTS (SELECT 1 FROM attendance_records ar WHERE ar.employee_id=e.id)
  AND NOT EXISTS (SELECT 1 FROM attendance_scan_events ase WHERE ase.employee_id=e.id)
  AND NOT EXISTS (SELECT 1 FROM attendance_classification_requests acr WHERE acr.employee_id=e.id)
  AND NOT EXISTS (SELECT 1 FROM employee_shift_assignments esa WHERE esa.employee_id=e.id)
  AND NOT EXISTS (SELECT 1 FROM production_transactions pt WHERE pt.employee_id=e.id)
  AND NOT EXISTS (SELECT 1 FROM employee_job_assignments pja WHERE pja.employee_id=e.id)
  AND NOT EXISTS (SELECT 1 FROM employee_salary_histories sh WHERE sh.employee_id=e.id)
  AND NOT EXISTS (SELECT 1 FROM employee_daily_rate_histories dr WHERE dr.employee_id=e.id)
  AND NOT EXISTS (SELECT 1 FROM employee_payroll_components pc WHERE pc.employee_id=e.id)
  AND NOT EXISTS (SELECT 1 FROM payroll_period_manual_components pmc WHERE pmc.employee_id=e.id)
  AND NOT EXISTS (SELECT 1 FROM payroll_employee_results pr WHERE pr.employee_id=e.id)
  AND NOT EXISTS (SELECT 1 FROM generated_documents gd WHERE gd.employee_id=e.id)
  AND (SELECT COUNT(*) FROM employee_employment_histories h WHERE h.employee_id=e.id)=1
  AND EXISTS (SELECT 1 FROM employee_employment_histories h WHERE h.employee_id=e.id AND h.change_type='INITIAL' AND h.effective_to IS NULL)
)`
const employeeSelect = `SELECT e.uid,e.employee_number employeeNumber,e.barcode,e.full_name fullName,e.nickname,et.code employeeType,es.code employeeStatus,s.code site,d.name department,p.name position,w.name workGroup,pms.uid productionModuleSectionUid,pm.uid productionModuleUid,pm.code productionModuleCode,pm.name productionModule,ps.uid productionSectionUid,ps.code productionSectionCode,ps.name productionSection,DATE_FORMAT(e.join_date,'%Y-%m-%d') joinDate,DATE_FORMAT(e.join_date_training,'%Y-%m-%d') joinDateTraining,DATE_FORMAT(e.join_date_borong,'%Y-%m-%d') joinDateBorong,DATE_FORMAT(e.permanent_date,'%Y-%m-%d') permanentDate,DATE_FORMAT(e.resign_date,'%Y-%m-%d') resignDate,e.resign_reason resignReason,e.gender,e.birth_place birthPlace,DATE_FORMAT(e.birth_date,'%Y-%m-%d') birthDate,e.marital_status maritalStatus,e.religion,e.address,e.rtrw,e.kelurahan,e.kecamatan,e.city,e.province,e.postal_code postalCode,e.phone,e.email,e.emergency_contact_name emergencyContactName,e.emergency_contact_phone emergencyContactPhone,e.emergency_contact_relation emergencyContactRelation,e.national_id_number nationalIdNumber,e.family_card_number familyCardNumber,e.tax_number taxNumber,e.bank_name bankName,e.bank_account_number bankAccountNumber,e.bank_account_name bankAccountName,e.bpjs_health_number bpjsHealthNumber,e.bpjs_employment_number bpjsEmploymentNumber,e.notes,${registrationCorrectionEligibilitySql} canCorrectRegistration,f.uid photoUid,f.original_name photoName,f.mime_type photoMimeType,f.size_bytes photoSizeBytes,f.extension photoExtension,f.storage_path photoPath FROM employees e JOIN employee_types et ON et.id=e.employee_type_id JOIN employee_statuses es ON es.id=e.employee_status_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN departments d ON d.id=e.current_department_id LEFT JOIN positions p ON p.id=e.current_position_id LEFT JOIN work_groups w ON w.id=e.current_work_group_id LEFT JOIN production_module_sections pms ON pms.id=e.current_production_module_section_id LEFT JOIN production_modules pm ON pm.id=pms.production_module_id LEFT JOIN production_sections ps ON ps.id=pms.production_section_id LEFT JOIN files f ON f.id=e.photo_file_id`
const empty = (value?: string) => value?.trim() || null
function enforceSite(auth: AuthContext, site: string) { if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) throw new ApiError(403, 'Akses site ditolak.') }
function mapEmployee(row: RowDataPacket) {
  const { photoUid, photoName, photoMimeType, photoSizeBytes, photoExtension, photoPath, ...employee } = row
  return { ...employee, canCorrectRegistration: Boolean(employee.canCorrectRegistration), photo: photoUid ? { uid: photoUid, originalName: photoName, mimeType: photoMimeType, sizeBytes: Number(photoSizeBytes), extension: photoExtension, url: fileUrl(photoPath) } : undefined }
}
const fileUrl = (path?: string) => path ? `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${path}` : undefined
async function references(input: z.infer<typeof employeeInput> | z.infer<typeof mutationInput> | z.infer<typeof registrationCorrectionInput>, employeeStatus: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id siteId,s.employee_number_prefix employeeNumberPrefix,(SELECT id FROM departments WHERE site_id=s.id AND name=? AND is_active=1 LIMIT 1) departmentId,(SELECT id FROM positions WHERE name=? AND is_active=1 LIMIT 1) positionId,(SELECT id FROM work_groups WHERE site_id=s.id AND name=? AND is_active=1 LIMIT 1) workGroupId,(SELECT id FROM employee_types WHERE code=? AND is_active=1 LIMIT 1) typeId,(SELECT id FROM employee_statuses WHERE code=? LIMIT 1) statusId FROM sites s WHERE s.code=? AND s.is_active=1 LIMIT 1`,
    [empty(input.department), empty(input.position), empty(input.workGroup), input.employeeType, employeeStatus, input.site]
  )
  if (!rows[0]?.siteId || !rows[0].typeId || !rows[0].statusId || !rows[0].employeeNumberPrefix) throw new ApiError(422, 'Referensi penempatan tidak valid.')
  if (!input.productionModuleSectionUid) throw new ApiError(422, 'Modul dan Bagian produksi wajib dipilih.')
  const [assignments] = await pool.query<RowDataPacket[]>(`SELECT pms.id FROM production_module_sections pms JOIN production_modules pm ON pm.id=pms.production_module_id JOIN production_sections ps ON ps.id=pms.production_section_id JOIN sites s ON s.id=pm.site_id WHERE pms.uid=? AND s.code=? AND pms.is_active=1 AND pm.is_active=1 AND ps.is_active=1`, [input.productionModuleSectionUid, input.site])
  if (!assignments[0]) throw new ApiError(422, 'Pasangan Modul dan Bagian tidak valid untuk site tersebut.')
  return { ...rows[0], productionModuleSectionId: assignments[0].id } as RowDataPacket
}

type ImportPreviewRow = {
  rowNumber: number
  fullName?: string
  employeeType?: string
  site?: string
  valid: boolean
  issues: string[]
  input?: z.infer<typeof employeeInput>
}

async function normalizeImportEmployee(
  raw: z.infer<typeof employeeImportRowInput>,
  auth: AuthContext
) {
  enforceSite(auth, raw.site)
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.code site,
      d.name department,
      p.name position,
      w.name workGroup,
      pms.uid productionModuleSectionUid
     FROM sites s
     LEFT JOIN departments d ON d.site_id=s.id AND d.code=? AND d.is_active=1
     LEFT JOIN positions p ON p.code=? AND p.is_active=1
     LEFT JOIN work_groups w ON w.site_id=s.id AND w.code=? AND w.is_active=1
     LEFT JOIN production_modules pm ON pm.site_id=s.id AND pm.code=? AND pm.is_active=1
     LEFT JOIN production_sections ps ON ps.code=? AND ps.is_active=1
     LEFT JOIN production_module_sections pms ON pms.production_module_id=pm.id AND pms.production_section_id=ps.id AND pms.is_active=1
     WHERE s.code=? AND s.is_active=1
     LIMIT 1`,
    [
      raw.departmentCode ?? '__EMPTY__',
      raw.positionCode ?? '__EMPTY__',
      raw.workGroupCode ?? '__EMPTY__',
      raw.productionModuleCode ?? '__EMPTY__',
      raw.productionSectionCode ?? '__EMPTY__',
      raw.site,
    ]
  )
  const refs = rows[0]
  if (!refs) throw new ApiError(422, 'Site tidak aktif atau tidak ditemukan.')
  if (raw.departmentCode && !refs.department) throw new ApiError(422, 'Kode departemen tidak valid untuk site ini.')
  if (raw.positionCode && !refs.position) throw new ApiError(422, 'Kode jabatan tidak valid.')
  if (raw.workGroupCode && !refs.workGroup) throw new ApiError(422, 'Kode kelompok kerja tidak valid untuk site ini.')
  if (!raw.productionModuleCode || !raw.productionSectionCode) {
    throw new ApiError(422, 'Kode modul dan bagian produksi wajib diisi.')
  }
  if (!refs.productionModuleSectionUid) {
    throw new ApiError(422, 'Pasangan kode modul dan bagian produksi tidak valid untuk site ini.')
  }
  const {
    departmentCode: _departmentCode,
    positionCode: _positionCode,
    workGroupCode: _workGroupCode,
    productionModuleCode: _productionModuleCode,
    productionSectionCode: _productionSectionCode,
    department: _department,
    position: _position,
    workGroup: _workGroup,
    ...values
  } = raw
  return employeeInput.parse({
    ...values,
    employeeStatus: 'INACTIVE',
    department: refs.department ?? undefined,
    position: refs.position ?? undefined,
    workGroup: refs.workGroup ?? undefined,
    productionModuleSectionUid: refs.productionModuleSectionUid,
  })
}

function issueMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join(' ')
  }
  return 'Data baris tidak dapat divalidasi.'
}

async function validateEmployeeImport(
  items: unknown[],
  auth: AuthContext
): Promise<ImportPreviewRow[]> {
  const rows: ImportPreviewRow[] = []
  for (const [index, item] of items.entries()) {
    const parsed = employeeImportRowInput.safeParse(item)
    const base = typeof item === 'object' && item ? item as Record<string, unknown> : {}
    const row: ImportPreviewRow = {
      rowNumber: index + 2,
      fullName: typeof base.fullName === 'string' ? base.fullName : undefined,
      employeeType: typeof base.employeeType === 'string' ? base.employeeType : undefined,
      site: typeof base.site === 'string' ? base.site : undefined,
      valid: false,
      issues: [],
    }
    if (!parsed.success) {
      row.issues = parsed.error.issues.map((issue) => issue.message)
      rows.push(row)
      continue
    }
    try {
      row.input = await normalizeImportEmployee(parsed.data, auth)
      row.fullName = row.input.fullName
      row.employeeType = row.input.employeeType
      row.site = row.input.site
      row.valid = true
    } catch (error) {
      row.issues = [issueMessage(error)]
    }
    rows.push(row)
  }

  const markDuplicate = (value: string | undefined, field: 'nationalIdNumber' | 'email', message: string) => {
    if (!value) return
    const matches = rows.filter((row) => row.input?.[field]?.toLowerCase() === value.toLowerCase())
    if (matches.length > 1) matches.forEach((row) => { row.valid = false; row.issues.push(message) })
  }
  rows.forEach((row) => {
    markDuplicate(row.input?.nationalIdNumber, 'nationalIdNumber', 'NIK duplikat dalam file.')
    markDuplicate(row.input?.email, 'email', 'Email duplikat dalam file.')
  })

  const nationalIds = [...new Set(rows.flatMap((row) => row.input?.nationalIdNumber ? [row.input.nationalIdNumber] : []))]
  const emails = [...new Set(rows.flatMap((row) => row.input?.email ? [row.input.email.toLowerCase()] : []))]
  if (nationalIds.length || emails.length) {
    const where: string[] = []
    const params: string[] = []
    if (nationalIds.length) { where.push(`national_id_number IN (${nationalIds.map(() => '?').join(',')})`); params.push(...nationalIds) }
    if (emails.length) { where.push(`email IN (${emails.map(() => '?').join(',')})`); params.push(...emails) }
    const [existing] = await pool.query<RowDataPacket[]>(`SELECT national_id_number nationalIdNumber,email FROM employees WHERE ${where.join(' OR ')}`, params)
    const existingNiks = new Set(existing.map((row) => row.nationalIdNumber).filter(Boolean))
    const existingEmails = new Set(existing.map((row) => String(row.email ?? '').toLowerCase()).filter(Boolean))
    rows.forEach((row) => {
      if (row.input?.nationalIdNumber && existingNiks.has(row.input.nationalIdNumber)) { row.valid = false; row.issues.push('NIK sudah digunakan.') }
      if (row.input?.email && existingEmails.has(row.input.email.toLowerCase())) { row.valid = false; row.issues.push('Email sudah digunakan.') }
    })
  }
  return rows
}

async function createEmployeeInTransaction(
  conn: PoolConnection,
  input: z.infer<typeof employeeInput>,
  auth: AuthContext,
  request: Request
) {
  enforceSite(auth, input.site)
  const refs = await references(input, 'INACTIVE')
  const uid = randomUUID()
  const employeeNumber = await reserveEmployeeNumber(conn, {
    siteId: Number(refs.siteId),
    prefix: String(refs.employeeNumberPrefix),
    joinDate: input.joinDate,
  })
  await conn.execute(`INSERT INTO employees(uid,employee_number,employee_type_id,employee_status_id,current_site_id,current_department_id,current_position_id,current_work_group_id,current_production_module_section_id,full_name,nickname,national_id_number,family_card_number,gender,birth_place,birth_date,marital_status,religion,address,rtrw,kelurahan,kecamatan,city,province,postal_code,phone,email,emergency_contact_name,emergency_contact_phone,emergency_contact_relation,bank_name,bank_account_number,bank_account_name,tax_number,bpjs_health_number,bpjs_employment_number,join_date,join_date_training,join_date_borong,permanent_date,resign_date,resign_reason,photo_file_id,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uid,employeeNumber,refs.typeId,refs.statusId,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.productionModuleSectionId,input.fullName,empty(input.nickname),empty(input.nationalIdNumber),empty(input.familyCardNumber),input.gender,empty(input.birthPlace),empty(input.birthDate),empty(input.maritalStatus),empty(input.religion),empty(input.address),empty(input.rtrw),empty(input.kelurahan),empty(input.kecamatan),empty(input.city),empty(input.province),empty(input.postalCode),empty(input.phone),empty(input.email),empty(input.emergencyContactName),empty(input.emergencyContactPhone),empty(input.emergencyContactRelation),empty(input.bankName),empty(input.bankAccountNumber),empty(input.bankAccountName),empty(input.taxNumber),empty(input.bpjsHealthNumber),empty(input.bpjsEmploymentNumber),input.joinDate,input.joinDateTraining ?? null,input.joinDateBorong ?? null,empty(input.permanentDate),empty(input.resignDate),empty(input.resignReason),null,empty(input.notes),auth.id,auth.id])
  const [created] = await conn.query<RowDataPacket[]>('SELECT id FROM employees WHERE uid=?', [uid])
  await conn.execute(`INSERT INTO employee_employment_histories(uid,employee_id,site_id,department_id,position_id,work_group_id,production_module_section_id,employee_type_id,employee_status_id,effective_from,change_type,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,'INITIAL',?,?,?)`, [randomUUID(),created[0].id,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.productionModuleSectionId,refs.typeId,refs.statusId,input.joinDate,'Penempatan awal.',auth.id,auth.id])
  await writeAudit({ auth, request, siteId: refs.siteId, action: 'CREATE', table: 'employees', recordId: created[0].id, recordUid: uid, description: `Membuat karyawan ${employeeNumber}.` }, conn)
  return { uid, employeeNumber }
}
async function employeeAccess(uid: string, auth: AuthContext) {
  const [rows] = await pool.query<RowDataPacket[]>(`SELECT e.id,e.uid,e.employee_number employeeNumber,es.code employeeStatus,s.id siteId,s.code site,d.name department,p.name position,w.name workGroup,et.code employeeType,pms.uid productionModuleSectionUid,DATE_FORMAT(e.join_date,'%Y-%m-%d') joinDate,DATE_FORMAT(e.join_date_training,'%Y-%m-%d') joinDateTraining,DATE_FORMAT(e.join_date_borong,'%Y-%m-%d') joinDateBorong FROM employees e JOIN employee_statuses es ON es.id=e.employee_status_id JOIN employee_types et ON et.id=e.employee_type_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN departments d ON d.id=e.current_department_id LEFT JOIN positions p ON p.id=e.current_position_id LEFT JOIN work_groups w ON w.id=e.current_work_group_id LEFT JOIN production_module_sections pms ON pms.id=e.current_production_module_section_id WHERE e.uid=?`, [uid])
  if (!rows[0]) throw new ApiError(404, 'Karyawan tidak ditemukan.')
  enforceSite(auth, rows[0].site)
  return rows[0]
}
function sameValue(left?: string | null, right?: string | null) {
  return (left ?? null) === (right ?? null)
}
function validateMutationChange(
  input: z.infer<typeof mutationInput>,
  employee: RowDataPacket
) {
  const unchanged = (...fields: Array<'site' | 'department' | 'position' | 'employeeType' | 'workGroup' | 'productionModuleSectionUid'>) => {
    const changes = fields.some((field) => !sameValue(input[field], employee[field]))
    if (changes) throw new ApiError(422, 'Field target tidak sesuai dengan jenis perubahan yang dipilih.')
  }

  switch (input.changeType) {
    case 'TRANSFER':
      if (input.site === employee.site) throw new ApiError(422, 'Pilih site tujuan yang berbeda untuk mutasi site.')
      unchanged('position', 'employeeType', 'workGroup')
      return
    case 'PROMOTION':
    case 'DEMOTION':
      if (sameValue(input.position, employee.position)) throw new ApiError(422, 'Pilih jabatan baru untuk promosi atau demosi.')
      unchanged('site', 'department', 'employeeType', 'workGroup', 'productionModuleSectionUid')
      return
    case 'DEPARTMENT_CHANGE':
      if (sameValue(input.department, employee.department)) throw new ApiError(422, 'Pilih departemen baru.')
      unchanged('site', 'position', 'employeeType', 'workGroup', 'productionModuleSectionUid')
      return
    case 'TYPE_CHANGE':
      if (input.employeeType === employee.employeeType) throw new ApiError(422, 'Pilih jenis karyawan yang berbeda.')
      unchanged('site', 'department', 'position', 'workGroup')
      return
    case 'PRODUCTION_ASSIGNMENT_CHANGE':
      if (sameValue(input.productionModuleSectionUid, employee.productionModuleSectionUid)) throw new ApiError(422, 'Pilih Modul atau Bagian produksi yang berbeda.')
      unchanged('site', 'department', 'position', 'employeeType', 'workGroup')
      return
    default:
      return
  }
}
async function assertTypeChangeHasNoOpenContract(conn: PoolConnection, employeeId: number) {
  const [contracts] = await conn.query<RowDataPacket[]>(
    "SELECT contract_number FROM employee_contracts WHERE employee_id=? AND status IN ('DRAFT','SCHEDULED','ACTIVE') FOR UPDATE",
    [employeeId]
  )
  if (contracts[0]) throw new ApiError(409, 'Jenis karyawan tidak dapat diubah selama masih ada kontrak DRAFT, SCHEDULED, atau ACTIVE. Selesaikan kontrak tersebut terlebih dahulu.')
}
async function assertRegistrationCorrectionAllowed(conn: PoolConnection, employeeId: number) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT e.id
     FROM employees e
     JOIN employee_statuses es ON es.id=e.employee_status_id
     WHERE e.id=?
       AND ${registrationCorrectionEligibilitySql}
     FOR UPDATE`,
    [employeeId]
  )
  if (!rows[0]) throw new ApiError(409, 'Registrasi karyawan ini sudah tidak dapat dikoreksi. Gunakan proses mutasi atau lifecycle resmi.')
}
async function fileId(uid?: string) {
  if (!uid) return null
  const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM files WHERE uid=?', [uid])
  if (!rows[0]) throw new ApiError(422, 'File tidak ditemukan.')
  return rows[0].id as number
}
function scopeWhere(auth: AuthContext, column = 's.code') { return auth.roles.includes('SUPER_ADMIN') ? { sql: '1=1', params: [] as string[] } : { sql: `${column} IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`, params: auth.siteAccess } }
const routeParam = (value: string | string[]) => Array.isArray(value) ? value[0] : value

function assertContractPrintEligible(employeeType: string, contractType: string) {
  if (employeeType !== 'BORONGAN' || contractType !== 'PKWT') {
    throw new ApiError(422, 'Cetak template tahap ini hanya tersedia untuk karyawan Borongan dengan kontrak PKWT.')
  }
}

function settingObject(value: unknown, label: string) {
  let parsed = value
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { throw new ApiError(422, `${label} pada Pengaturan Sistem tidak valid.`) }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiError(422, `${label} pada Pengaturan Sistem tidak valid.`)
  }
  return parsed as Record<string, unknown>
}

function requiredSettingText(setting: Record<string, unknown>, field: string, label: string) {
  const value = String(setting[field] ?? '').trim()
  if (!value) throw new ApiError(422, `${label} pada Pengaturan Sistem belum diisi.`)
  return value
}

async function ensureContractPrintSnapshot(conn: PoolConnection, auth: AuthContext, request: Request, uid: string) {
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT c.id,c.uid,c.contract_number contractNumber,DATE_FORMAT(c.start_date,'%Y-%m-%d') startDate,DATE_FORMAT(c.end_date,'%Y-%m-%d') endDate,DATE_FORMAT(c.signed_date,'%Y-%m-%d') signedDate,c.terms_json termsJson,ct.code contractType,et.code employeeType,e.id employeeId,e.full_name fullName,e.employee_number employeeNumber,e.national_id_number nationalIdNumber,e.birth_place birthPlace,DATE_FORMAT(e.birth_date,'%Y-%m-%d') birthDate,DATE_FORMAT(e.join_date,'%Y-%m-%d') joinDate,e.address,e.rtrw,e.kelurahan,e.kecamatan,e.city,e.province,s.code currentSite FROM employee_contracts c JOIN contract_types ct ON ct.id=c.contract_type_id JOIN employees e ON e.id=c.employee_id JOIN employee_types et ON et.id=e.employee_type_id JOIN sites s ON s.id=e.current_site_id WHERE c.uid=? FOR UPDATE`, [uid])
  const c = rows[0]
  if (!c) throw new ApiError(404, 'Kontrak tidak ditemukan.')
  enforceSite(auth, c.currentSite)
  assertContractPrintEligible(c.employeeType, c.contractType)
  const terms = typeof c.termsJson === 'string' ? JSON.parse(c.termsJson || '{}') : c.termsJson ?? {}
  if (terms.contractPrintV2?.version === 'PKWT_PRODUCTION_SECTION_V2') return terms.contractPrintV2
  if (!c.nationalIdNumber || !c.address) throw new ApiError(422, `NIK dan alamat karyawan wajib tersedia sebelum kontrak ${c.contractNumber} dicetak.`)
  const [history] = await conn.query<RowDataPacket[]>(`SELECT s.id siteId,s.name siteName,p.name positionName,pm.name productionModuleName,ps.code productionSectionCode,ps.name productionSectionName FROM employee_employment_histories h JOIN sites s ON s.id=h.site_id LEFT JOIN positions p ON p.id=h.position_id LEFT JOIN production_module_sections pms ON pms.id=h.production_module_section_id LEFT JOIN production_modules pm ON pm.id=pms.production_module_id LEFT JOIN production_sections ps ON ps.id=pms.production_section_id WHERE h.employee_id=? AND h.effective_from<=? AND (h.effective_to IS NULL OR h.effective_to>=?) ORDER BY h.effective_from DESC,h.id DESC LIMIT 1`, [c.employeeId, c.startDate, c.startDate])
  const employment = history[0]
  if (!employment?.positionName) throw new ApiError(422, `Jabatan karyawan pada tanggal mulai kontrak ${c.contractNumber} wajib tersedia sebelum kontrak dicetak.`)
  if (!employment.productionSectionCode || !employment.productionSectionName) throw new ApiError(422, `Bagian produksi karyawan pada tanggal mulai kontrak ${c.contractNumber} wajib tersedia sebelum kontrak dicetak.`)

  const targetSettingKey = `contract.pkwt.target.${employment.productionSectionCode}`
  const [settingRows] = await conn.query<RowDataPacket[]>(
    `SELECT site_id siteId,setting_key settingKey,setting_value settingValue
     FROM system_settings
     WHERE (site_id IS NULL AND setting_key IN ('company.profile','contract.pkwt.first_party'))
        OR (site_id=? AND setting_key=?)`,
    [employment.siteId, targetSettingKey]
  )
  const firstPartyRow = settingRows.find((row) => row.settingKey === 'contract.pkwt.first_party' && row.siteId === null)
  const companyProfileRow = settingRows.find((row) => row.settingKey === 'company.profile' && row.siteId === null)
  const targetRow = settingRows.find((row) => row.settingKey === targetSettingKey && Number(row.siteId) === Number(employment.siteId))
  if (!firstPartyRow) throw new ApiError(422, 'Pengaturan pihak pertama kontrak PKWT belum tersedia. Jalankan migration pengaturan template PKWT.')
  if (!targetRow) throw new ApiError(422, `Target kerja untuk bagian ${employment.productionSectionName} di site ${employment.siteName} belum tersedia pada Pengaturan Sistem.`)

  const firstParty = settingObject(firstPartyRow.settingValue, 'Identitas pihak pertama')
  const companyProfile = companyProfileRow
    ? settingObject(companyProfileRow.settingValue, 'Profil perusahaan')
    : firstParty
  const target = settingObject(targetRow.settingValue, `Target kerja ${employment.productionSectionName}`)
  const targetValue = Number(target.value)
  if (!Number.isFinite(targetValue) || targetValue <= 0) throw new ApiError(422, `Angka target kerja ${employment.productionSectionName} pada Pengaturan Sistem harus lebih dari 0.`)
  const address = [c.address, c.rtrw && `RT/RW ${c.rtrw}`, c.kelurahan, c.kecamatan, c.city, c.province].filter(Boolean).join(', ')
  const snapshot = {
    version: 'PKWT_PRODUCTION_SECTION_V2',
    generatedAt: new Date().toISOString(),
    contract: { uid: c.uid, number: c.contractNumber, type: c.contractType, startDate: c.startDate, endDate: c.endDate, signedDate: c.signedDate },
    company: {
      name: requiredSettingText(companyProfile, 'companyName', 'Nama perusahaan'),
      headOfficeAddress: requiredSettingText(
        companyProfile,
        companyProfileRow ? 'legalAddress' : 'headOfficeAddress',
        'Alamat kantor pusat'
      ),
      director: {
        name: requiredSettingText(firstParty, 'directorName', 'Nama direktur'),
        title: requiredSettingText(firstParty, 'directorTitle', 'Jabatan direktur'),
      },
    },
    employee: { name: c.fullName, employeeNumber: c.employeeNumber, nationalIdNumber: c.nationalIdNumber, birthPlace: c.birthPlace, birthDate: c.birthDate, address, joinDate: c.joinDate, position: employment.positionName },
    employment: { site: employment.siteName, productionModule: employment.productionModuleName, productionSection: { code: employment.productionSectionCode, name: employment.productionSectionName } },
    target: { value: targetValue, unit: requiredSettingText(target, 'unit', `Satuan target kerja ${employment.productionSectionName}`) },
  }
  await conn.execute('UPDATE employee_contracts SET terms_json=?,updated_by=? WHERE id=?', [JSON.stringify({ ...terms, contractPrintV2: snapshot }), auth.id, c.id])
  await writeAudit({ auth, request, siteId: employment.siteId, action: 'GENERATE', table: 'employee_contracts', recordId: c.id, recordUid: uid, description: `Membuat snapshot cetak kontrak PKWT versi 2 ${c.contractNumber}.` }, conn)
  return snapshot
}

const scheduledMutationSelect = `SELECT sm.uid,sm.status,sm.change_type changeType,DATE_FORMAT(sm.effective_from,'%Y-%m-%d') effectiveFrom,sm.reference_number referenceNumber,sm.reason,sm.notes,sm.failure_reason failureReason,DATE_FORMAT(sm.applied_at,'%Y-%m-%dT%H:%i:%s') appliedAt,e.uid employeeUid,e.employee_number employeeNumber,e.full_name employeeName,sourceSite.code sourceSite,targetSite.code site,targetDepartment.name department,targetPosition.name position,targetWorkGroup.name workGroup,targetType.code employeeType,targetMapping.uid productionModuleSectionUid,targetModule.uid productionModuleUid,targetModule.name productionModule,targetSection.uid productionSectionUid,targetSection.name productionSection FROM scheduled_employee_mutations sm JOIN employees e ON e.id=sm.employee_id JOIN sites sourceSite ON sourceSite.id=e.current_site_id JOIN sites targetSite ON targetSite.id=sm.target_site_id LEFT JOIN departments targetDepartment ON targetDepartment.id=sm.target_department_id LEFT JOIN positions targetPosition ON targetPosition.id=sm.target_position_id LEFT JOIN work_groups targetWorkGroup ON targetWorkGroup.id=sm.target_work_group_id JOIN employee_types targetType ON targetType.id=sm.target_employee_type_id LEFT JOIN production_module_sections targetMapping ON targetMapping.id=sm.target_production_module_section_id LEFT JOIN production_modules targetModule ON targetModule.id=targetMapping.production_module_id LEFT JOIN production_sections targetSection ON targetSection.id=targetMapping.production_section_id`

export const employeesRouter = Router()
employeesRouter.use(authenticate)
employeesRouter.use(employeeIdCardsRouter)
employeesRouter.use(employeeSummaryRouter)

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
    const page = Math.max(1, Number(req.query.page ?? 1)); const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 50)))
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

employeesRouter.get('/histories', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1)); const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 50)))
    const where = ['1=1']; const values: unknown[] = []; const query = String(req.query.query ?? '')
    const addList = (field: string, raw: unknown) => { const list = String(raw ?? '').split(',').filter(Boolean); if (list.length) { where.push(`${field} IN (${list.map(() => '?').join(',')})`); values.push(...list) } }
    if (query) { where.push('(e.full_name LIKE ? OR e.employee_number LIKE ? OR p.name LIKE ?)'); values.push(`%${query}%`, `%${query}%`, `%${query}%`) }
    addList('s.code', req.query.site); addList('h.change_type', req.query.changeType)
    const scoped = scopeWhere(res.locals.auth as AuthContext); where.push(scoped.sql); values.push(...scoped.params)
    const clause = where.join(' AND ')
    const from = `FROM employee_employment_histories h JOIN employees e ON e.id=h.employee_id JOIN sites s ON s.id=h.site_id LEFT JOIN departments d ON d.id=h.department_id LEFT JOIN positions p ON p.id=h.position_id LEFT JOIN work_groups w ON w.id=h.work_group_id LEFT JOIN production_module_sections pms ON pms.id=h.production_module_section_id LEFT JOIN production_modules pm ON pm.id=pms.production_module_id LEFT JOIN production_sections ps ON ps.id=pms.production_section_id JOIN employee_types et ON et.id=h.employee_type_id JOIN employee_statuses es ON es.id=h.employee_status_id`
    const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total ${from} WHERE ${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT h.uid,e.uid employeeUid,e.full_name employeeName,e.employee_number employeeNumber,s.code site,d.name department,p.name position,w.name workGroup,pm.uid productionModuleUid,pm.name productionModule,ps.uid productionSectionUid,ps.name productionSection,et.code employeeType,es.code employeeStatus,DATE_FORMAT(h.effective_from,'%Y-%m-%d') effectiveFrom,DATE_FORMAT(h.effective_to,'%Y-%m-%d') effectiveTo,h.change_type changeType,h.reference_number referenceNumber,h.reason,h.notes ${from} WHERE ${clause} ORDER BY h.effective_from DESC,h.id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize])
    res.json({ items: rows, total: Number(count[0].total), page, pageSize })
  } catch (error) { next(error) }
})

employeesRouter.get('/scheduled-mutations', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1)); const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 50)))
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

employeesRouter.get('/scheduled-status-changes', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1))
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 50)))
    const where = ['1=1']; const values: unknown[] = []
    const query = String(req.query.query ?? '')
    if (query) { where.push('(e.full_name LIKE ? OR e.employee_number LIKE ? OR c.contract_number LIKE ?)'); values.push(`%${query}%`, `%${query}%`, `%${query}%`) }
    const sites = String(req.query.site ?? '').split(',').filter(Boolean)
    if (sites.length) { where.push(`s.code IN (${sites.map(() => '?').join(',')})`); values.push(...sites) }
    const statuses = String(req.query.status ?? '').split(',').filter(Boolean)
    if (statuses.length) { where.push(`sc.status IN (${statuses.map(() => '?').join(',')})`); values.push(...statuses) }
    const actions = String(req.query.action ?? '').split(',').filter(Boolean)
    if (actions.length) { where.push(`sc.action IN (${actions.map(() => '?').join(',')})`); values.push(...actions) }
    const scoped = scopeWhere(res.locals.auth as AuthContext, 's.code'); where.push(scoped.sql); values.push(...scoped.params)
    const clause = where.join(' AND ')
    const from = `FROM scheduled_employee_status_changes sc JOIN employees e ON e.id=sc.employee_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN employee_contracts c ON c.id=sc.contract_id`
    const [count] = await pool.query<RowDataPacket[]>(`SELECT COUNT(*) total ${from} WHERE ${clause}`, values)
    const [rows] = await pool.query<RowDataPacket[]>(`SELECT sc.uid,e.uid employeeUid,e.full_name employeeName,e.employee_number employeeNumber,s.code site,c.uid contractUid,c.contract_number contractNumber,sc.action,DATE_FORMAT(sc.effective_date,'%Y-%m-%d') effectiveDate,sc.reason,sc.status,sc.failure_reason failureReason,DATE_FORMAT(sc.applied_at,'%Y-%m-%dT%H:%i:%s') appliedAt ${from} WHERE ${clause} ORDER BY sc.effective_date ASC,sc.created_at DESC,sc.id DESC LIMIT ? OFFSET ?`, [...values, pageSize, (page - 1) * pageSize])
    res.json({ items: rows, total: Number(count[0].total), page, pageSize })
  } catch (error) { next(error) }
})

employeesRouter.get('/contracts', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1)); const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 50)))
    const where = ['1=1']; const values: unknown[] = []; const query = String(req.query.query ?? '').trim().replace(/\s+/g, ' ')
    const coverage = String(req.query.coverage ?? '').split(',').filter(Boolean)
    const scoped = scopeWhere(res.locals.auth as AuthContext)
    if (coverage.length) {
      const sites = String(req.query.site ?? '').split(',').filter(Boolean)
      const statuses = String(req.query.status ?? '').split(',').filter(Boolean)
      const productionModules = String(req.query.productionModule ?? '').split(',').filter(Boolean)
      const productionSections = String(req.query.productionSection ?? '').split(',').filter(Boolean)
      const selections: string[] = []
      const selectionValues: unknown[] = []
      const today = businessDate()

      if (coverage.includes('ACTIVE_WITHOUT_VALID_CONTRACT')) {
        const coverageWhere = [
          `(
            (es.code='ACTIVE' AND NOT EXISTS (SELECT 1 FROM employee_contracts active_contract WHERE active_contract.employee_id=e.id AND active_contract.status='ACTIVE' AND active_contract.start_date<=? AND (active_contract.end_date IS NULL OR active_contract.end_date>=?)))
            OR
            (es.code='INACTIVE' AND e.resign_date IS NULL AND NOT EXISTS (SELECT 1 FROM employee_contracts any_contract WHERE any_contract.employee_id=e.id AND any_contract.status<>'CANCELLED'))
          )`,
          scoped.sql,
        ]
        const coverageValues: unknown[] = [today, today, ...scoped.params]
        if (query) {
          coverageWhere.push('(e.full_name LIKE ? OR e.nickname LIKE ? OR e.employee_number LIKE ? OR c.contract_number LIKE ?)')
          coverageValues.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`)
        }
        if (sites.length) {
          coverageWhere.push(`s.code IN (${sites.map(() => '?').join(',')})`)
          coverageValues.push(...sites)
        }
        if (statuses.length) {
          coverageWhere.push(`COALESCE(c.status,'MISSING') IN (${statuses.map(() => '?').join(',')})`)
          coverageValues.push(...statuses)
        }
        if (productionModules.length) {
          coverageWhere.push(`pm.uid IN (${productionModules.map(() => '?').join(',')})`)
          coverageValues.push(...productionModules)
        }
        if (productionSections.length) {
          coverageWhere.push(`ps.uid IN (${productionSections.map(() => '?').join(',')})`)
          coverageValues.push(...productionSections)
        }
        selections.push(`${contractCoverageSelect()} WHERE ${coverageWhere.join(' AND ')}`)
        selectionValues.push(...coverageValues)
      }

      if (coverage.includes('EXPIRING_WITHIN_7_DAYS')) {
        const expiringWhere = [
          "c.status='ACTIVE'",
          'c.end_date BETWEEN ? AND DATE_ADD(?, INTERVAL 7 DAY)',
          scoped.sql,
        ]
        const expiringValues: unknown[] = [today, today, ...scoped.params]
        if (query) {
          expiringWhere.push('(c.contract_number LIKE ? OR e.full_name LIKE ? OR e.nickname LIKE ? OR e.employee_number LIKE ?)')
          expiringValues.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`)
        }
        if (sites.length) {
          expiringWhere.push(`s.code IN (${sites.map(() => '?').join(',')})`)
          expiringValues.push(...sites)
        }
        if (statuses.length) {
          expiringWhere.push(`c.status IN (${statuses.map(() => '?').join(',')})`)
          expiringValues.push(...statuses)
        }
        if (productionModules.length) {
          expiringWhere.push(`pm.uid IN (${productionModules.map(() => '?').join(',')})`)
          expiringValues.push(...productionModules)
        }
        if (productionSections.length) {
          expiringWhere.push(`ps.uid IN (${productionSections.map(() => '?').join(',')})`)
          expiringValues.push(...productionSections)
        }
        selections.push(`${contractSelect()} WHERE ${expiringWhere.join(' AND ')}`)
        selectionValues.push(...expiringValues)
      }

      if (selections.length) {
        const union = selections.join(' UNION ALL ')
        const [count] = await pool.query<RowDataPacket[]>(
          `SELECT COUNT(*) total FROM (${union}) coverage_rows`,
          selectionValues
        )
        const [rows] = await pool.query<RowDataPacket[]>(
          `SELECT * FROM (${union}) coverage_rows ORDER BY startDate DESC, employeeName ASC LIMIT ? OFFSET ?`,
          [...selectionValues, pageSize, (page - 1) * pageSize]
        )
        res.json({ items: rows.map(mapContract), total: Number(count[0].total), page, pageSize })
        return
      }
    }
    if (query) {
      where.push('(c.contract_number LIKE ? OR e.full_name LIKE ? OR e.nickname LIKE ? OR e.employee_number LIKE ?)')
      values.push(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`)
    }
    const sites = String(req.query.site ?? '').split(',').filter(Boolean)
    if (sites.length) {
      where.push(`s.code IN (${sites.map(() => '?').join(',')})`)
      values.push(...sites)
    }
    const statuses = String(req.query.status ?? '').split(',').filter(Boolean)
    if (statuses.length) {
      where.push(`c.status IN (${statuses.map(() => '?').join(',')})`)
      values.push(...statuses)
    }
    const productionModules = String(req.query.productionModule ?? '').split(',').filter(Boolean)
    if (productionModules.length) {
      where.push(`pm.uid IN (${productionModules.map(() => '?').join(',')})`)
      values.push(...productionModules)
    }
    const productionSections = String(req.query.productionSection ?? '').split(',').filter(Boolean)
    if (productionSections.length) {
      where.push(`ps.uid IN (${productionSections.map(() => '?').join(',')})`)
      values.push(...productionSections)
    }
    where.push(scoped.sql); values.push(...scoped.params)
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
    const productionModules = String(req.query.productionModule ?? '').split(',').filter(Boolean)
    if (productionModules.length) {
      where.push(`pm.uid IN (${productionModules.map(() => '?').join(',')})`)
      values.push(...productionModules)
    }
    const productionSections = String(req.query.productionSection ?? '').split(',').filter(Boolean)
    if (productionSections.length) {
      where.push(`ps.uid IN (${productionSections.map(() => '?').join(',')})`)
      values.push(...productionSections)
    }
    const scoped = scopeWhere(res.locals.auth as AuthContext)
    where.push(scoped.sql)
    values.push(...scoped.params)
    const today = businessDate()
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT
        COALESCE(SUM(CASE WHEN c.status='ACTIVE' AND c.start_date<=? AND (c.end_date IS NULL OR c.end_date>=?) THEN 1 ELSE 0 END), 0) activeValid,
        COALESCE(SUM(CASE WHEN c.status='ACTIVE' AND c.end_date BETWEEN ? AND DATE_ADD(?, INTERVAL 7 DAY) THEN 1 ELSE 0 END), 0) expiringWithin7Days,
        COALESCE(SUM(CASE WHEN c.status='DRAFT' THEN 1 ELSE 0 END), 0) drafts,
        COALESCE(SUM(CASE WHEN c.status='SCHEDULED' THEN 1 ELSE 0 END), 0) scheduled,
        COUNT(c.id) totalContracts
      ${contractFrom()} WHERE ${where.join(' AND ')}`,
      [today, today, today, today, ...values]
    )
    const [employeesWithoutContract] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) total
       FROM employees e
       JOIN employee_statuses es ON es.id=e.employee_status_id
       JOIN sites s ON s.id=e.current_site_id
       LEFT JOIN production_module_sections pms ON pms.id=e.current_production_module_section_id
       LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
       LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
       WHERE ${where.join(' AND ')}
         AND (
           (
             es.code='ACTIVE'
             AND NOT EXISTS (
               SELECT 1 FROM employee_contracts c
               WHERE c.employee_id=e.id AND c.status='ACTIVE' AND c.start_date<=?
                 AND (c.end_date IS NULL OR c.end_date>=?)
             )
           )
           OR
           (
             es.code='INACTIVE'
             AND e.resign_date IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM employee_contracts c
               WHERE c.employee_id=e.id AND c.status<>'CANCELLED'
             )
           )
         )`,
      [...values, today, today]
    )
    const summary = rows[0] ?? {}
    res.json({
      activeValid: Number(summary.activeValid ?? 0),
      expiringWithin7Days: Number(summary.expiringWithin7Days ?? 0),
      activeWithoutValidContract: Number(employeesWithoutContract[0]?.total ?? 0),
      drafts: Number(summary.drafts ?? 0),
      scheduled: Number(summary.scheduled ?? 0),
      totalContracts: Number(summary.totalContracts ?? 0),
    })
  } catch (error) { next(error) }
})
employeesRouter.get('/contracts/conflicts', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const scope = scopeWhere(res.locals.auth as AuthContext)
    const today = businessDate()
    const page = Math.max(1, Number(req.query.page ?? 1) || 1)
    const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 50) || 50))
    const dataset = `
      SELECT
        e.uid employeeUid,
        e.employee_number employeeNumber,
        e.full_name fullName,
        s.code site,
        es.code currentStatus,
        e.resign_date resignDate,
        COUNT(DISTINCT active_contract.id) activeContracts,
        COUNT(DISTINCT any_contract.id) nonCancelledContracts,
        GROUP_CONCAT(DISTINCT active_contract.contract_number ORDER BY active_contract.contract_number SEPARATOR ', ') activeContractNumbers
      FROM employees e
      JOIN sites s ON s.id=e.current_site_id
      JOIN employee_statuses es ON es.id=e.employee_status_id
      LEFT JOIN employee_contracts active_contract
        ON active_contract.employee_id=e.id
       AND active_contract.status='ACTIVE'
       AND active_contract.start_date<=?
       AND (active_contract.end_date IS NULL OR active_contract.end_date>=?)
      LEFT JOIN employee_contracts any_contract
        ON any_contract.employee_id=e.id
       AND any_contract.status<>'CANCELLED'
      WHERE ${scope.sql}
      GROUP BY e.id,e.uid,e.employee_number,e.full_name,s.code,es.code,e.resign_date`
    const conflictPredicate = `
      activeContracts>1
      OR (currentStatus IN ('RESIGNED','LEAVE') AND activeContracts>0)
      OR (currentStatus='ACTIVE' AND activeContracts=0)
      OR (currentStatus='INACTIVE' AND activeContracts>0)
      OR (currentStatus='INACTIVE' AND resignDate IS NULL AND activeContracts=0 AND nonCancelledContracts=0)`
    const values = [today, today, ...scope.params]
    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) total FROM (${dataset}) conflicts WHERE ${conflictPredicate}`,
      values
    )
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM (${dataset}) conflicts
       WHERE ${conflictPredicate}
       ORDER BY site,employeeNumber
       LIMIT ? OFFSET ?`,
      [...values, pageSize, (page - 1) * pageSize]
    )
    const total = Number(countRows[0]?.total ?? 0)
    res.json({
      items: rows.map((row) => cronConflict({ employeeUid: String(row.employeeUid), employeeNumber: String(row.employeeNumber), fullName: String(row.fullName), site: String(row.site), currentStatus: String(row.currentStatus), activeContracts: Number(row.activeContracts), nonCancelledContracts: Number(row.nonCancelledContracts), activeContractNumbers: row.activeContractNumbers ? String(row.activeContractNumbers) : null })),
      ...paginationMeta(total, page, pageSize),
    })
  } catch (error) { next(error) }
})
employeesRouter.post('/contracts/reconcile', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    if (!auth.roles.includes('SUPER_ADMIN')) {
      throw new ApiError(403, 'Rekonsiliasi kontrak manual hanya dapat dijalankan oleh Super Admin.')
    }
    const result = await runContractsReconcile()
    await writeAudit({
      auth,
      request: req,
      action: 'OTHER',
      table: 'cron_runs',
      recordUid: result.runUid,
      description: `Menjalankan rekonsiliasi kontrak manual dengan hasil ${result.status}.`,
    })
    res.json(result)
  } catch (error) {
    next(error)
  }
})
employeesRouter.get('/documents', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1)); const pageSize = Math.min(500, Math.max(1, Number(req.query.pageSize ?? 50)))
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
employeesRouter.get('/contracts/print-previews', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const contractUids = z.array(z.string().uuid()).min(1).max(50).parse(String(req.query.contractUids ?? '').split(',').filter(Boolean))
    const unique = [...new Set(contractUids)]
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT c.uid,c.terms_json termsJson,s.code site,ct.code contractType,et.code employeeType
       FROM employee_contracts c
       JOIN contract_types ct ON ct.id=c.contract_type_id
       JOIN employees e ON e.id=c.employee_id
       JOIN employee_types et ON et.id=e.employee_type_id
       JOIN sites s ON s.id=e.current_site_id
       WHERE c.uid IN (${unique.map(() => '?').join(',')})`,
      unique
    )
    const byUid = new Map(rows.map((row) => [row.uid, row]))
    const items = unique.map((uid) => {
      const row = byUid.get(uid)
      if (!row) throw new ApiError(404, 'Kontrak tidak ditemukan.')
      enforceSite(res.locals.auth as AuthContext, row.site)
      assertContractPrintEligible(row.employeeType, row.contractType)
      const terms = typeof row.termsJson === 'string' ? JSON.parse(row.termsJson || '{}') : row.termsJson ?? {}
      if (!terms.contractPrintV2) throw new ApiError(409, 'Preview format PKWT terbaru belum dibuat. Buat snapshot kontrak terlebih dahulu.')
      return terms.contractPrintV2
    })
    res.json({ items })
  } catch (error) { next(error) }
})
employeesRouter.get('/contracts/:contractUid', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const uid = routeParam(req.params.contractUid)
    const [rows] = await pool.query<RowDataPacket[]>(`${contractSelect()} WHERE c.uid=?`, [uid])
    const row = rows[0]
    if (!row) throw new ApiError(404, 'Kontrak tidak ditemukan.')
    enforceSite(res.locals.auth as AuthContext, row.site)

    const [lifecycleEvents] = await pool.query<RowDataPacket[]>(
      `SELECT ev.uid,ev.from_status fromStatus,ev.to_status toStatus,
              DATE_FORMAT(ev.effective_date,'%Y-%m-%d') effectiveDate,
              ev.reason,ev.source,COALESCE(u.full_name,'Sistem') actorName,
              DATE_FORMAT(ev.created_at,'%Y-%m-%dT%H:%i:%s') createdAt
       FROM employee_contract_lifecycle_events ev
       LEFT JOIN users u ON u.id=ev.actor_user_id
       WHERE ev.contract_id=?
       ORDER BY ev.effective_date,ev.id`,
      [row.internalContractId]
    )
    const [correctionRows] = await pool.query<RowDataPacket[]>(
      `SELECT al.uid,al.action,al.description,al.reason,
              al.before_data beforeData,al.after_data afterData,
              COALESCE(u.full_name,'Sistem') actorName,
              DATE_FORMAT(al.occurred_at,'%Y-%m-%dT%H:%i:%s') occurredAt
       FROM audit_logs al
       LEFT JOIN users u ON u.id=al.user_id
       WHERE al.table_name='employee_contracts'
         AND al.action='UPDATE'
         AND (al.record_id=? OR al.record_uid=?)
       ORDER BY al.occurred_at,al.id`,
      [row.internalContractId, uid]
    )
    const correctionHistory = correctionRows.map((item) => ({
      ...item,
      beforeData: parseAuditData(item.beforeData),
      afterData: parseAuditData(item.afterData),
    }))
    res.json({ ...mapContract(row), lifecycleEvents, correctionHistory })
  } catch (error) { next(error) }
})
employeesRouter.get('/documents/:documentUid', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.documentUid); const [rows] = await pool.query<RowDataPacket[]>(`${documentSelect()} WHERE d.uid=?`, [uid]); if (!rows[0]) throw new ApiError(404, 'Dokumen tidak ditemukan.'); enforceSite(res.locals.auth as AuthContext, rows[0].site); res.json(mapDocument(rows[0])) } catch (error) { next(error) }
})

employeesRouter.get('/contracts/:contractUid/print-preview', requirePermission('employees.view'), async (req, res, next) => {
  try {
    const uid = routeParam(req.params.contractUid)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT c.terms_json termsJson,s.code site,ct.code contractType,et.code employeeType
       FROM employee_contracts c
       JOIN contract_types ct ON ct.id=c.contract_type_id
       JOIN employees e ON e.id=c.employee_id
       JOIN employee_types et ON et.id=e.employee_type_id
       JOIN sites s ON s.id=e.current_site_id
       WHERE c.uid=?`,
      [uid]
    )
    const row = rows[0]
    if (!row) throw new ApiError(404, 'Kontrak tidak ditemukan.')
    enforceSite(res.locals.auth as AuthContext, row.site)
    assertContractPrintEligible(row.employeeType, row.contractType)
    const terms = typeof row.termsJson === 'string' ? JSON.parse(row.termsJson || '{}') : row.termsJson ?? {}
    if (!terms.contractPrintV2) throw new ApiError(409, 'Preview format PKWT terbaru belum dibuat. Buat snapshot kontrak terlebih dahulu.')
    res.json(terms.contractPrintV2)
  } catch (error) { next(error) }
})
employeesRouter.post('/contracts/:contractUid/normalize-print-snapshot', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const uid = routeParam(req.params.contractUid)
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT c.id,c.terms_json termsJson,s.code site,ct.code contractType,et.code employeeType,
              DATE_FORMAT(c.start_date,'%Y-%m-%d') startDate,
              DATE_FORMAT(c.end_date,'%Y-%m-%d') endDate,
              DATE_FORMAT(c.signed_date,'%Y-%m-%d') signedDate
       FROM employee_contracts c
       JOIN contract_types ct ON ct.id=c.contract_type_id
       JOIN employees e ON e.id=c.employee_id
       JOIN employee_types et ON et.id=e.employee_type_id
       JOIN sites s ON s.id=e.current_site_id
       WHERE c.uid=?`,
      [uid]
    )
    const row = rows[0]
    if (!row) throw new ApiError(404, 'Kontrak tidak ditemukan.')
    enforceSite(auth, row.site)
    assertContractPrintEligible(row.employeeType, row.contractType)
    const terms = typeof row.termsJson === 'string' ? JSON.parse(row.termsJson || '{}') : row.termsJson ?? {}
    if (!terms.contractPrintV1 && !terms.contractPrintV2) throw new ApiError(409, 'Snapshot kontrak belum tersedia.')
    if (terms.contractPrintV1) terms.contractPrintV1.contract = { ...terms.contractPrintV1.contract, startDate: row.startDate, endDate: row.endDate, signedDate: row.signedDate }
    if (terms.contractPrintV2) terms.contractPrintV2.contract = { ...terms.contractPrintV2.contract, startDate: row.startDate, endDate: row.endDate, signedDate: row.signedDate }
    await pool.execute('UPDATE employee_contracts SET terms_json=?,updated_by=? WHERE id=?', [JSON.stringify(terms), auth.id, row.id])
    res.status(204).end()
  } catch (error) { next(error) }
})
employeesRouter.post('/contracts/print-snapshots', requirePermission('employees.manage'), async (req,res,next)=>{ const conn=await pool.getConnection();try{const auth=res.locals.auth as AuthContext;const input=printSnapshotsInput.parse(req.body);const contractUids=[...new Set(input.contractUids)];await conn.beginTransaction();const items=[];for(const uid of contractUids){items.push(await ensureContractPrintSnapshot(conn,auth,req,uid))}await conn.commit();res.json({items})}catch(e){await conn.rollback();next(e)}finally{conn.release()} })
employeesRouter.post('/contracts/:contractUid/print-snapshot', requirePermission('employees.manage'), async (req,res,next)=>{ const conn=await pool.getConnection();try{const auth=res.locals.auth as AuthContext;const uid=routeParam(req.params.contractUid);await conn.beginTransaction();const snapshot=await ensureContractPrintSnapshot(conn,auth,req,uid);await conn.commit();res.json(snapshot)}catch(e){await conn.rollback();next(e)}finally{conn.release()} })

employeesRouter.post('/import/preview', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const { items } = employeeImportInput.parse(req.body)
    const rows = await validateEmployeeImport(items, res.locals.auth as AuthContext)
    res.json({
      rows: rows.map(({ input: _input, ...row }) => row),
      total: rows.length,
      valid: rows.filter((row) => row.valid).length,
      invalid: rows.filter((row) => !row.valid).length,
    })
  } catch (error) { next(error) }
})

employeesRouter.post('/import', requirePermission('employees.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  try {
    const { items } = employeeImportInput.parse(req.body)
    const auth = res.locals.auth as AuthContext
    const rows = await validateEmployeeImport(items, auth)
    const invalid = rows.filter((row) => !row.valid || !row.input)
    if (invalid.length) {
      throw new ApiError(422, 'Import belum dapat dieksekusi. Perbaiki seluruh baris yang tidak valid.')
    }
    await conn.beginTransaction()
    const created = []
    for (const row of rows) {
      created.push(await createEmployeeInTransaction(conn, row.input!, auth, req))
    }
    await conn.commit()
    res.status(201).json({ created })
  } catch (error) {
    await conn.rollback()
    if (error instanceof EmployeeNumberSequenceExhaustedError) {
      next(new ApiError(422, error.message))
      return
    }
    if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
      next(new ApiError(409, 'Data unik sudah digunakan oleh karyawan lain. Muat ulang preview lalu periksa kembali.'))
      return
    }
    next(error)
  } finally { conn.release() }
})

employeesRouter.get('/:uid', requirePermission('employees.view'), async (req, res, next) => {
  try { const uid = routeParam(req.params.uid); const [rows] = await pool.query<RowDataPacket[]>(`${employeeSelect} WHERE e.uid=?`, [uid]); if (!rows[0]) throw new ApiError(404, 'Karyawan tidak ditemukan.'); enforceSite(res.locals.auth, rows[0].site); res.json(mapEmployee(rows[0])) } catch (error) { next(error) }
})

employeesRouter.post('/', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = employeeInput.parse(req.body); if (input.employeeStatus !== 'INACTIVE') throw new ApiError(422, 'Karyawan baru harus dibuat dengan status Nonaktif. Buat dan aktifkan kontrak terlebih dahulu untuk mengaktifkannya.'); const auth = res.locals.auth as AuthContext; const photoId = await fileId(input.photoUid); const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const created = await createEmployeeInTransaction(conn, input, auth, req)
      if (photoId) await conn.execute('UPDATE employees SET photo_file_id=? WHERE uid=?', [photoId, created.uid])
      await conn.commit()
      res.status(201).json({ uid: created.uid })
    } catch (error) {
      await conn.rollback()
      if (error instanceof EmployeeNumberSequenceExhaustedError) {
        throw new ApiError(422, error.message)
      }
      throw error
    } finally { conn.release() }
  } catch (error) { next(error) }
})

employeesRouter.post('/:uid/registration-correction', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = registrationCorrectionInput.parse(req.body)
    const auth = res.locals.auth as AuthContext
    const employee = await employeeAccess(routeParam(req.params.uid), auth)
    if (input.site !== employee.site) {
      throw new ApiError(422, 'Koreksi site belum tersedia karena berdampak ke Employee ID. Gunakan site yang sama.')
    }
    enforceSite(auth, input.site)
    const target = {
      ...input,
      department: input.department || employee.department || undefined,
      position: input.position || employee.position || undefined,
      workGroup: input.workGroup || employee.workGroup || undefined,
      productionModuleSectionUid: input.productionModuleSectionUid || employee.productionModuleSectionUid || undefined,
      employeeType: input.employeeType || employee.employeeType,
    }
    const refs = await references(target, employee.employeeStatus)
    const changed = !sameValue(target.site, employee.site)
      || !sameValue(target.joinDate, employee.joinDate)
      || !sameValue(target.department, employee.department)
      || !sameValue(target.position, employee.position)
      || !sameValue(target.workGroup, employee.workGroup)
      || !sameValue(target.employeeType, employee.employeeType)
      || !sameValue(target.productionModuleSectionUid, employee.productionModuleSectionUid)
    if (!changed) throw new ApiError(422, 'Tidak ada data registrasi yang berubah.')
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      await assertRegistrationCorrectionAllowed(conn, employee.id)
      if (employee.joinDateTraining && employee.joinDateTraining < target.joinDate) {
        throw new ApiError(422, 'Tanggal bergabung baru tidak boleh setelah tanggal join training.')
      }
      if (employee.joinDateBorong && employee.joinDateBorong < target.joinDate) {
        throw new ApiError(422, 'Tanggal bergabung baru tidak boleh setelah tanggal join borong.')
      }
      const [histories] = await conn.query<RowDataPacket[]>(
        "SELECT id,uid FROM employee_employment_histories WHERE employee_id=? AND change_type='INITIAL' AND effective_to IS NULL FOR UPDATE",
        [employee.id]
      )
      const history = histories[0]
      if (!history) throw new ApiError(409, 'Histori registrasi awal tidak ditemukan.')
      const employeeNumber = target.joinDate === employee.joinDate
        ? employee.employeeNumber
        : await reserveEmployeeNumber(conn, {
            siteId: Number(refs.siteId),
            prefix: String(refs.employeeNumberPrefix),
            joinDate: target.joinDate,
          })
      await conn.execute(
        `UPDATE employees
         SET employee_number=?,join_date=?,employee_type_id=?,current_site_id=?,current_department_id=?,current_position_id=?,current_work_group_id=?,current_production_module_section_id=?,updated_by=?
         WHERE id=?`,
        [employeeNumber, target.joinDate, refs.typeId, refs.siteId, refs.departmentId, refs.positionId, refs.workGroupId, refs.productionModuleSectionId, auth.id, employee.id]
      )
      await conn.execute(
        `UPDATE employee_employment_histories
         SET effective_from=?,site_id=?,department_id=?,position_id=?,work_group_id=?,production_module_section_id=?,employee_type_id=?,notes=?,updated_by=?
         WHERE id=?`,
        [target.joinDate, refs.siteId, refs.departmentId, refs.positionId, refs.workGroupId, refs.productionModuleSectionId, refs.typeId, `Koreksi data registrasi: ${input.reason}`, auth.id, history.id]
      )
      await writeAudit({
        auth,
        request: req,
        siteId: refs.siteId,
        action: 'UPDATE',
        table: 'employees',
        recordId: employee.id,
        recordUid: employee.uid,
        description: `Koreksi data registrasi karyawan ${employee.employeeNumber}: tanggal bergabung ${employee.joinDate} menjadi ${target.joinDate}, Employee ID menjadi ${employeeNumber}.`,
      }, conn)
      await writeAudit({
        auth,
        request: req,
        siteId: refs.siteId,
        action: 'UPDATE',
        table: 'employee_employment_histories',
        recordId: history.id,
        recordUid: history.uid,
        description: `Koreksi histori registrasi awal karyawan ${employee.employeeNumber}: tanggal efektif menjadi ${target.joinDate}.`,
      }, conn)
      await conn.commit()
      res.status(204).end()
    } catch (error) {
      await conn.rollback()
      if (error instanceof EmployeeNumberSequenceExhaustedError) {
        throw new ApiError(422, error.message)
      }
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
        throw new ApiError(409, 'Employee ID untuk tanggal bergabung tersebut sudah digunakan. Silakan coba lagi.')
      }
      throw error
    } finally {
      conn.release()
    }
  } catch (error) { next(error) }
})

employeesRouter.patch('/:uid', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = employeeInput.parse(req.body); const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.uid); const current = await employeeAccess(uid, auth); enforceSite(auth, input.site); const photoId = await fileId(input.photoUid)
    if (input.joinDate !== current.joinDate) throw new ApiError(422, 'Tanggal bergabung hanya dapat diubah melalui Koreksi Data Registrasi.')
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
    const input = mutationInput.parse(req.body); const today = businessDate(); if (input.effectiveFrom < today) throw new ApiError(422, 'Tanggal efektif mutasi tidak boleh lampau.'); if (input.effectiveFrom > today) throw new ApiError(422, 'Gunakan jadwalkan mutasi untuk tanggal masa depan.'); const auth = res.locals.auth as AuthContext; const employee = await employeeAccess(routeParam(req.params.uid), auth); validateMutationChange(input, employee); enforceSite(auth, input.site); const refs = await references(input, employee.employeeStatus); const uid = randomUUID(); const conn = await pool.getConnection()
    try {
      await conn.beginTransaction(); const [openSchedules] = await conn.query<RowDataPacket[]>("SELECT id FROM scheduled_employee_mutations WHERE employee_id=? AND status IN ('SCHEDULED','FAILED') FOR UPDATE", [employee.id]); if (openSchedules[0]) throw new ApiError(409, 'Karyawan masih memiliki mutasi terjadwal yang belum diselesaikan.'); const [openStatusChanges] = await conn.query<RowDataPacket[]>("SELECT id FROM scheduled_employee_status_changes WHERE employee_id=? AND status IN ('SCHEDULED','FAILED') FOR UPDATE", [employee.id]); if (openStatusChanges[0]) throw new ApiError(409, 'Karyawan masih memiliki status kerja terjadwal yang belum diselesaikan.'); if (input.changeType === 'TYPE_CHANGE') await assertTypeChangeHasNoOpenContract(conn, employee.id); const [active] = await conn.query<RowDataPacket[]>("SELECT id,employee_status_id statusId,DATE_FORMAT(effective_from, '%Y-%m-%d') effectiveFrom FROM employee_employment_histories WHERE employee_id=? AND effective_to IS NULL FOR UPDATE", [employee.id])
      if (!active[0]) throw new ApiError(409, 'Histori penempatan aktif karyawan tidak ditemukan.')
      if (active[0] && input.effectiveFrom <= active[0].effectiveFrom) throw new ApiError(422, 'Tanggal efektif harus setelah histori aktif.')
      if (active[0]) await conn.execute('UPDATE employee_employment_histories SET effective_to=DATE_SUB(?,INTERVAL 1 DAY),updated_by=? WHERE id=?', [input.effectiveFrom,auth.id,active[0].id])
      await conn.execute(`INSERT INTO employee_employment_histories(uid,employee_id,site_id,department_id,position_id,work_group_id,production_module_section_id,employee_type_id,employee_status_id,effective_from,change_type,reference_number,reason,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [uid,employee.id,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.productionModuleSectionId,refs.typeId,active[0].statusId,input.effectiveFrom,input.changeType,empty(input.referenceNumber),empty(input.reason),empty(input.notes),auth.id,auth.id])
      await conn.execute('UPDATE employees SET employee_type_id=?,current_site_id=?,current_department_id=?,current_position_id=?,current_work_group_id=?,current_production_module_section_id=?,updated_by=? WHERE id=?', [refs.typeId,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.productionModuleSectionId,auth.id,employee.id])
      await reconcileProductionAssignmentsAtEmploymentBoundary(conn, employee.id, input.effectiveFrom, auth.id)
      await writeAudit({ auth, request: req, siteId: refs.siteId, action: 'CREATE', table: 'employee_employment_histories', recordUid: uid, description: `Mencatat mutasi ${input.changeType}.` }, conn); await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})

employeesRouter.post('/mutations/batch', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const { items } = mutationBatchInput.parse(req.body)
    const auth = res.locals.auth as AuthContext
    const today = businessDate()
    const prepared = await Promise.all(
      items.map(async ({ employeeUid, input }) => {
        if (input.effectiveFrom < today) {
          throw new ApiError(422, 'Tanggal efektif mutasi tidak boleh lampau.')
        }
        const employee = await employeeAccess(employeeUid, auth)
        validateMutationChange(input, employee)
        enforceSite(auth, input.site)
        const refs = await references(input, employee.employeeStatus)
        return { employeeUid, input, employee, refs }
      })
    )
    const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const employeeUids = prepared.map((item) => item.employeeUid)
      const placeholders = employeeUids.map(() => '?').join(',')
      const [employees] = await conn.query<RowDataPacket[]>(
        `SELECT e.id,e.uid,e.employee_number employeeNumber,es.code employeeStatus,s.id siteId,s.code site
         FROM employees e
         JOIN employee_statuses es ON es.id=e.employee_status_id
         JOIN sites s ON s.id=e.current_site_id
         WHERE e.uid IN (${placeholders})
         ORDER BY e.id FOR UPDATE`,
        employeeUids
      )
      if (employees.length !== prepared.length) {
        throw new ApiError(404, 'Satu atau lebih karyawan tidak ditemukan.')
      }
      const employeeByUid = new Map(
        employees.map((employee) => [String(employee.uid), employee])
      )
      const employeeIds = employees.map((employee) => Number(employee.id))
      const employeeIdPlaceholders = employeeIds.map(() => '?').join(',')
      const [openSchedules] = await conn.query<RowDataPacket[]>(
        `SELECT employee_id employeeId
         FROM scheduled_employee_mutations
         WHERE employee_id IN (${employeeIdPlaceholders})
           AND status IN ('SCHEDULED','FAILED')
         ORDER BY employee_id FOR UPDATE`,
        employeeIds
      )
      if (openSchedules[0]) {
        const blocked = employees.find(
          (employee) => Number(employee.id) === Number(openSchedules[0].employeeId)
        )
        throw new ApiError(
          409,
          `Karyawan ${blocked?.employeeNumber ?? ''} masih memiliki mutasi terjadwal yang belum diselesaikan.`
        )
      }
      const typeChangeEmployeeIds = prepared
        .filter((item) => item.input.changeType === 'TYPE_CHANGE')
        .map((item) => Number(employeeByUid.get(item.employeeUid)?.id))
      if (typeChangeEmployeeIds.length) {
        const [openContracts] = await conn.query<RowDataPacket[]>(
          `SELECT employee_id employeeId,contract_number contractNumber
           FROM employee_contracts
           WHERE employee_id IN (${typeChangeEmployeeIds.map(() => '?').join(',')})
             AND status IN ('DRAFT','SCHEDULED','ACTIVE')
           ORDER BY employee_id,id FOR UPDATE`,
          typeChangeEmployeeIds
        )
        if (openContracts[0]) {
          const blocked = employees.find((employee) => Number(employee.id) === Number(openContracts[0].employeeId))
          throw new ApiError(409, `Jenis karyawan ${blocked?.employeeNumber ?? ''} tidak dapat diubah selama kontrak ${openContracts[0].contractNumber} masih terbuka.`)
        }
      }
      const [activeHistories] = await conn.query<RowDataPacket[]>(
        `SELECT id,employee_id employeeId,employee_status_id statusId,DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom
         FROM employee_employment_histories
         WHERE employee_id IN (${employeeIdPlaceholders}) AND effective_to IS NULL
         ORDER BY employee_id,id FOR UPDATE`,
        employeeIds
      )
      const activeHistoryByEmployeeId = new Map(
        activeHistories.map((history) => [Number(history.employeeId), history])
      )
      const applied: string[] = []
      const scheduled: string[] = []

      for (const item of prepared) {
        const employee = employeeByUid.get(item.employeeUid)
        if (!employee) throw new ApiError(404, 'Karyawan tidak ditemukan.')
        enforceSite(auth, employee.site)
        enforceSite(auth, item.input.site)
        const active = activeHistoryByEmployeeId.get(Number(employee.id))
        if (!active) {
          throw new ApiError(
            409,
            `Histori penempatan aktif untuk ${employee.employeeNumber} tidak ditemukan.`
          )
        }
        if (item.input.effectiveFrom <= String(active.effectiveFrom)) {
          throw new ApiError(
            422,
            `Tanggal efektif ${employee.employeeNumber} harus setelah histori aktif.`
          )
        }
        const mutationUid = randomUUID()
        if (item.input.effectiveFrom === today) {
          await conn.execute(
            'UPDATE employee_employment_histories SET effective_to=DATE_SUB(?,INTERVAL 1 DAY),updated_by=? WHERE id=?',
            [item.input.effectiveFrom, auth.id, active.id]
          )
          await conn.execute(
            `INSERT INTO employee_employment_histories(uid,employee_id,site_id,department_id,position_id,work_group_id,production_module_section_id,employee_type_id,employee_status_id,effective_from,change_type,reference_number,reason,notes,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              mutationUid,
              employee.id,
              item.refs.siteId,
              item.refs.departmentId,
              item.refs.positionId,
              item.refs.workGroupId,
              item.refs.productionModuleSectionId,
              item.refs.typeId,
              active.statusId,
              item.input.effectiveFrom,
              item.input.changeType,
              empty(item.input.referenceNumber),
              empty(item.input.reason),
              empty(item.input.notes),
              auth.id,
              auth.id,
            ]
          )
          await conn.execute(
            'UPDATE employees SET employee_type_id=?,current_site_id=?,current_department_id=?,current_position_id=?,current_work_group_id=?,current_production_module_section_id=?,updated_by=? WHERE id=?',
            [
              item.refs.typeId,
              item.refs.siteId,
              item.refs.departmentId,
              item.refs.positionId,
              item.refs.workGroupId,
              item.refs.productionModuleSectionId,
              auth.id,
              employee.id,
            ]
          )
          await reconcileProductionAssignmentsAtEmploymentBoundary(
            conn,
            Number(employee.id),
            item.input.effectiveFrom,
            auth.id
          )
          await writeAudit(
            {
              auth,
              request: req,
              siteId: item.refs.siteId,
              action: 'CREATE',
              table: 'employee_employment_histories',
              recordUid: mutationUid,
              description: `Mencatat mutasi batch ${item.input.changeType} untuk ${employee.employeeNumber}.`,
            },
            conn
          )
          applied.push(item.employeeUid)
        } else {
          await conn.execute(
            `INSERT INTO scheduled_employee_mutations(uid,employee_id,base_history_id,target_site_id,target_department_id,target_position_id,target_work_group_id,target_production_module_section_id,target_employee_type_id,effective_from,change_type,reference_number,reason,notes,status,created_by,updated_by)
             VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'SCHEDULED',?,?)`,
            [
              mutationUid,
              employee.id,
              active.id,
              item.refs.siteId,
              item.refs.departmentId,
              item.refs.positionId,
              item.refs.workGroupId,
              item.refs.productionModuleSectionId,
              item.refs.typeId,
              item.input.effectiveFrom,
              item.input.changeType,
              empty(item.input.referenceNumber),
              empty(item.input.reason),
              empty(item.input.notes),
              auth.id,
              auth.id,
            ]
          )
          await writeAudit(
            {
              auth,
              request: req,
              siteId: item.refs.siteId,
              action: 'CREATE',
              table: 'scheduled_employee_mutations',
              recordUid: mutationUid,
              description: `Menjadwalkan mutasi batch ${item.input.changeType} untuk ${employee.employeeNumber} pada ${item.input.effectiveFrom}.`,
            },
            conn
          )
          scheduled.push(item.employeeUid)
        }
      }
      await conn.commit()
      res.status(201).json({ applied: applied.length, scheduled: scheduled.length })
    } catch (error) {
      await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  } catch (error) {
    next(error)
  }
})

employeesRouter.post('/:uid/scheduled-mutations', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = mutationInput.parse(req.body); const today = businessDate(); if (input.effectiveFrom <= today) throw new ApiError(422, 'Mutasi terjadwal harus memakai tanggal setelah hari ini.'); const auth = res.locals.auth as AuthContext; const employee = await employeeAccess(routeParam(req.params.uid), auth); validateMutationChange(input, employee); enforceSite(auth, input.site); const refs = await references(input, employee.employeeStatus); const uid = randomUUID(); const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [open] = await conn.query<RowDataPacket[]>("SELECT id FROM scheduled_employee_mutations WHERE employee_id=? AND status IN ('SCHEDULED','FAILED') FOR UPDATE", [employee.id]); if (open[0]) throw new ApiError(409, 'Karyawan hanya dapat memiliki satu mutasi terjadwal yang belum diselesaikan.'); const [openStatusChanges] = await conn.query<RowDataPacket[]>("SELECT id FROM scheduled_employee_status_changes WHERE employee_id=? AND status IN ('SCHEDULED','FAILED') FOR UPDATE", [employee.id]); if (openStatusChanges[0]) throw new ApiError(409, 'Karyawan masih memiliki status kerja terjadwal yang belum diselesaikan.'); if (input.changeType === 'TYPE_CHANGE') await assertTypeChangeHasNoOpenContract(conn, employee.id)
      const [active] = await conn.query<RowDataPacket[]>("SELECT id,DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom FROM employee_employment_histories WHERE employee_id=? AND effective_to IS NULL FOR UPDATE", [employee.id]); if (!active[0]) throw new ApiError(409, 'Histori penempatan aktif karyawan tidak ditemukan.'); if (input.effectiveFrom <= active[0].effectiveFrom) throw new ApiError(422, 'Tanggal efektif harus setelah histori aktif.')
      await conn.execute(`INSERT INTO scheduled_employee_mutations(uid,employee_id,base_history_id,target_site_id,target_department_id,target_position_id,target_work_group_id,target_production_module_section_id,target_employee_type_id,effective_from,change_type,reference_number,reason,notes,status,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'SCHEDULED',?,?)`, [uid,employee.id,active[0].id,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.productionModuleSectionId,refs.typeId,input.effectiveFrom,input.changeType,empty(input.referenceNumber),empty(input.reason),empty(input.notes),auth.id,auth.id])
      await writeAudit({ auth, request: req, siteId: refs.siteId, action: 'CREATE', table: 'scheduled_employee_mutations', recordUid: uid, description: `Menjadwalkan mutasi ${input.changeType} pada ${input.effectiveFrom}.` }, conn); await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})

employeesRouter.patch('/scheduled-mutations/:scheduledUid', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = mutationInput.parse(req.body); const today = businessDate(); if (input.effectiveFrom <= today) throw new ApiError(422, 'Jadwal mutasi harus memakai tanggal setelah hari ini.'); const auth = res.locals.auth as AuthContext; const scheduleUid = routeParam(req.params.scheduledUid); const [existingRows] = await pool.query<RowDataPacket[]>(`SELECT sm.id,sm.employee_id employeeId,e.uid employeeUid,es.code employeeStatus,s.code sourceSite FROM scheduled_employee_mutations sm JOIN employees e ON e.id=sm.employee_id JOIN employee_statuses es ON es.id=e.employee_status_id JOIN sites s ON s.id=e.current_site_id WHERE sm.uid=?`, [scheduleUid]); const existing=existingRows[0]; if (!existing) throw new ApiError(404,'Mutasi terjadwal tidak ditemukan.'); const employee = await employeeAccess(existing.employeeUid, auth); validateMutationChange(input, employee); enforceSite(auth,existing.sourceSite); enforceSite(auth,input.site); const refs=await references(input,existing.employeeStatus); const conn=await pool.getConnection()
    try { await conn.beginTransaction(); const [locked] = await conn.query<RowDataPacket[]>("SELECT id,status FROM scheduled_employee_mutations WHERE id=? FOR UPDATE",[existing.id]); if (!locked[0] || !['SCHEDULED','FAILED'].includes(locked[0].status)) throw new ApiError(409,'Mutasi terjadwal ini tidak dapat diubah.'); if (input.changeType === 'TYPE_CHANGE') await assertTypeChangeHasNoOpenContract(conn, existing.employeeId); const [active] = await conn.query<RowDataPacket[]>("SELECT id,DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom FROM employee_employment_histories WHERE employee_id=? AND effective_to IS NULL FOR UPDATE",[existing.employeeId]); if(!active[0]) throw new ApiError(409,'Histori penempatan aktif karyawan tidak ditemukan.'); if(input.effectiveFrom<=active[0].effectiveFrom) throw new ApiError(422,'Tanggal efektif harus setelah histori aktif.'); await conn.execute(`UPDATE scheduled_employee_mutations SET base_history_id=?,target_site_id=?,target_department_id=?,target_position_id=?,target_work_group_id=?,target_production_module_section_id=?,target_employee_type_id=?,effective_from=?,change_type=?,reference_number=?,reason=?,notes=?,status='SCHEDULED',failure_reason=NULL,updated_by=? WHERE id=?`,[active[0].id,refs.siteId,refs.departmentId,refs.positionId,refs.workGroupId,refs.productionModuleSectionId,refs.typeId,input.effectiveFrom,input.changeType,empty(input.referenceNumber),empty(input.reason),empty(input.notes),auth.id,existing.id]); await writeAudit({auth,request:req,siteId:refs.siteId,action:'UPDATE',table:'scheduled_employee_mutations',recordUid:scheduleUid,description:`Memperbarui jadwal mutasi menjadi ${input.effectiveFrom}.`},conn); await conn.commit() } catch(error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(204).end()
  } catch(error) { next(error) }
})

employeesRouter.post('/scheduled-mutations/:scheduledUid/cancel', requirePermission('employees.manage'), async (req,res,next) => {
  try { const auth=res.locals.auth as AuthContext; const scheduleUid=routeParam(req.params.scheduledUid); const conn=await pool.getConnection(); try { await conn.beginTransaction(); const [rows]=await conn.query<RowDataPacket[]>(`SELECT sm.id,sm.status,e.current_site_id siteId,s.code site FROM scheduled_employee_mutations sm JOIN employees e ON e.id=sm.employee_id JOIN sites s ON s.id=e.current_site_id WHERE sm.uid=? FOR UPDATE`,[scheduleUid]); const schedule=rows[0]; if(!schedule) throw new ApiError(404,'Mutasi terjadwal tidak ditemukan.'); enforceSite(auth,schedule.site); if(!['SCHEDULED','FAILED'].includes(schedule.status)) throw new ApiError(409,'Mutasi terjadwal ini tidak dapat dibatalkan.'); await conn.execute("UPDATE scheduled_employee_mutations SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP(3),updated_by=? WHERE id=?",[auth.id,schedule.id]); await writeAudit({auth,request:req,siteId:schedule.siteId,action:'UPDATE',table:'scheduled_employee_mutations',recordUid:scheduleUid,description:'Membatalkan mutasi terjadwal.'},conn); await conn.commit() } catch(error) { await conn.rollback(); throw error } finally {conn.release()} res.status(204).end() } catch(error){next(error)}
})

employeesRouter.post('/contracts/:contractUid/scheduled-status-changes', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = scheduledStatusChangeInput.parse(req.body)
    const auth = res.locals.auth as AuthContext
    const today = businessDate()
    if (input.effectiveDate <= today) throw new ApiError(422, 'Status kerja terjadwal harus memakai tanggal setelah hari ini.')
    const uid = randomUUID(); const contractUid = routeParam(req.params.contractUid); const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [rows] = await conn.query<RowDataPacket[]>(`SELECT c.id,c.uid,c.employee_id,c.start_date,DATE_FORMAT(c.end_date,'%Y-%m-%d') endDate,c.status,e.employee_status_id,es.code employeeStatus,e.current_site_id siteId,s.code site FROM employee_contracts c JOIN employees e ON e.id=c.employee_id JOIN employee_statuses es ON es.id=e.employee_status_id JOIN sites s ON s.id=e.current_site_id WHERE c.uid=? FOR UPDATE`, [contractUid])
      const contract = rows[0]
      if (!contract) throw new ApiError(404, 'Kontrak tidak ditemukan.')
      enforceSite(auth, contract.site)
      if (contract.status !== 'ACTIVE' || contract.employeeStatus !== 'ACTIVE') throw new ApiError(422, 'Jadwal hanya dapat dibuat dari kontrak Aktif milik karyawan Aktif.')
      assertScheduledStatusWithinContract(input.effectiveDate, contract.endDate)
      const [newer] = await conn.query<RowDataPacket[]>('SELECT id FROM employee_contracts WHERE employee_id=? AND (start_date>? OR (start_date=? AND id>?)) LIMIT 1 FOR UPDATE', [contract.employee_id, contract.start_date, contract.start_date, contract.id])
      if (newer[0]) throw new ApiError(409, 'Jadwal hanya dapat dibuat dari kontrak terakhir karyawan.')
      const [openStatus] = await conn.query<RowDataPacket[]>("SELECT id FROM scheduled_employee_status_changes WHERE employee_id=? AND status IN ('SCHEDULED','FAILED') FOR UPDATE", [contract.employee_id])
      if (openStatus[0]) throw new ApiError(409, 'Karyawan sudah memiliki status kerja terjadwal yang belum diselesaikan.')
      const [openMutation] = await conn.query<RowDataPacket[]>("SELECT id FROM scheduled_employee_mutations WHERE employee_id=? AND status IN ('SCHEDULED','FAILED') FOR UPDATE", [contract.employee_id])
      if (openMutation[0]) throw new ApiError(409, 'Karyawan masih memiliki mutasi terjadwal yang belum diselesaikan.')
      await conn.execute(`INSERT INTO scheduled_employee_status_changes(uid,employee_id,contract_id,action,effective_date,reason,status,created_by,updated_by) VALUES(?,?,?,?,?,?,'SCHEDULED',?,?)`, [uid, contract.employee_id, contract.id, input.action, input.effectiveDate, input.reason, auth.id, auth.id])
      await writeAudit({ auth, request: req, siteId: contract.siteId, action: 'CREATE', table: 'scheduled_employee_status_changes', recordUid: uid, description: `Menjadwalkan ${input.action} pada ${input.effectiveDate}.` }, conn)
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})

employeesRouter.patch('/scheduled-status-changes/:scheduledUid', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = scheduledStatusChangeInput.parse(req.body); const today = businessDate()
    if (input.effectiveDate <= today) throw new ApiError(422, 'Jadwal status kerja harus memakai tanggal setelah hari ini.')
    const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.scheduledUid); const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [rows] = await conn.query<RowDataPacket[]>(`SELECT sc.id,sc.status,DATE_FORMAT(c.end_date,'%Y-%m-%d') contractEndDate,e.current_site_id siteId,s.code site FROM scheduled_employee_status_changes sc JOIN employees e ON e.id=sc.employee_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN employee_contracts c ON c.id=sc.contract_id WHERE sc.uid=? FOR UPDATE`, [uid])
      const schedule = rows[0]; if (!schedule) throw new ApiError(404, 'Jadwal status kerja tidak ditemukan.'); enforceSite(auth, schedule.site)
      if (!['SCHEDULED', 'FAILED'].includes(schedule.status)) throw new ApiError(409, 'Jadwal status kerja ini tidak dapat diubah.')
      assertScheduledStatusWithinContract(input.effectiveDate, schedule.contractEndDate)
      await conn.execute("UPDATE scheduled_employee_status_changes SET action=?,effective_date=?,reason=?,status='SCHEDULED',failure_reason=NULL,updated_by=? WHERE id=?", [input.action, input.effectiveDate, input.reason, auth.id, schedule.id])
      await writeAudit({ auth, request: req, siteId: schedule.siteId, action: 'UPDATE', table: 'scheduled_employee_status_changes', recordUid: uid, description: `Memperbarui jadwal status kerja menjadi ${input.effectiveDate}.` }, conn)
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(204).end()
  } catch (error) { next(error) }
})

employeesRouter.post('/scheduled-status-changes/:scheduledUid/cancel', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext; const uid = routeParam(req.params.scheduledUid); const conn = await pool.getConnection()
    try {
      await conn.beginTransaction()
      const [rows] = await conn.query<RowDataPacket[]>(`SELECT sc.id,sc.status,e.current_site_id siteId,s.code site FROM scheduled_employee_status_changes sc JOIN employees e ON e.id=sc.employee_id JOIN sites s ON s.id=e.current_site_id WHERE sc.uid=? FOR UPDATE`, [uid])
      const schedule = rows[0]; if (!schedule) throw new ApiError(404, 'Jadwal status kerja tidak ditemukan.'); enforceSite(auth, schedule.site)
      if (!['SCHEDULED', 'FAILED'].includes(schedule.status)) throw new ApiError(409, 'Jadwal status kerja ini tidak dapat dibatalkan.')
      await conn.execute("UPDATE scheduled_employee_status_changes SET status='CANCELLED',cancelled_at=CURRENT_TIMESTAMP(3),updated_by=? WHERE id=?", [auth.id, schedule.id])
      await writeAudit({ auth, request: req, siteId: schedule.siteId, action: 'UPDATE', table: 'scheduled_employee_status_changes', recordUid: uid, description: 'Membatalkan jadwal status kerja.' }, conn)
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally { conn.release() }
    res.status(204).end()
  } catch (error) { next(error) }
})

async function createDraftContract(
  conn: PoolConnection,
  auth: AuthContext,
  request: Request,
  employeeUid: string,
  input: z.infer<typeof contractCreateInput>
) {
  const uid = randomUUID()
  const [employees] = await conn.query<RowDataPacket[]>(
    "SELECT e.id,e.uid,e.employee_number employeeNumber,DATE_FORMAT(e.join_date,'%Y-%m-%d') joinDate,et.code employeeType,s.id siteId,s.code site,p.name position FROM employees e JOIN employee_types et ON et.id=e.employee_type_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN positions p ON p.id=e.current_position_id WHERE e.uid=? FOR UPDATE",
    [employeeUid]
  )
  const employee = employees[0]
  if (!employee) throw new ApiError(404, 'Karyawan tidak ditemukan.')
  enforceSite(auth, employee.site)
  await assertNoOpenScheduledStatusChange(conn, employee.id)
  const contractTypeCode = input.contractType
  const [contractTypes] = await conn.query<RowDataPacket[]>(
    'SELECT id,code FROM contract_types WHERE code=? AND is_active=1 FOR UPDATE',
    [contractTypeCode]
  )
  const contractType = contractTypes[0]
  if (!contractType) throw new ApiError(422, 'Tipe kontrak tidak valid atau tidak aktif.')
  if (!isContractTypeAllowed(contractType.code)) throw new ApiError(422, contractTypeRuleMessage())
  if (!isContractEmployeeTypeCombinationAllowed(contractType.code, employee.employeeType)) {
    throw new ApiError(422, contractEmployeeTypeRuleMessage())
  }
  const [sequences] = await conn.query<RowDataPacket[]>(
    'SELECT COALESCE(MAX(sequence_number), 0) + 1 nextSequence FROM employee_contracts WHERE employee_id=?',
    [employee.id]
  )
  const sequenceNumber = Number(sequences[0]?.nextSequence ?? 1)
  const contractNumberSequence = await nextContractNumberSequence(
    conn,
    employee.site,
    input.startDate
  )
  const contractNumber = formatContractNumber(
    contractType.code,
    employee.site,
    contractNumberSequence,
    input.startDate
  )
  await assertContractRules(
    conn,
    employee.id,
    contractType.code,
    input.startDate,
    input.endDate,
    undefined,
    employee.joinDate
  )
  await conn.execute(
    `INSERT INTO employee_contracts(uid,employee_id,contract_number,contract_type_id,sequence_number,start_date,end_date,signed_date,status,position_name_snapshot,site_name_snapshot,issued_file_id,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      uid,
      employee.id,
      contractNumber,
      contractType.id,
      sequenceNumber,
      input.startDate,
      empty(input.endDate),
      empty(input.signedDate),
      'DRAFT',
      employee.position,
      `Site ${employee.site}`,
      await fileId(input.issuedFileUid),
      empty(input.notes),
      auth.id,
      auth.id,
    ]
  )
  await writeAudit({
    auth,
    request,
    siteId: employee.siteId,
    action: 'CREATE',
    table: 'employee_contracts',
    recordUid: uid,
    description: `Menambah kontrak ${contractNumber}.`,
  }, conn)
  return { uid, employeeUid: String(employee.uid), contractNumber }
}

employeesRouter.post('/contracts/batch', requirePermission('employees.manage'), async (req, res, next) => {
  const conn = await pool.getConnection()
  let contractNumberLockAcquired = false
  try {
    const { items } = contractBatchInput.parse(req.body)
    const auth = res.locals.auth as AuthContext
    await conn.beginTransaction()
    await acquireContractNumberLock(conn)
    contractNumberLockAcquired = true
    const created = []
    for (const item of items) {
      created.push(
        await createDraftContract(conn, auth, req, item.employeeUid, {
          ...item.input,
          signedDate: undefined,
        })
      )
    }
    await conn.commit()
    res.status(201).json({ created })
  } catch (error) {
    await conn.rollback()
    next(error)
  } finally {
    let connectionDestroyed = false
    if (contractNumberLockAcquired) {
      try { await releaseContractNumberLock(conn) } catch { conn.destroy(); connectionDestroyed = true }
    }
    if (!connectionDestroyed) conn.release()
  }
})

employeesRouter.post('/:uid/contracts', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = contractCreateInput.parse(req.body); const auth = res.locals.auth as AuthContext; const conn = await pool.getConnection()
    let uid = ''
    let contractNumberLockAcquired = false
    try {
      await conn.beginTransaction()
      await acquireContractNumberLock(conn)
      contractNumberLockAcquired = true
      const created = await createDraftContract(conn, auth, req, routeParam(req.params.uid), input)
      uid = created.uid
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally {
      let connectionDestroyed = false
      if (contractNumberLockAcquired) {
        try { await releaseContractNumberLock(conn) } catch { conn.destroy(); connectionDestroyed = true }
      }
      if (!connectionDestroyed) conn.release()
    }
    res.status(201).json({ uid })
  } catch (error) { next(error) }
})
employeesRouter.patch('/contracts/:contractUid', requirePermission('employees.manage'), async (req, res, next) => {
  try {
    const input = contractUpdateInput.parse(req.body)
    const auth = res.locals.auth as AuthContext
    const contractUid = routeParam(req.params.contractUid)
    const conn = await pool.getConnection()
    let contractNumberLockAcquired = false
    try {
      await conn.beginTransaction()
      await acquireContractNumberLock(conn)
      contractNumberLockAcquired = true
      const [rows] = await conn.query<RowDataPacket[]>(`SELECT c.id,c.uid,c.employee_id,c.contract_number,c.sequence_number,c.status,c.site_name_snapshot siteNameSnapshot,ct.code contractType,et.code employeeType,DATE_FORMAT(c.start_date,'%Y-%m-%d') startDate,DATE_FORMAT(c.end_date,'%Y-%m-%d') endDate,DATE_FORMAT(c.signed_date,'%Y-%m-%d') signedDate,c.notes,DATE_FORMAT(e.join_date,'%Y-%m-%d') joinDate,s.id siteId,s.code site FROM employee_contracts c JOIN contract_types ct ON ct.id=c.contract_type_id JOIN employees e ON e.id=c.employee_id JOIN employee_types et ON et.id=e.employee_type_id JOIN sites s ON s.id=e.current_site_id WHERE c.uid=? FOR UPDATE`, [contractUid])
      const contract = rows[0]
      if (!contract) throw new ApiError(404, 'Kontrak tidak ditemukan.')
      enforceSite(auth, contract.site)
      if (['EXPIRED', 'TERMINATED', 'CANCELLED'].includes(contract.status)) throw new ApiError(409, 'Kontrak final tidak dapat diubah.')
      if (!['DRAFT', 'SCHEDULED'].includes(contract.status) && input.contractType !== contract.contractType) throw new ApiError(422, 'Jenis kontrak hanya dapat diubah saat status Draft atau Dijadwalkan.')
      if (contract.status === 'ACTIVE' && (input.startDate !== contract.startDate || (input.endDate ?? null) !== (contract.endDate ?? null))) throw new ApiError(422, 'Periode kontrak aktif tidak dapat diubah. Terminasi kontrak lama lalu buat kontrak baru.')
      const [types] = await conn.query<RowDataPacket[]>('SELECT id,code FROM contract_types WHERE code=? AND is_active=1 FOR UPDATE', [input.contractType])
      const type = types[0]
      if (!type) throw new ApiError(422, 'Tipe kontrak tidak valid atau tidak aktif.')
      if (!isContractTypeAllowed(type.code)) throw new ApiError(422, contractTypeRuleMessage())
      if (!isContractEmployeeTypeCombinationAllowed(type.code, contract.employeeType)) {
        throw new ApiError(422, contractEmployeeTypeRuleMessage())
      }
      await assertNoOpenScheduledStatusChange(conn, contract.employee_id, contract.id)
      await assertContractRules(conn, contract.employee_id, type.code, input.startDate, input.endDate, contract.id, contract.joinDate)
      const contractNumberSite = contractNumberSiteFromSnapshot(
        contract.siteNameSnapshot,
        contract.site
      )
      const preservedContractNumberSequence = canPreserveContractNumberSequence(
        contract.contract_number,
        contractNumberSite,
        input.startDate
      )
      const contractNumberSequence = preservedContractNumberSequence ?? await nextContractNumberSequence(
        conn,
        contractNumberSite,
        input.startDate
      )
      const contractNumber = contract.status === 'ACTIVE'
        ? contract.contract_number
        : formatContractNumber(type.code, contractNumberSite, contractNumberSequence, input.startDate)
      await conn.execute("UPDATE employee_contracts SET contract_number=?,contract_type_id=?,start_date=?,end_date=?,signed_date=?,issued_file_id=?,notes=?,terms_json=JSON_REMOVE(COALESCE(terms_json,JSON_OBJECT()), '$.contractPrintV1', '$.contractPrintV2'),updated_by=? WHERE id=?", [contractNumber,type.id,input.startDate,empty(input.endDate),empty(input.signedDate),await fileId(input.issuedFileUid),empty(input.notes),auth.id,contract.id])
      await synchronizeActiveContractAfterEdit(conn,{ id: contract.id, uid: contract.uid, employeeId: contract.employee_id, siteId: contract.siteId, status: contract.status, startDate: input.startDate, endDate: input.endDate },auth)
      await writeAudit({
        auth,
        request: req,
        siteId: contract.siteId,
        action: 'UPDATE',
        table: 'employee_contracts',
        recordId: contract.id,
        recordUid: contractUid,
        description: `Memperbarui kontrak ${contractNumber}.`,
        beforeData: {
          contractNumber: contract.contract_number,
          contractType: contract.contractType,
          startDate: contract.startDate,
          endDate: contract.endDate,
          signedDate: contract.signedDate,
          notes: contract.notes,
        },
        afterData: {
          contractNumber,
          contractType: input.contractType,
          startDate: input.startDate,
          endDate: input.endDate ?? null,
          signedDate: input.signedDate ?? null,
          notes: input.notes ?? null,
        },
      }, conn)
      await conn.commit()
    } catch (error) { await conn.rollback(); throw error } finally {
      let connectionDestroyed = false
      if (contractNumberLockAcquired) {
        try { await releaseContractNumberLock(conn) } catch { conn.destroy(); connectionDestroyed = true }
      }
      if (!connectionDestroyed) conn.release()
    }
    res.status(204).end()
  } catch (error) { next(error) }
})
employeesRouter.post('/contracts/:contractUid/:action', requirePermission('employees.manage'), async (req,res,next)=>{ try { const action=z.enum(['schedule','activate','terminate','resign','cancel','cancel_activation','close_expired_terminate','close_expired_resign','resolve_active_conflict']).parse(req.params.action); const input=z.object({effectiveDate:z.string().date().optional(),reason:z.string().trim().min(1).max(500).optional()}).parse(req.body); const contractUid=routeParam(req.params.contractUid); if (action === 'cancel_activation') { res.json(await cancelActiveContractActivation(contractUid,input,res.locals.auth,{ip:req.ip,userAgent:req.get('user-agent')})); return } if (action === 'close_expired_terminate' || action === 'close_expired_resign') { res.json(await closeExpiredContractEmployeeStatus(contractUid,action,input,res.locals.auth)); return } if (action === 'resolve_active_conflict') { res.json(await resolveActiveContractConflict(contractUid,input,res.locals.auth)); return } res.json(await transitionContract(contractUid,action,input,res.locals.auth)) }catch(error){next(error)} })
employeesRouter.post('/:uid/documents', requirePermission('documents.manage'), async (req, res, next) => {
  try { const input = documentInput.parse(req.body); const auth = res.locals.auth as AuthContext; const employee = await employeeAccess(routeParam(req.params.uid), auth); const uid = randomUUID(); await pool.execute('INSERT INTO employee_documents(uid,employee_id,document_type,document_number,name,file_id,issued_date,expiry_date,status,notes,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', [uid,employee.id,input.documentType,empty(input.documentNumber),input.name,await fileId(input.fileUid),empty(input.issuedDate),empty(input.expiryDate),input.status,empty(input.notes),auth.id,auth.id]); await writeAudit({ auth, request: req, siteId: employee.siteId, action: 'CREATE', table: 'employee_documents', recordUid: uid, description: `Menambah dokumen ${input.name}.` }); res.status(201).json({ uid }) } catch (error) { next(error) }
})
employeesRouter.patch('/documents/:documentUid', requirePermission('documents.manage'), async (req, res, next) => {
  try { const input = documentInput.parse(req.body); const auth = res.locals.auth as AuthContext; const documentUid = routeParam(req.params.documentUid); const [rows] = await pool.query<RowDataPacket[]>('SELECT d.id,s.id siteId,s.code site FROM employee_documents d JOIN employees e ON e.id=d.employee_id JOIN sites s ON s.id=e.current_site_id WHERE d.uid=?', [documentUid]); if (!rows[0]) throw new ApiError(404, 'Dokumen tidak ditemukan.'); enforceSite(auth, rows[0].site); await pool.execute('UPDATE employee_documents SET document_type=?,document_number=?,name=?,file_id=?,issued_date=?,expiry_date=?,status=?,notes=?,updated_by=? WHERE id=?', [input.documentType,empty(input.documentNumber),input.name,await fileId(input.fileUid),empty(input.issuedDate),empty(input.expiryDate),input.status,empty(input.notes),auth.id,rows[0].id]); await writeAudit({ auth, request: req, siteId: rows[0].siteId, action: 'UPDATE', table: 'employee_documents', recordId: rows[0].id, recordUid: documentUid, description: `Memperbarui dokumen ${input.name}.` }); res.status(204).end() } catch (error) { next(error) }
})

function contractFrom() { return `FROM employee_contracts c JOIN contract_types ct ON ct.id=c.contract_type_id JOIN employees e ON e.id=c.employee_id JOIN employee_statuses currentEs ON currentEs.id=e.employee_status_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN production_module_sections pms ON pms.id=e.current_production_module_section_id LEFT JOIN production_modules pm ON pm.id=pms.production_module_id LEFT JOIN production_sections ps ON ps.id=pms.production_section_id LEFT JOIN files f ON f.id=c.issued_file_id` }
function contractCoverageFrom() { return `FROM employees e JOIN employee_types et ON et.id=e.employee_type_id JOIN employee_statuses es ON es.id=e.employee_status_id JOIN sites s ON s.id=e.current_site_id LEFT JOIN production_module_sections pms ON pms.id=e.current_production_module_section_id LEFT JOIN production_modules pm ON pm.id=pms.production_module_id LEFT JOIN production_sections ps ON ps.id=pms.production_section_id LEFT JOIN employee_contracts c ON c.employee_id=e.id AND NOT EXISTS(SELECT 1 FROM employee_contracts newer WHERE newer.employee_id=e.id AND (newer.start_date>c.start_date OR (newer.start_date=c.start_date AND newer.id>c.id))) LEFT JOIN contract_types ct ON ct.id=c.contract_type_id LEFT JOIN files f ON f.id=c.issued_file_id` }
function contractSelect() { return `SELECT c.id internalContractId,c.uid,e.uid employeeUid,e.full_name employeeName,et.code employeeType,currentEs.code employeeStatus,s.code site,pm.name productionModule,ps.name productionSection,c.contract_number contractNumber,ct.code contractType,c.sequence_number sequenceNumber,DATE_FORMAT(c.start_date,'%Y-%m-%d') startDate,DATE_FORMAT(c.end_date,'%Y-%m-%d') endDate,DATE_FORMAT(c.signed_date,'%Y-%m-%d') signedDate,c.status,DATE_FORMAT(c.terminated_at,'%Y-%m-%d') terminatedAt,c.termination_reason terminationReason,c.position_name_snapshot positionNameSnapshot,c.site_name_snapshot siteNameSnapshot,c.salary_or_rate_notes salaryOrRateNotes,c.notes,NOT EXISTS(SELECT 1 FROM employee_contracts newer WHERE newer.employee_id=c.employee_id AND (newer.start_date>c.start_date OR (newer.start_date=c.start_date AND newer.id>c.id))) isLatestForEmployee,(SELECT COUNT(*) FROM employee_contracts activeContract WHERE activeContract.employee_id=c.employee_id AND activeContract.status='ACTIVE' AND activeContract.start_date<=DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+07:00')) AND (activeContract.end_date IS NULL OR activeContract.end_date>=DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+07:00')))) activeValidContractCount,0 isMissingContract,0 isCoverageIssue,f.uid issuedFileUid,f.original_name issuedFileName,f.mime_type issuedFileMimeType,f.size_bytes issuedFileSizeBytes,f.extension issuedFileExtension,f.storage_path issuedFilePath ${contractFrom()} JOIN employee_types et ON et.id=e.employee_type_id` }
function contractCoverageSelect() { return `SELECT COALESCE(c.uid,e.uid) uid,e.uid employeeUid,e.full_name employeeName,et.code employeeType,es.code employeeStatus,s.code site,pm.name productionModule,ps.name productionSection,COALESCE(c.contract_number,'Belum ada kontrak') contractNumber,COALESCE(ct.code,'MISSING') contractType,COALESCE(c.sequence_number,0) sequenceNumber,DATE_FORMAT(c.start_date,'%Y-%m-%d') startDate,DATE_FORMAT(c.end_date,'%Y-%m-%d') endDate,DATE_FORMAT(c.signed_date,'%Y-%m-%d') signedDate,COALESCE(c.status,'MISSING') status,DATE_FORMAT(c.terminated_at,'%Y-%m-%d') terminatedAt,c.termination_reason terminationReason,c.position_name_snapshot positionNameSnapshot,c.site_name_snapshot siteNameSnapshot,c.salary_or_rate_notes salaryOrRateNotes,c.notes,1 isLatestForEmployee,(SELECT COUNT(*) FROM employee_contracts activeContract WHERE activeContract.employee_id=e.id AND activeContract.status='ACTIVE' AND activeContract.start_date<=DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+07:00')) AND (activeContract.end_date IS NULL OR activeContract.end_date>=DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','+07:00')))) activeValidContractCount,(c.id IS NULL) isMissingContract,1 isCoverageIssue,f.uid issuedFileUid,f.original_name issuedFileName,f.mime_type issuedFileMimeType,f.size_bytes issuedFileSizeBytes,f.extension issuedFileExtension,f.storage_path issuedFilePath ${contractCoverageFrom()}` }
function mapContract(row: RowDataPacket) { const { internalContractId: _internalContractId, issuedFileUid, issuedFileName, issuedFileMimeType, issuedFileSizeBytes, issuedFileExtension, issuedFilePath, employeeName, site, employeeType, employeeStatus, isLatestForEmployee, activeValidContractCount, isMissingContract, isCoverageIssue, ...contract } = row; const today = businessDate(); const endDate = String(contract.endDate ?? ''); const isExpiringWithin7Days = contract.status === 'ACTIVE' && endDate >= today && endDate <= addBusinessDays(today, 7); return { ...contract, employeeName, site, employeeType, employeeStatus, isLatestForEmployee: Boolean(isLatestForEmployee), activeValidContractCount: Number(activeValidContractCount ?? 0), isMissingContract: Boolean(isMissingContract), isCoverageIssue: Boolean(isCoverageIssue), isExpiringWithin7Days, issuedFile: issuedFileUid ? { uid: issuedFileUid, originalName: issuedFileName, mimeType: issuedFileMimeType, sizeBytes: Number(issuedFileSizeBytes), extension: issuedFileExtension, url: fileUrl(issuedFilePath) } : undefined } }
function parseAuditData(value: unknown) { if (!value) return undefined; if (typeof value === 'object') return value; if (typeof value !== 'string') return undefined; try { return JSON.parse(value) } catch { return undefined } }
function addBusinessDays(date: string, days: number) { const value = new Date(`${date}T00:00:00.000Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10) }
function documentFrom() { return `FROM employee_documents d JOIN employees e ON e.id=d.employee_id JOIN sites s ON s.id=e.current_site_id JOIN files f ON f.id=d.file_id` }
function documentSelect() { return `SELECT d.uid,e.uid employeeUid,e.full_name employeeName,s.code site,d.document_type documentType,d.document_number documentNumber,d.name,DATE_FORMAT(d.issued_date,'%Y-%m-%d') issuedDate,DATE_FORMAT(d.expiry_date,'%Y-%m-%d') expiryDate,d.status,d.notes,f.uid fileUid,f.original_name originalName,f.mime_type mimeType,f.size_bytes sizeBytes,f.extension,f.storage_path filePath ${documentFrom()}` }
function mapDocument(row: RowDataPacket) { const { fileUid, originalName, mimeType, sizeBytes, extension, filePath, employeeName, site, ...document } = row; return { ...document, employeeName, site, file: { uid: fileUid, originalName, mimeType, sizeBytes: Number(sizeBytes), extension, url: fileUrl(filePath) } } }
