import { describe, expect, it } from 'vitest'
import {
  formatProductionRecapQuantity,
  productionRecapDefaultPeriod,
  productionRecapPayrollLabel,
  productionRecapPresetPeriod,
  productionRecapRangeError,
} from './production-recap-policy'

describe('production recap policy', () => {
  it('membentuk periode preset inklusif', () => {
    expect(productionRecapDefaultPeriod('2026-08-21')).toEqual({
      dateFrom: '2026-08-15',
      dateTo: '2026-08-21',
    })
    expect(productionRecapPresetPeriod('LAST_14', '2026-08-21')).toEqual({
      dateFrom: '2026-08-08',
      dateTo: '2026-08-21',
    })
    expect(productionRecapPresetPeriod('MONTH', '2026-08-21')).toEqual({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-21',
    })
  })

  it('membatasi periode maksimal 31 hari kalender', () => {
    expect(
      productionRecapRangeError('2026-08-01', '2026-08-31')
    ).toBeUndefined()
    expect(productionRecapRangeError('2026-08-01', '2026-09-01')).toBe(
      'Periode rekap maksimal 31 hari kalender.'
    )
    expect(productionRecapRangeError('2026-08-02', '2026-08-01')).toBe(
      'Tanggal akhir tidak boleh sebelum tanggal awal.'
    )
  })

  it('memformat kuantitas sesuai presisi satuan', () => {
    expect(formatProductionRecapQuantity('12500.0000', 0)).toBe('12.500')
    expect(formatProductionRecapQuantity('315.5000', 2)).toBe('315,5')
  })

  it('menggunakan label payroll yang tidak menyatakan sudah dibayar', () => {
    expect(productionRecapPayrollLabel('NONE')).toBe('Belum disnapshot')
    expect(productionRecapPayrollLabel('PARTIAL')).toBe('Sebagian disnapshot')
    expect(productionRecapPayrollLabel('SNAPSHOTTED')).toBe('Sudah disnapshot')
  })
})
