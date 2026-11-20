import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  audit: vi.fn(),
}))
vi.mock('../db.js', () => ({
  pool: { getConnection: vi.fn(async () => mocks) },
}))
vi.mock('./audit.js', () => ({
  writeAudit: mocks.audit,
  writeSystemAudit: mocks.audit,
}))

import { closeExpiredContractEmployeeStatus } from './contract-lifecycle.js'
import type { AuthContext } from '../middleware/authenticate.js'

const auth = {
  id: 1,
  roles: ['HR'],
  siteAccess: ['KLATEN'],
} as AuthContext

describe('close Expired employee status date boundary and lifecycle', () => {
  let contract: Record<string, unknown>
  let newerStatus: string | undefined
  let blocker: 'scheduled' | 'active-contract' | 'later-history' | undefined

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-20T05:00:00.000Z'))
    contract = {
      id: 10,
      uid: 'contract-uid',
      employee_id: 20,
      // DATE columns from mysql2 are Date instances unless projected as text.
      start_date: new Date('2026-11-01T00:00:00+07:00'),
      end_date: new Date('2026-11-19T00:00:00+07:00'),
      status: 'EXPIRED',
      employeeUid: 'employee-uid',
      siteId: 2,
      site: 'KLATEN',
      employeeStatus: 'ACTIVE',
    }
    newerStatus = undefined
    blocker = undefined
    mocks.execute.mockResolvedValue([{ affectedRows: 1 }])
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM employee_contracts c')) {
        // Emulate SQL DATE_FORMAT output, leaving raw driver dates otherwise.
        return [[{
          ...contract,
          start_date: sql.includes("DATE_FORMAT(c.start_date,'%Y-%m-%d')")
            ? '2026-11-01'
            : contract.start_date,
          end_date: contract.end_date && sql.includes("DATE_FORMAT(c.end_date,'%Y-%m-%d')")
            ? '2026-11-19'
            : contract.end_date,
        }]]
      }
      if (sql.includes('FROM scheduled_employee_status_changes'))
        return [blocker === 'scheduled' ? [{ id: 99 }] : []]
      if (sql.includes('FROM employee_contracts') && sql.includes('start_date>?'))
        return [newerStatus && !(newerStatus === 'CANCELLED' && sql.includes("status<>'CANCELLED'"))
          ? [{ id: 11 }] : []]
      if (sql.includes('FROM employee_contracts') && sql.includes("status='ACTIVE'"))
        return [blocker === 'active-contract' ? [{ id: 12 }] : []]
      if (sql.includes('FROM employees e'))
        return [[{ id: 20, currentStatus: 'ACTIVE', current_site_id: 2 }]]
      if (sql.includes('FROM employee_statuses')) return [[{ id: 3 }]]
      if (sql.includes('FROM employee_employment_histories') && sql.includes('effective_from>?'))
        return [blocker === 'later-history' ? [{ id: 31 }] : []]
      if (sql.includes('FROM employee_employment_histories') && sql.includes('effective_to IS NULL'))
        return [[{ id: 30, effectiveFrom: '2026-11-01' }]]
      throw new Error(`Unexpected query: ${sql}`)
    })
  })

  afterEach(() => vi.useRealTimers())

  const close = (effectiveDate?: string, reason = 'Kontrak tidak dilanjutkan') =>
    closeExpiredContractEmployeeStatus(
      'contract-uid', 'close_expired_terminate', { effectiveDate, reason }, auth
    )

  it.each(['2026-11-01', '2026-11-18', '2026-11-21'])(
    'rejects effective date %s outside the end-date/today window before any write', async (date) => {
      await expect(close(date)).rejects.toMatchObject({ status: 422 })
      expect(mocks.execute).not.toHaveBeenCalled()
      expect(mocks.audit).not.toHaveBeenCalled()
      expect(mocks.commit).not.toHaveBeenCalled()
      expect(mocks.rollback).toHaveBeenCalledOnce()
      expect(mocks.release).toHaveBeenCalledOnce()
    }
  )

  it.each(['2026-11-19', '2026-11-20', undefined])(
    'allows the end date or later through today: %s', async (date) => {
      await expect(close(date)).resolves.toMatchObject({ status: 'EXPIRED', employeeStatus: 'INACTIVE' })
      expect(mocks.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE employees SET employee_status_id='),
        [3, null, null, 1, 20]
      )
      expect(mocks.commit).toHaveBeenCalledOnce()
      expect(mocks.rollback).not.toHaveBeenCalled()
      expect(mocks.release).toHaveBeenCalledOnce()
    }
  )

  it('resigns with the chosen effective date and trimmed reason', async () => {
    await closeExpiredContractEmployeeStatus('contract-uid', 'close_expired_resign', {
      effectiveDate: '2026-11-19', reason: '  Tidak lanjut  ',
    }, auth)
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE employees SET employee_status_id='),
      [3, '2026-11-19', 'Tidak lanjut', 1, 20]
    )
  })

  it('requires a nonblank reason', async () => {
    await expect(close('2026-11-19', '   ')).rejects.toMatchObject({ status: 422 })
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it.each(['DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'TERMINATED'])(
    'blocks a newer noncancelled %s contract', async (status) => {
      newerStatus = status
      await expect(close('2026-11-19')).rejects.toMatchObject({ status: 409 })
      expect(mocks.execute).not.toHaveBeenCalled()
    }
  )

  it('ignores a newer cancelled renewal and uses ISO start dates in the latest check', async () => {
    newerStatus = 'CANCELLED'
    await close('2026-11-19')
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('start_date>?'), [20, '2026-11-01', '2026-11-01', 10]
    )
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it.each(['scheduled', 'active-contract', 'later-history'] as const)(
    'preserves the %s blocker and rolls back', async (value) => {
      blocker = value
      await expect(close('2026-11-19')).rejects.toMatchObject({ status: value === 'later-history' ? 422 : 409 })
      expect(mocks.execute).not.toHaveBeenCalled()
      expect(mocks.rollback).toHaveBeenCalledOnce()
      expect(mocks.commit).not.toHaveBeenCalled()
    }
  )

  it.each([
    [{ site: 'OTHER' }, 403],
    [{ status: 'ACTIVE' }, 422],
    [{ end_date: null }, 422],
    [{ employeeStatus: 'INACTIVE' }, 409],
  ])('retains site/status guards for %j', async (patch, status) => {
    Object.assign(contract, patch)
    await expect(close('2026-11-19')).rejects.toMatchObject({ status })
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('rolls back employee history/status writes if audit fails', async () => {
    mocks.audit.mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(close('2026-11-19')).rejects.toThrow('audit unavailable')
    expect(mocks.execute).toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.release).toHaveBeenCalledOnce()
  })
})
