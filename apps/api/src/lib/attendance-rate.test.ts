import { describe, expect, it } from 'vitest'
import {
  attendanceRateDate,
  attendanceRateWindow,
  buildAttendanceRate,
  type AttendanceRateSource,
} from './attendance-rate.js'

const day = '2026-11-19',
  weekDay = '2026-11-09'
function source(): AttendanceRateSource {
  return {
    siteId: 1,
    site: { uid: 'site-public', code: 'SITE', name: 'Site' },
    jobs: [
      {
        id: 11,
        uid: 'linting-public',
        code: 'BORONGAN-LINTING',
        name: 'Linting',
      },
      {
        id: 12,
        uid: 'packing-public',
        code: 'BORONGAN-PACKING',
        name: 'Packing',
      },
    ],
    modules: [
      { id: 21, siteId: 1, uid: 'module-public', code: 'M', name: 'Modul' },
    ],
    employment: [],
    assignments: [],
    attendance: [],
    production: [],
    categories: [
      {
        kind: 'MODULE',
        entityId: 21,
        category: 'REGULER',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      },
      {
        kind: 'BRAND',
        entityId: 31,
        category: 'REGULER',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      },
    ],
  }
}
function person(
  s: AttendanceRateSource,
  employeeId: number,
  overrides: Partial<AttendanceRateSource['employment'][number]> = {},
  jobId = 11
) {
  s.employment.push({
    id: employeeId,
    employeeId,
    siteId: 1,
    employeeType: 'TRAINING',
    employeeStatus: 'ACTIVE',
    status: 'ACTIVE',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    moduleId: 21,
    moduleSiteId: 1,
    ...overrides,
  })
  s.assignments.push({
    id: employeeId,
    employeeId,
    siteId: 1,
    jobId,
    status: 'ACTIVE',
    isPrimary: true,
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
  })
}
function present(s: AttendanceRateSource, employeeId: number, date = weekDay) {
  s.attendance.push({ employeeId, siteId: 1, date, status: 'PRESENT' })
}
function fact(
  s: AttendanceRateSource,
  employeeId: number,
  quantity: string,
  overrides: Partial<AttendanceRateSource['production'][number]> = {}
) {
  s.production.push({
    id: s.production.length + 1,
    employeeId,
    siteId: 1,
    date: weekDay,
    jobId: 11,
    moduleId: 21,
    brandId: 31,
    brandSiteId: 1,
    quantity,
    unitCode: 'PCS',
    status: 'POSTED',
    ...overrides,
  })
}
type Result = ReturnType<typeof buildAttendanceRate>
const avg = (
  r: Result,
  category = 'REGULER',
  type = 'TRAINING',
  job = 'BORONGAN-LINTING'
) =>
  r.averages.find(
    (row) =>
      row.category === category &&
      row.employeeType === type &&
      row.job.code === job
  )!
const estimate = (r: Result, job = 'BORONGAN-LINTING', category = 'REGULER') =>
  r.estimates
    .find((row) => row.job.code === job)!
    .categories.find((row) => row.category === category)!
const warning = (r: Result, code: string) =>
  r.warnings.find((row) => row.code === code)

describe('attendance rate calendar', () => {
  it.each([
    ['2026-11-15', '2026-11-02', '2026-11-08'],
    ['2026-11-19', '2026-11-09', '2026-11-15'],
    ['2026-11-22', '2026-11-09', '2026-11-15'],
    ['2026-11-23', '2026-11-16', '2026-11-22'],
    ['2027-01-01', '2026-12-21', '2026-12-27'],
  ])('%s uses completed Monday-Sunday %s through %s', (date, from, to) => {
    const window = attendanceRateWindow(date)
    expect(window).toMatchObject({ from, to })
    expect(window.dates).toHaveLength(7)
    expect(window.dates[0]).toBe(from)
    expect(window.dates[6]).toBe(to)
  })
  it('validates real dates and safe historical lower bound', () => {
    expect(attendanceRateDate.safeParse('1000-01-15').success).toBe(true)
    for (const invalid of ['1000-01-14', '2026-02-30', '2026-2-01', 'invalid'])
      expect(attendanceRateDate.safeParse(invalid).success).toBe(false)
  })
})
describe('attendance rate roster', () => {
  it('retains holiday roster with no attendance, excludes inactive/cancelled/other types and sites', () => {
    const s = source()
    person(s, 1)
    person(s, 2, { employeeType: 'BORONGAN' })
    person(s, 3, { employeeType: 'HARIAN' })
    person(s, 4, { employeeStatus: 'RESIGNED' })
    person(s, 5, { status: 'CANCELLED' })
    person(s, 6, { siteId: 2 })
    person(s, 7, { effectiveFrom: '2026-11-16' })
    const r = buildAttendanceRate(s, '2026-11-15')
    expect(r.totals).toContainEqual({
      employeeType: 'TOTAL',
      present: 0,
      roster: 2,
      ratePercent: '0.00',
    })
    expect(estimate(r)).toMatchObject({ boxes: '0.00', complete: true })
    expect(avg(r).averagePcs).toBeNull()
  })
  it('counts distinct present employees, keeps missing primary job in totals, ignores secondary assignments', () => {
    const s = source()
    person(s, 1)
    person(s, 2)
    s.assignments = s.assignments.filter((row) => row.employeeId !== 2)
    s.assignments.push({
      ...s.assignments[0],
      id: 99,
      jobId: 12,
      isPrimary: false,
    })
    present(s, 1, day)
    present(s, 1, day)
    present(s, 2, day)
    s.attendance.push({ employeeId: 1, siteId: 1, date: day, status: 'ABSENT' })
    const r = buildAttendanceRate(s, day)
    expect(r.totals[0]).toMatchObject({
      roster: 2,
      present: 2,
      ratePercent: '100.00',
    })
    expect(r.groups[0].jobs[0]).toMatchObject({ roster: 1, present: 1 })
    expect(r.groups[0].unassigned).toEqual({ roster: 1, present: 1 })
    expect(warning(r, 'MISSING_PRIMARY_JOB')).toBeDefined()
    expect(estimate(r).complete).toBe(false)
  })
  it('excludes overlapping employment and withholds capacity for affected present workers', () => {
    const s = source()
    person(s, 1)
    s.employment.push({ ...s.employment[0], id: 99, siteId: 2 })
    present(s, 1, day)
    const r = buildAttendanceRate(s, day)
    expect(r.totals[2].roster).toBe(0)
    expect(warning(r, 'AMBIGUOUS_EMPLOYMENT')).toBeDefined()
    expect(warning(r, 'ATTENDANCE_OUTSIDE_ROSTER')).toBeDefined()
    expect(estimate(r).boxes).toBeNull()
  })
  it('does not infer historical category from a later mapping or master cache', () => {
    const s = source()
    person(s, 1)
    present(s, 1)
    fact(s, 1, '9600')
    present(s, 1, day)
    s.categories[0].effectiveFrom = '2026-11-16'
    const r = buildAttendanceRate(s, day)
    expect(avg(r)).toMatchObject({
      averagePcs: null,
      complete: false,
      status: 'INCOMPLETE',
    })
    expect(estimate(r).boxes).toBeNull()
    expect(warning(r, 'MISSING_MODULE_CATEGORY')).toBeDefined()
  })
  it('uses effective type and category instead of an older placement', () => {
    const s = source()
    person(s, 1, { effectiveTo: '2026-11-10' })
    s.employment.push({
      ...s.employment[0],
      id: 99,
      employeeType: 'BORONGAN',
      effectiveFrom: '2026-11-11',
      effectiveTo: null,
    })
    s.categories[0].effectiveTo = '2026-11-10'
    s.categories.push({
      ...s.categories[0],
      category: 'PREMIUM',
      effectiveFrom: '2026-11-11',
      effectiveTo: null,
    })
    const r = buildAttendanceRate(s, day)
    expect(
      r.groups.find(
        (row) => row.category === 'PREMIUM' && row.employeeType === 'BORONGAN'
      )
    ).toMatchObject({ roster: 1 })
    expect(r.groups[0].roster).toBe(0)
  })
})
describe('attendance rate average and capacity', () => {
  it('uses raw posted PCS with present person-days including no production days, excludes void/secondary/current facts', () => {
    const s = source()
    person(s, 1)
    person(s, 2)
    present(s, 1)
    present(s, 1, '2026-11-10')
    present(s, 2)
    fact(s, 1, '1000')
    fact(s, 1, '2000')
    fact(s, 1, '9999', { status: 'VOID' })
    fact(s, 1, '9999', { jobId: 12 })
    fact(s, 1, '9999', { date: day })
    const r = buildAttendanceRate(s, day)
    expect(avg(r)).toMatchObject({
      quantityPcs: '3000.0000',
      presentDays: 3,
      transactions: 2,
      averagePcs: '1000.0000',
      complete: true,
    })
    expect(warning(r, 'SECONDARY_PRODUCTION')).toMatchObject({ count: 1 })
  })
  it('weights total average by person-days instead of averaging the categories', () => {
    const s = source()
    person(s, 1)
    person(s, 2, { moduleId: 22 })
    s.modules.push({ ...s.modules[0], id: 22, uid: 'premium-module' })
    s.categories.push(
      {
        kind: 'MODULE',
        entityId: 22,
        category: 'PREMIUM',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      },
      {
        kind: 'BRAND',
        entityId: 32,
        category: 'PREMIUM',
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      }
    )
    present(s, 1)
    present(s, 2)
    present(s, 2, '2026-11-10')
    present(s, 2, '2026-11-11')
    fact(s, 1, '100')
    fact(s, 2, '900', { moduleId: 22, brandId: 32 })
    const r = buildAttendanceRate(s, day)
    expect(avg(r).averagePcs).toBe('100.0000')
    expect(avg(r, 'PREMIUM').averagePcs).toBe('300.0000')
    expect(avg(r, 'TOTAL').averagePcs).toBe('250.0000')
  })
  it('combines Training/Borongan with each job own AVG and box divisor', () => {
    const s = source()
    person(s, 1)
    person(s, 2, { employeeType: 'BORONGAN' })
    person(s, 3, {}, 12)
    for (const id of [1, 2, 3]) {
      present(s, id)
      present(s, id, day)
    }
    fact(s, 1, '9600')
    fact(s, 2, '19200')
    fact(s, 3, '400', { jobId: 12, brandId: null, brandSiteId: null })
    const r = buildAttendanceRate(s, day)
    expect(estimate(r)).toMatchObject({
      present: 2,
      estimatedPcs: '28800.0000',
      boxes: '3.00',
    })
    expect(estimate(r, 'BORONGAN-PACKING')).toMatchObject({
      present: 1,
      estimatedPcs: '400.0000',
      boxes: '0.50',
    })
  })
  it('rounds only final rational estimate, preserving DECIMAL precision', () => {
    const s = source()
    person(s, 1)
    for (const d of [weekDay, '2026-11-10', '2026-11-11', day]) present(s, 1, d)
    fact(s, 1, '115.1999')
    const r = buildAttendanceRate(s, day)
    expect(avg(r).averagePcs).toBe('38.4000')
    expect(estimate(r).estimatedPcs).toBe('38.4000')
    expect(estimate(r).boxes).toBe('0.00') // true ratio is just below .005 box
  })
  it('distinguishes unavailable reference data from nobody present today', () => {
    const s = source()
    person(s, 1)
    present(s, 1, day)
    let r = buildAttendanceRate(s, day)
    expect(avg(r)).toMatchObject({ averagePcs: null, status: 'NO_DATA' })
    expect(estimate(r)).toMatchObject({ boxes: null, complete: false })
    s.attendance = []
    r = buildAttendanceRate(s, day)
    expect(estimate(r)).toMatchObject({ boxes: '0.00', complete: true })
  })
  it.each([
    ['CATEGORY_CONFLICT', { brandId: 32 }, 'PREMIUM'],
    ['MISSING_BRAND_CATEGORY', { brandId: 99 }, null],
    ['MODULE_CONFLICT', { moduleId: 99 }, null],
    ['INVALID_QUANTITY', { quantity: '-1' }, null],
    ['INVALID_QUANTITY', { unitCode: 'BOX' }, null],
  ] as const)(
    'flags %s and withholds misleading results',
    (code, change, category) => {
      const s = source()
      person(s, 1)
      present(s, 1)
      present(s, 1, day)
      fact(s, 1, '9600', change)
      if (category)
        s.categories.push({
          kind: 'BRAND',
          entityId: 32,
          category,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
        })
      const r = buildAttendanceRate(s, day)
      expect(warning(r, code)).toBeDefined()
      expect(avg(r)).toMatchObject({ averagePcs: null, status: 'INCOMPLETE' })
      expect(estimate(r).boxes).toBeNull()
    }
  )
  it('rejects numerator without attendance', () => {
    const s = source()
    person(s, 1)
    fact(s, 1, '9600')
    const r = buildAttendanceRate(s, day)
    expect(warning(r, 'PRODUCTION_WITHOUT_ATTENDANCE')).toBeDefined()
    expect(avg(r)).toMatchObject({
      quantityPcs: '0.0000',
      averagePcs: null,
      status: 'INCOMPLETE',
    })
  })
  it('does not select either overlapping category', () => {
    const s = source()
    person(s, 1)
    present(s, 1)
    present(s, 1, day)
    fact(s, 1, '9600')
    s.categories.push({ ...s.categories[0], category: 'PREMIUM' })
    const r = buildAttendanceRate(s, day)
    expect(r.unmapped[0]).toMatchObject({ roster: 1, present: 1 })
    expect(warning(r, 'MISSING_MODULE_CATEGORY')).toBeDefined()
    expect(estimate(r).boxes).toBeNull()
  })
  it('returns aggregate public identifiers without source employee IDs or money', () => {
    const s = source()
    person(s, 987654)
    present(s, 987654)
    fact(s, 987654, '9600')
    const r = buildAttendanceRate(s, day),
      json = JSON.stringify(r)
    expect(json).not.toContain('987654')
    for (const key of [
      'employeeId',
      'siteId',
      'moduleId',
      'brandId',
      'jobId',
      'grossAmount',
      'payableQuantity',
      'employee_number',
      'full_name',
    ])
      expect(json).not.toContain(`"${key}"`)
    expect(r.groups[0].jobs[0].job).toEqual({
      uid: 'linting-public',
      code: 'BORONGAN-LINTING',
      name: 'Linting',
    })
  })
})

describe('attendance rate source boundaries', () => {
  it('uses historical mapping even when the master is inactive and current category differs', () => {
    const s = source()
    person(s, 1)
    present(s, 1)
    present(s, 1, day)
    fact(s, 1, '9600', { moduleId: null })
    Object.assign(s.modules[0], {
      isActive: false,
      productionCategory: 'PREMIUM',
    })
    const r = buildAttendanceRate(s, day)
    expect(avg(r)).toMatchObject({ averagePcs: '9600.0000', complete: true })
    expect(estimate(r).boxes).toBe('1.00')
    expect(warning(r, 'MODULE_CONFLICT')).toBeUndefined()
  })
  it('cannot reuse a brand from another site even when it has valid category history', () => {
    const s = source()
    person(s, 1)
    present(s, 1)
    fact(s, 1, '9600', { brandSiteId: 2 })
    const r = buildAttendanceRate(s, day)
    expect(warning(r, 'MISSING_BRAND_CATEGORY')).toBeDefined()
    expect(avg(r).averagePcs).toBeNull()
  })
  it('cannot silently choose between duplicate primary assignments', () => {
    const s = source()
    person(s, 1)
    present(s, 1)
    present(s, 1, day)
    fact(s, 1, '9600')
    s.assignments.push({ ...s.assignments[0], id: 98, jobId: 12 })
    const r = buildAttendanceRate(s, day)
    expect(r.totals[0]).toMatchObject({ roster: 1, present: 1 })
    expect(warning(r, 'MISSING_PRIMARY_JOB')).toBeDefined()
    expect(avg(r).averagePcs).toBeNull()
    expect(estimate(r).boxes).toBeNull()
  })
  it('does not turn an ambiguous reference person-day into a valid partial AVG', () => {
    const s = source()
    person(s, 1)
    person(s, 2, { effectiveFrom: '2026-11-10' })
    s.employment.push({
      ...s.employment[0],
      id: 98,
      siteId: 2,
      effectiveFrom: weekDay,
      effectiveTo: weekDay,
    })
    present(s, 1)
    present(s, 2, '2026-11-10')
    present(s, 2, day)
    fact(s, 1, '9600')
    fact(s, 2, '1000', { date: '2026-11-10' })
    const r = buildAttendanceRate(s, day)
    expect(warning(r, 'AMBIGUOUS_EMPLOYMENT')).toMatchObject({
      scope: 'REFERENCE_WEEK',
      count: 1,
    })
    expect(r.totals[0]).toMatchObject({ roster: 2, present: 1 })
    expect(
      r.warnings.some(
        (row) => row.code === 'AMBIGUOUS_EMPLOYMENT' && row.scope === 'DAY'
      )
    ).toBe(false)
    expect(avg(r)).toMatchObject({ averagePcs: null, status: 'INCOMPLETE' })
    expect(estimate(r).boxes).toBeNull()
  })
  it('deduplicates joined facts by source id and ignores other-site attendance', () => {
    const s = source()
    person(s, 1)
    present(s, 1)
    fact(s, 1, '9600')
    s.production.push({ ...s.production[0] })
    s.attendance.push({
      employeeId: 1,
      siteId: 2,
      date: day,
      status: 'PRESENT',
    })
    const r = buildAttendanceRate(s, day)
    expect(avg(r)).toMatchObject({ quantityPcs: '9600.0000', transactions: 1 })
    expect(r.totals[0].present).toBe(0)
  })
})
