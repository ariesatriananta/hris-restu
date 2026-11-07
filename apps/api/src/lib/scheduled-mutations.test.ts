import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: vi.fn(), execute: vi.fn(), beginTransaction: vi.fn(),
  commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
  productionBoundary: vi.fn(), audit: vi.fn(), poolQuery: vi.fn(),
}))
vi.mock('../db.js', () => ({ pool: {
  getConnection: vi.fn(async () => mocks), query: mocks.poolQuery,
} }))
vi.mock('./audit.js', () => ({ writeSystemAudit: mocks.audit }))
vi.mock('./contract-lifecycle.js', () => ({ businessDate: () => '2026-11-07' }))
vi.mock('./production-assignment-lifecycle.js', () => ({
  reconcileProductionAssignmentsAtEmploymentBoundary: mocks.productionBoundary,
}))

import { applyScheduledMutation, reconcileScheduledMutations } from './scheduled-mutations.js'

const schedule = () => ({
  id: 90, uid: 'scheduled-uid', status: 'SCHEDULED', employee_id: 11,
  employeeUid: 'employee-uid', employeeNumber: 'EMP011', fullName: 'Employee',
  site: 'SEMARANG', currentSiteId: 1, target_site_id: 2,
  base_history_id: 55, effectiveFrom: '2026-11-07', change_type: 'SITE_CHANGE',
  target_employee_type_id: 3, target_production_module_section_id: 7,
  target_employee_type: 'BORONGAN', current_employee_type: 'BORONGAN',
})

describe('scheduled employee site transfer shift lifecycle', () => {
  let row: ReturnType<typeof schedule>
  let conflicts: Array<{ id: number }>
  let contracts: Array<{ contract_number: string }>

  beforeEach(() => {
    vi.resetAllMocks()
    row = schedule()
    conflicts = []
    contracts = []
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('DATE_FORMAT(sm.effective_from')) return [[row]]
      if (sql.includes('s.is_active siteActive')) return [[{
        siteActive: 1, typeActive: 1, mappingActive: 1,
        moduleActive: 1, sectionActive: 1, mappingSiteId: row.target_site_id,
      }]]
      if (sql.includes('FROM employee_employment_histories')) return [[{ id: 55, employeeStatusId: 1 }]]
      if (sql.includes('FROM employee_shift_assignments')) return [conflicts]
      if (sql.includes('FROM employee_contracts')) return [contracts]
      if (sql.includes('FROM scheduled_employee_mutations sm')) return [[row]]
      throw new Error(`Unhandled test query: ${sql}`)
    })
    mocks.execute.mockResolvedValue([{ affectedRows: 1 }])
    mocks.productionBoundary.mockResolvedValue(0)
  })

  it('closes old-site shifts and applies transfer in the same transaction', async () => {
    expect(await applyScheduledMutation(row.uid)).toEqual({ status: 'APPLIED', uid: row.uid })
    const calls = mocks.execute.mock.calls
    const shiftIndex = calls.findIndex(([sql]) => sql.includes('UPDATE employee_shift_assignments'))
    const appliedIndex = calls.findIndex(([sql]) => sql.includes("status='APPLIED'"))
    expect(shiftIndex).toBeGreaterThanOrEqual(0)
    expect(shiftIndex).toBeLessThan(appliedIndex)
    expect(calls[shiftIndex][1]).toEqual(['2026-11-07', null, 11, 2, '2026-11-07', '2026-11-07'])
    expect(mocks.beginTransaction).toHaveBeenCalledOnce()
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.rollback).not.toHaveBeenCalled()
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it('uses the effective date even when cron runs late', async () => {
    row.effectiveFrom = '2026-11-02'
    await applyScheduledMutation(row.uid)
    expect(mocks.execute.mock.calls.find(([sql]) => sql.includes('UPDATE employee_shift_assignments'))?.[1])
      .toEqual(['2026-11-02', null, 11, 2, '2026-11-02', '2026-11-02'])
  })

  it('does not truncate shifts for a same-site mutation', async () => {
    row.target_site_id = row.currentSiteId
    await applyScheduledMutation(row.uid)
    expect(mocks.query.mock.calls.some(([sql]) => sql.includes('FROM employee_shift_assignments'))).toBe(false)
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('UPDATE employee_shift_assignments'))).toBe(false)
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('detects an actual site change regardless of the mutation label', async () => {
    row.change_type = 'OTHER'
    await applyScheduledMutation(row.uid)
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('UPDATE employee_shift_assignments'))).toBe(true)
  })

  it('rejects actual type changes with an open contract even for legacy OTHER schedules', async () => {
    row.change_type = 'OTHER'
    row.target_employee_type = 'TRAINING'
    contracts.push({ contract_number: 'CONTRACT-11' })
    const result = await applyScheduledMutation(row.uid)
    expect(result).toMatchObject({ status: 'FAILED', reason: expect.stringContaining('CONTRACT-11') })
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('UPDATE employee_employment_histories'))).toBe(false)
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('UPDATE employee_shift_assignments'))).toBe(false)
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes("status='APPLIED'"))).toBe(false)
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('rejects conflicting future old-site shifts before writing employment or APPLIED', async () => {
    conflicts.push({ id: 12 })
    await expect(applyScheduledMutation(row.uid)).rejects.toMatchObject({ status: 409 })
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.commit).not.toHaveBeenCalled()
    expect(mocks.release).toHaveBeenCalledOnce()
  })

  it('rolls back shift and employment writes if later production reconciliation fails', async () => {
    mocks.productionBoundary.mockRejectedValue(new Error('production failed'))
    await expect(applyScheduledMutation(row.uid)).rejects.toThrow('production failed')
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('UPDATE employee_shift_assignments'))).toBe(true)
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes("status='APPLIED'"))).toBe(false)
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.commit).not.toHaveBeenCalled()
  })

  it('skips future and already applied schedules without touching shifts', async () => {
    row.effectiveFrom = '2026-11-08'
    expect(await applyScheduledMutation(row.uid)).toEqual({ status: 'SKIPPED', uid: row.uid })
    row.effectiveFrom = '2026-11-07'
    row.status = 'APPLIED'
    expect(await applyScheduledMutation(row.uid)).toEqual({ status: 'SKIPPED', uid: row.uid })
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledTimes(2)
  })

  it('cron records failure after rolling back a conflicting site transfer', async () => {
    conflicts.push({ id: 12 })
    mocks.poolQuery.mockResolvedValue([[{ uid: row.uid }]])
    const result = await reconcileScheduledMutations()
    expect(result).toMatchObject({ applied: 0, failed: 1, skipped: 0 })
    expect(mocks.rollback).toHaveBeenCalledOnce()
    expect(mocks.commit).toHaveBeenCalledOnce()
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes("status='FAILED'"))).toBe(true)
    expect(mocks.execute.mock.calls.find(([sql]) => sql.includes("status='FAILED'"))?.[1][0])
      .toContain('Sesuaikan penugasan Shift tersebut terlebih dahulu.')
    expect(mocks.execute.mock.calls.some(([sql]) => sql.includes("status='APPLIED'"))).toBe(false)
  })

  it('does not expose unexpected database errors in the cron failure reason', async () => {
    mocks.poolQuery.mockResolvedValue([[{ uid: row.uid }]])
    mocks.productionBoundary.mockRejectedValue(new Error('private database connection details'))
    await reconcileScheduledMutations()
    const reason = mocks.execute.mock.calls.find(([sql]) => sql.includes("status='FAILED'"))?.[1][0]
    expect(reason).toContain('Periksa log eksekusi cron.')
    expect(reason).not.toContain('private database')
  })
})
