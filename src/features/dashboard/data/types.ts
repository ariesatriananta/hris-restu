export interface DashboardRequest {
  site?: string
  signal?: AbortSignal
}

export interface DashboardCapabilities {
  employees: boolean
  attendance: boolean
  production: boolean
  recruitment: boolean
}

export interface DashboardSiteOption {
  code: string
  name: string
}

export type DashboardActionUrl =
  | '/attendance/tindak-lanjut'
  | '/attendance/master-perangkat'
  | '/attendance/monitoring-harian'
  | '/produksi/transaksi'
  | '/karyawan/rekrutmen'
  | '/karyawan/data-karyawan'

export interface DashboardSiteSummary extends DashboardSiteOption {
  uid: string
  activeEmployees: number | null
  eligibleToday: number | null
  presentToday: number | null
  attendanceAttention: number | null
  productionTransactions: number | null
}

export interface DashboardOverview {
  generatedAt: string
  businessDate: string
  selectedSite: string
  availableSites: DashboardSiteOption[]
  capabilities: DashboardCapabilities
  kpis: {
    activeEmployees: number | null
    presentToday: number | null
    eligibleToday: number | null
    attendanceAttention: number | null
    productionTransactions: number | null
  }
  attendanceTrend: Array<{
    date: string
    eligible: number
    present: number
  }>
  productionByJob: Array<{
    uid: string
    name: string
    transactions: number
  }>
  sites: DashboardSiteSummary[]
  recruitment: {
    newCount: number
    inProgressCount: number
    passedCount: number
  } | null
  priorities: Array<{
    uid: string
    severity: 'info' | 'warning' | 'danger'
    title: string
    detail: string
    actionLabel: string
    actionUrl: DashboardActionUrl
  }>
  activities: Array<{
    uid: string
    occurredAt: string
    title: string
    detail: string
    site: string | null
  }>
}

export interface DashboardRepository {
  getOverview(request: DashboardRequest): Promise<DashboardOverview | null>
}
