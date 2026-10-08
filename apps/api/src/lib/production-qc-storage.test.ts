import type { PoolConnection } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { productionQcInput } from './production-qc.js'
import { productionHistoricalPostInput, productionHistoricalPreviewInput, productionTerminalPostInput } from './production-transaction-policy.js'
import {
  assertProductionQcReplay,
  loadProductionQcOptions,
  lastProductionDeviceBrand,
  resolveProductionQc,
  saveProductionQc,
} from './production-qc-storage.js'

const brandUid = '11111111-1111-4111-8111-111111111111'
const defectUid = '22222222-2222-4222-8222-222222222222'
const secondDefectUid = '33333333-3333-4333-8333-333333333333'
const brand = { id: 21, uid: brandUid, code: 'BR-21', name: 'Brand A', siteId: 5, site_id: 5, isActive: 1, is_active: 1, sortOrder: 2 }
const defect = { id: 31, uid: defectUid, code: 'DF-31', name: 'Cowong', isActive: 1, is_active: 1, sortOrder: 3, sort_order: 3 }
const secondDefect = { ...defect, id: 32, uid: secondDefectUid, code: 'DF-32', name: 'Gembos', sortOrder: 4, sort_order: 4 }
const qc = () => productionQcInput.parse({ brandUid, weight1Grams: '71,29', weight2Grams: '70,05', defects: [{ defectUid, quantity: 999 }, { defectUid: secondDefectUid, quantity: 1 }] })

function database(brands = [brand], defects = [defect, secondDefect]) {
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('production_brands')) return [brands.filter(row => row.isActive && row.siteId === Number(sql.includes('uid=?') ? params[1] : params[0])), []]
    if (sql.includes('production_defects')) return [defects.filter(row => row.isActive), []]
    throw new Error('Unexpected query: ' + sql)
  })
  const execute = vi.fn(async () => [{ insertId: 71, affectedRows: 1 }, []])
  return { query, execute, connection: { query, execute } as unknown as PoolConnection }
}

describe('production QC persistence', () => {
  it.each([{ rows: [{ uid: brandUid }] }, { rows: [] }])('reads the last saved brand scoped to the verified device and site: %j', async ({ rows }) => {
    const query = vi.fn().mockResolvedValue([rows])
    expect(await lastProductionDeviceBrand({ query } as unknown as PoolConnection, 8, 5)).toBe(rows[0]?.uid ?? null)
    expect(query.mock.calls[0][1]).toEqual([8, 5])
    expect(query.mock.calls[0][0]).toContain("transaction_record.status='POSTED'")
    expect(query.mock.calls[0][0]).toContain('transaction_record.scan_device_id=? AND transaction_record.site_id=?')
    expect(query.mock.calls[0][0]).toContain('transaction_record.transaction_at DESC,transaction_record.id DESC')
  })
  it.each(['BORONGAN-LINTING', 'BORONGAN-PACKING'])('QC is optional for %s without accessing masters', async job => {
    const db = database()
    expect(await resolveProductionQc(db.connection, undefined, 5, job)).toBeNull()
    expect(await resolveProductionQc(db.connection, productionQcInput.parse({}), 5, job)).toBeNull()
    expect(db.query).not.toHaveBeenCalled()
  })

  it('rejects QC on non-Linting work without touching production or Payroll', async () => {
    const db = database()
    await expect(resolveProductionQc(db.connection, qc(), 5, 'BORONGAN-PACKING')).rejects.toMatchObject({ status: 422 })
    expect(db.execute).not.toHaveBeenCalled()
  })

  it.each(['missing', 'wrong-site', 'inactive'])('rejects %s brand', async condition => {
    const brands = condition === 'missing' ? [] : [{ ...brand, siteId: condition === 'wrong-site' ? 6 : 5, site_id: condition === 'wrong-site' ? 6 : 5, isActive: condition === 'inactive' ? 0 : 1, is_active: condition === 'inactive' ? 0 : 1 }]
    const db = database(brands)
    await expect(resolveProductionQc(db.connection, qc(), 5, 'BORONGAN-LINTING')).rejects.toMatchObject({ status: 422 })
    expect(db.execute).not.toHaveBeenCalled()
  })

  it.each(['missing', 'inactive'])('rejects %s defect', async condition => {
    const defects = condition === 'missing' ? [defect] : [defect, { ...secondDefect, isActive: 0, is_active: 0 }]
    const db = database(undefined, defects)
    await expect(resolveProductionQc(db.connection, qc(), 5, 'BORONGAN-LINTING')).rejects.toMatchObject({ status: 422 })
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('accepts comma grams and independent defect counts with master snapshots', async () => {
    const db = database()
    const resolved = await resolveProductionQc(db.connection, qc(), 5, 'BORONGAN-LINTING', true)
    expect(JSON.stringify(resolved)).toContain('71.29')
    expect(JSON.stringify(resolved)).toContain('70.05')
    expect(JSON.stringify(resolved)).toContain('999')
    expect(JSON.stringify(resolved)).toContain('Cowong')
    expect(db.query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE'))).toBe(true)
  })

  it('accepts partial metadata in backend without making brand or both weights mandatory', async () => {
    const db = database()
    const resolved = await resolveProductionQc(db.connection, productionQcInput.parse({ weight1Grams: '71,29' }), 5, 'BORONGAN-LINTING')
    expect(resolved).toEqual({ brand: null, weight1Grams: '71.29', weight2Grams: null, defects: [] })
    expect(db.query).not.toHaveBeenCalled()
  })

  it('loads only active options for the requested site and preserves master order', async () => {
    const db = database()
    const result = await loadProductionQcOptions(db.connection, 5)
    expect(result.brands[0]).toMatchObject({ uid: brandUid, name: 'Brand A' })
    expect(result.defects[0]).toMatchObject({ uid: defectUid })
    expect(db.query.mock.calls.every(([sql]) => /ORDER BY/.test(sql) && /is_active/.test(sql))).toBe(true)
    expect(db.query.mock.calls[0][1]).toEqual([5])
  })

  it('writes snapshots without changing raw quantity, tier pricing, or Payroll', async () => {
    const db = database()
    const resolved = await resolveProductionQc(db.connection, qc(), 5, 'BORONGAN-LINTING')
    await saveProductionQc(db.connection, 101, resolved, 7)
    const calls = JSON.stringify(db.execute.mock.calls)
    expect(calls).toContain('production_transaction_qc')
    expect(calls).toContain('production_transaction_qc_defects')
    expect(calls).toContain('Brand A')
    expect(calls).toContain('Cowong')
    expect(calls).toContain('71.29')
    expect(calls).not.toContain('UPDATE production_transactions')
    expect(calls).not.toContain('payroll')
    const executeCalls = db.execute.mock.calls as unknown as [string, unknown[]][]
    expect(executeCalls[0][1].slice(1)).toEqual([101, 21, 'BR-21', 'Brand A', '71.29', '70.05', 7, 7])
    expect(executeCalls[1][1].slice(1, 9)).toEqual([71, 31, 'DF-31', 'Cowong', 3, 999, 7, 7])
  })

  it('does not write a QC record when none supplied', async () => {
    const db = database()
    await saveProductionQc(db.connection, 101, null, 7)
    expect(db.execute).not.toHaveBeenCalled()
    expect(db.query).not.toHaveBeenCalled()
  })
})

function replayDatabase(hasHeader = true) {
  const header = { id: 71, brandUid, weight1Grams: '71.29', weight2Grams: '70.05', brandName: 'Archived brand name', brandCode: 'BR-21' }
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('production_transaction_qc_defects')) return [[{ defectUid, quantity: 999 }, { defectUid: secondDefectUid, quantity: 1 }], []]
    if (sql.includes('production_transaction_qc')) return [hasHeader ? [header] : [], []]
    throw new Error('Replay must compare saved QC, not resolve current masters: ' + sql)
  })
  const execute = vi.fn()
  return { query, execute, connection: { query, execute } as unknown as PoolConnection }
}

describe('production QC idempotency', () => {
  it('accepts equivalent replay with different defect order and normalized weights', async () => {
    const db = replayDatabase()
    const input = productionQcInput.parse({ brandUid, weight1Grams: 71.29, weight2Grams: '70,05', defects: [{ defectUid: secondDefectUid, quantity: 1 }, { defectUid, quantity: 999 }] })
    await expect(assertProductionQcReplay(db.connection, 101, input)).resolves.not.toThrow()
    expect(db.execute).not.toHaveBeenCalled()
    expect(db.query.mock.calls.every(([sql]) => !/FROM production_brands|FROM production_defects/.test(sql))).toBe(true)
  })

  it.each(['brand', 'weight', 'defect', 'removed'])('rejects changed %s QC on same request', async change => {
    const db = replayDatabase()
    const input = change === 'removed' ? productionQcInput.parse({}) : qc()
    if (input && change === 'brand') input.brandUid = '44444444-4444-4444-8444-444444444444'
    if (input && change === 'weight') input.weight1Grams = '71.30'
    if (input && change === 'defect') input.defects[0].quantity = 1000
    await expect(assertProductionQcReplay(db.connection, 101, input)).rejects.toMatchObject({ status: 409 })
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('accepts old non-QC transaction retry but rejects adding QC to that transaction', async () => {
    const db = replayDatabase(false)
    await expect(assertProductionQcReplay(db.connection, 101, undefined)).resolves.not.toThrow()
    await expect(assertProductionQcReplay(db.connection, 101, qc())).rejects.toMatchObject({ status: 409 })
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('permits zero-only QC replay on old transaction and omission from legacy clients', async () => {
    const old = replayDatabase(false)
    await expect(assertProductionQcReplay(old.connection, 101, productionQcInput.parse({ defects: [{ defectUid, quantity: 0 }] }))).resolves.not.toThrow()
    const existing = replayDatabase()
    await expect(assertProductionQcReplay(existing.connection, 101, undefined)).resolves.not.toThrow()
    expect(existing.query).not.toHaveBeenCalled()
    expect(existing.execute).not.toHaveBeenCalled()
  })
})

const transactionBase = { jobUid: secondDefectUid, quantity: '500', idempotencyKey: defectUid }
const historicalBase = { ...transactionBase, employeeUid: brandUid, site: 'JEPARA', businessDate: '2026-10-08', reason: 'Setoran susulan untuk pengujian.' }
const previewBase = { employeeUid: brandUid, site: 'JEPARA', businessDate: '2026-10-08', jobUid: secondDefectUid, quantity: '500' }

describe('transaction QC backward-compatible contracts', () => {
  it.each([
    ['terminal', productionTerminalPostInput, { ...transactionBase, barcode: 'TEST-BARCODE' }],
    ['historical preview', productionHistoricalPreviewInput, previewBase],
    ['historical post', productionHistoricalPostInput, historicalBase],
  ] as const)('%s accepts old payloads and normalizes supplied QC without changing quantity', (_name, schema, base) => {
    expect(schema.parse(base)).not.toHaveProperty('qc')
    const parsed = schema.parse({ ...base, qc: { brandUid, weight1Grams: '71,29', weight2Grams: '70,05', defects: [{ defectUid, quantity: 999 }] } })
    expect(parsed.quantity).toBe('500')
    expect(parsed.qc).toMatchObject({ weight1Grams: '71.29', weight2Grams: '70.05', defects: [{ quantity: 999 }] })
    expect(schema.safeParse({ ...base, qc: { weight1Grams: '71,291' } }).success).toBe(false)
  })
})
