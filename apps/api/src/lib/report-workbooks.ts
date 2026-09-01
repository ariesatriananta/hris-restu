import ExcelJS from 'exceljs'
import { safeSpreadsheetText } from './payroll-output.js'

export type EmployeeReportExportRow = {
  employeeNumber: string
  employeeName: string
  siteName: string
  employeeTypeName: string
  employeeStatusName: string
  departmentName: string | null
  positionName: string | null
  productionModuleName: string | null
  productionSectionName: string | null
  workGroupName: string | null
  effectiveFrom: string
  effectiveTo: string | null
  historyStatus: 'VALID' | 'AMBIGUOUS'
}

export type ContractReportExportRow = {
  contractNumber: string
  employeeNumber: string
  employeeName: string
  siteName: string | null
  siteResolution: 'SNAPSHOT' | 'HISTORY' | 'UNRESOLVED'
  historyStatus: 'VALID' | 'AMBIGUOUS' | 'MISSING'
  employeeTypeName: string | null
  contractTypeName: string
  startDate: string
  endDate: string
  contractStatus: string
  statusResolution: 'LIFECYCLE' | 'UNRESOLVED'
  expiryState: 'UPCOMING' | 'EXPIRED'
  latestLifecycleDate: string | null
  latestLifecycleSource: string | null
}

export type MutationReportExportRow = {
  employeeNumber: string
  employeeName: string
  effectiveDate: string
  changeType: string
  mutationStatus: string
  sourceSiteName: string | null
  targetSiteName: string | null
  sourceEmployeeTypeName: string | null
  targetEmployeeTypeName: string | null
  sourcePositionName: string | null
  targetPositionName: string | null
  sourceDepartmentName: string | null
  targetDepartmentName: string | null
  sourceWorkGroupName: string | null
  targetWorkGroupName: string | null
  sourceProductionModuleName: string | null
  targetProductionModuleName: string | null
  sourceProductionSectionName: string | null
  targetProductionSectionName: string | null
  referenceNumber: string | null
  reason: string | null
  notes: string | null
  failureReason: string | null
}

export type PayrollFinalReportExportRow = {
  periodCode: string
  periodName: string
  periodStart: string
  periodEnd: string
  paymentDate: string | null
  siteName: string
  employeeNumber: string
  employeeName: string
  employeeType: string
  payrollBasis: string
  payFrequency: string
  departmentName: string | null
  positionName: string | null
  workGroupName: string | null
  attendanceDays: number
  productionTransactionCount: number
  bankName: string | null
  accountLast4: string | null
  pieceRateAmount: string
  basicSalaryAmount: string
  additionalEarnings: string
  grossEarnings: string
  totalDeductions: string
  netPay: string
}

export type AttendanceClassificationReportExportRow = {
  employeeNumber: string
  employeeName: string
  siteName: string
  employeeTypeName: string | null
  productionModuleName: string | null
  productionSectionName: string | null
  classificationType: string
  startDate: string
  endDate: string
  calendarDays: number
  approvalStatus: string
  requestedAt: string
  requestedByName: string
  reviewedAt: string | null
  reviewedByName: string | null
  detailCount: number
  appliedCount: number
  skippedCount: number
  reversedCount: number
  historyStatus: 'VALID' | 'AMBIGUOUS' | 'MISSING'
}

export type AttendanceCorrectionReportExportRow = {
  employeeNumber: string
  employeeName: string
  siteName: string
  employeeTypeName: string | null
  productionModuleName: string | null
  productionSectionName: string | null
  businessDate: string
  correctionType: string
  oldClockInAt: string | null
  newClockInAt: string | null
  oldClockOutAt: string | null
  newClockOutAt: string | null
  oldStatus: string | null
  newStatus: string | null
  approvalStatus: string
  requestedAt: string
  requestedByName: string
  reviewedAt: string | null
  reviewedByName: string | null
  appliedAt: string | null
  historyStatus: 'VALID' | 'AMBIGUOUS' | 'MISSING'
}

export type ShiftAssignmentReportExportRow = {
  employeeNumber: string
  employeeName: string
  siteName: string
  employeeTypeName: string
  productionModuleName: string | null
  productionSectionName: string | null
  shiftName: string | null
  shiftCode: string | null
  startTime: string | null
  endTime: string | null
  effectiveFrom: string | null
  effectiveTo: string | null
  workDays: number[]
  readinessStatus: string
}

export type DeviceScanReportExportRow = {
  deviceCode: string
  deviceName: string
  siteName: string
  deviceType: string
  locationDescription: string | null
  isActive: boolean
  isAttendanceActivated: boolean
  lastSeenAt: string | null
  firstScanAt: string | null
  lastScanAt: string | null
  totalScans: number
  clockInScans: number
  clockOutScans: number
  successfulScans: number
  rejectedScans: number
  errorScans: number
  uniqueEmployees: number
  activityStatus: string
}

export type AuditActivityReportExportRow = {
  occurredAt: string
  actorName: string
  actorUsername: string | null
  siteName: string
  module: string
  action: string
  tableName: string
  recordUid: string | null
  description: string | null
  reason: string | null
  requestId: string | null
}

export type HeadcountChangeReportExportRow = {
  effectiveDate: string
  movementType: string
  employeeNumber: string
  employeeName: string
  eventSiteName: string
  sourceSiteName: string | null
  targetSiteName: string | null
  sourceStatusName: string | null
  targetStatusName: string | null
  employeeTypeName: string
  productionSectionName: string | null
  referenceNumber: string | null
}

export type TenureTurnoverExportRow = {
  employeeNumber: string
  employeeName: string
  joinDate: string
  referenceDate: string | null
  siteName: string
  employeeTypeName: string
  productionSectionName: string | null
  tenureDays: number
  tenureMonths: number
  tenureBand: string
  referenceNumber: string | null
}

type WorkbookInfo = {
  title: string
  periodLabel: string
  generatedAt: string
  generatedBy: string
  filters: Record<string, unknown>
}

function prepareWorkbook(info: WorkbookInfo) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'HRIS RSIA'
  workbook.created = new Date(info.generatedAt)
  workbook.modified = workbook.created

  const information = workbook.addWorksheet('Informasi')
  information.addRows([
    ['Laporan', safeSpreadsheetText(info.title)],
    ['Periode', safeSpreadsheetText(info.periodLabel)],
    ['Dibuat oleh', safeSpreadsheetText(info.generatedBy)],
    ['Waktu dibuat', safeSpreadsheetText(info.generatedAt)],
    ['Filter', safeSpreadsheetText(JSON.stringify(info.filters))],
  ])
  information.getColumn(1).width = 20
  information.getColumn(2).width = 90
  information.getColumn(1).font = { bold: true }
  return workbook
}

function styleDataSheet(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0E2459' },
  }
  sheet.autoFilter = {
    from: 'A1',
    to: sheet.getCell(1, sheet.columnCount).address,
  }
  sheet.columns.forEach((column) => {
    const values = column.values ?? []
    column.width = Math.min(
      45,
      Math.max(
        12,
        ...values.map((value) => String(value ?? '').length + 2)
      )
    )
  })
}

export async function buildEmployeeReportWorkbook(input: WorkbookInfo & {
  rows: EmployeeReportExportRow[]
}) {
  const workbook = prepareWorkbook(input)
  const sheet = workbook.addWorksheet('Posisi Karyawan')
  sheet.addRow([
    'No',
    'Nomor Karyawan',
    'Nama',
    'Site',
    'Jenis Karyawan',
    'Status Karyawan',
    'Departemen',
    'Jabatan',
    'Modul Produksi',
    'Bagian Produksi',
    'Kelompok Kerja',
    'Berlaku Mulai',
    'Berlaku Sampai',
    'Kondisi Histori',
  ])
  input.rows.forEach((row, index) =>
    sheet.addRow([
      index + 1,
      safeSpreadsheetText(row.employeeNumber),
      safeSpreadsheetText(row.employeeName),
      safeSpreadsheetText(row.siteName),
      safeSpreadsheetText(row.employeeTypeName),
      safeSpreadsheetText(row.employeeStatusName),
      safeSpreadsheetText(row.departmentName),
      safeSpreadsheetText(row.positionName),
      safeSpreadsheetText(row.productionModuleName),
      safeSpreadsheetText(row.productionSectionName),
      safeSpreadsheetText(row.workGroupName),
      row.effectiveFrom,
      row.effectiveTo ?? '',
      row.historyStatus === 'VALID' ? 'Valid' : 'Perlu diperiksa',
    ])
  )
  styleDataSheet(sheet)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildContractReportWorkbook(input: WorkbookInfo & {
  rows: ContractReportExportRow[]
}) {
  const workbook = prepareWorkbook(input)
  const sheet = workbook.addWorksheet('Kontrak Berakhir')
  sheet.addRow([
    'No',
    'Nomor Kontrak',
    'Nomor Karyawan',
    'Nama',
    'Site Kontrak',
    'Sumber Site',
    'Kondisi Histori',
    'Jenis Karyawan',
    'Jenis Kontrak',
    'Mulai Kontrak',
    'Akhir Kontrak',
    'Status Kontrak',
    'Sumber Status',
    'Kondisi Akhir',
    'Perubahan Status Terakhir',
    'Sumber Perubahan',
  ])
  input.rows.forEach((row, index) =>
    sheet.addRow([
      index + 1,
      safeSpreadsheetText(row.contractNumber),
      safeSpreadsheetText(row.employeeNumber),
      safeSpreadsheetText(row.employeeName),
      safeSpreadsheetText(row.siteName),
      row.siteResolution,
      row.historyStatus === 'VALID'
        ? 'Valid'
        : row.historyStatus === 'AMBIGUOUS'
          ? 'Tumpang tindih'
          : 'Tidak ditemukan',
      safeSpreadsheetText(row.employeeTypeName),
      safeSpreadsheetText(row.contractTypeName),
      row.startDate,
      row.endDate,
      row.contractStatus,
      row.statusResolution === 'LIFECYCLE'
        ? 'Riwayat status'
        : 'Riwayat status tidak ditemukan',
      row.expiryState === 'UPCOMING' ? 'Akan berakhir' : 'Sudah berakhir',
      row.latestLifecycleDate ?? '',
      safeSpreadsheetText(row.latestLifecycleSource),
    ])
  )
  styleDataSheet(sheet)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildMutationReportWorkbook(input: WorkbookInfo & {
  rows: MutationReportExportRow[]
}) {
  const workbook = prepareWorkbook(input)
  const sheet = workbook.addWorksheet('Riwayat Mutasi')
  sheet.addRow([
    'No',
    'Nomor Karyawan',
    'Nama',
    'Tanggal Efektif',
    'Jenis Perubahan',
    'Status Proses',
    'Site Sebelum',
    'Site Sesudah',
    'Jenis Karyawan Sebelum',
    'Jenis Karyawan Sesudah',
    'Jabatan Sebelum',
    'Jabatan Sesudah',
    'Departemen Sebelum',
    'Departemen Sesudah',
    'Kelompok Kerja Sebelum',
    'Kelompok Kerja Sesudah',
    'Modul Produksi Sebelum',
    'Modul Produksi Sesudah',
    'Bagian Produksi Sebelum',
    'Bagian Produksi Sesudah',
    'Nomor Referensi',
    'Alasan',
    'Catatan',
    'Keterangan Gagal',
  ])
  input.rows.forEach((row, index) =>
    sheet.addRow([
      index + 1,
      safeSpreadsheetText(row.employeeNumber),
      safeSpreadsheetText(row.employeeName),
      row.effectiveDate,
      safeSpreadsheetText(mutationChangeTypeLabel(row.changeType)),
      safeSpreadsheetText(mutationStatusLabel(row.mutationStatus)),
      safeSpreadsheetText(row.sourceSiteName),
      safeSpreadsheetText(row.targetSiteName),
      safeSpreadsheetText(row.sourceEmployeeTypeName),
      safeSpreadsheetText(row.targetEmployeeTypeName),
      safeSpreadsheetText(row.sourcePositionName),
      safeSpreadsheetText(row.targetPositionName),
      safeSpreadsheetText(row.sourceDepartmentName),
      safeSpreadsheetText(row.targetDepartmentName),
      safeSpreadsheetText(row.sourceWorkGroupName),
      safeSpreadsheetText(row.targetWorkGroupName),
      safeSpreadsheetText(row.sourceProductionModuleName),
      safeSpreadsheetText(row.targetProductionModuleName),
      safeSpreadsheetText(row.sourceProductionSectionName),
      safeSpreadsheetText(row.targetProductionSectionName),
      safeSpreadsheetText(row.referenceNumber),
      safeSpreadsheetText(row.reason),
      safeSpreadsheetText(row.notes),
      safeSpreadsheetText(row.failureReason),
    ])
  )
  styleDataSheet(sheet)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildPayrollFinalReportWorkbook(input: WorkbookInfo & {
  rows: PayrollFinalReportExportRow[]
}) {
  const workbook = prepareWorkbook(input)
  const information = workbook.getWorksheet('Informasi')!
  information.addRow([
    'Keterangan',
    'Hanya memuat current run FINAL dari periode CLOSED. Status CLOSED tidak menyatakan gaji sudah dibayar.',
  ])

  const sheet = workbook.addWorksheet('Payroll Final')
  sheet.addRow([
    'No',
    'Kode Periode',
    'Nama Periode',
    'Mulai Periode',
    'Akhir Periode',
    'Tanggal Pembayaran',
    'Site',
    'Nomor Karyawan',
    'Nama Karyawan',
    'Jenis Karyawan',
    'Dasar Payroll',
    'Frekuensi',
    'Departemen',
    'Jabatan',
    'Kelompok Kerja',
    'Hari Hadir',
    'Jumlah Setoran',
    'Bank',
    'Rekening',
    'Hasil Borongan',
    'Gaji Pokok',
    'Pendapatan Lain',
    'Pendapatan Bruto',
    'Total Potongan',
    'Gaji Bersih',
  ])
  input.rows.forEach((row, index) =>
    sheet.addRow([
      index + 1,
      safeSpreadsheetText(row.periodCode),
      safeSpreadsheetText(row.periodName),
      row.periodStart,
      row.periodEnd,
      row.paymentDate ?? '',
      safeSpreadsheetText(row.siteName),
      safeSpreadsheetText(row.employeeNumber),
      safeSpreadsheetText(row.employeeName),
      safeSpreadsheetText(row.employeeType),
      payrollBasisLabel(row.payrollBasis),
      payFrequencyLabel(row.payFrequency),
      safeSpreadsheetText(row.departmentName),
      safeSpreadsheetText(row.positionName),
      safeSpreadsheetText(row.workGroupName),
      row.attendanceDays,
      row.productionTransactionCount,
      safeSpreadsheetText(row.bankName),
      row.accountLast4 ? `****${safeSpreadsheetText(row.accountLast4)}` : '',
      Number(row.pieceRateAmount),
      Number(row.basicSalaryAmount),
      Number(row.additionalEarnings),
      Number(row.grossEarnings),
      Number(row.totalDeductions),
      Number(row.netPay),
    ])
  )
  styleDataSheet(sheet)
  for (let column = 20; column <= 25; column += 1) {
    sheet.getColumn(column).numFmt =
      '[$Rp-id-ID] #,##0.00;[Red]-[$Rp-id-ID] #,##0.00'
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildAttendanceClassificationReportWorkbook(
  input: WorkbookInfo & { rows: AttendanceClassificationReportExportRow[] }
) {
  const workbook = prepareWorkbook(input)
  const information = workbook.getWorksheet('Informasi')!
  information.addRow([
    'Privasi',
    'Alasan pengajuan, catatan pemeriksaan, dan dokumen lampiran tidak disertakan dalam laporan ini.',
  ])

  const sheet = workbook.addWorksheet('Cuti Sakit Izin')
  sheet.addRow([
    'No',
    'Nomor Karyawan',
    'Nama Karyawan',
    'Site',
    'Jenis Karyawan',
    'Modul Produksi',
    'Bagian Produksi',
    'Jenis Pengajuan',
    'Mulai',
    'Selesai',
    'Jumlah Hari Kalender',
    'Status Pengajuan',
    'Diajukan Pada',
    'Diajukan Oleh',
    'Diperiksa Pada',
    'Diperiksa Oleh',
    'Jumlah Hari Diproses',
    'Diterapkan',
    'Dilewati',
    'Dibatalkan Setelah Disetujui',
    'Kondisi Histori Kerja',
  ])
  input.rows.forEach((row, index) =>
    sheet.addRow([
      index + 1,
      safeSpreadsheetText(row.employeeNumber),
      safeSpreadsheetText(row.employeeName),
      safeSpreadsheetText(row.siteName),
      safeSpreadsheetText(row.employeeTypeName),
      safeSpreadsheetText(row.productionModuleName),
      safeSpreadsheetText(row.productionSectionName),
      attendanceClassificationTypeLabel(row.classificationType),
      row.startDate,
      row.endDate,
      row.calendarDays,
      attendanceApprovalStatusLabel(row.approvalStatus),
      row.requestedAt,
      safeSpreadsheetText(row.requestedByName),
      row.reviewedAt ?? '',
      safeSpreadsheetText(row.reviewedByName),
      row.detailCount,
      row.appliedCount,
      row.skippedCount,
      row.reversedCount,
      row.historyStatus === 'VALID'
        ? 'Valid'
        : row.historyStatus === 'AMBIGUOUS'
          ? 'Tumpang tindih'
          : 'Tidak ditemukan',
    ])
  )
  styleDataSheet(sheet)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildAttendanceCorrectionReportWorkbook(
  input: WorkbookInfo & { rows: AttendanceCorrectionReportExportRow[] }
) {
  const workbook = prepareWorkbook(input)
  const information = workbook.getWorksheet('Informasi')!
  information.addRow([
    'Privasi',
    'Alasan koreksi dan catatan pemeriksaan tidak disertakan dalam laporan ini.',
  ])

  const sheet = workbook.addWorksheet('Koreksi Attendance')
  sheet.addRow([
    'No',
    'Nomor Karyawan',
    'Nama Karyawan',
    'Site',
    'Jenis Karyawan',
    'Modul Produksi',
    'Bagian Produksi',
    'Tanggal Kerja',
    'Jenis Koreksi',
    'Jam Masuk Sebelum',
    'Jam Masuk Sesudah',
    'Jam Pulang Sebelum',
    'Jam Pulang Sesudah',
    'Status Sebelum',
    'Status Sesudah',
    'Status Pengajuan',
    'Diajukan Pada',
    'Diajukan Oleh',
    'Diperiksa Pada',
    'Diperiksa Oleh',
    'Diterapkan Pada',
    'Kondisi Histori Kerja',
  ])
  input.rows.forEach((row, index) =>
    sheet.addRow([
      index + 1,
      safeSpreadsheetText(row.employeeNumber),
      safeSpreadsheetText(row.employeeName),
      safeSpreadsheetText(row.siteName),
      safeSpreadsheetText(row.employeeTypeName),
      safeSpreadsheetText(row.productionModuleName),
      safeSpreadsheetText(row.productionSectionName),
      row.businessDate,
      attendanceCorrectionTypeLabel(row.correctionType),
      row.oldClockInAt ?? '',
      row.newClockInAt ?? '',
      row.oldClockOutAt ?? '',
      row.newClockOutAt ?? '',
      attendanceStatusLabel(row.oldStatus),
      attendanceStatusLabel(row.newStatus),
      attendanceApprovalStatusLabel(row.approvalStatus),
      row.requestedAt,
      safeSpreadsheetText(row.requestedByName),
      row.reviewedAt ?? '',
      safeSpreadsheetText(row.reviewedByName),
      row.appliedAt ?? '',
      row.historyStatus === 'VALID'
        ? 'Valid'
        : row.historyStatus === 'AMBIGUOUS'
          ? 'Tumpang tindih'
          : 'Tidak ditemukan atau berbeda site',
    ])
  )
  styleDataSheet(sheet)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildShiftAssignmentReportWorkbook(
  input: WorkbookInfo & { rows: ShiftAssignmentReportExportRow[] }
) {
  const workbook = prepareWorkbook(input)
  const sheet = workbook.addWorksheet('Penugasan Shift')
  sheet.addRow([
    'No',
    'Nomor Karyawan',
    'Nama Karyawan',
    'Site Penempatan',
    'Jenis Karyawan',
    'Modul Produksi',
    'Bagian Produksi',
    'Shift',
    'Kode Shift',
    'Jam Kerja',
    'Berlaku Mulai',
    'Berlaku Sampai',
    'Hari Kerja',
    'Kondisi Penugasan',
  ])
  input.rows.forEach((row, index) =>
    sheet.addRow([
      index + 1,
      safeSpreadsheetText(row.employeeNumber),
      safeSpreadsheetText(row.employeeName),
      safeSpreadsheetText(row.siteName),
      safeSpreadsheetText(row.employeeTypeName),
      safeSpreadsheetText(row.productionModuleName),
      safeSpreadsheetText(row.productionSectionName),
      safeSpreadsheetText(row.shiftName),
      safeSpreadsheetText(row.shiftCode),
      row.startTime && row.endTime
        ? `${row.startTime.slice(0, 5)}-${row.endTime.slice(0, 5)}`
        : '',
      row.effectiveFrom ?? '',
      row.effectiveTo ?? 'Berlaku seterusnya',
      row.workDays.map(shiftWorkDayLabel).join(', '),
      shiftAssignmentStatusLabel(row.readinessStatus),
    ])
  )
  styleDataSheet(sheet)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildDeviceScanReportWorkbook(
  input: WorkbookInfo & { rows: DeviceScanReportExportRow[] }
) {
  const workbook = prepareWorkbook(input)
  const information = workbook.getWorksheet('Informasi')!
  information.addRow([
    'Catatan',
    'Waktu terakhir terhubung dapat berasal dari penggunaan Attendance atau Produksi. Kondisi aktivitas hanya dihitung dari scan Attendance pada periode laporan.',
  ])
  const sheet = workbook.addWorksheet('Perangkat dan Scan')
  sheet.addRow([
    'No',
    'Kode Perangkat',
    'Nama Perangkat',
    'Site',
    'Jenis Perangkat',
    'Lokasi',
    'Status Master',
    'Aktivasi Attendance',
    'Terakhir Terhubung',
    'Scan Pertama Periode',
    'Scan Terakhir Periode',
    'Total Scan',
    'Scan Masuk',
    'Scan Pulang',
    'Berhasil',
    'Ditolak',
    'Error',
    'Karyawan Unik',
    'Kondisi Aktivitas',
  ])
  input.rows.forEach((row, index) =>
    sheet.addRow([
      index + 1,
      safeSpreadsheetText(row.deviceCode),
      safeSpreadsheetText(row.deviceName),
      safeSpreadsheetText(row.siteName),
      deviceTypeLabel(row.deviceType),
      safeSpreadsheetText(row.locationDescription),
      row.isActive ? 'Aktif' : 'Nonaktif',
      row.isAttendanceActivated ? 'Sudah diaktivasi' : 'Belum diaktivasi',
      row.lastSeenAt ?? '',
      row.firstScanAt ?? '',
      row.lastScanAt ?? '',
      row.totalScans,
      row.clockInScans,
      row.clockOutScans,
      row.successfulScans,
      row.rejectedScans,
      row.errorScans,
      row.uniqueEmployees,
      deviceActivityStatusLabel(row.activityStatus),
    ])
  )
  styleDataSheet(sheet)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildAuditActivityReportWorkbook(
  input: WorkbookInfo & { rows: AuditActivityReportExportRow[] }
) {
  const workbook = prepareWorkbook(input)
  const information = workbook.getWorksheet('Informasi')!
  information.addRow([
    'Catatan keamanan',
    'File tidak memuat alamat IP, informasi perangkat, atau isi perubahan sebelum dan sesudah.',
  ])
  const sheet = workbook.addWorksheet('Aktivitas Pengguna')
  sheet.addRow([
    'No',
    'Waktu',
    'Pengguna',
    'Username',
    'Site',
    'Modul',
    'Aktivitas',
    'Sumber Data',
    'Referensi',
    'Keterangan',
    'Alasan',
    'ID Permintaan',
  ])
  input.rows.forEach((row, index) =>
    sheet.addRow([
      index + 1,
      row.occurredAt,
      safeSpreadsheetText(row.actorName),
      safeSpreadsheetText(row.actorUsername),
      safeSpreadsheetText(row.siteName),
      safeSpreadsheetText(auditModuleLabel(row.module)),
      safeSpreadsheetText(auditActionLabel(row.action)),
      safeSpreadsheetText(row.tableName),
      safeSpreadsheetText(row.recordUid),
      safeSpreadsheetText(row.description),
      safeSpreadsheetText(row.reason),
      safeSpreadsheetText(row.requestId),
    ])
  )
  styleDataSheet(sheet)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildHeadcountChangeReportWorkbook(
  input: WorkbookInfo & {
    rows: HeadcountChangeReportExportRow[]
    openingHeadcount: number
    closingHeadcount: number
    ambiguousOpening: number
    ambiguousClosing: number
  }
) {
  const workbook = prepareWorkbook(input)
  const information = workbook.getWorksheet('Informasi')!
  information.addRows([
    ['Jumlah aktif awal', input.openingHeadcount],
    ['Jumlah aktif akhir', input.closingHeadcount],
    ['Selisih bersih', input.closingHeadcount - input.openingHeadcount],
    ['Histori perlu diperiksa pada awal', input.ambiguousOpening],
    ['Histori perlu diperiksa pada akhir', input.ambiguousClosing],
    [
      'Cara membaca',
      'Jumlah awal dan akhir berasal dari histori kerja efektif berstatus Aktif. Mutasi lintas site dicatat sebagai keluar pada site asal dan masuk pada site tujuan.',
    ],
  ])
  const sheet = workbook.addWorksheet('Perubahan Karyawan')
  sheet.addRow([
    'No',
    'Tanggal Efektif',
    'Jenis Perubahan',
    'Nomor Karyawan',
    'Nama Karyawan',
    'Site Perhitungan',
    'Site Sebelum',
    'Site Sesudah',
    'Status Sebelum',
    'Status Sesudah',
    'Jenis Karyawan',
    'Bagian Produksi',
    'Nomor Referensi',
  ])
  input.rows.forEach((row, index) =>
    sheet.addRow([
      index + 1,
      row.effectiveDate,
      headcountMovementLabel(row.movementType),
      safeSpreadsheetText(row.employeeNumber),
      safeSpreadsheetText(row.employeeName),
      safeSpreadsheetText(row.eventSiteName),
      safeSpreadsheetText(row.sourceSiteName),
      safeSpreadsheetText(row.targetSiteName),
      safeSpreadsheetText(row.sourceStatusName),
      safeSpreadsheetText(row.targetStatusName),
      safeSpreadsheetText(row.employeeTypeName),
      safeSpreadsheetText(row.productionSectionName),
      safeSpreadsheetText(row.referenceNumber),
    ])
  )
  styleDataSheet(sheet)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

export async function buildTenureTurnoverReportWorkbook(
  input: WorkbookInfo & {
    summary: {
      openingHeadcount: number
      closingHeadcount: number
      averageHeadcount: number
      joined: number
      resigned: number
      turnoverRate: number
      averageTenureMonths: number
      lessThanOneYear: number
      oneToThreeYears: number
      threeToFiveYears: number
      fiveYearsOrMore: number
      ambiguousOpening: number
      ambiguousClosing: number
    }
    activeRows: TenureTurnoverExportRow[]
    turnoverRows: TenureTurnoverExportRow[]
  }
) {
  const workbook = prepareWorkbook(input)
  const information = workbook.getWorksheet('Informasi')!
  information.addRows([
    ['Karyawan aktif awal', input.summary.openingHeadcount],
    ['Karyawan aktif akhir', input.summary.closingHeadcount],
    ['Rata-rata jumlah karyawan', input.summary.averageHeadcount],
    ['Karyawan masuk', input.summary.joined],
    ['Karyawan resign', input.summary.resigned],
    ['Turnover', `${input.summary.turnoverRate.toFixed(2)}%`],
    ['Rata-rata masa kerja', tenureDurationLabel(input.summary.averageTenureMonths)],
    ['Histori perlu diperiksa pada awal', input.summary.ambiguousOpening],
    ['Histori perlu diperiksa pada akhir', input.summary.ambiguousClosing],
    [
      'Cara membaca turnover',
      'Jumlah resign dalam periode dibagi rata-rata jumlah karyawan aktif pada awal dan akhir periode.',
    ],
  ])

  const activeSheet = workbook.addWorksheet('Masa Kerja Aktif')
  activeSheet.addRow([
    'No',
    'Nomor Karyawan',
    'Nama Karyawan',
    'Tanggal Bergabung',
    'Site',
    'Jenis Karyawan',
    'Bagian Produksi',
    'Masa Kerja',
    'Kelompok Masa Kerja',
  ])
  input.activeRows.forEach((row, index) =>
    activeSheet.addRow([
      index + 1,
      safeSpreadsheetText(row.employeeNumber),
      safeSpreadsheetText(row.employeeName),
      row.joinDate,
      safeSpreadsheetText(row.siteName),
      safeSpreadsheetText(row.employeeTypeName),
      safeSpreadsheetText(row.productionSectionName),
      tenureDurationLabel(row.tenureMonths),
      tenureBandLabel(row.tenureBand),
    ])
  )
  styleDataSheet(activeSheet)

  const turnoverSheet = workbook.addWorksheet('Karyawan Resign')
  turnoverSheet.addRow([
    'No',
    'Tanggal Resign',
    'Nomor Karyawan',
    'Nama Karyawan',
    'Tanggal Bergabung',
    'Site Terakhir',
    'Jenis Karyawan',
    'Bagian Produksi',
    'Masa Kerja Saat Resign',
    'Kelompok Masa Kerja',
    'Nomor Referensi',
  ])
  input.turnoverRows.forEach((row, index) =>
    turnoverSheet.addRow([
      index + 1,
      row.referenceDate,
      safeSpreadsheetText(row.employeeNumber),
      safeSpreadsheetText(row.employeeName),
      row.joinDate,
      safeSpreadsheetText(row.siteName),
      safeSpreadsheetText(row.employeeTypeName),
      safeSpreadsheetText(row.productionSectionName),
      tenureDurationLabel(row.tenureMonths),
      tenureBandLabel(row.tenureBand),
      safeSpreadsheetText(row.referenceNumber),
    ])
  )
  styleDataSheet(turnoverSheet)
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

function tenureDurationLabel(months: number) {
  const safeMonths = Math.max(0, Math.round(Number(months) || 0))
  const years = Math.floor(safeMonths / 12)
  const remainder = safeMonths % 12
  return years ? `${years} tahun ${remainder} bulan` : `${remainder} bulan`
}

function tenureBandLabel(value: string) {
  return (
    {
      LT_1_YEAR: 'Kurang dari 1 tahun',
      Y1_TO_3: '1 sampai kurang dari 3 tahun',
      Y3_TO_5: '3 sampai kurang dari 5 tahun',
      GTE_5_YEARS: '5 tahun atau lebih',
    }[value] ?? value
  )
}

function headcountMovementLabel(value: string) {
  return (
    {
      JOIN: 'Karyawan masuk',
      TRANSFER_IN: 'Mutasi masuk',
      TRANSFER_OUT: 'Mutasi keluar',
      RESIGN: 'Resign',
      DEACTIVATED: 'Menjadi nonaktif',
      REACTIVATED: 'Aktif kembali',
      STATUS_CHANGE: 'Perubahan status lainnya',
    }[value] ?? value
  )
}

function auditActionLabel(value: string) {
  return (
    {
      CREATE: 'Membuat',
      UPDATE: 'Mengubah',
      DELETE: 'Menghapus',
      VOID: 'Membatalkan',
      APPROVE: 'Menyetujui',
      REJECT: 'Menolak',
      LOGIN: 'Masuk',
      LOGOUT: 'Keluar',
      EXPORT: 'Ekspor',
      PRINT: 'Mencetak',
      CLOSE: 'Menutup periode/proses',
      OTHER: 'Aktivitas lain',
    }[value] ?? value
  )
}

function auditModuleLabel(value: string) {
  return (
    {
      SYSTEM: 'Administrasi Sistem',
      AUTH: 'Akun',
      ATTENDANCE: 'Attendance',
      EMPLOYEES: 'Karyawan',
      PRODUCTION: 'Produksi Borongan',
      PAYROLL: 'Payroll',
      DOCUMENTS: 'Dokumen',
      REPORTS: 'Laporan',
    }[value.toUpperCase()] ?? value
  )
}

function deviceTypeLabel(value: string) {
  return (
    {
      MOBILE_CAMERA: 'Kamera HP',
      USB_SCANNER: 'Scanner USB',
      TERMINAL: 'Terminal',
      OTHER: 'Lainnya',
    }[value] ?? value
  )
}

function deviceActivityStatusLabel(value: string) {
  return (
    {
      HEALTHY: 'Aktivitas normal',
      ATTENTION: 'Ada scan ditolak atau error',
      NO_ACTIVITY: 'Tidak ada aktivitas pada periode',
      NOT_ACTIVATED: 'Belum diaktivasi untuk Attendance',
      INACTIVE: 'Perangkat nonaktif',
    }[value] ?? value
  )
}

function shiftWorkDayLabel(value: number) {
  return ['-', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'][value] ?? '-'
}

function shiftAssignmentStatusLabel(value: string) {
  return (
    {
      READY: 'Siap digunakan',
      NO_ASSIGNMENT: 'Belum pernah memiliki shift',
      ENDED: 'Penugasan sudah berakhir',
      UPCOMING: 'Belum mulai berlaku',
      OVERLAP: 'Penugasan bertumpang-tindih',
      SITE_MISMATCH: 'Site shift berbeda dengan penempatan',
      SHIFT_INACTIVE: 'Shift tidak aktif',
      NO_WORK_DAYS: 'Hari kerja belum dipilih',
      EMPLOYMENT_AMBIGUOUS: 'Riwayat kerja bertumpang-tindih',
    }[value] ?? value
  )
}

function attendanceClassificationTypeLabel(value: string) {
  return ({ LEAVE: 'Cuti', SICK: 'Sakit', PERMISSION: 'Izin' })[value] ?? value
}

function attendanceApprovalStatusLabel(value: string) {
  return (
    {
      PENDING: 'Menunggu pemeriksaan',
      APPROVED: 'Disetujui',
      REJECTED: 'Ditolak',
      CANCELLED: 'Dibatalkan',
    }[value] ?? value
  )
}

function attendanceCorrectionTypeLabel(value: string) {
  return (
    {
      CLOCK_IN: 'Jam masuk',
      CLOCK_OUT: 'Jam pulang',
      BOTH: 'Jam masuk dan pulang',
      STATUS: 'Status kehadiran',
    }[value] ?? value
  )
}

function attendanceStatusLabel(value: string | null) {
  if (!value) return ''
  return (
    {
      PRESENT: 'Hadir',
      ABSENT: 'Alpha',
      LEAVE: 'Cuti',
      SICK: 'Sakit',
      PERMISSION: 'Izin',
      HOLIDAY: 'Libur',
      WEEKLY_OFF: 'Libur mingguan',
    }[value] ?? value
  )
}

function mutationChangeTypeLabel(value: string) {
  return (
    {
      TRANSFER: 'Pindah site',
      PROMOTION: 'Promosi',
      DEMOTION: 'Penurunan jabatan',
      STATUS_CHANGE: 'Perubahan status kerja',
      TYPE_CHANGE: 'Perubahan jenis karyawan',
      DEPARTMENT_CHANGE: 'Perubahan departemen',
      GROUP_CHANGE: 'Perubahan kelompok kerja',
      PRODUCTION_ASSIGNMENT_CHANGE: 'Perubahan bagian produksi',
      OTHER: 'Perubahan lainnya',
    }[value] ?? value
  )
}

function mutationStatusLabel(value: string) {
  return (
    {
      APPLIED: 'Sudah berlaku',
      SCHEDULED: 'Terjadwal',
      FAILED: 'Perlu diperbaiki',
      CANCELLED: 'Dibatalkan',
    }[value] ?? value
  )
}

function payrollBasisLabel(value: string) {
  return value === 'PIECE_RATE'
    ? 'Berdasarkan hasil produksi'
    : value === 'TIME_BASED'
      ? 'Berdasarkan waktu kerja'
      : value
}

function payFrequencyLabel(value: string) {
  return value === 'WEEKLY'
    ? 'Mingguan'
    : value === 'MONTHLY'
      ? 'Bulanan'
      : value
}
