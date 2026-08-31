import { describe, expect, it } from 'vitest'
import { sidebarData } from '@/components/layout/data/sidebar-data'
import {
  attendanceRangeError,
  contractRangeError,
  dateLabel,
  numberLabel,
} from './utils'

describe('Pusat Laporan frontend', () => {
  it('melindungi menu Laporan dan tidak lagi menampilkan Template Dokumen', () => {
    const items = sidebarData.navGroups.flatMap((group) => group.items)
    const reports = items.find((item) => item.title === 'Laporan')
    const administration = items.find(
      (item) => item.title === 'Administrasi Sistem'
    )

    expect(reports?.anyOfPermissions).toEqual(['reports.view'])
    expect(administration?.items?.map((item) => item.title)).not.toContain(
      'Template Dokumen'
    )
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
})
