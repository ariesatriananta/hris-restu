import type { Shift } from './domain'

export function availableHistoricalAssignmentShifts(shifts: Shift[]) {
  return shifts.filter((shift) => shift.isActive)
}
