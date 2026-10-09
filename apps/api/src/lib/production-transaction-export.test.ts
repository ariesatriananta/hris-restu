import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  buildProductionTransactionWorkbook,
  type ProductionTransactionExportRow,
} from './production-transaction-export.js'

const row: ProductionTransactionExportRow = {
  transactionAt: '2026-10-09T09:12:13+07:00',
  transactionNumber: 'PRD-001',
  employeeNumber: 'J-0001',
  fullName: '=Pelamar',
  siteName: 'Jepara',
  moduleName: 'Modul lama',
  jobName: 'Linting',
  jobCode: 'BORONGAN-LINTING',
  unitCode: 'PCS',
  quantity: '500',
  payableQuantity: '490',
  deductionPercentage: '2',
  rateSnapshot: '125.25',
  grossAmount: '61372.50',
  status: 'POSTED',
  qc: {
    brand: { uid: 'brand', code: 'BR-OLD', name: 'Brand snapshot' },
    weight1Grams: '71.29',
    weight2Grams: null,
    defects: [
      {
        uid: 'cowong',
        code: 'DF-OLD',
        name: 'Cowong snapshot',
        sortOrder: 2,
        quantity: 3,
      },
      {
        uid: 'gembos',
        code: 'DF-G',
        name: '+Gembos',
        sortOrder: 1,
        quantity: 0,
      },
    ],
  },
}

describe('production transaction workbook', () => {
  it('exports numeric quantities, correct adjustment, Jakarta time and snapshot defect columns', async () => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(
      Uint8Array.from(
        await buildProductionTransactionWorkbook(
          [
            row,
            {
              ...row,
              transactionNumber: 'PRD-002',
              qc: null,
              moduleName: null,
            },
          ],
          'Bos'
        )
      ).buffer
    )
    const sheet = workbook.worksheets[0]
    expect(sheet.getCell('A2').value).toEqual(new Date('2026-10-09T09:12:13Z'))
    expect(sheet.getCell('B2').value).toBe("'=Pelamar")
    expect(sheet.getCell('E2').value).toBe('Modul lama')
    expect(sheet.getCell('G2').value).toBe('Brand snapshot')
    expect(sheet.getCell('H2').value).toBe(500)
    expect(sheet.getCell('J2').value).toBe(3)
    expect(sheet.getCell('K2').value).toBe(71.29)
    expect(sheet.getCell('L2').value).toBe('-')
    expect(sheet.getCell('M1').value).toBe("'+Gembos")
    expect(sheet.getCell('M2').value).toBe('-')
    expect(sheet.getCell('N1').value).toBe('Cowong snapshot')
    expect(sheet.getCell('N2').value).toBe(3)
    expect(sheet.getCell('O2').value).toBe(0.98)
    expect(sheet.getCell('O2').numFmt).toBe('0.####%')
    expect(sheet.getCell('P2').value).toBe(490)
    expect(sheet.getCell('Q2').value).toBe(125.25)
    expect(sheet.getCell('R2').value).toBe(61372.5)
    expect(sheet.getCell('T2').value).toBe('PRD-001')
    expect(sheet.getCell('E3').value).toBe('-')
    expect(sheet.getCell('J3').value).toBe('-')
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 })
    expect(sheet.autoFilter).toBe('A1:T3')
  })

  it('produces a styled valid header-only workbook for no transactions', async () => {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(
      Uint8Array.from(await buildProductionTransactionWorkbook([], 'Bos'))
        .buffer
    )
    const sheet = workbook.worksheets[0]
    expect(sheet.rowCount).toBe(1)
    expect(sheet.getCell('A1').value).toBe('Waktu')
    expect(sheet.getCell('R1').value).toBe('Nomor Transaksi')
    expect(sheet.getCell('A1').font.bold).toBe(true)
  })
})
