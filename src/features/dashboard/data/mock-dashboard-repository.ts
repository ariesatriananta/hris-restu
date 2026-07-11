import {
  attendanceFixtures,
  productionFixtures,
  siteFixtures,
} from './fixtures'
import type { DashboardOverview, DashboardRepository, SiteCode } from './types'

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timeout)
        reject(new DOMException('Request dibatalkan', 'AbortError'))
      },
      { once: true }
    )
  })
}

function sumBy<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((total, row) => total + pick(row), 0)
}

export function buildOverview(site: SiteCode): DashboardOverview {
  const sites =
    site === 'ALL'
      ? siteFixtures
      : siteFixtures.filter((item) => item.code === site)
  const codes = sites.map((item) => item.code)
  const kpis = {
    activeEmployees: sumBy(sites, (item) => item.activeEmployees),
    presentToday: sumBy(sites, (item) => item.presentToday),
    missingClockIn: sumBy(sites, (item) => item.missingClockIn),
    missingClockOut: sumBy(sites, (item) => item.missingClockOut),
    productionTransactions: sumBy(sites, (item) => item.productionTransactions),
    productionValue: sumBy(sites, (item) => item.productionValue),
  }
  const attendanceTrend = attendanceFixtures.map((row) => ({
    date: row.date,
    present: sumBy(codes, (code) => row[code]),
    expected: sumBy(sites, (item) => item.activeEmployees),
  }))
  const productionByJob = productionFixtures.map((job) => ({
    uid: job.uid,
    name: job.name,
    transactions: sumBy(codes, (code) => job.shares[code]),
    value: sumBy(codes, (code) => job.values[code]),
  }))

  return {
    generatedAt: '2026-07-11T15:30:00+07:00',
    selectedSite: site,
    kpis,
    sites,
    attendanceTrend,
    productionByJob,
    payroll: {
      periodLabel: '1–15 Juli 2026',
      activePeriods: sites.length,
      statusLabel:
        site === 'ALL'
          ? '2 dihitung · 1 draft'
          : sites[0].payrollStatus === 'DRAFT'
            ? 'Draft'
            : 'Sudah dihitung',
    },
    activities: [
      {
        uid: 'act-001',
        time: '15.24',
        title: 'Setoran produksi tercatat',
        detail: '18 transaksi baru masuk dari terminal produksi.',
        site: 'Jepara',
      },
      {
        uid: 'act-002',
        time: '15.08',
        title: 'Attendance pulang dimulai',
        detail: 'Gelombang scan pulang shift reguler terdeteksi.',
        site: 'Klaten',
      },
      {
        uid: 'act-003',
        time: '14.42',
        title: 'Simulasi payroll selesai',
        detail: 'Periode 1–15 Juli berhasil dihitung ulang.',
        site: 'Jepara',
      },
      {
        uid: 'act-004',
        time: '14.17',
        title: 'Koreksi attendance diajukan',
        detail: 'Satu pengajuan menunggu pemeriksaan supervisor.',
        site: 'Semarang',
      },
    ].filter(
      (activity) => site === 'ALL' || activity.site.toUpperCase() === site
    ),
    alerts: [
      {
        uid: 'alert-attendance',
        severity: 'danger',
        title: `${kpis.missingClockOut} attendance belum lengkap`,
        detail:
          'Periksa pekerja yang sudah masuk tetapi belum memiliki scan pulang.',
        actionLabel: 'Buka monitoring',
      },
      {
        uid: 'alert-rate',
        severity: 'warning',
        title: '3 tarif segera berakhir',
        detail: 'Masa berlaku tarif akan berakhir dalam tujuh hari.',
        actionLabel: 'Periksa tarif',
      },
    ],
  }
}

export const mockDashboardRepository: DashboardRepository = {
  async getOverview({ site, mockState = 'normal', signal }) {
    if (mockState === 'loading') {
      await new Promise<void>((_, reject) =>
        signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Request dibatalkan', 'AbortError')),
          { once: true }
        )
      )
    }
    await wait(550, signal)
    if (mockState === 'error')
      throw new Error('Layanan mock dashboard sedang mensimulasikan kegagalan.')
    if (mockState === 'empty') return null
    return buildOverview(site)
  },
}
