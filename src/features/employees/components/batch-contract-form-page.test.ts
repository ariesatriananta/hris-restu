import { describe, expect, it } from 'vitest'
import {
  mergeSharedContractInput,
  type BatchContractInput,
} from './batch-contract-input'

describe('mergeSharedContractInput', () => {
  it('menerapkan pengaturan kontrak bersama tanpa mengubah referensi input', () => {
    const current: BatchContractInput = {
      contractType: 'TRAINING',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      notes: 'lama',
    }
    const shared: BatchContractInput = {
      contractType: 'PKWT',
      startDate: '2026-10-01',
      endDate: '2027-03-31',
      notes: 'Batch demo',
    }

    expect(mergeSharedContractInput(current, shared)).toEqual(shared)
    expect(current.contractType).toBe('TRAINING')
  })
})
