import type {
  AttendanceEmployeeType,
  AttendanceFoundation,
  AttendanceSiteCode,
} from './domain'

const employeeTypeLabels: Record<AttendanceEmployeeType, string> = {
  BORONGAN: 'Borongan',
  HARIAN: 'Harian',
  BULANAN: 'Bulanan',
  TRAINING: 'Training',
}

export const attendanceEmployeeTypeOptions = Object.entries(
  employeeTypeLabels
).map(([value, label]) => ({
  value: value as AttendanceEmployeeType,
  label,
}))

export function attendanceProductionSectionOptions(
  foundation?: AttendanceFoundation,
  selectedSites: AttendanceSiteCode[] = []
) {
  const seen = new Set<string>()

  return (foundation?.lookups.productionSections ?? [])
    .filter(
      (section) =>
        !selectedSites.length ||
        selectedSites.includes(section.site as AttendanceSiteCode)
    )
    .filter((section) => {
      if (seen.has(section.uid)) return false
      seen.add(section.uid)
      return true
    })
    .map((section) => ({
      value: section.uid,
      label: `${section.code} · ${section.name}`,
    }))
}
