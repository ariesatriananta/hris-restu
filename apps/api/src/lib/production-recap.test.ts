import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  aggregateProductionRecap,
  aggregateProductionRecapMatrix,
  buildProductionRecapWorkbook,
  type ProductionRecapTransaction,
} from './production-recap.js'

const employeeUid = '11111111-1111-4111-8111-111111111111'
const site = { id: 1, code: 'JEPARA', name: 'Site Jepara' }

function transaction(
  overrides: Partial<ProductionRecapTransaction> = {}
): ProductionRecapTransaction {
  return {
    id: 1,
    uid: '22222222-2222-4222-8222-222222222222',
    transactionNumber: 'PRD-001',
    businessDate: '2026-08-21',
    transactionAt: '2026-08-21T08:00:00+07:00',
    quantity: '34',
    rateSnapshot: '925',
    grossAmount: '31450.00',
    payrollSnapshotted: false,
    employee: {
      id: 7,
      uid: employeeUid,
      employeeNumber: 'PSLO-001',
      fullName: 'Budi Produksi',
    },
    site,
    job: {
      uid: '33333333-3333-4333-8333-333333333333',
      code: 'BORONGAN-LINTING',
      name: 'Linting',
    },
    unit: {
      uid: '44444444-4444-4444-8444-444444444444',
      code: 'PCS',
      name: 'Pcs',
      decimalPrecision: 0,
    },
    placement: {
      employeeType: { code: 'BORONGAN', name: 'Pekerja Borongan' },
      position: null,
      department: null,
      productionSection: null,
      workGroup: null,
    },
    correctionSource: null,
    ...overrides,
  }
}

describe('Production recap projection', () => {
  it('memisahkan kuantitas per satuan dan menghitung nominal secara presisi', () => {
    const rows = [
      transaction(),
      transaction({
        id: 2,
        uid: '55555555-5555-4555-8555-555555555555',
        transactionNumber: 'PRD-002',
        quantity: '0.125',
        grossAmount: '125.25',
        payrollSnapshotted: true,
        unit: {
          uid: '66666666-6666-4666-8666-666666666666',
          code: 'KG',
          name: 'Kilogram',
          decimalPrecision: 2,
        },
      }),
    ]
    const result = aggregateProductionRecap(rows)
    expect(result.quantityTotals).toEqual([
      expect.objectContaining({
        quantity: '0.125',
        unit: expect.objectContaining({ code: 'KG' }),
      }),
      expect.objectContaining({
        quantity: '34',
        unit: expect.objectContaining({ code: 'PCS' }),
      }),
    ])
    expect(result.summary).toEqual({
      employeeCount: 1,
      transactionCount: 2,
      jobCount: 1,
      totalGrossAmount: '31575.25',
    })
    expect(result.employees[0].payrollStatus).toBe('PARTIAL')
  })

  it('mengagregasi matriks per karyawan, site, dan tanggal tanpa mencampur satuan', () => {
    const rows = [
      transaction(),
      transaction({
        id: 2,
        uid: '55555555-5555-4555-8555-555555555555',
        transactionNumber: 'PRD-002',
        quantity: '6',
        grossAmount: '5550.00',
        payrollSnapshotted: true,
      }),
      transaction({
        id: 3,
        uid: '66666666-6666-4666-8666-666666666666',
        transactionNumber: 'PRD-003',
        businessDate: '2026-08-22',
        transactionAt: '2026-08-22T09:00:00+07:00',
        quantity: '1.5',
        rateSnapshot: '1000',
        grossAmount: '1500.00',
        unit: {
          uid: '77777777-7777-4777-8777-777777777777',
          code: 'KG',
          name: 'Kilogram',
          decimalPrecision: 2,
        },
      }),
    ]

    const result = aggregateProductionRecapMatrix(rows, [
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
    ])

    expect(result).toHaveLength(1)
    expect(result[0].days['2026-08-21']).toMatchObject({
      transactionCount: 2,
      grossAmount: '37000.00',
      payrollStatus: 'PARTIAL',
      quantityTotals: [{ quantity: '40', unit: expect.objectContaining({ code: 'PCS' }) }],
    })
    expect(result[0].days['2026-08-22']).toMatchObject({
      grossAmount: '1500.00',
      quantityTotals: [{ quantity: '1.5', unit: expect.objectContaining({ code: 'KG' }) }],
    })
    expect(result[0].days['2026-08-23']).toBeNull()
  })

  it('membuat sheet operasional dan dua matriks tanggal yang rapi', async () => {
    const transactions = [
      transaction(),
      transaction({
        id: 2,
        uid: '88888888-8888-4888-8888-888888888888',
        transactionNumber: 'PRD-002',
        businessDate: '2026-08-22',
        transactionAt: '2026-08-22T09:00:00+07:00',
        quantity: '1.5',
        grossAmount: '1500.00',
        unit: {
          uid: '99999999-9999-4999-8999-999999999999',
          code: 'KG',
          name: 'Kilogram',
          decimalPrecision: 2,
        },
      }),
    ]
    const buffer = await buildProductionRecapWorkbook({
      projection: aggregateProductionRecap(transactions),
      transactions,
      revisions: [],
      dateFrom: '2026-08-21',
      dateTo: '2026-08-23',
      generatedAt: '2026-08-21T13:00:00+07:00',
      generatedBy: 'Administrator',
    })
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
    )
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Ringkasan Karyawan',
      'Hasil per Tanggal',
      'Bruto per Tanggal',
      'Rincian Pekerjaan',
      'Transaksi POSTED',
      'Riwayat Revisi',
    ])
    expect(workbook.getWorksheet('Transaksi POSTED')?.rowCount).toBe(3)

    const quantityMatrix = workbook.getWorksheet('Hasil per Tanggal')!
    expect((quantityMatrix.getRow(1).values as unknown[]).slice(1)).toEqual([
      'No',
      'NIK',
      'Nama',
      'Site',
      'Jenis Karyawan',
      '21 Agu\nJum',
      '22 Agu\nSab',
      '23 Agu\nMin',
    ])
    expect(quantityMatrix.getRow(2).getCell(6).value).toBe('34 PCS')
    expect(quantityMatrix.getRow(2).getCell(7).value).toBe('1.5 KG')
    expect(quantityMatrix.getRow(2).getCell(8).value).toBe('—')
    expect(String(quantityMatrix.getRow(2).getCell(6).note)).toContain(
      '1 transaksi'
    )
    expect(quantityMatrix.views[0]).toMatchObject({ xSplit: 5, ySplit: 1 })

    const grossMatrix = workbook.getWorksheet('Bruto per Tanggal')!
    expect(grossMatrix.getRow(2).getCell(6).value).toBe(31450)
    expect(grossMatrix.getRow(2).getCell(7).value).toBe(1500)
    expect(grossMatrix.getRow(2).getCell(8).value).toBeNull()
    expect(grossMatrix.getRow(2).getCell(6).numFmt).toBe('"Rp" #,##0')
  })

  it('mengamankan seluruh teks bebas dari formula spreadsheet', async () => {
    const transaction: ProductionRecapTransaction = {
      id: 1,
      uid: 'transaction-public-uid',
      transactionNumber: '=PRD-001',
      businessDate: '2026-08-21',
      transactionAt: '2026-08-21T08:00:00+07:00',
      quantity: '10.0000',
      rateSnapshot: '1000.0000',
      grossAmount: '10000.00',
      payrollSnapshotted: false,
      employee: {
        id: 7,
        uid: 'employee-public-uid',
        employeeNumber: '=CMD',
        fullName: '+SUM(1,1)',
      },
      site: { id: 11, code: 'JEPARA', name: '@Site Jepara' },
      job: { uid: 'job-public-uid', code: '-JOB', name: '=Linting' },
      unit: {
        uid: 'unit-public-uid',
        code: '+PCS',
        name: 'Pcs',
        decimalPrecision: 0,
      },
      placement: {
        employeeType: { code: 'BORONGAN', name: '=Borongan' },
        position: null,
        department: null,
        productionSection: null,
        workGroup: null,
      },
      correctionSource: null,
    }
    const workbookBuffer = await buildProductionRecapWorkbook({
      projection: aggregateProductionRecap([transaction]),
      transactions: [transaction],
      revisions: [
        {
          revisionUid: 'revision-public-uid',
          revisionType: 'CORRECTION',
          revisionNumber: 1,
          reason: '@Alasan',
          revisedAt: '2026-08-22T09:00:00+07:00',
          revisedBy: '=Admin',
          sourceTransactionNumber: '=PRD-001',
          replacementTransactionNumber: '+PRD-002',
          employeeNumber: '=CMD',
          employeeName: '+SUM(1,1)',
          site: '@Site Jepara',
          businessDate: '2026-08-21',
          jobName: '=Linting',
          beforeData: '=JSON',
          afterData: '+JSON',
        },
      ],
      dateFrom: '2026-08-21',
      dateTo: '2026-08-21',
      generatedAt: '2026-08-31T10:00:00+07:00',
      generatedBy: 'Admin',
    })

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Uint8Array.from(workbookBuffer).buffer)
    expect(workbook.getWorksheet('Ringkasan Karyawan')!.getCell('B2').value).toBe("'=CMD")
    expect(workbook.getWorksheet('Rincian Pekerjaan')!.getCell('E2').value).toBe("'-JOB")
    expect(workbook.getWorksheet('Transaksi POSTED')!.getCell('D2').value).toBe("'=PRD-001")
    expect(workbook.getWorksheet('Riwayat Revisi')!.getCell('F2').value).toBe("'@Alasan")
    expect(workbook.getWorksheet('Riwayat Revisi')!.getCell('O2').value).toBe("'+JSON")
  })
})
