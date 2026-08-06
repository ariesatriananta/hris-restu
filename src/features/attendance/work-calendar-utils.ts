import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'
import type {
  WorkCalendarEffectiveStatus,
  WorkCalendarType,
} from './work-calendar-domain'

export const workCalendarTypeOptions: Array<{
  value: WorkCalendarType
  label: string
}> = [
  { value: 'NATIONAL_HOLIDAY', label: 'Libur Nasional' },
  { value: 'COLLECTIVE_LEAVE', label: 'Cuti Bersama' },
  { value: 'SITE_HOLIDAY', label: 'Libur Site' },
  { value: 'WORKDAY_OVERRIDE', label: 'Hari Kerja Pengganti' },
]

export function workCalendarTypeLabel(value: WorkCalendarType) {
  return workCalendarTypeOptions.find((option) => option.value === value)?.label
}

export function effectiveStatusLabel(value: WorkCalendarEffectiveStatus) {
  return {
    GLOBAL_ACTIVE: 'Libur semua site',
    SELECTED: 'Berlaku di site terpilih',
    NOT_SELECTED: 'Belum berlaku',
    SITE_ACTIVE: 'Aktif di site',
    CANCELLED: 'Dibatalkan',
  }[value]
}

export function dateLabel(value: string, pattern = 'dd MMM yyyy') {
  return format(parseISO(value), pattern, { locale: id })
}

export function monthBounds(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const end = format(new Date(year, month, 0), 'yyyy-MM-dd')
  return { start, end }
}
