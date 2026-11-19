import type { PoolConnection } from 'mysql2/promise'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  productionCategory,
  setProductionCategory,
  readProductionCategory,
  type ProductionCategoryKind,
} from './production-category.js'

type History = {
  id: number
  category: string
  effectiveFrom: string
  effectiveTo: string | null
}
function database(category: string | null = null, initial: History[] = []) {
  const state = { category, history: structuredClone(initial) }
  const query = vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.startsWith('SELECT id,production_category'))
      return [[{ id: 9, productionCategory: state.category }]]
    if (sql.startsWith('SELECT category FROM')) {
      const day = String(params[1])
      return [
        state.history
          .filter(
            (row) =>
              row.effectiveFrom <= day &&
              (row.effectiveTo === null || row.effectiveTo >= day)
          )
          .map((row) => ({ category: row.category })),
      ]
    }
    if (sql.startsWith('SELECT id,category'))
      return [
        [...state.history].sort((a, b) =>
          b.effectiveFrom.localeCompare(a.effectiveFrom)
        ),
      ]
    throw new Error('Unexpected query')
  })
  const execute = vi.fn(async (sql: string, params: unknown[]) => {
    if (
      sql.startsWith('UPDATE production_') &&
      sql.includes('SET effective_to=')
    ) {
      const target = state.history.find((row) => row.id === params[2])!
      target.effectiveTo = new Date(
        Date.parse(String(params[0]) + 'T00:00:00Z') - 86400000
      )
        .toISOString()
        .slice(0, 10)
    } else if (sql.includes('SET category=?,effective_from=')) {
      const target = state.history.find((row) => row.id === params[3])!
      target.category = String(params[0])
      target.effectiveFrom = String(params[1])
    } else if (sql.startsWith('INSERT INTO'))
      state.history.push({
        id: state.history.length + 1,
        category: String(params[2]),
        effectiveFrom: String(params[3]),
        effectiveTo: null,
      })
    else if (sql.includes('SET production_category='))
      state.category = String(params[0])
    else throw new Error('Unexpected write')
    return [{ affectedRows: 1 }]
  })
  return {
    state,
    query,
    execute,
    conn: { query, execute } as unknown as PoolConnection,
  }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-19T02:00:00Z'))
})
afterEach(() => vi.useRealTimers())
describe('Production category effective history', () => {
  it.each(['MODULE', 'BRAND'] as ProductionCategoryKind[])(
    'supports repeat edits and editable dates on %s',
    async (kind) => {
      const db = database()
      await setProductionCategory(db.conn, {
        kind,
        entityId: 9,
        category: 'REGULER',
        actorId: 7,
      })
      await setProductionCategory(db.conn, {
        kind,
        entityId: 9,
        category: 'PREMIUM',
        effectiveFrom: '2026-11-19',
        actorId: 7,
      })
      expect(db.state.history).toHaveLength(1)
      expect(await readProductionCategory(db.conn, kind, 9, '2026-11-19')).toBe(
        'PREMIUM'
      )
      await setProductionCategory(db.conn, {
        kind,
        entityId: 9,
        category: 'PREMIUM',
        effectiveFrom: '2026-11-01',
        actorId: 7,
      })
      expect(
        await readProductionCategory(db.conn, kind, 9, '2026-10-31')
      ).toBeNull()
      expect(await readProductionCategory(db.conn, kind, 9, '2026-11-01')).toBe(
        'PREMIUM'
      )
      expect(db.state.category).toBe('PREMIUM')
    }
  )
  it('appends a backdated category transition and adjusts a date-only correction without overlapping periods', async () => {
    const db = database('REGULER', [
      {
        id: 1,
        category: 'REGULER',
        effectiveFrom: '2026-10-01',
        effectiveTo: null,
      },
    ])
    await setProductionCategory(db.conn, {
      kind: 'MODULE',
      entityId: 9,
      category: 'PREMIUM',
      effectiveFrom: '2026-11-10',
      actorId: 7,
    })
    expect(
      await readProductionCategory(db.conn, 'MODULE', 9, '2026-11-09')
    ).toBe('REGULER')
    expect(
      await readProductionCategory(db.conn, 'MODULE', 9, '2026-11-10')
    ).toBe('PREMIUM')
    await setProductionCategory(db.conn, {
      kind: 'MODULE',
      entityId: 9,
      category: 'PREMIUM',
      effectiveFrom: '2026-11-05',
      actorId: 7,
    })
    expect(db.state.history[0].effectiveTo).toBe('2026-11-04')
    expect(
      await readProductionCategory(db.conn, 'MODULE', 9, '2026-11-05')
    ).toBe('PREMIUM')
    expect(db.state.history).toHaveLength(2)
  })
  it('preserves the initial date for an unchanged category without an explicit date', async () => {
    const db = database('REGULER', [
      {
        id: 1,
        category: 'REGULER',
        effectiveFrom: '2026-10-01',
        effectiveTo: null,
      },
    ])
    expect(
      await setProductionCategory(db.conn, {
        kind: 'MODULE',
        entityId: 9,
        category: 'REGULER',
        actorId: 7,
      })
    ).toMatchObject({ changed: false, effectiveFrom: '2026-10-01' })
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('rejects a corrected date crossing the previous period start', async () => {
    const db = database('PREMIUM', [
      {
        id: 1,
        category: 'REGULER',
        effectiveFrom: '2026-10-01',
        effectiveTo: '2026-11-09',
      },
      {
        id: 2,
        category: 'PREMIUM',
        effectiveFrom: '2026-11-10',
        effectiveTo: null,
      },
    ])
    await expect(
      setProductionCategory(db.conn, {
        kind: 'BRAND',
        entityId: 9,
        category: 'PREMIUM',
        effectiveFrom: '2026-10-01',
        actorId: 7,
      })
    ).rejects.toMatchObject({ status: 422 })
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('rejects future dates', async () => {
    const db = database()
    await expect(
      setProductionCategory(db.conn, {
        kind: 'MODULE',
        entityId: 9,
        category: 'REGULER',
        effectiveFrom: '2026-11-20',
        actorId: 7,
      })
    ).rejects.toMatchObject({ status: 422 })
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('initializes a database default category with its matching history', async () => {
    const db = database('REGULER')
    await setProductionCategory(db.conn, {
      kind: 'BRAND',
      entityId: 9,
      category: 'REGULER',
      actorId: 7,
    })
    expect(db.state.history).toMatchObject([
      { category: 'REGULER', effectiveFrom: '2026-11-19' },
    ])
  })
  it('rejects inconsistent master and history instead of overwriting silently', async () => {
    const db = database('PREMIUM', [
      {
        id: 1,
        category: 'REGULER',
        effectiveFrom: '2026-10-01',
        effectiveTo: null,
      },
    ])
    await expect(
      setProductionCategory(db.conn, {
        kind: 'MODULE',
        entityId: 9,
        category: 'PREMIUM',
        actorId: 7,
      })
    ).rejects.toMatchObject({ status: 409 })
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('rejects overlapping historical reads', async () => {
    const db = database('REGULER', [
      {
        id: 1,
        category: 'REGULER',
        effectiveFrom: '2026-10-01',
        effectiveTo: null,
      },
      {
        id: 2,
        category: 'PREMIUM',
        effectiveFrom: '2026-11-01',
        effectiveTo: null,
      },
    ])
    await expect(
      readProductionCategory(db.conn, 'MODULE', 9, '2026-11-10')
    ).rejects.toMatchObject({ status: 409 })
  })
  it('uses WIB and validates category and real dates', async () => {
    vi.setSystemTime(new Date('2026-11-18T17:00:00Z'))
    const db = database()
    await setProductionCategory(db.conn, {
      kind: 'BRAND',
      entityId: 9,
      category: 'REGULER',
      actorId: 7,
    })
    expect(db.state.history[0].effectiveFrom).toBe('2026-11-19')
    expect(productionCategory.safeParse('REGULAR').success).toBe(false)
    await expect(
      readProductionCategory(db.conn, 'MODULE', 9, '2026-02-30')
    ).rejects.toThrow()
  })
})
