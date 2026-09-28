import * as XLSX from 'xlsx'
import type { MutationImportItem, MutationImportPreview } from '../domain'

export const mutationImportColumns = [
  ['EMPLOYEE_ID', 'employeeNumber'],
  ['EMPLOYEE_NAME', 'employeeName'],
  ['TARGET_SITE_CODE', 'targetSite'],
  ['TARGET_DEPARTMENT_CODE', 'targetDepartmentCode'],
  ['TARGET_PRODUCTION_MODULE_CODE', 'targetProductionModuleCode'],
  ['TARGET_PRODUCTION_SECTION_CODE', 'targetProductionSectionCode'],
  ['EFFECTIVE_DATE', 'effectiveFrom'],
] as const

const mandatoryHeaders = new Set([
  'EMPLOYEE_ID',
  'TARGET_SITE_CODE',
  'TARGET_PRODUCTION_MODULE_CODE',
  'TARGET_PRODUCTION_SECTION_CODE',
  'EFFECTIVE_DATE',
])

export const mutationImportTemplateHeaders = mutationImportColumns.map(
  ([header]) => (mandatoryHeaders.has(header) ? `${header} *` : header)
)

export async function parseMutationImportWorkbook(
  file: File
): Promise<MutationImportItem[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: true,
  })
  const sheet =
    workbook.Sheets.Mutasi ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('Sheet Mutasi tidak ditemukan.')

  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  })
  const headers = (matrix[0] ?? []).map(normalizeHeader)
  const missing = mutationImportColumns
    .map(([header]) => header)
    .filter((header) => !headers.includes(header))
  if (missing.length) {
    throw new Error(
      `Header template tidak lengkap: ${missing.join(', ')}. Unduh template terbaru.`
    )
  }

  const rows = matrix
    .slice(1)
    .filter((row) => row.some((value) => cleanCell(value)))
  if (!rows.length) throw new Error('File tidak memiliki baris mutasi.')
  if (rows.length > 200) throw new Error('Satu file maksimal 200 karyawan.')

  return rows.map((row) => {
    const value = (header: string) => row[headers.indexOf(header)]
    return {
      employeeNumber: cleanCell(value('EMPLOYEE_ID')),
      employeeName: cleanCell(value('EMPLOYEE_NAME')) || undefined,
      targetSite: cleanCell(value('TARGET_SITE_CODE')).toUpperCase(),
      targetDepartmentCode:
        cleanCell(value('TARGET_DEPARTMENT_CODE')).toUpperCase() || undefined,
      targetProductionModuleCode: cleanCell(
        value('TARGET_PRODUCTION_MODULE_CODE')
      ).toUpperCase(),
      targetProductionSectionCode: cleanCell(
        value('TARGET_PRODUCTION_SECTION_CODE')
      ).toUpperCase(),
      effectiveFrom: normalizeExcelDate(value('EFFECTIVE_DATE')),
    }
  })
}

export function buildMutationValidationWorkbook(
  items: MutationImportItem[],
  preview: MutationImportPreview
) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [
      ...mutationImportTemplateHeaders,
      'BARIS_ASAL',
      'STATUS_VALIDASI',
      'KETERANGAN_VALIDASI',
    ],
    ...preview.rows.map((row, index) => [
      items[index]?.employeeNumber ?? '',
      items[index]?.employeeName ?? '',
      items[index]?.targetSite ?? '',
      items[index]?.targetDepartmentCode ?? '',
      items[index]?.targetProductionModuleCode ?? '',
      items[index]?.targetProductionSectionCode ?? '',
      displayDate(items[index]?.effectiveFrom ?? ''),
      row.rowNumber,
      row.valid ? 'VALID' : 'PERLU DIPERBAIKI',
      row.valid ? 'Data siap diproses.' : row.issues.join(' '),
    ]),
  ])
  sheet['!cols'] = [
    { wch: 24 },
    { wch: 34 },
    { wch: 22 },
    { wch: 28 },
    { wch: 35 },
    { wch: 36 },
    { wch: 18 },
    { wch: 12 },
    { wch: 22 },
    { wch: 75 },
  ]
  sheet['!autofilter'] = { ref: `A1:J${preview.rows.length + 1}` }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Mutasi')
  return workbook
}

function normalizeHeader(value: unknown) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s*\*$/, '')
}

function cleanCell(value: unknown) {
  return String(value ?? '').trim()
}

function normalizeExcelDate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return isoDate(parsed.y, parsed.m, parsed.d)
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw)
  return match
    ? isoDate(Number(match[3]), Number(match[2]), Number(match[1]))
    : raw
}

function isoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function displayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}
