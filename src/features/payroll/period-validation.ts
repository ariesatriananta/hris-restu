import { differenceInCalendarDays } from 'date-fns'

export function validatePayrollPeriodDraft(input: {
  siteUid: string
  start?: Date
  end?: Date
  payment?: Date
  maxDays: number
}) {
  if (!input.siteUid || !input.start || !input.end)
    return 'Site dan rentang periode wajib diisi.'
  const days = differenceInCalendarDays(input.end, input.start) + 1
  if (days < 1) return 'Tanggal akhir tidak boleh sebelum tanggal mulai.'
  if (days > input.maxDays)
    return `Periode maksimal ${input.maxDays} hari kalender.`
  if (input.payment && input.payment < input.end)
    return 'Tanggal pembayaran tidak boleh sebelum tanggal akhir periode.'
  return null
}
