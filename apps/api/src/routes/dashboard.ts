import { z } from 'zod'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { env } from '../config.js'
import { pool } from '../db.js'
import { jakartaBusinessDate } from '../lib/attendance-shift-policy.js'
import { ApiError } from '../lib/errors.js'
import { authenticate, type AuthContext } from '../middleware/authenticate.js'

const siteCodes = ['JEPARA', 'SEMARANG', 'KLATEN'] as const
const overviewQuery = z.object({
  site: z.enum(['ALL', ...siteCodes]).default('ALL'),
})

type SiteCode = (typeof siteCodes)[number]
type DashboardCapability =
  | 'employees'
  | 'attendance'
  | 'production'
  | 'recruitment'

type DashboardSite = {
  id: number
  uid: string
  code: SiteCode
  name: string
}

function isGlobalViewer(auth: AuthContext) {
  return auth.roles.some(
    (role) => role === 'SUPER_ADMIN' || role === 'DIRECTOR'
  )
}

function hasPermission(auth: AuthContext, permission: string) {
  return (
    auth.roles.includes('SUPER_ADMIN') || auth.permissions.includes(permission)
  )
}

function dateOffset(value: string, offset: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function placeholders(values: readonly unknown[]) {
  return values.map(() => '?').join(',') || "''"
}

function numberValue(value: unknown) {
  return Number(value ?? 0)
}

function capabilityMap(auth: AuthContext) {
  return {
    employees: hasPermission(auth, 'employees.view'),
    attendance: hasPermission(auth, 'attendance.view'),
    production: hasPermission(auth, 'production.view'),
    recruitment: hasPermission(auth, 'recruitment.view'),
  }
}

function activityModules(capabilities: Record<DashboardCapability, boolean>) {
  const modules: string[] = []
  if (capabilities.employees) modules.push('EMPLOYEES')
  if (capabilities.attendance) modules.push('ATTENDANCE')
  if (capabilities.production) modules.push('PRODUCTION')
  if (capabilities.recruitment) modules.push('RECRUITMENT')
  return modules
}

function activityTitle(module: string, action: string) {
  const moduleLabel: Record<string, string> = {
    EMPLOYEES: 'Data karyawan',
    ATTENDANCE: 'Attendance',
    PRODUCTION: 'Produksi',
    RECRUITMENT: 'Rekrutmen',
  }
  const actionLabel: Record<string, string> = {
    CREATE: 'ditambahkan',
    UPDATE: 'diperbarui',
    DELETE: 'dihapus',
    VOID: 'dibatalkan',
    APPROVE: 'disetujui',
    REJECT: 'ditolak',
    OTHER: 'diproses',
  }
  return `${moduleLabel[module] ?? 'Aktivitas'} ${actionLabel[action] ?? 'diproses'}`
}

export const dashboardRouter = Router()
dashboardRouter.use(authenticate)

dashboardRouter.get('/overview', async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const input = overviewQuery.parse(req.query)
    const capabilities = capabilityMap(auth)
    const globalViewer = isGlobalViewer(auth)
    const visibleCodes = globalViewer ? [...siteCodes] : auth.siteAccess

    if (
      input.site !== 'ALL' &&
      !globalViewer &&
      !auth.siteAccess.includes(input.site)
    ) {
      throw new ApiError(403, 'Akses site dashboard ditolak.')
    }

    const [siteRows] = await pool.query<RowDataPacket[]>(
      `SELECT id,uid,code,name
         FROM sites
        WHERE is_active=1
          AND code IN (${placeholders(visibleCodes)})
        ORDER BY name`,
      visibleCodes
    )
    const availableSites = siteRows.map(
      (row): DashboardSite => ({
        id: Number(row.id),
        uid: String(row.uid),
        code: String(row.code) as SiteCode,
        name: String(row.name),
      })
    )
    const selectedSites =
      input.site === 'ALL'
        ? availableSites
        : availableSites.filter((site) => site.code === input.site)
    const selectedSiteIds = selectedSites.map((site) => site.id)
    const today = jakartaBusinessDate()
    const trendDates = Array.from({ length: 7 }, (_, index) =>
      dateOffset(today, index - 6)
    )
    const perSite = new Map(
      selectedSites.map((site) => [
        site.id,
        {
          uid: site.uid,
          code: site.code,
          name: site.name,
          activeEmployees: capabilities.employees ? 0 : null,
          eligibleToday: capabilities.attendance ? 0 : null,
          presentToday: capabilities.attendance ? 0 : null,
          attendanceAttention: capabilities.attendance ? 0 : null,
          productionTransactions: capabilities.production ? 0 : null,
        },
      ])
    )

    const employeeRowsPromise = capabilities.employees
      ? pool.query<RowDataPacket[]>(
          `SELECT e.current_site_id siteId,COUNT(*) activeEmployees
             FROM employees e
             JOIN employee_statuses es ON es.id=e.employee_status_id
            WHERE es.code='ACTIVE'
              AND e.current_site_id IN (${placeholders(selectedSiteIds)})
            GROUP BY e.current_site_id`,
          selectedSiteIds
        )
      : Promise.resolve<[RowDataPacket[], unknown]>([[], undefined])

    const attendanceTrendPromise = capabilities.attendance
      ? pool.query<RowDataPacket[]>(
          `SELECT DATE_FORMAT(dates.businessDate,'%Y-%m-%d') businessDate,
                  COUNT(DISTINCT CONCAT(eh.site_id,':',eh.employee_id)) eligible,
                  COUNT(DISTINCT CASE WHEN ar.attendance_status='PRESENT'
                    THEN CONCAT(ar.site_id,':',ar.employee_id) END) present
             FROM (
               ${trendDates.map(() => 'SELECT CAST(? AS DATE) businessDate').join(' UNION ALL ')}
             ) dates
             JOIN employee_employment_histories eh
               ON eh.effective_from<=dates.businessDate
              AND (eh.effective_to IS NULL OR eh.effective_to>=dates.businessDate)
             JOIN employee_statuses es
               ON es.id=eh.employee_status_id AND es.allows_attendance=1
             LEFT JOIN attendance_records ar
               ON ar.employee_id=eh.employee_id
              AND ar.site_id=eh.site_id
              AND ar.business_date=dates.businessDate
            WHERE eh.site_id IN (${placeholders(selectedSiteIds)})
            GROUP BY dates.businessDate
            ORDER BY dates.businessDate`,
          [...trendDates, ...selectedSiteIds]
        )
      : Promise.resolve<[RowDataPacket[], unknown]>([[], undefined])

    const attendanceSitePromise = capabilities.attendance
      ? pool.query<RowDataPacket[]>(
          `SELECT scoped.siteId,
                  MAX(scoped.eligibleToday) eligibleToday,
                  MAX(scoped.presentToday) presentToday,
                  SUM(scoped.incompleteCount) incompleteCount,
                  SUM(scoped.pendingCorrectionCount) pendingCorrectionCount,
                  SUM(scoped.pendingClassificationCount) pendingClassificationCount
             FROM (
               SELECT eh.site_id siteId,
                      COUNT(DISTINCT eh.employee_id) eligibleToday,
                      COUNT(DISTINCT CASE WHEN ar.attendance_status='PRESENT' THEN ar.employee_id END) presentToday,
                      0 incompleteCount,0 pendingCorrectionCount,0 pendingClassificationCount
                 FROM employee_employment_histories eh
                 JOIN employee_statuses es ON es.id=eh.employee_status_id AND es.allows_attendance=1
                 LEFT JOIN attendance_records ar ON ar.employee_id=eh.employee_id
                  AND ar.site_id=eh.site_id AND ar.business_date=?
                WHERE eh.site_id IN (${placeholders(selectedSiteIds)})
                  AND eh.effective_from<=?
                  AND (eh.effective_to IS NULL OR eh.effective_to>=?)
                GROUP BY eh.site_id
               UNION ALL
               SELECT ar.site_id,0,0,COUNT(*),0,0
                 FROM attendance_records ar
                WHERE ar.site_id IN (${placeholders(selectedSiteIds)})
                  AND ar.business_date=? AND ar.attendance_status='PRESENT'
                  AND (ar.clock_in_at IS NULL OR ar.clock_out_at IS NULL)
                GROUP BY ar.site_id
               UNION ALL
               SELECT ar.site_id,0,0,0,COUNT(*),0
                 FROM attendance_corrections ac
                 JOIN attendance_records ar ON ar.id=ac.attendance_record_id
                WHERE ar.site_id IN (${placeholders(selectedSiteIds)})
                  AND ar.business_date BETWEEN ? AND ?
                  AND ac.approval_status='PENDING'
                GROUP BY ar.site_id
               UNION ALL
               SELECT acr.site_id,0,0,0,0,COUNT(*)
                 FROM attendance_classification_requests acr
                WHERE acr.site_id IN (${placeholders(selectedSiteIds)})
                  AND acr.end_date>=? AND acr.start_date<=?
                  AND acr.approval_status='PENDING'
                GROUP BY acr.site_id
             ) scoped
            GROUP BY scoped.siteId`,
          [
            today,
            ...selectedSiteIds,
            today,
            today,
            ...selectedSiteIds,
            today,
            ...selectedSiteIds,
            env.ATTENDANCE_GO_LIVE_DATE,
            today,
            ...selectedSiteIds,
            env.ATTENDANCE_GO_LIVE_DATE,
            today,
          ]
        )
      : Promise.resolve<[RowDataPacket[], unknown]>([[], undefined])

    const productionSitePromise = capabilities.production
      ? pool.query<RowDataPacket[]>(
          `SELECT site_id siteId,COUNT(*) productionTransactions
             FROM production_transactions
            WHERE site_id IN (${placeholders(selectedSiteIds)})
              AND business_date=? AND status='POSTED'
            GROUP BY site_id`,
          [...selectedSiteIds, today]
        )
      : Promise.resolve<[RowDataPacket[], unknown]>([[], undefined])

    const productionJobPromise = capabilities.production
      ? pool.query<RowDataPacket[]>(
          `SELECT job.uid,job.name,COUNT(*) transactions
             FROM production_transactions pt
             JOIN production_jobs job ON job.id=pt.production_job_id
            WHERE pt.site_id IN (${placeholders(selectedSiteIds)})
              AND pt.business_date=? AND pt.status='POSTED'
            GROUP BY job.id,job.uid,job.name
            ORDER BY transactions DESC,job.name
            LIMIT 6`,
          [...selectedSiteIds, today]
        )
      : Promise.resolve<[RowDataPacket[], unknown]>([[], undefined])

    const recruitmentPromise = capabilities.recruitment
      ? pool.query<RowDataPacket[]>(
          `SELECT
             SUM(status='NEW') newCount,
             SUM(status='IN_PROGRESS') inProgressCount,
             SUM(status='PASSED') passedCount
           FROM recruitment_candidates
          WHERE site_id IN (${placeholders(selectedSiteIds)})`,
          selectedSiteIds
        )
      : Promise.resolve<[RowDataPacket[], unknown]>([[], undefined])

    // Master Perangkat berada di modul Attendance. Hindari action yang tidak
    // dapat dibuka oleh pengguna yang hanya memiliki akses Produksi.
    const devicePromise = capabilities.attendance
      ? pool.query<RowDataPacket[]>(
          `SELECT site_id siteId,
                  SUM(is_active=1 AND (activated_at IS NULL OR device_token_hash IS NULL)) attendanceNotReady,
                  SUM(is_active=1 AND device_type IN ('USB_SCANNER','TERMINAL')
                    AND (production_activated_at IS NULL OR production_token_hash IS NULL)) productionNotReady
             FROM scan_devices
            WHERE site_id IN (${placeholders(selectedSiteIds)})
            GROUP BY site_id`,
          selectedSiteIds
        )
      : Promise.resolve<[RowDataPacket[], unknown]>([[], undefined])

    const modules = activityModules(capabilities)
    const activitiesPromise = modules.length
      ? pool.query<RowDataPacket[]>(
          `SELECT al.uid,al.module,al.action,al.description,
                  DATE_FORMAT(al.occurred_at,'%Y-%m-%dT%H:%i:%s+07:00') occurredAt,
                  COALESCE(s.name,'Lintas site') siteName
             FROM audit_logs al
             LEFT JOIN sites s ON s.id=al.site_id
            WHERE al.module IN (${placeholders(modules)})
              AND al.site_id IN (${placeholders(selectedSiteIds)})
            ORDER BY al.occurred_at DESC,al.id DESC
            LIMIT 6`,
          [...modules, ...selectedSiteIds]
        )
      : Promise.resolve<[RowDataPacket[], unknown]>([[], undefined])

    const [
      [employeeRows],
      [attendanceTrendRows],
      [attendanceSiteRows],
      [productionSiteRows],
      [productionJobRows],
      [recruitmentRows],
      [deviceRows],
      [activityRows],
    ] = await Promise.all([
      employeeRowsPromise,
      attendanceTrendPromise,
      attendanceSitePromise,
      productionSitePromise,
      productionJobPromise,
      recruitmentPromise,
      devicePromise,
      activitiesPromise,
    ])

    for (const row of employeeRows) {
      const item = perSite.get(Number(row.siteId))
      if (item) item.activeEmployees = numberValue(row.activeEmployees)
    }
    for (const row of attendanceSiteRows) {
      const item = perSite.get(Number(row.siteId))
      if (!item) continue
      item.eligibleToday = numberValue(row.eligibleToday)
      item.presentToday = numberValue(row.presentToday)
      item.attendanceAttention =
        numberValue(row.incompleteCount) +
        numberValue(row.pendingCorrectionCount) +
        numberValue(row.pendingClassificationCount)
    }
    for (const row of productionSiteRows) {
      const item = perSite.get(Number(row.siteId))
      if (item)
        item.productionTransactions = numberValue(row.productionTransactions)
    }

    const deviceBySite = new Map(
      deviceRows.map((row) => [
        Number(row.siteId),
        {
          attendanceNotReady: numberValue(row.attendanceNotReady),
          productionNotReady: numberValue(row.productionNotReady),
        },
      ])
    )
    const sites = [...perSite.values()]
    const sumNullable = (
      key:
        | 'activeEmployees'
        | 'eligibleToday'
        | 'presentToday'
        | 'attendanceAttention'
        | 'productionTransactions'
    ) => {
      const values = sites.map((site) => site[key])
      return values.every((value) => value === null)
        ? null
        : values.reduce<number>((sum, value) => sum + Number(value ?? 0), 0)
    }
    const attendanceAttention = sumNullable('attendanceAttention')
    const priorities: Array<{
      uid: string
      severity: 'info' | 'warning' | 'danger'
      title: string
      detail: string
      actionLabel: string
      actionUrl: string
    }> = []

    if (capabilities.attendance && Number(attendanceAttention) > 0) {
      priorities.push({
        uid: 'attendance-follow-up',
        severity: 'danger',
        title: `${attendanceAttention} attendance perlu ditindaklanjuti`,
        detail:
          'Termasuk scan belum lengkap serta koreksi atau klasifikasi yang masih menunggu.',
        actionLabel: 'Buka tindak lanjut',
        actionUrl: '/attendance/tindak-lanjut',
      })
    }
    const attendanceDeviceCount = capabilities.attendance
      ? [...deviceBySite.values()].reduce(
          (sum, item) => sum + item.attendanceNotReady,
          0
        )
      : 0
    const productionDeviceCount =
      capabilities.attendance && capabilities.production
        ? [...deviceBySite.values()].reduce(
            (sum, item) => sum + item.productionNotReady,
            0
          )
        : 0
    if (attendanceDeviceCount + productionDeviceCount > 0) {
      priorities.push({
        uid: 'device-readiness',
        severity: 'warning',
        title: `${attendanceDeviceCount + productionDeviceCount} kesiapan perangkat perlu diperiksa`,
        detail: `${attendanceDeviceCount} Attendance dan ${productionDeviceCount} Produksi belum siap.`,
        actionLabel: 'Buka master perangkat',
        actionUrl: '/attendance/master-perangkat',
      })
    }
    const recruitment = capabilities.recruitment
      ? {
          newCount: numberValue(recruitmentRows[0]?.newCount),
          inProgressCount: numberValue(recruitmentRows[0]?.inProgressCount),
          passedCount: numberValue(recruitmentRows[0]?.passedCount),
        }
      : null
    if (
      recruitment &&
      (recruitment.newCount > 0 || recruitment.passedCount > 0)
    ) {
      priorities.push({
        uid: 'recruitment-pipeline',
        severity: 'info',
        title: `${recruitment.newCount + recruitment.passedCount} kandidat menunggu tindakan`,
        detail: `${recruitment.newCount} kandidat baru dan ${recruitment.passedCount} kandidat lolos belum dikonversi.`,
        actionLabel: 'Buka rekrutmen',
        actionUrl: '/karyawan/rekrutmen',
      })
    }
    const defaultDestination = capabilities.employees
      ? { label: 'Lihat data karyawan', url: '/karyawan/data-karyawan' }
      : capabilities.attendance
        ? { label: 'Buka monitoring', url: '/attendance/monitoring-harian' }
        : capabilities.production
          ? { label: 'Buka transaksi produksi', url: '/produksi/transaksi' }
          : capabilities.recruitment
            ? { label: 'Buka rekrutmen', url: '/karyawan/rekrutmen' }
            : null
    if (!priorities.length && defaultDestination) {
      priorities.push({
        uid: 'operational-clear',
        severity: 'info',
        title: 'Tidak ada perhatian utama',
        detail:
          'Ringkasan operasional pada scope site saat ini dalam kondisi baik.',
        actionLabel: defaultDestination.label,
        actionUrl: defaultDestination.url,
      })
    }

    const trendByDate = new Map(
      attendanceTrendRows.map((row) => [
        String(row.businessDate).slice(0, 10),
        {
          eligible: numberValue(row.eligible),
          present: numberValue(row.present),
        },
      ])
    )

    res.setHeader('Cache-Control', 'private, no-store')
    res.json({
      data: {
        generatedAt: new Date().toISOString(),
        businessDate: today,
        selectedSite: input.site,
        availableSites: availableSites.map(({ code, name }) => ({
          code,
          name,
        })),
        capabilities,
        kpis: {
          activeEmployees: sumNullable('activeEmployees'),
          presentToday: sumNullable('presentToday'),
          eligibleToday: sumNullable('eligibleToday'),
          attendanceAttention,
          productionTransactions: sumNullable('productionTransactions'),
        },
        attendanceTrend: capabilities.attendance
          ? trendDates.map((date) => ({
              date,
              eligible: trendByDate.get(date)?.eligible ?? 0,
              present: trendByDate.get(date)?.present ?? 0,
            }))
          : [],
        productionByJob: productionJobRows.map((row) => ({
          uid: String(row.uid),
          name: String(row.name),
          transactions: numberValue(row.transactions),
        })),
        sites,
        recruitment,
        priorities: priorities.slice(0, 4),
        activities: activityRows.map((row) => ({
          uid: String(row.uid),
          occurredAt: String(row.occurredAt),
          title: activityTitle(String(row.module), String(row.action)),
          detail: String(row.description ?? 'Aktivitas operasional dicatat.'),
          site: String(row.siteName),
        })),
      },
    })
  } catch (error) {
    next(error)
  }
})
