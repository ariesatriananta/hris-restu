import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
  promisePool: {},
  createPool: vi.fn(),
}))
vi.mock('./config.js', () => ({ env: { DATABASE_URL: 'mysql://test:test@localhost/test?timezone=local&connectionLimit=3' } }))
vi.mock('mysql2', () => ({ default: { createPool: mocks.createPool } }))
vi.mock('drizzle-orm/mysql2', () => ({ drizzle: vi.fn() }))

describe('UTC database connections', () => {
  it('pins driver parsing and SQL sessions independently of process/URL timezone', async () => {
    mocks.createPool.mockReturnValue({ on: mocks.on, promise: () => mocks.promisePool })
    const { pool } = await import('./db.js')
    expect(pool).toBe(mocks.promisePool)
    const options = new URL(mocks.createPool.mock.calls[0][0])
    expect(options.searchParams.get('timezone')).toBe('Z')
    expect(options.searchParams.get('connectionLimit')).toBe('3')
    const initialize = mocks.on.mock.calls.find(call => call[0] === 'connection')![1]
    const connection = { query: vi.fn(), destroy: vi.fn() }
    initialize(connection)
    expect(connection.query.mock.calls[0][0]).toBe("SET SESSION time_zone = '+00:00'")
    connection.query.mock.calls[0][1](null)
    expect(connection.destroy).not.toHaveBeenCalled()
    connection.query.mock.calls[0][1](new Error('Session initialization failed'))
    expect(connection.destroy).toHaveBeenCalledOnce()
  })
})
