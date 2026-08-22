export const knowledgeArticleValues = [
  'kontrak-karyawan',
  'attendance-ringkasan',
  'attendance-pengaturan',
  'attendance-operasional',
  'attendance-rekap',
  'produksi-master',
  'produksi-transaksi',
  'produksi-rekap',
  'payroll',
] as const

export type KnowledgeArticle = (typeof knowledgeArticleValues)[number]

export const legacyAttendanceArticleValues = [
  'ringkasan',
  'pengaturan',
  'operasional',
  'rekap',
] as const

export const legacyProductionArticleValues = ['produksi-setoran'] as const

export const knowledgeArticleSearchValues = [
  ...knowledgeArticleValues,
  ...legacyAttendanceArticleValues,
  ...legacyProductionArticleValues,
] as const

export type KnowledgeArticleSearch =
  (typeof knowledgeArticleSearchValues)[number]

export function normalizeKnowledgeArticle(
  article?: KnowledgeArticleSearch
): KnowledgeArticle | undefined {
  if (!article) return undefined
  const legacyMap: Record<
    | (typeof legacyAttendanceArticleValues)[number]
    | (typeof legacyProductionArticleValues)[number],
    KnowledgeArticle
  > = {
    ringkasan: 'attendance-ringkasan',
    pengaturan: 'attendance-pengaturan',
    operasional: 'attendance-operasional',
    rekap: 'attendance-rekap',
    'produksi-setoran': 'produksi-transaksi',
  }
  return article in legacyMap
    ? legacyMap[article as keyof typeof legacyMap]
    : (article as KnowledgeArticle)
}
