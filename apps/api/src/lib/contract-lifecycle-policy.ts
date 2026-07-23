import { ApiError } from './errors.js'

export type ContractTransitionAction =
  | 'schedule'
  | 'activate'
  | 'terminate'
  | 'resign'
  | 'cancel'

export function assertContractStartDate(startDate: string, joinDate?: string) {
  if (joinDate && startDate < joinDate)
    throw new ApiError(
      422,
      'Tanggal mulai kontrak tidak boleh sebelum tanggal bergabung karyawan.'
    )
}

export function lifecycleNextStatus(input: {
  action: ContractTransitionAction
  status: string
  startDate: string
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

export function cronConflict(input: {
  employeeUid: string
  employeeNumber: string
  fullName: string
  site: string
  currentStatus: string
  activeContracts: number
  activeContractNumbers?: string | null
}) {
  return {
    employeeUid: input.employeeUid,
    employeeNumber: input.employeeNumber,
    fullName: input.fullName,
    site: input.site,
    reason:
      input.activeContracts > 1
        ? 'Lebih dari satu kontrak aktif yang masih berlaku.'
        : input.activeContracts === 0
          ? 'Karyawan Aktif belum memiliki kontrak aktif yang berlaku. Periksa kontrak berakhir dan buat kontrak pengganti bila diperlukan.'
        : `Status karyawan ${input.currentStatus} tetapi masih memiliki kontrak aktif.`,
    contractNumbers: String(input.activeContractNumbers ?? '')
      .split(', ')
      .filter(Boolean),
  }
}
