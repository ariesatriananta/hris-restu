import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildEmployeeImportValidationWorkbook,
  employeeImportTemplateHeaders,
  parseEmployeeImportWorkbook,
} from './employee-import-workbook'

describe('employee import workbook', () => {
  it('membaca header bertanda wajib dan tetap menerima template lama', async () => {
    for (const headers of [
      employeeImportTemplateHeaders,
      employeeImportTemplateHeaders.map((header) => header.replace(/ \*$/, '')),
    ]) {
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        workbook,
        XLSX.utils.aoa_to_sheet([
          headers,
          headers.map((header) =>
            header.startsWith('FULL_NAME') ? 'SITI AMINAH' : ''
          ),
        ]),
        'Karyawan'
      )
      const buffer = XLSX.write(workbook, {
        bookType: 'xlsx',
        type: 'array',
      })
      const rows = await parseEmployeeImportWorkbook(
        new File([buffer], 'karyawan.xlsx')
      )
      expect(rows[0].fullName).toBe('SITI AMINAH')
    }
  })

  it('mengubah tanggal DD/MM/YYYY menjadi ISO sebelum validasi server', async () => {
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        employeeImportTemplateHeaders,
        employeeImportTemplateHeaders.map((header) => {
          if (header.startsWith('FULL_NAME')) return 'SITI AMINAH'
          if (header.startsWith('JOIN_DATE')) return '03/09/2026'
          if (header.startsWith('BIRTH_DATE')) return '15/01/1995'
          return ''
        }),
      ]),
      'Karyawan'
    )
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const rows = await parseEmployeeImportWorkbook(
      new File([buffer], 'karyawan.xlsx')
    )
    expect(rows[0].joinDate).toBe('2026-09-03')
    expect(rows[0].birthDate).toBe('1995-01-15')
  })

  it('membuat hasil validasi yang dapat diperbaiki dan diunggah ulang', async () => {
    const workbook = buildEmployeeImportValidationWorkbook(
      [{ fullName: 'SITI AMINAH', employeeType: 'BORONGAN' }],
      {
        rows: [
          {
            rowNumber: 2,
            valid: false,
            issues: ['SITE_CODE wajib diisi.'],
          },
        ],
      }
    )
    const sheet = workbook.Sheets.Karyawan
    expect(sheet.A1.v).toBe('FULL_NAME *')
    const statusColumn = XLSX.utils.encode_col(
      employeeImportTemplateHeaders.length + 1
    )
    const messageColumn = XLSX.utils.encode_col(
      employeeImportTemplateHeaders.length + 2
    )
    expect(sheet[`${statusColumn}2`].v).toBe('PERLU DIPERBAIKI')
    expect(sheet[`${messageColumn}2`].v).toBe('SITE_CODE wajib diisi.')

    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
    const rows = await parseEmployeeImportWorkbook(
      new File([buffer], 'hasil-validasi.xlsx')
    )
    expect(rows[0]).toMatchObject({
      fullName: 'SITI AMINAH',
      employeeType: 'BORONGAN',
    })
  })
})
