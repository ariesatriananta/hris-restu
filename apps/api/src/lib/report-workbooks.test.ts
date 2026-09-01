import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  buildAttendanceClassificationReportWorkbook,
  buildAttendanceCorrectionReportWorkbook,
  buildContractReportWorkbook,
  buildEmployeeReportWorkbook,
  buildMutationReportWorkbook,
  buildPayrollFinalReportWorkbook,
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

  it('mengamankan teks laporan mutasi dari formula spreadsheet', async () => {
    const buffer = await buildMutationReportWorkbook({
      title: 'Mutasi Karyawan',
      periodLabel: '2026-08-01 s.d. 2026-08-31',
      generatedAt: '2026-08-31T10:00:00+07:00',
      generatedBy: 'HR',
      filters: {},
      rows: [
        {
          employeeNumber: '=CMD()',
          employeeName: '+Siti',
          effectiveDate: '2026-08-08',
          changeType: 'TRANSFER',
          mutationStatus: 'APPLIED',
          sourceSiteName: 'Site Klaten',
          targetSiteName: 'Site Jepara',
          sourceEmployeeTypeName: 'Training',
          targetEmployeeTypeName: 'Borongan',
          sourcePositionName: null,
          targetPositionName: null,
          sourceDepartmentName: null,
          targetDepartmentName: null,
          sourceWorkGroupName: null,
          targetWorkGroupName: null,
          sourceProductionModuleName: null,
          targetProductionModuleName: null,
          sourceProductionSectionName: null,
          targetProductionSectionName: null,
          referenceNumber: null,
          reason: null,
          notes: null,
          failureReason: null,
        },
      ],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer)
    const sheet = workbook.getWorksheet('Riwayat Mutasi')!
    expect(sheet.getCell('B2').value).toBe("'=CMD()")
    expect(sheet.getCell('C2').value).toBe("'+Siti")
    expect(sheet.getCell('E2').value).toBe('Pindah site')
    expect(sheet.getCell('F2').value).toBe('Sudah berlaku')
  })

  it('menyamarkan rekening pada Laporan Payroll Final', async () => {
    const buffer = await buildPayrollFinalReportWorkbook({
      title: 'Payroll Final',
      periodLabel: '2026-08-01 s.d. 2026-08-31',
      generatedAt: '2026-09-01T10:00:00+07:00',
      generatedBy: 'Payroll',
      filters: {},
      rows: [
        {
          periodCode: 'PAY-202608',
          periodName: 'Payroll Agustus',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
          paymentDate: '2026-09-01',
          siteName: 'Site Jepara',
          employeeNumber: '=CMD()',
          employeeName: '+Siti',
          employeeType: 'BULANAN',
          payrollBasis: 'TIME_BASED',
          payFrequency: 'MONTHLY',
          departmentName: null,
          positionName: null,
          workGroupName: null,
          attendanceDays: 20,
          productionTransactionCount: 0,
          bankName: 'Bank Demo',
          accountLast4: '6789',
          pieceRateAmount: '0.00',
          basicSalaryAmount: '5000000.00',
          additionalEarnings: '250000.00',
          grossEarnings: '5250000.00',
          totalDeductions: '100000.00',
          netPay: '5150000.00',
        },
      ],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer)
    const sheet = workbook.getWorksheet('Payroll Final')!
    expect(sheet.getCell('H2').value).toBe("'=CMD()")
    expect(sheet.getCell('I2').value).toBe("'+Siti")
    expect(sheet.getCell('S2').value).toBe('****6789')
    expect(JSON.stringify(sheet.getRow(2).values)).not.toContain('123456789')
  })

  it('mengekspor alur klasifikasi tanpa alasan atau lampiran', async () => {
    const buffer = await buildAttendanceClassificationReportWorkbook({
      title: 'Cuti, Sakit & Izin',
      periodLabel: '2026-08-01 s.d. 2026-08-31',
      generatedAt: '2026-09-01T10:00:00+07:00',
      generatedBy: 'HR',
      filters: {},
      rows: [
        {
          employeeNumber: '=CMD()',
          employeeName: '+Siti',
          siteName: 'Site Jepara',
          employeeTypeName: 'Borongan',
          productionModuleName: null,
          productionSectionName: null,
          classificationType: 'SICK',
          startDate: '2026-08-10',
          endDate: '2026-08-11',
          calendarDays: 2,
          approvalStatus: 'APPROVED',
          requestedAt: '2026-08-09T09:00:00.000+07:00',
          requestedByName: 'HR',
          reviewedAt: '2026-08-09T10:00:00.000+07:00',
          reviewedByName: 'HR',
          detailCount: 2,
          appliedCount: 2,
          skippedCount: 0,
          reversedCount: 0,
          historyStatus: 'VALID',
        },
      ],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer)
    const sheet = workbook.getWorksheet('Cuti Sakit Izin')!
    expect(sheet.getCell('B2').value).toBe("'=CMD()")
    expect(sheet.getCell('C2').value).toBe("'+Siti")
    expect(sheet.getCell('H2').value).toBe('Sakit')
    expect(sheet.getCell('L2').value).toBe('Disetujui')
    expect(sheet.getRow(1).values).not.toContain('Alasan')
    expect(sheet.getRow(1).values).not.toContain('Lampiran')
  })

  it('mengekspor perubahan koreksi dengan teks aman tanpa alasan', async () => {
    const buffer = await buildAttendanceCorrectionReportWorkbook({
      title: 'Koreksi Attendance',
      periodLabel: '2026-08-01 s.d. 2026-08-31',
      generatedAt: '2026-09-01T10:00:00+07:00',
      generatedBy: 'HR',
      filters: {},
      rows: [
        {
          employeeNumber: '=CMD()',
          employeeName: '+Siti',
          siteName: 'Site Jepara',
          employeeTypeName: 'Borongan',
          productionModuleName: null,
          productionSectionName: null,
          businessDate: '2026-08-10',
          correctionType: 'CLOCK_IN',
          oldClockInAt: null,
          newClockInAt: '2026-08-10T06:00:00.000+07:00',
          oldClockOutAt: '2026-08-10T15:00:00.000+07:00',
          newClockOutAt: null,
          oldStatus: 'ABSENT',
          newStatus: 'PRESENT',
          approvalStatus: 'APPROVED',
          requestedAt: '2026-08-11T09:00:00.000+07:00',
          requestedByName: '=HR',
          reviewedAt: '2026-08-11T10:00:00.000+07:00',
          reviewedByName: '+Supervisor',
          appliedAt: '2026-08-11T10:00:00.000+07:00',
          historyStatus: 'VALID',
        },
      ],
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer)
    const sheet = workbook.getWorksheet('Koreksi Attendance')!
    expect(sheet.getCell('B2').value).toBe("'=CMD()")
    expect(sheet.getCell('C2').value).toBe("'+Siti")
    expect(sheet.getCell('I2').value).toBe('Jam masuk')
    expect(sheet.getCell('N2').value).toBe('Alpha')
    expect(sheet.getCell('O2').value).toBe('Hadir')
    expect(sheet.getCell('P2').value).toBe('Disetujui')
    expect(sheet.getCell('R2').value).toBe("'=HR")
    expect(sheet.getCell('T2').value).toBe("'+Supervisor")
    expect(sheet.getRow(1).values).not.toContain('Alasan')
    expect(sheet.getRow(1).values).not.toContain('Catatan Pemeriksaan')
  })
})
