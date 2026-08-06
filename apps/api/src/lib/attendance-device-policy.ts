import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from './errors.js'

const crockfordAlphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const deviceInput = z
  .object({
    siteCode: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']),
    code: z.string().trim().min(1).max(50),
    name: z.string().trim().min(1).max(150),
    deviceType: z.enum([
      'MOBILE_CAMERA',
      'USB_SCANNER',
      'TERMINAL',
      'OTHER',
    ]),
    locationDescription: z
      .string()
      .trim()
      .max(255)
      .optional()
      .nullable()
      .transform((value) => value || undefined),
    isActive: z.boolean().default(true),
  })
  .strict()

export const activationInput = z
  .object({
    activationCode: z
      .string()
      .trim()
      .transform(normalizeActivationCode)
      .pipe(
        z
          .string()
          .length(12)
          .regex(/^[0-9A-HJKMNP-TV-Z]+$/, 'Kode aktivasi tidak valid.')
      ),
  })
  .strict()

export const terminalScanInput = z
  .object({
    eventType: z.enum(['CLOCK_IN', 'CLOCK_OUT']),
    barcode: z.string().trim().min(1).max(100),
    idempotencyKey: z.string().uuid(),
  })
  .strict()

export function normalizeActivationCode(value: string) {
  return value.replaceAll('-', '').replaceAll(' ', '').toUpperCase()
}

export function generateActivationCode() {
  const bytes = randomBytes(12)
  const raw = Array.from(
    bytes,
    (value) => crockfordAlphabet[value & 31]
  ).join('')
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`
}

export function generateDeviceToken() {
  return randomBytes(32).toString('base64url')
}

export function hashDeviceSecret(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function shiftBusinessDate(input: {
  currentDate: string
  previousDate: string
  currentTime: string
  endTime: string
  crossesMidnight: boolean
}) {
  return input.crossesMidnight && input.currentTime <= input.endTime
    ? input.previousDate
    : input.currentDate
}

export function isoWeekday(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  return weekday === 0 ? 7 : weekday
}

export function nextDate(date: string) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + 1)
  return value.toISOString().slice(0, 10)
}

export function selectClosestShiftEnd<T extends {
  effectiveFrom: string
  effectiveTo?: string | null
  workDays: number[]
  endTime: string
  crossesMidnight: boolean
}>(input: {
  assignments: T[]
  currentDate: string
  previousDate: string
  currentTime: string
}) {
  const scanAt = Date.parse(`${input.currentDate}T${input.currentTime}Z`)
  const candidates = input.assignments.flatMap((assignment) =>
    [input.previousDate, input.currentDate]
      .filter(
        (businessDate) =>
          assignment.effectiveFrom <= businessDate &&
          (!assignment.effectiveTo || assignment.effectiveTo >= businessDate) &&
          assignment.workDays.includes(isoWeekday(businessDate))
      )
      .map((businessDate) => {
        const endDate = assignment.crossesMidnight
          ? nextDate(businessDate)
          : businessDate
        return {
          assignment,
          businessDate,
          distanceMs: Math.abs(
            Date.parse(`${endDate}T${assignment.endTime}Z`) - scanAt
          ),
        }
      })
  )
  candidates.sort((left, right) => left.distanceMs - right.distanceMs)
  const closest = candidates[0]
  if (
    closest &&
    candidates.some(
      (candidate) =>
        candidate.distanceMs === closest.distanceMs &&
        candidate.assignment !== closest.assignment
    )
  ) {
    throw new ApiError(
      409,
      'Assignment Shift karyawan ambigu. Hubungi HR untuk koreksi.'
    )
  }
  return closest
}

export function selectSingleOpenAttendance<T>(records: T[]) {
  if (!records.length) {
    throw new ApiError(422, 'Clock out ditolak karena clock in belum tercatat.')
  }
  if (records.length > 1) {
    throw new ApiError(
      409,
      'Terdapat lebih dari satu Attendance terbuka. Hubungi HR untuk koreksi.'
    )
  }
  return records[0]
}

export function canClockInExistingAttendance(status: string) {
  return status === 'PRESENT'
}
