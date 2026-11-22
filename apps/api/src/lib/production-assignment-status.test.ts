import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { assignmentStatusSql } from './production-foundation.js'

describe('production assignment status uses the WIB business date', () => {
  it.each([
    ['2026-11-22 16:59:59', '2026-11-23', null, 'ACTIVE', 'UPCOMING'],
    ['2026-11-22 17:00:00', '2026-11-23', null, 'ACTIVE', 'ACTIVE'],
    ['2026-11-24 20:00:00', '2026-11-23', null, 'ACTIVE', 'ACTIVE'],
    ['2026-11-24 20:00:00', '2026-11-23', '2026-11-25', 'ACTIVE', 'ACTIVE'],
    ['2026-11-25 17:00:00', '2026-11-23', '2026-11-25', 'ACTIVE', 'ENDED'],
    ['2026-11-24 20:00:00', '2026-11-26', null, 'CANCELLED', 'CANCELLED'],
  ])('UTC %s, effective %s–%s (%s) => %s', (utc, from, to, storedStatus, expected) => {
    const database = new DatabaseSync(':memory:')
    try {
      // Emulate the two MySQL clock functions; execute the real SQL CASE.
      database.function('UTC_TIMESTAMP', () => utc)
      database.function('CONVERT_TZ', (value, source, target) => {
        expect(source).toBe('+00:00')
        expect(target).toBe('+07:00')
        return new Date(new Date(`${value}Z`).getTime() + 7 * 60 * 60 * 1000)
          .toISOString().replace('T', ' ').slice(0, 19)
      })
      const row = database.prepare(`SELECT ${assignmentStatusSql('a')} status
        FROM (SELECT ? status, ? effective_from, ? effective_to) a`)
        .get(storedStatus, from, to)
      expect(row?.status).toBe(expected)
    } finally {
      database.close()
    }
  })
})
