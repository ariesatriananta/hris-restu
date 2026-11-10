// Opt-in, read-only audit against an explicitly local database. Never seeds data.
import express from 'express'
import type { RowDataPacket } from 'mysql2'
import mysql, { type Connection } from 'mysql2/promise'
import { mkdir, writeFile } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { productionDailySummaryRouter } from './production-daily-summary.js'

const state = vi.hoisted(() => ({ query: vi.fn(), today: '' }))
vi.mock('../db.js', () => ({ pool: { query: state.query } }))
vi.mock('../lib/contract-lifecycle.js', () => ({
  businessDate: () => state.today,
}))
vi.mock('../middleware/authenticate.js', () => ({
  authenticate: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
  requirePermission:
    (permission: string) =>
    (
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const actor = res.locals.auth as AuthContext
      if (!actor.permissions.includes(permission)) return res.sendStatus(403)
      next()
    },
}))

type Fact = RowDataPacket & {
  id: number
  uid: string
  employeeUid: string
  siteCode: string
  moduleUid: string | null
  jobUid: string
  unitUid: string
  date: string
  status: string
  quantity: string
  payable: string
  gross: string
}
type Totals = {
  quantity: string
  payableQuantity: string
  grossAmount?: string
  transactionCount: number
  rejectOccurrences: number
}
type Body = {
  tabs: Array<{ jobUid: string; units: Array<Totals & { unitUid: string }> }>
  items: Array<
    Totals & {
      uid: string
      employee: { uid: string }
      site: { code: string }
      unit: { uid: string }
    }
  >
  total: number
  canViewWages: boolean
}
const scale = (value: string, precision = 4) => {
  const [whole, fractional = ''] = value.split('.')
  return BigInt(whole + fractional.padEnd(precision, '0').slice(0, precision))
}
const actor = (role = 'HR_OFFICER'): AuthContext => ({
  id: 0,
  uid: 'local-audit',
  name: 'Local audit',
  email: null,
  roles: [role],
  permissions: ['production.view'],
  siteAccess: ['KLATEN', 'JEPARA', 'SEMARANG'],
})
let connection: Connection
let facts: Fact[] = []
let defects: RowDataPacket[] = []
let peers: RowDataPacket[] = []
let sqlCount = 0
let maxQueryMs = 0
const plans: number[] = []
async function request(path: string, auth = actor()) {
  const app = express()
  app.use((_req, res, next) => {
    res.locals.auth = auth
    next()
  })
  app.use('/production', productionDailySummaryRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/production${path}`,
      { headers: { connection: 'close' } }
    )
    // Do not include real response payloads in assertion failure logs.
    return { status: response.status, body: (await response.json()) as Body }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
function reconcile(
  units: Array<Totals & { unitUid: string }>,
  selected: Fact[]
) {
  const expected = new Map<string, Fact[]>()
  for (const fact of selected)
    expected.set(fact.unitUid, [...(expected.get(fact.unitUid) ?? []), fact])
  expect(units.length === expected.size).toBe(true)
  for (const row of units) {
    const group = expected.get(row.unitUid) ?? []
    expect(row.transactionCount === group.length).toBe(true)
    expect(
      scale(row.quantity) ===
        group.reduce((sum, fact) => sum + scale(fact.quantity), 0n)
    ).toBe(true)
    expect(
      scale(row.payableQuantity) ===
        group.reduce((sum, fact) => sum + scale(fact.payable), 0n)
    ).toBe(true)
    if (row.grossAmount !== undefined)
      expect(
        scale(row.grossAmount, 2) ===
          group.reduce((sum, fact) => sum + scale(fact.gross, 2), 0n)
      ).toBe(true)
    const ids = new Set(group.map((fact) => Number(fact.id)))
    expect(
      row.rejectOccurrences ===
        defects
          .filter((defect) => ids.has(Number(defect.transactionId)))
          .reduce((sum, defect) => sum + Number(defect.quantity), 0)
    ).toBe(true)
  }
}

describe.skipIf(process.env.RUN_LOCAL_PRODUCTION_AUDIT !== '1')(
  'M4 real local database (read only)',
  () => {
    beforeAll(async () => {
      const url = new URL(process.env.DATABASE_URL ?? '')
      if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname))
        throw new Error('Audit requires a localhost database')
      connection = await mysql.createConnection(process.env.DATABASE_URL!)
      await connection.query('SET SESSION TRANSACTION READ ONLY')
      await connection.query(
        "SET SESSION sql_mode=CONCAT_WS(',',@@sql_mode,'ONLY_FULL_GROUP_BY')"
      )
      await connection.query('START TRANSACTION READ ONLY')
      const [rows] = await connection.query<
        Fact[]
      >(`SELECT pt.id,pt.uid,e.uid employeeUid,s.code siteCode,pm.uid moduleUid,j.uid jobUid,u.uid unitUid,
      DATE_FORMAT(pt.business_date,'%Y-%m-%d') date,pt.status,CAST(pt.quantity AS CHAR) quantity,
      CAST(pt.payable_quantity AS CHAR) payable,CAST(pt.gross_amount AS CHAR) gross
      FROM production_transactions pt JOIN employees e ON e.id=pt.employee_id JOIN sites s ON s.id=pt.site_id
      JOIN production_jobs j ON j.id=pt.production_job_id JOIN work_units u ON u.id=pt.unit_id LEFT JOIN production_modules pm ON pm.id=pt.production_module_id`)
      facts = rows
      ;[defects] = await connection.query<RowDataPacket[]>(
        'SELECT h.production_transaction_id transactionId,d.quantity FROM production_transaction_qc h JOIN production_transaction_qc_defects d ON d.production_transaction_qc_id=h.id'
      )
      ;[peers] = await connection.query<
        RowDataPacket[]
      >(`SELECT linting_transaction_id sourceId,batil_transaction_id targetId FROM production_transaction_pairs
      UNION ALL SELECT production_transaction_id,replacement_transaction_id FROM production_transaction_revisions WHERE replacement_transaction_id IS NOT NULL`)
      state.query.mockImplementation(
        async (sql: string, values: unknown[] = []) => {
          if (!/^\s*SELECT\b/i.test(sql))
            throw new Error('Audit permits SELECT only')
          const start = performance.now()
          const result = await connection.query(sql, values)
          maxQueryMs = Math.max(maxQueryMs, performance.now() - start)
          if (sqlCount++ < 12) {
            const [plan] = await connection.query<RowDataPacket[]>(
              'EXPLAIN ' + sql,
              values
            )
            plans.push(...plan.map((row) => Number(row.rows ?? 0)))
          }
          return result
        }
      )
    })
    afterAll(async () => {
      if (connection) {
        await connection.rollback()
        await connection.end()
      }
      if (facts.length) {
        const directory = new URL('../../../../artifacts/', import.meta.url)
        await mkdir(directory, { recursive: true })
        await writeFile(
          new URL('production-summary-m4.json', directory),
          JSON.stringify(
            {
              localReadOnly: true,
              transactions: facts.length,
              posted: facts.filter((fact) => fact.status === 'POSTED').length,
              voided: facts.filter((fact) => fact.status === 'VOID').length,
              dates: new Set(facts.map((fact) => fact.date)).size,
              modules: new Set(facts.map((fact) => fact.moduleUid)).size,
              relatedPairsAndRevisions: peers.length,
              selectCount: sqlCount,
              maxQueryMs: Math.round(maxQueryMs),
              maxExplainRows: Math.max(0, ...plans),
            },
            null,
            2
          )
        )
      }
    })

    it('reconciles each historical day/job/unit against independent raw facts and defect rows', async () => {
      expect(facts.length > 0).toBe(true)
      for (const date of [...new Set(facts.map((fact) => fact.date))]) {
        state.today = date // Replay this dataset day in this isolated test, not the application clock.
        const selected = facts.filter(
          (fact) => fact.date === date && fact.status === 'POSTED'
        )
        const result = await request(`/daily-summary?date=${date}`)
        expect(result.status).toBe(200)
        expect(
          result.body.tabs.length ===
            new Set(selected.map((fact) => fact.jobUid)).size
        ).toBe(true)
        for (const tab of result.body.tabs) {
          const jobFacts = selected.filter((fact) => fact.jobUid === tab.jobUid)
          reconcile(tab.units, jobFacts)
          const workers = await request(
            `/daily-summary/employees?date=${date}&jobUid=${tab.jobUid}&pageSize=1`
          )
          expect(workers.status).toBe(200)
          const groupKeys = new Set(
            jobFacts.map(
              (fact) => `${fact.employeeUid}:${fact.siteCode}:${fact.unitUid}`
            )
          )
          expect(workers.body.total === groupKeys.size).toBe(true)
          expect(workers.body.items.length).toBe(1)
          const worker = workers.body.items[0]
          const detail = await request(
            `/daily-summary/employees/${worker.employee.uid}/transactions?date=${date}&jobUid=${tab.jobUid}&site=${worker.site.code}&unitUid=${worker.unit.uid}`
          )
          expect(detail.status).toBe(200)
          expect(
            detail.body.total ===
              jobFacts.filter(
                (fact) =>
                  fact.employeeUid === worker.employee.uid &&
                  fact.siteCode === worker.site.code &&
                  fact.unitUid === worker.unit.uid
              ).length
          ).toBe(true)
        }
      }
    }, 30_000)

    it('reconciles QC module intersection including inaccessible pair/revision peers without financial data', async () => {
      for (const moduleUid of [
        ...new Set(
          facts
            .map((fact) => fact.moduleUid)
            .filter((uid): uid is string => uid !== null)
        ),
      ]) {
        for (const date of [...new Set(facts.map((fact) => fact.date))]) {
          state.today = date
          const auth = { ...actor('QC'), productionModuleAccess: [moduleUid] }
          const visible = facts.filter(
            (fact) =>
              fact.date === date &&
              fact.status === 'POSTED' &&
              fact.moduleUid === moduleUid &&
              !peers.some((peer) => {
                if (
                  Number(peer.sourceId) !== Number(fact.id) &&
                  Number(peer.targetId) !== Number(fact.id)
                )
                  return false
                return facts.some(
                  (other) =>
                    [Number(peer.sourceId), Number(peer.targetId)].includes(
                      Number(other.id)
                    ) && other.moduleUid !== moduleUid
                )
              })
          )
          const result = await request('/daily-summary', auth)
          expect(result.status).toBe(200)
          expect(result.body.canViewWages).toBe(false)
          expect(
            /grossAmount|rateSnapshot/.test(JSON.stringify(result.body))
          ).toBe(false)
          expect(
            result.body.tabs.length ===
              new Set(visible.map((fact) => fact.jobUid)).size
          ).toBe(true)
          for (const tab of result.body.tabs)
            reconcile(
              tab.units,
              visible.filter((fact) => fact.jobUid === tab.jobUid)
            )
        }
      }
    }, 30_000)
  }
)
