import express from 'express'
import argon2 from 'argon2'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { authRouter } from './auth.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  connectionQuery: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}))

vi.mock('../config.js', () => ({
  env: {
    REFRESH_TOKEN_TTL_DAYS: 30,
  },
}))
vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    execute: mocks.execute,
    getConnection: vi.fn(async () => ({
      query: mocks.connectionQuery,
      execute: mocks.execute,
      beginTransaction: mocks.beginTransaction,
      commit: mocks.commit,
      rollback: mocks.rollback,
      release: mocks.release,
    })),
  },
}))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}))

const context: AuthContext = {
  id: 7,
  uid: '11111111-1111-4111-8111-111111111111',
  name: 'Administrator HRIS',
  email: 'admin@example.test',
  roles: ['SUPER_ADMIN'],
  permissions: [],
  siteAccess: ['JEPARA', 'SEMARANG'],
  sessionUid: '22222222-2222-4222-8222-222222222222',
}

async function request(path: string, options: RequestInit = {}) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = context
    next()
  })
  app.use('/api/auth', authRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const port = (server.address() as AddressInfo).port
    return await fetch(`http://127.0.0.1:${port}/api/auth${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...options.headers },
    })
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('Auth profile API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.beginTransaction.mockResolvedValue(undefined)
    mocks.commit.mockResolvedValue(undefined)
    mocks.rollback.mockResolvedValue(undefined)
    mocks.release.mockReturnValue(undefined)
    mocks.execute.mockResolvedValue([{ affectedRows: 1 }])
  })

  it('mengembalikan profil akun login tanpa duplikasi peran dan site', async () => {
    mocks.query.mockResolvedValue([
      [
        {
          uid: context.uid,
          fullName: context.name,
          username: 'administrator.hris',
          email: context.email,
          phone: '08123456789',
          status: 'ACTIVE',
          lastLoginAt: '2026-08-29T02:00:00.000Z',
          roleCode: 'SUPER_ADMIN',
          roleName: 'Super Admin',
          siteCode: 'JEPARA',
          siteName: 'Site Jepara',
        },
        {
          uid: context.uid,
          fullName: context.name,
          username: 'administrator.hris',
          email: context.email,
          phone: '08123456789',
          status: 'ACTIVE',
          lastLoginAt: '2026-08-29T02:00:00.000Z',
          roleCode: 'SUPER_ADMIN',
          roleName: 'Super Admin',
          siteCode: 'SEMARANG',
          siteName: 'Site Semarang',
        },
      ],
    ])

    const response = await request('/profile')

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      uid: context.uid,
      fullName: context.name,
      username: 'administrator.hris',
      status: 'ACTIVE',
      roles: [{ code: 'SUPER_ADMIN', name: 'Super Admin' }],
      siteAccess: [
        { code: 'JEPARA', name: 'Site Jepara' },
        { code: 'SEMARANG', name: 'Site Semarang' },
      ],
    })
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE u.id=?'),
      [context.id]
    )
  })

  it('mengembalikan 404 jika akun sudah tidak ditemukan', async () => {
    mocks.query.mockResolvedValue([[]])

    const response = await request('/profile')

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      message: 'Profil pengguna tidak ditemukan.',
    })
  })

  it('memperbarui profil akun sendiri dan mencatat audit', async () => {
    mocks.connectionQuery
      .mockResolvedValueOnce([
        [
          {
            id: context.id,
            uid: context.uid,
            fullName: context.name,
            username: 'administrator.hris',
            email: context.email,
            phone: null,
          },
        ],
      ])
      .mockResolvedValueOnce([[{ usernameTaken: 0, emailTaken: 0 }]])

    const response = await request('/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: 'Administrator Utama',
        username: 'administrator.utama',
        email: 'utama@example.test',
        phone: '08123456789',
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ updated: true })
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET full_name=?'),
      [
        'Administrator Utama',
        'administrator.utama',
        'utama@example.test',
        '08123456789',
        context.id,
        context.id,
      ]
    )
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('menolak username yang sudah digunakan akun lain', async () => {
    mocks.connectionQuery
      .mockResolvedValueOnce([
        [
          {
            id: context.id,
            uid: context.uid,
            fullName: context.name,
            username: 'administrator.hris',
            email: context.email,
            phone: null,
          },
        ],
      ])
      .mockResolvedValueOnce([[{ usernameTaken: 1, emailTaken: 0 }]])

    const response = await request('/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        fullName: context.name,
        username: 'username.sama',
        email: context.email,
        phone: null,
      }),
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      message: 'Username sudah digunakan akun lain.',
    })
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })

  it('mengganti password dan mencabut sesi perangkat lain', async () => {
    const passwordHash = await argon2.hash('Password123')
    mocks.connectionQuery.mockResolvedValueOnce([
      [{ uid: context.uid, passwordHash }],
    ])

    const response = await request('/profile/password', {
      method: 'PATCH',
      body: JSON.stringify({
        currentPassword: 'Password123',
        newPassword: 'Password456',
      }),
    })

    expect(response.status).toBe(204)
    expect(mocks.execute).toHaveBeenCalledWith(
      expect.stringContaining("revoke_reason='PASSWORD_CHANGED'"),
      [context.id, context.sessionUid]
    )
    expect(mocks.commit).toHaveBeenCalledOnce()
  })

  it('menolak penggantian jika password saat ini salah', async () => {
    const passwordHash = await argon2.hash('Password123')
    mocks.connectionQuery.mockResolvedValueOnce([
      [{ uid: context.uid, passwordHash }],
    ])

    const response = await request('/profile/password', {
      method: 'PATCH',
      body: JSON.stringify({
        currentPassword: 'PasswordSalah1',
        newPassword: 'Password456',
      }),
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      message: 'Kata sandi saat ini tidak sesuai.',
    })
    expect(mocks.rollback).toHaveBeenCalledOnce()
  })
})
