import ExcelJS from 'exceljs'

export type PayrollExportRow = {
  employeeNumber: string
  fullName: string
  employeeType: string
  departmentName: string | null
  positionName: string | null
  bankName: string | null
  bankAccountNumber: string | null
  bankAccountName: string | null
  pieceRateAmount: string
  additionalEarnings: string
  grossEarnings: string
  totalDeductions: string
  netPay: string
}

export function safeSpreadsheetText(value: unknown) {
  const raw = String(value ?? '')
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
  return Array.from(guarded)
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 || code === 10
    })
    .join('')
}

function money(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function styleSheet(sheet: ExcelJS.Worksheet, widths: number[]) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }]
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E2459' } }
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width })
  sheet.autoFilter = { from: 'A1', to: `${sheet.getColumn(widths.length).letter}1` }
}

export async function buildPayrollWorkbook(input: {
  type: 'SUMMARY' | 'PAYMENT'
  periodCode: string
  periodName: string
  siteName: string
  periodStart: string
  periodEnd: string
  runNumber: number
  runType: 'SIMULATION' | 'FINAL'
  runStatus: string
  rows: PayrollExportRow[]
}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'HRIS RSIA'
  workbook.created = new Date('2000-01-01T00:00:00.000Z')
  workbook.modified = workbook.created
  workbook.properties.date1904 = false

  const info = workbook.addWorksheet('Informasi')
  info.addRows([
    ['Periode', safeSpreadsheetText(input.periodName)],
    ['Kode', safeSpreadsheetText(input.periodCode)],
    ['Site', safeSpreadsheetText(input.siteName)],
    ['Rentang', `${input.periodStart} s.d. ${input.periodEnd}`],
    ['Run', `Run ${input.runNumber}`],
    ['Jenis hasil', input.runType === 'FINAL' ? 'FINAL / RESMI' : 'SIMULASI'],
    ['Status run', safeSpreadsheetText(input.runStatus)],
    ['Catatan', 'Status CLOSED berarti hasil Payroll disahkan, bukan bukti pembayaran.'],
  ])
  info.getColumn(1).width = 20
  info.getColumn(2).width = 70
  info.getColumn(1).font = { bold: true }

  const sheet = workbook.addWorksheet(input.type === 'PAYMENT' ? 'Daftar Pembayaran' : 'Rekap Payroll')
  if (input.type === 'PAYMENT') {
    sheet.addRow(['Nomor Karyawan','Nama','Bank','Nomor Rekening','Nama Rekening','Neto'])
    input.rows.forEach((row) => sheet.addRow([
      safeSpreadsheetText(row.employeeNumber),safeSpreadsheetText(row.fullName),
      safeSpreadsheetText(row.bankName),safeSpreadsheetText(row.bankAccountNumber),
      safeSpreadsheetText(row.bankAccountName),money(row.netPay),
    ]))
    styleSheet(sheet,[20,32,18,24,32,18])
    sheet.getColumn(6).numFmt = '[$Rp-id-ID] #,##0.00;[Red]-[$Rp-id-ID] #,##0.00'
  } else {
    sheet.addRow(['Nomor Karyawan','Nama','Jenis','Bagian','Jabatan','Bank','Rekening','Produksi','Pendapatan Lain','Bruto','Potongan','Neto'])
    input.rows.forEach((row) => sheet.addRow([
      safeSpreadsheetText(row.employeeNumber),safeSpreadsheetText(row.fullName),
      safeSpreadsheetText(row.employeeType),safeSpreadsheetText(row.departmentName),
      safeSpreadsheetText(row.positionName),safeSpreadsheetText(row.bankName),
      row.bankAccountNumber ? `****${row.bankAccountNumber.slice(-4)}` : '',
      money(row.pieceRateAmount),money(row.additionalEarnings),money(row.grossEarnings),
      money(row.totalDeductions),money(row.netPay),
    ]))
    styleSheet(sheet,[20,32,18,24,24,18,16,18,18,18,18,18])
    for (let column = 8; column <= 12; column += 1) {
      sheet.getColumn(column).numFmt = '[$Rp-id-ID] #,##0.00;[Red]-[$Rp-id-ID] #,##0.00'
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
