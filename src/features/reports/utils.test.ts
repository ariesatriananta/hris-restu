import { describe, expect, it } from 'vitest'
import { sidebarData } from '@/components/layout/data/sidebar-data'
import {
  attendanceCorrectionRangeError,
  auditActivityRangeError,
  attendanceClassificationRangeError,
  attendanceRangeError,
  contractRangeError,
  dateLabel,
  defaultAttendanceCorrectionPeriod,
  defaultDeviceScanPeriod,
  defaultAuditActivityPeriod,
  deviceScanRangeError,
  defaultPayrollFinalPeriod,
  defaultHeadcountChangePeriod,
  defaultTenureTurnoverPeriod,
  defaultAttendanceClassificationPeriod,
  headcountChangeRangeError,
  tenureTurnoverRangeError,
  mutationRangeError,
  numberLabel,
  payrollFinalRangeError,
} from './utils'

describe('Pusat Laporan frontend', () => {
  it('melindungi menu Laporan dan tidak lagi menampilkan Template Dokumen', () => {
    const items = sidebarData.navGroups.flatMap((group) => group.items)
    const reports = items.find((item) => item.title === 'Laporan')
    const administration = items.find(
      (item) => item.title === 'Administrasi Sistem'
    )

    expect(reports?.anyOfPermissions).toEqual(['reports.view'])
    expect(reports?.items).toEqual([
      {
        title: 'Karyawan',
        url: '/laporan/karyawan',
        anyOfPermissions: ['employees.view'],
      },
      {
        title: 'Attendance',
        url: '/laporan/attendance',
        anyOfPermissions: ['attendance.view'],
      },
      {
        title: 'Cuti, Sakit & Izin',
        url: '/laporan/cuti-sakit-izin',
        anyOfPermissions: ['attendance.view'],
      },
      {
        title: 'Koreksi Attendance',
        url: '/laporan/koreksi-attendance',
        anyOfPermissions: ['attendance.view'],
      },
      {
        title: 'Penugasan Shift',
        url: '/laporan/penugasan-shift',
        anyOfPermissions: ['attendance.view'],
      },
      {
        title: 'Perangkat & Aktivitas Scan',
        url: '/laporan/perangkat-scan',
        anyOfPermissions: ['attendance.view'],
      },
      {
        title: 'Kontrak',
        url: '/laporan/kontrak',
        anyOfPermissions: ['employees.view'],
      },
      {
        title: 'Mutasi Karyawan',
        url: '/laporan/mutasi',
        anyOfPermissions: ['employees.view'],
      },
      {
        title: 'Perubahan Jumlah Karyawan',
        url: '/laporan/perubahan-karyawan',
        anyOfPermissions: ['employees.view'],
      },
      {
        title: 'Masa Kerja & Turnover',
        url: '/laporan/masa-kerja-turnover',
        anyOfPermissions: ['employees.view'],
      },
      {
        title: 'Payroll Final',
        url: '/laporan/payroll-final',
        anyOfPermissions: ['payroll.view'],
      },
      {
        title: 'Produksi Borongan',
        url: '/laporan/produksi-borongan',
        anyOfPermissions: ['production.view'],
      },
      {
        title: 'Audit Aktivitas Pengguna',
        url: '/laporan/audit-aktivitas',
        anyOfPermissions: ['audit.view'],
      },
    ])
    expect(administration?.items?.map((item) => item.title)).not.toContain(
      'Template Dokumen'
    )
  })

  it('membatasi laporan aktivitas pengguna maksimal 366 hari', () => {
    expect(auditActivityRangeError('2026-01-01', '2026-12-31')).toBeUndefined()
    expect(auditActivityRangeError('2026-01-01', '2027-01-02')).toBe(
      'Rentang laporan aktivitas pengguna maksimal 366 hari kalender.'
    )
    expect(auditActivityRangeError('2026-09-01', '2026-08-01')).toBe(
      'Tanggal akhir tidak boleh sebelum tanggal awal.'
    )
    expect(defaultAuditActivityPeriod().dateFrom).toMatch(/^\d{4}-\d{2}-01$/)
  })

  it('membatasi periode Attendance maksimal 31 hari', () => {
    expect(attendanceRangeError('2026-08-01', '2026-08-31')).toBeUndefined()
    expect(attendanceRangeError('2026-08-01', '2026-09-01')).toBe(
      'Rentang laporan maksimal 31 hari kalender.'
    )
    expect(attendanceRangeError('2026-08-31', '2026-08-01')).toBe(
      'Tanggal akhir tidak boleh sebelum tanggal awal.'
    )
  })

  it('memakai format angka dan tanggal Indonesia', () => {
    expect(numberLabel(1234)).toBe('1.234')
    expect(dateLabel('2026-08-31')).toContain('2026')
  })

  it('menolak rentang akhir kontrak yang terbalik', () => {
    expect(contractRangeError('2026-08-01', '2026-09-30')).toBeUndefined()
    expect(contractRangeError('2026-09-30', '2026-08-01')).toBe(
      'Tanggal akhir tidak boleh sebelum tanggal awal.'
    )
  })

  it('membatasi laporan mutasi maksimal 366 hari', () => {
    expect(mutationRangeError('2026-01-01', '2026-12-31')).toBeUndefined()
    expect(mutationRangeError('2026-01-01', '2027-01-02')).toBe(
      'Rentang laporan mutasi maksimal 366 hari kalender.'
    )
    expect(mutationRangeError('2026-08-31', '2026-08-01')).toBe(
      'Tanggal akhir tidak boleh sebelum tanggal awal.'
    )
  })

  it('membatasi laporan perubahan jumlah karyawan maksimal 366 hari', () => {
    expect(
      headcountChangeRangeError('2026-01-01', '2026-12-31')
    ).toBeUndefined()
    expect(headcountChangeRangeError('2026-01-01', '2027-01-02')).toBe(
      'Rentang laporan perubahan jumlah karyawan maksimal 366 hari kalender.'
    )
    expect(headcountChangeRangeError('2026-08-31', '2026-08-01')).toBe(
      'Tanggal akhir tidak boleh sebelum tanggal awal.'
    )
  })

  it('memulai periode perubahan jumlah karyawan dari awal tahun berjalan', () => {
    const period = defaultHeadcountChangePeriod()
    expect(period.dateFrom).toMatch(/^\d{4}-01-01$/)
    expect(period.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('membatasi laporan masa kerja dan turnover maksimal 366 hari', () => {
    expect(tenureTurnoverRangeError('2026-01-01', '2026-12-31')).toBeUndefined()
    expect(tenureTurnoverRangeError('2026-01-01', '2027-01-02')).toBe(
      'Rentang laporan masa kerja dan turnover maksimal 366 hari kalender.'
    )
    expect(tenureTurnoverRangeError('2026-08-31', '2026-08-01')).toBe(
      'Tanggal akhir tidak boleh sebelum tanggal awal.'
    )
  })

  it('memulai periode masa kerja dan turnover dari awal tahun berjalan', () => {
    const period = defaultTenureTurnoverPeriod()
    expect(period.dateFrom).toMatch(/^\d{4}-01-01$/)
    expect(period.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('membatasi laporan Payroll maksimal 366 hari', () => {
    expect(payrollFinalRangeError('2026-01-01', '2026-12-31')).toBeUndefined()
    expect(payrollFinalRangeError('2026-01-01', '2027-01-02')).toBe(
      'Rentang laporan Payroll maksimal 366 hari kalender.'
    )
    expect(payrollFinalRangeError('2026-08-31', '2026-08-01')).toBe(
      'Tanggal akhir tidak boleh sebelum tanggal awal.'
    )
  })

  it('memulai periode default Payroll dari awal tahun berjalan', () => {
    const period = defaultPayrollFinalPeriod()
    expect(period.dateFrom).toMatch(/^\d{4}-01-01$/)
    expect(period.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('membatasi laporan Cuti, Sakit & Izin maksimal 366 hari', () => {
    expect(
      attendanceClassificationRangeError('2026-01-01', '2026-12-31')
    ).toBeUndefined()
    expect(attendanceClassificationRangeError('2026-01-01', '2027-01-02')).toBe(
      'Rentang laporan Cuti, Sakit & Izin maksimal 366 hari kalender.'
    )
    expect(attendanceClassificationRangeError('2026-08-31', '2026-08-01')).toBe(
      'Tanggal akhir tidak boleh sebelum tanggal awal.'
    )
  })

  it('memulai periode default Cuti, Sakit & Izin dari awal bulan', () => {
    const period = defaultAttendanceClassificationPeriod()
    expect(period.dateFrom).toMatch(/^\d{4}-\d{2}-01$/)
    expect(period.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('membatasi laporan Koreksi Attendance maksimal 366 hari', () => {
    expect(
      attendanceCorrectionRangeError('2026-01-01', '2026-12-31')
    ).toBeUndefined()
    expect(attendanceCorrectionRangeError('2026-01-01', '2027-01-02')).toBe(
      'Rentang laporan Koreksi Attendance maksimal 366 hari kalender.'
    )
    expect(attendanceCorrectionRangeError('2026-08-31', '2026-08-01')).toBe(
      'Tanggal akhir tidak boleh sebelum tanggal awal.'
    )
  })

  it('memulai periode default Koreksi Attendance dari awal bulan', () => {
    const period = defaultAttendanceCorrectionPeriod()
    expect(period.dateFrom).toMatch(/^\d{4}-\d{2}-01$/)
    expect(period.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('membatasi laporan perangkat maksimal 366 hari', () => {
    expect(deviceScanRangeError('2026-01-01', '2026-12-31')).toBeUndefined()
    expect(deviceScanRangeError('2026-01-01', '2027-01-02')).toBe(
      'Rentang laporan perangkat maksimal 366 hari kalender.'
    )
    expect(deviceScanRangeError('2026-08-31', '2026-08-01')).toBe(
      'Tanggal akhir tidak boleh sebelum tanggal awal.'
    )
  })

  it('memulai periode default perangkat dari awal bulan', () => {
    const period = defaultDeviceScanPeriod()
    expect(period.dateFrom).toMatch(/^\d{4}-\d{2}-01$/)
    expect(period.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
