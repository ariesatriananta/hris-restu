import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildProductionValidationWorkbook,
  buildProductionTemplateWorkbook,
  parseProductionWorkbook,
  productionImportMaxRows,
} from './production-import-workbook'

function workbookFile(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    'Hasil Produksi'
  )
  const content = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return new File([content], 'hasil-produksi.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('parser import hasil Produksi', () => {
  const brandCode = `BR-${'A'.repeat(32)}`
  const defectCode = `DF-${'B'.repeat(32)}`
  const baseHeaders = [
    'TANGGAL',
    'NOMOR_KARYAWAN',
    'NAMA_KARYAWAN',
    'KUANTITAS',
  ]

  it('reads QC by stable header, accepts comma grams and retains overlapping defects', async () => {
    const rows = await parseProductionWorkbook(
      workbookFile([
        [
          ...baseHeaders,
          `QC_DEFECT_${defectCode}`,
          'QC_BERAT_2_GRAM',
          'STATUS_VALIDASI',
          'QC_BRAND_CODE',
          'QC_BERAT_1_GRAM',
        ],
        [
          '19/09/2026',
          'PKDS-001',
          'Siti',
          500,
          600,
          '70,05',
          'VALID',
          brandCode,
          '71,29',
        ],
      ])
    )
    expect(rows[0].quantity).toBe('500')
    expect(rows[0].qc).toEqual({
      brandCode,
      weight1Grams: '71.29',
      weight2Grams: '70.05',
      defects: [{ defectCode, quantity: 600 }],
    })
  })

  it('blank QC template and zero defaults remain compatible without QC', async () => {
    const rows = await parseProductionWorkbook(
      workbookFile([
        [
          ...baseHeaders,
          'QC_BRAND_CODE',
          'QC_BERAT_1_GRAM',
          'QC_BERAT_2_GRAM',
          `QC_DEFECT_${defectCode}`,
        ],
        ['19/09/2026', 'PKDS-001', 'Siti', 500, '', '', '', 0],
      ])
    )
    expect(rows[0].qc).toBeUndefined()
  })

  it('does not send zero defect columns when other QC fields are filled', async () => {
    const rows = await parseProductionWorkbook(
      workbookFile([
        [
          ...baseHeaders,
          'QC_BRAND_CODE',
          'QC_BERAT_1_GRAM',
          'QC_BERAT_2_GRAM',
          `QC_DEFECT_${defectCode}`,
        ],
        ['19/09/2026', 'PKDS-001', 'Siti', 500, brandCode, '71.29', '70.05', 0],
      ])
    )
    expect(rows[0].qc?.defects).toEqual([])
    expect(rows[0].qc?.brandCode).toBe(brandCode)
  })

  it.each(['-1', '1.5', 'abc', '4294967296'])(
    'rejects invalid defect count %s without dropping metadata',
    async (quantity) => {
      await expect(
        parseProductionWorkbook(
          workbookFile([
            [...baseHeaders, `QC_DEFECT_${defectCode}`],
            ['19/09/2026', 'PKDS-001', 'Siti', 500, quantity],
          ])
        )
      ).rejects.toThrow('Baris 2: jumlah defect')
    }
  )

  it('rejects duplicate and unknown QC headers', async () => {
    await expect(
      parseProductionWorkbook(
        workbookFile([
          [...baseHeaders, 'QC_BRAND_CODE', 'QC_BRAND_CODE'],
          ['19/09/2026', 'PKDS-001', 'Siti', 500],
        ])
      )
    ).rejects.toThrow('QC duplikat')
    await expect(
      parseProductionWorkbook(
        workbookFile([
          [...baseHeaders, 'QC_DEFECT_NAMA'],
          ['19/09/2026', 'PKDS-001', 'Siti', 500],
        ])
      )
    ).rejects.toThrow('QC tidak dikenali')
  })

  it('validation export reimport preserves QC and original quantities', async () => {
    const qc = {
      brandCode,
      weight1Grams: '71.29',
      weight2Grams: '70.05',
      defects: [{ defectCode, quantity: 600 }],
    }
    const workbook = buildProductionValidationWorkbook({
      total: 1,
      valid: 1,
      invalid: 0,
      warnings: 0,
      rows: [
        {
          rowNumber: 2,
          businessDate: '2026-09-19',
          employeeNumber: 'PKDS-001',
          employeeName: 'Siti',
          quantity: '500',
          qc,
          valid: true,
          warning: null,
          message: 'Valid',
        },
      ],
    })
    const content = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const rows = await parseProductionWorkbook(
      new File([content], 'validasi.xlsx')
    )
    expect(rows[0].qc).toEqual(qc)
    expect(rows[0].quantity).toBe('500')
  })

  it('template contains scoped brand reference and ordered defect comments without defaults', async () => {
    const workbook = buildProductionTemplateWorkbook(
      {
        data: [{ employeeNumber: 'PKDS-001', employeeName: 'Siti' }],
        meta: { total: 1, limit: 3000, referenceDate: '2026-09-19' },
        qcOptions: {
          brands: [
            {
              uid: 'brand',
              code: brandCode,
              name: 'Brand A',
              site: { code: 'JEPARA', name: 'Jepara' },
            },
          ],
          defects: [
            { uid: 'defect', code: defectCode, name: 'Cowong', sortOrder: 0 },
          ],
        },
      },
      '2026-09-19'
    )
    expect(workbook.Sheets['Hasil Produksi']['H1'].c?.[0].t).toContain('Cowong')
    const content = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
    const rows = await parseProductionWorkbook(
      new File([content], 'template.xlsx')
    )
    expect(rows[0].qc).toBeUndefined()
    expect(rows[0].quantity).toBe('')
    expect(workbook.SheetNames).toContain('Referensi QC')
  })
  it('mendukung banyak tanggal dan mengabaikan baris template yang belum diisi', async () => {
    const rows = await parseProductionWorkbook(
      workbookFile([
        ['TANGGAL', 'NOMOR_KARYAWAN', 'NAMA_KARYAWAN', 'KUANTITAS'],
        ['21/09/2026', 'PKDS-001', 'Siti', '12,5'],
        ['2026-09-21', 'PKDS-002', 'Wati', 25],
        ['', 'PKDS-003', 'Aminah', ''],
      ])
    )
    expect(rows).toEqual([
      {
        rowNumber: 2,
        businessDate: '2026-09-21',
        employeeNumber: 'PKDS-001',
        employeeName: 'Siti',
        quantity: '12.5',
      },
      {
        rowNumber: 3,
        businessDate: '2026-09-21',
        employeeNumber: 'PKDS-002',
        employeeName: 'Wati',
        quantity: '25',
      },
    ])
  })

  it('mempertahankan tanggal kalender dari serial Excel tanpa bergeser timezone', async () => {
    const rows = await parseProductionWorkbook(
      workbookFile([
        ['TANGGAL', 'NOMOR_KARYAWAN', 'NAMA_KARYAWAN', 'KUANTITAS'],
        [46284, 'PKDS-001', 'Siti', 25],
      ])
    )

    expect(rows[0].businessDate).toBe('2026-09-19')
  })

  it('menolak template dengan urutan header yang berubah', async () => {
    await expect(
      parseProductionWorkbook(
        workbookFile([
          ['NOMOR_KARYAWAN', 'TANGGAL', 'NAMA_KARYAWAN', 'KUANTITAS'],
          ['PKDS-001', '2026-09-20', 'Siti', 10],
        ])
      )
    ).rejects.toThrow('Header wajib berurutan')
  })

  it('menerima maksimal 3.000 baris dan menolak baris berikutnya', async () => {
    const headers = ['TANGGAL', 'NOMOR_KARYAWAN', 'NAMA_KARYAWAN', 'KUANTITAS']
    const dataRows = Array.from(
      { length: productionImportMaxRows + 1 },
      (_, index) => [
        '21/09/2026',
        `PKDS-${String(index + 1).padStart(5, '0')}`,
        `Karyawan ${index + 1}`,
        '10',
      ]
    )

    const accepted = await parseProductionWorkbook(
      workbookFile([headers, ...dataRows.slice(0, productionImportMaxRows)])
    )
    expect(accepted).toHaveLength(productionImportMaxRows)

    await expect(
      parseProductionWorkbook(workbookFile([headers, ...dataRows]))
    ).rejects.toThrow('Maksimal 3.000 baris')
  })

  it('membuat hasil validasi yang lengkap dan dapat diunggah ulang', () => {
    const workbook = buildProductionValidationWorkbook({
      total: 2,
      valid: 1,
      invalid: 1,
      warnings: 1,
      rows: [
        {
          rowNumber: 2,
          businessDate: '2026-09-21',
          employeeNumber: 'PKDS-001',
          employeeName: 'Siti',
          quantity: '25',
          site: 'JEPARA',
          siteName: 'Site Jepara',
          job: { uid: 'job-1', code: 'LINTING', name: 'Linting' },
          unit: {
            uid: 'unit-1',
            code: 'PCS',
            name: 'Pieces',
            decimalPrecision: 0,
          },
          estimatedGrossAmount: '111000',
          valid: true,
          message: 'Siap diimpor.',
          warning: 'Sudah ada setoran tercatat.',
        },
        {
          rowNumber: 3,
          businessDate: '22/09/2026',
          employeeNumber: 'PKDS-404',
          employeeName: 'Tidak Dikenal',
          quantity: '10',
          valid: false,
          message: 'Karyawan tidak ditemukan.',
          warning: null,
        },
      ],
    })
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets['Hasil Produksi'],
      { header: 1, raw: true, defval: '' }
    )

    expect(matrix[0]?.slice(0, 4)).toEqual([
      'TANGGAL',
      'NOMOR_KARYAWAN',
      'NAMA_KARYAWAN',
      'KUANTITAS',
    ])
    expect(matrix[1]).toContain('PERINGATAN')
    expect(matrix[1]).toContain(
      'Siap diimpor. Peringatan: Sudah ada setoran tercatat.'
    )
    expect(matrix[2]).toContain('PERLU DIPERBAIKI')
    expect(matrix[2]).toContain('Karyawan tidak ditemukan.')
  })
})
