import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildAttendanceValidationWorkbook,
  parseAttendanceWorkbook,
} from './attendance-import-workbook'

function workbookFile(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    'Attendance'
  )
  const content = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  return new File([content], 'attendance.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

describe('parser import Attendance', () => {
  it('mendukung multi tanggal, jam Excel, dan mengabaikan baris kosong', async () => {
    const rows = await parseAttendanceWorkbook(
      workbookFile([
        [
          'TANGGAL',
          'NOMOR_KARYAWAN',
          'NAMA_KARYAWAN',
          'STATUS',
          'JAM_MASUK',
          'JAM_PULANG',
          'KETERANGAN',
        ],
        ['03/09/2026', 'PKDS-001', 'Siti', 'hadir', '7:05', '15:00', ''],
        ['2026-09-04', 'PKDS-002', 'Wati', 'ijin', '', '', 'Urusan keluarga'],
        ['2026-09-04', 'PKDS-003', 'Aminah', '', '', '', ''],
      ])
    )
    expect(rows).toEqual([
      {
        rowNumber: 2,
        businessDate: '2026-09-03',
        employeeNumber: 'PKDS-001',
        employeeName: 'Siti',
        status: 'HADIR',
        clockIn: '07:05',
        clockOut: '15:00',
        notes: '',
      },
      {
        rowNumber: 3,
        businessDate: '2026-09-04',
        employeeNumber: 'PKDS-002',
        employeeName: 'Wati',
        status: 'IZIN',
        clockIn: '',
        clockOut: '',
        notes: 'Urusan keluarga',
      },
    ])
  })

  it('menolak template dengan header yang berubah', async () => {
    await expect(
      parseAttendanceWorkbook(
        workbookFile([
          [
            'NOMOR_KARYAWAN',
            'TANGGAL',
            'NAMA_KARYAWAN',
            'STATUS',
            'JAM_MASUK',
            'JAM_PULANG',
            'KETERANGAN',
          ],
        ])
      )
    ).rejects.toThrow('Header wajib berurutan')
  })

  it('menyertakan keterangan validasi lengkap dalam workbook hasil', () => {
    const workbook = buildAttendanceValidationWorkbook({
      total: 1,
      valid: 1,
      invalid: 0,
      warnings: 1,
      rows: [
        {
          rowNumber: 2,
          businessDate: '2026-09-03',
          employeeNumber: 'PKDS-001',
          employeeName: 'Siti',
          status: 'HADIR',
          clockIn: '07:00',
          clockOut: '',
          notes: '',
          valid: true,
          message: 'Siap diimpor.',
          warning: 'Jam pulang belum lengkap.',
          site: 'JEPARA',
          siteName: 'Site Jepara',
          shiftName: 'Shift Borongan',
          attendanceStatus: 'PRESENT',
          calendarDayType: 'WORKDAY',
        },
      ],
    })
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(
      workbook.Sheets.Attendance,
      { header: 1, raw: true, defval: '' }
    )
    expect(matrix[0]?.slice(0, 7)).toEqual([
      'TANGGAL',
      'NOMOR_KARYAWAN',
      'NAMA_KARYAWAN',
      'STATUS',
      'JAM_MASUK',
      'JAM_PULANG',
      'KETERANGAN',
    ])
    expect(matrix[1]).toContain('PERINGATAN')
    expect(matrix[1]).toContain(
      'Siap diimpor. Peringatan: Jam pulang belum lengkap.'
    )
  })
})
