import type { ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { DataTableActionButton } from '@/components/data-table'
import type { AttendanceRecapGroup, AttendanceRecapStatus } from './domain'

export function recapColumns(
  onDetail: (item: AttendanceRecapGroup) => void
): ColumnDef<AttendanceRecapGroup>[] {
  return [
    {
      accessorKey: 'employeeName',
      header: 'Karyawan',
      meta: { label: 'Karyawan' },
      cell: ({ row }) => (
        <div className='min-w-44'>
          <p className='font-medium'>{row.original.employeeName}</p>
          <p className='text-xs text-muted-foreground'>
            {row.original.employeeNumber}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'site',
      header: 'Site',
      meta: { label: 'Site' },
      cell: ({ row }) => row.original.siteName || siteLabel(row.original.site),
    },
    {
      accessorKey: 'employeeType',
      header: 'Jenis',
      meta: { label: 'Jenis' },
      cell: ({ row }) => employeeTypeLabel(row.original.employeeType),
    },
    {
      accessorKey: 'shiftNames',
      header: 'Shift',
      meta: { label: 'Shift' },
      cell: ({ row }) => row.original.shiftNames.join(', ') || '-',
    },
    {
      accessorKey: 'scheduledDays',
      header: 'Hari kerja',
      meta: { label: 'Hari kerja' },
      cell: numericCell,
    },
    {
      accessorKey: 'presentWorkday',
      header: 'Hadir kerja',
      meta: { label: 'Hadir kerja' },
      cell: numericCell,
    },
    {
      accessorKey: 'presentHoliday',
      header: 'Hadir libur',
      meta: { label: 'Hadir hari libur' },
      cell: numericCell,
    },
    {
      accessorKey: 'absent',
      header: 'Alpha',
      meta: { label: 'Alpha' },
      cell: numericCell,
    },
    {
      id: 'classified',
      header: 'C / S / I',
      meta: { label: 'Cuti / Sakit / Izin' },
      cell: ({ row }) => (
        <span className='whitespace-nowrap tabular-nums'>
          {row.original.leave} / {row.original.sick} / {row.original.permission}
        </span>
      ),
    },
    {
      id: 'holiday',
      header: 'Libur',
      meta: { label: 'Libur' },
      cell: ({ row }) => (
        <div className='whitespace-nowrap tabular-nums'>
          <span>{row.original.holiday}</span>
          <span className='text-xs text-muted-foreground'>
            {' '}
            + {row.original.weeklyOff} mingguan
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'lateMinutes',
      header: 'Terlambat',
      meta: { label: 'Terlambat' },
      cell: ({ row }) =>
        durationWithDays(row.original.lateMinutes, row.original.lateDays),
    },
    {
      accessorKey: 'earlyLeaveMinutes',
      header: 'Pulang awal',
      meta: { label: 'Pulang awal' },
      cell: ({ row }) =>
        durationWithDays(
          row.original.earlyLeaveMinutes,
          row.original.earlyLeaveDays
        ),
    },
    {
      accessorKey: 'workedMinutes',
      header: 'Durasi',
      meta: { label: 'Durasi kerja' },
      cell: ({ row }) => durationLabel(row.original.workedMinutes),
    },
    {
      accessorKey: 'abnormal',
      header: 'Abnormal',
      meta: { label: 'Abnormal' },
      cell: ({ row }) =>
        row.original.abnormal ? (
          <Badge variant='outline' className='border-warning/60 bg-warning/10'>
            {row.original.abnormal}
          </Badge>
        ) : (
          <span className='text-muted-foreground'>0</span>
        ),
    },
    {
      id: 'attendanceStatus',
      accessorFn: () => [],
      enableHiding: false,
      header: () => null,
      cell: () => null,
    },
    {
      id: 'actions',
      enableHiding: false,
      header: () => <span className='sr-only'>Aksi</span>,
      cell: ({ row }) => (
        <DataTableActionButton
          label='Lihat rincian harian'
          onClick={() => onDetail(row.original)}
        >
          <Eye />
        </DataTableActionButton>
      ),
    },
  ]
}

function numericCell({ getValue }: { getValue: () => unknown }) {
  return <span className='tabular-nums'>{Number(getValue() ?? 0)}</span>
}

export function recapStatusLabel(value: AttendanceRecapStatus) {
  return (
    {
      PRESENT: 'Hadir',
      ABSENT: 'Alpha',
      LEAVE: 'Cuti',
      SICK: 'Sakit',
      PERMISSION: 'Izin',
      HOLIDAY: 'Libur',
      WEEKLY_OFF: 'Libur mingguan',
    }[value] ?? value
  )
}

export function employeeTypeLabel(value: string) {
  return value[0] + value.slice(1).toLowerCase()
}

export function siteLabel(value: string) {
  return `Site ${value[0]}${value.slice(1).toLowerCase()}`
}

export function durationLabel(value?: number | null) {
  const minutes = Number(value ?? 0)
  if (!minutes) return '-'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours
    ? `${new Intl.NumberFormat('id-ID').format(hours)}j ${rest}m`
    : `${rest}m`
}

function durationWithDays(minutes: number, days: number) {
  return minutes ? (
    <div className='whitespace-nowrap'>
      <span>{durationLabel(minutes)}</span>
      <span className='block text-xs text-muted-foreground'>{days} hari</span>
    </div>
  ) : (
    '-'
  )
}
