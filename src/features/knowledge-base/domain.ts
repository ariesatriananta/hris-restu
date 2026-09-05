export const knowledgeArticleValues = [
  'karyawan-rekrutmen',
  'karyawan-master',
  'karyawan-kontrak',
  'karyawan-mutasi',
  'attendance-ringkasan',
  'attendance-pengaturan',
  'attendance-operasional',
  'attendance-rekap',
  'produksi-master',
  'produksi-transaksi',
  'produksi-rekap',
  'payroll-ringkasan',
  'payroll-skema-tarif',
  'payroll-periode-kesiapan',
  'payroll-simulasi-komponen',
  'payroll-approval-closing',
  'payroll-riwayat-ekspor-slip',
] as const

export type KnowledgeArticle = (typeof knowledgeArticleValues)[number]

export const legacyAttendanceArticleValues = [
  'ringkasan',
  'pengaturan',
  'operasional',
  'rekap',
] as const

export const legacyProductionArticleValues = ['produksi-setoran'] as const

export const legacyEmployeeArticleValues = ['kontrak-karyawan'] as const

export const legacyPayrollArticleValues = ['payroll'] as const

export const knowledgeArticleSearchValues = [
  ...knowledgeArticleValues,
  ...legacyAttendanceArticleValues,
  ...legacyProductionArticleValues,
  ...legacyEmployeeArticleValues,
  ...legacyPayrollArticleValues,
] as const

export type KnowledgeArticleSearch =
  (typeof knowledgeArticleSearchValues)[number]

export function normalizeKnowledgeArticle(
  article?: KnowledgeArticleSearch
): KnowledgeArticle | undefined {
  if (!article) return undefined
  const legacyMap: Record<
    | (typeof legacyAttendanceArticleValues)[number]
    | (typeof legacyProductionArticleValues)[number]
    | (typeof legacyEmployeeArticleValues)[number]
    | (typeof legacyPayrollArticleValues)[number],
    KnowledgeArticle
  > = {
    'kontrak-karyawan': 'karyawan-kontrak',
    ringkasan: 'attendance-ringkasan',
    pengaturan: 'attendance-pengaturan',
    operasional: 'attendance-operasional',
    rekap: 'attendance-rekap',
    'produksi-setoran': 'produksi-transaksi',
    payroll: 'payroll-ringkasan',
  }
  return article in legacyMap
    ? legacyMap[article as keyof typeof legacyMap]
    : (article as KnowledgeArticle)
}
