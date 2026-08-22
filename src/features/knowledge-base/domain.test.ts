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
