import * as XLSX from 'xlsx'

export const employeeImportColumns = [
  ['FULL_NAME', 'fullName'],
  ['NICKNAME', 'nickname'],
  ['EMPLOYEE_TYPE', 'employeeType'],
  ['SITE_CODE', 'site'],
  ['DEPARTMENT_CODE', 'departmentCode'],
  ['POSITION_CODE', 'positionCode'],
  ['WORK_GROUP_CODE', 'workGroupCode'],
  ['PRODUCTION_MODULE_CODE', 'productionModuleCode'],
  ['PRODUCTION_SECTION_CODE', 'productionSectionCode'],
  ['JOIN_DATE', 'joinDate'],
  ['PERMANENT_DATE', 'permanentDate'],
  ['GENDER', 'gender'],
  ['BIRTH_PLACE', 'birthPlace'],
  ['BIRTH_DATE', 'birthDate'],
  ['MARITAL_STATUS', 'maritalStatus'],
  ['RELIGION', 'religion'],
  ['EDUCATION_LEVEL', 'educationLevel'],
  ['NATIONAL_ID_NUMBER', 'nationalIdNumber'],
  ['FAMILY_CARD_NUMBER', 'familyCardNumber'],
  ['ADDRESS', 'address'],
  ['RTRW', 'rtrw'],
  ['KELURAHAN', 'kelurahan'],
  ['KECAMATAN', 'kecamatan'],
  ['CITY', 'city'],
  ['PROVINCE', 'province'],
  ['POSTAL_CODE', 'postalCode'],
  ['PHONE', 'phone'],
  ['EMAIL', 'email'],
  ['EMERGENCY_CONTACT_NAME', 'emergencyContactName'],
  ['EMERGENCY_CONTACT_PHONE', 'emergencyContactPhone'],
  ['EMERGENCY_CONTACT_RELATION', 'emergencyContactRelation'],
  ['BANK_NAME', 'bankName'],
  ['BANK_ACCOUNT_NUMBER', 'bankAccountNumber'],
  ['BANK_ACCOUNT_NAME', 'bankAccountName'],
  ['TAX_NUMBER', 'taxNumber'],
  ['BPJS_HEALTH_NUMBER', 'bpjsHealthNumber'],
  ['BPJS_EMPLOYMENT_NUMBER', 'bpjsEmploymentNumber'],
  ['NOTES', 'notes'],
] as const

export type EmployeeImportItem = Record<string, string>

export const employeeImportHeaders = employeeImportColumns.map(
  ([header]) => header
)

export const mandatoryEmployeeImportHeaders = new Set([
  'FULL_NAME',
  'EMPLOYEE_TYPE',
  'SITE_CODE',
  'PRODUCTION_MODULE_CODE',
  'PRODUCTION_SECTION_CODE',
  'JOIN_DATE',
  'GENDER',
  'EDUCATION_LEVEL',
])

export const employeeImportTemplateHeaders = employeeImportHeaders.map(
  (header) =>
    mandatoryEmployeeImportHeaders.has(header) ? `${header} *` : header
)

type ValidationPreview = {
  rows: {
    rowNumber: number
    valid: boolean
    issues: string[]
  }[]
}

export async function parseEmployeeImportWorkbook(
  file: File
): Promise<EmployeeImportItem[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: true,
  })
  const sheet = workbook.Sheets.Karyawan
  if (!sheet) throw new Error('Sheet Karyawan tidak ditemukan.')

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  })
  const importedHeaders = (rows[0] ?? []).map(normalizeHeader)
  const missing = employeeImportHeaders.filter(
    (header) => !importedHeaders.includes(header)
  )
  if (missing.length) {
    throw new Error(
      `Header template tidak lengkap: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', ...' : ''}`
    )
  }

  const dataRows = rows
    .slice(1)
    .filter((row) => row.some((value) => cleanCell(value)))
  if (!dataRows.length) throw new Error('File tidak memiliki baris data.')
  if (dataRows.length > 200) {
    throw new Error('Satu file maksimal 200 karyawan.')
  }

  return dataRows.map((row) =>
    Object.fromEntries(
      employeeImportColumns
        .map(
          ([header, field]) =>
            [field, cleanCell(row[importedHeaders.indexOf(header)])] as const
        )
        .filter(([, value]) => value)
    )
  )
}

export function buildEmployeeImportValidationWorkbook(
  items: EmployeeImportItem[],
  preview: ValidationPreview
) {
  const sheet = XLSX.utils.aoa_to_sheet([
    [
      ...employeeImportTemplateHeaders,
      'BARIS_ASAL',
      'STATUS_VALIDASI',
      'KETERANGAN_VALIDASI',
    ],
    ...preview.rows.map((row, index) => [
      ...employeeImportColumns.map(([, field]) => items[index]?.[field] ?? ''),
      row.rowNumber,
      row.valid ? 'VALID' : 'PERLU DIPERBAIKI',
      row.valid ? 'Data siap diimport.' : row.issues.join(' '),
    ]),
  ])
  sheet['!cols'] = [
    ...employeeImportTemplateHeaders.map((header) => ({
      wch: Math.max(15, header.length + 2),
    })),
    { wch: 12 },
    { wch: 22 },
    { wch: 75 },
  ]
  sheet['!autofilter'] = {
    ref: `A1:AO${preview.rows.length + 1}`,
  }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Karyawan')
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
