export function bulkRangeError(
  dateFrom: string,
  dateTo: string,
  goLiveDate: string | undefined,
  currentDate: string
) {
  if (dateTo < dateFrom) {
    return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  }
  if (goLiveDate && dateFrom < goLiveDate) {
    return `Tanggal awal tidak boleh sebelum ${attendanceDateLabel(goLiveDate)}.`
  }
  if (dateTo > currentDate) {
    return 'Tanggal masa depan belum dapat diproses.'
  }
  const from = new Date(`${dateFrom}T00:00:00Z`)
  const to = new Date(`${dateTo}T00:00:00Z`)
  const days = Math.floor((to.getTime() - from.getTime()) / 86_400_000) + 1
  if (days > 31) {
    return 'Rentang finalisasi maksimal 31 hari kalender.'
  }
  return undefined
}

export function attendanceDateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}
