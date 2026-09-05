import express from 'express'
import type { AddressInfo } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { errorHandler } from '../lib/errors.js'
import type { AuthContext } from '../middleware/authenticate.js'
import { recruitmentRouter } from './recruitment.js'

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getConnection: vi.fn(),
  writeAudit: vi.fn(),
  getPrivateObject: vi.fn(),
  putEmployeeObject: vi.fn(),
  deleteEmployeeObject: vi.fn(),
  reserveEmployeeNumber: vi.fn(),
}))

vi.mock('../db.js', () => ({
  pool: { query: mocks.query, getConnection: mocks.getConnection },
}))
vi.mock('../lib/audit.js', () => ({ writeAudit: mocks.writeAudit }))
vi.mock('../lib/recruitment-internal-storage.js', () => ({
  getPrivateRecruitmentObject: mocks.getPrivateObject,
}))
vi.mock('../lib/recruitment-conversion-storage.js', () => ({
  employeeRecruitmentObjectKey: (_employeeUid: string, fileUid: string) =>
    `employees/${fileUid}.jpg`,
  putEmployeeRecruitmentObject: mocks.putEmployeeObject,
  deleteEmployeeRecruitmentObject: mocks.deleteEmployeeObject,
}))
vi.mock('../lib/employee-number.js', () => ({
  EmployeeNumberSequenceExhaustedError: class extends Error {},
  reserveEmployeeNumber: mocks.reserveEmployeeNumber,
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
      const auth = res.locals.auth as AuthContext
      if (
        !auth.roles.includes('SUPER_ADMIN') &&
        !auth.permissions.includes(permission)
      ) {
        return res.status(403).json({ message: 'Izin ditolak.' })
      }
      next()
    },
}))

const candidateUid = '11111111-1111-4111-8111-111111111111'
const updatedAt = '2026-09-04T08:00:00.000000'
const hr: AuthContext = {
  id: 7,
  uid: 'hr-jepara',
  name: 'HR Jepara',
  email: null,
  roles: ['HR_OFFICER'],
  permissions: ['recruitment.view', 'recruitment.manage'],
  siteAccess: ['JEPARA'],
}

function candidate(status = 'PASSED', employeeUid: string | null = null) {
  return {
    id: 41,
    siteId: 1,
    uid: candidateUid,
    applicationNumber: 'APL-JEPARA-20260904-ABCDE',
    fullName: 'Pelamar Contoh',
    nationalIdNumber: '3320112233445566',
    familyCardNumber: '3320112233445577',
    gender: 'FEMALE',
    birthPlace: 'Jepara',
    birthDate: '2000-01-02',
    educationLevel: 'SENIOR_SECONDARY',
    address: 'Alamat sesuai KTP',
    phone: '081234567890',
    email: null,
    status,
    updatedAt,
    today: '2026-09-04',
    siteUid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    siteCode: 'JEPARA',
    siteName: 'Site Jepara',
    employeeUid,
  }
}

const sourceFiles = ['PHOTO', 'KTP', 'KK'].map((kind, index) => ({
  kind,
  storagePath: `private/${kind}.jpg`,
  originalName: `${kind}.jpg`,
  mimeType: 'image/jpeg',
  extension: 'jpg',
  sizeBytes: 4,
  checksumSha256: `checksum-${index}`,
}))

const validInput = {
  fullName: 'Pelamar Contoh',
  nickname: null,
  employeeType: 'BORONGAN',
  site: 'JEPARA',
  department: 'Produksi',
  position: 'Operator',
  workGroup: 'Kelompok A',
  productionModuleSectionUid: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  joinDate: '2026-09-04',
  joinDateTraining: null,
  joinDateBorong: null,
  permanentDate: null,
  gender: 'FEMALE',
  birthPlace: 'Jepara',
  birthDate: '2000-01-02',
  educationLevel: 'SENIOR_SECONDARY',
  maritalStatus: null,
  religion: null,
  address: 'Alamat sesuai KTP',
  rtrw: null,
  kelurahan: null,
  kecamatan: null,
  city: null,
  province: null,
  postalCode: null,
  phone: '081234567890',
  email: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  emergencyContactRelation: null,
  nationalIdNumber: '3320112233445566',
  familyCardNumber: '3320112233445577',
  taxNumber: null,
  bankName: null,
  bankAccountNumber: null,
  bankAccountName: null,
  bpjsHealthNumber: null,
  bpjsEmploymentNumber: null,
  notes: null,
}

function conversionConnection(options?: {
  candidateRows?: Record<string, unknown>[]
  replay?: Record<string, unknown>
  duplicate?: Record<string, unknown>
  failEmployeeInsert?: boolean
}) {
  let fileSequence = 100
  const conn = {
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    query: vi.fn(),
    execute: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    release: vi.fn(),
  }
  conn.query.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue)
    if (sql.includes('FROM recruitment_candidates rc') && sql.includes('FOR UPDATE'))
      return [options?.candidateRows ?? [candidate()]]
    if (sql.includes('FROM recruitment_status_events rse'))
      return [options?.replay ? [options.replay] : []]
    if (sql.includes('employee_number_prefix'))
      return [[{ siteId: 1, employeeNumberPrefix: 'KDS', departmentId: 2, positionId: 3, workGroupId: 4, typeId: 5, statusId: 6 }]]
    if (sql.includes('FROM production_module_sections pms')) return [[{ id: 8 }]]
    if (sql.includes('FROM employees') && sql.includes('national_id_number'))
      return [options?.duplicate ? [options.duplicate] : []]
    if (sql.includes('FROM recruitment_candidate_files rcf')) return [sourceFiles]
    throw new Error(`Query belum dimock: ${sql.slice(0, 120)}`)
  })
  conn.execute.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue)
    if (sql.includes('INSERT INTO files')) return [{ insertId: ++fileSequence }]
    if (sql.includes('INSERT INTO employees')) {
      if (options?.failEmployeeInsert) throw new Error('simulated insert failure')
      return [{ insertId: 500 }]
    }
    if (sql.includes('UPDATE recruitment_candidates')) return [{ affectedRows: 1 }]
    return [{ affectedRows: 1, insertId: 600 }]
  })
  return conn
}

async function request(
  path: string,
  options?: RequestInit,
  auth: AuthContext = hr
) {
  const app = express()
  app.use(express.json())
  app.use((_req, res, next) => {
    res.locals.auth = auth
    next()
  })
  app.use('/api/recruitment', recruitmentRouter)
  app.use(errorHandler)
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  try {
    return await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/recruitment${path}`,
      options
    )
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

function convertBody(input = validInput) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      currentUpdatedAt: updatedAt,
      idempotencyKey: 'conversion-request-1',
      input,
    }),
  }
}

describe('Recruitment candidate conversion API', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.writeAudit.mockResolvedValue(undefined)
    mocks.getPrivateObject.mockResolvedValue(Buffer.from('file'))
    mocks.putEmployeeObject.mockResolvedValue(undefined)
    mocks.deleteEmployeeObject.mockResolvedValue(undefined)
    mocks.reserveEmployeeNumber.mockResolvedValue('PKDS-2609-04001')
  })

  it('memberikan prefill kandidat dan pilihan penempatan hanya untuk site kandidat', async () => {
    mocks.query.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue)
      if (sql.includes('FROM recruitment_candidates rc')) return [[candidate()]]
      if (sql.includes('FROM recruitment_candidate_files rcf'))
        return [
          sourceFiles.map((file, index) => ({
            uid: `00000000-0000-4000-8000-00000000000${index}`,
            kind: file.kind,
            originalName: file.originalName,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
          })),
        ]
      if (sql.includes('FROM employee_types'))
        return [[{ code: 'BORONGAN', name: 'Borongan' }]]
      if (sql.includes('FROM departments'))
        return [[{ uid: 'department-uid', code: 'PRD', name: 'Produksi' }]]
      if (sql.includes('FROM positions'))
        return [[{ uid: 'position-uid', code: 'OPR', name: 'Operator' }]]
      if (sql.includes('FROM work_groups')) return [[]]
      if (sql.includes('FROM production_modules'))
        return [[{ uid: 'module-uid', code: 'A', name: 'Modul A' }]]
      if (sql.includes('FROM production_module_sections')) return [[]]
      throw new Error(`Query belum dimock: ${sql.slice(0, 100)}`)
    })
    const response = await request(
      `/candidates/${candidateUid}/conversion-prefill`
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      candidate: { site: { code: string } }
      employeeInput: Record<string, unknown>
      lookups: { departments: Array<{ name: string }> }
    }
    expect(body.candidate.site.code).toBe('JEPARA')
    expect(body.employeeInput).toEqual(
      expect.objectContaining({
        employeeStatus: 'INACTIVE',
        site: 'JEPARA',
        nationalIdNumber: '3320112233445566',
      })
    )
    expect(body.lookups.departments[0].name).toBe('Produksi')
    expect(mocks.query.mock.calls[0][1]).toEqual([candidateUid, 'JEPARA'])
  })

  it('membuat karyawan Nonaktif, histori awal, dokumen, event, dan audit secara atomik', async () => {
    const conn = conversionConnection()
    mocks.getConnection.mockResolvedValue(conn)
    const response = await request(`/candidates/${candidateUid}/convert`, convertBody())
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual(
      expect.objectContaining({
        candidateUid,
        status: 'CONVERTED',
        employee: expect.objectContaining({ employeeNumber: 'PKDS-2609-04001' }),
        replayed: false,
      })
    )
    expect(mocks.putEmployeeObject).toHaveBeenCalledTimes(3)
    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining("change_type,notes,created_by,updated_by"),
      expect.arrayContaining([500, 1, 5, 6, '2026-09-04'])
    )
    const candidateUpdate = conn.execute.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE recruitment_candidates')
    )
    expect(candidateUpdate?.[0]).toContain('converted_by=?')
    expect(candidateUpdate?.[1]).toEqual([500, 7, 7, 41, updatedAt])
    expect(conn.execute.mock.calls.some(([sql]) => String(sql).includes("'SYSTEM'"))).toBe(true)
    expect(mocks.writeAudit).toHaveBeenCalledTimes(2)
    expect(conn.commit).toHaveBeenCalledOnce()
    expect(mocks.deleteEmployeeObject).not.toHaveBeenCalled()
  })

  it('mengembalikan hasil lama saat permintaan identik diulang', async () => {
    const firstKeyConnection = conversionConnection()
    mocks.getConnection.mockResolvedValueOnce(firstKeyConnection)
    const first = await request(`/candidates/${candidateUid}/convert`, convertBody())
    expect(first.status).toBe(201)
    const eventInsert = firstKeyConnection.execute.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO recruitment_status_events')
    )
    const eventKey = eventInsert?.[1]?.[4]

    const replayConnection = conversionConnection({
      candidateRows: [candidate('CONVERTED', 'employee-uid')],
      replay: {
        eventUid: 'event-uid',
        employeeUid: 'employee-uid',
        employeeNumber: 'PKDS-2609-04001',
      },
    })
    mocks.getConnection.mockResolvedValueOnce(replayConnection)
    const replay = await request(`/candidates/${candidateUid}/convert`, convertBody())
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual(
      expect.objectContaining({ replayed: true, status: 'CONVERTED' })
    )
    expect(replayConnection.query.mock.calls[1][1]?.[0]).toBe(eventKey)
    expect(mocks.putEmployeeObject).toHaveBeenCalledTimes(3)
  })

  it('menolak data stale, kandidat lintas site, dan NIK duplikat sebelum menyalin file', async () => {
    const stale = conversionConnection({
      candidateRows: [{ ...candidate(), updatedAt: '2026-09-04T09:00:00.000000' }],
    })
    mocks.getConnection.mockResolvedValueOnce(stale)
    expect((await request(`/candidates/${candidateUid}/convert`, convertBody())).status).toBe(409)

    const crossSite = conversionConnection({ candidateRows: [] })
    mocks.getConnection.mockResolvedValueOnce(crossSite)
    expect((await request(`/candidates/${candidateUid}/convert`, convertBody())).status).toBe(404)

    const duplicate = conversionConnection({
      duplicate: { uid: 'existing', employeeNumber: 'PKDS-OLD' },
    })
    mocks.getConnection.mockResolvedValueOnce(duplicate)
    expect((await request(`/candidates/${candidateUid}/convert`, convertBody())).status).toBe(409)
    expect(mocks.putEmployeeObject).not.toHaveBeenCalled()
  })

  it('rollback database dan membersihkan salinan objek bila penyimpanan gagal', async () => {
    const conn = conversionConnection({ failEmployeeInsert: true })
    mocks.getConnection.mockResolvedValue(conn)
    const response = await request(`/candidates/${candidateUid}/convert`, convertBody())
    expect(response.status).toBe(500)
    expect(conn.rollback).toHaveBeenCalledOnce()
    expect(mocks.deleteEmployeeObject).toHaveBeenCalledTimes(3)
    expect(conn.commit).not.toHaveBeenCalled()
  })

  it('mewajibkan recruitment.manage untuk prefill dan konversi', async () => {
    const viewOnly = { ...hr, permissions: ['recruitment.view'] }
    expect(
      (await request(`/candidates/${candidateUid}/conversion-prefill`, undefined, viewOnly)).status
    ).toBe(403)
    expect(
      (await request(`/candidates/${candidateUid}/convert`, convertBody(), viewOnly)).status
    ).toBe(403)
    expect(mocks.getConnection).not.toHaveBeenCalled()
  })
})
