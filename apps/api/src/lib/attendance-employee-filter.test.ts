import { describe, expect, it } from 'vitest'
import {
  appendAttendanceEmployeeFilters,
  parseAttendanceEmployeeFilters,
} from './attendance-employee-filter.js'

const sectionA = '11111111-1111-4111-8111-111111111111'
const sectionB = '22222222-2222-4222-8222-222222222222'

describe('Attendance employee filters', () => {
  it('memvalidasi, menghapus duplikat, dan mempertahankan urutan filter', () => {
    expect(
      parseAttendanceEmployeeFilters({
        employeeType: 'BORONGAN,HARIAN,BORONGAN',
        productionSection: [sectionA, sectionB, sectionA],
      })
    ).toEqual({
      employeeTypes: ['BORONGAN', 'HARIAN'],
      productionSectionUids: [sectionA, sectionB],
    })
  })

  it('menolak kode jenis dan UID bagian yang tidak valid', () => {
    expect(() =>
      parseAttendanceEmployeeFilters({ employeeType: 'PEGAWAI' })
    ).toThrow()
    expect(() =>
      parseAttendanceEmployeeFilters({ productionSection: 'bagian-produksi' })
    ).toThrow()
  })

  it('menambahkan SQL dan parameter kedua filter secara konsisten', () => {
    const where = ['ar.business_date=?']
    const values: unknown[] = ['2026-08-21']
    appendAttendanceEmployeeFilters(
      where,
      values,
      parseAttendanceEmployeeFilters({
        employeeType: 'BORONGAN,HARIAN',
        productionSection: sectionA,
      }),
      { employeeType: 'history_type.code', productionSection: 'history_section.uid' }
    )
    expect(where).toEqual([
      'ar.business_date=?',
      'history_type.code IN (?,?)',
      'history_section.uid IN (?)',
    ])
    expect(values).toEqual(['2026-08-21', 'BORONGAN', 'HARIAN', sectionA])
  })
})
