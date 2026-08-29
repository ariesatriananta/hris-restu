import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  calculatePayrollRun,
  createProcessingRun,
} from './payroll-simulation.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  poolExecute: vi.fn(),
  audit: vi.fn(),
  readiness: vi.fn(),
}))

const connection = {
  query: mocks.query,
  execute: mocks.execute,
  beginTransaction: mocks.beginTransaction,
  commit: mocks.commit,
  rollback: mocks.rollback,
  release: mocks.release,
}

vi.mock('../db.js', () => ({
  pool: {
    getConnection: vi.fn(async () => connection),
    execute: mocks.poolExecute,
  },
}))
vi.mock('./audit.js', () => ({ writeAudit: mocks.audit }))
vi.mock('./payroll-readiness.js', () => ({
  evaluatePayrollReadiness: mocks.readiness,
}))

const auth = {
  id: 7,
  uid: 'user',
  name: 'Payroll',
  email: null,
  roles: ['PAYROLL_FINANCE'],
  permissions: ['payroll.view', 'payroll.calculate'],
  siteAccess: ['JEPARA'],
}

const period = {
  id: 10,
  uid: 'period',
  siteId: 2,
  status: 'DRAFT',
  payrollBasis: 'PIECE_RATE',
  payFrequency: 'WEEKLY',
  employeeType: 'BORONGAN',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-07',
  siteCode: 'JEPARA',
}

const run = {
  id: 21,
  uid: 'run',
  periodId: 10,
  periodUid: 'period',
  siteId: 2,
  siteCode: 'JEPARA',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-07',
  payrollBasis: 'PIECE_RATE',
  payFrequency: 'WEEKLY',
  employeeType: 'BORONGAN',
  runNumber: 1,
  runType: 'SIMULATION',
  status: 'PROCESSING',
  startedAt: '2026-08-28T10:00:00.000+07:00',
  finishedAt: null,
  employeeCount: 0,
  totalPieceRateAmount: '0.00',
  totalBasicSalaryAmount: '0.00',
  totalEarnings: '0.00',
  totalDeductions: '0.00',
  totalNetPay: '0.00',
  errorMessage: null,
  currentRunId: null,
}

describe('Payroll simulation service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.beginTransaction.mockResolvedValue(undefined)
    mocks.commit.mockResolvedValue(undefined)
    mocks.rollback.mockResolvedValue(undefined)
    mocks.release.mockReturnValue(undefined)
    mocks.readiness.mockResolvedValue({
      status: 'READY',
      evaluatedAt: '2026-08-28T00:00:00Z',
    })
  })

  it('mengembalikan run lama untuk idempotency replay tanpa membuat duplikat', async () => {
    mocks.query.mockResolvedValueOnce([[period]]).mockResolvedValueOnce([[run]])
    const result = await createProcessingRun({
      auth,
      periodUid: 'period',
      idempotencyKey: 'same-key',
    })
    expect(result).toMatchObject({ replay: true, row: run })
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('menolak request paralel bila run PROCESSING sudah ada', async () => {
    mocks.query
      .mockResolvedValueOnce([[period]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ id: 99 }]])
    await expect(
      createProcessingRun({
        auth,
        periodUid: 'period',
        idempotencyKey: 'new-key',
      })
    ).rejects.toMatchObject({ status: 409 })
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })

  it('menolak kalkulasi bila readiness BLOCKED', async () => {
    mocks.readiness.mockResolvedValueOnce({
      status: 'BLOCKED',
      evaluatedAt: '2026-08-28T00:00:00Z',
      blockers: [{ message: 'Finalisasi Attendance belum lengkap.' }],
    })
    mocks.query
      .mockResolvedValueOnce([[period]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
    await expect(
      createProcessingRun({
        auth,
        periodUid: 'period',
        idempotencyKey: 'blocked-key',
      })
    ).rejects.toMatchObject({
      status: 409,
      message:
        'Readiness Payroll masih BLOCKED: Finalisasi Attendance belum lengkap. Selesaikan seluruh blocker sebelum menghitung ulang.',
    })
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('rollback snapshot lalu menandai run FAILED tanpa mengganti current run', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          id: 21,
          uid: 'run',
          status: 'PROCESSING',
          periodId: 10,
          siteId: 2,
          periodStatus: 'CALCULATED',
          payrollBasis: 'PIECE_RATE',
          payFrequency: 'WEEKLY',
          employeeType: 'BORONGAN',
          periodStart: '2026-08-01',
          periodEnd: '2026-08-07',
        },
      ],
    ])
    mocks.execute.mockRejectedValueOnce(new Error('snapshot gagal'))
    mocks.poolExecute.mockResolvedValueOnce([{}])
    await calculatePayrollRun(21, auth)
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(String(mocks.poolExecute.mock.calls[0]?.[0])).toContain(
      "status='FAILED'"
    )
    expect(
      mocks.execute.mock.calls.some((call) =>
        String(call[0]).includes('UPDATE payroll_periods')
      )
    ).toBe(false)
  })

  it('menghitung net sebagai DECIMAL SQL dan tidak menjepit nilai negatif ke nol', async () => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('FROM payroll_runs pr JOIN payroll_periods')) {
        return [
          [
            {
              id: 21,
              uid: 'run',
              status: 'PROCESSING',
              periodId: 10,
              siteId: 2,
              periodStatus: 'DRAFT',
              payrollBasis: 'PIECE_RATE',
              payFrequency: 'WEEKLY',
              employeeType: 'BORONGAN',
              periodStart: '2026-08-01',
              periodEnd: '2026-08-07',
            },
          ],
        ]
      }
      if (statement.includes('COUNT(*) total FROM payroll_employee_results'))
        return [[{ total: 1 }]]
      return [[]]
    })
    mocks.execute.mockResolvedValue([{}])
    await calculatePayrollRun(21, auth)
    const resultUpdate = mocks.execute.mock.calls.find((call) =>
      String(call[0]).includes('result.net_pay=')
    )
    expect(String(resultUpdate?.[0])).toContain(
      'COALESCE(component.deductions,0)'
    )
    expect(String(resultUpdate?.[0])).not.toContain('GREATEST')
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('menghitung hari terjadwal dan hadir hanya pada WORKDAY', async () => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('FROM payroll_runs pr JOIN payroll_periods')) {
        return [
          [
            {
              id: 21,
              uid: 'run',
              status: 'PROCESSING',
              periodId: 10,
              siteId: 2,
              periodStatus: 'DRAFT',
              payrollBasis: 'PIECE_RATE',
              payFrequency: 'WEEKLY',
              employeeType: 'BORONGAN',
              periodStart: '2026-08-01',
              periodEnd: '2026-08-07',
            },
          ],
        ]
      }
      if (statement.includes('COUNT(*) total FROM payroll_employee_results'))
        return [[{ total: 1 }]]
      return [[]]
    })
    mocks.execute.mockResolvedValue([{}])

    await calculatePayrollRun(21, auth)

    const attendanceInsert = mocks.execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO payroll_attendance_summaries')
    )
    expect(String(attendanceInsert?.[0])).toContain(
      "SUM(ar.calendar_day_type='WORKDAY')"
    )
    expect(String(attendanceInsert?.[0])).toContain(
      "ar.attendance_status='PRESENT'"
    )
    expect(String(attendanceInsert?.[0])).toContain(
      "AND ar.calendar_day_type='WORKDAY'"
    )
    expect(String(attendanceInsert?.[0])).toContain(
      "SUM(ar.calendar_day_type='NON_WORKDAY')"
    )
    expect(String(attendanceInsert?.[0])).not.toContain('COUNT(ar.id)')
  })

  it('memilih histori PIECE_RATE terbaru ketika tipe kerja berubah dalam periode', async () => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('FROM payroll_runs pr JOIN payroll_periods')) {
        return [
          [
            {
              id: 21,
              uid: 'run',
              status: 'PROCESSING',
              periodId: 10,
              siteId: 2,
              periodStatus: 'DRAFT',
              payrollBasis: 'PIECE_RATE',
              payFrequency: 'WEEKLY',
              employeeType: 'BORONGAN',
              periodStart: '2026-08-01',
              periodEnd: '2026-08-07',
            },
          ],
        ]
      }
      if (statement.includes('COUNT(*) total FROM payroll_employee_results'))
        return [[{ total: 1 }]]
      return [[]]
    })
    mocks.execute.mockResolvedValue([{}])

    await calculatePayrollRun(21, auth)

    const resultInsert = mocks.execute.mock.calls.find((call) =>
      String(call[0]).includes('INSERT INTO payroll_employee_results')
    )
    expect(String(resultInsert?.[0])).toContain(
      "historical_type.payroll_basis='PIECE_RATE'"
    )
    expect(String(resultInsert?.[0])).toContain(
      'ORDER BY historical.effective_from DESC,historical.id DESC'
    )
  })

  it('membuat run strategy TIME_BASED mingguan dengan calculation version M5B', async () => {
    const timePeriod = {
      ...period,
      payrollBasis: 'TIME_BASED',
      employeeType: 'HARIAN',
      policySnapshot: {
        employeeType: 'HARIAN',
        wageBasis: 'TIME_BASED',
        payFrequency: 'WEEKLY',
      },
    }
    mocks.query
      .mockResolvedValueOnce([[timePeriod]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[{ runNumber: 1 }]])
      .mockResolvedValueOnce([[
        { ...run, payrollBasis: 'TIME_BASED', employeeType: 'HARIAN' },
      ]])
    mocks.execute.mockResolvedValueOnce([{ insertId: 21 }])

    const result = await createProcessingRun({
      auth,
      periodUid: 'period',
      idempotencyKey: 'time-key',
    })

    expect(result.replay).toBe(false)
    const insert = mocks.execute.mock.calls[0]
    expect(String(insert?.[0])).toContain('calculation_version')
    expect(insert?.[1]).toContain('3.0-TIME-WEEKLY')
    expect(mocks.readiness).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({
        payrollBasis: 'TIME_BASED',
        employeeType: 'HARIAN',
        payFrequency: 'WEEKLY',
      })
    )
  })

  it('menolak komponen berulang pada simulasi TIME_BASED', async () => {
    mocks.query
      .mockResolvedValueOnce([[
        {
          ...period,
          payrollBasis: 'TIME_BASED',
          employeeType: 'TRAINING',
          policySnapshot: {},
        },
      ]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 1 }]])

    await expect(
      createProcessingRun({
        auth,
        periodUid: 'period',
        idempotencyKey: 'recurring-key',
      })
    ).rejects.toMatchObject({ status: 409 })
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('snapshot TIME_BASED membayar PRESENT, membulatkan total, dan memisahkan monitoring Training', async () => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('FROM payroll_runs pr JOIN payroll_periods')) {
        return [[{
          id: 21,
          uid: 'run',
          status: 'PROCESSING',
          periodId: 10,
          siteId: 2,
          periodStatus: 'DRAFT',
          payrollBasis: 'TIME_BASED',
          payFrequency: 'WEEKLY',
          employeeType: 'TRAINING',
          policySnapshot: {},
          periodStart: '2026-08-03',
          periodEnd: '2026-08-09',
        }]]
      }
      if (statement.includes('COUNT(*) total FROM payroll_employee_results'))
        return [[{ total: 1 }]]
      if (statement.includes('COUNT(DISTINCT component.id) total'))
        return [[{ total: 0 }]]
      return [[]]
    })
    mocks.execute.mockResolvedValue([{}])

    await calculatePayrollRun(21, auth)

    const statements = mocks.execute.mock.calls.map((call) => String(call[0]))
    expect(statements.some((sql) => sql.includes('INSERT INTO payroll_time_details'))).toBe(true)
    expect(statements.some((sql) => sql.includes("attendance.attendance_status='PRESENT'"))).toBe(true)
    expect(statements.some((sql) => sql.includes("COALESCE(attendance.attendance_status='PRESENT',0)"))).toBe(true)
    expect(statements.some((sql) => sql.includes("THEN 'OFFDAY_PRESENT'"))).toBe(true)
    expect(statements.some((sql) => sql.includes('ROUND(SUM(amount_snapshot),0)'))).toBe(true)
    expect(statements.some((sql) => sql.includes('INSERT INTO payroll_training_production_details'))).toBe(true)
    expect(statements.some((sql) => sql.includes("'RECURRING'"))).toBe(false)
    expect(statements.some((sql) => sql.includes('UPDATE production_transactions'))).toBe(false)
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('TIME_BASED mingguan tetap menyimpan pekerja tanpa PRESENT dan memperlihatkan neto negatif', async () => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('FROM payroll_runs pr JOIN payroll_periods')) {
        return [[{
          id: 21,
          uid: 'run',
          status: 'PROCESSING',
          periodId: 10,
          siteId: 2,
          periodStatus: 'DRAFT',
          payrollBasis: 'TIME_BASED',
          payFrequency: 'WEEKLY',
          employeeType: 'HARIAN',
          policySnapshot: {},
          periodStart: '2026-08-31',
          periodEnd: '2026-09-06',
        }]]
      }
      if (statement.includes('COUNT(*) total FROM payroll_employee_results'))
        return [[{ total: 1 }]]
      if (statement.includes('COUNT(DISTINCT component.id) total'))
        return [[{ total: 0 }]]
      return [[]]
    })
    mocks.execute.mockResolvedValue([{}])

    await calculatePayrollRun(21, auth)

    const statements = mocks.execute.mock.calls.map((call) => String(call[0]))
    const resultInsert = statements.find((sql) =>
      sql.includes('INSERT INTO payroll_employee_results')
    )
    const dailyInsert = statements.find((sql) =>
      sql.includes('INSERT INTO payroll_time_details')
    )
    const resultUpdate = statements.find((sql) =>
      sql.includes('UPDATE payroll_employee_results result')
    )
    expect(resultInsert).not.toContain("attendance_status='PRESENT'")
    expect(dailyInsert).toContain('SELECT CAST(? AS DATE) business_date')
    expect(dailyInsert).toContain('FROM dates WHERE business_date<?')
    expect(resultUpdate).toContain(
      'COALESCE(time_detail.baseAmount,0)+COALESCE(component.earnings,0)-COALESCE(component.deductions,0)'
    )
    expect(resultUpdate).not.toContain('GREATEST(0')
  })

  it('membuat run strategy TIME_BASED bulanan dengan calculation version M5C', async () => {
    const monthlyPeriod = {
      ...period,
      payrollBasis: 'TIME_BASED',
      payFrequency: 'MONTHLY',
      employeeType: 'BULANAN',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      policySnapshot: {
        employeeType: 'BULANAN',
        wageBasis: 'TIME_BASED',
        payFrequency: 'MONTHLY',
      },
    }
    mocks.query
      .mockResolvedValueOnce([[monthlyPeriod]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[{ runNumber: 1 }]])
      .mockResolvedValueOnce([[
        {
          ...run,
          payrollBasis: 'TIME_BASED',
          payFrequency: 'MONTHLY',
          employeeType: 'BULANAN',
        },
      ]])
    mocks.execute.mockResolvedValueOnce([{ insertId: 21 }])

    await createProcessingRun({
      auth,
      periodUid: 'period',
      idempotencyKey: 'monthly-key',
    })

    expect(mocks.execute.mock.calls[0]?.[1]).toContain('3.1-TIME-MONTHLY')
  })

  it('M5C memakai pembagi hari kerja seluruh periode dan menghormati override kalender', async () => {
    mocks.query.mockImplementation(async (sql: unknown) => {
      const statement = String(sql)
      if (statement.includes('FROM payroll_runs pr JOIN payroll_periods')) {
        return [[{
          id: 21,
          uid: 'run',
          status: 'PROCESSING',
          periodId: 10,
          siteId: 2,
          periodStatus: 'DRAFT',
          payrollBasis: 'TIME_BASED',
          payFrequency: 'MONTHLY',
          employeeType: 'BULANAN',
          policySnapshot: {},
          periodStart: '2026-08-01',
          periodEnd: '2026-08-31',
        }]]
      }
      if (statement.includes('COUNT(*) total FROM payroll_employee_results'))
        return [[{ total: 1 }]]
      if (statement.includes('COUNT(DISTINCT component.id) total'))
        return [[{ total: 0 }]]
      return [[]]
    })
    mocks.execute.mockResolvedValue([{}])

    await calculatePayrollRun(21, auth)

    const statements = mocks.execute.mock.calls.map((call) => String(call[0]))
    const daily = statements.find((sql) =>
      sql.includes('INSERT INTO payroll_monthly_daily_details')
    )
    const summary = statements.find((sql) =>
      sql.includes('INSERT INTO payroll_monthly_summaries')
    )
    expect(daily).toContain("calendar_reason_type='WORKDAY_OVERRIDE'")
    expect(summary).toContain('CROSS JOIN dates')
    expect(summary).toContain("override_rule.rule_type='WORKDAY_OVERRIDE'")
    expect(summary).toContain(
      "holiday_rule.rule_type IN ('COLLECTIVE_LEAVE','SITE_HOLIDAY')"
    )
    expect(summary).toContain(
      'MAX(detail.full_basic_salary_snapshot)*COUNT(*)/(DATEDIFF(?,?)+1)'
    )
    expect(summary).toContain(
      'MAX(detail.full_basic_salary_snapshot)/MAX(schedule.scheduled_work_days)'
    )
    expect(statements.some((sql) =>
      sql.includes("component_type.code='MONTHLY_ALPHA_DEDUCTION'")
    )).toBe(true)
    expect(statements.some((sql) => sql.includes("'RECURRING'"))).toBe(false)
    expect(mocks.commit).toHaveBeenCalledOnce()
  })
})
