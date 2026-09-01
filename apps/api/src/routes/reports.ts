import { createHash, randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { env } from '../config.js'
import { pool } from '../db.js'
import {
  aggregateAttendanceRecap,
  loadAttendanceRecapProjection,
  summarizeAttendanceRecap,
  type AttendanceRecapDetail,
  type AttendanceRecapSite,
} from '../lib/attendance-recap.js'
import {
  attendanceRecapPeriodInput,
  recapAttendanceStatuses,
} from '../lib/attendance-recap-policy.js'
import { ApiError } from '../lib/errors.js'
import { jakartaDateTime } from '../lib/attendance-finalization-policy.js'
import { writeAudit } from '../lib/audit.js'
import {
  buildAttendanceClassificationReportWorkbook,
  buildAttendanceCorrectionReportWorkbook,
  buildContractReportWorkbook,
  buildDeviceScanReportWorkbook,
  buildEmployeeReportWorkbook,
  buildMutationReportWorkbook,
  buildPayrollFinalReportWorkbook,
  buildShiftAssignmentReportWorkbook,
  type AttendanceClassificationReportExportRow,
  type AttendanceCorrectionReportExportRow,
  type ContractReportExportRow,
  type DeviceScanReportExportRow,
  type EmployeeReportExportRow,
  type MutationReportExportRow,
  type PayrollFinalReportExportRow,
  type ShiftAssignmentReportExportRow,
} from '../lib/report-workbooks.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'
import { auditActivityReportRouter } from './reports-audit-activities.js'
import { headcountChangeReportRouter } from './reports-headcount-changes.js'
import { tenureTurnoverReportRouter } from './reports-tenure-turnover.js'

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const employeeTypeCode = z.enum([
  'BORONGAN',
  'HARIAN',
  'BULANAN',
  'TRAINING',
])
const employeeStatusCode = z.enum(['ACTIVE', 'INACTIVE', 'RESIGNED', 'LEAVE'])
const productionSectionUid = z.string().uuid()
const attendanceStatus = z.enum(recapAttendanceStatuses)
const contractStatus = z.enum([
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'EXPIRED',
  'TERMINATED',
  'CANCELLED',
  'UNKNOWN',
])
const expiryState = z.enum(['UPCOMING', 'EXPIRED'])
const mutationChangeType = z.enum([
  'TRANSFER',
  'PROMOTION',
  'DEMOTION',
  'STATUS_CHANGE',
  'TYPE_CHANGE',
  'DEPARTMENT_CHANGE',
  'GROUP_CHANGE',
  'PRODUCTION_ASSIGNMENT_CHANGE',
  'OTHER',
])
const mutationReportStatus = z.enum([
  'APPLIED',
  'SCHEDULED',
  'FAILED',
  'CANCELLED',
])
const payrollBasis = z.enum(['PIECE_RATE', 'TIME_BASED'])
const payFrequency = z.enum(['WEEKLY', 'MONTHLY'])
const attendanceClassificationType = z.enum(['LEAVE', 'SICK', 'PERMISSION'])
const attendanceClassificationApprovalStatus = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
])
const attendanceCorrectionType = z.enum([
  'CLOCK_IN',
  'CLOCK_OUT',
  'BOTH',
  'STATUS',
])
const attendanceCorrectionApprovalStatus = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
])
const shiftAssignmentReadinessStatus = z.enum([
  'READY',
  'NO_ASSIGNMENT',
  'ENDED',
  'UPCOMING',
  'OVERLAP',
  'SITE_MISMATCH',
  'SHIFT_INACTIVE',
  'NO_WORK_DAYS',
  'EMPLOYMENT_AMBIGUOUS',
])
const deviceType = z.enum([
  'MOBILE_CAMERA',
  'USB_SCANNER',
  'TERMINAL',
  'OTHER',
])
const scanResultStatus = z.enum(['SUCCESS', 'REJECTED', 'ERROR'])
const deviceActivityStatus = z.enum([
  'HEALTHY',
  'ATTENTION',
  'NO_ACTIVITY',
  'NOT_ACTIVATED',
  'INACTIVE',
])

function csv<T extends string>(raw: unknown, schema: z.ZodType<T>) {
  const values = String(raw ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return [...new Set(z.array(schema).parse(values))]
}

function pagination(page: unknown, pageSize: unknown) {
  const parsedPage = Number(page ?? 1)
  const parsedPageSize = Number(pageSize ?? 50)
  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize:
      Number.isInteger(parsedPageSize) && parsedPageSize > 0
        ? Math.min(parsedPageSize, 500)
        : 50,
  }
}

function enforceRequestedSites(auth: AuthContext, requested: string[]) {
  if (
    !auth.roles.includes('SUPER_ADMIN') &&
    requested.some((site) => !auth.siteAccess.includes(site))
  ) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

function scopedSiteCodes(auth: AuthContext, requested: string[]) {
  enforceRequestedSites(auth, requested)
  return auth.roles.includes('SUPER_ADMIN')
    ? requested
    : requested.length
      ? requested
      : auth.siteAccess
}

function addListFilter(
  where: string[],
  values: unknown[],
  column: string,
  items: string[]
) {
  if (!items.length) return
  where.push(`${column} IN (${items.map(() => '?').join(',')})`)
  values.push(...items)
}

function addSiteScope(
  where: string[],
  values: unknown[],
  auth: AuthContext,
  requested: string[],
  column = 's.code'
) {
  const sites = scopedSiteCodes(auth, requested)
  if (sites.length) {
    addListFilter(where, values, column, sites)
  } else if (!auth.roles.includes('SUPER_ADMIN')) {
    where.push('1=0')
  }
}

function mapReference(row: RowDataPacket, prefix: string) {
  const uid = row[`${prefix}Uid`]
  if (!uid) return null
  return {
    uid: String(uid),
    ...(row[`${prefix}Code`] === undefined
      ? {}
      : { code: String(row[`${prefix}Code`]) }),
    name: String(row[`${prefix}Name`]),
  }
}

const employeeQuerySchema = z.object({
  asOf: z.string().date(),
  query: z.string().trim().max(150).optional(),
})

function parseEmployeeQuery(raw: Record<string, unknown>) {
  return {
    ...employeeQuerySchema.parse({
      asOf: raw.asOf,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    employeeTypes: csv(raw.employeeType, employeeTypeCode),
    employeeStatuses: csv(raw.employeeStatus, employeeStatusCode),
    productionSections: csv(raw.productionSection, productionSectionUid),
  }
}

const employeeExportSchema = employeeQuerySchema.extend({
  site: z.array(siteCode).default([]),
  employeeType: z.array(employeeTypeCode).default([]),
  employeeStatus: z.array(employeeStatusCode).default([]),
  productionSection: z.array(productionSectionUid).default([]),
})

const contractQuerySchema = z
  .object({
    referenceDate: z.string().date(),
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    query: z.string().trim().max(150).optional(),
  })
  .refine((input) => input.dateFrom <= input.dateTo, {
    message: 'Tanggal awal tidak boleh melewati tanggal akhir.',
    path: ['dateTo'],
  })

function parseContractQuery(raw: Record<string, unknown>) {
  return {
    ...contractQuerySchema.parse({
      referenceDate: raw.referenceDate,
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    employeeTypes: csv(raw.employeeType, employeeTypeCode),
    contractTypes: csv(raw.contractType, z.string().uuid()),
    contractStatuses: csv(raw.contractStatus, contractStatus),
    expiryStates: csv(raw.expiryState, expiryState),
  }
}

const contractExportSchema = contractQuerySchema.extend({
  site: z.array(siteCode).default([]),
  employeeType: z.array(employeeTypeCode).default([]),
  contractType: z.array(z.string().uuid()).default([]),
  contractStatus: z.array(contractStatus).default([]),
  expiryState: z.array(expiryState).default([]),
})

const mutationQuerySchema = z
  .object({
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    query: z.string().trim().max(150).optional(),
  })
  .superRefine((input, context) => {
    const start = new Date(`${input.dateFrom}T00:00:00Z`)
    const end = new Date(`${input.dateTo}T00:00:00Z`)
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    if (days < 1) {
      context.addIssue({
        code: 'custom',
        message: 'Tanggal akhir tidak boleh sebelum tanggal awal.',
        path: ['dateTo'],
      })
    } else if (days > 366) {
      context.addIssue({
        code: 'custom',
        message: 'Rentang laporan mutasi maksimal 366 hari kalender.',
        path: ['dateTo'],
      })
    }
  })

function parseMutationQuery(raw: Record<string, unknown>) {
  return {
    ...mutationQuerySchema.parse({
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    sourceSites: csv(raw.sourceSite, siteCode),
    employeeTypes: csv(raw.employeeType, employeeTypeCode),
    productionSections: csv(raw.productionSection, productionSectionUid),
    changeTypes: csv(raw.changeType, mutationChangeType),
    statuses: csv(raw.mutationStatus, mutationReportStatus),
  }
}

const mutationExportSchema = mutationQuerySchema.extend({
  site: z.array(siteCode).default([]),
  sourceSite: z.array(siteCode).default([]),
  employeeType: z.array(employeeTypeCode).default([]),
  productionSection: z.array(productionSectionUid).default([]),
  changeType: z.array(mutationChangeType).default([]),
  mutationStatus: z.array(mutationReportStatus).default([]),
})

const payrollFinalQuerySchema = z
  .object({
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    query: z.string().trim().max(150).optional(),
  })
  .superRefine((input, context) => {
    const start = new Date(`${input.dateFrom}T00:00:00Z`)
    const end = new Date(`${input.dateTo}T00:00:00Z`)
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    if (days < 1) {
      context.addIssue({
        code: 'custom',
        message: 'Tanggal akhir tidak boleh sebelum tanggal awal.',
        path: ['dateTo'],
      })
    } else if (days > 366) {
      context.addIssue({
        code: 'custom',
        message: 'Rentang Laporan Payroll Final maksimal 366 hari kalender.',
        path: ['dateTo'],
      })
    }
  })

function parsePayrollFinalQuery(raw: Record<string, unknown>) {
  return {
    ...payrollFinalQuerySchema.parse({
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    employeeTypes: csv(raw.employeeType, employeeTypeCode),
    payrollBases: csv(raw.payrollBasis, payrollBasis),
    payFrequencies: csv(raw.payFrequency, payFrequency),
  }
}

const payrollFinalExportSchema = payrollFinalQuerySchema.extend({
  site: z.array(siteCode).default([]),
  employeeType: z.array(employeeTypeCode).default([]),
  payrollBasis: z.array(payrollBasis).default([]),
  payFrequency: z.array(payFrequency).default([]),
})

const attendanceClassificationQuerySchema = z
  .object({
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    query: z.string().trim().max(150).optional(),
  })
  .superRefine((input, context) => {
    const start = new Date(`${input.dateFrom}T00:00:00Z`)
    const end = new Date(`${input.dateTo}T00:00:00Z`)
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    if (days < 1) {
      context.addIssue({
        code: 'custom',
        message: 'Tanggal akhir tidak boleh sebelum tanggal awal.',
        path: ['dateTo'],
      })
    } else if (days > 366) {
      context.addIssue({
        code: 'custom',
        message: 'Rentang Laporan Cuti, Sakit & Izin maksimal 366 hari kalender.',
        path: ['dateTo'],
      })
    }
  })

function parseAttendanceClassificationQuery(raw: Record<string, unknown>) {
  return {
    ...attendanceClassificationQuerySchema.parse({
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    employeeTypes: csv(raw.employeeType, employeeTypeCode),
    productionSections: csv(raw.productionSection, productionSectionUid),
    classificationTypes: csv(
      raw.classificationType,
      attendanceClassificationType
    ),
    approvalStatuses: csv(
      raw.approvalStatus,
      attendanceClassificationApprovalStatus
    ),
  }
}

const attendanceClassificationExportSchema =
  attendanceClassificationQuerySchema.extend({
    site: z.array(siteCode).default([]),
    employeeType: z.array(employeeTypeCode).default([]),
    productionSection: z.array(productionSectionUid).default([]),
    classificationType: z.array(attendanceClassificationType).default([]),
    approvalStatus: z
      .array(attendanceClassificationApprovalStatus)
      .default([]),
  })

const attendanceCorrectionQuerySchema = z
  .object({
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    query: z.string().trim().max(150).optional(),
  })
  .superRefine((input, context) => {
    const start = new Date(`${input.dateFrom}T00:00:00Z`)
    const end = new Date(`${input.dateTo}T00:00:00Z`)
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    if (days < 1) {
      context.addIssue({
        code: 'custom',
        message: 'Tanggal akhir tidak boleh sebelum tanggal awal.',
        path: ['dateTo'],
      })
    } else if (days > 366) {
      context.addIssue({
        code: 'custom',
        message: 'Rentang Laporan Koreksi Attendance maksimal 366 hari kalender.',
        path: ['dateTo'],
      })
    }
  })

function parseAttendanceCorrectionQuery(raw: Record<string, unknown>) {
  return {
    ...attendanceCorrectionQuerySchema.parse({
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    employeeTypes: csv(raw.employeeType, employeeTypeCode),
    productionSections: csv(raw.productionSection, productionSectionUid),
    correctionTypes: csv(raw.correctionType, attendanceCorrectionType),
    approvalStatuses: csv(
      raw.approvalStatus,
      attendanceCorrectionApprovalStatus
    ),
  }
}

const attendanceCorrectionExportSchema = attendanceCorrectionQuerySchema.extend({
  site: z.array(siteCode).default([]),
  employeeType: z.array(employeeTypeCode).default([]),
  productionSection: z.array(productionSectionUid).default([]),
  correctionType: z.array(attendanceCorrectionType).default([]),
  approvalStatus: z.array(attendanceCorrectionApprovalStatus).default([]),
})

const attendanceQuerySchema = attendanceRecapPeriodInput.and(
  z.object({ query: z.string().trim().max(150).optional() })
)

function parseAttendanceQuery(raw: Record<string, unknown>) {
  return {
    ...attendanceQuerySchema.parse({
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    employeeTypes: csv(raw.employeeType, employeeTypeCode),
    productionSections: csv(raw.productionSection, productionSectionUid),
    attendanceStatuses: csv(raw.attendanceStatus, attendanceStatus),
  }
}

async function loadReportMeta(auth: AuthContext, requestedSites: string[]) {
  const siteWhere = ['s.is_active=1']
  const siteValues: unknown[] = []
  addSiteScope(siteWhere, siteValues, auth, requestedSites)

  const [sites] = await pool.query<RowDataPacket[]>(
    `SELECT s.uid,s.code,s.name
       FROM sites s
      WHERE ${siteWhere.join(' AND ')}
      ORDER BY s.name`,
    siteValues
  )
  const [employeeTypes] = await pool.query<RowDataPacket[]>(
    `SELECT uid,code,name FROM employee_types WHERE is_active=1 ORDER BY name`
  )
  const [employeeStatuses] = await pool.query<RowDataPacket[]>(
    `SELECT uid,code,name FROM employee_statuses WHERE is_active=1 ORDER BY name`
  )

  const sectionWhere = ['pms.is_active=1', 'pm.is_active=1', 'ps.is_active=1']
  const sectionValues: unknown[] = []
  addSiteScope(
    sectionWhere,
    sectionValues,
    auth,
    requestedSites,
    'module_site.code'
  )
  const [productionSections] = await pool.query<RowDataPacket[]>(
    `SELECT DISTINCT ps.uid,ps.code,ps.name,pm.uid moduleUid,pm.name moduleName
       FROM production_module_sections pms
       JOIN production_modules pm ON pm.id=pms.production_module_id
       JOIN production_sections ps ON ps.id=pms.production_section_id
       JOIN sites module_site ON module_site.id=pm.site_id
      WHERE ${sectionWhere.join(' AND ')}
      ORDER BY pm.name,ps.name`,
    sectionValues
  )
  return { sites, employeeTypes, employeeStatuses, productionSections }
}

async function resolveAttendanceSites(
  auth: AuthContext,
  requestedSites: string[]
): Promise<AttendanceRecapSite[]> {
  const where = ['s.is_active=1']
  const values: unknown[] = []
  addSiteScope(where, values, auth, requestedSites)
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id,s.uid,s.code,s.name
       FROM sites s
      WHERE ${where.join(' AND ')}
      ORDER BY s.code`,
    values
  )
  if (requestedSites.length !== rows.length) {
    const found = new Set(rows.map((row) => String(row.code)))
    if (requestedSites.some((site) => !found.has(site))) {
      throw new ApiError(422, 'Satu atau lebih site tidak valid atau tidak aktif.')
    }
  }
  return rows.map((row) => ({
    id: Number(row.id),
    uid: String(row.uid),
    code: String(row.code),
    name: String(row.name),
  }))
}

function filterAttendanceDetails(
  details: AttendanceRecapDetail[],
  input: ReturnType<typeof parseAttendanceQuery>
) {
  const query = input.query?.toLocaleLowerCase('id')
  return details.filter(
    (row) =>
      (!query ||
        row.employeeName.toLocaleLowerCase('id').includes(query) ||
        row.employeeNumber.toLocaleLowerCase('id').includes(query)) &&
      (!input.employeeTypes.length ||
        input.employeeTypes.includes(
          row.employeeType as (typeof input.employeeTypes)[number]
        )) &&
      (!input.productionSections.length ||
        (row.productionSectionUid !== null &&
          input.productionSections.includes(row.productionSectionUid))) &&
      (!input.attendanceStatuses.length ||
        input.attendanceStatuses.includes(
          row.status as (typeof input.attendanceStatuses)[number]
        ))
  )
}

const employeeReportFromSql = `FROM (
  SELECT effective_history.*,
         COUNT(*) OVER (PARTITION BY effective_history.employee_id) effectiveHistoryCount,
         ROW_NUMBER() OVER (
           PARTITION BY effective_history.employee_id
           ORDER BY effective_history.effective_from DESC,effective_history.id DESC
         ) effectiveHistoryRank
    FROM employee_employment_histories effective_history
   WHERE effective_history.effective_from<=?
     AND (effective_history.effective_to IS NULL OR effective_history.effective_to>=?)
) eh
  JOIN employees e ON e.id=eh.employee_id
  JOIN sites s ON s.id=eh.site_id
  JOIN employee_types et ON et.id=eh.employee_type_id
  JOIN employee_statuses es ON es.id=eh.employee_status_id
  LEFT JOIN departments dep ON dep.id=eh.department_id
  LEFT JOIN positions pos ON pos.id=eh.position_id
  LEFT JOIN work_groups wg ON wg.id=eh.work_group_id
  LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
  LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
  LEFT JOIN production_sections ps ON ps.id=pms.production_section_id`

const employeeReportSelectSql = `SELECT e.uid employeeUid,e.employee_number employeeNumber,
  e.full_name employeeName,
  s.uid siteUid,s.code siteCode,s.name siteName,
  et.uid employeeTypeUid,et.code employeeTypeCode,et.name employeeTypeName,
  es.uid employeeStatusUid,es.code employeeStatusCode,es.name employeeStatusName,
  dep.uid departmentUid,dep.name departmentName,
  pos.uid positionUid,pos.name positionName,
  pm.uid productionModuleUid,pm.name productionModuleName,
  ps.uid productionSectionUid,ps.code productionSectionCode,ps.name productionSectionName,
  wg.uid workGroupUid,wg.name workGroupName,
  eh.effectiveHistoryCount,
  DATE_FORMAT(eh.effective_from,'%Y-%m-%d') effectiveFrom,
  DATE_FORMAT(eh.effective_to,'%Y-%m-%d') effectiveTo`

function employeeReportPredicate(
  input: ReturnType<typeof parseEmployeeQuery>,
  auth: AuthContext
) {
  const where = ['eh.effectiveHistoryRank=1']
  const values: unknown[] = [input.asOf, input.asOf]
  addSiteScope(where, values, auth, input.sites)
  addListFilter(where, values, 'et.code', input.employeeTypes)
  addListFilter(where, values, 'es.code', input.employeeStatuses)
  addListFilter(where, values, 'ps.uid', input.productionSections)
  if (input.query) {
    where.push('(e.full_name LIKE ? OR e.employee_number LIKE ?)')
    values.push(`%${input.query}%`, `%${input.query}%`)
  }
  return { where, values }
}

function mapEmployeeReportRow(row: RowDataPacket) {
  return {
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    site: mapReference(row, 'site'),
    employeeType: mapReference(row, 'employeeType'),
    employeeStatus: mapReference(row, 'employeeStatus'),
    department: mapReference(row, 'department'),
    position: mapReference(row, 'position'),
    productionModule: mapReference(row, 'productionModule'),
    productionSection: mapReference(row, 'productionSection'),
    workGroup: mapReference(row, 'workGroup'),
    historyStatus:
      Number(row.effectiveHistoryCount) === 1 ? 'VALID' : 'AMBIGUOUS',
    effectiveFrom: String(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? String(row.effectiveTo) : null,
  } as const
}

// Site kontrak berasal dari snapshot saat kontrak dibuat. Data lama yang belum
// memiliki snapshot memakai tepat satu histori kerja yang efektif pada awal kontrak.
// Current site karyawan sengaja tidak dipakai agar mutasi tidak mengubah laporan lama.
const contractReportFromSql = `FROM employee_contracts c
  JOIN employees e ON e.id=c.employee_id
  JOIN contract_types ct ON ct.id=c.contract_type_id
  LEFT JOIN employee_employment_histories eh ON eh.id=(
    SELECT effective_history.id
      FROM employee_employment_histories effective_history
     WHERE effective_history.employee_id=c.employee_id
       AND effective_history.effective_from<=c.start_date
       AND (effective_history.effective_to IS NULL OR effective_history.effective_to>=c.start_date)
     ORDER BY effective_history.effective_from DESC,effective_history.id DESC
     LIMIT 1
  )
  LEFT JOIN employee_types et ON et.id=eh.employee_type_id
  LEFT JOIN sites history_site ON history_site.id=eh.site_id
  LEFT JOIN sites snapshot_site ON snapshot_site.code=CASE
    WHEN UPPER(TRIM(c.site_name_snapshot)) IN ('JEPARA','SITE JEPARA','RSIAKDS-HR') THEN 'JEPARA'
    WHEN UPPER(TRIM(c.site_name_snapshot)) IN ('SEMARANG','SITE SEMARANG','RSIASMG-HR') THEN 'SEMARANG'
    WHEN UPPER(TRIM(c.site_name_snapshot)) IN ('KLATEN','SITE KLATEN','RSIASLO-HR') THEN 'KLATEN'
    ELSE NULL END
  LEFT JOIN sites s ON s.id=COALESCE(snapshot_site.id,history_site.id)
  LEFT JOIN employee_contract_lifecycle_events lifecycle ON lifecycle.id=(
    SELECT event.id
      FROM employee_contract_lifecycle_events event
     WHERE event.contract_id=c.id AND event.effective_date<=?
     ORDER BY event.effective_date DESC,event.id DESC
     LIMIT 1
  )`

const contractReportSelectSql = `SELECT c.uid contractUid,c.contract_number contractNumber,
  e.uid employeeUid,e.employee_number employeeNumber,e.full_name employeeName,
  s.uid siteUid,s.code siteCode,s.name siteName,
  CASE WHEN snapshot_site.id IS NOT NULL THEN 'SNAPSHOT'
       WHEN history_site.id IS NOT NULL THEN 'HISTORY' ELSE 'UNRESOLVED' END siteResolution,
  (SELECT COUNT(*) FROM employee_employment_histories history_count
    WHERE history_count.employee_id=c.employee_id
      AND history_count.effective_from<=c.start_date
      AND (history_count.effective_to IS NULL OR history_count.effective_to>=c.start_date)
  ) effectiveHistoryCount,
  et.uid employeeTypeUid,et.code employeeTypeCode,et.name employeeTypeName,
  ct.uid contractTypeUid,ct.code contractTypeCode,ct.name contractTypeName,
  DATE_FORMAT(c.start_date,'%Y-%m-%d') startDate,
  DATE_FORMAT(c.end_date,'%Y-%m-%d') endDate,
  COALESCE(lifecycle.to_status,'UNKNOWN') contractStatus,
  CASE WHEN lifecycle.id IS NOT NULL THEN 'LIFECYCLE' ELSE 'UNRESOLVED' END statusResolution,
  CASE WHEN c.end_date<? THEN 'EXPIRED' ELSE 'UPCOMING' END expiryState,
  lifecycle.uid latestLifecycleUid,lifecycle.from_status latestLifecycleFromStatus,
  lifecycle.to_status latestLifecycleToStatus,
  DATE_FORMAT(lifecycle.effective_date,'%Y-%m-%d') latestLifecycleDate,
  lifecycle.source latestLifecycleSource`

type ContractReportInput = ReturnType<typeof parseContractQuery>

function contractReportPredicate(input: ContractReportInput, auth: AuthContext) {
  const where = ['c.end_date IS NOT NULL', 'c.end_date BETWEEN ? AND ?']
  const values: unknown[] = [
    input.referenceDate,
    input.referenceDate,
    input.dateFrom,
    input.dateTo,
  ]
  addSiteScope(where, values, auth, input.sites)
  addListFilter(where, values, 'et.code', input.employeeTypes)
  addListFilter(where, values, 'ct.uid', input.contractTypes)
  if (input.contractStatuses.length) {
    const knownStatuses = input.contractStatuses.filter(
      (status) => status !== 'UNKNOWN'
    )
    const statusPredicates: string[] = []
    if (knownStatuses.length) {
      statusPredicates.push(
        `lifecycle.to_status IN (${knownStatuses.map(() => '?').join(',')})`
      )
      values.push(...knownStatuses)
    }
    if (input.contractStatuses.includes('UNKNOWN')) {
      statusPredicates.push('lifecycle.id IS NULL')
    }
    where.push(`(${statusPredicates.join(' OR ')})`)
  }
  if (!input.contractStatuses.length) {
    where.push("(lifecycle.to_status IS NULL OR lifecycle.to_status NOT IN ('DRAFT','CANCELLED'))")
  }
  if (input.expiryStates.length) {
    where.push(
      `CASE WHEN c.end_date<? THEN 'EXPIRED' ELSE 'UPCOMING' END IN (${input.expiryStates.map(() => '?').join(',')})`
    )
    values.push(input.referenceDate, ...input.expiryStates)
  }
  if (input.query) {
    where.push(
      '(e.full_name LIKE ? OR e.employee_number LIKE ? OR c.contract_number LIKE ?)'
    )
    values.push(`%${input.query}%`, `%${input.query}%`, `%${input.query}%`)
  }
  return { where, values }
}

function mapContractReportRow(row: RowDataPacket) {
  const historyCount = Number(row.effectiveHistoryCount ?? 0)
  return {
    contractUid: String(row.contractUid),
    contractNumber: String(row.contractNumber),
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    site: mapReference(row, 'site'),
    siteResolution: String(row.siteResolution) as
      | 'SNAPSHOT'
      | 'HISTORY'
      | 'UNRESOLVED',
    historyStatus:
      historyCount === 1 ? 'VALID' : historyCount > 1 ? 'AMBIGUOUS' : 'MISSING',
    employeeType: mapReference(row, 'employeeType'),
    contractType: mapReference(row, 'contractType'),
    startDate: String(row.startDate),
    endDate: String(row.endDate),
    contractStatus: String(row.contractStatus),
    statusResolution: String(row.statusResolution) as
      | 'LIFECYCLE'
      | 'UNRESOLVED',
    expiryState: String(row.expiryState) as 'UPCOMING' | 'EXPIRED',
    latestLifecycle: row.latestLifecycleUid
      ? {
          uid: String(row.latestLifecycleUid),
          fromStatus: row.latestLifecycleFromStatus
            ? String(row.latestLifecycleFromStatus)
            : null,
          toStatus: String(row.latestLifecycleToStatus),
          effectiveDate: String(row.latestLifecycleDate),
          source: String(row.latestLifecycleSource),
        }
      : null,
  } as const
}

// Histori kerja adalah sumber fakta mutasi yang sudah berlaku. Jadwal APPLIED
// tidak disertakan agar hasil cron tidak muncul dua kali bersama histori baru.
const mutationReportDatasetSql = `SELECT
  h.uid mutationUid,'HISTORY' recordSource,
  e.uid employeeUid,e.employee_number employeeNumber,e.full_name employeeName,
  h.change_type changeType,
  'APPLIED' mutationStatus,
  h.effective_from effectiveDateValue,
  DATE_FORMAT(h.effective_from,'%Y-%m-%d') effectiveDate,
  h.reference_number referenceNumber,h.reason,h.notes,
  NULL failureReason,
  source_site.uid sourceSiteUid,source_site.code sourceSiteCode,source_site.name sourceSiteName,
  source_type.uid sourceEmployeeTypeUid,source_type.code sourceEmployeeTypeCode,source_type.name sourceEmployeeTypeName,
  source_department.uid sourceDepartmentUid,source_department.name sourceDepartmentName,
  source_position.uid sourcePositionUid,source_position.name sourcePositionName,
  source_group.uid sourceWorkGroupUid,source_group.name sourceWorkGroupName,
  source_module.uid sourceProductionModuleUid,source_module.name sourceProductionModuleName,
  source_section.uid sourceProductionSectionUid,source_section.code sourceProductionSectionCode,source_section.name sourceProductionSectionName,
  target_site.uid targetSiteUid,target_site.code targetSiteCode,target_site.name targetSiteName,
  target_type.uid targetEmployeeTypeUid,target_type.code targetEmployeeTypeCode,target_type.name targetEmployeeTypeName,
  target_department.uid targetDepartmentUid,target_department.name targetDepartmentName,
  target_position.uid targetPositionUid,target_position.name targetPositionName,
  target_group.uid targetWorkGroupUid,target_group.name targetWorkGroupName,
  target_module.uid targetProductionModuleUid,target_module.name targetProductionModuleName,
  target_section.uid targetProductionSectionUid,target_section.code targetProductionSectionCode,target_section.name targetProductionSectionName
 FROM employee_employment_histories h
 JOIN employees e ON e.id=h.employee_id
 LEFT JOIN employee_employment_histories source_history ON source_history.id=(
   SELECT previous_history.id
     FROM employee_employment_histories previous_history
    WHERE previous_history.employee_id=h.employee_id
      AND (previous_history.effective_from<h.effective_from
        OR (previous_history.effective_from=h.effective_from AND previous_history.id<h.id))
    ORDER BY previous_history.effective_from DESC,previous_history.id DESC
    LIMIT 1
 )
 JOIN sites target_site ON target_site.id=h.site_id
 LEFT JOIN sites source_site ON source_site.id=source_history.site_id
 JOIN employee_types target_type ON target_type.id=h.employee_type_id
 LEFT JOIN employee_types source_type ON source_type.id=source_history.employee_type_id
 LEFT JOIN departments target_department ON target_department.id=h.department_id
 LEFT JOIN departments source_department ON source_department.id=source_history.department_id
 LEFT JOIN positions target_position ON target_position.id=h.position_id
 LEFT JOIN positions source_position ON source_position.id=source_history.position_id
 LEFT JOIN work_groups target_group ON target_group.id=h.work_group_id
 LEFT JOIN work_groups source_group ON source_group.id=source_history.work_group_id
 LEFT JOIN production_module_sections target_mapping ON target_mapping.id=h.production_module_section_id
 LEFT JOIN production_modules target_module ON target_module.id=target_mapping.production_module_id
 LEFT JOIN production_sections target_section ON target_section.id=target_mapping.production_section_id
 LEFT JOIN production_module_sections source_mapping ON source_mapping.id=source_history.production_module_section_id
 LEFT JOIN production_modules source_module ON source_module.id=source_mapping.production_module_id
 LEFT JOIN production_sections source_section ON source_section.id=source_mapping.production_section_id
 WHERE h.change_type<>'INITIAL'
 UNION ALL
 SELECT
  sm.uid mutationUid,'SCHEDULE' recordSource,
  e.uid employeeUid,e.employee_number employeeNumber,e.full_name employeeName,
  sm.change_type changeType,sm.status mutationStatus,
  sm.effective_from effectiveDateValue,
  DATE_FORMAT(sm.effective_from,'%Y-%m-%d') effectiveDate,
  sm.reference_number referenceNumber,sm.reason,sm.notes,sm.failure_reason failureReason,
  source_site.uid sourceSiteUid,source_site.code sourceSiteCode,source_site.name sourceSiteName,
  source_type.uid sourceEmployeeTypeUid,source_type.code sourceEmployeeTypeCode,source_type.name sourceEmployeeTypeName,
  source_department.uid sourceDepartmentUid,source_department.name sourceDepartmentName,
  source_position.uid sourcePositionUid,source_position.name sourcePositionName,
  source_group.uid sourceWorkGroupUid,source_group.name sourceWorkGroupName,
  source_module.uid sourceProductionModuleUid,source_module.name sourceProductionModuleName,
  source_section.uid sourceProductionSectionUid,source_section.code sourceProductionSectionCode,source_section.name sourceProductionSectionName,
  target_site.uid targetSiteUid,target_site.code targetSiteCode,target_site.name targetSiteName,
  target_type.uid targetEmployeeTypeUid,target_type.code targetEmployeeTypeCode,target_type.name targetEmployeeTypeName,
  target_department.uid targetDepartmentUid,target_department.name targetDepartmentName,
  target_position.uid targetPositionUid,target_position.name targetPositionName,
  target_group.uid targetWorkGroupUid,target_group.name targetWorkGroupName,
  target_module.uid targetProductionModuleUid,target_module.name targetProductionModuleName,
  target_section.uid targetProductionSectionUid,target_section.code targetProductionSectionCode,target_section.name targetProductionSectionName
 FROM scheduled_employee_mutations sm
 JOIN employees e ON e.id=sm.employee_id
 JOIN employee_employment_histories source_history ON source_history.id=sm.base_history_id
 JOIN sites source_site ON source_site.id=source_history.site_id
 JOIN sites target_site ON target_site.id=sm.target_site_id
 JOIN employee_types source_type ON source_type.id=source_history.employee_type_id
 JOIN employee_types target_type ON target_type.id=sm.target_employee_type_id
 LEFT JOIN departments source_department ON source_department.id=source_history.department_id
 LEFT JOIN departments target_department ON target_department.id=sm.target_department_id
 LEFT JOIN positions source_position ON source_position.id=source_history.position_id
 LEFT JOIN positions target_position ON target_position.id=sm.target_position_id
 LEFT JOIN work_groups source_group ON source_group.id=source_history.work_group_id
 LEFT JOIN work_groups target_group ON target_group.id=sm.target_work_group_id
 LEFT JOIN production_module_sections source_mapping ON source_mapping.id=source_history.production_module_section_id
 LEFT JOIN production_modules source_module ON source_module.id=source_mapping.production_module_id
 LEFT JOIN production_sections source_section ON source_section.id=source_mapping.production_section_id
 LEFT JOIN production_module_sections target_mapping ON target_mapping.id=sm.target_production_module_section_id
 LEFT JOIN production_modules target_module ON target_module.id=target_mapping.production_module_id
 LEFT JOIN production_sections target_section ON target_section.id=target_mapping.production_section_id
 WHERE sm.status<>'APPLIED'`

type MutationReportInput = ReturnType<typeof parseMutationQuery>

function mutationReportPredicate(input: MutationReportInput, auth: AuthContext) {
  const where = ['effectiveDateValue BETWEEN ? AND ?']
  const values: unknown[] = [input.dateFrom, input.dateTo]
  addSiteScope(where, values, auth, input.sites, 'targetSiteCode')
  if (input.sourceSites.length) {
    enforceRequestedSites(auth, input.sourceSites)
    addListFilter(where, values, 'sourceSiteCode', input.sourceSites)
  }
  addListFilter(where, values, 'targetEmployeeTypeCode', input.employeeTypes)
  addListFilter(
    where,
    values,
    'targetProductionSectionUid',
    input.productionSections
  )
  addListFilter(where, values, 'changeType', input.changeTypes)
  addListFilter(where, values, 'mutationStatus', input.statuses)
  if (input.query) {
    where.push(
      '(employeeName LIKE ? OR employeeNumber LIKE ? OR referenceNumber LIKE ?)'
    )
    values.push(`%${input.query}%`, `%${input.query}%`, `%${input.query}%`)
  }
  return { where, values }
}

function mapMutationPlacement(row: RowDataPacket, prefix: 'source' | 'target') {
  return {
    site: mapReference(row, `${prefix}Site`),
    employeeType: mapReference(row, `${prefix}EmployeeType`),
    department: mapReference(row, `${prefix}Department`),
    position: mapReference(row, `${prefix}Position`),
    workGroup: mapReference(row, `${prefix}WorkGroup`),
    productionModule: mapReference(row, `${prefix}ProductionModule`),
    productionSection: mapReference(row, `${prefix}ProductionSection`),
  }
}

function mapMutationReportRow(row: RowDataPacket) {
  return {
    mutationUid: String(row.mutationUid),
    recordSource: String(row.recordSource) as 'HISTORY' | 'SCHEDULE',
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    changeType: String(row.changeType),
    mutationStatus: String(row.mutationStatus),
    effectiveDate: String(row.effectiveDate),
    referenceNumber: row.referenceNumber ? String(row.referenceNumber) : null,
    reason: row.reason ? String(row.reason) : null,
    notes: row.notes ? String(row.notes) : null,
    failureReason: row.failureReason ? String(row.failureReason) : null,
    source: mapMutationPlacement(row, 'source'),
    target: mapMutationPlacement(row, 'target'),
  } as const
}

// Laporan Payroll Final selalu membaca snapshot hasil pada current run yang
// disahkan saat closing. Data master/current karyawan tidak digunakan untuk
// mengganti identitas maupun nilai historis di dalam hasil Payroll.
const payrollFinalDatasetSql = `SELECT
  pp.uid periodUid,pp.period_code periodCode,pp.period_name periodName,
  DATE_FORMAT(pp.period_start,'%Y-%m-%d') periodStart,
  DATE_FORMAT(pp.period_end,'%Y-%m-%d') periodEnd,
  DATE_FORMAT(pp.payment_date,'%Y-%m-%d') paymentDate,
  CONCAT(DATE_FORMAT(pp.closed_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') closedAt,
  pp.payroll_basis payrollBasis,pp.pay_frequency payFrequency,
  pp.employee_type_code periodEmployeeType,
  s.uid siteUid,s.code siteCode,s.name siteName,
  run.uid runUid,run.run_number runNumber,
  CONCAT(DATE_FORMAT(run.calculation_finished_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') calculationFinishedAt,
  result.uid resultUid,employee.uid employeeUid,
  result.employee_number_snapshot employeeNumber,
  result.employee_name_snapshot employeeName,
  result.employee_type_snapshot employeeType,
  result.department_name_snapshot departmentName,
  result.position_name_snapshot positionName,
  result.work_group_name_snapshot workGroupName,
  result.attendance_days attendanceDays,
  result.production_transaction_count productionTransactionCount,
  result.piece_rate_amount pieceRateAmount,
  result.basic_salary_amount basicSalaryAmount,
  result.additional_earnings additionalEarnings,
  result.gross_earnings grossEarnings,
  result.total_deductions totalDeductions,
  result.net_pay netPay,
  result.bank_name_snapshot bankName,
  CASE WHEN NULLIF(TRIM(result.bank_account_number_snapshot),'') IS NULL
       THEN NULL ELSE RIGHT(TRIM(result.bank_account_number_snapshot),4) END accountLast4
 FROM payroll_periods pp
 JOIN payroll_runs run
   ON run.id=pp.current_run_id
  AND run.payroll_period_id=pp.id
  AND run.run_type='FINAL'
  AND run.status='COMPLETED'
 JOIN payroll_employee_results result
   ON result.payroll_run_id=run.id
  AND result.payroll_period_id=pp.id
  AND result.site_id=pp.site_id
 JOIN employees employee ON employee.id=result.employee_id
 JOIN sites s ON s.id=pp.site_id
 WHERE pp.status='CLOSED' AND pp.closed_at IS NOT NULL`

type PayrollFinalReportInput = ReturnType<typeof parsePayrollFinalQuery>

function payrollFinalReportPredicate(
  input: PayrollFinalReportInput,
  auth: AuthContext
) {
  const where = ['periodEnd BETWEEN ? AND ?']
  const values: unknown[] = [input.dateFrom, input.dateTo]
  addSiteScope(where, values, auth, input.sites, 'siteCode')
  addListFilter(where, values, 'periodEmployeeType', input.employeeTypes)
  addListFilter(where, values, 'payrollBasis', input.payrollBases)
  addListFilter(where, values, 'payFrequency', input.payFrequencies)
  if (input.query) {
    where.push(
      '(employeeName LIKE ? OR employeeNumber LIKE ? OR periodCode LIKE ? OR periodName LIKE ?)'
    )
    values.push(
      `%${input.query}%`,
      `%${input.query}%`,
      `%${input.query}%`,
      `%${input.query}%`
    )
  }
  return { where, values }
}

function reportMoney(value: unknown) {
  const text = String(value ?? '0.00')
  const negative = text.startsWith('-')
  const unsigned = negative ? text.slice(1) : text
  const [integer = '0', fraction = ''] = unsigned.split('.')
  return `${negative ? '-' : ''}${integer || '0'}.${fraction.padEnd(2, '0').slice(0, 2)}`
}

function mapPayrollFinalReportRow(row: RowDataPacket) {
  return {
    resultUid: String(row.resultUid),
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    employeeType: String(row.employeeType),
    departmentName: row.departmentName ? String(row.departmentName) : null,
    positionName: row.positionName ? String(row.positionName) : null,
    workGroupName: row.workGroupName ? String(row.workGroupName) : null,
    site: mapReference(row, 'site'),
    period: {
      uid: String(row.periodUid),
      code: String(row.periodCode),
      name: String(row.periodName),
      start: String(row.periodStart),
      end: String(row.periodEnd),
      paymentDate: row.paymentDate ? String(row.paymentDate) : null,
      closedAt: String(row.closedAt),
      payrollBasis: String(row.payrollBasis),
      payFrequency: String(row.payFrequency),
      employeeType: String(row.periodEmployeeType),
    },
    run: {
      uid: String(row.runUid),
      number: Number(row.runNumber),
      type: 'FINAL' as const,
      status: 'COMPLETED' as const,
      calculationFinishedAt: String(row.calculationFinishedAt),
    },
    attendanceDays: Number(row.attendanceDays ?? 0),
    productionTransactionCount: Number(row.productionTransactionCount ?? 0),
    amounts: {
      pieceRate: reportMoney(row.pieceRateAmount),
      basicSalary: reportMoney(row.basicSalaryAmount),
      additionalEarnings: reportMoney(row.additionalEarnings),
      grossEarnings: reportMoney(row.grossEarnings),
      totalDeductions: reportMoney(row.totalDeductions),
      netPay: reportMoney(row.netPay),
    },
    bank: {
      name: row.bankName ? String(row.bankName) : null,
      accountLast4: row.accountLast4 ? String(row.accountLast4) : null,
    },
  } as const
}

// Satu baris mewakili satu pengajuan. Histori kerja dipilih secara
// deterministik pada tanggal mulai agar histori yang tumpang-tindih tidak
// menggandakan pengajuan; jumlah histori tetap dikirim sebagai penanda masalah.
const attendanceClassificationDatasetSql = `SELECT
  acr.uid classificationUid,e.uid employeeUid,
  e.employee_number employeeNumber,e.full_name employeeName,
  s.uid siteUid,s.code siteCode,s.name siteName,
  et.uid employeeTypeUid,et.code employeeTypeCode,et.name employeeTypeName,
  pm.uid productionModuleUid,pm.name productionModuleName,
  ps.uid productionSectionUid,ps.code productionSectionCode,ps.name productionSectionName,
  acr.classification_type classificationType,
  DATE_FORMAT(acr.start_date,'%Y-%m-%d') startDate,
  DATE_FORMAT(acr.end_date,'%Y-%m-%d') endDate,
  DATEDIFF(acr.end_date,acr.start_date)+1 calendarDays,
  acr.approval_status approvalStatus,
  CONCAT(DATE_FORMAT(acr.requested_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') requestedAt,
  requester.full_name requestedByName,
  CASE WHEN acr.reviewed_at IS NULL THEN NULL
       ELSE CONCAT(DATE_FORMAT(acr.reviewed_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') END reviewedAt,
  reviewer.full_name reviewedByName,
  CASE WHEN acr.cancelled_at IS NULL THEN NULL
       ELSE CONCAT(DATE_FORMAT(acr.cancelled_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') END cancelledAt,
  canceller.full_name cancelledByName,
  (SELECT COUNT(*) FROM employee_employment_histories history_count
    WHERE history_count.employee_id=acr.employee_id
      AND history_count.effective_from<=acr.start_date
      AND (history_count.effective_to IS NULL OR history_count.effective_to>=acr.start_date)
  ) effectiveHistoryCount,
  COALESCE(detail_totals.detailCount,0) detailCount,
  COALESCE(detail_totals.appliedCount,0) appliedCount,
  COALESCE(detail_totals.pendingCount,0) pendingCount,
  COALESCE(detail_totals.skippedCount,0) skippedCount,
  COALESCE(detail_totals.reversedCount,0) reversedCount
 FROM attendance_classification_requests acr
 JOIN employees e ON e.id=acr.employee_id
 JOIN sites s ON s.id=acr.site_id
 LEFT JOIN employee_employment_histories eh ON eh.id=(
   SELECT selected_history.id
     FROM employee_employment_histories selected_history
    WHERE selected_history.employee_id=acr.employee_id
      AND selected_history.effective_from<=acr.start_date
      AND (selected_history.effective_to IS NULL OR selected_history.effective_to>=acr.start_date)
    ORDER BY selected_history.effective_from DESC,selected_history.id DESC
    LIMIT 1
 )
 LEFT JOIN employee_types et ON et.id=eh.employee_type_id
 LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
 LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
 LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
 JOIN users requester ON requester.id=acr.requested_by
 LEFT JOIN users reviewer ON reviewer.id=acr.reviewed_by
 LEFT JOIN users canceller ON canceller.id=acr.cancelled_by
 LEFT JOIN (
   SELECT request_id,COUNT(*) detailCount,
     SUM(outcome='APPLIED') appliedCount,
     SUM(outcome='PENDING') pendingCount,
     SUM(outcome IN ('SKIPPED_NON_WORKDAY','SKIPPED_HOLIDAY')) skippedCount,
     SUM(outcome='REVERSED') reversedCount
   FROM attendance_classification_details
   GROUP BY request_id
 ) detail_totals ON detail_totals.request_id=acr.id`

type AttendanceClassificationReportInput = ReturnType<
  typeof parseAttendanceClassificationQuery
>

function attendanceClassificationReportPredicate(
  input: AttendanceClassificationReportInput,
  auth: AuthContext
) {
  const where = ['endDate>=?', 'startDate<=?']
  const values: unknown[] = [input.dateFrom, input.dateTo]
  addSiteScope(where, values, auth, input.sites, 'siteCode')
  addListFilter(where, values, 'employeeTypeCode', input.employeeTypes)
  addListFilter(
    where,
    values,
    'productionSectionUid',
    input.productionSections
  )
  addListFilter(
    where,
    values,
    'classificationType',
    input.classificationTypes
  )
  addListFilter(where, values, 'approvalStatus', input.approvalStatuses)
  if (input.query) {
    where.push('(employeeName LIKE ? OR employeeNumber LIKE ?)')
    values.push(`%${input.query}%`, `%${input.query}%`)
  }
  return { where, values }
}

function mapAttendanceClassificationReportRow(row: RowDataPacket) {
  const effectiveHistoryCount = Number(row.effectiveHistoryCount ?? 0)
  return {
    classificationUid: String(row.classificationUid),
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    site: mapReference(row, 'site'),
    employeeType: mapReference(row, 'employeeType'),
    productionModule: mapReference(row, 'productionModule'),
    productionSection: mapReference(row, 'productionSection'),
    classificationType: String(row.classificationType),
    startDate: String(row.startDate),
    endDate: String(row.endDate),
    calendarDays: Number(row.calendarDays ?? 0),
    approvalStatus: String(row.approvalStatus),
    requestedAt: String(row.requestedAt),
    requestedByName: String(row.requestedByName),
    reviewedAt: row.reviewedAt ? String(row.reviewedAt) : null,
    reviewedByName: row.reviewedByName ? String(row.reviewedByName) : null,
    cancelledAt: row.cancelledAt ? String(row.cancelledAt) : null,
    cancelledByName: row.cancelledByName ? String(row.cancelledByName) : null,
    historyStatus:
      effectiveHistoryCount === 1
        ? ('VALID' as const)
        : effectiveHistoryCount > 1
          ? ('AMBIGUOUS' as const)
          : ('MISSING' as const),
    outcomes: {
      total: Number(row.detailCount ?? 0),
      applied: Number(row.appliedCount ?? 0),
      pending: Number(row.pendingCount ?? 0),
      skipped: Number(row.skippedCount ?? 0),
      reversed: Number(row.reversedCount ?? 0),
    },
  } as const
}

// Satu baris mewakili satu pengajuan koreksi. Histori kerja dipilih secara
// deterministik pada tanggal bisnis agar histori yang tumpang-tindih tidak
// menggandakan koreksi; jumlah histori tetap dikirim sebagai penanda masalah.
const attendanceCorrectionDatasetSql = `SELECT
  ac.uid correctionUid,ar.uid attendanceUid,e.uid employeeUid,
  e.employee_number employeeNumber,e.full_name employeeName,
  s.uid siteUid,s.code siteCode,s.name siteName,
  et.uid employeeTypeUid,et.code employeeTypeCode,et.name employeeTypeName,
  pm.uid productionModuleUid,pm.name productionModuleName,
  ps.uid productionSectionUid,ps.code productionSectionCode,ps.name productionSectionName,
  DATE_FORMAT(ar.business_date,'%Y-%m-%d') businessDate,
  ac.correction_type correctionType,
  CASE WHEN ac.old_clock_in_at IS NULL THEN NULL
       ELSE CONCAT(DATE_FORMAT(ac.old_clock_in_at,'%Y-%m-%dT%H:%i:%s.%f'),'+07:00') END oldClockInAt,
  CASE WHEN ac.new_clock_in_at IS NULL THEN NULL
       ELSE CONCAT(DATE_FORMAT(ac.new_clock_in_at,'%Y-%m-%dT%H:%i:%s.%f'),'+07:00') END newClockInAt,
  CASE WHEN ac.old_clock_out_at IS NULL THEN NULL
       ELSE CONCAT(DATE_FORMAT(ac.old_clock_out_at,'%Y-%m-%dT%H:%i:%s.%f'),'+07:00') END oldClockOutAt,
  CASE WHEN ac.new_clock_out_at IS NULL THEN NULL
       ELSE CONCAT(DATE_FORMAT(ac.new_clock_out_at,'%Y-%m-%dT%H:%i:%s.%f'),'+07:00') END newClockOutAt,
  ac.old_status oldStatus,ac.new_status newStatus,
  ac.approval_status approvalStatus,
  CONCAT(DATE_FORMAT(ac.requested_at,'%Y-%m-%dT%H:%i:%s.%f'),'+07:00') requestedAt,
  requester.full_name requestedByName,
  CASE WHEN ac.reviewed_at IS NULL THEN NULL
       ELSE CONCAT(DATE_FORMAT(ac.reviewed_at,'%Y-%m-%dT%H:%i:%s.%f'),'+07:00') END reviewedAt,
  reviewer.full_name reviewedByName,
  CASE WHEN ac.applied_at IS NULL THEN NULL
       ELSE CONCAT(DATE_FORMAT(ac.applied_at,'%Y-%m-%dT%H:%i:%s.%f'),'+07:00') END appliedAt,
  (eh.site_id=ar.site_id) historySiteMatches,
  (SELECT COUNT(*) FROM employee_employment_histories history_count
    WHERE history_count.employee_id=ar.employee_id
      AND history_count.effective_from<=ar.business_date
      AND (history_count.effective_to IS NULL OR history_count.effective_to>=ar.business_date)
  ) effectiveHistoryCount
 FROM attendance_corrections ac
 JOIN attendance_records ar ON ar.id=ac.attendance_record_id
 JOIN employees e ON e.id=ar.employee_id
 JOIN sites s ON s.id=ar.site_id
 LEFT JOIN employee_employment_histories eh ON eh.id=(
   SELECT selected_history.id
     FROM employee_employment_histories selected_history
    WHERE selected_history.employee_id=ar.employee_id
      AND selected_history.effective_from<=ar.business_date
      AND (selected_history.effective_to IS NULL OR selected_history.effective_to>=ar.business_date)
    ORDER BY selected_history.effective_from DESC,selected_history.id DESC
    LIMIT 1
 )
 LEFT JOIN employee_types et ON et.id=eh.employee_type_id
 LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
 LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
 LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
 JOIN users requester ON requester.id=ac.requested_by
 LEFT JOIN users reviewer ON reviewer.id=ac.reviewed_by`

type AttendanceCorrectionReportInput = ReturnType<
  typeof parseAttendanceCorrectionQuery
>

function attendanceCorrectionReportPredicate(
  input: AttendanceCorrectionReportInput,
  auth: AuthContext
) {
  const where = ['businessDate BETWEEN ? AND ?']
  const values: unknown[] = [input.dateFrom, input.dateTo]
  addSiteScope(where, values, auth, input.sites, 'siteCode')
  addListFilter(where, values, 'employeeTypeCode', input.employeeTypes)
  addListFilter(
    where,
    values,
    'productionSectionUid',
    input.productionSections
  )
  addListFilter(where, values, 'correctionType', input.correctionTypes)
  addListFilter(where, values, 'approvalStatus', input.approvalStatuses)
  if (input.query) {
    where.push('(employeeName LIKE ? OR employeeNumber LIKE ?)')
    values.push(`%${input.query}%`, `%${input.query}%`)
  }
  return { where, values }
}

function mapAttendanceCorrectionReportRow(row: RowDataPacket) {
  const effectiveHistoryCount = Number(row.effectiveHistoryCount ?? 0)
  const historySiteMatches = Number(row.historySiteMatches ?? 0) === 1
  const nullable = (value: unknown) => (value ? String(value) : null)
  return {
    correctionUid: String(row.correctionUid),
    attendanceUid: String(row.attendanceUid),
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    site: mapReference(row, 'site'),
    employeeType: mapReference(row, 'employeeType'),
    productionModule: mapReference(row, 'productionModule'),
    productionSection: mapReference(row, 'productionSection'),
    historyStatus:
      effectiveHistoryCount === 1 && historySiteMatches
        ? ('VALID' as const)
        : effectiveHistoryCount > 1
          ? ('AMBIGUOUS' as const)
          : ('MISSING' as const),
    businessDate: String(row.businessDate),
    correctionType: String(row.correctionType),
    changes: {
      clockIn: {
        before: nullable(row.oldClockInAt),
        after: nullable(row.newClockInAt),
      },
      clockOut: {
        before: nullable(row.oldClockOutAt),
        after: nullable(row.newClockOutAt),
      },
      status: {
        before: nullable(row.oldStatus),
        after: nullable(row.newStatus),
      },
    },
    approvalStatus: String(row.approvalStatus),
    requestedAt: String(row.requestedAt),
    requestedByName: String(row.requestedByName),
    reviewedAt: nullable(row.reviewedAt),
    reviewedByName: nullable(row.reviewedByName),
    appliedAt: nullable(row.appliedAt),
  } as const
}

function generatedAtJakarta() {
  return `${jakartaDateTime().replace(' ', 'T')}+07:00`
}

function auditRequestId(req: Parameters<typeof writeAudit>[0]['request']) {
  const supplied = req?.get('x-request-id')
  return supplied && /^[A-Za-z0-9._:-]{1,100}$/.test(supplied)
    ? supplied
    : randomUUID()
}

async function accessibleReportSites(auth: AuthContext, requested: string[]) {
  const where = ['1=1']
  const values: unknown[] = []
  addSiteScope(where, values, auth, requested)
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT s.id,s.code,s.name FROM sites s WHERE ${where.join(' AND ')} ORDER BY s.code`,
    values
  )
  return rows.map((row) => ({
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
  }))
}

async function auditReportExport(input: {
  auth: AuthContext
  request: Parameters<typeof writeAudit>[0]['request']
  requestId: string
  sites: Array<{ id: number; code: string }>
  table: string
  description: (siteCode: string) => string
  data: Record<string, unknown>
}) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    for (const site of input.sites) {
      await writeAudit(
        {
          auth: input.auth,
          request: input.request,
          requestId: input.requestId,
          module: 'REPORTS',
          siteId: site.id,
          action: 'EXPORT',
          table: input.table,
          description: input.description(site.code),
          afterData: input.data,
        },
        conn
      )
    }
    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally {
    conn.release()
  }
}

export const reportsRouter = Router()

reportsRouter.use(authenticate)
reportsRouter.use('/audit-activities', auditActivityReportRouter)
reportsRouter.use('/headcount-changes', headcountChangeReportRouter)
reportsRouter.use('/tenure-turnover', tenureTurnoverReportRouter)

reportsRouter.get(
  '/employees/meta',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = parseEmployeeQuery(req.query as Record<string, unknown>)
      res.json(
        await loadReportMeta(res.locals.auth as AuthContext, input.sites)
      )
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/employees',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = parseEmployeeQuery(req.query as Record<string, unknown>)
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const auth = res.locals.auth as AuthContext
      const { where, values } = employeeReportPredicate(input, auth)

      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total,
                COALESCE(SUM(es.code='ACTIVE'),0) active,
                COALESCE(SUM(es.code='INACTIVE'),0) inactive,
                COALESCE(SUM(es.code='RESIGNED'),0) resigned,
                COALESCE(SUM(es.code='LEAVE'),0) employeeLeave,
                COALESCE(SUM(eh.effectiveHistoryCount<>1),0) ambiguousHistory
           ${employeeReportFromSql}
          WHERE ${where.join(' AND ')}`,
        values
      )
      const [siteRows] = await pool.query<RowDataPacket[]>(
        `SELECT s.code siteCode,s.name siteName,COUNT(*) total
           ${employeeReportFromSql}
          WHERE ${where.join(' AND ')}
          GROUP BY s.id,s.code,s.name
          ORDER BY s.name`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `${employeeReportSelectSql}
           ${employeeReportFromSql}
          WHERE ${where.join(' AND ')}
          ORDER BY e.full_name,e.employee_number
          LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const totals = countRows[0] ?? {}
      res.json({
        items: rows.map(mapEmployeeReportRow),
        summary: {
          total: Number(totals.total ?? 0),
          active: Number(totals.active ?? 0),
          inactive: Number(totals.inactive ?? 0),
          resigned: Number(totals.resigned ?? 0),
          leave: Number(totals.employeeLeave ?? 0),
          ambiguousHistory: Number(totals.ambiguousHistory ?? 0),
          bySite: siteRows.map((row) => ({
            siteCode: String(row.siteCode),
            siteName: String(row.siteName),
            total: Number(row.total),
          })),
        },
        total: Number(totals.total ?? 0),
        page,
        pageSize,
        asOf: input.asOf,
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.post(
  '/employees/export',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const parsed = employeeExportSchema.parse(req.body)
      const input: ReturnType<typeof parseEmployeeQuery> = {
        asOf: parsed.asOf,
        query: parsed.query,
        sites: parsed.site,
        employeeTypes: parsed.employeeType,
        employeeStatuses: parsed.employeeStatus,
        productionSections: parsed.productionSection,
      }
      const auth = res.locals.auth as AuthContext
      const { where, values } = employeeReportPredicate(input, auth)
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `${employeeReportSelectSql}
           ${employeeReportFromSql}
          WHERE ${where.join(' AND ')}
          ORDER BY s.name,e.full_name,e.employee_number`,
        values
      )
      const rows = rawRows.map(mapEmployeeReportRow)
      const sites = await accessibleReportSites(auth, input.sites)
      const generatedAt = generatedAtJakarta()
      const filters = {
        asOf: input.asOf,
        sites: sites.map((site) => site.code),
        employeeTypes: input.employeeTypes,
        employeeStatuses: input.employeeStatuses,
        productionSections: input.productionSections,
        hasEmployeeSearch: Boolean(input.query),
      }
      const workbook = await buildEmployeeReportWorkbook({
        title: 'Posisi Karyawan per Tanggal',
        periodLabel: input.asOf,
        generatedAt,
        generatedBy: auth.name,
        filters,
        rows: rows.map(
          (row): EmployeeReportExportRow => ({
            employeeNumber: row.employeeNumber,
            employeeName: row.employeeName,
            siteName: row.site?.name ?? '',
            employeeTypeName: row.employeeType?.name ?? '',
            employeeStatusName: row.employeeStatus?.name ?? '',
            departmentName: row.department?.name ?? null,
            positionName: row.position?.name ?? null,
            productionModuleName: row.productionModule?.name ?? null,
            productionSectionName: row.productionSection?.name ?? null,
            workGroupName: row.workGroup?.name ?? null,
            effectiveFrom: row.effectiveFrom,
            effectiveTo: row.effectiveTo,
            historyStatus: row.historyStatus,
          })
        ),
      })
      const filename = `laporan-karyawan-${input.asOf}.xlsx`
      const requestId = auditRequestId(req)
      await auditReportExport({
        auth,
        request: req,
        requestId,
        sites,
        table: 'employee_employment_histories',
        description: (site) =>
          `Mengekspor Laporan Karyawan ${site} per ${input.asOf}.`,
        data: {
          ...filters,
          filename,
          rowCount: rows.length,
          checksumSha256: createHash('sha256').update(workbook).digest('hex'),
        },
      })
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('X-Request-ID', requestId)
      res.send(workbook)
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/contracts/meta',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = parseContractQuery(req.query as Record<string, unknown>)
      const [meta, contractTypes] = await Promise.all([
        loadReportMeta(res.locals.auth as AuthContext, input.sites),
        pool.query<RowDataPacket[]>(
          'SELECT uid,code,name FROM contract_types WHERE is_active=1 ORDER BY name'
        ),
      ])
      res.json({
        sites: meta.sites,
        employeeTypes: meta.employeeTypes,
        contractTypes: contractTypes[0],
        contractStatuses: [
          { code: 'DRAFT', name: 'Draf' },
          { code: 'SCHEDULED', name: 'Terjadwal' },
          { code: 'ACTIVE', name: 'Aktif' },
          { code: 'EXPIRED', name: 'Berakhir' },
          { code: 'TERMINATED', name: 'Dihentikan' },
          { code: 'CANCELLED', name: 'Dibatalkan' },
          { code: 'UNKNOWN', name: 'Perlu diperiksa' },
        ],
        expiryStates: [
          { code: 'UPCOMING', name: 'Akan berakhir' },
          { code: 'EXPIRED', name: 'Sudah berakhir' },
        ],
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/contracts',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = parseContractQuery(req.query as Record<string, unknown>)
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const { where, values } = contractReportPredicate(
        input,
        res.locals.auth as AuthContext
      )
      const dataset = `${contractReportSelectSql}
        ${contractReportFromSql}
        WHERE ${where.join(' AND ')}`
      const [summaryRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total,
                COALESCE(SUM(expiryState='UPCOMING'),0) upcoming,
                COALESCE(SUM(expiryState='EXPIRED'),0) expired,
                COALESCE(SUM(contractStatus='ACTIVE'),0) active,
                COALESCE(SUM(contractStatus='SCHEDULED'),0) scheduled,
                COALESCE(SUM(contractStatus='EXPIRED'),0) expiredStatus,
                COALESCE(SUM(effectiveHistoryCount>1),0) ambiguousHistory,
                COALESCE(SUM(effectiveHistoryCount=0),0) missingHistory,
                COALESCE(SUM(siteResolution='UNRESOLVED'),0) unresolvedSite
                ,COALESCE(SUM(statusResolution='UNRESOLVED'),0) unresolvedStatus
           FROM (${dataset}) report_rows`,
        values
      )
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${dataset}) report_rows
         ORDER BY endDate ASC,employeeName ASC,contractNumber ASC
         LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const summary = summaryRows[0] ?? {}
      res.json({
        items: rawRows.map(mapContractReportRow),
        summary: {
          total: Number(summary.total ?? 0),
          upcoming: Number(summary.upcoming ?? 0),
          expired: Number(summary.expired ?? 0),
          active: Number(summary.active ?? 0),
          scheduled: Number(summary.scheduled ?? 0),
          expiredStatus: Number(summary.expiredStatus ?? 0),
          ambiguousHistory: Number(summary.ambiguousHistory ?? 0),
          missingHistory: Number(summary.missingHistory ?? 0),
          unresolvedSite: Number(summary.unresolvedSite ?? 0),
          unresolvedStatus: Number(summary.unresolvedStatus ?? 0),
        },
        total: Number(summary.total ?? 0),
        page,
        pageSize,
        referenceDate: input.referenceDate,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.post(
  '/contracts/export',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const parsed = contractExportSchema.parse(req.body)
      const input: ContractReportInput = {
        referenceDate: parsed.referenceDate,
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
        query: parsed.query,
        sites: parsed.site,
        employeeTypes: parsed.employeeType,
        contractTypes: parsed.contractType,
        contractStatuses: parsed.contractStatus,
        expiryStates: parsed.expiryState,
      }
      const auth = res.locals.auth as AuthContext
      const { where, values } = contractReportPredicate(input, auth)
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${contractReportSelectSql}
          ${contractReportFromSql}
          WHERE ${where.join(' AND ')}) report_rows
         ORDER BY endDate ASC,employeeName ASC,contractNumber ASC`,
        values
      )
      const rows = rawRows.map(mapContractReportRow)
      const sites = await accessibleReportSites(auth, input.sites)
      const generatedAt = generatedAtJakarta()
      const filters = {
        referenceDate: input.referenceDate,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        sites: sites.map((site) => site.code),
        employeeTypes: input.employeeTypes,
        contractTypes: input.contractTypes,
        contractStatuses: input.contractStatuses,
        expiryStates: input.expiryStates,
        hasEmployeeSearch: Boolean(input.query),
      }
      const workbook = await buildContractReportWorkbook({
        title: 'Kontrak Akan dan Sudah Berakhir',
        periodLabel: `${input.dateFrom} s.d. ${input.dateTo}`,
        generatedAt,
        generatedBy: auth.name,
        filters,
        rows: rows.map(
          (row): ContractReportExportRow => ({
            contractNumber: row.contractNumber,
            employeeNumber: row.employeeNumber,
            employeeName: row.employeeName,
            siteName: row.site?.name ?? null,
            siteResolution: row.siteResolution,
            historyStatus: row.historyStatus,
            employeeTypeName: row.employeeType?.name ?? null,
            contractTypeName: row.contractType?.name ?? '',
            startDate: row.startDate,
            endDate: row.endDate,
            contractStatus: row.contractStatus,
            statusResolution: row.statusResolution,
            expiryState: row.expiryState,
            latestLifecycleDate: row.latestLifecycle?.effectiveDate ?? null,
            latestLifecycleSource: row.latestLifecycle?.source ?? null,
          })
        ),
      })
      const filename = `laporan-kontrak-${input.dateFrom}-${input.dateTo}.xlsx`
      const requestId = auditRequestId(req)
      await auditReportExport({
        auth,
        request: req,
        requestId,
        sites,
        table: 'employee_contracts',
        description: (site) =>
          `Mengekspor Laporan Kontrak ${site} periode akhir ${input.dateFrom} sampai ${input.dateTo}.`,
        data: {
          ...filters,
          filename,
          rowCount: rows.length,
          checksumSha256: createHash('sha256').update(workbook).digest('hex'),
        },
      })
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('X-Request-ID', requestId)
      res.send(workbook)
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/mutations/meta',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = parseMutationQuery(req.query as Record<string, unknown>)
      const meta = await loadReportMeta(
        res.locals.auth as AuthContext,
        input.sites
      )
      res.json({
        sites: meta.sites,
        employeeTypes: meta.employeeTypes,
        productionSections: meta.productionSections,
        changeTypes: [
          { code: 'TRANSFER', name: 'Pindah site' },
          { code: 'PROMOTION', name: 'Promosi' },
          { code: 'DEMOTION', name: 'Penurunan jabatan' },
          { code: 'STATUS_CHANGE', name: 'Perubahan status kerja' },
          { code: 'TYPE_CHANGE', name: 'Perubahan jenis karyawan' },
          { code: 'DEPARTMENT_CHANGE', name: 'Perubahan departemen' },
          { code: 'GROUP_CHANGE', name: 'Perubahan kelompok kerja' },
          {
            code: 'PRODUCTION_ASSIGNMENT_CHANGE',
            name: 'Perubahan bagian produksi',
          },
          { code: 'OTHER', name: 'Perubahan lainnya' },
        ],
        mutationStatuses: [
          { code: 'APPLIED', name: 'Sudah berlaku' },
          { code: 'SCHEDULED', name: 'Terjadwal' },
          { code: 'FAILED', name: 'Perlu diperbaiki' },
          { code: 'CANCELLED', name: 'Dibatalkan' },
        ],
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/mutations',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = parseMutationQuery(req.query as Record<string, unknown>)
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const { where, values } = mutationReportPredicate(
        input,
        res.locals.auth as AuthContext
      )
      const dataset = `SELECT * FROM (${mutationReportDatasetSql}) mutation_rows
        WHERE ${where.join(' AND ')}`
      const [summaryRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total,
                COALESCE(SUM(mutationStatus='APPLIED'),0) applied,
                COALESCE(SUM(mutationStatus='SCHEDULED'),0) scheduled,
                COALESCE(SUM(mutationStatus='FAILED'),0) failed,
                COALESCE(SUM(mutationStatus='CANCELLED'),0) cancelled,
                COALESCE(SUM(changeType='TRANSFER'),0) transfer,
                COALESCE(SUM(changeType='PROMOTION'),0) promotion,
                COALESCE(SUM(changeType='DEMOTION'),0) demotion,
                COALESCE(SUM(changeType='STATUS_CHANGE'),0) statusChange
           FROM (${dataset}) filtered_mutations`,
        values
      )
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${dataset}) filtered_mutations
         ORDER BY effectiveDate DESC,employeeName ASC,mutationUid ASC
         LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const summary = summaryRows[0] ?? {}
      res.json({
        items: rawRows.map(mapMutationReportRow),
        summary: {
          total: Number(summary.total ?? 0),
          applied: Number(summary.applied ?? 0),
          scheduled: Number(summary.scheduled ?? 0),
          failed: Number(summary.failed ?? 0),
          cancelled: Number(summary.cancelled ?? 0),
          transfer: Number(summary.transfer ?? 0),
          promotion: Number(summary.promotion ?? 0),
          demotion: Number(summary.demotion ?? 0),
          statusChange: Number(summary.statusChange ?? 0),
        },
        total: Number(summary.total ?? 0),
        page,
        pageSize,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.post(
  '/mutations/export',
  requirePermission('reports.view'),
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const parsed = mutationExportSchema.parse(req.body)
      const input: MutationReportInput = {
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
        query: parsed.query,
        sites: parsed.site,
        sourceSites: parsed.sourceSite,
        employeeTypes: parsed.employeeType,
        productionSections: parsed.productionSection,
        changeTypes: parsed.changeType,
        statuses: parsed.mutationStatus,
      }
      const auth = res.locals.auth as AuthContext
      const { where, values } = mutationReportPredicate(input, auth)
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (SELECT * FROM (${mutationReportDatasetSql}) mutation_rows
          WHERE ${where.join(' AND ')}) filtered_mutations
         ORDER BY effectiveDate DESC,employeeName ASC,mutationUid ASC`,
        values
      )
      const rows = rawRows.map(mapMutationReportRow)
      const sites = await accessibleReportSites(auth, input.sites)
      const generatedAt = generatedAtJakarta()
      const filters = {
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        targetSites: sites.map((site) => site.code),
        sourceSites: input.sourceSites,
        employeeTypes: input.employeeTypes,
        productionSections: input.productionSections,
        changeTypes: input.changeTypes,
        mutationStatuses: input.statuses,
        hasEmployeeSearch: Boolean(input.query),
      }
      const workbook = await buildMutationReportWorkbook({
        title: 'Mutasi Karyawan',
        periodLabel: `${input.dateFrom} s.d. ${input.dateTo}`,
        generatedAt,
        generatedBy: auth.name,
        filters,
        rows: rows.map(
          (row): MutationReportExportRow => ({
            employeeNumber: row.employeeNumber,
            employeeName: row.employeeName,
            effectiveDate: row.effectiveDate,
            changeType: row.changeType,
            mutationStatus: row.mutationStatus,
            sourceSiteName: row.source.site?.name ?? null,
            targetSiteName: row.target.site?.name ?? null,
            sourceEmployeeTypeName: row.source.employeeType?.name ?? null,
            targetEmployeeTypeName: row.target.employeeType?.name ?? null,
            sourcePositionName: row.source.position?.name ?? null,
            targetPositionName: row.target.position?.name ?? null,
            sourceDepartmentName: row.source.department?.name ?? null,
            targetDepartmentName: row.target.department?.name ?? null,
            sourceWorkGroupName: row.source.workGroup?.name ?? null,
            targetWorkGroupName: row.target.workGroup?.name ?? null,
            sourceProductionModuleName:
              row.source.productionModule?.name ?? null,
            targetProductionModuleName:
              row.target.productionModule?.name ?? null,
            sourceProductionSectionName:
              row.source.productionSection?.name ?? null,
            targetProductionSectionName:
              row.target.productionSection?.name ?? null,
            referenceNumber: row.referenceNumber,
            reason: row.reason,
            notes: row.notes,
            failureReason: row.failureReason,
          })
        ),
      })
      const filename = `laporan-mutasi-${input.dateFrom}-${input.dateTo}.xlsx`
      const requestId = auditRequestId(req)
      await auditReportExport({
        auth,
        request: req,
        requestId,
        sites,
        table: 'employee_employment_histories',
        description: (site) =>
          `Mengekspor Laporan Mutasi ${site} periode ${input.dateFrom} sampai ${input.dateTo}.`,
        data: {
          ...filters,
          filename,
          rowCount: rows.length,
          checksumSha256: createHash('sha256').update(workbook).digest('hex'),
        },
      })
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('X-Request-ID', requestId)
      res.send(workbook)
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/payroll-final/meta',
  requirePermission('reports.view'),
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const sites = await accessibleReportSites(
        auth,
        csv(req.query.site, siteCode)
      )
      res.json({
        sites: sites.map(({ id: _id, ...site }) => site),
        employeeTypes: [
          { code: 'BORONGAN', name: 'Borongan' },
          { code: 'HARIAN', name: 'Harian' },
          { code: 'TRAINING', name: 'Training' },
          { code: 'BULANAN', name: 'Bulanan' },
        ],
        payrollBases: [
          { code: 'PIECE_RATE', name: 'Berdasarkan hasil produksi' },
          { code: 'TIME_BASED', name: 'Berdasarkan waktu kerja' },
        ],
        payFrequencies: [
          { code: 'WEEKLY', name: 'Mingguan' },
          { code: 'MONTHLY', name: 'Bulanan' },
        ],
        canExport:
          auth.roles.includes('SUPER_ADMIN') ||
          auth.permissions.includes('payroll.export'),
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/payroll-final',
  requirePermission('reports.view'),
  requirePermission('payroll.view'),
  async (req, res, next) => {
    try {
      const input = parsePayrollFinalQuery(
        req.query as Record<string, unknown>
      )
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const { where, values } = payrollFinalReportPredicate(
        input,
        res.locals.auth as AuthContext
      )
      const dataset = `SELECT * FROM (${payrollFinalDatasetSql}) payroll_rows
        WHERE ${where.join(' AND ')}`
      const [summaryRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total,
                COUNT(DISTINCT periodUid) periodCount,
                COUNT(DISTINCT siteUid) siteCount,
                COUNT(DISTINCT employeeUid) employeeCount,
                COALESCE(SUM(pieceRateAmount),0) totalPieceRate,
                COALESCE(SUM(basicSalaryAmount),0) totalBasicSalary,
                COALESCE(SUM(additionalEarnings),0) totalAdditionalEarnings,
                COALESCE(SUM(grossEarnings),0) totalGrossEarnings,
                COALESCE(SUM(totalDeductions),0) totalDeductions,
                COALESCE(SUM(netPay),0) totalNetPay
           FROM (${dataset}) filtered_payroll`,
        values
      )
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${dataset}) filtered_payroll
         ORDER BY periodEnd DESC,siteName ASC,employeeName ASC,employeeNumber ASC
         LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const summary = summaryRows[0] ?? {}
      res.json({
        items: rawRows.map(mapPayrollFinalReportRow),
        summary: {
          total: Number(summary.total ?? 0),
          periodCount: Number(summary.periodCount ?? 0),
          siteCount: Number(summary.siteCount ?? 0),
          employeeCount: Number(summary.employeeCount ?? 0),
          totalPieceRate: reportMoney(summary.totalPieceRate),
          totalBasicSalary: reportMoney(summary.totalBasicSalary),
          totalAdditionalEarnings: reportMoney(
            summary.totalAdditionalEarnings
          ),
          totalGrossEarnings: reportMoney(summary.totalGrossEarnings),
          totalDeductions: reportMoney(summary.totalDeductions),
          totalNetPay: reportMoney(summary.totalNetPay),
        },
        total: Number(summary.total ?? 0),
        page,
        pageSize,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        official: true,
        closedDoesNotMeanPaid: true,
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.post(
  '/payroll-final/export',
  requirePermission('reports.view'),
  requirePermission('payroll.view'),
  requirePermission('payroll.export'),
  async (req, res, next) => {
    try {
      const parsed = payrollFinalExportSchema.parse(req.body)
      const input: PayrollFinalReportInput = {
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
        query: parsed.query,
        sites: parsed.site,
        employeeTypes: parsed.employeeType,
        payrollBases: parsed.payrollBasis,
        payFrequencies: parsed.payFrequency,
      }
      const auth = res.locals.auth as AuthContext
      const { where, values } = payrollFinalReportPredicate(input, auth)
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (SELECT * FROM (${payrollFinalDatasetSql}) payroll_rows
          WHERE ${where.join(' AND ')}) filtered_payroll
         ORDER BY periodEnd DESC,siteName ASC,employeeName ASC,employeeNumber ASC`,
        values
      )
      const rows = rawRows.map(mapPayrollFinalReportRow)
      const sites = await accessibleReportSites(auth, input.sites)
      const generatedAt = generatedAtJakarta()
      const filters = {
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        sites: sites.map((site) => site.code),
        employeeTypes: input.employeeTypes,
        payrollBases: input.payrollBases,
        payFrequencies: input.payFrequencies,
        hasEmployeeOrPeriodSearch: Boolean(input.query),
      }
      const workbook = await buildPayrollFinalReportWorkbook({
        title: 'Payroll Final',
        periodLabel: `Periode berakhir ${input.dateFrom} s.d. ${input.dateTo}`,
        generatedAt,
        generatedBy: auth.name,
        filters,
        rows: rows.map(
          (row): PayrollFinalReportExportRow => ({
            periodCode: row.period.code,
            periodName: row.period.name,
            periodStart: row.period.start,
            periodEnd: row.period.end,
            paymentDate: row.period.paymentDate,
            siteName: row.site?.name ?? '',
            employeeNumber: row.employeeNumber,
            employeeName: row.employeeName,
            employeeType: row.employeeType,
            payrollBasis: row.period.payrollBasis,
            payFrequency: row.period.payFrequency,
            departmentName: row.departmentName,
            positionName: row.positionName,
            workGroupName: row.workGroupName,
            attendanceDays: row.attendanceDays,
            productionTransactionCount: row.productionTransactionCount,
            bankName: row.bank.name,
            accountLast4: row.bank.accountLast4,
            pieceRateAmount: row.amounts.pieceRate,
            basicSalaryAmount: row.amounts.basicSalary,
            additionalEarnings: row.amounts.additionalEarnings,
            grossEarnings: row.amounts.grossEarnings,
            totalDeductions: row.amounts.totalDeductions,
            netPay: row.amounts.netPay,
          })
        ),
      })
      const filename = `laporan-payroll-final-${input.dateFrom}-${input.dateTo}.xlsx`
      const requestId = auditRequestId(req)
      await auditReportExport({
        auth,
        request: req,
        requestId,
        sites,
        table: 'payroll_employee_results',
        description: (site) =>
          `Mengekspor Laporan Payroll Final ${site} untuk periode berakhir ${input.dateFrom} sampai ${input.dateTo}.`,
        data: {
          ...filters,
          filename,
          rowCount: rows.length,
          checksumSha256: createHash('sha256').update(workbook).digest('hex'),
        },
      })
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('X-Request-ID', requestId)
      res.send(workbook)
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/attendance-classifications/meta',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseAttendanceClassificationQuery(
        req.query as Record<string, unknown>
      )
      const auth = res.locals.auth as AuthContext
      const meta = await loadReportMeta(auth, input.sites)
      res.json({
        ...meta,
        classificationTypes: [
          { code: 'LEAVE', name: 'Cuti' },
          { code: 'SICK', name: 'Sakit' },
          { code: 'PERMISSION', name: 'Izin' },
        ],
        approvalStatuses: [
          { code: 'PENDING', name: 'Menunggu pemeriksaan' },
          { code: 'APPROVED', name: 'Disetujui' },
          { code: 'REJECTED', name: 'Ditolak' },
          { code: 'CANCELLED', name: 'Dibatalkan' },
        ],
        canExport:
          auth.roles.includes('SUPER_ADMIN') ||
          auth.permissions.includes('attendance.export'),
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/attendance-classifications',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseAttendanceClassificationQuery(
        req.query as Record<string, unknown>
      )
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const { where, values } = attendanceClassificationReportPredicate(
        input,
        res.locals.auth as AuthContext
      )
      const dataset = `SELECT * FROM (${attendanceClassificationDatasetSql}) classification_rows
        WHERE ${where.join(' AND ')}`
      const [summaryRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total,
          COALESCE(SUM(approvalStatus='PENDING'),0) pending,
          COALESCE(SUM(approvalStatus='APPROVED'),0) approved,
          COALESCE(SUM(approvalStatus='REJECTED'),0) rejected,
          COALESCE(SUM(approvalStatus='CANCELLED'),0) cancelled,
          COALESCE(SUM(calendarDays),0) totalCalendarDays,
          COALESCE(SUM(appliedCount),0) appliedDays
         FROM (${dataset}) filtered_classifications`,
        values
      )
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${dataset}) filtered_classifications
         ORDER BY startDate DESC,employeeName ASC,employeeNumber ASC
         LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const summary = summaryRows[0] ?? {}
      res.json({
        items: rawRows.map(mapAttendanceClassificationReportRow),
        summary: {
          total: Number(summary.total ?? 0),
          pending: Number(summary.pending ?? 0),
          approved: Number(summary.approved ?? 0),
          rejected: Number(summary.rejected ?? 0),
          cancelled: Number(summary.cancelled ?? 0),
          totalCalendarDays: Number(summary.totalCalendarDays ?? 0),
          appliedDays: Number(summary.appliedDays ?? 0),
        },
        total: Number(summary.total ?? 0),
        page,
        pageSize,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.post(
  '/attendance-classifications/export',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  requirePermission('attendance.export'),
  async (req, res, next) => {
    try {
      const parsed = attendanceClassificationExportSchema.parse(req.body)
      const input: AttendanceClassificationReportInput = {
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
        query: parsed.query,
        sites: parsed.site,
        employeeTypes: parsed.employeeType,
        productionSections: parsed.productionSection,
        classificationTypes: parsed.classificationType,
        approvalStatuses: parsed.approvalStatus,
      }
      const auth = res.locals.auth as AuthContext
      const { where, values } = attendanceClassificationReportPredicate(
        input,
        auth
      )
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (SELECT * FROM (${attendanceClassificationDatasetSql}) classification_rows
          WHERE ${where.join(' AND ')}) filtered_classifications
         ORDER BY startDate DESC,employeeName ASC,employeeNumber ASC`,
        values
      )
      const rows = rawRows.map(mapAttendanceClassificationReportRow)
      const sites = await accessibleReportSites(auth, input.sites)
      const filters = {
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        sites: sites.map((site) => site.code),
        employeeTypes: input.employeeTypes,
        productionSections: input.productionSections,
        classificationTypes: input.classificationTypes,
        approvalStatuses: input.approvalStatuses,
        hasEmployeeSearch: Boolean(input.query),
      }
      const workbook = await buildAttendanceClassificationReportWorkbook({
        title: 'Cuti, Sakit & Izin',
        periodLabel: `Pengajuan yang bersinggungan dengan ${input.dateFrom} s.d. ${input.dateTo}`,
        generatedAt: generatedAtJakarta(),
        generatedBy: auth.name,
        filters,
        rows: rows.map(
          (row): AttendanceClassificationReportExportRow => ({
            employeeNumber: row.employeeNumber,
            employeeName: row.employeeName,
            siteName: row.site?.name ?? '',
            employeeTypeName: row.employeeType?.name ?? null,
            productionModuleName: row.productionModule?.name ?? null,
            productionSectionName: row.productionSection?.name ?? null,
            classificationType: row.classificationType,
            startDate: row.startDate,
            endDate: row.endDate,
            calendarDays: row.calendarDays,
            approvalStatus: row.approvalStatus,
            requestedAt: row.requestedAt,
            requestedByName: row.requestedByName,
            reviewedAt: row.reviewedAt,
            reviewedByName: row.reviewedByName,
            detailCount: row.outcomes.total,
            appliedCount: row.outcomes.applied,
            skippedCount: row.outcomes.skipped,
            reversedCount: row.outcomes.reversed,
            historyStatus: row.historyStatus,
          })
        ),
      })
      const filename = `laporan-cuti-sakit-izin-${input.dateFrom}-${input.dateTo}.xlsx`
      const requestId = auditRequestId(req)
      await auditReportExport({
        auth,
        request: req,
        requestId,
        sites,
        table: 'attendance_classification_requests',
        description: (site) =>
          `Mengekspor Laporan Cuti, Sakit & Izin ${site} untuk ${input.dateFrom} sampai ${input.dateTo}.`,
        data: {
          ...filters,
          filename,
          rowCount: rows.length,
          checksumSha256: createHash('sha256').update(workbook).digest('hex'),
        },
      })
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('X-Request-ID', requestId)
      res.send(workbook)
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/attendance-corrections/meta',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseAttendanceCorrectionQuery(
        req.query as Record<string, unknown>
      )
      const auth = res.locals.auth as AuthContext
      const meta = await loadReportMeta(auth, input.sites)
      res.json({
        ...meta,
        correctionTypes: [
          { code: 'CLOCK_IN', name: 'Jam masuk' },
          { code: 'CLOCK_OUT', name: 'Jam pulang' },
          { code: 'BOTH', name: 'Jam masuk dan pulang' },
          { code: 'STATUS', name: 'Status kehadiran' },
        ],
        approvalStatuses: [
          { code: 'PENDING', name: 'Menunggu pemeriksaan' },
          { code: 'APPROVED', name: 'Disetujui' },
          { code: 'REJECTED', name: 'Ditolak' },
          { code: 'CANCELLED', name: 'Dibatalkan' },
        ],
        canExport:
          auth.roles.includes('SUPER_ADMIN') ||
          auth.permissions.includes('attendance.export'),
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/attendance-corrections',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseAttendanceCorrectionQuery(
        req.query as Record<string, unknown>
      )
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const { where, values } = attendanceCorrectionReportPredicate(
        input,
        res.locals.auth as AuthContext
      )
      const dataset = `SELECT * FROM (${attendanceCorrectionDatasetSql}) correction_rows
        WHERE ${where.join(' AND ')}`
      const [summaryRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total,
          COALESCE(SUM(approvalStatus='PENDING'),0) pending,
          COALESCE(SUM(approvalStatus='APPROVED'),0) approved,
          COALESCE(SUM(approvalStatus='REJECTED'),0) rejected,
          COALESCE(SUM(approvalStatus='CANCELLED'),0) cancelled,
          COALESCE(SUM(appliedAt IS NOT NULL),0) applied
         FROM (${dataset}) filtered_corrections`,
        values
      )
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${dataset}) filtered_corrections
         ORDER BY businessDate DESC,requestedAt DESC,employeeName ASC,employeeNumber ASC
         LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const summary = summaryRows[0] ?? {}
      res.json({
        items: rawRows.map(mapAttendanceCorrectionReportRow),
        summary: {
          total: Number(summary.total ?? 0),
          pending: Number(summary.pending ?? 0),
          approved: Number(summary.approved ?? 0),
          rejected: Number(summary.rejected ?? 0),
          cancelled: Number(summary.cancelled ?? 0),
          applied: Number(summary.applied ?? 0),
        },
        total: Number(summary.total ?? 0),
        page,
        pageSize,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.post(
  '/attendance-corrections/export',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  requirePermission('attendance.export'),
  async (req, res, next) => {
    try {
      const parsed = attendanceCorrectionExportSchema.parse(req.body)
      const input: AttendanceCorrectionReportInput = {
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
        query: parsed.query,
        sites: parsed.site,
        employeeTypes: parsed.employeeType,
        productionSections: parsed.productionSection,
        correctionTypes: parsed.correctionType,
        approvalStatuses: parsed.approvalStatus,
      }
      const auth = res.locals.auth as AuthContext
      const { where, values } = attendanceCorrectionReportPredicate(input, auth)
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (SELECT * FROM (${attendanceCorrectionDatasetSql}) correction_rows
          WHERE ${where.join(' AND ')}) filtered_corrections
         ORDER BY businessDate DESC,requestedAt DESC,employeeName ASC,employeeNumber ASC`,
        values
      )
      const rows = rawRows.map(mapAttendanceCorrectionReportRow)
      const sites = await accessibleReportSites(auth, input.sites)
      const filters = {
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        sites: sites.map((site) => site.code),
        employeeTypes: input.employeeTypes,
        productionSections: input.productionSections,
        correctionTypes: input.correctionTypes,
        approvalStatuses: input.approvalStatuses,
        hasEmployeeSearch: Boolean(input.query),
      }
      const workbook = await buildAttendanceCorrectionReportWorkbook({
        title: 'Koreksi Attendance',
        periodLabel: `Tanggal kerja ${input.dateFrom} s.d. ${input.dateTo}`,
        generatedAt: generatedAtJakarta(),
        generatedBy: auth.name,
        filters,
        rows: rows.map(
          (row): AttendanceCorrectionReportExportRow => ({
            employeeNumber: row.employeeNumber,
            employeeName: row.employeeName,
            siteName: row.site?.name ?? '',
            employeeTypeName: row.employeeType?.name ?? null,
            productionModuleName: row.productionModule?.name ?? null,
            productionSectionName: row.productionSection?.name ?? null,
            businessDate: row.businessDate,
            correctionType: row.correctionType,
            oldClockInAt: row.changes.clockIn.before,
            newClockInAt: row.changes.clockIn.after,
            oldClockOutAt: row.changes.clockOut.before,
            newClockOutAt: row.changes.clockOut.after,
            oldStatus: row.changes.status.before,
            newStatus: row.changes.status.after,
            approvalStatus: row.approvalStatus,
            requestedAt: row.requestedAt,
            requestedByName: row.requestedByName,
            reviewedAt: row.reviewedAt,
            reviewedByName: row.reviewedByName,
            appliedAt: row.appliedAt,
            historyStatus: row.historyStatus,
          })
        ),
      })
      const filename = `laporan-koreksi-attendance-${input.dateFrom}-${input.dateTo}.xlsx`
      const requestId = auditRequestId(req)
      await auditReportExport({
        auth,
        request: req,
        requestId,
        sites,
        table: 'attendance_corrections',
        description: (site) =>
          `Mengekspor Laporan Koreksi Attendance ${site} untuk tanggal kerja ${input.dateFrom} sampai ${input.dateTo}.`,
        data: {
          ...filters,
          filename,
          rowCount: rows.length,
          checksumSha256: createHash('sha256').update(workbook).digest('hex'),
        },
      })
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('X-Request-ID', requestId)
      res.send(workbook)
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/attendance/meta',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseAttendanceQuery(req.query as Record<string, unknown>)
      const meta = await loadReportMeta(
        res.locals.auth as AuthContext,
        input.sites
      )
      res.json({
        sites: meta.sites,
        employeeTypes: meta.employeeTypes,
        productionSections: meta.productionSections,
        attendanceStatuses: [
          { code: 'PRESENT', name: 'Hadir' },
          { code: 'ABSENT', name: 'Alpha' },
          { code: 'LEAVE', name: 'Cuti' },
          { code: 'SICK', name: 'Sakit' },
          { code: 'PERMISSION', name: 'Izin' },
          { code: 'HOLIDAY', name: 'Libur' },
          { code: 'WEEKLY_OFF', name: 'Libur mingguan' },
        ],
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/attendance',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseAttendanceQuery(req.query as Record<string, unknown>)
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const sites = await resolveAttendanceSites(
        res.locals.auth as AuthContext,
        input.sites
      )
      const projection = await loadAttendanceRecapProjection({
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        goLiveDate: env.ATTENDANCE_GO_LIVE_DATE,
        sites,
      })
      const groups = summarizeAttendanceRecap(
        filterAttendanceDetails(projection.details, input)
      )
      res.json({
        items: groups.slice((page - 1) * pageSize, page * pageSize),
        summary: aggregateAttendanceRecap(groups),
        finalization: {
          status: projection.completeness.exportAllowed
            ? 'OFFICIAL'
            : 'PROVISIONAL',
          ...projection.completeness,
        },
        total: groups.length,
        page,
        pageSize,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      })
    } catch (error) {
      next(error)
    }
  }
)

const shiftAssignmentQuerySchema = z.object({
  referenceDate: z.string().date(),
  query: z.string().trim().max(150).optional(),
})

function parseShiftAssignmentQuery(raw: Record<string, unknown>) {
  return {
    ...shiftAssignmentQuerySchema.parse({
      referenceDate: raw.referenceDate,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    employeeTypes: csv(raw.employeeType, employeeTypeCode),
    productionSections: csv(raw.productionSection, productionSectionUid),
    shifts: csv(raw.shift, z.string().uuid()),
    readinessStatuses: csv(
      raw.readinessStatus,
      shiftAssignmentReadinessStatus
    ),
  }
}

const shiftAssignmentExportSchema = shiftAssignmentQuerySchema.extend({
  site: z.array(siteCode).default([]),
  employeeType: z.array(employeeTypeCode).default([]),
  productionSection: z.array(productionSectionUid).default([]),
  shift: z.array(z.string().uuid()).default([]),
  readinessStatus: z.array(shiftAssignmentReadinessStatus).default([]),
})

type ShiftAssignmentReportInput = ReturnType<
  typeof parseShiftAssignmentQuery
>

// Snapshot operasional per karyawan pada tanggal acuan. Bila tidak ada
// assignment efektif, assignment terakhir atau terdekat tetap ditampilkan agar
// pengguna memahami apakah penugasannya berakhir atau belum mulai.
const shiftAssignmentDatasetSql = `SELECT assignment_rows.*,
  CASE
    WHEN effectiveHistoryCount<>1 THEN 'EMPLOYMENT_AMBIGUOUS'
    WHEN assignmentUid IS NULL THEN 'NO_ASSIGNMENT'
    WHEN activeAssignmentCount>1 THEN 'OVERLAP'
    WHEN effectiveFrom>referenceDate THEN 'UPCOMING'
    WHEN effectiveTo IS NOT NULL AND effectiveTo<referenceDate THEN 'ENDED'
    WHEN shiftSiteCode<>siteCode THEN 'SITE_MISMATCH'
    WHEN shiftIsActive<>1 THEN 'SHIFT_INACTIVE'
    WHEN workDayCount=0 THEN 'NO_WORK_DAYS'
    ELSE 'READY'
  END readinessStatus
FROM (
  SELECT
    ref.referenceDate,
    e.uid employeeUid,e.employee_number employeeNumber,e.full_name employeeName,
    s.uid siteUid,s.code siteCode,s.name siteName,
    et.uid employeeTypeUid,et.code employeeTypeCode,et.name employeeTypeName,
    pm.uid productionModuleUid,pm.name productionModuleName,
    ps.uid productionSectionUid,ps.code productionSectionCode,ps.name productionSectionName,
    esa.uid assignmentUid,
    sh.uid shiftUid,sh.code shiftCode,sh.name shiftName,
    shift_site.uid shiftSiteUid,shift_site.code shiftSiteCode,shift_site.name shiftSiteName,
    TIME_FORMAT(sh.start_time,'%H:%i:%s') startTime,
    TIME_FORMAT(sh.end_time,'%H:%i:%s') endTime,
    COALESCE(sh.crosses_midnight,0) crossesMidnight,
    COALESCE(sh.is_active,0) shiftIsActive,
    DATE_FORMAT(esa.effective_from,'%Y-%m-%d') effectiveFrom,
    DATE_FORMAT(esa.effective_to,'%Y-%m-%d') effectiveTo,
    COALESCE(esa.work_days_json,JSON_ARRAY()) workDaysJson,
    JSON_LENGTH(COALESCE(esa.work_days_json,JSON_ARRAY())) workDayCount,
    (SELECT COUNT(*) FROM employee_employment_histories history_count
      WHERE history_count.employee_id=e.id
        AND history_count.effective_from<=ref.referenceDate
        AND (history_count.effective_to IS NULL OR history_count.effective_to>=ref.referenceDate)
    ) effectiveHistoryCount,
    (SELECT COUNT(*) FROM employee_shift_assignments active_assignment
      WHERE active_assignment.employee_id=e.id
        AND active_assignment.effective_from<=ref.referenceDate
        AND (active_assignment.effective_to IS NULL OR active_assignment.effective_to>=ref.referenceDate)
    ) activeAssignmentCount
  FROM employees e
  CROSS JOIN (SELECT ? referenceDate) ref
  JOIN employee_employment_histories eh ON eh.id=(
    SELECT selected_history.id
      FROM employee_employment_histories selected_history
     WHERE selected_history.employee_id=e.id
       AND selected_history.effective_from<=ref.referenceDate
       AND (selected_history.effective_to IS NULL OR selected_history.effective_to>=ref.referenceDate)
     ORDER BY selected_history.effective_from DESC,selected_history.id DESC
     LIMIT 1
  )
  JOIN employee_statuses es
    ON es.id=eh.employee_status_id AND es.allows_attendance=1
  JOIN sites s ON s.id=eh.site_id
  JOIN employee_types et ON et.id=eh.employee_type_id
  LEFT JOIN production_module_sections pms ON pms.id=eh.production_module_section_id
  LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
  LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
  LEFT JOIN employee_shift_assignments esa ON esa.id=COALESCE(
    (SELECT MIN(active_assignment.id)
       FROM employee_shift_assignments active_assignment
      WHERE active_assignment.employee_id=e.id
        AND active_assignment.effective_from<=ref.referenceDate
        AND (active_assignment.effective_to IS NULL OR active_assignment.effective_to>=ref.referenceDate)),
    (SELECT previous_assignment.id
       FROM employee_shift_assignments previous_assignment
      WHERE previous_assignment.employee_id=e.id
        AND previous_assignment.effective_from<=ref.referenceDate
      ORDER BY previous_assignment.effective_from DESC,previous_assignment.id DESC
      LIMIT 1),
    (SELECT future_assignment.id
       FROM employee_shift_assignments future_assignment
      WHERE future_assignment.employee_id=e.id
        AND future_assignment.effective_from>ref.referenceDate
      ORDER BY future_assignment.effective_from ASC,future_assignment.id ASC
      LIMIT 1)
  )
  LEFT JOIN shifts sh ON sh.id=esa.shift_id
  LEFT JOIN sites shift_site ON shift_site.id=sh.site_id
) assignment_rows`

function shiftAssignmentReportPredicate(
  input: ShiftAssignmentReportInput,
  auth: AuthContext
) {
  const where = ['1=1']
  const values: unknown[] = [input.referenceDate]
  addSiteScope(where, values, auth, input.sites, 'siteCode')
  addListFilter(where, values, 'employeeTypeCode', input.employeeTypes)
  addListFilter(
    where,
    values,
    'productionSectionUid',
    input.productionSections
  )
  addListFilter(where, values, 'shiftUid', input.shifts)
  addListFilter(
    where,
    values,
    'readinessStatus',
    input.readinessStatuses
  )
  if (input.query) {
    where.push('(employeeName LIKE ? OR employeeNumber LIKE ?)')
    values.push(`%${input.query}%`, `%${input.query}%`)
  }
  return { where, values }
}

function mapShiftAssignmentReportRow(row: RowDataPacket) {
  const workDays = (() => {
    try {
      const parsed = Array.isArray(row.workDaysJson)
        ? row.workDaysJson
        : JSON.parse(String(row.workDaysJson ?? '[]'))
      return parsed
        .map(Number)
        .filter(
          (value: number) =>
            Number.isInteger(value) && value >= 1 && value <= 7
        )
    } catch {
      return [] as number[]
    }
  })()
  return {
    employeeUid: String(row.employeeUid),
    employeeNumber: String(row.employeeNumber),
    employeeName: String(row.employeeName),
    site: mapReference(row, 'site'),
    employeeType: mapReference(row, 'employeeType'),
    productionModule: mapReference(row, 'productionModule'),
    productionSection: mapReference(row, 'productionSection'),
    assignmentUid: row.assignmentUid ? String(row.assignmentUid) : null,
    shift: mapReference(row, 'shift'),
    shiftSite: mapReference(row, 'shiftSite'),
    startTime: row.startTime ? String(row.startTime) : null,
    endTime: row.endTime ? String(row.endTime) : null,
    crossesMidnight: Number(row.crossesMidnight ?? 0) === 1,
    effectiveFrom: row.effectiveFrom ? String(row.effectiveFrom) : null,
    effectiveTo: row.effectiveTo ? String(row.effectiveTo) : null,
    workDays,
    readinessStatus: String(row.readinessStatus),
  }
}

async function loadShiftAssignmentMeta(
  auth: AuthContext,
  requestedSites: string[]
) {
  const meta = await loadReportMeta(auth, requestedSites)
  const where = ['sh.is_active=1']
  const values: unknown[] = []
  addSiteScope(where, values, auth, requestedSites, 's.code')
  const [shifts] = await pool.query<RowDataPacket[]>(
    `SELECT sh.uid,sh.code,CONCAT(sh.name,' - ',s.name) name
       FROM shifts sh JOIN sites s ON s.id=sh.site_id
      WHERE ${where.join(' AND ')} ORDER BY s.name,sh.name`,
    values
  )
  return {
    ...meta,
    shifts,
    readinessStatuses: [
      { code: 'READY', name: 'Siap digunakan' },
      { code: 'NO_ASSIGNMENT', name: 'Belum pernah memiliki shift' },
      { code: 'ENDED', name: 'Penugasan sudah berakhir' },
      { code: 'UPCOMING', name: 'Belum mulai berlaku' },
      { code: 'OVERLAP', name: 'Penugasan bertumpang-tindih' },
      { code: 'SITE_MISMATCH', name: 'Site shift berbeda' },
      { code: 'SHIFT_INACTIVE', name: 'Shift tidak aktif' },
      { code: 'NO_WORK_DAYS', name: 'Hari kerja belum dipilih' },
      { code: 'EMPLOYMENT_AMBIGUOUS', name: 'Riwayat kerja bermasalah' },
    ],
    canExport:
      auth.roles.includes('SUPER_ADMIN') ||
      auth.permissions.includes('attendance.export'),
  }
}

reportsRouter.get(
  '/shift-assignments/meta',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseShiftAssignmentQuery(req.query as Record<string, unknown>)
      res.json(
        await loadShiftAssignmentMeta(
          res.locals.auth as AuthContext,
          input.sites
        )
      )
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/shift-assignments',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseShiftAssignmentQuery(req.query as Record<string, unknown>)
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const { where, values } = shiftAssignmentReportPredicate(
        input,
        res.locals.auth as AuthContext
      )
      const dataset = `SELECT * FROM (${shiftAssignmentDatasetSql}) shift_rows
        WHERE ${where.join(' AND ')}`
      const [summaryRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total,
          COALESCE(SUM(readinessStatus='READY'),0) ready,
          COALESCE(SUM(readinessStatus<>'READY'),0) attention,
          COALESCE(SUM(readinessStatus='NO_ASSIGNMENT'),0) noAssignment,
          COALESCE(SUM(readinessStatus='ENDED'),0) ended,
          COALESCE(SUM(readinessStatus='OVERLAP'),0) overlap,
          COALESCE(SUM(readinessStatus='SITE_MISMATCH'),0) siteMismatch
         FROM (${dataset}) filtered_shifts`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${dataset}) filtered_shifts
         ORDER BY (readinessStatus='READY') ASC,employeeName,employeeNumber
         LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const summary = summaryRows[0] ?? {}
      res.json({
        items: rows.map(mapShiftAssignmentReportRow),
        summary: {
          total: Number(summary.total ?? 0),
          ready: Number(summary.ready ?? 0),
          attention: Number(summary.attention ?? 0),
          noAssignment: Number(summary.noAssignment ?? 0),
          ended: Number(summary.ended ?? 0),
          overlap: Number(summary.overlap ?? 0),
          siteMismatch: Number(summary.siteMismatch ?? 0),
        },
        total: Number(summary.total ?? 0),
        page,
        pageSize,
        referenceDate: input.referenceDate,
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.post(
  '/shift-assignments/export',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  requirePermission('attendance.export'),
  async (req, res, next) => {
    try {
      const parsed = shiftAssignmentExportSchema.parse(req.body)
      const input: ShiftAssignmentReportInput = {
        referenceDate: parsed.referenceDate,
        query: parsed.query,
        sites: parsed.site,
        employeeTypes: parsed.employeeType,
        productionSections: parsed.productionSection,
        shifts: parsed.shift,
        readinessStatuses: parsed.readinessStatus,
      }
      const auth = res.locals.auth as AuthContext
      const { where, values } = shiftAssignmentReportPredicate(input, auth)
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${shiftAssignmentDatasetSql}) shift_rows
          WHERE ${where.join(' AND ')}
         ORDER BY (readinessStatus='READY') ASC,employeeName,employeeNumber`,
        values
      )
      const rows = rawRows.map(mapShiftAssignmentReportRow)
      const sites = await accessibleReportSites(auth, input.sites)
      const filters = {
        referenceDate: input.referenceDate,
        sites: sites.map((site) => site.code),
        employeeTypes: input.employeeTypes,
        productionSections: input.productionSections,
        shifts: input.shifts,
        readinessStatuses: input.readinessStatuses,
        hasEmployeeSearch: Boolean(input.query),
      }
      const workbook = await buildShiftAssignmentReportWorkbook({
        title: 'Penugasan Shift',
        periodLabel: `Posisi per ${input.referenceDate}`,
        generatedAt: generatedAtJakarta(),
        generatedBy: auth.name,
        filters,
        rows: rows.map(
          (row): ShiftAssignmentReportExportRow => ({
            employeeNumber: row.employeeNumber,
            employeeName: row.employeeName,
            siteName: row.site?.name ?? '',
            employeeTypeName: row.employeeType?.name ?? '',
            productionModuleName: row.productionModule?.name ?? null,
            productionSectionName: row.productionSection?.name ?? null,
            shiftName: row.shift?.name ?? null,
            shiftCode: row.shift?.code ?? null,
            startTime: row.startTime,
            endTime: row.endTime,
            effectiveFrom: row.effectiveFrom,
            effectiveTo: row.effectiveTo,
            workDays: row.workDays,
            readinessStatus: row.readinessStatus,
          })
        ),
      })
      const filename = `laporan-penugasan-shift-${input.referenceDate}.xlsx`
      const requestId = auditRequestId(req)
      await auditReportExport({
        auth,
        request: req,
        requestId,
        sites,
        table: 'employee_shift_assignments',
        description: (site) =>
          `Mengekspor Laporan Penugasan Shift ${site} per ${input.referenceDate}.`,
        data: {
          ...filters,
          filename,
          rowCount: rows.length,
          checksumSha256: createHash('sha256').update(workbook).digest('hex'),
        },
      })
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('X-Request-ID', requestId)
      res.send(workbook)
    } catch (error) {
      next(error)
    }
  }
)

const deviceScanQuerySchema = z
  .object({
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
    query: z.string().trim().max(150).optional(),
  })
  .superRefine((input, context) => {
    const start = new Date(`${input.dateFrom}T00:00:00Z`)
    const end = new Date(`${input.dateTo}T00:00:00Z`)
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
    if (days < 1) {
      context.addIssue({
        code: 'custom',
        message: 'Tanggal akhir tidak boleh sebelum tanggal awal.',
        path: ['dateTo'],
      })
    } else if (days > 366) {
      context.addIssue({
        code: 'custom',
        message: 'Rentang laporan perangkat maksimal 366 hari kalender.',
        path: ['dateTo'],
      })
    }
  })

function parseDeviceScanQuery(raw: Record<string, unknown>) {
  return {
    ...deviceScanQuerySchema.parse({
      dateFrom: raw.dateFrom,
      dateTo: raw.dateTo,
      query: String(raw.query ?? '').trim() || undefined,
    }),
    sites: csv(raw.site, siteCode),
    deviceTypes: csv(raw.deviceType, deviceType),
    resultStatuses: csv(raw.resultStatus, scanResultStatus),
    activityStatuses: csv(raw.activityStatus, deviceActivityStatus),
  }
}

const deviceScanExportSchema = deviceScanQuerySchema.extend({
  site: z.array(siteCode).default([]),
  deviceType: z.array(deviceType).default([]),
  resultStatus: z.array(scanResultStatus).default([]),
  activityStatus: z.array(deviceActivityStatus).default([]),
})

type DeviceScanReportInput = ReturnType<typeof parseDeviceScanQuery>

const deviceScanDatasetSql = `SELECT device_rows.*,
  CASE
    WHEN isActive<>1 THEN 'INACTIVE'
    WHEN isAttendanceActivated<>1 THEN 'NOT_ACTIVATED'
    WHEN totalScans=0 THEN 'NO_ACTIVITY'
    WHEN rejectedScans>0 OR errorScans>0 THEN 'ATTENTION'
    ELSE 'HEALTHY'
  END activityStatus
FROM (
  SELECT
    d.uid deviceUid,d.code deviceCode,d.name deviceName,
    d.device_type deviceType,d.location_description locationDescription,
    d.is_active isActive,(d.device_token_hash IS NOT NULL) isAttendanceActivated,
    CASE WHEN d.activated_at IS NULL THEN NULL
         ELSE CONCAT(DATE_FORMAT(d.activated_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') END activatedAt,
    CASE WHEN d.last_seen_at IS NULL THEN NULL
         ELSE CONCAT(DATE_FORMAT(d.last_seen_at,'%Y-%m-%dT%H:%i:%s.000'),'+07:00') END lastSeenAt,
    s.uid siteUid,s.code siteCode,s.name siteName,
    COUNT(ase.id) totalScans,
    COALESCE(SUM(ase.event_type='CLOCK_IN'),0) clockInScans,
    COALESCE(SUM(ase.event_type='CLOCK_OUT'),0) clockOutScans,
    COALESCE(SUM(ase.result_status='SUCCESS'),0) successfulScans,
    COALESCE(SUM(ase.result_status='REJECTED'),0) rejectedScans,
    COALESCE(SUM(ase.result_status='ERROR'),0) errorScans,
    COUNT(DISTINCT ase.employee_id) uniqueEmployees,
    CASE WHEN MIN(ase.scanned_at) IS NULL THEN NULL
         ELSE CONCAT(DATE_FORMAT(MIN(ase.scanned_at),'%Y-%m-%dT%H:%i:%s.000'),'+07:00') END firstScanAt,
    CASE WHEN MAX(ase.scanned_at) IS NULL THEN NULL
         ELSE CONCAT(DATE_FORMAT(MAX(ase.scanned_at),'%Y-%m-%dT%H:%i:%s.000'),'+07:00') END lastScanAt
  FROM scan_devices d
  JOIN sites s ON s.id=d.site_id
  LEFT JOIN attendance_scan_events ase
    ON ase.device_id=d.id
   AND ase.scanned_at>=TIMESTAMP(?)
   AND ase.scanned_at<DATE_ADD(TIMESTAMP(?),INTERVAL 1 DAY)
  GROUP BY d.id,d.uid,d.code,d.name,d.device_type,d.location_description,
    d.is_active,d.device_token_hash,d.activated_at,d.last_seen_at,
    s.uid,s.code,s.name
) device_rows`

function deviceScanReportPredicate(
  input: DeviceScanReportInput,
  auth: AuthContext
) {
  const where = ['1=1']
  const values: unknown[] = [input.dateFrom, input.dateTo]
  addSiteScope(where, values, auth, input.sites, 'siteCode')
  addListFilter(where, values, 'deviceType', input.deviceTypes)
  addListFilter(where, values, 'activityStatus', input.activityStatuses)
  if (input.resultStatuses.length) {
    const resultColumns = {
      SUCCESS: 'successfulScans',
      REJECTED: 'rejectedScans',
      ERROR: 'errorScans',
    } as const
    where.push(
      `(${input.resultStatuses
        .map((status) => `${resultColumns[status]}>0`)
        .join(' OR ')})`
    )
  }
  if (input.query) {
    where.push(
      '(deviceCode LIKE ? OR deviceName LIKE ? OR locationDescription LIKE ?)'
    )
    values.push(
      `%${input.query}%`,
      `%${input.query}%`,
      `%${input.query}%`
    )
  }
  return { where, values }
}

function mapDeviceScanReportRow(row: RowDataPacket) {
  const nullable = (value: unknown) => (value ? String(value) : null)
  return {
    deviceUid: String(row.deviceUid),
    deviceCode: String(row.deviceCode),
    deviceName: String(row.deviceName),
    site: mapReference(row, 'site'),
    deviceType: String(row.deviceType),
    locationDescription: nullable(row.locationDescription),
    isActive: Number(row.isActive ?? 0) === 1,
    isAttendanceActivated: Number(row.isAttendanceActivated ?? 0) === 1,
    activatedAt: nullable(row.activatedAt),
    lastSeenAt: nullable(row.lastSeenAt),
    firstScanAt: nullable(row.firstScanAt),
    lastScanAt: nullable(row.lastScanAt),
    activityStatus: String(row.activityStatus),
    scans: {
      total: Number(row.totalScans ?? 0),
      clockIn: Number(row.clockInScans ?? 0),
      clockOut: Number(row.clockOutScans ?? 0),
      successful: Number(row.successfulScans ?? 0),
      rejected: Number(row.rejectedScans ?? 0),
      error: Number(row.errorScans ?? 0),
      uniqueEmployees: Number(row.uniqueEmployees ?? 0),
    },
  }
}

async function loadDeviceScanMeta(auth: AuthContext, requestedSites: string[]) {
  const where = ['s.is_active=1']
  const values: unknown[] = []
  addSiteScope(where, values, auth, requestedSites, 's.code')
  const [sites] = await pool.query<RowDataPacket[]>(
    `SELECT s.uid,s.code,s.name FROM sites s
      WHERE ${where.join(' AND ')} ORDER BY s.name`,
    values
  )
  return {
    sites,
    deviceTypes: [
      { code: 'MOBILE_CAMERA', name: 'Kamera HP' },
      { code: 'USB_SCANNER', name: 'Scanner USB' },
      { code: 'TERMINAL', name: 'Terminal' },
      { code: 'OTHER', name: 'Lainnya' },
    ],
    resultStatuses: [
      { code: 'SUCCESS', name: 'Berhasil' },
      { code: 'REJECTED', name: 'Ditolak' },
      { code: 'ERROR', name: 'Error' },
    ],
    activityStatuses: [
      { code: 'HEALTHY', name: 'Aktivitas normal' },
      { code: 'ATTENTION', name: 'Ada scan ditolak atau error' },
      { code: 'NO_ACTIVITY', name: 'Tidak ada aktivitas' },
      { code: 'NOT_ACTIVATED', name: 'Belum diaktivasi untuk Attendance' },
      { code: 'INACTIVE', name: 'Perangkat nonaktif' },
    ],
    canExport:
      auth.roles.includes('SUPER_ADMIN') ||
      auth.permissions.includes('attendance.export'),
  }
}

reportsRouter.get(
  '/device-scans/meta',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseDeviceScanQuery(req.query as Record<string, unknown>)
      res.json(
        await loadDeviceScanMeta(res.locals.auth as AuthContext, input.sites)
      )
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.get(
  '/device-scans',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  async (req, res, next) => {
    try {
      const input = parseDeviceScanQuery(req.query as Record<string, unknown>)
      const { page, pageSize } = pagination(req.query.page, req.query.pageSize)
      const { where, values } = deviceScanReportPredicate(
        input,
        res.locals.auth as AuthContext
      )
      const dataset = `SELECT * FROM (${deviceScanDatasetSql}) device_scan_rows
        WHERE ${where.join(' AND ')}`
      const [summaryRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) totalDevices,
          COALESCE(SUM(activityStatus='HEALTHY'),0) healthyDevices,
          COALESCE(SUM(activityStatus='ATTENTION'),0) attentionDevices,
          COALESCE(SUM(activityStatus='NO_ACTIVITY'),0) noActivityDevices,
          COALESCE(SUM(activityStatus='NOT_ACTIVATED'),0) notActivatedDevices,
          COALESCE(SUM(activityStatus='INACTIVE'),0) inactiveDevices,
          COALESCE(SUM(totalScans),0) totalScans,
          COALESCE(SUM(successfulScans),0) successfulScans,
          COALESCE(SUM(rejectedScans),0) rejectedScans,
          COALESCE(SUM(errorScans),0) errorScans
         FROM (${dataset}) filtered_devices`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${dataset}) filtered_devices
         ORDER BY (activityStatus='HEALTHY') ASC,siteName,deviceName,deviceCode
         LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      const summary = summaryRows[0] ?? {}
      res.json({
        items: rows.map(mapDeviceScanReportRow),
        summary: {
          totalDevices: Number(summary.totalDevices ?? 0),
          healthyDevices: Number(summary.healthyDevices ?? 0),
          attentionDevices: Number(summary.attentionDevices ?? 0),
          noActivityDevices: Number(summary.noActivityDevices ?? 0),
          notActivatedDevices: Number(summary.notActivatedDevices ?? 0),
          inactiveDevices: Number(summary.inactiveDevices ?? 0),
          totalScans: Number(summary.totalScans ?? 0),
          successfulScans: Number(summary.successfulScans ?? 0),
          rejectedScans: Number(summary.rejectedScans ?? 0),
          errorScans: Number(summary.errorScans ?? 0),
        },
        total: Number(summary.totalDevices ?? 0),
        page,
        pageSize,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
      })
    } catch (error) {
      next(error)
    }
  }
)

reportsRouter.post(
  '/device-scans/export',
  requirePermission('reports.view'),
  requirePermission('attendance.view'),
  requirePermission('attendance.export'),
  async (req, res, next) => {
    try {
      const parsed = deviceScanExportSchema.parse(req.body)
      const input: DeviceScanReportInput = {
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
        query: parsed.query,
        sites: parsed.site,
        deviceTypes: parsed.deviceType,
        resultStatuses: parsed.resultStatus,
        activityStatuses: parsed.activityStatus,
      }
      const auth = res.locals.auth as AuthContext
      const { where, values } = deviceScanReportPredicate(input, auth)
      const [rawRows] = await pool.query<RowDataPacket[]>(
        `SELECT * FROM (${deviceScanDatasetSql}) device_scan_rows
          WHERE ${where.join(' AND ')}
         ORDER BY (activityStatus='HEALTHY') ASC,siteName,deviceName,deviceCode`,
        values
      )
      const rows = rawRows.map(mapDeviceScanReportRow)
      const sites = await accessibleReportSites(auth, input.sites)
      const filters = {
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        sites: sites.map((site) => site.code),
        deviceTypes: input.deviceTypes,
        resultStatuses: input.resultStatuses,
        activityStatuses: input.activityStatuses,
        hasSearch: Boolean(input.query),
      }
      const workbook = await buildDeviceScanReportWorkbook({
        title: 'Perangkat dan Aktivitas Scan Attendance',
        periodLabel: `${input.dateFrom} s.d. ${input.dateTo}`,
        generatedAt: generatedAtJakarta(),
        generatedBy: auth.name,
        filters,
        rows: rows.map(
          (row): DeviceScanReportExportRow => ({
            deviceCode: row.deviceCode,
            deviceName: row.deviceName,
            siteName: row.site?.name ?? '',
            deviceType: row.deviceType,
            locationDescription: row.locationDescription,
            isActive: row.isActive,
            isAttendanceActivated: row.isAttendanceActivated,
            lastSeenAt: row.lastSeenAt,
            firstScanAt: row.firstScanAt,
            lastScanAt: row.lastScanAt,
            totalScans: row.scans.total,
            clockInScans: row.scans.clockIn,
            clockOutScans: row.scans.clockOut,
            successfulScans: row.scans.successful,
            rejectedScans: row.scans.rejected,
            errorScans: row.scans.error,
            uniqueEmployees: row.scans.uniqueEmployees,
            activityStatus: row.activityStatus,
          })
        ),
      })
      const filename = `laporan-perangkat-scan-${input.dateFrom}-${input.dateTo}.xlsx`
      const requestId = auditRequestId(req)
      await auditReportExport({
        auth,
        request: req,
        requestId,
        sites,
        table: 'scan_devices',
        description: (site) =>
          `Mengekspor Laporan Perangkat dan Aktivitas Scan Attendance ${site} untuk ${input.dateFrom} sampai ${input.dateTo}.`,
        data: {
          ...filters,
          filename,
          rowCount: rows.length,
          checksumSha256: createHash('sha256').update(workbook).digest('hex'),
        },
      })
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('X-Request-ID', requestId)
      res.send(workbook)
    } catch (error) {
      next(error)
    }
  }
)
