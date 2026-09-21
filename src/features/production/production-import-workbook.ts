import * as XLSX from 'xlsx'
import type { ProductionImportPreview, ProductionImportRow } from './domain'

export const productionImportHeaders = [
  'TANGGAL',
  'NOMOR_KARYAWAN',
  'NAMA_KARYAWAN',
  'KUANTITAS',
] as const

export async function parseProductionWorkbook(
  file: File
): Promise<ProductionImportRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet =
    workbook.Sheets['Hasil Produksi'] ?? workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('Worksheet hasil Produksi tidak ditemukan.')
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
    productionImportHeaders.some(
      (header, index) => actualHeaders[index] !== header
    )
  ) {
    throw new Error(
      `Header wajib berurutan: ${productionImportHeaders.join(', ')}. Unduh template terbaru.`
    )
  }
  const rows = matrix
    .slice(1)
    .map((values, index) => ({
      rowNumber: index + 2,
      businessDate: normalizeExcelDate(values[0]),
      employeeNumber: String(values[1] ?? '').trim(),
      employeeName: String(values[2] ?? '').trim(),
      quantity: normalizeQuantity(values[3]),
    }))
    .filter(
      (row) =>
        row.businessDate ||
        row.quantity ||
        (!row.employeeName && row.employeeNumber)
    )
  if (!rows.length) {
    throw new Error('Isi minimal satu tanggal dan kuantitas pada template.')
  }
  if (rows.length > 2000) {
    throw new Error('Maksimal 2.000 baris berisi data dalam satu file.')
  }
  return rows
}

export function buildProductionValidationWorkbook(
  preview: ProductionImportPreview
) {
  const validationHeaders = [
    ...productionImportHeaders,
    'BARIS_ASAL',
    'STATUS_VALIDASI',
    'KETERANGAN_VALIDASI',
    'SITE',
    'KODE_PEKERJAAN',
    'PEKERJAAN_UTAMA',
    'SATUAN',
    'ESTIMASI_BRUTO',
  ]
  const sheet = XLSX.utils.aoa_to_sheet([
    validationHeaders,
    ...preview.rows.map((row) => [
      displayDate(row.businessDate),
      row.employeeNumber,
      row.employeeName ?? '',
      row.quantity,
      row.rowNumber,
      validationStatus(row),
      validationMessage(row),
      row.siteName ?? row.site ?? '',
      row.job?.code ?? '',
      row.job?.name ?? '',
      row.unit?.code ?? '',
      row.estimatedGrossAmount ?? '',
    ]),
  ])
  sheet['!cols'] = [
    { wch: 16 },
    { wch: 24 },
    { wch: 36 },
    { wch: 16 },
    { wch: 12 },
    { wch: 22 },
    { wch: 70 },
    { wch: 24 },
    { wch: 22 },
    { wch: 34 },
    { wch: 14 },
    { wch: 20 },
  ]
  sheet['!autofilter'] = { ref: `A1:L${preview.rows.length + 1}` }

  const summary = XLSX.utils.aoa_to_sheet([
    ['Ringkasan Hasil Validasi Import Produksi'],
    ['Total baris', preview.total],
    ['Valid', preview.valid],
    ['Perlu diperbaiki', preview.invalid],
    ['Peringatan', preview.warnings],
    [],
    [
      'Petunjuk',
      'Perbaiki empat kolom pertama pada sheet Hasil Produksi. Kolom validasi boleh dibiarkan dan file ini dapat langsung di-upload ulang.',
    ],
  ])
  summary['!cols'] = [{ wch: 24 }, { wch: 110 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Hasil Produksi')
  XLSX.utils.book_append_sheet(workbook, summary, 'Ringkasan Validasi')
  return workbook
}

function displayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function validationStatus(row: ProductionImportPreview['rows'][number]) {
  if (!row.valid) return 'PERLU DIPERBAIKI'
  return row.warning ? 'PERINGATAN' : 'VALID'
}

function validationMessage(row: ProductionImportPreview['rows'][number]) {
  return row.warning ? `${row.message} Peringatan: ${row.warning}` : row.message
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

function normalizeQuantity(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(',', '.')
}
