export type AttendanceRateSearch = { site?: string; date?: string }
export type Category = 'REGULER' | 'PREMIUM' | 'TOTAL'
export type EmployeeType = 'TRAINING' | 'BORONGAN'
export type Site = { uid: string; code: string; name: string }
export type Counts = { present: number; roster: number }
export type AttendanceRateGroup = Counts & {
  employeeType: EmployeeType
  category: Exclude<Category, 'TOTAL'>
  ratePercent: string | null
  modules: Site[]
  jobs: (Counts & { job: Site; ratePercent: string | null })[]
  unassigned: Counts
}
export type AttendanceRateAverage = {
  job: { code: string; name: string }
  employeeType: EmployeeType
  category: Category
  quantityPcs: string
  presentDays: number
  transactions: number
  averagePcs: string | null
  complete: boolean
  status: 'AVAILABLE' | 'NO_DATA' | 'INCOMPLETE'
}
export type AttendanceRateReport = {
  date: string
  site: Site
  referenceWeek: { from: string; to: string }
  groups: AttendanceRateGroup[]
  unmapped: (Counts & { employeeType: EmployeeType })[]
  totals: (Counts & {
    employeeType: EmployeeType | 'TOTAL'
    ratePercent: string | null
  })[]
  averages: AttendanceRateAverage[]
  estimates: {
    job: { code: string; name: string }
    pcsPerBox: number
    categories: {
      category: Category
      present: number
      estimatedPcs: string | null
      boxes: string | null
      complete: boolean
    }[]
  }[]
  warnings: {
    scope: 'DAY' | 'REFERENCE_WEEK'
    code: string
    count: number
    message: string
  }[]
}
export type AttendanceRateOptions = { sites: Site[]; serverToday: string }
export type AttendanceRateResponse = {
  data: AttendanceRateReport
  meta: { serverToday: string }
}
