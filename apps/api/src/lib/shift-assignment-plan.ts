import { z } from 'zod'

const employeeUid = z.string().uuid()

export const shiftAssignmentPlanItemInput = z
  .object({
    employeeUid,
    shiftUid: z.string().uuid(),
    effectiveFrom: z.string().date(),
    effectiveTo: z.string().date().optional().nullable(),
    workDays: z
      .array(z.number().int().min(1).max(7))
      .min(1, 'Pilih minimal satu hari kerja.'),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.workDays).size !== value.workDays.length) {
      context.addIssue({
        code: 'custom',
        path: ['workDays'],
        message: 'Hari kerja tidak boleh duplikat.',
      })
    }
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      context.addIssue({
        code: 'custom',
        path: ['effectiveTo'],
        message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
      })
    }
  })
  .transform((value) => ({
    ...value,
    effectiveTo: value.effectiveTo ?? undefined,
    workDays: [...value.workDays].sort((a, b) => a - b),
  }))

const uniqueEmployees = <T extends { employeeUid: string }>(
  items: T[],
  context: z.RefinementCtx
) => {
  if (new Set(items.map((item) => item.employeeUid)).size !== items.length) {
    context.addIssue({
      code: 'custom',
      path: ['items'],
      message: 'Karyawan tidak boleh dikirim lebih dari sekali.',
    })
  }
}

export const shiftAssignmentPlanPreviewInput = z
  .object({
    employeeUids: z
      .array(employeeUid)
      .min(1, 'Pilih minimal satu karyawan.')
      .max(100, 'Satu perencanaan maksimal 100 karyawan.'),
    items: z.array(shiftAssignmentPlanItemInput).max(100).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.employeeUids).size !== value.employeeUids.length) {
      context.addIssue({
        code: 'custom',
        path: ['employeeUids'],
        message: 'Karyawan tidak boleh dipilih lebih dari sekali.',
      })
    }
    if (value.items) {
      uniqueEmployees(value.items, context)
      const selected = new Set(value.employeeUids)
      if (value.items.some((item) => !selected.has(item.employeeUid))) {
        context.addIssue({
          code: 'custom',
          path: ['items'],
          message: 'Rincian penugasan harus berasal dari karyawan terpilih.',
        })
      }
    }
  })

export const shiftAssignmentPlanApplyInput = z
  .object({
    items: z
      .array(shiftAssignmentPlanItemInput)
      .min(1, 'Pilih minimal satu karyawan.')
      .max(100, 'Satu eksekusi maksimal 100 karyawan.'),
  })
  .strict()
  .superRefine((value, context) => uniqueEmployees(value.items, context))

export type ShiftAssignmentPlanItemInput = z.infer<
  typeof shiftAssignmentPlanItemInput
>

export type ShiftPlanSource = 'NEW_HIRE' | 'TRANSFER' | 'RENEWAL' | 'MANUAL'

export type ShiftPlanCandidate = {
  employeeType: string
  historyEffectiveFrom: string
  historyChangeType: string
  activeContractStart?: string
  isRenewal: boolean
  siteId: number
}

export type ShiftPlanShift = {
  uid: string
  id: number
  siteId: number
  code: string
  name: string
}

export type ShiftPlanHistory = {
  shiftId: number
  shiftCode: string
  siteId: number
  effectiveFrom: string
  effectiveTo?: string
  workDays: number[]
}

export function recommendShiftAssignment(input: {
  candidate: ShiftPlanCandidate
  shifts: ShiftPlanShift[]
  history: ShiftPlanHistory[]
  today: string
  goLiveDate: string
}) {
  const { candidate } = input
  const source: ShiftPlanSource =
    candidate.historyChangeType === 'TRANSFER'
      ? 'TRANSFER'
      : candidate.isRenewal
        ? 'RENEWAL'
        : candidate.historyChangeType === 'INITIAL'
          ? 'NEW_HIRE'
          : 'MANUAL'
  const sourceDate =
    source === 'RENEWAL' && candidate.activeContractStart
      ? candidate.activeContractStart
      : candidate.historyEffectiveFrom
  const recommendedEffectiveFrom = [sourceDate, input.goLiveDate]
    .sort()
    .at(-1) as string
  const histories = input.history
    .slice()
    .sort(
      (left, right) =>
        right.effectiveFrom.localeCompare(left.effectiveFrom) ||
        right.shiftId - left.shiftId
    )
  const covering = histories.find(
    (assignment) =>
      assignment.effectiveFrom <= recommendedEffectiveFrom &&
      (!assignment.effectiveTo ||
        assignment.effectiveTo >= recommendedEffectiveFrom)
  )
  const previous = histories.find(
    (assignment) => assignment.effectiveFrom < recommendedEffectiveFrom
  )
  const sourceAssignment = covering ?? previous
  const siteShifts = input.shifts.filter(
    (shift) => shift.siteId === candidate.siteId
  )
  const matchingCode = sourceAssignment
    ? siteShifts.find((shift) => shift.code === sourceAssignment.shiftCode)
    : undefined
  const boronganDefault =
    candidate.employeeType === 'BORONGAN'
      ? siteShifts.find((shift) => shift.code === 'BORONGAN_DEFAULT')
      : undefined
  const onlyShift = siteShifts.length === 1 ? siteShifts[0] : undefined
  const recommendedShift = matchingCode ?? boronganDefault ?? onlyShift
  const recommendedWorkDays = sourceAssignment?.workDays.length
    ? [...sourceAssignment.workDays].sort((a, b) => a - b)
    : [1, 2, 3, 4, 5]
  const recommendationReason = matchingCode
    ? source === 'TRANSFER'
      ? 'Mengikuti kode Shift sebelumnya pada site tujuan.'
      : 'Melanjutkan Shift dari histori sebelumnya.'
    : boronganDefault
      ? 'Menggunakan Shift default karyawan Borongan pada site.'
      : onlyShift
        ? 'Site hanya memiliki satu Shift aktif.'
        : 'Belum ada rekomendasi Shift yang tidak ambigu.'

  return {
    source,
    recommendedEffectiveFrom:
      source === 'MANUAL' && recommendedEffectiveFrom < input.today
        ? input.today
        : recommendedEffectiveFrom,
    recommendedShift,
    recommendedWorkDays,
    recommendationReason,
  }
}
