export type ProductionRecapPreset = 'TODAY' | 'LAST_7' | 'LAST_14' | 'MONTH'

export function productionRecapDefaultPeriod(today = localDate()) {
  return productionRecapPresetPeriod('LAST_7', today)
}

export function productionRecapPresetPeriod(
  preset: ProductionRecapPreset,
  today = localDate()
) {
  if (preset === 'TODAY') return { dateFrom: today, dateTo: today }
  if (preset === 'MONTH')
    return { dateFrom: `${today.slice(0, 8)}01`, dateTo: today }
  return {
    dateFrom: addDays(today, preset === 'LAST_14' ? -13 : -6),
    dateTo: today,
  }
}

export function productionRecapRangeError(dateFrom: string, dateTo: string) {
  if (dateTo < dateFrom)
    return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  if (dayDifference(dateFrom, dateTo) > 30)
    return 'Periode rekap maksimal 31 hari kalender.'
  return undefined
}

export function productionRecapPayrollLabel(
  value: 'NONE' | 'PARTIAL' | 'SNAPSHOTTED'
) {
  if (value === 'SNAPSHOTTED') return 'Sudah disnapshot'
  if (value === 'PARTIAL') return 'Sebagian disnapshot'
  return 'Belum disnapshot'
}

export function formatProductionRecapQuantity(
  value: string | number,
  decimalPrecision: number
) {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: decimalPrecision,
  }).format(Number(value))
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + amount)
  return localDate(date)
}

function dayDifference(from: string, to: string) {
  return Math.round(
    (new Date(`${to}T00:00:00`).getTime() -
      new Date(`${from}T00:00:00`).getTime()) /
      86_400_000
  )
}

function localDate(date = new Date()) {
  const adjusted = new Date(date)
  adjusted.setMinutes(adjusted.getMinutes() - adjusted.getTimezoneOffset())
  return adjusted.toISOString().slice(0, 10)
}
