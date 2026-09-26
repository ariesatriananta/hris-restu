import * as XLSX from 'xlsx'
import type { AttendanceImportPreview, AttendanceImportRow } from './domain'

export const attendanceImportHeaders = [
  'TANGGAL',
  'NOMOR_KARYAWAN',
  'NAMA_KARYAWAN',
  'STATUS',
  'JAM_MASUK',
  'JAM_PULANG',
  'KETERANGAN',
] as const

export async function parseAttendanceWorkbook(
  file: File
): Promise<AttendanceImportRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet =
    workbook.Sheets.Attendance ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('Worksheet Attendance tidak ditemukan.')
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: '',
  })
  if (!matrix.length) throw new Error('File Excel tidak memiliki data.')
  const actualHeaders = (matrix[0] ?? []).map((value) =>
    String(value ?? '')
      .trim()
      .toUpperCase()
  )
  if (
    attendanceImportHeaders.some(
      (header, index) => actualHeaders[index] !== header
    )
  ) {
    throw new Error(
      `Header wajib berurutan: ${attendanceImportHeaders.join(', ')}. Unduh template terbaru.`
    )
  }
  const rows = matrix
    .slice(1)
    .map((values, index) => ({
      rowNumber: index + 2,
      businessDate: normalizeExcelDate(values[0]),
      employeeNumber: String(values[1] ?? '').trim(),
      employeeName: String(values[2] ?? '').trim(),
      status: normalizeStatus(values[3]),
      clockIn: normalizeExcelTime(values[4]),
      clockOut: normalizeExcelTime(values[5]),
      notes: String(values[6] ?? '').trim(),
    }))
    .filter((row) => row.status || row.clockIn || row.clockOut || row.notes)
  if (!rows.length) {
    throw new Error('Isi minimal satu status Attendance pada template.')
  }
  if (rows.length > 2000) {
    throw new Error('Maksimal 2.000 baris berisi data dalam satu file.')
  }
  return rows
}

export function buildAttendanceValidationWorkbook(
  preview: AttendanceImportPreview
) {
  const headers = [
    ...attendanceImportHeaders,
    'BARIS_ASAL',
    'STATUS_VALIDASI',
    'KETERANGAN_VALIDASI',
    'SITE',
    'SHIFT',
    'STATUS_HASIL',
    'JENIS_HARI',
  ]
  const sheet = XLSX.utils.aoa_to_sheet([
    headers,
    ...preview.rows.map((row) => [
      displayDate(row.businessDate),
      row.employeeNumber,
      row.employeeName ?? '',
      row.status,
      row.clockIn ?? '',
      row.clockOut ?? '',
      row.notes ?? '',
      row.rowNumber,
      validationStatus(row),
      row.warning ? `${row.message} Peringatan: ${row.warning}` : row.message,
      row.siteName ?? row.site ?? '',
      row.shiftName ?? '',
      row.attendanceStatus ?? '',
      row.calendarDayType ?? '',
    ]),
  ])
  sheet['!cols'] = [
    { wch: 16 },
    { wch: 24 },
    { wch: 36 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 40 },
    { wch: 12 },
    { wch: 22 },
    { wch: 75 },
    { wch: 24 },
    { wch: 28 },
    { wch: 18 },
    { wch: 18 },
  ]
  sheet['!autofilter'] = { ref: `A1:N${preview.rows.length + 1}` }

  const summary = XLSX.utils.aoa_to_sheet([
    ['Ringkasan Hasil Validasi Import Attendance'],
    ['Total baris', preview.total],
    ['Valid', preview.valid],
    ['Perlu diperbaiki', preview.invalid],
    ['Peringatan', preview.warnings],
    [],
    [
      'Petunjuk',
      'Perbaiki tujuh kolom pertama pada sheet Attendance. Kolom validasi boleh dibiarkan dan file ini dapat langsung di-upload ulang.',
    ],
  ])
  summary['!cols'] = [{ wch: 24 }, { wch: 110 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance')
  XLSX.utils.book_append_sheet(workbook, summary, 'Ringkasan Validasi')
  return workbook
}

function validationStatus(row: AttendanceImportPreview['rows'][number]) {
  if (!row.valid) return 'PERLU DIPERBAIKI'
  return row.warning ? 'PERINGATAN' : 'VALID'
}

function normalizeStatus(value: unknown) {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  return normalized === 'IJIN' ? 'IZIN' : normalized
}

function normalizeExcelDate(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
  }
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw)
  return match
    ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
    : raw
}

function normalizeExcelTime(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) {
      return `${String(parsed.H).padStart(2, '0')}:${String(parsed.M).padStart(2, '0')}`
    }
  }
  const raw = String(value ?? '').trim()
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(raw)
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : raw
}

function displayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}
