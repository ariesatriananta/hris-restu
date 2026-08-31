import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  buildContractReportWorkbook,
  buildEmployeeReportWorkbook,
} from './report-workbooks.js'

describe('report workbooks', () => {
  it('mengamankan teks laporan karyawan dari formula spreadsheet', async () => {
    const buffer = await buildEmployeeReportWorkbook({
      title: 'Posisi Karyawan',
      periodLabel: '2026-08-31',
      generatedAt: '2026-08-31T10:00:00+07:00',
      generatedBy: 'HR',
      filters: {},
      rows: [
        {
          employeeNumber: '=HYPERLINK("x")',
          employeeName: '+CMD',
          siteName: 'Site Jepara',
          employeeTypeName: 'Borongan',
          employeeStatusName: 'Aktif',
          departmentName: null,
          positionName: null,
          productionModuleName: null,
          productionSectionName: null,
          workGroupName: null,
          effectiveFrom: '2026-08-01',
          effectiveTo: null,
          historyStatus: 'VALID',
        },
      ],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer)
    const sheet = workbook.getWorksheet('Posisi Karyawan')!
    expect(sheet.getCell('B2').value).toBe("'=HYPERLINK(\"x\")")
    expect(sheet.getCell('C2').value).toBe("'+CMD")
  })

  it('menjelaskan sumber site dan status kontrak yang belum terselesaikan', async () => {
    const buffer = await buildContractReportWorkbook({
      title: 'Kontrak',
      periodLabel: '2026-08-01 s.d. 2026-08-31',
      generatedAt: '2026-08-31T10:00:00+07:00',
      generatedBy: 'HR',
      filters: {},
      rows: [
        {
          contractNumber: 'PKWT/001',
          employeeNumber: 'PKDS-001',
          employeeName: 'Siti',
          siteName: null,
          siteResolution: 'UNRESOLVED',
          historyStatus: 'MISSING',
          employeeTypeName: null,
          contractTypeName: 'PKWT',
          startDate: '2026-01-01',
          endDate: '2026-08-31',
          contractStatus: 'UNKNOWN',
          statusResolution: 'UNRESOLVED',
          expiryState: 'UPCOMING',
          latestLifecycleDate: null,
          latestLifecycleSource: null,
        },
      ],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer)
    const sheet = workbook.getWorksheet('Kontrak Berakhir')!
    expect(sheet.getCell('F2').value).toBe('UNRESOLVED')
    expect(sheet.getCell('G2').value).toBe('Tidak ditemukan')
    expect(sheet.getCell('M2').value).toBe('Riwayat status tidak ditemukan')
  })
})
