import * as XLSX from 'xlsx'
import type {
  ProductionImportPreview,
  ProductionImportRow,
  ProductionImportQc,
  ProductionImportTemplateEmployees,
} from './domain'

export const productionImportHeaders = [
  'TANGGAL',
  'NOMOR_KARYAWAN',
  'NAMA_KARYAWAN',
  'KUANTITAS',
] as const

export const productionImportMaxRows = 3_000

export const productionQcImportHeaders = [
  'QC_BRAND_CODE',
  'QC_BERAT_1_GRAM',
  'QC_BERAT_2_GRAM',
] as const
const defectPrefix = 'QC_DEFECT_'

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
  const qcHeaders = actualHeaders.filter((header) => header.startsWith('QC_'))
  if (new Set(qcHeaders).size !== qcHeaders.length) {
    throw new Error(
      'Kolom QC duplikat. Gunakan satu kolom untuk setiap field atau defect.'
    )
  }
  if (
    qcHeaders.some(
      (header) =>
        !productionQcImportHeaders.includes(
          header as (typeof productionQcImportHeaders)[number]
        ) && !/^QC_DEFECT_DF-[A-F0-9]{32}$/.test(header)
    )
  ) {
    throw new Error(
      'Header QC tidak dikenali. Gunakan kode pada template terbaru.'
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
      ...parseQc(values, actualHeaders, index + 2),
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
  if (rows.length > productionImportMaxRows) {
    throw new Error(
      `Maksimal ${productionImportMaxRows.toLocaleString('id-ID')} baris berisi data dalam satu file.`
    )
  }
  return rows
}

export function buildProductionValidationWorkbook(
  preview: ProductionImportPreview
) {
  const defectCodes = [
    ...new Set(
      preview.rows.flatMap(
        (row) => row.qc?.defects.map((defect) => defect.defectCode) ?? []
      )
    ),
  ].sort()
  const hasQc = preview.rows.some((row) => row.qc)
  const qcHeaders = hasQc
    ? [
        ...productionQcImportHeaders,
        ...defectCodes.map((code) => `${defectPrefix}${code}`),
      ]
    : []
  const validationHeaders = [
    ...productionImportHeaders,
    ...qcHeaders,
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
      ...(hasQc ? qcValues(row.qc, defectCodes) : []),
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
  if (hasQc) sheet['!cols']?.splice(4, 0, ...qcHeaders.map(() => ({ wch: 24 })))
  sheet['!autofilter'] = {
    ref: `A1:${XLSX.utils.encode_col(validationHeaders.length - 1)}${preview.rows.length + 1}`,
  }

  const summary = XLSX.utils.aoa_to_sheet([
    ['Ringkasan Hasil Validasi Import Produksi'],
    ['Total baris', preview.total],
    ['Valid', preview.valid],
    ['Perlu diperbaiki', preview.invalid],
    ['Peringatan', preview.warnings],
    [],
    [
      'Petunjuk',
      'Perbaiki kolom data dan QC pada sheet Hasil Produksi. Kolom validasi boleh dibiarkan dan file ini dapat langsung di-upload ulang. Kode QC tidak boleh diganti dengan nama.',
    ],
  ])
  summary['!cols'] = [{ wch: 24 }, { wch: 110 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Hasil Produksi')
  XLSX.utils.book_append_sheet(workbook, summary, 'Ringkasan Validasi')
  return workbook
}

function parseQc(
  values: unknown[],
  headers: string[],
  rowNumber: number
): { qc?: ProductionImportQc } {
  const read = (header: string) =>
    String(values[headers.indexOf(header)] ?? '').trim()
  const brandCode = read(productionQcImportHeaders[0]).toUpperCase()
  const weight1Grams = read(productionQcImportHeaders[1]).replace(',', '.')
  const weight2Grams = read(productionQcImportHeaders[2]).replace(',', '.')
  const defects = headers.flatMap((header, index) => {
    if (!header.startsWith(defectPrefix)) return []
    const raw = String(values[index] ?? '').trim()
    if (!raw) return []
    if (!/^\d+$/.test(raw) || Number(raw) > 4_294_967_295) {
      throw new Error(
        `Baris ${rowNumber}: jumlah defect harus bilangan bulat 0 atau lebih.`
      )
    }
    if (Number(raw) === 0) return []
    return [
      { defectCode: header.slice(defectPrefix.length), quantity: Number(raw) },
    ]
  })
  // Blank template QC (including zero defect defaults) is legacy metadata-free input.
  if (
    !brandCode &&
    !weight1Grams &&
    !weight2Grams &&
    !defects.some((item) => item.quantity > 0)
  )
    return {}
  return {
    qc: {
      ...(brandCode ? { brandCode } : {}),
      ...(weight1Grams ? { weight1Grams } : {}),
      ...(weight2Grams ? { weight2Grams } : {}),
      defects,
    },
  }
}

function qcValues(qc: ProductionImportQc | undefined, codes: string[]) {
  return [
    qc?.brandCode ?? '',
    qc?.weight1Grams ?? '',
    qc?.weight2Grams ?? '',
    ...codes.map(
      (code) =>
        qc?.defects.find((defect) => defect.defectCode === code)?.quantity ?? ''
    ),
  ]
}

export function buildProductionTemplateWorkbook(
  result: ProductionImportTemplateEmployees,
  date: string
) {
  const defects = result.qcOptions?.defects ?? []
  const defectCodes = defects.map((defect) => defect.code)
  const headers = [
    ...productionImportHeaders,
    ...productionQcImportHeaders,
    ...defectCodes.map((code) => `${defectPrefix}${code}`),
  ]
  const sheet = XLSX.utils.aoa_to_sheet([
    headers,
    ...result.data.map((employee) => [
      displayDate(date),
      employee.employeeNumber,
      employee.employeeName,
      '',
      ...qcValues(undefined, defectCodes),
    ]),
  ])
  sheet['!cols'] = headers.map((_, index) => ({
    wch: index === 2 ? 36 : index === 4 ? 40 : 22,
  }))
  sheet['!autofilter'] = {
    ref: `A1:${XLSX.utils.encode_col(headers.length - 1)}${result.data.length + 1}`,
  }
  defects.forEach((defect, index) => {
    const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: 7 + index })]
    cell.c = [
      {
        a: 'HRIS RSIA',
        t: `Defect: ${defect.name}. Isi jumlah bilangan bulat; kosong berarti 0.`,
      },
    ]
  })
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Hasil Produksi')
  const reference = XLSX.utils.aoa_to_sheet([
    ['Brand aktif per site', 'Site', 'Kode untuk QC_BRAND_CODE'],
    ...(result.qcOptions?.brands ?? []).map((brand) => [
      brand.name,
      brand.site.name,
      brand.code,
    ]),
    [],
    ['Defect aktif (global)', 'Kolom pada Hasil Produksi'],
    ...defects.map((defect) => [defect.name, `${defectPrefix}${defect.code}`]),
  ])
  reference['!cols'] = [{ wch: 35 }, { wch: 50 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(workbook, reference, 'Referensi QC')
  const guide = XLSX.utils.aoa_to_sheet([
    ['Panduan Import Hasil Produksi'],
    [
      'Isi TANGGAL dengan DD/MM/YYYY. Tanggal Excel dan YYYY-MM-DD juga didukung.',
    ],
    [
      'Isi KUANTITAS hanya pada karyawan yang akan diimpor. Gandakan baris untuk setoran tambahan.',
    ],
    ['Jangan mengubah NOMOR_KARYAWAN; NAMA_KARYAWAN hanya informasi.'],
    ['Site dan pekerjaan utama mengikuti histori pada tanggal setoran.'],
    [
      'QC hanya untuk pekerjaan BORONGAN-LINTING. Salin satu kode Brand sesuai site dari Referensi QC.',
    ],
    [
      'Dua berat adalah gram untuk masing-masing satu sampel, positif maksimal 2 desimal; koma atau titik diterima.',
    ],
    [
      'Nama defect tersedia pada komentar header dan Referensi QC. Isi jumlah per defect; kosong berarti 0.',
    ],
    [
      'Defect tidak mengurangi setoran atau upah. Satu batang boleh memiliki beberapa defect.',
    ],
    [
      'File lama atau baris tanpa QC tetap diterima. Jangan ubah kode/header QC.',
    ],
    [
      `Maksimal ${productionImportMaxRows.toLocaleString('id-ID')} baris. Seluruh baris harus valid sebelum import.`,
    ],
  ])
  guide['!cols'] = [{ wch: 115 }]
  XLSX.utils.book_append_sheet(workbook, guide, 'Panduan')
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
