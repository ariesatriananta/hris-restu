import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildProductionValidationWorkbook,
  parseProductionWorkbook,
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
