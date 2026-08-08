import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { employeeSummaryRouter } from './employee-summary.js'

const mocks = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('../db.js', () => ({ pool: { query: mocks.query } }))
vi.mock('../middleware/authenticate.js', () => ({
  requirePermission:
    (permission: string) =>
    (
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const context = res.locals.auth as AuthContext
      if (
        !context.roles.includes('SUPER_ADMIN') &&
        !context.permissions.includes(permission)
      ) {
        return res.status(403).json({ message: 'Izin ditolak.' })
      }
      next()
    },
}))

function auth(
  options: { allowed?: boolean; superAdmin?: boolean; sites?: string[] } = {}
): AuthContext {
  const { allowed = true, superAdmin = false, sites = ['JEPARA'] } = options
  return {
    id: 7,
    uid: 'hr-user',
    name: 'HR',
    email: null,
    roles: superAdmin ? ['SUPER_ADMIN'] : ['HR_OFFICER'],
    permissions: allowed ? ['employees.view'] : [],
    siteAccess: sites,
  }
}

async function request(path: string, context = auth()) {
  const app = express()
  app.use((_req, res, next) => {
    res.locals.auth = context
    next()
  })
  app.use('/api/employees', employeeSummaryRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/employees${path}`)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Employee summary API', () => {
  beforeEach(() => {
    mocks.query.mockReset()
  })

  it('menolak tanpa employees.view sebelum query database', async () => {
    const response = await request('/summary', auth({ allowed: false }))

    expect(response.status).toBe(403)
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it('SUPER_ADMIN dapat membaca seluruh site tanpa scope tambahan', async () => {
    mocks.query.mockResolvedValueOnce([[{ totalEmployees: 12 }]])

    const response = await request('/summary', auth({ superAdmin: true }))

    expect(response.status).toBe(200)
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([])
    expect(String(mocks.query.mock.calls[0]?.[0])).not.toContain(
      "s.code IN ('')"
    )
  })

  it('membatasi HR Officer sesuai site access', async () => {
    mocks.query.mockResolvedValueOnce([[{ totalEmployees: 8 }]])

    const response = await request(
      '/summary',
      auth({ sites: ['JEPARA', 'KLATEN'] })
    )

    expect(response.status).toBe(200)
    expect(mocks.query.mock.calls[0]?.[1]).toEqual(['JEPARA', 'KLATEN'])
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain(
      's.code IN (?,?)'
    )
  })

  it('menerapkan filter site dan jenis sebelum scope akses', async () => {
    mocks.query.mockResolvedValueOnce([[{ totalEmployees: 3 }]])

    const response = await request(
      '/summary?site=JEPARA,KLATEN&employeeType=BORONGAN,TRAINING&query=ignored&page=9',
      auth({ sites: ['JEPARA'] })
    )

    expect(response.status).toBe(200)
    expect(mocks.query.mock.calls[0]?.[1]).toEqual([
      'JEPARA',
      'KLATEN',
      'BORONGAN',
      'TRAINING',
      'JEPARA',
    ])
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain(
      'et.code IN (?,?)'
    )
  })

  it('memetakan seluruh agregat menjadi number dengan fallback nol', async () => {
    mocks.query.mockResolvedValueOnce([
      [
        {
          totalEmployees: '20',
          activeEmployees: '15',
          inactiveEmployees: '2',
          resignedEmployees: '3',
          activeTrainingEmployees: '4',
          incompletePlacementEmployees: null,
        },
      ],
    ])

    const response = await request('/summary')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      totalEmployees: 20,
      activeEmployees: 15,
      inactiveEmployees: 2,
      resignedEmployees: 3,
      activeTrainingEmployees: 4,
      incompletePlacementEmployees: 0,
    })
  })

  it('menggunakan current status untuk seluruh definisi KPI', async () => {
    mocks.query.mockResolvedValueOnce([[{}]])

    await request('/summary')

    const sql = String(mocks.query.mock.calls[0]?.[0])
    expect(sql).toContain("es.code='ACTIVE'")
    expect(sql).toContain("es.code='INACTIVE' AND e.resign_date IS NULL")
    expect(sql).toContain("es.code='RESIGNED'")
    expect(sql).toContain("es.code='ACTIVE' AND et.code='TRAINING'")
    expect(sql).toContain("es.code<>'RESIGNED'")
    expect(sql).toContain('e.current_position_id IS NULL')
    expect(sql).toContain(
      'e.current_production_module_section_id IS NULL'
    )
  })
})
