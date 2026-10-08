import { describe, expect, it } from 'vitest'
import {
  allocateDailyQuantityDeduction,
  cumulativeDeductionQuantity,
} from './production-quantity-deduction.js'

describe('production quantity deduction', () => {
  it('membulatkan half-up sekali pada total PCS harian', () => {
    expect(cumulativeDeductionQuantity('1001.0000', '3.0000', 0)).toBe('30')
    expect(cumulativeDeductionQuantity('1020.0000', '3.0000', 0)).toBe('31')
  })

  it('hasil akhir tidak berubah ketika setoran harian dipecah', () => {
    const rows = allocateDailyQuantityDeduction(
      ['501.0000', '500.0000'],
      '3.0000',
      0
    )
    expect(rows).toEqual([
      { rawQuantity: '501.0000', deductionQuantity: '15.0000', payableQuantity: '486.0000' },
      { rawQuantity: '500.0000', deductionQuantity: '15.0000', payableQuantity: '485.0000' },
    ])
  })

  it('policy kosong ekuivalen dengan nol persen', () => {
    expect(allocateDailyQuantityDeduction(['1000.0000'], '0.0000', 0)[0]).toEqual({
      rawQuantity: '1000.0000',
      deductionQuantity: '0.0000',
      payableQuantity: '1000.0000',
    })
  })

  it('setoran kecil tetap direkonsiliasi meski satu baris dibayar nol akibat pembulatan',()=>{
    const rows=allocateDailyQuantityDeduction(['16.0000','1.0000'],'3.0000',0)
    expect(rows[1]).toEqual({rawQuantity:'1.0000',deductionQuantity:'1.0000',payableQuantity:'0.0000'})
    expect(rows.reduce((sum,row)=>sum+Number(row.payableQuantity),0)).toBe(16)
  })
})
