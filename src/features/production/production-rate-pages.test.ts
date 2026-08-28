import { describe, expect, it } from 'vitest'
import type { ProductionJob, WorkUnit } from './domain'
import {
  filterProductionJobs,
  filterProductionUnits,
} from './production-rate-pages'

const jobs: ProductionJob[] = [
  {
    uid: 'job-linting',
    code: 'BORONGAN-LINTING',
    name: 'Linting',
    category: 'BORONGAN',
    isActive: true,
    defaultUnitUid: 'unit-pcs',
    defaultUnitCode: 'PCS',
    defaultUnitName: 'Pcs / Batang',
    positionUid: 'position-operator',
    positionName: 'Operator Produksi',
  },
  {
    uid: 'job-packing',
    code: 'BORONGAN-PACKING',
    name: 'Packing',
    category: 'BORONGAN',
    isActive: true,
    defaultUnitUid: 'unit-box',
    defaultUnitCode: 'BOX',
    defaultUnitName: 'Box',
  },
]

const units: WorkUnit[] = [
  {
    uid: 'unit-pcs',
    code: 'PCS',
    name: 'Pcs / Batang',
    decimalPrecision: 0,
    isActive: true,
  },
  {
    uid: 'unit-box',
    code: 'BOX',
    name: 'Box',
    decimalPrecision: 0,
    isActive: true,
  },
]

describe('filter Master Pekerjaan Produksi', () => {
  it('mencari pekerjaan dari kode, nama, satuan, dan jabatan', () => {
    expect(filterProductionJobs(jobs, 'linting')).toEqual([jobs[0]])
    expect(filterProductionJobs(jobs, 'operator')).toEqual([jobs[0]])
    expect(filterProductionJobs(jobs, 'box')).toEqual([jobs[1]])
  })

  it('mencari satuan dari kode atau nama tanpa peka huruf besar', () => {
    expect(filterProductionUnits(units, 'pcs')).toEqual([units[0]])
    expect(filterProductionUnits(units, 'BOX')).toEqual([units[1]])
  })

  it('tetap menampilkan semua data ketika pencarian kosong', () => {
    expect(filterProductionJobs(jobs, '  ')).toEqual(jobs)
    expect(filterProductionUnits(units, '')).toEqual(units)
  })
})
