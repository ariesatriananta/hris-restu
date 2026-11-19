import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import {
  attendanceRateWindow,
  type AttendanceRateSite,
  type AttendanceRateSource,
} from './attendance-rate.js'

type Site = AttendanceRateSite & { id: number }
const numeric = (value: unknown) => Number(value)
const nullableId = (value: unknown) => (value == null ? null : numeric(value))

/** Bulk reads only. The caller owns a consistent, read-only transaction. */
export async function loadAttendanceRateSource(
  conn: PoolConnection,
  site: Site,
  date: string
): Promise<AttendanceRateSource> {
  const window = attendanceRateWindow(date)
  const days = [...window.dates, date]
  const daySlots = days.map(() => '?').join(',')
  // Include employees known through facts, even when their placement history is missing.
  // Then load ALL sites' histories for these people, so a conflicting transfer is detected.
  const candidates = `SELECT employee_id FROM employee_employment_histories
    WHERE site_id=? AND status='ACTIVE' AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
    UNION SELECT employee_id FROM attendance_records WHERE site_id=? AND business_date IN (${daySlots})
    UNION SELECT employee_id FROM production_transactions WHERE site_id=? AND business_date BETWEEN ? AND ? AND status='POSTED'`
  const candidateParams = [
    site.id,
    date,
    window.from,
    site.id,
    ...days,
    site.id,
    window.from,
    window.to,
  ]
  const read = async (sql: string, params: unknown[] = []) =>
    (await conn.query<RowDataPacket[]>(sql, params))[0]
  const jobs = await read(
    'SELECT id,uid,code,name FROM production_jobs ORDER BY id'
  )
  const modules = await read(
    'SELECT id,site_id siteId,uid,code,name FROM production_modules WHERE site_id=? ORDER BY id',
    [site.id]
  )
  const employment = await read(
    `SELECT h.id,h.employee_id employeeId,h.site_id siteId,t.code employeeType,
    es.code employeeStatus,h.status,DATE_FORMAT(h.effective_from,'%Y-%m-%d') effectiveFrom,
    DATE_FORMAT(h.effective_to,'%Y-%m-%d') effectiveTo,pm.id moduleId,pm.site_id moduleSiteId
    FROM employee_employment_histories h
    JOIN employee_types t ON t.id=h.employee_type_id JOIN employee_statuses es ON es.id=h.employee_status_id
    LEFT JOIN production_module_sections pms ON pms.id=h.production_module_section_id
    LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
    WHERE h.status='ACTIVE' AND h.effective_from<=? AND (h.effective_to IS NULL OR h.effective_to>=?)
    AND h.employee_id IN (${candidates}) ORDER BY h.employee_id,h.effective_from,h.id`,
    [date, window.from, ...candidateParams]
  )
  const assignments = await read(
    `SELECT a.id,a.employee_id employeeId,a.site_id siteId,a.production_job_id jobId,
    a.status,a.is_primary isPrimary,DATE_FORMAT(a.effective_from,'%Y-%m-%d') effectiveFrom,
    DATE_FORMAT(a.effective_to,'%Y-%m-%d') effectiveTo FROM employee_job_assignments a
    WHERE a.status='ACTIVE' AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?)
    AND a.employee_id IN (${candidates}) ORDER BY a.employee_id,a.effective_from,a.id`,
    [date, window.from, ...candidateParams]
  )
  const attendance = await read(
    `SELECT employee_id employeeId,site_id siteId,
    DATE_FORMAT(business_date,'%Y-%m-%d') date,attendance_status status FROM attendance_records
    WHERE site_id=? AND business_date IN (${daySlots})`,
    [site.id, ...days]
  )
  const production = await read(
    `SELECT pt.id,pt.employee_id employeeId,pt.site_id siteId,
    DATE_FORMAT(pt.business_date,'%Y-%m-%d') date,pt.production_job_id jobId,pt.production_module_id moduleId,
    qc.brand_id brandId,b.site_id brandSiteId,CAST(pt.quantity AS CHAR) quantity,u.code unitCode,pt.status
    FROM production_transactions pt JOIN work_units u ON u.id=pt.unit_id
    LEFT JOIN production_transaction_qc qc ON qc.production_transaction_id=pt.id
    LEFT JOIN production_brands b ON b.id=qc.brand_id
    WHERE pt.site_id=? AND pt.business_date BETWEEN ? AND ? AND pt.status='POSTED'`,
    [site.id, window.from, window.to]
  )
  const categories = await read(
    `SELECT 'MODULE' kind,h.module_id entityId,h.category,
    DATE_FORMAT(h.effective_from,'%Y-%m-%d') effectiveFrom,DATE_FORMAT(h.effective_to,'%Y-%m-%d') effectiveTo
    FROM production_module_category_histories h JOIN production_modules m ON m.id=h.module_id
    WHERE m.site_id=? AND h.effective_from<=? AND (h.effective_to IS NULL OR h.effective_to>=?)
    UNION ALL SELECT 'BRAND',h.brand_id,h.category,
    DATE_FORMAT(h.effective_from,'%Y-%m-%d'),DATE_FORMAT(h.effective_to,'%Y-%m-%d')
    FROM production_brand_category_histories h JOIN production_brands b ON b.id=h.brand_id
    WHERE b.site_id=? AND h.effective_from<=? AND (h.effective_to IS NULL OR h.effective_to>=?)`,
    [site.id, date, window.from, site.id, date, window.from]
  )
  return {
    siteId: site.id,
    site: { uid: site.uid, code: site.code, name: site.name },
    jobs: jobs.map((r) => ({
      id: numeric(r.id),
      uid: r.uid,
      code: r.code,
      name: r.name,
    })),
    modules: modules.map((r) => ({
      id: numeric(r.id),
      siteId: numeric(r.siteId),
      uid: r.uid,
      code: r.code,
      name: r.name,
    })),
    employment: employment.map((r) => ({
      id: numeric(r.id),
      employeeId: numeric(r.employeeId),
      siteId: numeric(r.siteId),
      employeeType: r.employeeType,
      employeeStatus: r.employeeStatus,
      status: r.status,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      moduleId: nullableId(r.moduleId),
      moduleSiteId: nullableId(r.moduleSiteId),
    })),
    assignments: assignments.map((r) => ({
      id: numeric(r.id),
      employeeId: numeric(r.employeeId),
      siteId: numeric(r.siteId),
      jobId: numeric(r.jobId),
      status: r.status,
      isPrimary: Boolean(Number(r.isPrimary)),
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    })),
    attendance: attendance.map((r) => ({
      employeeId: numeric(r.employeeId),
      siteId: numeric(r.siteId),
      date: r.date,
      status: r.status,
    })),
    production: production.map((r) => ({
      id: numeric(r.id),
      employeeId: numeric(r.employeeId),
      siteId: numeric(r.siteId),
      date: r.date,
      jobId: numeric(r.jobId),
      moduleId: nullableId(r.moduleId),
      brandId: nullableId(r.brandId),
      brandSiteId: nullableId(r.brandSiteId),
      quantity: r.quantity,
      unitCode: r.unitCode,
      status: r.status,
    })),
    categories: categories.map((r) => ({
      kind: r.kind,
      entityId: numeric(r.entityId),
      category: r.category,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    })),
  }
}
