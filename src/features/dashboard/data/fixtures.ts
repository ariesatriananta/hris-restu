import type { SiteSummary } from './types'

export const siteFixtures: SiteSummary[] = [
  {
    uid: 'site-jepara-001',
    code: 'JEPARA',
    name: 'Site Jepara',
    activeEmployees: 412,
    presentToday: 389,
    missingClockIn: 23,
    missingClockOut: 31,
    productionTransactions: 652,
    productionValue: 18450000,
    payrollStatus: 'CALCULATED',
  },
  {
    uid: 'site-semarang-001',
    code: 'SEMARANG',
    name: 'Site Semarang',
    activeEmployees: 397,
    presentToday: 374,
    missingClockIn: 23,
    missingClockOut: 27,
    productionTransactions: 604,
    productionValue: 16920000,
    payrollStatus: 'DRAFT',
  },
  {
    uid: 'site-klaten-001',
    code: 'KLATEN',
    name: 'Site Klaten',
    activeEmployees: 405,
    presentToday: 382,
    missingClockIn: 23,
    missingClockOut: 29,
    productionTransactions: 631,
    productionValue: 17680000,
    payrollStatus: 'CALCULATED',
  },
]

export const attendanceFixtures = [
  { date: '2026-07-05', JEPARA: 376, SEMARANG: 365, KLATEN: 371 },
  { date: '2026-07-06', JEPARA: 383, SEMARANG: 369, KLATEN: 378 },
  { date: '2026-07-07', JEPARA: 386, SEMARANG: 372, KLATEN: 380 },
  { date: '2026-07-08', JEPARA: 380, SEMARANG: 368, KLATEN: 375 },
  { date: '2026-07-09', JEPARA: 391, SEMARANG: 376, KLATEN: 384 },
  { date: '2026-07-10', JEPARA: 387, SEMARANG: 373, KLATEN: 381 },
  { date: '2026-07-11', JEPARA: 389, SEMARANG: 374, KLATEN: 382 },
] as const

export const productionFixtures = [
  {
    uid: 'job-sortir-001',
    name: 'Sortir hasil produksi',
    shares: { JEPARA: 214, SEMARANG: 188, KLATEN: 201 },
    values: { JEPARA: 5120000, SEMARANG: 4590000, KLATEN: 4815000 },
  },
  {
    uid: 'job-packing-001',
    name: 'Pengemasan',
    shares: { JEPARA: 183, SEMARANG: 179, KLATEN: 176 },
    values: { JEPARA: 5480000, SEMARANG: 5220000, KLATEN: 5190000 },
  },
  {
    uid: 'job-rakit-001',
    name: 'Perakitan komponen',
    shares: { JEPARA: 151, SEMARANG: 139, KLATEN: 148 },
    values: { JEPARA: 4930000, SEMARANG: 4520000, KLATEN: 4765000 },
  },
  {
    uid: 'job-finishing-001',
    name: 'Finishing',
    shares: { JEPARA: 104, SEMARANG: 98, KLATEN: 106 },
    values: { JEPARA: 2920000, SEMARANG: 2590000, KLATEN: 2910000 },
  },
] as const
