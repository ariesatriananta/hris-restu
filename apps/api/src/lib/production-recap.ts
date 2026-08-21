import ExcelJS from 'exceljs'

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

  const employees = workbook.addWorksheet('Ringkasan Karyawan')
  employees.addRow([
    'No', 'NIK', 'Nama', 'Site', 'Jenis Karyawan', 'Jabatan',
    'Bagian Produksi', 'Kelompok Kerja', 'Penempatan Berubah',
    'Jumlah Transaksi', 'Jumlah Pekerjaan', 'Nilai Bruto', 'Status Payroll',
  ])
  input.projection.employees.forEach((row, index) =>
    employees.addRow([
      index + 1,
      row.employee.employeeNumber,
      row.employee.fullName,
      row.site.name,
      row.placement.employeeType.name,
      row.placement.position?.name ?? '',
      row.placement.productionSection?.name ?? '',
      row.placement.workGroup?.name ?? '',
      row.placementChanged ? 'Ya' : 'Tidak',
      row.transactionCount,
      row.jobCount,
      Number(row.grossAmount),
      row.payrollStatus,
    ])
  )

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
          employee.employee.employeeNumber,
          employee.employee.fullName,
          employee.site.name,
          job.job.code,
          job.job.name,
          quantity.unit.code,
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
      row.transactionNumber,
      row.employee.employeeNumber,
      row.employee.fullName,
      row.site.name,
      row.job.name,
      row.unit.code,
      Number(row.quantity),
      Number(row.rateSnapshot),
      Number(row.grossAmount),
      row.payrollSnapshotted ? 'SNAPSHOTTED' : 'NONE',
      row.correctionSource?.transactionNumber ?? '',
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
      row.revisionType,
      row.revisionNumber,
      row.revisedAt,
      row.revisedBy,
      row.reason,
      row.sourceTransactionNumber,
      row.replacementTransactionNumber ?? '',
      row.businessDate,
      row.employeeNumber,
      row.employeeName,
      row.site,
      row.jobName,
      row.beforeData,
      row.afterData ?? '',
    ])
  )

  for (const sheet of workbook.worksheets) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }]
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F766E' },
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
  employees.getColumn(12).numFmt = '#,##0'
  jobs.getColumn(8).numFmt = '#,##0.####'
  jobs.getColumn(10).numFmt = '#,##0'
  transactions.getColumn(10).numFmt = '#,##0.####'
  transactions.getColumn(11).numFmt = '#,##0.####'
  transactions.getColumn(12).numFmt = '#,##0'

  return Buffer.from(await workbook.xlsx.writeBuffer())
}
