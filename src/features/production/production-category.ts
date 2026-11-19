import { isAxiosError } from 'axios'

export type ProductionCategory = 'REGULER' | 'PREMIUM'

export const productionCategoryLabel = (value?: ProductionCategory | null) =>
  value === 'REGULER'
    ? 'Reguler'
    : value === 'PREMIUM'
      ? 'Premium'
      : 'Belum dipetakan'

export const productionCategoryToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

export function productionCategorySaveError(error: unknown, fallback: string) {
  if (
    !isAxiosError<{
      message?: string
      issues?: { fieldErrors?: Record<string, string[]> }
    }>(error)
  )
    return fallback
  const field = Object.entries(
    error.response?.data.issues?.fieldErrors ?? {}
  ).find(([, messages]) => messages.length)
  if (field) {
    const labels: Record<string, string> = {
      productionCategory: 'Kategori Produksi',
      categoryEffectiveFrom: 'Berlaku mulai',
      isActive: 'Status aktif',
      name: 'Nama',
      code: 'Kode',
      site: 'Site',
    }
    return `${labels[field[0]] ?? field[0]}: ${field[1][0]}`
  }
  return error.response?.data.message ?? fallback
}
