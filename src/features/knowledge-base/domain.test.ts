import { describe, expect, it } from 'vitest'
import { knowledgeArticleValues, normalizeKnowledgeArticle } from './domain'

describe('artikel Knowledge Base Produksi', () => {
  it('menyediakan tiga panduan Produksi yang terpisah', () => {
    expect(knowledgeArticleValues).toEqual(
      expect.arrayContaining([
        'produksi-master',
        'produksi-transaksi',
        'produksi-rekap',
      ])
    )
  })

  it('mengarahkan tautan Produksi lama ke panduan Transaksi Setoran', () => {
    expect(normalizeKnowledgeArticle('produksi-setoran')).toBe(
      'produksi-transaksi'
    )
  })
})

describe('artikel Knowledge Base Karyawan', () => {
  it('menyediakan empat panduan Karyawan yang terpisah', () => {
    expect(knowledgeArticleValues).toEqual(
      expect.arrayContaining([
        'karyawan-rekrutmen',
        'karyawan-master',
        'karyawan-kontrak',
        'karyawan-mutasi',
      ])
    )
  })

  it('mengarahkan tautan Kontrak Karyawan lama ke panduan baru', () => {
    expect(normalizeKnowledgeArticle('kontrak-karyawan')).toBe(
      'karyawan-kontrak'
    )
  })
})

describe('artikel Knowledge Base Payroll', () => {
  it('menyediakan indeks dan lima panduan Payroll yang terpisah', () => {
    expect(knowledgeArticleValues).toEqual(
      expect.arrayContaining([
        'payroll-ringkasan',
        'payroll-skema-tarif',
        'payroll-periode-kesiapan',
        'payroll-simulasi-komponen',
        'payroll-approval-closing',
        'payroll-riwayat-ekspor-slip',
      ])
    )
  })

  it('mengarahkan tautan Payroll lama ke indeks Payroll', () => {
    expect(normalizeKnowledgeArticle('payroll')).toBe('payroll-ringkasan')
  })
})
