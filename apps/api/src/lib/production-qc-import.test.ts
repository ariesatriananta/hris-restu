import type { PoolConnection } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import {
  assertProductionImportQcReplay,
  cloneProductionQc,
  loadProductionImportQcMasters,
  readProductionQc,
  resolveProductionImportQc,
  saveProductionImportQc,
} from './production-qc-storage.js'
import { productionImportPreviewInput } from './production-transaction-policy.js'

const masters = {
  brands: [
    {
      id: 1,
      uid: '11111111-1111-4111-8111-111111111111',
      code: 'BR-A',
      name: 'Brand snapshot',
      siteId: 5,
    },
  ],
  defects: [
    {
      id: 2,
      uid: '22222222-2222-4222-8222-222222222222',
      code: 'DF-A',
      name: 'Cowong',
      sortOrder: 3,
    },
  ],
} as unknown as Awaited<ReturnType<typeof loadProductionImportQcMasters>>
const input = {
  brandCode: 'BR-A',
  weight1Grams: '71,29',
  weight2Grams: '70.05',
  defects: [{ defectCode: 'DF-A', quantity: 1000 }],
}
const row = {
  rowNumber: 2,
  businessDate: '2026-09-19',
  employeeNumber: 'TEST-1',
  quantity: '500',
}

describe('QC Excel and lifecycle', () => {
  it('retains legacy files and normalizes QC without changing production quantity', () => {
    expect(
      productionImportPreviewInput.parse({ rows: [row] }).rows[0].qc
    ).toBeUndefined()
    const imported = productionImportPreviewInput.parse({
      rows: [{ ...row, qc: input }],
    }).rows[0]
    expect(imported.quantity).toBe('500')
    const qc = resolveProductionImportQc(
      imported.qc,
      5,
      'BORONGAN-LINTING',
      masters
    )
    expect(qc).toMatchObject({
      weight1Grams: '71.29',
      weight2Grams: '70.05',
      defects: [{ quantity: 1000 }],
    })
  })
  it.each([
    { siteId: 6, job: 'BORONGAN-LINTING', qc: input },
    { siteId: 5, job: 'BORONGAN-PACKING', qc: input },
    {
      siteId: 5,
      job: 'BORONGAN-LINTING',
      qc: { ...input, brandCode: 'BR-MISSING' },
    },
    {
      siteId: 5,
      job: 'BORONGAN-LINTING',
      qc: { ...input, weight1Grams: '1.234' },
    },
    {
      siteId: 5,
      job: 'BORONGAN-LINTING',
      qc: { ...input, defects: [{ defectCode: 'DF-A', quantity: -1 }] },
    },
    {
      siteId: 5,
      job: 'BORONGAN-LINTING',
      qc: {
        ...input,
        defects: [
          { defectCode: 'DF-A', quantity: 1 },
          { defectCode: 'DF-A', quantity: 2 },
        ],
      },
    },
    {
      siteId: 5,
      job: 'BORONGAN-LINTING',
      qc: { ...input, defects: [{ defectCode: 'DF-MISSING', quantity: 1 }] },
    },
  ])('rejects invalid row QC: %j', ({ siteId, job, qc }) => {
    expect(() => resolveProductionImportQc(qc, siteId, job, masters)).toThrow()
  })
  it('empty optional QC does not block non-Linting work', () => {
    expect(
      resolveProductionImportQc(undefined, 5, 'BORONGAN-PACKING', masters)
    ).toBeNull()
    expect(
      resolveProductionImportQc({ defects: [] }, 5, 'BORONGAN-PACKING', masters)
    ).toBeNull()
  })
  it.each([
    { weight1Grams: 0, defects: [] },
    { weight2Grams: 0, defects: [] },
    { brandCode: 'BR-A', weight1Grams: 0, defects: [] },
    { brandCode: 'BR-A', weight2Grams: 0, defects: [] },
  ])(
    'rejects numeric zero sample weight instead of treating it as omitted: %j',
    (qc) => {
      expect(() =>
        resolveProductionImportQc(qc, 5, 'BORONGAN-LINTING', masters)
      ).toThrow()
    }
  )
  it('reads frozen labels and order, even when current master is renamed/nonactive', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            id: 7,
            brandUid: 'brand',
            brandCode: 'BR-OLD',
            brandName: 'Old brand',
            weight1Grams: '71.29',
            weight2Grams: '70.05',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [
          {
            uid: 'defect',
            code: 'DF-OLD',
            name: 'Old defect',
            sortOrder: 9,
            quantity: 10,
          },
        ],
      ])
    const result = await readProductionQc(
      { query } as unknown as PoolConnection,
      20
    )
    expect(result).toMatchObject({
      brand: { code: 'BR-OLD', name: 'Old brand' },
      defects: [{ name: 'Old defect', sortOrder: 9 }],
    })
    expect(
      query.mock.calls.every(
        ([sql]) => !sql.includes('is_active') && !sql.includes('brand.name')
      )
    ).toBe(true)
  })
  it('clones snapshots for Linting only and keeps a legacy no-QC correction empty', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 8 }])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
    const conn = { execute } as unknown as PoolConnection
    await cloneProductionQc(conn, 20, 21, 'BORONGAN-PACKING', 7)
    expect(execute).not.toHaveBeenCalled()
    await cloneProductionQc(conn, 20, 21, 'BORONGAN-LINTING', 7)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(execute.mock.calls[0][0]).toContain('brand_name_snapshot')
    expect(execute.mock.calls[1][0]).toContain('sort_order_snapshot')
    execute.mockClear().mockResolvedValueOnce([{ affectedRows: 0 }])
    await cloneProductionQc(conn, 30, 31, 'BORONGAN-LINTING', 7)
    expect(execute).toHaveBeenCalledTimes(1)
  })
  it('resolves 3000 rows from two master queries and writes in 250-row chunks', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([masters.brands])
      .mockResolvedValueOnce([masters.defects])
    const execute = vi.fn().mockResolvedValue([{ affectedRows: 250 }])
    const conn = { query, execute } as unknown as PoolConnection
    const loaded = await loadProductionImportQcMasters(conn, [5], true)
    expect(query).toHaveBeenCalledTimes(2)
    const entries = Array.from({ length: 3000 }, (_, index) => ({
      transactionId: index + 1,
      qc: resolveProductionImportQc(input, 5, 'BORONGAN-LINTING', loaded),
    }))
    query.mockImplementation(async (_sql: string, ids: number[]) => [
      ids.map((id) => ({ id: id + 3000, transactionId: id })),
    ])
    await saveProductionImportQc(conn, entries, 7)
    expect(execute).toHaveBeenCalledTimes(24)
    expect(query).toHaveBeenCalledTimes(14)
    expect(
      execute.mock.calls.every(([_sql, params]) => params.length <= 250 * 9)
    ).toBe(true)
    expect(
      execute.mock.calls.every(
        ([sql]) =>
          !sql.includes('payroll') &&
          !sql.includes('UPDATE production_transactions')
      )
    ).toBe(true)
  })
  it('batch replay compares saved codes after master changes without rewriting', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        [
          {
            id: 7,
            transactionId: 20,
            brandCode: 'BR-A',
            weight1Grams: '71.29',
            weight2Grams: '70.05',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [{ transactionId: 20, defectCode: 'DF-A', quantity: 1000 }],
      ])
    await assertProductionImportQcReplay(
      { query } as unknown as PoolConnection,
      [{ transactionId: 20, qc: input }]
    )
    expect(query).toHaveBeenCalledTimes(2)
    query
      .mockResolvedValueOnce([
        [
          {
            id: 7,
            transactionId: 20,
            brandCode: 'BR-A',
            weight1Grams: '71.29',
            weight2Grams: '70.05',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [{ transactionId: 20, defectCode: 'DF-A', quantity: 1000 }],
      ])
    await expect(
      assertProductionImportQcReplay({ query } as unknown as PoolConnection, [
        { transactionId: 20, qc: { ...input, weight2Grams: '72.05' } },
      ])
    ).rejects.toMatchObject({ status: 409 })
  })
  it('QC write failure propagates to the caller transaction rather than partially succeeding', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('DB unavailable'))
    await expect(
      saveProductionImportQc(
        { execute } as unknown as PoolConnection,
        [
          {
            transactionId: 20,
            qc: resolveProductionImportQc(
              input,
              5,
              'BORONGAN-LINTING',
              masters
            ),
          },
        ],
        7
      )
    ).rejects.toThrow('DB unavailable')
  })
  it('3000 rows with 14 defect columns fit the existing 5mb JSON body budget', () => {
    const defectRows = Array.from({ length: 14 }, (_, index) => ({
      defectCode: `DF-${String(index).padStart(32, 'A')}`,
      quantity: 99,
    }))
    const payload = {
      rows: Array.from({ length: 3000 }, (_, index) => ({
        ...row,
        rowNumber: index + 2,
        employeeName: 'Karyawan Produksi',
        qc: {
          ...input,
          brandCode: 'BR-' + 'A'.repeat(32),
          defects: defectRows,
        },
      })),
    }
    expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBeLessThan(
      5 * 1024 * 1024
    )
  })
  it.each([-1, 0.5, 4294967296])(
    'rejects invalid replay defect count %s',
    async (quantity) => {
      const query = vi
        .fn()
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[]])
      await expect(
        assertProductionImportQcReplay({ query } as unknown as PoolConnection, [
          {
            transactionId: 20,
            qc: { defects: [{ defectCode: 'DF-A', quantity }] },
          },
        ])
      ).rejects.toMatchObject({ status: 409 })
    }
  )
})
