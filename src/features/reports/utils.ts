export function localDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`)
  )
}

export function numberLabel(value: number) {
  return new Intl.NumberFormat('id-ID').format(value)
}

export function defaultAttendancePeriod() {
  const now = new Date()
  return {
    dateFrom: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: localDate(now),
  }
}

export function defaultContractPeriod() {
  const now = new Date()
  return {
    referenceDate: localDate(now),
    dateFrom: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: localDate(new Date(now.getFullYear(), now.getMonth() + 2, 0)),
  }
}

export function defaultMutationPeriod() {
  const now = new Date()
  return {
    dateFrom: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: localDate(now),
  }
}

export function defaultPayrollFinalPeriod() {
  const now = new Date()
  return {
    dateFrom: localDate(new Date(now.getFullYear(), 0, 1)),
    dateTo: localDate(now),
  }
}

export function defaultAttendanceClassificationPeriod() {
  const now = new Date()
  return {
    dateFrom: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: localDate(now),
  }
}

export function defaultAttendanceCorrectionPeriod() {
  const now = new Date()
  return {
    dateFrom: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: localDate(now),
  }
}

export function defaultDeviceScanPeriod() {
  const now = new Date()
  return {
    dateFrom: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: localDate(now),
  }
}

export function defaultAuditActivityPeriod() {
  const now = new Date()
  return {
    dateFrom: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: localDate(now),
  }
}

export function defaultHeadcountChangePeriod() {
  const now = new Date()
  return {
    dateFrom: localDate(new Date(now.getFullYear(), 0, 1)),
    dateTo: localDate(now),
  }
}

export function defaultTenureTurnoverPeriod() {
  const now = new Date()
  return {
    dateFrom: localDate(new Date(now.getFullYear(), 0, 1)),
    dateTo: localDate(now),
  }
}

export function tenureTurnoverRangeError(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 'Tanggal periode tidak valid.'
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (days < 1) return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  if (days > 366) {
    return 'Rentang laporan masa kerja dan turnover maksimal 366 hari kalender.'
  }
  return undefined
}

export function headcountChangeRangeError(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 'Tanggal periode tidak valid.'
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (days < 1) return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  if (days > 366) {
    return 'Rentang laporan perubahan jumlah karyawan maksimal 366 hari kalender.'
  }
  return undefined
}

export function auditActivityRangeError(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 'Tanggal periode tidak valid.'
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (days < 1) return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  if (days > 366) {
    return 'Rentang laporan aktivitas pengguna maksimal 366 hari kalender.'
  }
  return undefined
}

export function deviceScanRangeError(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 'Tanggal periode tidak valid.'
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (days < 1) return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  if (days > 366) {
    return 'Rentang laporan perangkat maksimal 366 hari kalender.'
  }
  return undefined
}

export function contractRangeError(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 'Tanggal periode tidak valid.'
  }
  if (end < start) return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  return undefined
}

export function attendanceRangeError(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 'Tanggal periode tidak valid.'
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (days < 1) return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  if (days > 31) return 'Rentang laporan maksimal 31 hari kalender.'
  return undefined
}

export function mutationRangeError(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 'Tanggal periode tidak valid.'
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (days < 1) return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  if (days > 366) return 'Rentang laporan mutasi maksimal 366 hari kalender.'
  return undefined
}

export function payrollFinalRangeError(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 'Tanggal periode tidak valid.'
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (days < 1) return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  if (days > 366) return 'Rentang laporan Payroll maksimal 366 hari kalender.'
  return undefined
}

export function attendanceClassificationRangeError(
  dateFrom: string,
  dateTo: string
) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 'Tanggal periode tidak valid.'
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (days < 1) return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  if (days > 366) {
    return 'Rentang laporan Cuti, Sakit & Izin maksimal 366 hari kalender.'
  }
  return undefined
}

export function attendanceCorrectionRangeError(
  dateFrom: string,
  dateTo: string
) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return 'Tanggal periode tidak valid.'
  }
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (days < 1) return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  if (days > 366) {
    return 'Rentang laporan Koreksi Attendance maksimal 366 hari kalender.'
  }
  return undefined
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
