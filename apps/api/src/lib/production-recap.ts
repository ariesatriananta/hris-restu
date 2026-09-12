import ExcelJS from 'exceljs'
import { safeSpreadsheetText } from './payroll-output.js'

export type ProductionPayrollStatus = 'NONE' | 'PARTIAL' | 'SNAPSHOTTED'

export type ProductionRecapTransaction = {
  id: number
  uid: string
  transactionNumber: string
  businessDate: string
  transactionAt: string
  quantity: string
  rateSnapshot: string
  grossAmount: string
  payrollSnapshotted: boolean
  employee: {
    id: number
    uid: string
    employeeNumber: string
    fullName: string
  }
  site: { id: number; code: string; name: string }
  job: { uid: string; code: string; name: string }
  unit: {
    uid: string
    code: string
    name: string
    decimalPrecision: number
  }
  placement: {
    employeeType: { code: string; name: string }
    position: { uid: string; name: string } | null
    department: { uid: string; name: string } | null
    productionSection: { uid: string; code: string; name: string } | null
    workGroup: { uid: string; code: string; name: string } | null
  }
  correctionSource: {
    uid: string
    transactionNumber: string
    reason: string
  } | null
}

export type ProductionQuantityTotal = {
  unit: ProductionRecapTransaction['unit']
  quantity: string
}

export type ProductionJobBreakdown = {
  job: ProductionRecapTransaction['job']
  transactionCount: number
  quantityTotals: ProductionQuantityTotal[]
  grossAmount: string
}

export type ProductionEmployeeRecap = {
  employee: ProductionRecapTransaction['employee']
  site: ProductionRecapTransaction['site']
  placement: ProductionRecapTransaction['placement']
  transactionCount: number
  jobCount: number
  quantityTotals: ProductionQuantityTotal[]
  grossAmount: string
  payrollStatus: ProductionPayrollStatus
  placementChanged: boolean
  jobs: ProductionJobBreakdown[]
}

export type ProductionJobRecap = ProductionJobBreakdown & {
  employeeCount: number
  sites: Array<ProductionRecapTransaction['site']>
  payrollStatus: ProductionPayrollStatus
}

export type ProductionRecapProjection = {
  summary: {
    employeeCount: number
    transactionCount: number
    jobCount: number
    totalGrossAmount: string
  }
  quantityTotals: ProductionQuantityTotal[]
  employees: ProductionEmployeeRecap[]
  jobs: ProductionJobRecap[]
}

export type ProductionRecapMatrixCell = {
  transactionCount: number
  quantityTotals: ProductionQuantityTotal[]
  grossAmount: string
  jobs: Array<{
    uid: string
    code: string
    name: string
    transactionCount: number
    quantityTotals: ProductionQuantityTotal[]
    grossAmount: string
  }>
  payrollStatus: ProductionPayrollStatus
}

export type ProductionRecapMatrixRow = {
  employee: ProductionRecapTransaction['employee']
  site: ProductionRecapTransaction['site']
  placement: ProductionRecapTransaction['placement']
  placementChanged: boolean
  days: Record<string, ProductionRecapMatrixCell | null>
}

export type ProductionRevisionExportRow = {
  revisionUid: string
  revisionType: 'CORRECTION' | 'VOID'
  revisionNumber: number
  reason: string
  revisedAt: string
  revisedBy: string
  sourceTransactionNumber: string
  replacementTransactionNumber: string | null
  employeeNumber: string
  employeeName: string
  site: string
  businessDate: string
  jobName: string
  beforeData: string
  afterData: string | null
}

const rupiahNumberFormat = '"Rp" #,##0'

function scaledInteger(value: string, scale: number) {
  const normalized = String(value ?? '0').trim()
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(normalized)
  if (!match) throw new Error(`Nilai desimal tidak valid: ${normalized}`)
  const fraction = (match[3] ?? '').padEnd(scale, '0').slice(0, scale)
  const result = BigInt(`${match[2]}${fraction}`)
  return match[1] === '-' ? -result : result
}

function decimalString(value: bigint, scale: number, trim = false) {
  const negative = value < 0n
  const absolute = negative ? -value : value
  const raw = absolute.toString().padStart(scale + 1, '0')
  const integer = scale ? raw.slice(0, -scale) : raw
  let fraction = scale ? raw.slice(-scale) : ''
  if (trim) fraction = fraction.replace(/0+$/, '')
  return `${negative ? '-' : ''}${integer}${fraction ? `.${fraction}` : ''}`
}

function addDecimal(left: string, right: string, scale: number, trim = false) {
  return decimalString(
    scaledInteger(left, scale) + scaledInteger(right, scale),
    scale,
    trim
  )
}

function payrollStatus(total: number, snapshotted: number): ProductionPayrollStatus {
  if (snapshotted === 0) return 'NONE'
  return snapshotted === total ? 'SNAPSHOTTED' : 'PARTIAL'
}

function quantityTotals(rows: ProductionRecapTransaction[]) {
  const totals = new Map<
    string,
    { unit: ProductionRecapTransaction['unit']; quantity: string }
  >()
  for (const row of rows) {
    const current = totals.get(row.unit.uid)
    totals.set(row.unit.uid, {
      unit: row.unit,
      quantity: addDecimal(current?.quantity ?? '0', row.quantity, 4, true),
    })
  }
  return [...totals.values()].sort((left, right) =>
    left.unit.code.localeCompare(right.unit.code, 'id')
  )
}

function jobBreakdowns(rows: ProductionRecapTransaction[]) {
  const grouped = new Map<string, ProductionRecapTransaction[]>()
  for (const row of rows) {
    const current = grouped.get(row.job.uid) ?? []
    current.push(row)
    grouped.set(row.job.uid, current)
  }
  return [...grouped.values()]
    .map((jobRows): ProductionJobBreakdown => ({
      job: jobRows[0].job,
      transactionCount: jobRows.length,
      quantityTotals: quantityTotals(jobRows),
      grossAmount: jobRows.reduce(
        (total, row) => addDecimal(total, row.grossAmount, 2),
        '0.00'
      ),
    }))
    .sort((left, right) => left.job.name.localeCompare(right.job.name, 'id'))
}

export function aggregateProductionRecap(
  rows: ProductionRecapTransaction[]
): ProductionRecapProjection {
  const employeeGroups = new Map<string, ProductionRecapTransaction[]>()
  for (const row of rows) {
    const key = `${row.employee.uid}|${row.site.code}`
    const current = employeeGroups.get(key) ?? []
    current.push(row)
    employeeGroups.set(key, current)
  }
  const employees = [...employeeGroups.values()]
    .map((employeeRows): ProductionEmployeeRecap => {
      const ordered = [...employeeRows].sort((left, right) =>
        right.transactionAt.localeCompare(left.transactionAt)
      )
      const snapshotted = employeeRows.filter(
        (row) => row.payrollSnapshotted
      ).length
      const jobs = jobBreakdowns(employeeRows)
      return {
        employee: ordered[0].employee,
        site: ordered[0].site,
        placement: ordered[0].placement,
        transactionCount: employeeRows.length,
        jobCount: jobs.length,
        quantityTotals: quantityTotals(employeeRows),
        grossAmount: employeeRows.reduce(
          (total, row) => addDecimal(total, row.grossAmount, 2),
          '0.00'
        ),
        payrollStatus: payrollStatus(employeeRows.length, snapshotted),
        placementChanged:
          new Set(
            employeeRows.map((row) =>
              JSON.stringify({
                employeeType: row.placement.employeeType.code,
                position: row.placement.position?.uid ?? null,
                section: row.placement.productionSection?.uid ?? null,
                workGroup: row.placement.workGroup?.uid ?? null,
              })
            )
          ).size > 1,
        jobs,
      }
    })
    .sort((left, right) =>
      left.employee.fullName.localeCompare(right.employee.fullName, 'id')
    )

  const jobs = jobBreakdowns(rows).map((job): ProductionJobRecap => {
    const jobRows = rows.filter((row) => row.job.uid === job.job.uid)
    const uniqueEmployees = new Set(
      jobRows.map((row) => `${row.employee.uid}|${row.site.code}`)
    )
    const sites = new Map<string, ProductionRecapTransaction['site']>()
    jobRows.forEach((row) => sites.set(row.site.code, row.site))
    return {
      ...job,
      employeeCount: uniqueEmployees.size,
      sites: [...sites.values()].sort((left, right) =>
        left.code.localeCompare(right.code)
      ),
      payrollStatus: payrollStatus(
        jobRows.length,
        jobRows.filter((row) => row.payrollSnapshotted).length
      ),
    }
  })

  return {
    summary: {
      employeeCount: new Set(rows.map((row) => row.employee.uid)).size,
      transactionCount: rows.length,
      jobCount: new Set(rows.map((row) => row.job.uid)).size,
      totalGrossAmount: rows.reduce(
        (total, row) => addDecimal(total, row.grossAmount, 2),
        '0.00'
      ),
    },
    quantityTotals: quantityTotals(rows),
    employees,
    jobs,
  }
}

export function aggregateProductionRecapMatrix(
  rows: ProductionRecapTransaction[],
  dates: string[]
): ProductionRecapMatrixRow[] {
  const employeeGroups = new Map<string, ProductionRecapTransaction[]>()
  for (const row of rows) {
    const key = `${row.employee.uid}|${row.site.code}`
    const current = employeeGroups.get(key) ?? []
    current.push(row)
    employeeGroups.set(key, current)
  }

  return [...employeeGroups.values()]
    .map((employeeRows): ProductionRecapMatrixRow => {
      const ordered = [...employeeRows].sort((left, right) =>
        right.transactionAt.localeCompare(left.transactionAt)
      )
      const placementKeys = new Set(
        employeeRows.map((row) =>
          JSON.stringify({
            employeeType: row.placement.employeeType.code,
            position: row.placement.position?.uid ?? null,
            section: row.placement.productionSection?.uid ?? null,
            workGroup: row.placement.workGroup?.uid ?? null,
          })
        )
      )
      const days = Object.fromEntries(
        dates.map((date) => {
          const dayRows = employeeRows.filter((row) => row.businessDate === date)
          if (!dayRows.length) return [date, null]
          return [
            date,
            {
              transactionCount: dayRows.length,
              quantityTotals: quantityTotals(dayRows),
              grossAmount: dayRows.reduce(
                (total, row) => addDecimal(total, row.grossAmount, 2),
                '0.00'
              ),
              jobs: jobBreakdowns(dayRows).map((job) => ({
                uid: job.job.uid,
                code: job.job.code,
                name: job.job.name,
                transactionCount: job.transactionCount,
                quantityTotals: job.quantityTotals,
                grossAmount: job.grossAmount,
              })),
              payrollStatus: payrollStatus(
                dayRows.length,
                dayRows.filter((row) => row.payrollSnapshotted).length
              ),
            } satisfies ProductionRecapMatrixCell,
          ]
        })
      )
      return {
        employee: ordered[0].employee,
        site: ordered[0].site,
        placement: ordered[0].placement,
        placementChanged: placementKeys.size > 1,
        days,
      }
    })
    .sort(
      (left, right) =>
        left.employee.fullName.localeCompare(right.employee.fullName, 'id') ||
        left.site.code.localeCompare(right.site.code, 'id')
    )
}

function enumerateProductionRecapDates(dateFrom: string, dateTo: string) {
  const dates: string[] = []
  const cursor = new Date(`${dateFrom}T00:00:00Z`)
  const end = new Date(`${dateTo}T00:00:00Z`)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function matrixDateHeader(date: string) {
  const dateLabel = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
  const dayLabel = new Intl.DateTimeFormat('id-ID', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
  return `${dateLabel}\n${dayLabel}`
}

function isWeekendDate(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

function matrixQuantityText(cell: ProductionRecapMatrixCell | null) {
  if (!cell) return '—'
  return cell.quantityTotals
    .map((item) => `${item.quantity} ${safeSpreadsheetText(item.unit.code)}`)
    .join('\n')
}

function matrixPayrollLabel(status: ProductionPayrollStatus) {
  return {
    NONE: 'Belum disnapshot',
    PARTIAL: 'Sebagian disnapshot',
    SNAPSHOTTED: 'Sudah disnapshot',
  }[status]
}

function matrixCellNote(cell: ProductionRecapMatrixCell) {
  return [
    `${cell.transactionCount} transaksi · ${matrixPayrollLabel(cell.payrollStatus)}`,
    ...cell.jobs.map(
      (job) =>
        `${job.name} (${job.code}): ${job.quantityTotals
          .map((item) => `${item.quantity} ${item.unit.code}`)
          .join(' · ')} · Rp${Number(job.grossAmount).toLocaleString('id-ID')}`
    ),
    `Total bruto: Rp${Number(cell.grossAmount).toLocaleString('id-ID')}`,
  ].join('\n')
}

function styleProductionMatrix(
  sheet: ExcelJS.Worksheet,
  dates: string[],
  mode: 'quantity' | 'gross'
) {
  sheet.views = [
    {
      state: 'frozen',
      xSplit: 5,
      ySplit: 1,
      topLeftCell: 'F2',
      activeCell: 'F2',
    },
  ]
  sheet.autoFilter = {
    from: 'A1',
    to: sheet.getCell(1, sheet.columnCount).address,
  }
  sheet.getRow(1).height = 30
  sheet.getRow(1).alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: true,
  }
  sheet.getRow(1).eachCell((cell, columnNumber) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb:
          columnNumber > 5 && isWeekendDate(dates[columnNumber - 6])
            ? 'FF2B902E'
            : 'FF0E2459',
      },
    }
  })
  sheet.columns.forEach((column, index) => {
    column.width =
      index === 0
        ? 5
        : index === 1
          ? 16
          : index === 2
            ? 28
            : index < 5
              ? 16
              : mode === 'gross'
                ? 15
                : 12
  })
}

export async function buildProductionRecapWorkbook(input: {
  projection: ProductionRecapProjection
  transactions: ProductionRecapTransaction[]
  revisions: ProductionRevisionExportRow[]
  dateFrom: string
  dateTo: string
  generatedAt: string
  generatedBy: string
}) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'HRIS RSIA'
  workbook.created = new Date(input.generatedAt)

  const matrixDates = enumerateProductionRecapDates(input.dateFrom, input.dateTo)
  const matrixRows = aggregateProductionRecapMatrix(
    input.transactions,
    matrixDates
  )

  const employees = workbook.addWorksheet('Ringkasan Karyawan')
  employees.addRow([
    'No', 'NIK', 'Nama', 'Site', 'Jenis Karyawan', 'Jabatan',
    'Bagian Produksi', 'Kelompok Kerja', 'Penempatan Berubah',
    'Jumlah Transaksi', 'Jumlah Pekerjaan', 'Nilai Bruto', 'Status Payroll',
  ])
  input.projection.employees.forEach((row, index) =>
    employees.addRow([
      index + 1,
      safeSpreadsheetText(row.employee.employeeNumber),
      safeSpreadsheetText(row.employee.fullName),
      safeSpreadsheetText(row.site.name),
      safeSpreadsheetText(row.placement.employeeType.name),
      safeSpreadsheetText(row.placement.position?.name),
      safeSpreadsheetText(row.placement.productionSection?.name),
      safeSpreadsheetText(row.placement.workGroup?.name),
      row.placementChanged ? 'Ya' : 'Tidak',
      row.transactionCount,
      row.jobCount,
      Number(row.grossAmount),
      row.payrollStatus,
    ])
  )

  const quantityMatrix = workbook.addWorksheet('Hasil per Tanggal')
  quantityMatrix.addRow([
    'No',
    'NIK',
    'Nama',
    'Site',
    'Jenis Karyawan',
    ...matrixDates.map(matrixDateHeader),
  ])
  matrixRows.forEach((row, index) => {
    const excelRow = quantityMatrix.addRow([
      index + 1,
      safeSpreadsheetText(row.employee.employeeNumber),
      safeSpreadsheetText(row.employee.fullName),
      safeSpreadsheetText(row.site.name),
      safeSpreadsheetText(row.placement.employeeType.name),
      ...matrixDates.map((date) => matrixQuantityText(row.days[date] ?? null)),
    ])
    matrixDates.forEach((date, dateIndex) => {
      const value = row.days[date] ?? null
      const cell = excelRow.getCell(dateIndex + 6)
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      }
      cell.font = { size: 8, color: { argb: value ? 'FF0E2459' : 'FF94A3B8' } }
      if (value) cell.note = matrixCellNote(value)
      if (!value || isWeekendDate(date)) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: value ? 'FFF0FDF4' : 'FFF8FAFC' },
        }
      }
    })
    const maximumUnits = Math.max(
      1,
      ...matrixDates.map(
        (date) => row.days[date]?.quantityTotals.length ?? 1
      )
    )
    excelRow.height = Math.min(60, Math.max(26, maximumUnits * 12 + 6))
  })

  const grossMatrix = workbook.addWorksheet('Bruto per Tanggal')
  grossMatrix.addRow([
    'No',
    'NIK',
    'Nama',
    'Site',
    'Jenis Karyawan',
    ...matrixDates.map(matrixDateHeader),
  ])
  matrixRows.forEach((row, index) => {
    const excelRow = grossMatrix.addRow([
      index + 1,
      safeSpreadsheetText(row.employee.employeeNumber),
      safeSpreadsheetText(row.employee.fullName),
      safeSpreadsheetText(row.site.name),
      safeSpreadsheetText(row.placement.employeeType.name),
      ...matrixDates.map((date) => {
        const value = row.days[date]
        return value ? Number(value.grossAmount) : null
      }),
    ])
    matrixDates.forEach((date, dateIndex) => {
      const value = row.days[date] ?? null
      const cell = excelRow.getCell(dateIndex + 6)
      cell.numFmt = rupiahNumberFormat
      cell.alignment = { horizontal: 'right', vertical: 'middle' }
      cell.font = {
        size: 8,
        color: { argb: value ? 'FF166534' : 'FF94A3B8' },
      }
      if (value) cell.note = matrixCellNote(value)
      if (!value || isWeekendDate(date)) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: value ? 'FFF0FDF4' : 'FFF8FAFC' },
        }
      }
    })
    excelRow.height = 26
  })

  const jobs = workbook.addWorksheet('Rincian Pekerjaan')
  jobs.addRow([
    'No', 'NIK', 'Nama', 'Site', 'Kode Pekerjaan', 'Pekerjaan',
    'Satuan', 'Kuantitas', 'Jumlah Transaksi', 'Nilai Bruto', 'Status Payroll',
  ])
  let jobIndex = 0
  for (const employee of input.projection.employees) {
    for (const job of employee.jobs) {
      for (const quantity of job.quantityTotals) {
        jobIndex += 1
        jobs.addRow([
          jobIndex,
          safeSpreadsheetText(employee.employee.employeeNumber),
          safeSpreadsheetText(employee.employee.fullName),
          safeSpreadsheetText(employee.site.name),
          safeSpreadsheetText(job.job.code),
          safeSpreadsheetText(job.job.name),
          safeSpreadsheetText(quantity.unit.code),
          Number(quantity.quantity),
          job.transactionCount,
          Number(job.grossAmount),
          employee.payrollStatus,
        ])
      }
    }
  }

  const transactions = workbook.addWorksheet('Transaksi POSTED')
  transactions.addRow([
    'No', 'Tanggal Kerja', 'Waktu Transaksi', 'Nomor Transaksi', 'NIK', 'Nama',
    'Site', 'Pekerjaan', 'Satuan', 'Kuantitas', 'Tarif Snapshot', 'Nilai Bruto',
    'Status Payroll', 'Transaksi Asal Koreksi',
  ])
  input.transactions.forEach((row, index) =>
    transactions.addRow([
      index + 1,
      row.businessDate,
      row.transactionAt,
      safeSpreadsheetText(row.transactionNumber),
      safeSpreadsheetText(row.employee.employeeNumber),
      safeSpreadsheetText(row.employee.fullName),
      safeSpreadsheetText(row.site.name),
      safeSpreadsheetText(row.job.name),
      safeSpreadsheetText(row.unit.code),
      Number(row.quantity),
      Number(row.rateSnapshot),
      Number(row.grossAmount),
      row.payrollSnapshotted ? 'SNAPSHOTTED' : 'NONE',
      safeSpreadsheetText(row.correctionSource?.transactionNumber),
    ])
  )

  const revisions = workbook.addWorksheet('Riwayat Revisi')
  revisions.addRow([
    'No', 'Jenis Revisi', 'Nomor Revisi', 'Tanggal Revisi', 'Direvisi Oleh',
    'Alasan', 'Transaksi Asal', 'Transaksi Pengganti', 'Tanggal Kerja', 'NIK',
    'Nama', 'Site', 'Pekerjaan', 'Sebelum', 'Sesudah',
  ])
  input.revisions.forEach((row, index) =>
    revisions.addRow([
      index + 1,
      safeSpreadsheetText(row.revisionType),
      row.revisionNumber,
      row.revisedAt,
      safeSpreadsheetText(row.revisedBy),
      safeSpreadsheetText(row.reason),
      safeSpreadsheetText(row.sourceTransactionNumber),
      safeSpreadsheetText(row.replacementTransactionNumber),
      row.businessDate,
      safeSpreadsheetText(row.employeeNumber),
      safeSpreadsheetText(row.employeeName),
      safeSpreadsheetText(row.site),
      safeSpreadsheetText(row.jobName),
      safeSpreadsheetText(row.beforeData),
      safeSpreadsheetText(row.afterData),
    ])
  )

  for (const sheet of workbook.worksheets) {
    if (sheet === quantityMatrix || sheet === grossMatrix) continue
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
        42,
        Math.max(
          12,
          ...values.slice(1).map((value) => String(value ?? '').length + 2)
        )
      )
    })
  }
  styleProductionMatrix(quantityMatrix, matrixDates, 'quantity')
  styleProductionMatrix(grossMatrix, matrixDates, 'gross')
  employees.getColumn(12).numFmt = rupiahNumberFormat
  jobs.getColumn(8).numFmt = '#,##0.####'
  jobs.getColumn(10).numFmt = rupiahNumberFormat
  transactions.getColumn(10).numFmt = '#,##0.####'
  transactions.getColumn(11).numFmt = '#,##0.####'
  transactions.getColumn(12).numFmt = rupiahNumberFormat

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
