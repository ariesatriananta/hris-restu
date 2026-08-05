import { describe, expect, it } from 'vitest'
import { ApiError } from './errors.js'
import {
  activeCancellationBlockReason,
  addBusinessDays,
  assertContractActivationPeriod,
  assertActiveConflictRecovery,
  assertContractStartDate,
  assertScheduledStatusWithinContract,
  canRepairContractControlledStatus,
  classifyContractConflict,
  contractReconciliationDecision,
  cronConflict,
  lifecycleNextStatus,
  paginationMeta,
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

  it('menolak terminasi atau resign setelah tanggal akhir kontrak', () => {
    expect(() => lifecycleNextStatus({
      action: 'terminate',
      status: 'ACTIVE',
      startDate: '2026-07-01',
      endDate: '2026-07-10',
      today,
      effectiveDate: '2026-07-11',
      hasReason: true,
    })).toThrow('Tanggal efektif terminasi atau resign tidak boleh melewati tanggal akhir kontrak.')
    expect(lifecycleNextStatus({
      action: 'resign',
      status: 'ACTIVE',
      startDate: '2026-07-01',
      endDate: '2026-07-10',
      today,
      effectiveDate: '2026-07-10',
      hasReason: true,
    })).toBe('TERMINATED')
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

describe('aturan tanggal rekonsiliasi kontrak', () => {
  it('menghasilkan tanggal efektif sehari setelah akhir kontrak', () => {
    expect(addBusinessDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addBusinessDays('2028-02-29', 1)).toBe('2028-03-01')
  })

  it('menolak aktivasi kontrak yang seluruh periodenya sudah lewat', () => {
    expect(() => assertContractActivationPeriod('2026-07-14', today)).toThrow(
      ApiError
    )
    expect(() => assertContractActivationPeriod(today, today)).not.toThrow()
  })

  it('menolak jadwal status setelah tanggal akhir kontrak', () => {
    expect(() =>
      assertScheduledStatusWithinContract('2026-07-16', today)
    ).toThrow(ApiError)
    expect(() =>
      assertScheduledStatusWithinContract(today, today)
    ).not.toThrow()
  })
})

describe('cronConflict', () => {
  it('membuat konflik actionable tanpa identifier internal', () => {
    expect(cronConflict({ employeeUid: 'employee-uid', employeeNumber: 'PKDS-2607-15001', fullName: 'Karyawan Fiktif', site: 'JEPARA', currentStatus: 'RESIGNED', activeContracts: 1, activeContractNumbers: 'PKWT-PKDS-2607-15001-01' })).toEqual({
      employeeUid: 'employee-uid', employeeNumber: 'PKDS-2607-15001', fullName: 'Karyawan Fiktif', site: 'JEPARA',
      code: 'TERMINAL_STATUS_WITH_ACTIVE_CONTRACT', severity: 'danger',
      reason: 'Status karyawan RESIGNED tetapi masih memiliki kontrak aktif.',
      contractNumbers: ['PKWT-PKDS-2607-15001-01'],
    })
  })

  it('menandai karyawan aktif tanpa kontrak berlaku sebagai alert kontrak', () => {
    expect(
      cronConflict({
        employeeUid: 'employee-uid',
        employeeNumber: 'PSMG-2507-23007',
        fullName: 'Karyawan Fiktif',
        site: 'SEMARANG',
        currentStatus: 'ACTIVE',
        activeContracts: 0,
      }).reason
    ).toBe(
      'Karyawan Aktif belum memiliki kontrak aktif yang berlaku. Periksa kontrak berakhir dan buat kontrak pengganti bila diperlukan.'
    )
  })

  it('menandai karyawan nonaktif tanpa kontrak sebagai alert onboarding', () => {
    expect(
      cronConflict({
        employeeUid: 'employee-uid',
        employeeNumber: 'PJPR-2607-00001',
        fullName: 'Karyawan Baru',
        site: 'JEPARA',
        currentStatus: 'INACTIVE',
        activeContracts: 0,
        nonCancelledContracts: 0,
      }).reason
    ).toBe(
      'Karyawan Nonaktif belum memiliki kontrak. Periksa onboarding dan buat kontrak bila karyawan siap diproses.'
    )
  })

  it.each([
    [{ currentStatus: 'ACTIVE', activeContracts: 2 }, 'MULTIPLE_ACTIVE_CONTRACTS'],
    [{ currentStatus: 'LEAVE', activeContracts: 1 }, 'TERMINAL_STATUS_WITH_ACTIVE_CONTRACT'],
    [{ currentStatus: 'ACTIVE', activeContracts: 0 }, 'ACTIVE_WITHOUT_CONTRACT_COVERAGE'],
    [{ currentStatus: 'INACTIVE', activeContracts: 0, nonCancelledContracts: 0 }, 'ONBOARDING_WITHOUT_CONTRACT'],
    [{ currentStatus: 'INACTIVE', activeContracts: 1 }, 'EMPLOYEE_STATUS_CONTRACT_MISMATCH'],
  ] as const)('mengklasifikasikan konflik %j', (input, expected) => {
    expect(classifyContractConflict(input)).toBe(expected)
  })
})

describe('contractReconciliationDecision', () => {
  it.each([
    ['kontrak berakhir hari ini masih aktif', { currentStatus: 'ACTIVE', activeContracts: 1, nonCancelledContracts: 1, endedContracts: 0 }, 'ACTIVE'],
    ['kontrak berakhir tanpa pengganti menjadi nonaktif', { currentStatus: 'ACTIVE', activeContracts: 0, nonCancelledContracts: 1, endedContracts: 1 }, 'INACTIVE'],
    ['kontrak pengganti sambung mempertahankan aktif', { currentStatus: 'ACTIVE', activeContracts: 1, nonCancelledContracts: 2, endedContracts: 1 }, 'ACTIVE'],
    ['draft atau kontrak masa depan tidak menutup expiry', { currentStatus: 'ACTIVE', activeContracts: 0, nonCancelledContracts: 2, endedContracts: 1 }, 'INACTIVE'],
    ['karyawan aktif yang belum pernah punya kontrak menjadi konflik', { currentStatus: 'ACTIVE', activeContracts: 0, nonCancelledContracts: 0, endedContracts: 0 }, 'CONFLICT'],
    ['lebih dari satu kontrak aktif menjadi konflik', { currentStatus: 'ACTIVE', activeContracts: 2, nonCancelledContracts: 2, endedContracts: 0 }, 'CONFLICT'],
    ['resign tanpa kontrak aktif dipertahankan', { currentStatus: 'RESIGNED', activeContracts: 0, nonCancelledContracts: 1, endedContracts: 1 }, 'PRESERVE_TERMINAL'],
    ['resign dengan kontrak aktif menjadi konflik', { currentStatus: 'RESIGNED', activeContracts: 1, nonCancelledContracts: 1, endedContracts: 0 }, 'CONFLICT'],
    ['leave tanpa kontrak aktif dipertahankan', { currentStatus: 'LEAVE', activeContracts: 0, nonCancelledContracts: 1, endedContracts: 1 }, 'PRESERVE_TERMINAL'],
    ['leave dengan kontrak aktif menjadi konflik', { currentStatus: 'LEAVE', activeContracts: 1, nonCancelledContracts: 1, endedContracts: 0 }, 'CONFLICT'],
    ['karyawan nonaktif dengan kontrak aktif menjadi aktif', { currentStatus: 'INACTIVE', activeContracts: 1, nonCancelledContracts: 1, endedContracts: 0 }, 'ACTIVE'],
  ] as const)('%s', (_label, input, expected) => {
    expect(contractReconciliationDecision(input)).toBe(expected)
  })
})

describe('paginationMeta', () => {
  it.each([
    [0, 1, 50, false],
    [50, 1, 50, false],
    [51, 1, 50, true],
    [127, 1, 50, true],
    [127, 2, 50, true],
    [127, 3, 50, false],
  ] as const)('total %i halaman %i ukuran %i', (total, page, pageSize, hasMore) => {
    expect(paginationMeta(total, page, pageSize)).toEqual({
      total,
      page,
      pageSize,
      hasMore,
    })
  })
})

describe('canRepairContractControlledStatus', () => {
  it('mengizinkan normalisasi timeline nonterminal yang dikendalikan kontrak', () => {
    expect(canRepairContractControlledStatus({
      boundaryStatus: 'INACTIVE',
      laterStatuses: ['INACTIVE', 'ACTIVE'],
    })).toBe(true)
    expect(canRepairContractControlledStatus({
      boundaryStatus: 'ACTIVE',
      laterStatuses: ['ACTIVE'],
    })).toBe(true)
  })

  it('menolak koreksi otomatis tanpa histori atau jika ada status terminal', () => {
    expect(canRepairContractControlledStatus({
      boundaryStatus: undefined,
      laterStatuses: [],
    })).toBe(false)
    expect(canRepairContractControlledStatus({
      boundaryStatus: 'INACTIVE',
      laterStatuses: ['RESIGNED'],
    })).toBe(false)
  })
})

describe('activeCancellationBlockReason', () => {
  const emptyUsage = {
    hasSignedContract: false,
    hasAttendance: false,
    hasProduction: false,
    hasPayroll: false,
    hasLaterHistory: false,
    hasLaterLifecycle: false,
    hasOpenScheduledStatusChange: false,
  }

  it('mengizinkan pembatalan aktivasi yang belum dipakai operasional', () => {
    expect(activeCancellationBlockReason(emptyUsage)).toBeUndefined()
  })

  it.each([
    ['hasSignedContract', 'tanda tangan'],
    ['hasAttendance', 'attendance'],
    ['hasProduction', 'produksi'],
    ['hasPayroll', 'payroll'],
    ['hasLaterHistory', 'histori'],
    ['hasLaterLifecycle', 'lifecycle'],
    ['hasOpenScheduledStatusChange', 'terjadwal'],
  ] as const)('menolak ketika %s terdeteksi', (key, message) => {
    expect(
      activeCancellationBlockReason({ ...emptyUsage, [key]: true })
    ).toContain(message)
  })
})

describe('assertActiveConflictRecovery', () => {
  const validInput = {
    contractStatus: 'ACTIVE',
    employeeStatus: 'ACTIVE',
    startDate: '2026-07-01',
    endDate: '2026-12-31',
    today: '2026-08-06',
    effectiveDate: '2026-08-01',
    reason: 'Duplikasi aktivasi kontrak',
    otherActiveAtEffectiveDate: 1,
    otherActiveToday: 1,
  }

  it('mengizinkan penghentian kontrak salah tanpa menonaktifkan karyawan', () => {
    expect(() => assertActiveConflictRecovery(validInput)).not.toThrow()
  })

  it.each([
    [{ contractStatus: 'DRAFT' }, 'hanya tersedia untuk kontrak Aktif'],
    [{ employeeStatus: 'INACTIVE' }, 'status karyawan masih Aktif'],
    [{ effectiveDate: undefined }, 'Tanggal efektif pemulihan wajib'],
    [{ reason: 'x' }, 'minimal 5 karakter'],
    [{ effectiveDate: '2026-06-30' }, 'harus berada dalam periode kontrak'],
    [{ otherActiveToday: 0 }, 'Tidak ditemukan kontrak aktif lain'],
    [{ otherActiveAtEffectiveDate: 0 }, 'Tidak ditemukan kontrak aktif lain'],
  ] as const)('menolak kondisi pemulihan tidak aman: %j', (override, message) => {
    expect(() =>
      assertActiveConflictRecovery({ ...validInput, ...override })
    ).toThrow(message)
  })
})
