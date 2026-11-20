import express from 'express'
import type { AddressInfo } from 'node:net'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { employeesRouter } from './employees.js'

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  audit: vi.fn(),
  auth: {} as AuthContext,
}))
vi.mock('../db.js', () => ({ pool: { getConnection: mocks.getConnection } }))
vi.mock('../config.js', () => ({
  env: { R2_PUBLIC_BASE_URL: 'https://files.example.test' },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.audit }))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    res.locals.auth = mocks.auth
    next()
  },
  requirePermission:
    (permission: string) =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) => {
      next(
        mocks.auth.permissions.includes(permission)
          ? undefined
          : new ApiError(403, 'Izin ditolak.')
      )
    },
}))

const employee = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const fileUid = '33333333-3333-4333-8333-333333333333'
const key = '44444444-4444-4444-8444-444444444444'
const body = {
  documentType: 'KTP',
  documentNumber: 'SYNTHETIC-ID',
  name: 'Foto KTP',
  fileUid,
  status: 'ACTIVE',
  idempotencyKey: key,
}
let db: DatabaseSync

async function request(path: string, payload: unknown = body, method = 'POST') {
  const app = express()
  app.use(express.json())
  app.use('/api/employees', employeesRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    return await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/employees${path}`,
      {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
  } finally {
    server.close()
  }
}
const count = () =>
  Number(db.prepare('SELECT COUNT(*) n FROM employee_documents').get()!.n)
const auditCount = () =>
  Number(db.prepare('SELECT COUNT(*) n FROM audits').get()!.n)

beforeEach(() => {
  vi.resetAllMocks()
  db = new DatabaseSync(':memory:')
  db.function('DATE_FORMAT', { varargs: true }, (value) => value)
  db.exec(`
    CREATE TABLE sites(id INTEGER PRIMARY KEY,code TEXT);
    CREATE TABLE employees(id INTEGER PRIMARY KEY,uid TEXT UNIQUE,current_site_id INTEGER);
    CREATE TABLE files(id INTEGER PRIMARY KEY,uid TEXT UNIQUE);
    CREATE TABLE employee_documents(id INTEGER PRIMARY KEY,uid TEXT UNIQUE,employee_id INTEGER,document_type TEXT,document_number TEXT,name TEXT,file_id INTEGER,issued_date TEXT,expiry_date TEXT,status TEXT,notes TEXT,created_by INTEGER,updated_by INTEGER);
    CREATE TABLE audits(action TEXT,record_uid TEXT);
    INSERT INTO sites VALUES(1,'KLATEN'),(2,'JEPARA');
  `)
  db.prepare('INSERT INTO employees VALUES(1,?,1),(2,?,2)').run(employee, other)
  db.prepare('INSERT INTO files VALUES(1,?)').run(fileUid)
  mocks.auth = {
    id: 7,
    roles: ['HR_OFFICER'],
    permissions: ['documents.manage'],
    siteAccess: ['KLATEN'],
  } as AuthContext
  // A single SQLite connection emulates transaction isolation for concurrent HTTP
  // callers; application SQL and the existing unique UID constraint run unchanged.
  let queue = Promise.resolve()
  mocks.getConnection.mockImplementation(async () => {
    let unlock: (() => void) | undefined
    let active = false
    return {
      beginTransaction: async () => {
        const waiting = queue
        queue = new Promise<void>((resolve) => {
          unlock = resolve
        })
        await waiting
        db.exec('BEGIN')
        active = true
      },
      query: async (sql: string, params: SQLInputValue[] = []) => [
        db.prepare(sql.replace(/\s+FOR UPDATE\b/gi, '')).all(...params),
      ],
      execute: async (sql: string, params: SQLInputValue[] = []) => [
        { affectedRows: Number(db.prepare(sql).run(...params).changes) },
      ],
      commit: async () => {
        db.exec('COMMIT')
        active = false
        unlock?.()
      },
      rollback: async () => {
        if (active) db.exec('ROLLBACK')
        active = false
        unlock?.()
      },
      release: vi.fn(),
    }
  })
  mocks.audit.mockImplementation(
    async (
      input: { action: string; recordUid: string },
      conn: { execute: (sql: string, values: string[]) => Promise<unknown> }
    ) => {
      await conn.execute('INSERT INTO audits VALUES(?,?)', [
        input.action,
        input.recordUid,
      ])
    }
  )
})
afterEach(() => db.close())

describe('employee document atomic create and retry', () => {
  it('returns the same UID after a lost successful response, without a second document/audit', async () => {
    expect((await request(`/${employee}/documents`)).status).toBe(201)
    const replay = await request(`/${employee}/documents`)
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual({ uid: key })
    expect(count()).toBe(1)
    expect(auditCount()).toBe(1)
  })
  it('serializes concurrent retries into one document', async () => {
    const responses = await Promise.all([
      request(`/${employee}/documents`),
      request(`/${employee}/documents`),
    ])
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 201,
    ])
    expect(count()).toBe(1)
    expect(auditCount()).toBe(1)
  })
  it('rolls back both inserted document and audit on audit failure, then retry succeeds', async () => {
    const audit = mocks.audit.getMockImplementation()!
    mocks.audit.mockImplementationOnce(async (...args) => {
      await audit(...args)
      throw new Error('Synthetic audit failure')
    })
    expect((await request(`/${employee}/documents`)).status).toBe(500)
    expect(count()).toBe(0)
    expect(auditCount()).toBe(0)
    expect((await request(`/${employee}/documents`)).status).toBe(201)
    expect(count()).toBe(1)
    expect(auditCount()).toBe(1)
  })
  it.each([
    'name',
    'documentNumber',
    'documentType',
    'notes',
    'status',
    'issuedDate',
    'expiryDate',
  ])('rejects reusing a committed key with different %s', async (field) => {
    expect((await request(`/${employee}/documents`)).status).toBe(201)
    const value =
      field === 'status'
        ? 'ARCHIVED'
        : field.endsWith('Date')
          ? '2026-11-01'
          : 'DIFFERENT'
    expect(
      (await request(`/${employee}/documents`, { ...body, [field]: value }))
        .status
    ).toBe(409)
    expect(count()).toBe(1)
    expect(auditCount()).toBe(1)
  })
  it('rejects changed file or employee with the same key without leaking stored data', async () => {
    expect((await request(`/${employee}/documents`)).status).toBe(201)
    const secondFile = '55555555-5555-4555-8555-555555555555'
    db.prepare('INSERT INTO files VALUES(2,?)').run(secondFile)
    expect(
      (
        await request(`/${employee}/documents`, {
          ...body,
          fileUid: secondFile,
        })
      ).status
    ).toBe(409)
    mocks.auth.siteAccess.push('JEPARA')
    expect((await request(`/${other}/documents`)).status).toBe(409)
    expect(count()).toBe(1)
  })
  it('preserves multiple legitimate documents of the same type with different creation keys', async () => {
    expect((await request(`/${employee}/documents`)).status).toBe(201)
    expect(
      (
        await request(`/${employee}/documents`, {
          ...body,
          idempotencyKey: crypto.randomUUID(),
        })
      ).status
    ).toBe(201)
    expect(count()).toBe(2)
  })
  it('keeps compatibility for callers without a creation key', async () => {
    const { idempotencyKey: _key, ...legacy } = body
    expect((await request(`/${employee}/documents`, legacy)).status).toBe(201)
    expect(count()).toBe(1)
  })
  it('validates permission, site and file before creating anything', async () => {
    expect((await request(`/${other}/documents`)).status).toBe(403)
    expect(
      (
        await request(`/${employee}/documents`, {
          ...body,
          fileUid: crypto.randomUUID(),
        })
      ).status
    ).toBe(422)
    mocks.auth.permissions = []
    expect((await request(`/${employee}/documents`)).status).toBe(403)
    expect(count()).toBe(0)
    expect(auditCount()).toBe(0)
  })
  it('rolls back document edit when audit fails; subsequent edit changes the same record', async () => {
    await request(`/${employee}/documents`)
    mocks.audit.mockRejectedValueOnce(new Error('Synthetic audit failure'))
    expect(
      (
        await request(
          `/documents/${key}`,
          { ...body, name: 'UPDATED' },
          'PATCH'
        )
      ).status
    ).toBe(500)
    expect(db.prepare('SELECT name FROM employee_documents').get()!.name).toBe(
      body.name
    )
    expect(
      (
        await request(
          `/documents/${key}`,
          { ...body, name: 'UPDATED' },
          'PATCH'
        )
      ).status
    ).toBe(204)
    expect(db.prepare('SELECT name FROM employee_documents').get()!.name).toBe(
      'UPDATED'
    )
    expect(count()).toBe(1)
    expect(auditCount()).toBe(2)
  })
})
