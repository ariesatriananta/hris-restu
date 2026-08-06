import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { pool } from '../db.js'
import {
  activationInput,
  deviceInput,
  generateActivationCode,
  generateDeviceToken,
  hashDeviceSecret,
} from '../lib/attendance-device-policy.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import {
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const siteCodes = ['JEPARA', 'SEMARANG', 'KLATEN'] as const
const deviceTypes = [
  'MOBILE_CAMERA',
  'USB_SCANNER',
  'TERMINAL',
  'OTHER',
] as const
const routeParam = (value: string | string[]) =>
  Array.isArray(value) ? value[0] : value

function listFilter<T extends string>(raw: unknown, allowed: readonly T[]) {
  return String(raw ?? '')
    .split(',')
    .filter((value): value is T => allowed.includes(value as T))
}

function pageParams(page: unknown, pageSize: unknown) {
  const parsedPage = Number(page ?? 1)
  const parsedPageSize = Number(pageSize ?? 50)
  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    pageSize:
      Number.isInteger(parsedPageSize) && parsedPageSize > 0
        ? Math.min(500, parsedPageSize)
        : 50,
  }
}

function scopeWhere(auth: AuthContext, column = 's.code') {
  return auth.roles.includes('SUPER_ADMIN')
    ? { sql: '1=1', params: [] as string[] }
    : {
        sql: `${column} IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`,
        params: auth.siteAccess,
      }
}

function enforceSite(auth: AuthContext, site: string) {
  if (!auth.roles.includes('SUPER_ADMIN') && !auth.siteAccess.includes(site)) {
    throw new ApiError(403, 'Akses site ditolak.')
  }
}

async function getDeviceForUpdate(conn: PoolConnection, uid: string) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT d.id,d.uid,d.site_id siteId,d.code,d.name,d.device_type deviceType,
            d.location_description locationDescription,d.is_active isActive,
            d.device_token_hash deviceTokenHash,d.activation_code_hash activationCodeHash,
            d.activation_code_expires_at activationCodeExpiresAt,d.activated_at activatedAt,
            s.code site,s.name siteName
       FROM scan_devices d
       JOIN sites s ON s.id=d.site_id
      WHERE d.uid=?
      FOR UPDATE`,
    [uid]
  )
  if (!rows[0]) throw new ApiError(404, 'Perangkat Attendance tidak ditemukan.')
  return rows[0]
}

export const attendanceDevicesRouter = Router()

attendanceDevicesRouter.get(
  '/devices',
  requirePermission('attendance.manage_device'),
  async (req, res, next) => {
    try {
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const where = ['1=1']
      const values: unknown[] = []
      const query = String(req.query.query ?? '').trim()
      if (query) {
        where.push(
          '(d.code LIKE ? OR d.name LIKE ? OR d.location_description LIKE ?)'
        )
        values.push(`%${query}%`, `%${query}%`, `%${query}%`)
      }
      const sites = listFilter(req.query.site, siteCodes)
      if (sites.length) {
        where.push(`s.code IN (${sites.map(() => '?').join(',')})`)
        values.push(...sites)
      }
      const types = listFilter(req.query.deviceType, deviceTypes)
      if (types.length) {
        where.push(`d.device_type IN (${types.map(() => '?').join(',')})`)
        values.push(...types)
      }
      const activeValues = listFilter(req.query.isActive, [
        'true',
        'false',
      ] as const)
      if (activeValues.length === 1) {
        where.push('d.is_active=?')
        values.push(activeValues[0] === 'true' ? 1 : 0)
      }
      const scope = scopeWhere(res.locals.auth as AuthContext)
      where.push(scope.sql)
      values.push(...scope.params)
      const clause = where.join(' AND ')
      const from = 'FROM scan_devices d JOIN sites s ON s.id=d.site_id'
      const [countRows] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) total ${from} WHERE ${clause}`,
        values
      )
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT d.uid,d.code,d.name,s.code site,s.name siteName,
                d.device_type deviceType,d.location_description locationDescription,
                DATE_FORMAT(d.last_seen_at,'%Y-%m-%dT%H:%i:%s+07:00') lastSeenAt,
                d.is_active isActive,(d.device_token_hash IS NOT NULL) isActivated,
                (d.activation_code_hash IS NOT NULL AND d.activation_code_expires_at>NOW(3)) activationPending,
                DATE_FORMAT(d.activation_code_expires_at,'%Y-%m-%dT%H:%i:%s+07:00') activationCodeExpiresAt,
                (SELECT COUNT(*) FROM attendance_scan_events ase WHERE ase.device_id=d.id) scanCount
           ${from}
          WHERE ${clause}
          ORDER BY d.created_at DESC,d.id DESC
          LIMIT ? OFFSET ?`,
        [...values, pageSize, (page - 1) * pageSize]
      )
      res.json({
        items: rows.map((row) => ({
          ...row,
          isActive: Number(row.isActive) === 1,
          isActivated: Number(row.isActivated) === 1,
          activationPending: Number(row.activationPending) === 1,
          scanCount: Number(row.scanCount),
        })),
        total: Number(countRows[0]?.total ?? 0),
        page,
        pageSize,
      })
    } catch (error) {
      next(error)
    }
  }
)

attendanceDevicesRouter.post(
  '/devices',
  requirePermission('attendance.manage_device'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = deviceInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      enforceSite(auth, input.siteCode)
      const activationCode = generateActivationCode()
      const uid = randomUUID()
      await conn.beginTransaction()
      const [sites] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM sites WHERE code=? AND is_active=1 FOR UPDATE',
        [input.siteCode]
      )
      if (!sites[0]) throw new ApiError(422, 'Site tidak valid atau tidak aktif.')
      await conn.execute(
        `INSERT INTO scan_devices
          (uid,site_id,code,name,device_type,location_description,is_active,
           activation_code_hash,activation_code_expires_at,created_by,updated_by)
         VALUES(?,?,?,?,?,?,?, ?,DATE_ADD(NOW(3),INTERVAL 15 MINUTE),?,?)`,
        [
          uid,
          sites[0].id,
          input.code.toUpperCase(),
          input.name,
          input.deviceType,
          input.locationDescription ?? null,
          input.isActive ? 1 : 0,
          hashDeviceSecret(activationCode.replaceAll('-', '')),
          auth.id,
          auth.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: sites[0].id,
          action: 'CREATE',
          table: 'scan_devices',
          recordUid: uid,
          description: `Menambah perangkat Attendance ${input.name}.`,
          afterData: {
            siteCode: input.siteCode,
            code: input.code.toUpperCase(),
            name: input.name,
            deviceType: input.deviceType,
            locationDescription: input.locationDescription ?? null,
            isActive: input.isActive,
          },
        },
        conn
      )
      const [expiryRows] = await conn.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(activation_code_expires_at,'%Y-%m-%dT%H:%i:%s+07:00') activationCodeExpiresAt
           FROM scan_devices WHERE uid=?`,
        [uid]
      )
      await conn.commit()
      res.status(201).json({
        uid,
        activationCode,
        activationCodeExpiresAt: expiryRows[0].activationCodeExpiresAt,
      })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

attendanceDevicesRouter.post(
  '/devices/activate',
  requirePermission('attendance.scan'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = activationInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      await conn.beginTransaction()
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT d.id,d.uid,d.code,d.name,d.device_type deviceType,d.is_active isActive,
                s.id siteId,s.code site,s.name siteName
           FROM scan_devices d
           JOIN sites s ON s.id=d.site_id
          WHERE d.activation_code_hash=?
            AND d.activation_code_expires_at>NOW(3)
          FOR UPDATE`,
        [hashDeviceSecret(input.activationCode)]
      )
      const device = rows[0]
      if (!device) throw new ApiError(422, 'Kode aktivasi tidak valid atau kedaluwarsa.')
      enforceSite(auth, device.site)
      if (Number(device.isActive) !== 1) {
        throw new ApiError(409, 'Perangkat Attendance sedang nonaktif.')
      }
      const deviceToken = generateDeviceToken()
      await conn.execute(
        `UPDATE scan_devices
            SET device_token_hash=?,activation_code_hash=NULL,
                activation_code_expires_at=NULL,activated_at=NOW(3),
                activated_by=?,last_seen_at=NOW(3),updated_by=?
          WHERE id=?`,
        [hashDeviceSecret(deviceToken), auth.id, auth.id, device.id]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: device.siteId,
          action: 'UPDATE',
          table: 'scan_devices',
          recordId: device.id,
          recordUid: device.uid,
          description: `Mengaktifkan perangkat Attendance ${device.name}.`,
          afterData: { activated: true },
        },
        conn
      )
      await conn.commit()
      res.json({
        device: {
          uid: device.uid,
          code: device.code,
          name: device.name,
          site: device.site,
          deviceType: device.deviceType,
        },
        deviceToken,
      })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

attendanceDevicesRouter.patch(
  '/devices/:uid',
  requirePermission('attendance.manage_device'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const input = deviceInput.parse(req.body)
      const auth = res.locals.auth as AuthContext
      const uid = routeParam(req.params.uid)
      await conn.beginTransaction()
      const device = await getDeviceForUpdate(conn, uid)
      enforceSite(auth, device.site)
      if (device.site !== input.siteCode) {
        throw new ApiError(422, 'Site perangkat tidak dapat diubah.')
      }
      await conn.execute(
        `UPDATE scan_devices
            SET code=?,name=?,device_type=?,location_description=?,is_active=?,updated_by=?
          WHERE id=?`,
        [
          input.code.toUpperCase(),
          input.name,
          input.deviceType,
          input.locationDescription ?? null,
          input.isActive ? 1 : 0,
          auth.id,
          device.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: device.siteId,
          action: 'UPDATE',
          table: 'scan_devices',
          recordId: device.id,
          recordUid: uid,
          description: `Memperbarui perangkat Attendance ${input.name}.`,
          beforeData: {
            code: device.code,
            name: device.name,
            deviceType: device.deviceType,
            locationDescription: device.locationDescription,
            isActive: Number(device.isActive) === 1,
          },
          afterData: {
            code: input.code.toUpperCase(),
            name: input.name,
            deviceType: input.deviceType,
            locationDescription: input.locationDescription ?? null,
            isActive: input.isActive,
          },
        },
        conn
      )
      await conn.commit()
      res.status(204).end()
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

attendanceDevicesRouter.post(
  '/devices/:uid/regenerate-activation',
  requirePermission('attendance.manage_device'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const uid = routeParam(req.params.uid)
      const auth = res.locals.auth as AuthContext
      const activationCode = generateActivationCode()
      await conn.beginTransaction()
      const device = await getDeviceForUpdate(conn, uid)
      enforceSite(auth, device.site)
      if (Number(device.isActive) !== 1) {
        throw new ApiError(409, 'Aktifkan perangkat sebelum membuat kode aktivasi.')
      }
      await conn.execute(
        `UPDATE scan_devices
            SET device_token_hash=NULL,activation_code_hash=?,
                activation_code_expires_at=DATE_ADD(NOW(3),INTERVAL 15 MINUTE),
                activated_at=NULL,activated_by=NULL,updated_by=?
          WHERE id=?`,
        [
          hashDeviceSecret(activationCode.replaceAll('-', '')),
          auth.id,
          device.id,
        ]
      )
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: device.siteId,
          action: 'UPDATE',
          table: 'scan_devices',
          recordId: device.id,
          recordUid: uid,
          description: `Membuat ulang kode aktivasi perangkat Attendance ${device.name}.`,
          beforeData: { activated: Boolean(device.deviceTokenHash) },
          afterData: { activated: false, activationPending: true },
        },
        conn
      )
      const [expiryRows] = await conn.query<RowDataPacket[]>(
        `SELECT DATE_FORMAT(activation_code_expires_at,'%Y-%m-%dT%H:%i:%s+07:00') activationCodeExpiresAt
           FROM scan_devices WHERE id=?`,
        [device.id]
      )
      await conn.commit()
      res.json({
        activationCode,
        activationCodeExpiresAt: expiryRows[0].activationCodeExpiresAt,
      })
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)

attendanceDevicesRouter.delete(
  '/devices/:uid',
  requirePermission('attendance.manage_device'),
  async (req, res, next) => {
    const conn = await pool.getConnection()
    try {
      const uid = routeParam(req.params.uid)
      const auth = res.locals.auth as AuthContext
      await conn.beginTransaction()
      const device = await getDeviceForUpdate(conn, uid)
      enforceSite(auth, device.site)
      const [usage] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM attendance_scan_events WHERE device_id=? LIMIT 1 FOR UPDATE`,
        [device.id]
      )
      const [attendance] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM attendance_records
          WHERE clock_in_device_id=? OR clock_out_device_id=?
          LIMIT 1 FOR UPDATE`,
        [device.id, device.id]
      )
      if (usage[0] || attendance[0]) {
        throw new ApiError(
          409,
          'Perangkat yang sudah dipakai scan tidak dapat dihapus. Nonaktifkan perangkat.'
        )
      }
      await conn.execute('DELETE FROM scan_devices WHERE id=?', [device.id])
      await writeAudit(
        {
          auth,
          request: req,
          module: 'ATTENDANCE',
          siteId: device.siteId,
          action: 'DELETE',
          table: 'scan_devices',
          recordId: device.id,
          recordUid: uid,
          description: `Menghapus perangkat Attendance ${device.name} yang belum pernah dipakai.`,
          beforeData: {
            code: device.code,
            name: device.name,
            deviceType: device.deviceType,
          },
        },
        conn
      )
      await conn.commit()
      res.status(204).end()
    } catch (error) {
      await conn.rollback()
      next(error)
    } finally {
      conn.release()
    }
  }
)
