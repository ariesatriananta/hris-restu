import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildPayrollWorkbook, safeSpreadsheetText } from './payroll-output.js'

describe('Payroll output', () => {
  it('mencegah formula injection spreadsheet', () => {
    expect(safeSpreadsheetText('=HYPERLINK("x")')).toBe("'=HYPERLINK(\"x\")")
    expect(safeSpreadsheetText('+cmd')).toBe("'+cmd")
    expect(safeSpreadsheetText('AAN')).toBe('AAN')
  })

  it('menghasilkan workbook summary', async () => {
    const buffer = await buildPayrollWorkbook({
      type: 'SUMMARY', periodCode: 'PAY-1', periodName: 'Payroll 1',siteName: 'Jepara',
      periodStart: '2026-08-01',periodEnd: '2026-08-07',runNumber:2,
      runType:'SIMULATION',runStatus:'COMPLETED',payrollBasis:'PIECE_RATE',
      employeeType:'BORONGAN',payFrequency:'WEEKLY',rows: [{
        employeeNumber: 'PKDS-1',fullName: '=RISK',employeeType: 'BORONGAN',
        departmentName: null,positionName: null,bankName: 'BCA',bankAccountNumber: '00123',
        bankAccountName: 'AAN',pieceRateAmount: '100.00',basicSalaryAmount:'0.00',additionalEarnings: '0.00',
        grossEarnings: '100.00',totalDeductions: '0.00',netPay: '100.00',
      }],
    })
    expect(buffer.subarray(0, 2).toString()).toBe('PK')
  })

  it('menandai kolom rekening kosong dengan strip pada Daftar Pembayaran', async () => {
    const buffer = await buildPayrollWorkbook({
      type: 'PAYMENT', periodCode: 'PAY-1', periodName: 'Payroll 1', siteName: 'Jepara',
      periodStart: '2026-08-01', periodEnd: '2026-08-07', runNumber: 2,
      runType: 'FINAL', runStatus: 'COMPLETED', payrollBasis: 'PIECE_RATE',
      employeeType: 'BORONGAN', payFrequency: 'WEEKLY', rows: [{
        employeeNumber: 'PKDS-1', fullName: 'AAN', employeeType: 'BORONGAN',
        departmentName: null, positionName: null, bankName: null,
        bankAccountNumber: '  ', bankAccountName: null, pieceRateAmount: '100.00',
        basicSalaryAmount: '0.00', additionalEarnings: '0.00',
        grossEarnings: '100.00', totalDeductions: '0.00', netPay: '100.00',
      }],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
    )
    const row = workbook.getWorksheet('Daftar Pembayaran')?.getRow(2)
    expect([row?.getCell(3).value, row?.getCell(4).value, row?.getCell(5).value])
      .toEqual(['-', '-', '-'])
    expect(row?.getCell(6).value).toBe(100)
  })
})
