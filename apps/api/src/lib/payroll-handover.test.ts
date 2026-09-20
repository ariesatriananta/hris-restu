import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  buildPayrollHandoverWorkbook,
  composePayrollHandover,
  type HandoverDailyAmount,
  type HandoverEmployee,
  type HandoverRun,
} from './payroll-handover.js'

const run: HandoverRun = {
  uid: '11111111-1111-4111-8111-111111111111',
  periodCode: 'PAY-JEPARA-1',
  periodName: 'Payroll Jepara',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-03',
  siteName: 'Jepara',
  employeeType: 'BORONGAN',
  status: 'COMPLETED',
  runType: 'SIMULATION',
  runNumber: 2,
  isCurrent: true,
  periodStatus: 'CALCULATED',
}

const employees: HandoverEmployee[] = [
  {
    resultId: '1', employeeUid: 'employee-1', employeeNumber: 'PKDS-001',
    fullName: '=RISIKO', employeeType: 'BORONGAN', workGroupName: 'Linting',
    moduleUid: 'module-a', moduleName: 'Modul A', sectionUid: 'section-a', sectionName: 'Linting', pieceRateAmount: '300.00',
    additionalEarnings: '50.00', totalDeductions: '30.00', netPay: '320.00',
    bpjsEmployeeDeduction: '20.00',
  },
  {
    resultId: '2', employeeUid: 'employee-2', employeeNumber: 'PKDS-002',
    fullName: 'Budi', employeeType: 'BORONGAN', workGroupName: 'Packing',
    moduleUid: 'module-b', moduleName: 'Modul B', sectionUid: 'section-b', sectionName: 'Packing', pieceRateAmount: '500.00',
    additionalEarnings: '0.00', totalDeductions: '0.00', netPay: '500.00',
    bpjsEmployeeDeduction: null,
  },
]

const dailyAmounts: HandoverDailyAmount[] = [
  { resultId: '1', businessDate: '2026-09-01', amount: '100.00' },
  { resultId: '1', businessDate: '2026-09-02', amount: '200.00' },
  { resultId: '2', businessDate: '2026-09-01', amount: '500.00' },
]

describe('Payroll handover', () => {
  it('menolak hasil karyawan non-Borongan', () => {
    expect(() => composePayrollHandover({
      run, employees: [{ ...employees[0], employeeType: 'HARIAN' }], dailyAmounts,
    })).toThrow(/Borongan/)
  })

  it('menampilkan modul tanpa menebak pembayaran dari rekening', () => {
    const preview = composePayrollHandover({ run, employees, dailyAmounts })
    expect(preview.modules).toEqual([
      { uid: 'module-a', name: 'Modul A' },
      { uid: 'module-b', name: 'Modul B' },
    ])
    expect(preview.sections).toEqual([
      { uid: 'section-a', name: 'Linting' },
      { uid: 'section-b', name: 'Packing' },
    ])
    expect(preview.rows).toHaveLength(2)
    expect(preview.totals.netPay).toBe('820.00')
    expect(preview.selectedSectionUid).toBeNull()
    expect(preview.selectedModuleUid).toBeNull()
  })

  it('merekap per tanggal, tambahan, BPJS, dan neto sesuai snapshot', () => {
    const preview = composePayrollHandover({
      run, employees, dailyAmounts, moduleUid: 'module-a', sectionUid: 'section-a',
    })
    expect(preview.rows).toHaveLength(1)
    expect(preview.rows[0]).toMatchObject({
      dailyAmounts: {
        '2026-09-01': '100.00', '2026-09-02': '200.00', '2026-09-03': '0.00',
      },
      additionalEarnings: '50.00', bpjsEmployeeDeduction: '20.00',
      otherDeductions: '10.00', totalDeductions: '30.00', netPay: '320.00',
    })
    expect(preview.totals.netPay).toBe('320.00')
    expect(preview.modules).toEqual([{ uid: 'module-a', name: 'Modul A' }])
  })

  it('mendukung salah satu filter tetap Semua', () => {
    const bySection = composePayrollHandover({
      run, employees, dailyAmounts, sectionUid: 'section-a',
    })
    const byModule = composePayrollHandover({
      run, employees, dailyAmounts, moduleUid: 'module-b',
    })
    expect(bySection.rows.map((row) => row.employeeNumber)).toEqual(['PKDS-001'])
    expect(byModule.rows.map((row) => row.employeeNumber)).toEqual(['PKDS-002'])
  })

  it('menolak rincian yang tidak cocok dengan hasil run', () => {
    expect(() => composePayrollHandover({
      run,
      employees: [{ ...employees[0], netPay: '321.00' }],
      dailyAmounts,
      moduleUid: 'module-a', sectionUid: 'section-a',
    })).toThrow(/tidak cocok/)
  })

  it('menghasilkan Excel rapi dan mengamankan teks mirip formula', async () => {
    const preview = composePayrollHandover({
      run, employees, dailyAmounts, moduleUid: 'module-a', sectionUid: 'section-a',
    })
    const buffer = await buildPayrollHandoverWorkbook({
      preview, foremanName: 'Luluk', handoverDate: '2026-09-04',
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
    const sheet = workbook.getWorksheet('Serah Terima Upah')
    expect(sheet?.getRow(8).getCell(3).value).toBe("'=RISIKO")
    expect(sheet?.getRow(1).getCell(1).value).toContain('SKT LINTING')
    expect(sheet?.getRow(4).getCell(13).value).toBe('Roller Leader')
    expect(sheet?.getRow(7).values).toContain('Jenis Karyawan')
    expect(sheet?.getRow(7).values).toContain('Tambahan')
    expect(sheet?.getRow(7).values).toContain('Potongan Lain')
    expect(sheet?.getRow(7).values).not.toContain('Kelompok')
    expect(sheet?.getRow(8).getCell(12).value).toBe(320)
    expect(sheet?.getRow(9).getCell(12).value).toBe(320)
  })

  it('mengekspor seluruh pekerja tanpa filter dan tanpa mandor', async () => {
    const preview = composePayrollHandover({ run, employees, dailyAmounts })
    const buffer = await buildPayrollHandoverWorkbook({
      preview, handoverDate: '2026-09-04',
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0])
    const sheet = workbook.getWorksheet('Serah Terima Upah')
    expect(sheet?.getRow(1).getCell(1).value).toContain('SEMUA BAGIAN PRODUKSI')
    expect(sheet?.getRow(3).getCell(1).value).toBe('Mandor: -')
    expect(sheet?.getRow(7).values).toContain('Bagian Produksi')
    expect(sheet?.getRow(8).getCell(5).value).toBe('Linting')
    expect(sheet?.getRow(10).getCell(13).value).toBe(820)
  })
})
