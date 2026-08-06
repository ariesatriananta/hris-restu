import { describe, expect, it } from 'vitest'
import {
  attendanceCollectiveLeaveSitesInput,
  resolveCalendarDay,
} from './attendance-calendar-policy.js'

describe('attendance calendar policy', () => {
  it('menerapkan workday override di atas semua jenis libur', () => {
    expect(
      resolveCalendarDay({
        scheduledByShift: false,
        rules: [
          { calendarType: 'NATIONAL_HOLIDAY', name: 'Hari Kemerdekaan' },
          { calendarType: 'SITE_HOLIDAY', name: 'Libur Site' },
          { calendarType: 'WORKDAY_OVERRIDE', name: 'Tetap Beroperasi' },
        ],
      })
    ).toMatchObject({
      dayType: 'WORKDAY',
      reasonType: 'WORKDAY_OVERRIDE',
      name: 'Tetap Beroperasi',
    })
  })

  it('mengutamakan libur site lalu cuti bersama lalu libur nasional', () => {
    expect(
      resolveCalendarDay({
        scheduledByShift: true,
        rules: [
          { calendarType: 'NATIONAL_HOLIDAY', name: 'Nasional' },
          { calendarType: 'COLLECTIVE_LEAVE', name: 'Cuti Bersama' },
          { calendarType: 'SITE_HOLIDAY', name: 'Site' },
        ],
      }).reasonType
    ).toBe('SITE_HOLIDAY')
  })

  it('kembali ke jadwal shift bila tidak ada aturan kalender', () => {
    expect(resolveCalendarDay({ scheduledByShift: true, rules: [] }).dayType).toBe(
      'WORKDAY'
    )
    expect(
      resolveCalendarDay({ scheduledByShift: false, rules: [] }).dayType
    ).toBe('NON_WORKDAY')
  })

  it('menghapus site duplikat dari pemilihan cuti bersama', () => {
    expect(
      attendanceCollectiveLeaveSitesInput.parse({
        siteCodes: ['JEPARA', 'JEPARA', 'KLATEN'],
        reason: 'Kebijakan operasional',
      }).siteCodes
    ).toEqual(['JEPARA', 'KLATEN'])
  })
})
