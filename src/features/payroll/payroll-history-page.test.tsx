import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PayrollRunComparison } from './domain'
import {
  ComparisonPanel,
} from './payroll-history-page'
import {
  canExportPayrollPayment,
  emptyPayrollHistoryFilters,
  updatePayrollComparisonSelection,
} from './payroll-history-policy'

describe('Riwayat Payroll M4', () => {
  it('menjaga pilihan perbandingan tepat maksimal dua run', () => {
    expect(updatePayrollComparisonSelection([], 'run-1')).toEqual(['run-1'])
    expect(updatePayrollComparisonSelection(['run-1'], 'run-2')).toEqual([
      'run-1',
      'run-2',
    ])
    expect(
      updatePayrollComparisonSelection(['run-1', 'run-2'], 'run-3')
    ).toEqual(['run-2', 'run-3'])
    expect(updatePayrollComparisonSelection(['run-2', 'run-3'], 'run-2')).toEqual([
      'run-3',
    ])
  })

  it('hanya membuka export pembayaran untuk current FINAL yang sudah ditutup', () => {
    expect(
      canExportPayrollPayment({ runType: 'FINAL', isCurrent: true }, true, true)
    ).toBe(true)
    expect(
      canExportPayrollPayment(
        { runType: 'SIMULATION', isCurrent: true },
        true,
        true
      )
    ).toBe(false)
    expect(
      canExportPayrollPayment({ runType: 'FINAL', isCurrent: true }, false, true)
    ).toBe(false)
    expect(
      canExportPayrollPayment({ runType: 'FINAL', isCurrent: true }, true, false)
    ).toBe(false)
  })

  it('reset membersihkan seluruh filter URL riwayat', () => {
    expect(emptyPayrollHistoryFilters()).toEqual({
      query: undefined,
      siteCode: undefined,
      status: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      page: undefined,
    })
  })

  it('menampilkan delta run dan hanya karyawan yang berubah', () => {
    const run = {
      uid: crypto.randomUUID(),
      runNumber: 1,
      runType: 'SIMULATION' as const,
      status: 'COMPLETED' as const,
      employeeCount: 1,
      totalPieceRateAmount: '100.00',
      totalEarnings: '100.00',
      totalDeductions: '0.00',
      totalNetPay: '100.00',
      startedAt: '2026-08-28T08:00:00+07:00',
      finishedAt: '2026-08-28T08:01:00+07:00',
      isCurrent: false,
    }
    const amounts = {
      pieceRateAmount: '10.00',
      additionalEarnings: '0.00',
      grossEarnings: '10.00',
      totalDeductions: '0.00',
      netPay: '10.00',
    }
    const data: PayrollRunComparison = {
      period: {
        uid: crypto.randomUUID(),
        periodCode: 'PAY-01',
        periodName: 'Payroll Test',
        site: { code: 'JEPARA', name: 'Jepara' },
        periodStart: '2026-08-01',
        periodEnd: '2026-08-28',
      },
      baseRun: run,
      targetRun: { ...run, uid: crypto.randomUUID(), runNumber: 2, isCurrent: true },
      summary: {
        employeeCountDelta: 1,
        totalPieceRateAmountDelta: '10.00',
        totalEarningsDelta: '10.00',
        totalDeductionsDelta: '0.00',
        totalNetPayDelta: '10.00',
      },
      employees: [
        {
          employeeUid: crypto.randomUUID(),
          employeeNumber: 'PSLO-0001',
          fullName: 'BUDI BERUBAH',
          change: 'CHANGED',
          base: amounts,
          target: amounts,
          deltas: amounts,
        },
      ],
    }
    const html = renderToStaticMarkup(
      <ComparisonPanel data={data} pending={false} error={false} retry={() => undefined} />
    )

    expect(html).toContain('Run #1')
    expect(html).toContain('Run #2')
    expect(html).toContain('BUDI BERUBAH')
    expect(html).toContain('Nominal berubah')
  })
})
