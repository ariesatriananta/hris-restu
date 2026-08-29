import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PayrollPayslipBundle } from './domain'
import { PayrollPrintDocument, Payslip } from './payroll-payslips-page'

function bundle(kind: 'SIMULATION' | 'OFFICIAL'): PayrollPayslipBundle {
  return {
    period: {
      uid: crypto.randomUUID(),
      periodCode: 'PAY-JPR-202608',
      periodName: 'Payroll Agustus',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-22',
      paymentDate: null,
      status: kind === 'OFFICIAL' ? 'CLOSED' : 'CALCULATED',
      site: { code: 'JEPARA', name: 'Jepara' },
    },
    run: {
      uid: crypto.randomUUID(),
      runNumber: 2,
      runType: kind === 'OFFICIAL' ? 'FINAL' : 'SIMULATION',
      status: 'COMPLETED',
      startedAt: '2026-08-23T08:00:00.000+07:00',
      finishedAt: '2026-08-23T08:01:00.000+07:00',
      employeeCount: 1,
      totalPieceRateAmount: '100000.00',
      totalEarnings: '100000.00',
      totalDeductions: '5000.00',
      totalNetPay: '95000.00',
      isCurrent: true,
    },
    document: {
      kind,
      watermark: kind === 'SIMULATION' ? 'SIMULASI' : null,
      official: kind === 'OFFICIAL',
      closedDoesNotMeanPaid: true,
      company: {
        companyName: 'PT Restu Sejati Inti Abadi',
        legalAddress: 'Jepara',
        phone: null,
        email: null,
        website: null,
        taxNumber: null,
        logoFileUid: null,
        logoUrl: null,
        snapshotSource: kind === 'OFFICIAL' ? 'CLOSE' : 'LIVE_PREVIEW',
      },
    },
    employees: [
      {
        employeeResultUid: crypto.randomUUID(),
        employeeNumber: 'PSLO-2608-0001',
        fullName: 'BUDI PEKERJA',
        employeeType: 'Pekerja Borongan',
        departmentName: 'Produksi',
        positionName: 'Operator Produksi',
        bank: { bankName: 'Bank Contoh', accountLast4: '1234' },
        totals: {
          pieceRateAmount: '100000.00',
          additionalEarnings: '0.00',
          grossEarnings: '100000.00',
          totalDeductions: '5000.00',
          netPay: '95000.00',
        },
        components: [
          {
            code: 'POTONGAN',
            name: 'Potongan lain',
            category: 'DEDUCTION',
            amount: '5000.00',
            notes: null,
          },
        ],
        productionSummary: [
          {
            jobName: 'Linting',
            unitName: 'PCS',
            quantity: '100.00',
            amount: '100000.00',
          },
        ],
        attendance: {
          scheduledDays: 10,
          presentDays: 9,
          absentDays: 1,
          leaveDays: 0,
          sickDays: 0,
          permissionDays: 0,
          holidayDays: 0,
          lateMinutes: 0,
          earlyLeaveMinutes: 0,
        },
      },
    ],
  }
}

describe('Slip Payroll M4', () => {
  it('menandai preview sebagai simulasi dan menjelaskan Attendance bukan pengali upah', () => {
    const data = bundle('SIMULATION')
    const html = renderToStaticMarkup(
      <Payslip employee={data.employees[0]} bundle={data} />
    )

    expect(html).toContain('SIMULASI')
    expect(html).toContain('bukan pengali otomatis upah borongan')
    expect(html).toContain('•••• 1234')
  })

  it('membuat layout cetak A4 berisi dua slot slip dan disclaimer pembayaran', () => {
    const data = bundle('OFFICIAL')
    data.employees.push({
      ...data.employees[0],
      employeeResultUid: crypto.randomUUID(),
      employeeNumber: 'PSLO-2608-0002',
      fullName: 'SITI PEKERJA',
    })
    const html = renderToStaticMarkup(<PayrollPrintDocument bundle={data} />)

    expect(html).toContain('grid-template-rows:1fr 1fr')
    expect(html).toContain('Status ditutup tidak menyatakan dana sudah dibayar')
    expect(html).not.toContain('SIMULASI')
  })

  it('menyajikan slip bulanan dengan prorata dan ringkasan potongan', () => {
    const data = bundle('SIMULATION')
    data.period.payrollBasis = 'TIME_BASED'
    data.period.payFrequency = 'MONTHLY'
    data.period.employeeType = 'BULANAN'
    data.employees[0].totals.basicSalaryAmount = '4000000.00'
    data.employees[0].monthly = {
      fullBasicSalary: '5000000.00',
      eligibleCalendarDays: 25,
      periodCalendarDays: 31,
      proratedBasicSalary: '4000000.00',
      scheduledWorkDays: 22,
      alphaDays: 2,
      permissionDays: 1,
      alphaDeduction: '454545.00',
      permissionDeduction: '227273.00',
    }

    const html = renderToStaticMarkup(
      <Payslip employee={data.employees[0]} bundle={data} />
    )

    expect(html).toContain('Bulanan')
    expect(html).toContain('Gaji pokok prorata')
    expect(html).toContain('25/31 hari kalender eligible')
    expect(html).not.toContain('Ringkasan hasil produksi')
  })

  it('menyajikan slip mingguan berbasis waktu dari snapshot hari dibayar', () => {
    const data = bundle('SIMULATION')
    data.period.payrollBasis = 'TIME_BASED'
    data.period.payFrequency = 'WEEKLY'
    data.period.employeeType = 'HARIAN'
    data.employees[0].totals.basicSalaryAmount = '750000.00'
    data.employees[0].weeklyTime = {
      payableDays: 5,
      offdayPresentDays: 1,
      baseAmount: '750000.00',
      rateBreakdown: [
        { dailyRate: '150000.00', payableDays: 5, amount: '750000.00' },
      ],
    }

    const html = renderToStaticMarkup(
      <Payslip employee={data.employees[0]} bundle={data} />
    )

    expect(html).toContain('Harian mingguan')
    expect(html).toContain('Upah hari hadir')
    expect(html).toContain('5 hari hadir dibayar')
    expect(html).toContain('Rp 150.000 × 5 hari = Rp 750.000')
    expect(html).toContain('1 hadir hari nonkerja tidak dibayar')
    expect(html).not.toContain('Ringkasan hasil produksi')
  })
})
