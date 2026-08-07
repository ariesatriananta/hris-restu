import { z } from 'zod'

export const attendanceRecapMaxDays = 31

export const recapAttendanceStatuses = [
  'PRESENT',
  'ABSENT',
  'LEAVE',
  'SICK',
  'PERMISSION',
  'HOLIDAY',
  'WEEKLY_OFF',
] as const

export type RecapAttendanceStatus =
  (typeof recapAttendanceStatuses)[number]

export function enumerateRecapDates(dateFrom: string, dateTo: string) {
  const dates: string[] = []
  const cursor = new Date(`${dateFrom}T00:00:00Z`)
  const end = new Date(`${dateTo}T00:00:00Z`)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

export function validateRecapPeriod(dateFrom: string, dateTo: string) {
  if (dateFrom > dateTo) return false
  return enumerateRecapDates(dateFrom, dateTo).length <= attendanceRecapMaxDays
}

export const attendanceRecapPeriodInput = z
  .object({
    dateFrom: z.string().date(),
    dateTo: z.string().date(),
  })
  .refine((value) => validateRecapPeriod(value.dateFrom, value.dateTo), {
    message: `Periode Rekap Attendance maksimal ${attendanceRecapMaxDays} hari.`,
    path: ['dateTo'],
  })

export function recapDayName(date: string) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function isOfficialRecapPeriod(dateFrom: string, goLiveDate: string) {
  return dateFrom >= goLiveDate
}
