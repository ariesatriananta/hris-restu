import { z } from 'zod'

export const attendanceRateDate = z
  .string()
  .date()
  .refine(
    (value) => value >= '1000-01-15',
    'Tanggal terlalu awal untuk menghitung minggu sebelumnya.'
  )
export const attendanceRateCategories = ['REGULER', 'PREMIUM'] as const
export const attendanceRateTypes = ['TRAINING', 'BORONGAN'] as const
type Category = (typeof attendanceRateCategories)[number]
type EmployeeType = (typeof attendanceRateTypes)[number]
export type AttendanceRateSite = { uid: string; code: string; name: string }
export type AttendanceRateJob = {
  id: number
  uid: string
  code: string
  name: string
}
export type AttendanceRateModule = {
  id: number
  siteId: number
  uid: string
  code: string
  name: string
}
export type AttendanceRateEmployment = {
  id: number
  employeeId: number
  siteId: number
  employeeType: string
  employeeStatus: string
  status: string
  effectiveFrom: string
  effectiveTo: string | null
  moduleId: number | null
  moduleSiteId: number | null
}
export type AttendanceRateAssignment = {
  id: number
  employeeId: number
  siteId: number
  jobId: number
  status: string
  isPrimary: boolean
  effectiveFrom: string
  effectiveTo: string | null
}
export type AttendanceRateAttendance = {
  employeeId: number
  siteId: number
  date: string
  status: string
}
export type AttendanceRateProduction = {
  id: number
  employeeId: number
  siteId: number
  date: string
  jobId: number
  moduleId: number | null
  brandId: number | null
  brandSiteId: number | null
  quantity: string
  unitCode: string
  status: string
}
export type AttendanceRateCategoryHistory = {
  kind: 'MODULE' | 'BRAND'
  entityId: number
  category: string
  effectiveFrom: string
  effectiveTo: string | null
}
export type AttendanceRateSource = {
  siteId: number
  site: AttendanceRateSite
  jobs: AttendanceRateJob[]
  modules: AttendanceRateModule[]
  employment: AttendanceRateEmployment[]
  assignments: AttendanceRateAssignment[]
  attendance: AttendanceRateAttendance[]
  production: AttendanceRateProduction[]
  categories: AttendanceRateCategoryHistory[]
}

function offset(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
export function attendanceRateWindow(rawDate: string) {
  const date = attendanceRateDate.parse(rawDate)
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  const monday = offset(date, -((weekday + 6) % 7))
  const from = offset(monday, -7)
  return {
    from,
    to: offset(monday, -1),
    dates: Array.from({ length: 7 }, (_, index) => offset(from, index)),
  }
}

const capacityJobs = [
  { code: 'BORONGAN-LINTING', name: 'Linting', pcsPerBox: 9600 },
  { code: 'BORONGAN-PACKING', name: 'Packing', pcsPerBox: 800 },
] as const
const warningMessages: Record<string, string> = {
  AMBIGUOUS_EMPLOYMENT:
    'Histori kerja bertumpang-tindih; karyawan dikeluarkan dari perhitungan.',
  MISSING_PRIMARY_JOB:
    'Pekerjaan utama belum ada atau tidak tunggal; total attendance tetap dihitung.',
  MISSING_MODULE_CATEGORY:
    'Kategori modul pada tanggal terkait belum terpetakan atau tidak tunggal.',
  ATTENDANCE_OUTSIDE_ROSTER:
    'Attendance Hadir tidak memiliki satu roster aktif Training/Borongan pada site ini.',
  PRODUCTION_OUTSIDE_ROSTER:
    'Hasil produksi tidak memiliki satu roster aktif sesuai tanggal dan site.',
  PRODUCTION_WITHOUT_ATTENDANCE:
    'Hasil produksi tidak didukung attendance Hadir pada tanggal dan site yang sama.',
  SECONDARY_PRODUCTION:
    'Hasil pekerjaan di luar pekerjaan utama dikecualikan dari AVG.',
  MISSING_BRAND_CATEGORY:
    'Kategori brand historis belum terpetakan atau tidak sesuai site.',
  CATEGORY_CONFLICT:
    'Kategori brand hasil produksi berbeda dengan kategori modul pada tanggal yang sama.',
  MODULE_CONFLICT:
    'Snapshot modul transaksi berbeda dengan penempatan historis karyawan.',
  INVALID_QUANTITY:
    'Hasil produksi untuk AVG harus memakai satuan PCS dan kuantitas positif yang valid.',
}
type WarningScope = 'DAY' | 'REFERENCE_WEEK'
type Ratio = { numerator: bigint; denominator: bigint }
const zeroRatio = (): Ratio => ({ numerator: 0n, denominator: 1n })
function addRatio(a: Ratio, b: Ratio): Ratio {
  return {
    numerator: a.numerator * b.denominator + b.numerator * a.denominator,
    denominator: a.denominator * b.denominator,
  }
}
// Integer arithmetic preserves DECIMAL(18,4), with rounding only at the response boundary.
function decimal(ratio: Ratio, precision: number) {
  const scale = 10n ** BigInt(precision)
  const rounded =
    (ratio.numerator * scale * 2n + ratio.denominator) /
    (ratio.denominator * 2n)
  return precision
    ? `${rounded / scale}.${String(rounded % scale).padStart(precision, '0')}`
    : String(rounded)
}
function quantityUnits(raw: string) {
  if (!/^\d{1,14}(?:\.\d{1,4})?$/.test(raw)) return null
  const [whole, fraction = ''] = raw.split('.')
  const units = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'))
  return units > 0n ? units : null
}
function inPeriod(
  row: { effectiveFrom: string; effectiveTo: string | null },
  date: string
) {
  return (
    row.effectiveFrom <= date && (!row.effectiveTo || row.effectiveTo >= date)
  )
}
function groupBy<T>(rows: T[], key: (row: T) => string | number) {
  const groups = new Map<string | number, T[]>()
  for (const row of rows) {
    const id = key(row)
    const values = groups.get(id) ?? []
    values.push(row)
    groups.set(id, values)
  }
  return groups
}
function uniqueById<T extends { id: number }>(rows: T[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()]
}
const rate = (present: number, roster: number) =>
  roster
    ? decimal(
        { numerator: BigInt(present) * 100n, denominator: BigInt(roster) },
        2
      )
    : null
const counts = () => ({ present: 0, roster: 0 })

/** Pure aggregation: no current employee placement, no financial fields, no DB mutations. */
export function buildAttendanceRate(
  source: AttendanceRateSource,
  rawDate: string
) {
  const date = attendanceRateDate.parse(rawDate)
  const window = attendanceRateWindow(date)
  const requiredDates = [...window.dates, date]
  const historyByEmployee = groupBy(
    uniqueById(source.employment.filter((row) => row.status === 'ACTIVE')),
    (row) => row.employeeId
  )
  const assignmentByEmployee = groupBy(
    uniqueById(
      source.assignments.filter(
        (row) => row.status === 'ACTIVE' && row.isPrimary
      )
    ),
    (row) => row.employeeId
  )
  const categoryHistories = groupBy(
    source.categories,
    (row) => `${row.kind}:${row.entityId}`
  )
  const jobById = new Map(source.jobs.map((job) => [job.id, job]))
  const moduleById = new Map(
    source.modules
      .filter((module) => module.siteId === source.siteId)
      .map((module) => [module.id, module])
  )
  const publicJob = (job: AttendanceRateJob) => ({
    uid: job.uid,
    code: job.code,
    name: job.name,
  })
  const warningSets = new Map<string, Set<string>>()
  const warn = (code: string, scope: WarningScope, key: string) => {
    const group = `${scope}:${code}`
    const values = warningSets.get(group) ?? new Set<string>()
    values.add(key)
    warningSets.set(group, values)
  }
  const categoryAt = (
    kind: 'MODULE' | 'BRAND',
    id: number | null,
    day: string
  ): Category | null => {
    if (id == null) return null
    const rows =
      categoryHistories
        .get(`${kind}:${id}`)
        ?.filter((row) => inPeriod(row, day)) ?? []
    return rows.length === 1 &&
      attendanceRateCategories.includes(rows[0].category as Category)
      ? (rows[0].category as Category)
      : null
  }
  const present = new Set(
    source.attendance
      .filter(
        (row) =>
          row.siteId === source.siteId &&
          row.status === 'PRESENT' &&
          requiredDates.includes(row.date)
      )
      .map((row) => `${row.date}:${row.employeeId}`)
  )
  type Classified = {
    employeeType: EmployeeType
    category: Category | null
    moduleId: number | null
    job: AttendanceRateJob | null
  }
  const classifications = new Map<string, Classified>()
  const uncertainAttendance: Array<{
    day: string
    employeeType: EmployeeType
    jobCode: string
  }> = []
  for (const day of requiredDates) {
    const scope = day === date ? 'DAY' : 'REFERENCE_WEEK'
    for (const [employeeId, histories] of historyByEmployee) {
      const effective = histories.filter((row) => inPeriod(row, day))
      const relevant = effective.some(
        (row) =>
          row.siteId === source.siteId &&
          attendanceRateTypes.includes(row.employeeType as EmployeeType) &&
          row.employeeStatus === 'ACTIVE'
      )
      if (!relevant) continue
      const key = `${day}:${employeeId}`
      if (effective.length !== 1) {
        warn('AMBIGUOUS_EMPLOYMENT', scope, key)
        if (present.has(key)) {
          const primary =
            assignmentByEmployee
              .get(employeeId)
              ?.filter((row) => inPeriod(row, day)) ?? []
          const job =
            primary.length === 1 && primary[0].siteId === source.siteId
              ? jobById.get(primary[0].jobId)
              : undefined
          const types = new Set(
            effective
              .filter(
                (row) =>
                  row.siteId === source.siteId &&
                  row.employeeStatus === 'ACTIVE' &&
                  attendanceRateTypes.includes(row.employeeType as EmployeeType)
              )
              .map((row) => row.employeeType as EmployeeType)
          )
          for (const employeeType of types)
            for (const target of capacityJobs) {
              if (!job || job.code === target.code)
                uncertainAttendance.push({
                  day,
                  employeeType,
                  jobCode: target.code,
                })
            }
        }
        continue
      }
      const history = effective[0]
      const primary =
        assignmentByEmployee
          .get(employeeId)
          ?.filter((row) => inPeriod(row, day)) ?? []
      const job =
        primary.length === 1 && primary[0].siteId === source.siteId
          ? (jobById.get(primary[0].jobId) ?? null)
          : null
      if (!job) warn('MISSING_PRIMARY_JOB', scope, key)
      const validModule =
        history.moduleId != null &&
        history.moduleSiteId === source.siteId &&
        moduleById.has(history.moduleId)
      const category = validModule
        ? categoryAt('MODULE', history.moduleId, day)
        : null
      if (!category) warn('MISSING_MODULE_CATEGORY', scope, key)
      classifications.set(key, {
        employeeType: history.employeeType as EmployeeType,
        category,
        moduleId: validModule ? history.moduleId : null,
        job,
      })
    }
  }
  for (const key of present)
    if (!classifications.has(key))
      warn(
        'ATTENDANCE_OUTSIDE_ROSTER',
        key.startsWith(`${date}:`) ? 'DAY' : 'REFERENCE_WEEK',
        key
      )

  const totalsByType = new Map(
    attendanceRateTypes.map((type) => [type, counts()])
  )
  const groups = attendanceRateTypes.flatMap((employeeType) =>
    attendanceRateCategories.map((category) => ({
      employeeType,
      category,
      ...counts(),
      modules: [] as Array<{ uid: string; code: string; name: string }>,
      jobs: source.jobs.map((job) => ({
        job: publicJob(job),
        ...counts(),
        ratePercent: null as string | null,
      })),
      unassigned: counts(),
      ratePercent: null as string | null,
    }))
  )
  const unmapped = attendanceRateTypes.map((employeeType) => ({
    employeeType,
    ...counts(),
  }))
  const avgKey = (type: EmployeeType, category: Category, jobCode: string) =>
    `${type}:${category}:${jobCode}`
  type Average = {
    units: bigint
    presentDays: number
    transactions: number
    invalid: boolean
  }
  const averages = new Map<string, Average>()
  const average = (type: EmployeeType, category: Category, code: string) => {
    const key = avgKey(type, category, code)
    const value = averages.get(key) ?? {
      units: 0n,
      presentDays: 0,
      transactions: 0,
      invalid: false,
    }
    averages.set(key, value)
    return value
  }
  const dayUnresolved = new Set<string>()
  // Unknown facts must not turn a partial result into AVAILABLE or zero capacity.
  // A known non-target employment (e.g. Harian) remains outside this report.
  const markUnclassified = (
    day: string,
    employeeId: number,
    factJobCode?: string
  ) => {
    const effective =
      historyByEmployee.get(employeeId)?.filter((row) => inPeriod(row, day)) ??
      []
    const eligible = effective.filter(
      (row) =>
        row.siteId === source.siteId &&
        row.employeeStatus === 'ACTIVE' &&
        attendanceRateTypes.includes(row.employeeType as EmployeeType)
    )
    if (effective.length && !eligible.length) return
    const types = eligible.length
      ? [...new Set(eligible.map((row) => row.employeeType as EmployeeType))]
      : attendanceRateTypes
    const classified = classifications.get(`${day}:${employeeId}`)
    const primary =
      assignmentByEmployee
        .get(employeeId)
        ?.filter((row) => inPeriod(row, day)) ?? []
    const primaryJob =
      primary.length === 1 && primary[0].siteId === source.siteId
        ? jobById.get(primary[0].jobId)
        : undefined
    const jobCode = factJobCode ?? primaryJob?.code
    for (const type of types)
      for (const category of attendanceRateCategories) {
        if (classified?.category && classified.category !== category) continue
        for (const target of capacityJobs) {
          if (jobCode && target.code !== jobCode) continue
          if (day === date)
            dayUnresolved.add(avgKey(type, category, target.code))
          else average(type, category, target.code).invalid = true
        }
      }
  }
  for (const key of present)
    if (!classifications.has(key)) {
      const [day, employeeId] = key.split(':')
      markUnclassified(day, Number(employeeId))
    }
  for (const row of uncertainAttendance)
    for (const category of attendanceRateCategories) {
      if (row.day === date)
        dayUnresolved.add(avgKey(row.employeeType, category, row.jobCode))
      else average(row.employeeType, category, row.jobCode).invalid = true
    }
  for (const [key, row] of classifications) {
    const isToday = key.startsWith(`${date}:`)
    const hasAttendance = present.has(key)
    if (isToday) {
      const total = totalsByType.get(row.employeeType)!
      total.roster++
      if (hasAttendance) total.present++
      if (!row.category) {
        const missing = unmapped.find(
          (group) => group.employeeType === row.employeeType
        )!
        missing.roster++
        if (hasAttendance) missing.present++
      } else {
        const group = groups.find(
          (value) =>
            value.employeeType === row.employeeType &&
            value.category === row.category
        )!
        group.roster++
        if (hasAttendance) group.present++
        const module =
          row.moduleId == null ? null : moduleById.get(row.moduleId)
        if (module && !group.modules.some((value) => value.uid === module.uid))
          group.modules.push({
            uid: module.uid,
            code: module.code,
            name: module.name,
          })
        const job = group.jobs.find((value) => value.job.code === row.job?.code)
        const jobCount = job ?? group.unassigned
        jobCount.roster++
        if (hasAttendance) jobCount.present++
      }
    }
    if (!hasAttendance) continue
    for (const target of capacityJobs) {
      if (row.job && row.job.code !== target.code) continue
      for (const category of attendanceRateCategories) {
        if (row.category && category !== row.category) continue
        if (!row.category || !row.job) {
          if (isToday)
            dayUnresolved.add(avgKey(row.employeeType, category, target.code))
          else average(row.employeeType, category, target.code).invalid = true
        } else if (!isToday)
          average(row.employeeType, category, target.code).presentDays++
      }
    }
  }
  for (const group of groups) {
    group.ratePercent = rate(group.present, group.roster)
    group.modules.sort((a, b) => a.code.localeCompare(b.code))
    for (const job of group.jobs)
      job.ratePercent = rate(job.present, job.roster)
  }

  for (const fact of uniqueById(source.production)) {
    if (
      fact.status !== 'POSTED' ||
      fact.siteId !== source.siteId ||
      !window.dates.includes(fact.date)
    )
      continue
    const job = jobById.get(fact.jobId)
    if (!capacityJobs.some((target) => target.code === job?.code)) continue
    const personDay = `${fact.date}:${fact.employeeId}`
    const row = classifications.get(personDay)
    if (!row) {
      warn('PRODUCTION_OUTSIDE_ROSTER', 'REFERENCE_WEEK', String(fact.id))
      markUnclassified(fact.date, fact.employeeId, job?.code)
      continue
    }
    if (!row.job) {
      markUnclassified(fact.date, fact.employeeId, job?.code)
      if (!present.has(personDay))
        warn('PRODUCTION_WITHOUT_ATTENDANCE', 'REFERENCE_WEEK', String(fact.id))
      continue
    }
    if (row.job.id !== fact.jobId) {
      warn('SECONDARY_PRODUCTION', 'REFERENCE_WEEK', String(fact.id))
      continue
    }
    if (!row.category) {
      markUnclassified(fact.date, fact.employeeId, row.job.code)
      if (!present.has(personDay))
        warn('PRODUCTION_WITHOUT_ATTENDANCE', 'REFERENCE_WEEK', String(fact.id))
      continue
    }
    const value = average(row.employeeType, row.category, row.job.code)
    const reject = (code: string) => {
      value.invalid = true
      warn(code, 'REFERENCE_WEEK', String(fact.id))
    }
    if (!present.has(personDay)) {
      reject('PRODUCTION_WITHOUT_ATTENDANCE')
      continue
    }
    if (fact.moduleId != null && fact.moduleId !== row.moduleId) {
      reject('MODULE_CONFLICT')
      continue
    }
    // Non-QC jobs may have no brand. Use their historical module, never today's cache.
    // An explicitly recorded brand still requires its own valid history and matching category.
    const brandCategory =
      fact.brandId == null
        ? row.category
        : fact.brandSiteId === source.siteId
          ? categoryAt('BRAND', fact.brandId, fact.date)
          : null
    if (!brandCategory) {
      reject('MISSING_BRAND_CATEGORY')
      continue
    }
    if (brandCategory !== row.category) {
      reject('CATEGORY_CONFLICT')
      continue
    }
    const units = quantityUnits(fact.quantity)
    if (fact.unitCode !== 'PCS' || units == null) {
      reject('INVALID_QUANTITY')
      continue
    }
    value.units += units
    value.transactions++
  }
  const publicAverages = capacityJobs.flatMap((target) =>
    attendanceRateTypes.flatMap((employeeType) => {
      const values = attendanceRateCategories.map((category) => ({
        category,
        value: average(employeeType, category, target.code),
      }))
      const combined = values.reduce<Average>(
        (sum, row) => ({
          units: sum.units + row.value.units,
          presentDays: sum.presentDays + row.value.presentDays,
          transactions: sum.transactions + row.value.transactions,
          invalid: sum.invalid || row.value.invalid,
        }),
        { units: 0n, presentDays: 0, transactions: 0, invalid: false }
      )
      return [...values, { category: 'TOTAL' as const, value: combined }].map(
        ({ category, value }) => ({
          job: {
            code: target.code,
            name:
              source.jobs.find((job) => job.code === target.code)?.name ??
              target.name,
          },
          employeeType,
          category,
          quantityPcs: decimal(
            { numerator: value.units, denominator: 10000n },
            4
          ),
          presentDays: value.presentDays,
          transactions: value.transactions,
          averagePcs:
            !value.invalid && value.presentDays > 0 && value.transactions > 0
              ? decimal(
                  {
                    numerator: value.units,
                    denominator: BigInt(value.presentDays) * 10000n,
                  },
                  4
                )
              : null,
          complete: !value.invalid,
          status: value.invalid
            ? 'INCOMPLETE'
            : value.presentDays && value.transactions
              ? 'AVAILABLE'
              : 'NO_DATA',
        })
      )
    })
  )
  const estimates = capacityJobs.map((target) => {
    const values = attendanceRateCategories.map((category) => {
      let estimate = zeroRatio()
      let available = true
      let headcount = 0
      for (const employeeType of attendanceRateTypes) {
        const group = groups.find(
          (value) =>
            value.employeeType === employeeType && value.category === category
        )!
        const people =
          group.jobs.find((row) => row.job.code === target.code)?.present ?? 0
        headcount += people
        if (dayUnresolved.has(avgKey(employeeType, category, target.code)))
          available = false
        if (!people) continue // A holiday with nobody present has zero capacity even without AVG.
        const value = average(employeeType, category, target.code)
        if (value.invalid || !value.presentDays || !value.transactions) {
          available = false
          continue
        }
        estimate = addRatio(estimate, {
          numerator: value.units * BigInt(people),
          denominator: BigInt(value.presentDays) * 10000n,
        })
      }
      return { category, headcount, ratio: estimate, available }
    })
    const all = {
      category: 'TOTAL' as const,
      headcount: values.reduce((sum, value) => sum + value.headcount, 0),
      ratio: values.reduce(
        (sum, value) => addRatio(sum, value.ratio),
        zeroRatio()
      ),
      available: values.every((value) => value.available),
    }
    return {
      job: {
        code: target.code,
        name:
          source.jobs.find((job) => job.code === target.code)?.name ??
          target.name,
      },
      pcsPerBox: target.pcsPerBox,
      categories: [...values, all].map((value) => ({
        category: value.category,
        present: value.headcount,
        estimatedPcs: value.available ? decimal(value.ratio, 4) : null,
        boxes: value.available
          ? decimal(
              {
                numerator: value.ratio.numerator,
                denominator: value.ratio.denominator * BigInt(target.pcsPerBox),
              },
              2
            )
          : null,
        complete: value.available,
      })),
    }
  })
  const totalCounts = [...totalsByType.values()].reduce(
    (sum, value) => ({
      present: sum.present + value.present,
      roster: sum.roster + value.roster,
    }),
    counts()
  )
  return {
    date,
    site: source.site,
    referenceWeek: { from: window.from, to: window.to },
    groups,
    unmapped,
    totals: [
      ...attendanceRateTypes.map((employeeType) => ({
        employeeType,
        ...totalsByType.get(employeeType)!,
        ratePercent: rate(
          totalsByType.get(employeeType)!.present,
          totalsByType.get(employeeType)!.roster
        ),
      })),
      {
        employeeType: 'TOTAL' as const,
        ...totalCounts,
        ratePercent: rate(totalCounts.present, totalCounts.roster),
      },
    ],
    averages: publicAverages,
    estimates,
    warnings: [...warningSets].map(([key, values]) => {
      const [scope, code] = key.split(':')
      return {
        scope: scope as WarningScope,
        code,
        count: values.size,
        message: warningMessages[code],
      }
    }),
  }
}
