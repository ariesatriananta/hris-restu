import type { NextFunction, Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticate, requirePermission } from './authenticate.js'

const mocks = vi.hoisted(() => ({ query: vi.fn(), verify: vi.fn() }))
vi.mock('../db.js', () => ({ pool: { query: mocks.query } }))
vi.mock('../lib/auth.js', () => ({
  ACCESS_COOKIE: 'access',
  verifyAccessToken: mocks.verify,
}))

function context(method: string, originalUrl: string) {
  const req = {
    cookies: { access: 'token' },
    method,
    originalUrl,
  } as unknown as Request
  const json = vi.fn(),
    status = vi.fn(() => ({ json }))
  const res = { locals: {}, status } as unknown as Response
  const next = vi.fn() as NextFunction
  return { req, res, next, status, json }
}

describe('authenticate wajib ganti password', () => {
  beforeEach(() => {
    mocks.query.mockReset()
    mocks.verify.mockReset()
    mocks.verify.mockResolvedValue({
      payload: { sub: 'user-uid', sid: 'session-uid' },
    })
    mocks.query.mockResolvedValue([
      [
        {
          id: 9,
          uid: 'user-uid',
          full_name: 'User',
          email: null,
          status: 'ACTIVE',
          must_change_password: 1,
          role_code: 'HR_OFFICER',
          permission_code: 'employees.view',
          site_code: 'JEPARA',
        },
      ],
    ])
  })

  it('memblokir modul lain dengan kode yang dapat ditangani frontend', async () => {
    const ctx = context('GET', '/api/employees')
    await authenticate(ctx.req, ctx.res, ctx.next)
    expect(ctx.status).toHaveBeenCalledWith(403)
    expect(ctx.json).toHaveBeenCalledWith({
      code: 'PASSWORD_CHANGE_REQUIRED',
      message:
        'Anda wajib mengganti kata sandi sebelum menggunakan modul lain.',
    })
    expect(ctx.next).not.toHaveBeenCalled()
  })
  it('preserves database failures for the service error handler instead of returning 401', async () => {
    const failure = new Error('Synthetic unavailable database')
    mocks.query.mockRejectedValueOnce(failure)
    const ctx = context('GET', '/api/employees')
    await authenticate(ctx.req, ctx.res, ctx.next)
    expect(ctx.next).toHaveBeenCalledWith(failure)
  })
  it('still rejects expired or malformed JWTs as 401 without querying the database', async () => {
    mocks.verify.mockRejectedValueOnce(new Error('Synthetic expired token'))
    const ctx = context('GET', '/api/employees')
    await authenticate(ctx.req, ctx.res, ctx.next)
    expect(ctx.next).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401 })
    )
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it.each([
    ['GET', '/api/auth/me'],
    ['GET', '/api/auth/profile'],
    ['PATCH', '/api/auth/profile/password'],
  ])('tetap mengizinkan %s %s', async (method, path) => {
    const ctx = context(method, path)
    await authenticate(ctx.req, ctx.res, ctx.next)
    expect(ctx.next).toHaveBeenCalledOnce()
    expect(ctx.status).not.toHaveBeenCalled()
    expect(
      (ctx.res.locals.auth as { mustChangePassword: boolean })
        .mustChangePassword
    ).toBe(true)
  })
})

describe('QC authentication scope', () => {
  it('loads module UIDs constrained by assigned sites and strips unapproved grants', async () => {
    mocks.query.mockReset()
    mocks.verify.mockResolvedValue({ payload: { sub: 'qc', sid: 'session' } })
    mocks.query
      .mockResolvedValueOnce([
        [
          {
            id: 9,
            uid: 'qc',
            full_name: 'QC',
            status: 'ACTIVE',
            must_change_password: 0,
            role_code: 'QC',
            permission_code: 'production.scan',
            site_code: 'KLATEN',
          },
          {
            id: 9,
            role_code: 'QC',
            permission_code: 'production.export',
            site_code: 'KLATEN',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ uid: 'module-one' }, { uid: 'module-one' }]])
    const ctx = context('GET', '/api/production/terminal/meta')
    await authenticate(ctx.req, ctx.res, ctx.next)
    expect(ctx.res.locals.auth.productionModuleAccess).toEqual(['module-one'])
    expect(ctx.res.locals.auth.permissions).toEqual(['production.scan'])
    expect(mocks.query.mock.calls[1][0]).toContain('usa.site_id=pm.site_id')
    expect(ctx.next).toHaveBeenCalledWith()
  })
  it.each(['production.export', 'production.manage_master', 'employees.view'])(
    'denies injected %s grants',
    (permission) => {
      const ctx = context('GET', '/api/test')
      ctx.res.locals.auth = { roles: ['QC'], permissions: [permission] }
      requirePermission(permission)(ctx.req, ctx.res, ctx.next)
      expect(ctx.next).toHaveBeenCalledWith(
        expect.objectContaining({ status: 403 })
      )
    }
  )
})
