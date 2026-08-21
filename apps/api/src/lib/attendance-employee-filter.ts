import { z } from 'zod'

export const attendanceEmployeeTypeCodes = [
  'BORONGAN',
  'HARIAN',
  'BULANAN',
  'TRAINING',
] as const

const employeeTypeSchema = z.enum(attendanceEmployeeTypeCodes)
const productionSectionUidSchema = z.string().uuid()

function csvValues(raw: unknown) {
  const inputs = Array.isArray(raw) ? raw : [raw]
  return inputs
    .flatMap((value) => String(value ?? '').split(','))
    .map((value) => value.trim())
    .filter(Boolean)
}

function uniqueParsed<T>(raw: unknown, schema: z.ZodType<T>) {
  return [...new Set(z.array(schema).parse(csvValues(raw)))]
}

export function parseAttendanceEmployeeFilters(raw: {
  employeeType?: unknown
  productionSection?: unknown
}) {
  return {
    employeeTypes: uniqueParsed(raw.employeeType, employeeTypeSchema),
    productionSectionUids: uniqueParsed(
      raw.productionSection,
      productionSectionUidSchema
    ),
  }
}

export function appendAttendanceEmployeeFilters(
  where: string[],
  values: unknown[],
  filters: ReturnType<typeof parseAttendanceEmployeeFilters>,
  aliases: { employeeType?: string; productionSection?: string } = {}
) {
  const employeeTypeColumn = aliases.employeeType ?? 'et.code'
  const productionSectionColumn = aliases.productionSection ?? 'ps.uid'
  if (filters.employeeTypes.length) {
    where.push(
      `${employeeTypeColumn} IN (${filters.employeeTypes.map(() => '?').join(',')})`
    )
    values.push(...filters.employeeTypes)
  }
  if (filters.productionSectionUids.length) {
    where.push(
      `${productionSectionColumn} IN (${filters.productionSectionUids.map(() => '?').join(',')})`
    )
    values.push(...filters.productionSectionUids)
  }
}
