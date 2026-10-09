import ExcelJS from 'exceljs'
import { safeSpreadsheetText } from './payroll-output.js'
import type { readProductionQc } from './production-qc-storage.js'
import { LINTING_JOB_CODE } from './production-quantity-deduction.js'

export const PRODUCTION_TRANSACTION_EXPORT_MAX_ROWS = 100_000

export type ProductionTransactionExportRow = {
  transactionAt: string
  transactionNumber: string
  employeeNumber: string
  fullName: string
  siteName: string
  moduleName: string | null
  jobName: string
  jobCode: string
  unitCode: string
  quantity: string
  payableQuantity: string
  deductionPercentage: string
  rateSnapshot: string
  grossAmount: string
  status: string
  qc: Awaited<ReturnType<typeof readProductionQc>>
}

export async function buildProductionTransactionWorkbook(
  rows: ProductionTransactionExportRow[],
  generatedBy: string
) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = generatedBy
  const sheet = workbook.addWorksheet('Setoran Produksi')
  const knownDefects = new Map<
    string,
    NonNullable<ProductionTransactionExportRow['qc']>['defects'][number]
  >()
  for (const row of rows) {
    for (const defect of row.qc?.defects ?? []) {
      if (!knownDefects.has(defect.uid)) knownDefects.set(defect.uid, defect)
    }
  }
  const defects = [...knownDefects.values()].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name, 'id') ||
      a.uid.localeCompare(b.uid)
  )
  sheet.addRow([
    'Waktu',
    'Karyawan',
    'Site',
    'Nomor Karyawan',
    'Modul Produksi',
    'Pekerjaan',
    'Brand',
    'Hasil Setoran',
    'Satuan',
    'QC Reject',
    'Berat 1 (gr)',
    'Berat 2 (gr)',
    ...defects.map((defect) => safeSpreadsheetText(defect.name)),
    'Adjustment',
    'Hasil Dibayar',
    'Tarif Dasar',
    'Nilai Bruto',
    'Status',
    'Nomor Transaksi',
  ])
  const adjustmentColumn = 13 + defects.length
  for (const row of rows) {
    const lintingQc = row.jobCode === LINTING_JOB_CODE ? row.qc : null
    const quantities = new Map(
      (row.qc?.defects ?? []).map((defect) => [defect.uid, defect.quantity])
    )
    const addedRow = sheet.addRow([
      new Date(`${row.transactionAt.slice(0, 19)}Z`),
      safeSpreadsheetText(row.fullName),
      safeSpreadsheetText(row.siteName),
      safeSpreadsheetText(row.employeeNumber),
      row.moduleName ? safeSpreadsheetText(row.moduleName) : '-',
      safeSpreadsheetText(row.jobName),
      row.qc?.brand?.name ? safeSpreadsheetText(row.qc.brand.name) : '-',
      Number(row.quantity),
      safeSpreadsheetText(row.unitCode),
      lintingQc
        ? lintingQc.defects.reduce(
            (sum, defect) => sum + Math.max(0, defect.quantity),
            0
          )
        : '-',
      lintingQc?.weight1Grams == null ? '-' : Number(lintingQc.weight1Grams),
      lintingQc?.weight2Grams == null ? '-' : Number(lintingQc.weight2Grams),
      ...defects.map((defect) => {
        const quantity = quantities.get(defect.uid)
        return quantity && quantity > 0 ? quantity : '-'
      }),
      (100 - Number(row.deductionPercentage)) / 100,
      Number(row.payableQuantity),
      Number(row.rateSnapshot),
      Number(row.grossAmount),
      row.status === 'POSTED'
        ? 'Tercatat'
        : row.status === 'VOID'
          ? 'Dibatalkan'
          : safeSpreadsheetText(row.status),
      safeSpreadsheetText(row.transactionNumber),
    ])
    addedRow.font = { size: 11 }
    addedRow.alignment = { vertical: 'middle' }
  }
  sheet.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }]
  sheet.autoFilter = {
    from: 'A1',
    to: sheet.getCell(sheet.rowCount, sheet.columnCount).address,
  }
  const header = sheet.getRow(1)
  header.height = 32
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0E2459' },
  }
  header.alignment = { vertical: 'middle', wrapText: true }
  sheet.columns.forEach((column, index) => {
    column.width = [23, 30, 22, 20, 24, 24, 24, 18, 12, 15, 16, 16][index] ?? 20
  })
  sheet.getColumn(1).numFmt = 'yyyy-mm-dd hh:mm:ss'
  for (const column of [8, adjustmentColumn + 1])
    sheet.getColumn(column).numFmt = '#,##0.####'
  for (const column of [11, 12]) sheet.getColumn(column).numFmt = '#,##0.00'
  sheet.getColumn(adjustmentColumn).numFmt = '0.####%'
  sheet.getColumn(adjustmentColumn + 2).numFmt = '#,##0.####'
  sheet.getColumn(adjustmentColumn + 3).numFmt = '#,##0.00'
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
