import type { AttendanceReadinessSite } from './domain'

export function getAttendanceAttentionDetails(
  items: AttendanceReadinessSite[]
) {
  const totals = items.reduce(
    (summary, item) => {
      summary.withoutShift += item.shift.withoutAssignmentCount
      summary.ambiguousShift += item.shift.ambiguousAssignmentCount
      summary.notReadyDevices += item.devices.notReadyCount
      summary.sitesWithoutDevice +=
        !item.devices.hasReadyDevice && item.devices.notReadyCount === 0 ? 1 : 0
      summary.calendars +=
        item.calendar.evidenceStatus === 'NOT_CONFIGURED' ? 1 : 0
      summary.finalizationDates += item.finalization.rerunRequiredCount
      summary.corrections += item.followUp.pendingCorrectionCount
      summary.classifications += item.followUp.pendingClassificationCount
      return summary
    },
    {
      withoutShift: 0,
      ambiguousShift: 0,
      notReadyDevices: 0,
      sitesWithoutDevice: 0,
      calendars: 0,
      finalizationDates: 0,
      corrections: 0,
      classifications: 0,
    }
  )

  return [
    totals.withoutShift > 0
      ? `${totals.withoutShift} karyawan belum memiliki shift`
      : null,
    totals.ambiguousShift > 0
      ? `${totals.ambiguousShift} penugasan shift tumpang tindih`
      : null,
    totals.notReadyDevices > 0
      ? `${totals.notReadyDevices} perangkat belum siap`
      : null,
    totals.sitesWithoutDevice > 0
      ? `${totals.sitesWithoutDevice} site belum memiliki perangkat siap`
      : null,
    totals.calendars > 0
      ? `${totals.calendars} kalender site belum dikonfigurasi`
      : null,
    totals.finalizationDates > 0
      ? `${totals.finalizationDates} tanggal perlu finalisasi ulang`
      : null,
    totals.corrections > 0
      ? `${totals.corrections} koreksi menunggu keputusan`
      : null,
    totals.classifications > 0
      ? `${totals.classifications} klasifikasi menunggu keputusan`
      : null,
  ].filter((detail): detail is string => detail !== null)
}

export function getAttendanceAttentionLabel(
  attentionCount: number,
  details: string[]
) {
  return details.length === 1
    ? details[0]
    : `${attentionCount} hal perlu diperiksa`
}
