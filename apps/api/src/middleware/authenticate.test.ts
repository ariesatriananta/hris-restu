import type { NextFunction, Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authenticate } from './authenticate.js'

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
