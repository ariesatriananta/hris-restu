import ExcelJS from 'exceljs'
import { describe, expect, it, vi } from 'vitest'
import {
  buildAttendanceRecapWorkbook,
  summarizeAttendanceRecap,
  type AttendanceRecapCompleteness,
  type AttendanceRecapDetail,
} from './attendance-recap.js'

vi.mock('../db.js', () => ({ pool: {} }))

const detail = (
  value: Partial<AttendanceRecapDetail> &
    Pick<AttendanceRecapDetail, 'businessDate' | 'status' | 'calendarDayType'>
): AttendanceRecapDetail => ({
  employeeUid: '11111111-1111-4111-8111-111111111111',
  employeeNumber: 'JPR260806001',
  employeeName: 'Karyawan Uji',
  dayName: 'Kamis',
  site: 'JEPARA',
  siteName: 'Jepara',
  employeeType: 'BORONGAN',
  department: 'Produksi',
  productionModule: 'Modul A',
  productionSection: 'Bagian A',
  workGroup: 'Grup 1',
  shiftUid: '22222222-2222-4222-8222-222222222222',
  shiftCode: 'PAGI',
  shiftName: 'Shift Pagi',
  shiftStartTime: '07:00',
  shiftEndTime: '15:00',
  virtual: false,
  calendarReasonType: 'SHIFT_WEEKDAY',
  calendarName: null,
  clockInAt: null,
  clockOutAt: null,
  lateMinutes: 0,
  earlyLeaveMinutes: 0,
  workedMinutes: null,
  clockInSource: null,
  clockOutSource: null,
  isCorrected: false,
  notes: null,
  qualityStatus: 'NORMAL',
  abnormalReasons: [],
  ...value,
})

const completeness: AttendanceRecapCompleteness = {
  official: true,
  exportAllowed: true,
  blockedReasons: [],
  sites: [
    { site: 'JEPARA', date: '2026-08-06', status: 'FINALIZED', reasons: [] },
    { site: 'JEPARA', date: '2026-08-07', status: 'NOT_REQUIRED', reasons: [] },
  ],
}

describe('attendance recap summary', () => {
  it('membedakan hadir hari kerja dan hadir pada hari libur/off', () => {
    const groups = summarizeAttendanceRecap([
      detail({
        businessDate: '2026-08-06',
        status: 'PRESENT',
        calendarDayType: 'WORKDAY',
      }),
      detail({
        businessDate: '2026-08-07',
        status: 'PRESENT',
        calendarDayType: 'NON_WORKDAY',
        calendarReasonType: 'WEEKLY_OFF',
        clockInAt: '2026-08-07T07:00:00+07:00',
      }),
    ])
    expect(groups[0]).toMatchObject({
      scheduledDays: 1,
      present: 2,
      presentWorkday: 1,
      presentHoliday: 1,
      weeklyOff: 0,
    })
  })
})

describe('attendance recap workbook', () => {
  it('dapat dibuka ulang dengan tiga sheet, header stabil, dan row virtual/audit utuh', async () => {
    const details = [
      detail({
        businessDate: '2026-08-06',
        status: 'PRESENT',
        calendarDayType: 'WORKDAY',
        clockInAt: '2026-08-06T07:00:00+07:00',
        clockOutAt: '2026-08-06T15:00:00+07:00',
        workedMinutes: 480,
      }),
      detail({
        businessDate: '2026-08-07',
        dayName: 'Jumat',
        status: 'WEEKLY_OFF',
        virtual: true,
        calendarDayType: 'NON_WORKDAY',
        calendarReasonType: 'WEEKLY_OFF',
      }),
    ]
    const buffer = await buildAttendanceRecapWorkbook({
      groups: summarizeAttendanceRecap(details),
      details,
      completeness,
      dateFrom: '2026-08-06',
      dateTo: '2026-08-07',
      generatedAt: '2026-08-08T10:00:00+07:00',
      generatedBy: 'Admin Uji',
      filters: { sites: ['JEPARA'] },
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
    )
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Ringkasan',
      'Detail Harian',
      'Metadata Export',
    ])
    const summaryHeaders = workbook
      .getWorksheet('Ringkasan')!
      .getRow(1)
      .values as unknown[]
    expect(summaryHeaders.slice(1)).toEqual([
      'No',
      'NIK',
      'Nama',
      'Site',
      'Jenis Karyawan',
      'Shift',
      'Hari Terjadwal',
      'Hadir',
      'Hadir Hari Kerja',
      'Hadir Hari Libur',
      'Alpha',
      'Cuti',
      'Sakit',
      'Izin',
      'Libur Resmi',
      'Libur Mingguan',
      'Hari Terlambat',
      'Menit Terlambat',
      'Hari Pulang Cepat',
      'Menit Pulang Cepat',
      'Menit Kerja',
      'Anomali',
    ])
    const daily = workbook.getWorksheet('Detail Harian')!
    expect((daily.getRow(1).values as unknown[]).slice(1)).toEqual([
      'Tanggal',
      'Hari',
      'NIK',
      'Nama',
      'Site Historis',
      'Jenis Karyawan Historis',
      'Departemen',
      'Modul',
      'Bagian',
      'Grup Kerja',
      'Kode Shift',
      'Nama Shift',
      'Jam Shift Masuk',
      'Jam Shift Pulang',
      'Status',
      'Jenis Hari',
      'Alasan Kalender',
      'Nama Kalender',
      'Jam Masuk',
      'Jam Pulang',
      'Menit Terlambat',
      'Menit Pulang Cepat',
      'Menit Kerja',
      'Sumber Masuk',
      'Sumber Pulang',
      'Dikoreksi',
      'Virtual',
      'Catatan',
    ])
    expect(daily.getRow(3).getCell(15).value).toBe('Libur Mingguan')
    expect(daily.getRow(3).getCell(27).value).toBe('Ya')
    const metadata = workbook.getWorksheet('Metadata Export')!
    expect(metadata.getRow(5).values).toEqual([
      undefined,
      'Waktu Ekspor',
      '2026-08-08T10:00:00+07:00',
    ])
    expect(metadata.getRow(11).values).toEqual([
      undefined,
      'Jumlah Libur Mingguan Virtual',
      1,
    ])
  })
})
