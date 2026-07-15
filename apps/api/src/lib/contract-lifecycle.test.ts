import { describe, expect, it } from 'vitest'
import { ApiError } from './errors.js'
import {
  assertContractStartDate,
  cronConflict,
  lifecycleNextStatus,
} from './contract-lifecycle-policy.js'

const today = '2026-07-15'

describe('lifecycleNextStatus', () => {
  it('menerapkan transisi lifecycle legal', () => {
    expect(lifecycleNextStatus({ action: 'schedule', status: 'DRAFT', startDate: '2026-07-16', today, effectiveDate: today, hasReason: false })).toBe('SCHEDULED')
    expect(lifecycleNextStatus({ action: 'activate', status: 'SCHEDULED', startDate: today, today, effectiveDate: today, hasReason: false })).toBe('ACTIVE')
    expect(lifecycleNextStatus({ action: 'terminate', status: 'ACTIVE', startDate: '2026-07-01', today, effectiveDate: '2026-07-10', hasReason: true })).toBe('TERMINATED')
    expect(lifecycleNextStatus({ action: 'cancel', status: 'DRAFT', startDate: '2026-07-20', today, effectiveDate: today, hasReason: false })).toBe('CANCELLED')
  })

  it('menolak tanggal dan status lifecycle yang tidak legal', () => {
    expect(() => lifecycleNextStatus({ action: 'activate', status: 'SCHEDULED', startDate: '2026-07-16', today, effectiveDate: today, hasReason: false })).toThrow(ApiError)
    expect(() => lifecycleNextStatus({ action: 'resign', status: 'ACTIVE', startDate: '2026-07-10', today, effectiveDate: '2026-07-09', hasReason: true })).toThrow(ApiError)
    expect(() => lifecycleNextStatus({ action: 'terminate', status: 'ACTIVE', startDate: '2026-07-01', today, effectiveDate: today, hasReason: false })).toThrow(ApiError)
    expect(() => lifecycleNextStatus({ action: 'cancel', status: 'ACTIVE', startDate: '2026-07-01', today, effectiveDate: today, hasReason: false })).toThrow(ApiError)
  })
})

describe('assertContractStartDate', () => {
  it('menolak kontrak yang dimulai sebelum tanggal bergabung', () => {
    expect(() => assertContractStartDate('2026-07-14', '2026-07-15')).toThrow(
      ApiError
    )
    expect(() => assertContractStartDate('2026-07-15', '2026-07-15')).not.toThrow()
  })
})

describe('cronConflict', () => {
  it('membuat konflik actionable tanpa identifier internal', () => {
    expect(cronConflict({ employeeUid: 'employee-uid', employeeNumber: 'PKDS-2607-15001', fullName: 'Karyawan Fiktif', site: 'JEPARA', currentStatus: 'RESIGNED', activeContracts: 1, activeContractNumbers: 'PKWT-PKDS-2607-15001-01' })).toEqual({
      employeeUid: 'employee-uid', employeeNumber: 'PKDS-2607-15001', fullName: 'Karyawan Fiktif', site: 'JEPARA',
      reason: 'Status karyawan RESIGNED tetapi masih memiliki kontrak aktif.',
      contractNumbers: ['PKWT-PKDS-2607-15001-01'],
    })
  })
})
