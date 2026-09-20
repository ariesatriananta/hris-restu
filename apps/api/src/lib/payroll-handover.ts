import ExcelJS from 'exceljs'
import { ApiError } from './errors.js'
import { safeSpreadsheetText } from './payroll-output.js'

export const UNASSIGNED_MODULE_UID = 'UNASSIGNED'

export type HandoverRun = {
  uid: string
  periodCode: string
  periodName: string
  periodStart: string
  periodEnd: string
  siteName: string
  employeeType: string
  status: 'COMPLETED'
  runType: 'SIMULATION' | 'FINAL'
  runNumber: number
  isCurrent: boolean
  periodStatus: 'CALCULATED' | 'APPROVED' | 'CLOSED'
}

export type HandoverEmployee = {
  resultId: string
  employeeUid: string
  employeeNumber: string
  fullName: string
  employeeType: string
  workGroupName: string | null
  moduleUid: string | null
  moduleName: string | null
  sectionUid: string | null
  sectionName: string | null
  pieceRateAmount: string
  additionalEarnings: string
  totalDeductions: string
  netPay: string
  bpjsEmployeeDeduction: string | null
}

export type HandoverDailyAmount = {
  resultId: string
  businessDate: string
  amount: string
}

function cents(value: unknown): bigint {
  const raw = String(value ?? '0').trim()
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new ApiError(409, 'Nominal snapshot Payroll tidak valid.')
  }
  const negative = raw.startsWith('-')
  const [whole, fractional = ''] = (negative ? raw.slice(1) : raw).split('.')
  const result = BigInt(whole) * 100n + BigInt(fractional.padEnd(2, '0'))
  return negative ? -result : result
}

function money(value: bigint): string {
  const absolute = value < 0n ? -value : value
  return `${value < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`
}

function dayHeading(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

function datesBetween(start: string, end: string) {
  const dates: string[] = []
  const current = new Date(`${start}T00:00:00.000Z`)
  const last = new Date(`${end}T00:00:00.000Z`)
  if (Number.isNaN(current.getTime()) || Number.isNaN(last.getTime()) || current > last) {
    throw new ApiError(409, 'Rentang tanggal snapshot Payroll tidak valid.')
  }
  while (current <= last) {
    dates.push(current.toISOString().slice(0, 10))
    current.setUTCDate(current.getUTCDate() + 1)
    if (dates.length > 366) throw new ApiError(409, 'Rentang dokumen terlalu panjang.')
  }
  return dates
}

export function composePayrollHandover(input: {
  run: HandoverRun
  employees: HandoverEmployee[]
  dailyAmounts: HandoverDailyAmount[]
  moduleUid?: string
  sectionUid?: string
  foremen?: string[]
}) {
  const dates = datesBetween(input.run.periodStart, input.run.periodEnd)
  if (input.run.employeeType !== 'BORONGAN' ||
      input.employees.some((employee) => employee.employeeType !== 'BORONGAN')) {
    throw new ApiError(409, 'Lembar serah terima hanya untuk karyawan Borongan.')
  }
  const sections = new Map<string, string>()
  for (const employee of input.employees) {
    if (employee.sectionUid && employee.sectionName) sections.set(employee.sectionUid, employee.sectionName)
  }
  const sectionOptions = [...sections].map(([uid, name]) => ({ uid, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'))
  if (input.sectionUid && !sections.has(input.sectionUid)) {
    throw new ApiError(422, 'Jenis bagian produksi tidak tersedia pada run Payroll ini.')
  }
  const modules = new Map<string, string>()
  for (const employee of input.employees) {
    if (input.sectionUid && employee.sectionUid !== input.sectionUid) continue
    const uid = employee.moduleUid ?? UNASSIGNED_MODULE_UID
    modules.set(uid, employee.moduleName ?? 'Tanpa modul')
  }
  const moduleOptions = [...modules].map(([uid, name]) => ({ uid, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'))
  if (input.moduleUid && !modules.has(input.moduleUid)) {
    throw new ApiError(422, 'Modul tidak tersedia pada run Payroll ini.')
  }

  const byEmployee = new Map<string, Map<string, bigint>>()
  for (const daily of input.dailyAmounts) {
    if (!dates.includes(daily.businessDate)) {
      throw new ApiError(409, 'Tanggal setoran snapshot di luar periode Payroll.')
    }
    const amounts = byEmployee.get(String(daily.resultId)) ?? new Map<string, bigint>()
    amounts.set(daily.businessDate, (amounts.get(daily.businessDate) ?? 0n) + cents(daily.amount))
    byEmployee.set(String(daily.resultId), amounts)
  }

  const totalsByDate = new Map(dates.map((date) => [date, 0n]))
  let totalAdditional = 0n
  let totalBpjs = 0n
  let totalOther = 0n
  let totalDeductions = 0n
  let totalNet = 0n
  const rows = input.employees
    .filter((employee) =>
      (!input.sectionUid || employee.sectionUid === input.sectionUid) &&
      (!input.moduleUid || (employee.moduleUid ?? UNASSIGNED_MODULE_UID) === input.moduleUid))
    .map((employee) => {
      const dayAmounts = byEmployee.get(String(employee.resultId)) ?? new Map<string, bigint>()
      const production = [...dayAmounts.values()].reduce((sum, value) => sum + value, 0n)
      const additional = cents(employee.additionalEarnings)
      const deductions = cents(employee.totalDeductions)
      const bpjs = cents(employee.bpjsEmployeeDeduction)
      const other = deductions - bpjs
      const net = cents(employee.netPay)
      if (other < 0n || production !== cents(employee.pieceRateAmount) || production + additional - deductions !== net) {
        throw new ApiError(409, 'Rincian Payroll tidak cocok dengan snapshot run.')
      }
      const dailyAmounts = Object.fromEntries(dates.map((date) => {
        const value = dayAmounts.get(date) ?? 0n
        totalsByDate.set(date, (totalsByDate.get(date) ?? 0n) + value)
        return [date, money(value)]
      }))
      totalAdditional += additional
      totalBpjs += bpjs
      totalOther += other
      totalDeductions += deductions
      totalNet += net
      return {
        employeeUid: employee.employeeUid,
        employeeNumber: employee.employeeNumber,
        fullName: employee.fullName,
        employeeType: employee.employeeType,
        workGroupName: employee.workGroupName,
        sectionName: employee.sectionName ?? 'Tanpa bagian produksi',
        moduleName: employee.moduleName ?? 'Tanpa modul',
        dailyAmounts,
        additionalEarnings: money(additional),
        bpjsEmployeeDeduction: money(bpjs),
        otherDeductions: money(other),
        totalDeductions: money(deductions),
        netPay: money(net),
      }
    })

  return {
    run: input.run,
    sections: sectionOptions,
    selectedSectionUid: input.sectionUid ?? null,
    modules: moduleOptions,
    selectedModuleUid: input.moduleUid ?? null,
    foremen: input.foremen ?? [],
    dates,
    rows,
    totals: {
      dailyAmounts: Object.fromEntries(dates.map((date) => [date, money(totalsByDate.get(date) ?? 0n)])),
      additionalEarnings: money(totalAdditional),
      bpjsEmployeeDeduction: money(totalBpjs),
      otherDeductions: money(totalOther),
      totalDeductions: money(totalDeductions),
      netPay: money(totalNet),
    },
  }
}

type HandoverPreview = ReturnType<typeof composePayrollHandover>

export async function buildPayrollHandoverWorkbook(input: {
  preview: HandoverPreview
  foremanName?: string
  handoverDate: string
}) {
  const { preview } = input
  const selectedModule = preview.modules.find((module) => module.uid === preview.selectedModuleUid)
  const selectedSection = preview.sections.find((section) => section.uid === preview.selectedSectionUid)
  if (!preview.rows.length) throw new ApiError(422, 'Tidak ada karyawan untuk pilihan bagian dan modul.')

  const includeSectionColumn = !preview.selectedSectionUid
  const fixedColumnCount = includeSectionColumn ? 6 : 5
  const sectionLabel = selectedSection?.name ?? 'Semua Bagian Produksi'
  const moduleLabel = selectedModule?.name ?? 'Semua Modul'

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'HRIS RSIA'
  const sheet = workbook.addWorksheet('Serah Terima Upah', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  const header = ['No', 'ID Karyawan', 'Nama', 'Jenis Karyawan',
    ...(includeSectionColumn ? ['Bagian Produksi'] : []), 'Modul',
    ...preview.dates.map(dayHeading), 'Tambahan', 'Pot BPJS', 'Potongan Lain', 'Total Upah', 'TTD Penerima']
  const lastColumn = header.length
  sheet.mergeCells(1, 1, 1, lastColumn)
  sheet.getCell(1, 1).value = `DAFTAR UPAH TENAGA KERJA SKT ${sectionLabel.toUpperCase()} - SERAH KE MANDOR`
  sheet.getCell(1, 1).font = { bold: true, size: 14 }
  sheet.getCell(1, 1).alignment = { horizontal: 'center' }
  sheet.addRow([`Tanggal dari: ${preview.run.periodStart}`, '', '', `Sampai: ${preview.run.periodEnd}`])
  sheet.addRow([`Mandor: ${input.foremanName ? safeSpreadsheetText(input.foremanName) : '-'}`, '', '', `Modul: ${safeSpreadsheetText(moduleLabel)}`])
  sheet.addRow([`Tanggal serah: ${input.handoverDate}`, '', '', 'Lokasi: RSIA'])
  sheet.addRow([!preview.run.isCurrent ? 'RUN HISTORIS - BUKAN HASIL AKTIF' : preview.run.periodStatus === 'CLOSED' ? 'FINAL' : 'HASIL PERHITUNGAN - BELUM DISAHKAN'])
  sheet.addRow(['Total upah mencakup tambahan dan potongan lain pada kolom rincian.'])
  const roles = ['Ops Manager', 'HRD', 'Roller Leader']
  roles.forEach((role, index) => {
    const col = lastColumn - 2 + index
    sheet.getCell(2, col).value = ['Aproval', 'Diserahkan', 'Diterima'][index]
    sheet.getCell(4, col).value = role
    for (let row = 2; row <= 4; row += 1) {
      const cell = sheet.getCell(row, col)
      cell.alignment = { horizontal: 'center', vertical: row === 2 ? 'top' : 'bottom' }
      cell.border = {
        left: { style: 'thin' }, right: { style: 'thin' },
        ...(row === 2 ? { top: { style: 'thin' } } : {}),
        ...(row === 4 ? { bottom: { style: 'thin' } } : {}),
      }
    }
  })
  const headerRow = sheet.addRow(header)
  headerRow.height = 26
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E2459' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  preview.rows.forEach((row, index) => {
    const values = [index + 1, safeSpreadsheetText(row.employeeNumber), safeSpreadsheetText(row.fullName),
      safeSpreadsheetText(row.employeeType),
      ...(includeSectionColumn ? [safeSpreadsheetText(row.sectionName)] : []),
      safeSpreadsheetText(row.moduleName),
      ...preview.dates.map((date) => Number(row.dailyAmounts[date] ?? '0')),
      Number(row.additionalEarnings), Number(row.bpjsEmployeeDeduction),
      Number(row.otherDeductions), Number(row.netPay), '']
    const record = sheet.addRow(values)
    record.height = 18
    record.eachCell((cell) => { cell.border = { bottom: { style: 'hair', color: { argb: 'FFD5DCE8' } } } })
    record.getCell(1).alignment = { horizontal: 'center' }
  })
  const summary = sheet.addRow(['', '', 'TOTAL', '', '', ...(includeSectionColumn ? [''] : []), ...preview.dates.map((date) => Number(preview.totals.dailyAmounts[date] ?? '0')),
    Number(preview.totals.additionalEarnings), Number(preview.totals.bpjsEmployeeDeduction),
    Number(preview.totals.otherDeductions), Number(preview.totals.netPay), ''])
  summary.font = { bold: true }
  summary.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EDF8' } }
  for (let index = fixedColumnCount + 1; index < lastColumn; index += 1) {
    sheet.getColumn(index).numFmt = '"Rp" #,##0;[Red]("Rp" #,##0);-'
    sheet.getColumn(index).width = 16
  }
  ;[5, 21, 28, 17, ...(includeSectionColumn ? [19] : []), 17]
    .forEach((width, index) => { sheet.getColumn(index + 1).width = width })
  sheet.getColumn(lastColumn).width = 20
  sheet.views = [{ state: 'frozen', ySplit: 7, xSplit: fixedColumnCount }]
  sheet.pageSetup.printTitlesRow = '1:7'
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
