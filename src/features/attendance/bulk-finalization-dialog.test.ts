import { describe, expect, it } from 'vitest'
import { bulkRangeError } from './bulk-finalization-utils'

describe('bulkRangeError', () => {
  it('menerima rentang tepat 31 hari', () => {
    expect(
      bulkRangeError('2026-08-01', '2026-08-31', '2026-08-01', '2026-09-04')
    ).toBeUndefined()
  })

  it('menolak rentang lebih dari 31 hari', () => {
    expect(
      bulkRangeError('2026-08-01', '2026-09-01', '2026-08-01', '2026-09-04')
    ).toBe('Rentang finalisasi maksimal 31 hari kalender.')
  })

  it('menolak tanggal sebelum go-live', () => {
    expect(
      bulkRangeError('2026-07-31', '2026-08-01', '2026-08-01', '2026-09-04')
    ).toContain('Tanggal awal tidak boleh sebelum')
  })

  it('menolak tanggal masa depan dan urutan tanggal yang terbalik', () => {
    expect(
      bulkRangeError('2026-09-05', '2026-09-05', '2026-08-01', '2026-09-04')
    ).toBe('Tanggal masa depan belum dapat diproses.')
    expect(
      bulkRangeError('2026-08-02', '2026-08-01', '2026-08-01', '2026-09-04')
    ).toBe('Tanggal akhir tidak boleh sebelum tanggal awal.')
  })
})
