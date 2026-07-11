export type SiteCode = 'ALL' | 'JEPARA' | 'SEMARANG' | 'KLATEN'
export type DashboardMockState = 'normal' | 'loading' | 'empty' | 'error'

export interface DashboardRequest {
  site: SiteCode
  mockState?: DashboardMockState
  signal?: AbortSignal
}

export interface SiteSummary {
  uid: string
  code: Exclude<SiteCode, 'ALL'>
  name: string
  activeEmployees: number
  presentToday: number
  missingClockIn: number
  missingClockOut: number
  productionTransactions: number
  productionValue: number
  payrollStatus: 'DRAFT' | 'CALCULATED' | 'APPROVED'
}

export interface DashboardOverview {
  generatedAt: string
  selectedSite: SiteCode
  kpis: Omit<SiteSummary, 'uid' | 'code' | 'name' | 'payrollStatus'>
  sites: SiteSummary[]
  attendanceTrend: { date: string; present: number; expected: number }[]
  productionByJob: {
    uid: string
    name: string
    transactions: number
    value: number
  }[]
  payroll: { periodLabel: string; activePeriods: number; statusLabel: string }
  activities: {
    uid: string
    time: string
    title: string
    detail: string
    site: string
  }[]
  alerts: {
    uid: string
    severity: 'warning' | 'danger'
    title: string
    detail: string
    actionLabel: string
  }[]
}

export interface DashboardRepository {
  getOverview(request: DashboardRequest): Promise<DashboardOverview | null>
}
