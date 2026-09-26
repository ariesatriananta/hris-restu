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
    expect(sheet.AN2.v).toBe('PERLU DIPERBAIKI')
    expect(sheet.AO2.v).toBe('SITE_CODE wajib diisi.')

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
