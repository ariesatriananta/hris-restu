import express from 'express'
import type { AddressInfo } from 'node:net'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { employeesRouter } from './employees.js'
import { employeeSummaryRouter } from './employee-summary.js'
import { klatenLegacySourceHash } from '../lib/employee-archive-policy.js'

interface ContractList {
  total: number
  items: Array<{
    uid: string
    status: string
    isLatestForEmployee: boolean
  }>
}

async function contractList(response: Response): Promise<ContractList> {
  return (await response.json()) as ContractList
}

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  execute: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  auth: {
    id: 1,
    uid: 'test-admin',
    name: 'Test Admin',
    email: null,
    roles: ['SUPER_ADMIN'],
    permissions: [],
    siteAccess: [],
  } as AuthContext,
}))

vi.mock('../db.js', () => ({
  pool: {
    query: mocks.query,
    getConnection: async () => mocks,
  },
}))
vi.mock('../config.js', () => ({
  env: { R2_PUBLIC_BASE_URL: 'https://files.example.test' },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: vi.fn() }))
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
    () =>
    (
      _req: express.Request,
      _res: express.Response,
      next: express.NextFunction
    ) =>
      next(),
}))

async function request(path: string, body?: unknown) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => { res.locals.auth = mocks.auth; next() })
  app.use('/api/employees', employeeSummaryRouter)
  app.use('/api/employees', employeesRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    return await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/employees${path}`,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }
    )
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}

describe('contract lifecycle latest excludes cancelled history', () => {
  let db: DatabaseSync

  beforeEach(() => {
    vi.clearAllMocks()
    db = new DatabaseSync(':memory:')
    // Execute the actual route SQL, only adapting driver functions/locking syntax.
    // All fixtures are synthetic and never use the configured application DB.
    db.function('DATE_FORMAT', { varargs: true }, (value) => value)
    db.function('UTC_TIMESTAMP', () => '2026-11-20 00:00:00')
    db.function('CONVERT_TZ', { varargs: true }, (value) => value)
    db.function('IF', (condition, yes, no) => condition ? yes : no)
    db.function('JSON_UNQUOTE', value => value)
    db.exec(`
      CREATE TABLE employees(id INTEGER,uid TEXT,full_name TEXT,nickname TEXT,employee_number TEXT,employee_type_id INTEGER,employee_status_id INTEGER,current_site_id INTEGER,current_production_module_section_id INTEGER,resign_date TEXT);
      CREATE TABLE employee_types(id INTEGER,code TEXT);
      CREATE TABLE employee_statuses(id INTEGER,code TEXT);
      CREATE TABLE sites(id INTEGER,code TEXT);
      CREATE TABLE production_module_sections(id INTEGER,production_module_id INTEGER,production_section_id INTEGER);
      CREATE TABLE production_modules(id INTEGER,uid TEXT,name TEXT);
      CREATE TABLE production_sections(id INTEGER,uid TEXT,name TEXT);
      CREATE TABLE files(id INTEGER,uid TEXT,original_name TEXT,mime_type TEXT,size_bytes INTEGER,extension TEXT,storage_path TEXT);
      CREATE TABLE contract_types(id INTEGER,code TEXT);
      CREATE TABLE employee_contracts(id INTEGER PRIMARY KEY,uid TEXT,employee_id INTEGER,contract_type_id INTEGER,contract_number TEXT,sequence_number INTEGER,start_date TEXT,end_date TEXT,signed_date TEXT,status TEXT,terminated_at TEXT,termination_reason TEXT,position_name_snapshot TEXT,site_name_snapshot TEXT,salary_or_rate_notes TEXT,notes TEXT,issued_file_id INTEGER);
      CREATE TABLE scheduled_employee_status_changes(id INTEGER PRIMARY KEY,uid TEXT,employee_id INTEGER,contract_id INTEGER,action TEXT,effective_date TEXT,reason TEXT,status TEXT,created_by INTEGER,updated_by INTEGER);
      CREATE TABLE scheduled_employee_mutations(id INTEGER,employee_id INTEGER,status TEXT);
      INSERT INTO employee_types VALUES(1,'BORONGAN');
      INSERT INTO employee_statuses VALUES(1,'ACTIVE');
      INSERT INTO sites VALUES(1,'JEPARA');
      INSERT INTO contract_types VALUES(1,'PKWT');
      INSERT INTO employees VALUES(1,'employee-a','SYNTHETIC EMPLOYEE',NULL,'TEST-001',1,1,1,NULL,NULL);
    `)
    db.exec('ALTER TABLE employees ADD COLUMN notes TEXT')
    db.exec('ALTER TABLE employees ADD COLUMN current_position_id INTEGER')
    const sqlForSqlite = (sql: string) => sql.replace(/\s+FOR UPDATE\b/gi, '')
      .replace(/DATE_ADD\(\?, INTERVAL 7 DAY\)/g, "date(?,'+7 days')")
      .replace(/GROUP_CONCAT\(DISTINCT active_contract.contract_number ORDER BY active_contract.contract_number SEPARATOR ', '\)/g, 'GROUP_CONCAT(DISTINCT active_contract.contract_number)')
    mocks.query.mockImplementation(
      async (sql: string, values: SQLInputValue[] = []) => [
        db.prepare(sqlForSqlite(sql)).all(...values),
      ]
    )
    mocks.execute.mockImplementation(
      async (sql: string, values: SQLInputValue[] = []) => {
        const result = db.prepare(sqlForSqlite(sql)).run(...values)
        return [{ affectedRows: Number(result.changes) }]
      }
    )
    mocks.beginTransaction.mockImplementation(async () => db.exec('BEGIN'))
    mocks.commit.mockImplementation(async () => db.exec('COMMIT'))
    mocks.rollback.mockImplementation(async () => db.exec('ROLLBACK'))
  })

  afterEach(() => db.close())

  function contract(id: number, status: string, startDate: string) {
    db.prepare(
      `INSERT INTO employee_contracts(id,uid,employee_id,contract_type_id,contract_number,sequence_number,start_date,end_date,status) VALUES(?,?,1,1,?,?,?,'2099-12-31',?)`
    ).run(id, `contract-${id}`, `TEST-CONTRACT-${id}`, id, startDate, status)
  }

  it.each(['TRAINING','LEGACY_UNKNOWN'])('excludes dormant %s archives from contract KPI, coverage and conflicts without hiding the employee', async employeeType => {
    db.prepare('UPDATE employee_types SET code=?').run(employeeType)
    db.exec("UPDATE employee_statuses SET code='INACTIVE'")
    db.prepare('UPDATE employees SET notes=?').run(JSON.stringify({ legacyImport: { sourceHash: klatenLegacySourceHash,raw: { '12:STATUS (Aktif/Tidak Aktif)': 'NON AKTIF' } } }))
    expect(await (await request('/contracts/summary')).json()).toMatchObject({ activeWithoutValidContract: 0 })
    expect(await (await request('/contracts?coverage=ACTIVE_WITHOUT_VALID_CONTRACT')).json()).toMatchObject({ total: 0,items: [] })
    expect(await (await request('/contracts/conflicts')).json()).toMatchObject({ total: 0,items: [] })
    expect(await (await request('/summary')).json()).toMatchObject({ totalEmployees: 1,inactiveEmployees: 1,incompletePlacementEmployees: 0 })
    expect(db.prepare('SELECT COUNT(*) n FROM employees').get()?.n).toBe(1)
  })

  it('keeps ordinary nonactive registrations actionable and real imported-archive contract conflicts visible', async () => {
    db.exec("UPDATE employee_statuses SET code='INACTIVE'")
    expect(await (await request('/summary')).json()).toMatchObject({ totalEmployees: 1,incompletePlacementEmployees: 1 })
    expect(await (await request('/contracts/summary')).json()).toMatchObject({ activeWithoutValidContract: 1 })
    expect(await (await request('/contracts?coverage=ACTIVE_WITHOUT_VALID_CONTRACT')).json()).toMatchObject({ total: 1 })
    expect(await (await request('/contracts/conflicts')).json()).toMatchObject({ total: 1 })
    db.prepare('UPDATE employees SET notes=?').run(JSON.stringify({ legacyImport: { sourceHash: klatenLegacySourceHash,raw: { '12:STATUS (Aktif/Tidak Aktif)': 'NON AKTIF' } } }))
    contract(1,'ACTIVE','2026-01-01')
    expect(await (await request('/contracts/conflicts')).json()).toMatchObject({ total: 1 })
    expect(db.prepare('SELECT code FROM employee_statuses').get()?.code).toBe('INACTIVE')
  })

  it('requires production placement only for production types and still checks active imports', async () => {
    db.exec('UPDATE employees SET current_position_id=1')
    db.prepare('UPDATE employees SET notes=?').run(JSON.stringify({ legacyImport: { sourceHash: klatenLegacySourceHash,raw: { '12:STATUS (Aktif/Tidak Aktif)': 'AKTIF' } } }))
    expect(await (await request('/summary')).json()).toMatchObject({ totalEmployees: 1,activeEmployees: 1,incompletePlacementEmployees: 1 })
    db.exec("UPDATE employee_types SET code='HARIAN'")
    expect(await (await request('/summary')).json()).toMatchObject({ incompletePlacementEmployees: 0 })
    db.exec("UPDATE employee_types SET code='BULANAN'")
    expect(await (await request('/summary')).json()).toMatchObject({ incompletePlacementEmployees: 0 })
  })

  it('keeps expired predecessor renewable after cancelling its later draft, retaining both records', async () => {
    contract(1, 'EXPIRED', '2026-01-01')
    contract(2, 'CANCELLED', '2026-11-01')

    const response = await request('/contracts')
    expect(response.status).toBe(200)
    const result = await contractList(response)
    expect(result.total).toBe(2)
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          uid: 'contract-1',
          status: 'EXPIRED',
          isLatestForEmployee: true,
        }),
        expect.objectContaining({ uid: 'contract-2', status: 'CANCELLED' }),
      ])
    )
  })

  it.each(['DRAFT', 'SCHEDULED', 'ACTIVE'])(
    'a real newer %s still supersedes the expired predecessor',
    async (status) => {
      contract(1, 'EXPIRED', '2026-01-01')
      contract(2, status, '2026-11-01')
      const response = await request('/contracts')
      expect(response.status).toBe(200)
      const result = await contractList(response)
      expect(
        result.items.find((item: { uid: string }) => item.uid === 'contract-1')
      ).toMatchObject({ isLatestForEmployee: false })
      expect(
        result.items.find((item: { uid: string }) => item.uid === 'contract-2')
      ).toMatchObject({ isLatestForEmployee: true })
    }
  )

  it('uses start date first, then ID, ignoring cancelled contracts for ties', async () => {
    contract(1, 'EXPIRED', '2026-01-01')
    contract(2, 'DRAFT', '2026-01-01')
    contract(3, 'CANCELLED', '2026-01-01')
    contract(4, 'EXPIRED', '2025-12-01')
    const response = await request('/contracts')
    expect(response.status).toBe(200)
    const result = await contractList(response)
    const relevant = result.items.filter(
      (item: { status: string }) => item.status !== 'CANCELLED'
    )
    expect(
      relevant.filter(
        (item: { isLatestForEmployee: boolean }) => item.isLatestForEmployee
      )
    ).toMatchObject([{ uid: 'contract-2' }])
  })

  it('coverage shows missing rather than cancelled when no relevant contract remains', async () => {
    contract(1, 'CANCELLED', '2026-01-01')
    const response = await request(
      '/contracts?coverage=ACTIVE_WITHOUT_VALID_CONTRACT'
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      total: 1,
      items: [
        {
          uid: 'employee-a',
          employeeUid: 'employee-a',
          status: 'MISSING',
          isMissingContract: true,
          isCoverageIssue: true,
        },
      ],
    })
  })

  it('coverage selects the expired predecessor instead of a cancelled later contract', async () => {
    contract(1, 'EXPIRED', '2026-01-01')
    contract(2, 'CANCELLED', '2026-11-01')
    const response = await request(
      '/contracts?coverage=ACTIVE_WITHOUT_VALID_CONTRACT'
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      total: 1,
      items: [
        {
          uid: 'contract-1',
          status: 'EXPIRED',
          isLatestForEmployee: true,
          isMissingContract: false,
          isCoverageIssue: true,
        },
      ],
    })
  })

  it.each([
    ['CANCELLED', 201],
    ['DRAFT', 409],
  ])(
    'scheduled status action ignores newer %s only when it is cancelled',
    async (status, expectedStatus) => {
      contract(1, 'ACTIVE', '2026-01-01')
      contract(2, status, '2026-11-01')
      const response = await request(
        '/contracts/contract-1/scheduled-status-changes',
        {
          action: 'RESIGN',
          effectiveDate: '2099-12-30',
          reason: 'Synthetic test',
        }
      )
      expect(response.status).toBe(expectedStatus)
      const scheduled = db
        .prepare(
          'SELECT contract_id,status FROM scheduled_employee_status_changes'
        )
        .all()
      expect(scheduled).toEqual(
        expectedStatus === 201 ? [{ contract_id: 1, status: 'SCHEDULED' }] : []
      )
      expect(mocks.commit).toHaveBeenCalledTimes(expectedStatus === 201 ? 1 : 0)
      expect(mocks.rollback).toHaveBeenCalledTimes(
        expectedStatus === 201 ? 0 : 1
      )
    }
  )
})
