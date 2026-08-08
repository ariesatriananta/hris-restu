import { z } from 'zod'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { env } from '../config.js'
import { pool } from '../db.js'
import { ApiError } from '../lib/errors.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCode = z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])
const employeeType = z.enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING'])
const employeeStatus = z.enum(['ACTIVE', 'LEAVE', 'RESIGNED', 'INACTIVE'])
const listQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
  query: z.string().trim().max(150).optional(),
  site: z.string().optional(),
  employeeType: z.string().optional(),
  employeeStatus: z.string().optional(),
})
const printDataInput = z
  .object({
    employeeUids: z.array(z.string().uuid()).min(1).max(100),
  })
  .strict()

const idCardSelect = `SELECT
  e.uid,e.employee_number employeeNumber,e.barcode,e.full_name fullName,
  et.code employeeType,es.code employeeStatus,s.code site,p.name position,
  pm.name productionModule,ps.name productionSection,
  f.uid photoUid,f.storage_path photoPath
FROM employees e
JOIN employee_types et ON et.id=e.employee_type_id
JOIN employee_statuses es ON es.id=e.employee_status_id
JOIN sites s ON s.id=e.current_site_id
LEFT JOIN positions p ON p.id=e.current_position_id
LEFT JOIN production_module_sections pms ON pms.id=e.current_production_module_section_id
LEFT JOIN production_modules pm ON pm.id=pms.production_module_id
LEFT JOIN production_sections ps ON ps.id=pms.production_section_id
LEFT JOIN files f ON f.id=e.photo_file_id`

function csvValues<T extends string>(
  raw: string | undefined,
  schema: z.ZodType<T>,
  fallback?: T[]
) {
  if (!raw) return fallback ?? []
  return [
    ...new Set(
      raw
        .split(',')
        .filter(Boolean)
        .map((value) => schema.parse(value))
    ),
  ]
}

function enforceSites(auth: AuthContext, sites: string[]) {
  if (auth.roles.includes('SUPER_ADMIN')) return
  if (sites.some((site) => !auth.siteAccess.includes(site))) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

function scope(auth: AuthContext, column = 's.code') {
  if (auth.roles.includes('SUPER_ADMIN')) {
    return { sql: '1=1', values: [] as string[] }
  }
  return {
    sql: `${column} IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`,
    values: auth.siteAccess,
  }
}

function photoUrl(path: unknown) {
  if (!path) return undefined
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/${String(path)}`
}

function mapIdCard(row: RowDataPacket) {
  const barcode = String(row.barcode)
  return {
    uid: String(row.uid),
    employeeNumber: String(row.employeeNumber),
    fullName: String(row.fullName),
    employeeType: String(row.employeeType),
    employeeStatus: String(row.employeeStatus),
    site: String(row.site),
    position: row.position ? String(row.position) : null,
    productionModule: row.productionModule
      ? String(row.productionModule)
      : null,
    productionSection: row.productionSection
      ? String(row.productionSection)
      : null,
    photo:
      row.photoUid && row.photoPath
        ? { uid: String(row.photoUid), url: photoUrl(row.photoPath) }
        : null,
    machineReadable: {
      version: 1,
      barcodePayload: barcode,
      qrPayload: barcode,
    },
  }
}

export const employeeIdCardsRouter = Router()

employeeIdCardsRouter.get(
  '/id-cards',
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = listQuery.parse(req.query)
      const auth = res.locals.auth as AuthContext
      const sites = csvValues(input.site, siteCode)
      const types = csvValues(input.employeeType, employeeType)
      const statuses = csvValues(input.employeeStatus, employeeStatus, [
        'ACTIVE',
      ])
      enforceSites(auth, sites)

      const where: string[] = []
      const values: unknown[] = []
      const addList = (column: string, items: string[]) => {
        if (!items.length) return
        where.push(`${column} IN (${items.map(() => '?').join(',')})`)
        values.push(...items)
      }
      const scoped = scope(auth)
      where.push(scoped.sql)
      values.push(...scoped.values)
      addList('s.code', sites)
      addList('et.code', types)
      addList('es.code', statuses)
      if (input.query) {
        where.push(
          '(e.full_name LIKE ? OR e.employee_number LIKE ? OR e.barcode LIKE ?)'
        )
        const query = `%${input.query}%`
        values.push(query, query, query)
      }
      const clause = where.join(' AND ')
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total FROM employees e
         JOIN employee_types et ON et.id=e.employee_type_id
         JOIN employee_statuses es ON es.id=e.employee_status_id
         JOIN sites s ON s.id=e.current_site_id
         WHERE ${clause}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `${idCardSelect} WHERE ${clause}
         ORDER BY s.code,e.full_name,e.employee_number
         LIMIT ? OFFSET ?`,
        [...values, input.pageSize, (input.page - 1) * input.pageSize]
      )
      res.json({
        items: rows.map(mapIdCard),
        total: Number(countRows[0]?.total ?? 0),
        page: input.page,
        pageSize: input.pageSize,
      })
    } catch (error) {
      next(error)
    }
  }
)

employeeIdCardsRouter.post(
  '/id-cards/print-data',
  requirePermission('employees.view'),
  async (req, res, next) => {
    try {
      const input = printDataInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const employeeUids = [...new Set(input.employeeUids)]
      const scoped = scope(auth)
      const [rows] = await pool.query<RowDataPacket[]>(
        `${idCardSelect}
         WHERE e.uid IN (${employeeUids.map(() => '?').join(',')})
           AND es.code='ACTIVE' AND ${scoped.sql}`,
        [...employeeUids, ...scoped.values]
      )
      if (rows.length !== employeeUids.length) {
        throw new ApiError(
          422,
          'Semua karyawan harus aktif dan berada dalam akses site Anda.'
        )
      }
      const byUid = new Map(
        rows.map((row) => [String(row.uid), mapIdCard(row)] as const)
      )
      res.json({
        generatedAt: new Date().toISOString(),
        items: employeeUids.map((uid) => byUid.get(uid)),
      })
    } catch (error) {
      next(error)
    }
  }
)
