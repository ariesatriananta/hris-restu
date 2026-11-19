import { z } from 'zod'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { pool } from '../db.js'
import { loadAttendanceRateSource } from '../lib/attendance-rate-source.js'
import {
  attendanceRateDate,
  attendanceRateWindow,
  buildAttendanceRate,
} from '../lib/attendance-rate.js'
import { businessDate } from '../lib/contract-lifecycle.js'
import { ApiError } from '../lib/errors.js'
import { isQc } from '../lib/production-module-access.js'
import { authenticate, type AuthContext } from '../middleware/authenticate.js'

export const attendanceRateRouter = Router()
attendanceRateRouter.use(authenticate)
attendanceRateRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store')
  const auth = res.locals.auth as AuthContext
  const superadmin = auth.roles.includes('SUPER_ADMIN')
  if (
    isQc(auth) ||
    (!superadmin &&
      (!auth.roles.includes('HR_OFFICER') ||
        !auth.permissions.includes('attendance.view') ||
        !auth.permissions.includes('production.view')))
  )
    return next(
      new ApiError(
        403,
        'Attendance Rate hanya tersedia untuk HR atau Superadmin dengan akses Attendance dan Produksi.'
      )
    )
  next()
})

attendanceRateRouter.get('/options', async (_req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const global = auth.roles.includes('SUPER_ADMIN')
    const [sites] = await pool.query<RowDataPacket[]>(
      `SELECT uid,code,name FROM sites WHERE is_active=1 ${global ? '' : `AND code IN (${auth.siteAccess.map(() => '?').join(',') || 'NULL'})`} ORDER BY name`,
      global ? [] : auth.siteAccess
    )
    res.json({
      sites: sites.map((row) => ({
        uid: row.uid,
        code: row.code,
        name: row.name,
      })),
      serverToday: businessDate(),
    })
  } catch (error) {
    next(error)
  }
})

attendanceRateRouter.get('/', async (req, res, next) => {
  try {
    const auth = res.locals.auth as AuthContext
    const siteCode = z
      .enum(['JEPARA', 'SEMARANG', 'KLATEN'])
      .parse(req.query.site)
    const today = businessDate()
    const date = attendanceRateDate.parse(req.query.date ?? today)
    attendanceRateWindow(date)
    if (date > today)
      throw new ApiError(
        422,
        'Tanggal Attendance Rate tidak boleh di masa depan.'
      )
    if (
      !auth.roles.includes('SUPER_ADMIN') &&
      !auth.siteAccess.includes(siteCode)
    )
      throw new ApiError(403, 'Akses site ditolak.')
    const conn = await pool.getConnection()
    let started = false
    try {
      await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
      await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY')
      started = true
      const [sites] = await conn.query<RowDataPacket[]>(
        'SELECT id,uid,code,name FROM sites WHERE code=? AND is_active=1',
        [siteCode]
      )
      if (!sites[0]) throw new ApiError(404, 'Site aktif tidak ditemukan.')
      const row = sites[0]
      const source = await loadAttendanceRateSource(
        conn,
        { id: Number(row.id), uid: row.uid, code: row.code, name: row.name },
        date
      )
      const result = buildAttendanceRate(source, date)
      await conn.commit()
      res.json({ data: result, meta: { serverToday: today } })
    } catch (error) {
      if (started) await conn.rollback()
      throw error
    } finally {
      conn.release()
    }
  } catch (error) {
    next(error)
  }
})
