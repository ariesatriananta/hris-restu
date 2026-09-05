import { z } from 'zod'

export const educationLevelValues = [
  'NO_SCHOOLING',
  'NOT_COMPLETED_PRIMARY',
  'PRIMARY',
  'JUNIOR_SECONDARY',
  'SENIOR_SECONDARY',
  'DIPLOMA_I_II',
  'DIPLOMA_III',
  'DIPLOMA_IV_BACHELOR',
  'MASTER',
  'DOCTORATE',
] as const

export const educationLevelSchema = z.enum(educationLevelValues)
export type EducationLevel = z.infer<typeof educationLevelSchema>

const labels: Record<EducationLevel, string> = {
  NO_SCHOOLING: 'Tidak/Belum Sekolah',
  NOT_COMPLETED_PRIMARY: 'Belum Tamat SD/Sederajat',
  PRIMARY: 'Tamat SD/Sederajat',
  JUNIOR_SECONDARY: 'SLTP/Sederajat',
  SENIOR_SECONDARY: 'SLTA/Sederajat',
  DIPLOMA_I_II: 'Diploma I/II',
  DIPLOMA_III: 'Akademi/Diploma III/Sarjana Muda',
  DIPLOMA_IV_BACHELOR: 'Diploma IV/Strata I',
  MASTER: 'Strata II',
  DOCTORATE: 'Strata III',
}

export function educationLevelLabel(value: unknown) {
  const parsed = educationLevelSchema.safeParse(value)
  return parsed.success ? labels[parsed.data] : null
}
