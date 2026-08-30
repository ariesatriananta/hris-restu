import { describe, expect, it } from 'vitest'
import type { AuthSession } from '@/features/auth/domain'
import { hasPermission } from '@/features/auth/permissions'
import {
  canOfferProductionRevision,
  productionEntrySourceLabel,
} from './domain'

function session(
  role: AuthSession['user']['role'],
  permissions: AuthSession['permissions'] = []
): AuthSession {
  return {
    user: {
      uid: 'user-1',
      name: 'Penguji',
      email: null,
      role,
      roleLabel: role,
      roles: [role],
      siteAccess: [],
      mustChangePassword: false,
    },
    permissions,
    expiresAt: Date.now() + 60_000,
  }
}

describe('otorisasi revisi transaksi Produksi', () => {
  it('selalu mengizinkan SUPER_ADMIN tanpa permission eksplisit', () => {
    expect(hasPermission(session('SUPER_ADMIN'), 'production.correct')).toBe(
      true
    )
  })

  it('mengharuskan production.correct untuk peran selain SUPER_ADMIN', () => {
    expect(
      hasPermission(session('PRODUCTION_ADMIN'), 'production.correct')
    ).toBe(false)
    expect(
      hasPermission(
        session('PRODUCTION_ADMIN', ['production.correct']),
        'production.correct'
      )
    ).toBe(true)
  })
})

describe('canOfferProductionRevision', () => {
  it('menampilkan aksi hanya untuk transaksi POSTED yang tidak terkunci', () => {
    expect(
      canOfferProductionRevision(
        { status: 'POSTED', payrollLocked: false },
        true
      )
    ).toBe(true)
  })

  it('menyembunyikan aksi untuk transaksi VOID atau terkunci Payroll', () => {
    expect(
      canOfferProductionRevision({ status: 'VOID', payrollLocked: false }, true)
    ).toBe(false)
    expect(
      canOfferProductionRevision(
        { status: 'POSTED', payrollLocked: true },
        true
      )
    ).toBe(false)
  })

  it('mengikuti izin user dan keputusan backend per aksi', () => {
    const posted = { status: 'POSTED' as const, payrollLocked: false }
    expect(canOfferProductionRevision(posted, false, true)).toBe(false)
    expect(canOfferProductionRevision(posted, true, false)).toBe(false)
  })
})

describe('sumber pencatatan transaksi Produksi', () => {
  it('membedakan terminal, setoran susulan, dan hasil koreksi', () => {
    expect(productionEntrySourceLabel('TERMINAL')).toBe('Terminal Produksi')
    expect(productionEntrySourceLabel('HISTORICAL')).toBe(
      'Setoran susulan oleh HR'
    )
    expect(productionEntrySourceLabel('CORRECTION')).toBe('Hasil koreksi HR')
  })
})
