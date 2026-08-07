import { ApiError } from './errors.js'

export function addBusinessDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export type ContractTransitionAction =
  | 'schedule'
  | 'activate'
  | 'terminate'
  | 'resign'
  | 'cancel'

export function contractTransitionEffectiveDate(input: {
  action: ContractTransitionAction
  contractStartDate: string
  today: string
  requestedEffectiveDate?: string
}) {
  return input.action === 'activate'
    ? input.contractStartDate
    : input.requestedEffectiveDate ?? input.today
}

export function assertContractStartDate(startDate: string, joinDate?: string) {
  if (joinDate && startDate < joinDate)
    throw new ApiError(
      422,
      'Tanggal mulai kontrak tidak boleh sebelum tanggal bergabung karyawan.'
    )
}

export function assertContractActivationPeriod(endDate: string | null | undefined, today: string) {
  if (endDate && endDate < today) {
    throw new ApiError(
      422,
      'Kontrak yang seluruh periodenya sudah lewat tidak dapat diaktifkan.'
    )
  }
}

export function assertScheduledStatusWithinContract(
  effectiveDate: string,
  endDate?: string | null
) {
  if (endDate && effectiveDate > endDate) {
    throw new ApiError(
      422,
      'Tanggal terminasi atau resign terjadwal tidak boleh melewati tanggal akhir kontrak.'
    )
  }
}

export function assertActiveConflictRecovery(input: {
  contractStatus: string
  employeeStatus: string
  startDate: string
  endDate?: string | null
  today: string
  effectiveDate?: string
  reason?: string
  otherActiveAtEffectiveDate: number
  otherActiveToday: number
}) {
  if (input.contractStatus !== 'ACTIVE') {
    throw new ApiError(
      422,
      'Pemulihan konflik hanya tersedia untuk kontrak Aktif.'
    )
  }
  if (input.employeeStatus !== 'ACTIVE') {
    throw new ApiError(
      409,
      'Pemulihan ini hanya dapat dilakukan saat status karyawan masih Aktif.'
    )
  }
  if (!input.effectiveDate) {
    throw new ApiError(422, 'Tanggal efektif pemulihan wajib diisi.')
  }
  if ((input.reason?.trim().length ?? 0) < 5) {
    throw new ApiError(422, 'Alasan pemulihan minimal 5 karakter.')
  }
  if (
    input.startDate > input.today ||
    (input.endDate && input.endDate < input.today)
  ) {
    throw new ApiError(
      409,
      'Kontrak yang dipilih bukan kontrak Aktif yang masih berlaku hari ini.'
    )
  }
  if (
    input.effectiveDate < input.startDate ||
    input.effectiveDate > input.today ||
    (input.endDate && input.effectiveDate > input.endDate)
  ) {
    throw new ApiError(
      422,
      'Tanggal efektif harus berada dalam periode kontrak dan tidak boleh melewati hari ini.'
    )
  }
  if (
    input.otherActiveAtEffectiveDate < 1 ||
    input.otherActiveToday < 1
  ) {
    throw new ApiError(
      409,
      'Tidak ditemukan kontrak aktif lain yang menjaga status karyawan tetap Aktif.'
    )
  }
}

export function lifecycleNextStatus(input: {
  action: ContractTransitionAction
  status: string
  startDate: string
  endDate?: string | null
  today: string
  effectiveDate: string
  hasReason: boolean
}) {
  if (input.action === 'schedule') {
    if (input.status !== 'DRAFT' || input.startDate <= input.today)
      throw new ApiError(
        422,
        'Hanya draft bertanggal masa depan yang dapat dijadwalkan.'
      )
    return 'SCHEDULED' as const
  }
  if (input.action === 'activate') {
    if (
      !['DRAFT', 'SCHEDULED'].includes(input.status) ||
      input.startDate > input.today
    )
      throw new ApiError(422, 'Kontrak belum dapat diaktifkan.')
    return 'ACTIVE' as const
  }
  if (input.action === 'terminate' || input.action === 'resign') {
    if (input.endDate && input.effectiveDate > input.endDate) {
      throw new ApiError(
        422,
        'Tanggal efektif terminasi atau resign tidak boleh melewati tanggal akhir kontrak.'
      )
    }
    if (
      input.status !== 'ACTIVE' ||
      !input.hasReason ||
      input.effectiveDate > input.today ||
      input.effectiveDate < input.startDate
    )
      throw new ApiError(
        422,
        `Data ${input.action === 'resign' ? 'resign' : 'terminasi'} tidak valid.`
      )
    return 'TERMINATED' as const
  }
  if (!['DRAFT', 'SCHEDULED'].includes(input.status))
    throw new ApiError(422, 'Kontrak ini tidak dapat dibatalkan.')
  return 'CANCELLED' as const
}

export type ContractConflictCode =
  | 'MULTIPLE_ACTIVE_CONTRACTS'
  | 'TERMINAL_STATUS_WITH_ACTIVE_CONTRACT'
  | 'ACTIVE_WITHOUT_CONTRACT_COVERAGE'
  | 'ONBOARDING_WITHOUT_CONTRACT'
  | 'EMPLOYEE_STATUS_CONTRACT_MISMATCH'

export type ContractConflictSeverity = 'danger' | 'warning'

export type ContractReconciliationDecision =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'PRESERVE_TERMINAL'
  | 'CONFLICT'

export function contractReconciliationDecision(input: {
  currentStatus: string
  activeContracts: number
  nonCancelledContracts: number
  endedContracts: number
}): ContractReconciliationDecision {
  if (input.activeContracts > 1) return 'CONFLICT'
  if (['RESIGNED', 'LEAVE'].includes(input.currentStatus)) {
    return input.activeContracts > 0 ? 'CONFLICT' : 'PRESERVE_TERMINAL'
  }
  if (input.currentStatus === 'ACTIVE' && input.activeContracts === 0) {
    return input.endedContracts > 0 ? 'INACTIVE' : 'CONFLICT'
  }
  if (
    input.currentStatus === 'INACTIVE' &&
    input.activeContracts === 0 &&
    input.nonCancelledContracts === 0
  ) {
    return 'CONFLICT'
  }
  return input.activeContracts === 1 ? 'ACTIVE' : 'INACTIVE'
}

export function paginationMeta(total: number, page: number, pageSize: number) {
  return {
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  }
}

export function canRepairContractControlledStatus(input: {
  boundaryStatus?: string
  laterStatuses: string[]
}) {
  return Boolean(input.boundaryStatus) &&
    ['ACTIVE', 'INACTIVE'].includes(String(input.boundaryStatus)) &&
    input.laterStatuses.every((status) => ['ACTIVE', 'INACTIVE'].includes(status))
}

export function classifyContractConflict(input: {
  currentStatus: string
  activeContracts: number
  nonCancelledContracts?: number
}): ContractConflictCode {
  if (input.activeContracts > 1) return 'MULTIPLE_ACTIVE_CONTRACTS'
  if (
    ['RESIGNED', 'LEAVE'].includes(input.currentStatus) &&
    input.activeContracts > 0
  ) {
    return 'TERMINAL_STATUS_WITH_ACTIVE_CONTRACT'
  }
  if (input.currentStatus === 'INACTIVE' && input.activeContracts > 0) {
    return 'EMPLOYEE_STATUS_CONTRACT_MISMATCH'
  }
  if (
    input.currentStatus === 'INACTIVE' &&
    input.activeContracts === 0 &&
    Number(input.nonCancelledContracts ?? 0) === 0
  ) {
    return 'ONBOARDING_WITHOUT_CONTRACT'
  }
  return 'ACTIVE_WITHOUT_CONTRACT_COVERAGE'
}

export function cronConflict(input: {
  employeeUid: string
  employeeNumber: string
  fullName: string
  site: string
  currentStatus: string
  activeContracts: number
  nonCancelledContracts?: number
  activeContractNumbers?: string | null
}) {
  const code = classifyContractConflict(input)

  return {
    employeeUid: input.employeeUid,
    employeeNumber: input.employeeNumber,
    fullName: input.fullName,
    site: input.site,
    code,
    severity: (code === 'ONBOARDING_WITHOUT_CONTRACT'
      ? 'warning'
      : 'danger') as ContractConflictSeverity,
    reason:
      input.activeContracts > 1
        ? 'Lebih dari satu kontrak aktif yang masih berlaku.'
        : input.currentStatus === 'INACTIVE' &&
            input.activeContracts === 0 &&
            Number(input.nonCancelledContracts ?? 0) === 0
          ? 'Karyawan Nonaktif belum memiliki kontrak. Periksa onboarding dan buat kontrak bila karyawan siap diproses.'
        : input.activeContracts === 0
          ? 'Karyawan Aktif belum memiliki kontrak aktif yang berlaku. Periksa kontrak berakhir dan buat kontrak pengganti bila diperlukan.'
        : `Status karyawan ${input.currentStatus} tetapi masih memiliki kontrak aktif.`,
    contractNumbers: String(input.activeContractNumbers ?? '')
      .split(', ')
      .filter(Boolean),
  }
}

export type ActiveCancellationUsage = {
  hasSignedContract: boolean
  hasAttendance: boolean
  hasProduction: boolean
  hasPayroll: boolean
  hasLaterHistory: boolean
  hasLaterLifecycle: boolean
  hasOpenScheduledStatusChange: boolean
}

export function activeCancellationBlockReason(
  usage: ActiveCancellationUsage
) {
  if (usage.hasSignedContract) {
    return 'Aktivasi tidak dapat dibatalkan karena kontrak sudah memiliki tanggal tanda tangan atau scan kontrak asli.'
  }
  if (usage.hasAttendance) {
    return 'Aktivasi tidak dapat dibatalkan karena sudah ada data attendance sejak kontrak diaktifkan.'
  }
  if (usage.hasProduction) {
    return 'Aktivasi tidak dapat dibatalkan karena sudah ada transaksi produksi sejak kontrak diaktifkan.'
  }
  if (usage.hasPayroll) {
    return 'Aktivasi tidak dapat dibatalkan karena kontrak sudah masuk proses payroll.'
  }
  if (usage.hasLaterHistory || usage.hasLaterLifecycle) {
    return 'Aktivasi tidak dapat dibatalkan karena sudah ada histori kerja atau lifecycle lanjutan.'
  }
  if (usage.hasOpenScheduledStatusChange) {
    return 'Aktivasi tidak dapat dibatalkan karena masih ada status kerja terjadwal. Batalkan jadwal tersebut terlebih dahulu.'
  }
  return undefined
}
