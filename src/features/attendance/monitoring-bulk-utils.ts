import type {
  AttendanceCorrectionInput,
  AttendanceMonitoringRecord,
} from './domain'

export type BulkCorrectionDraft = {
  type: 'CLOCK_IN' | 'CLOCK_OUT' | 'BOTH'
  clockIn: string
  clockOut: string
}

export function buildBulkCorrectionItems(
  records: Pick<AttendanceMonitoringRecord, 'uid'>[],
  draft: BulkCorrectionDraft,
  reason: string
): AttendanceCorrectionInput[] {
  return records.map((record) => ({
    attendanceUid: record.uid,
    correctionType: draft.type,
    newClockInAt:
      draft.type === 'CLOCK_IN' || draft.type === 'BOTH'
        ? draft.clockIn
        : undefined,
    newClockOutAt:
      draft.type === 'CLOCK_OUT' || draft.type === 'BOTH'
        ? draft.clockOut
        : undefined,
    reason,
  }))
}
