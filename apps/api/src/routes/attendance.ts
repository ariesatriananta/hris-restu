import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { pool } from '../db.js'
import { attendanceCapabilities } from '../lib/attendance-policy.js'
import {
  authenticate,
  requirePermission,
  type AuthContext,
} from '../middleware/authenticate.js'

const attendanceStatuses = [
  { value: 'PRESENT', label: 'Hadir' },
  { value: 'ABSENT', label: 'Tidak hadir' },
  { value: 'LEAVE', label: 'Cuti' },
  { value: 'SICK', label: 'Sakit' },
  { value: 'PERMISSION', label: 'Izin' },
  { value: 'HOLIDAY', label: 'Libur' },
] as const

const correctionApprovalStatuses = [
  { value: 'PENDING', label: 'Menunggu persetujuan' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'REJECTED', label: 'Ditolak' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
] as const

const deviceTypes = [
  { value: 'MOBILE_CAMERA', label: 'Kamera HP' },
  { value: 'USB_SCANNER', label: 'Scanner USB' },
  { value: 'TERMINAL', label: 'Terminal' },
  { value: 'OTHER', label: 'Lainnya' },
] as const

export const attendanceRouter = Router()
attendanceRouter.use(authenticate)

attendanceRouter.get(
  '/foundation',
  requirePermission('attendance.view'),
  async (_req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const where = ['s.is_active=1']
      const values: string[] = []

      if (!auth.roles.includes('SUPER_ADMIN')) {
        where.push(
          `s.code IN (${auth.siteAccess.map(() => '?').join(',') || "''"})`
        )
        values.push(...auth.siteAccess)
      }

      const [sites] = await pool.query<RowDataPacket[]>(
        `SELECT s.uid,s.code,s.name,s.timezone
           FROM sites s
          WHERE ${where.join(' AND ')}
          ORDER BY s.name,s.id`,
        values
      )

      res.json({
        capabilities: attendanceCapabilities(auth),
        sites,
        lookups: {
          attendanceStatuses,
          correctionApprovalStatuses,
          deviceTypes,
        },
      })
    } catch (error) {
      next(error)
    }
  }
)
