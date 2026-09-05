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

export type EducationLevel = (typeof educationLevelValues)[number]

export const educationLevelOptions: ReadonlyArray<{
  value: EducationLevel
  label: string
}> = [
  { value: 'NO_SCHOOLING', label: 'Tidak/Belum Sekolah' },
  { value: 'NOT_COMPLETED_PRIMARY', label: 'Belum Tamat SD/Sederajat' },
  { value: 'PRIMARY', label: 'Tamat SD/Sederajat' },
  { value: 'JUNIOR_SECONDARY', label: 'SLTP/Sederajat' },
  { value: 'SENIOR_SECONDARY', label: 'SLTA/Sederajat' },
  { value: 'DIPLOMA_I_II', label: 'Diploma I/II' },
  { value: 'DIPLOMA_III', label: 'Akademi/Diploma III/Sarjana Muda' },
  { value: 'DIPLOMA_IV_BACHELOR', label: 'Diploma IV/Strata I' },
  { value: 'MASTER', label: 'Strata II' },
  { value: 'DOCTORATE', label: 'Strata III' },
]

export function educationLevelLabel(value?: string | null) {
  return educationLevelOptions.find((option) => option.value === value)?.label
}
