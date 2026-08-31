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
