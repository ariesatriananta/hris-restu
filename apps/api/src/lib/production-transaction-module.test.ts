import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import type { AuthContext } from '../middleware/authenticate.js'
import {
  assertQcDailyGroupAccess,
  assertQcEmployeeModule,
  assertQcTransactionAccess,
  qcModulePredicate,
  qcTransactionPredicate,
  snapshotTransactionModule,
  snapshotTransactionModules,
} from './production-transaction-module.js'

const auth: AuthContext = {
  id: 1,
  uid: 'qc',
  name: 'QC',
  email: null,
  roles: ['QC'],
  permissions: ['production.view', 'production.scan', 'production.correct'],
  siteAccess: ['KLATEN'],
  productionModuleAccess: ['module-one', 'module-two'],
}
const row = (value: object) => value as RowDataPacket
const database = () => {
  const query = vi.fn().mockResolvedValue([[]]),
    execute = vi.fn().mockResolvedValue([{ affectedRows: 1 }])
  return {
    query,
    execute,
    conn: { query, execute } as unknown as PoolConnection,
  }
}
describe('Production transaction module authorization', () => {
  it('accepts only employee historical module explicitly assigned to QC', () => {
    expect(() =>
      assertQcEmployeeModule(auth, row({ productionModuleUid: 'module-one' }))
    ).not.toThrow()
    expect(() =>
      assertQcEmployeeModule(auth, row({ productionModuleUid: 'another' }))
    ).toThrow(expect.objectContaining({ status: 403 }))
    expect(() =>
      assertQcEmployeeModule(auth, row({ productionModuleUid: null }))
    ).toThrow(expect.objectContaining({ status: 403 }))
    expect(() =>
      assertQcEmployeeModule(
        { ...auth, productionModuleAccess: [] },
        row({ productionModuleUid: 'module-one' })
      )
    ).toThrow()
  })
  it('binds public module UID parameters to frozen ID expressions and denies empty access', () => {
    const scope = qcModulePredicate(auth, 'pt.production_module_id')
    expect(scope.sql).toContain('permitted_module.id=pt.production_module_id')
    expect(scope.sql).toContain('IN (?,?)')
    expect(scope.params).toEqual(['module-one', 'module-two'])
    expect(
      qcModulePredicate(
        { ...auth, productionModuleAccess: undefined },
        'pt.production_module_id'
      )
    ).toEqual({ sql: '1=0', params: [] })
  })
  it('guards own transaction, pair peers and revision peers with matching placeholder count', () => {
    const scope = qcTransactionPredicate(auth, 'source')
    expect(scope.sql).toContain('source.production_module_id')
    expect(scope.sql).toContain('FROM production_transaction_pairs qc_pair')
    expect(scope.sql).toContain(
      'source.id IN (qc_pair.linting_transaction_id,qc_pair.batil_transaction_id)'
    )
    expect(scope.sql).toContain(
      'FROM production_transaction_revisions qc_revision'
    )
    expect(scope.sql).toContain('qc_peer.production_module_id')
    expect(scope.params).toEqual([
      'module-one',
      'module-two',
      'module-one',
      'module-two',
      'module-one',
      'module-two',
    ])
    expect(scope.sql.match(/\?/g)).toHaveLength(scope.params.length)
  })
  it('does not expose unauthorized or missing transaction IDs including peer conflicts', async () => {
    const { conn, query } = database()
    await expect(
      assertQcTransactionAccess(conn, 4, auth)
    ).rejects.toMatchObject({ status: 404 })
    expect(query.mock.calls[0][0]).toContain('production_transaction_pairs')
    expect(query.mock.calls[0][1]).toEqual([
      4,
      'module-one',
      'module-two',
      'module-one',
      'module-two',
      'module-one',
      'module-two',
    ])
    query.mockResolvedValueOnce([[{ id: 4 }]])
    await expect(
      assertQcTransactionAccess(conn, 4, auth)
    ).resolves.toBeUndefined()
  })
  it('blocks progressive daily repricing when another posted row is outside permitted modules', async () => {
    const { conn, query } = database()
    const transaction = row({
      employee_id: 12,
      site_id: 3,
      production_job_id: 7,
      businessDateKey: '2026-11-09',
    })
    query.mockResolvedValueOnce([[{ id: 90 }]])
    await expect(
      assertQcDailyGroupAccess(conn, transaction, auth)
    ).rejects.toMatchObject({ status: 403 })
    expect(query.mock.calls[0][0]).toContain("pt.status='POSTED'")
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE')
    expect(query.mock.calls[0][1]).toEqual([
      12,
      3,
      7,
      '2026-11-09',
      ...qcTransactionPredicate(auth).params,
    ])
    await expect(
      assertQcDailyGroupAccess(conn, transaction, auth)
    ).resolves.toBeUndefined()
  })
  it.each([['PRODUCTION_ADMIN'], ['SUPER_ADMIN'], ['SUPER_ADMIN', 'QC']])(
    'preserves existing access for %s',
    async (...roles) => {
      const existing = { ...auth, roles }
      const { conn, query } = database()
      expect(qcTransactionPredicate(existing)).toEqual({
        sql: '1=1',
        params: [],
      })
      expect(() =>
        assertQcEmployeeModule(existing, row({ productionModuleUid: null }))
      ).not.toThrow()
      await assertQcTransactionAccess(conn, 9, existing)
      await assertQcDailyGroupAccess(conn, row({}), existing)
      expect(query).not.toHaveBeenCalled()
    }
  )
  it('freezes explicit historical module identity rather than consulting current placement', async () => {
    const { conn, execute } = database()
    await snapshotTransactionModule(conn, 14, 8)
    expect(execute).toHaveBeenCalledOnce()
    expect(execute.mock.calls[0][1]).toEqual([8, 14])
    expect(execute.mock.calls[0][0]).not.toContain(
      'employee_employment_histories'
    )
  })
  it('preserves an explicitly missing original module during corrections', async () => {
    const { conn, execute } = database()
    await snapshotTransactionModule(conn, 14, null)
    expect(execute.mock.calls[0][1]).toEqual([null, 14])
    expect(execute.mock.calls[0][0]).not.toContain(
      'employee_employment_histories'
    )
  })
  it('infers only deterministic active historical placement matching transaction site/date', async () => {
    const { conn, execute } = database()
    await snapshotTransactionModule(conn, 14)
    const sql = String(execute.mock.calls[0][0])
    expect(sql).toContain('module_history.site_id=tx.site_id')
    expect(sql).toContain('module_history.effective_from<=tx.business_date')
    expect(sql).toContain('module_history.effective_to>=tx.business_date')
    expect(sql).toContain('NOT EXISTS')
    expect(sql).toContain("module_history.status='ACTIVE'")
    expect(sql).not.toContain('current_production_module_section_id')
    expect(execute.mock.calls[0][1]).toEqual([14])
  })
  it('freezes an import chunk with one bounded query and skips empty chunks', async () => {
    const { conn, execute } = database()
    await snapshotTransactionModules(conn, [])
    expect(execute).not.toHaveBeenCalled()
    await snapshotTransactionModules(conn, [14, 15, 16])
    expect(execute).toHaveBeenCalledOnce()
    expect(execute.mock.calls[0][0]).toContain('tx.id IN (?,?,?)')
    expect(execute.mock.calls[0][1]).toEqual([14, 15, 16])
  })
})
