import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { attendanceRouter } from './attendance.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  audit: vi.fn(),
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
    query: mocks.query,
    execute: mocks.execute,
    getConnection: vi.fn(async () => connection),
  },
}))
vi.mock('../config.js', () => ({
  env: {
    ATTENDANCE_GO_LIVE_DATE: '2026-08-01',
    ATTENDANCE_BATCH_TOOLS_ENABLED: false,
  },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
  requirePermission:
    () =>
    (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
      next(),
}))

const auth: AuthContext = {
  id: 7,
  uid: 'super-admin',
  name: 'Super Admin',
  email: null,
  roles: ['SUPER_ADMIN'],
  permissions: ['attendance.manage_shift'],
  siteAccess: [],
}

async function removeAssignment() {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth
    next()
  })
  app.use('/api/attendance', attendanceRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(
      `http://127.0.0.1:${port}/api/attendance/shift-assignments/11111111-1111-4111-8111-111111111111`,
      {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reason: 'Penugasan Shift tercatat ganda.',
          confirmation: 'HAPUS',
        }),
      }
    )
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('hapus penugasan Shift', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.beginTransaction.mockResolvedValue(undefined)
    mocks.commit.mockResolvedValue(undefined)
    mocks.rollback.mockResolvedValue(undefined)
    mocks.execute.mockResolvedValue([{ affectedRows: 1 }])
  })

  it('menghapus penugasan historis yang belum dipakai', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            id: 31,
            employeeId: 42,
            shiftId: 21,
            siteId: 1,
            site: 'JEPARA',
            employeeName: 'Siti',
            shiftName: 'Pagi',
            effectiveFrom: '2026-08-01',
            effectiveTo: '2026-08-31',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [{ attendanceCount: 0, scanCount: 0, classificationCount: 0 }],
      ])

    const response = await removeAssignment()

    expect(response.status).toBe(204)
    expect(mocks.execute).toHaveBeenCalledWith(
      'DELETE FROM employee_shift_assignments WHERE id=?',
      [31]
    )
    expect(mocks.audit).toHaveBeenCalledOnce()
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('menjelaskan dependensi yang menghalangi penghapusan', async () => {
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            id: 31,
            employeeId: 42,
            shiftId: 21,
            siteId: 1,
            site: 'JEPARA',
            employeeName: 'Siti',
            shiftName: 'Pagi',
            effectiveFrom: '2026-08-01',
            effectiveTo: '2026-08-31',
          },
        ],
      ])
      .mockResolvedValueOnce([
        [{ attendanceCount: 2, scanCount: 4, classificationCount: 0 }],
      ])

    const response = await removeAssignment()
    const body = (await response.json()) as { message: string }

    expect(response.status).toBe(409)
    expect(body.message).toContain('2 Attendance, 4 scan')
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })
})
