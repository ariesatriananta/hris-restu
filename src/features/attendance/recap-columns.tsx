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
      meta: {
        label: 'Karyawan',
        className: 'w-[17%] px-2',
        tdClassName: 'whitespace-normal',
      },
      cell: ({ row }) => (
        <div className='min-w-0'>
          <p className='truncate font-medium' title={row.original.employeeName}>
            {row.original.employeeName}
          </p>
          <p className='text-xs text-muted-foreground'>
            {employeeSiteLabel(row.original.site)} -{' '}
            {row.original.employeeNumber}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'site',
      header: 'Site',
      meta: { label: 'Site' },
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'employeeType',
      header: 'Jenis & Jabatan',
      meta: {
        label: 'Jenis & Jabatan',
        className: 'w-[12%] px-2',
        tdClassName: 'whitespace-normal',
      },
      cell: ({ row }) => (
        <div className='min-w-0'>
          <p className='font-medium'>
            {employeeTypeLabel(row.original.employeeType)}
          </p>
          <p
            className='truncate text-[11px] leading-3 text-muted-foreground'
            title={compactList(row.original.positions)}
          >
            {compactList(row.original.positions)}
          </p>
        </div>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      id: 'productionArea',
      header: 'Bagian Produksi',
      meta: {
        label: 'Bagian Produksi',
        className: 'w-[13%] px-2',
        tdClassName: 'whitespace-normal',
      },
      cell: ({ row }) => (
        <div className='min-w-0'>
          <p
            className='truncate font-medium'
            title={compactList(row.original.productionModules)}
          >
            {compactList(row.original.productionModules)}
          </p>
          <p
            className='truncate text-[11px] leading-3 text-muted-foreground'
            title={compactList(row.original.productionSections)}
          >
            {compactList(row.original.productionSections)}
          </p>
        </div>
      ),
    },
    {
      id: 'productionSection',
      accessorFn: (item) => item.productionSectionUids,
      header: 'Bagian produksi',
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
      meta: { label: 'Hari kerja', className: 'w-[7%] px-2' },
      cell: numericCell,
    },
    {
      accessorKey: 'presentWorkday',
      header: 'Hadir kerja',
      meta: { label: 'Hadir kerja', className: 'w-[7%] px-2' },
      cell: numericCell,
    },
    {
      accessorKey: 'presentHoliday',
      header: 'Hadir libur',
      meta: { label: 'Hadir hari libur', className: 'w-[8%] px-2' },
      cell: numericCell,
    },
    {
      accessorKey: 'absent',
      header: 'Alpha',
      meta: { label: 'Alpha', className: 'w-[6%] px-2' },
      cell: numericCell,
    },
    {
      id: 'classified',
      header: 'C / S / I',
      meta: { label: 'Cuti / Sakit / Izin', className: 'w-[9%] px-2' },
      cell: ({ row }) => (
        <span className='whitespace-nowrap tabular-nums'>
          {row.original.leave} / {row.original.sick} / {row.original.permission}
        </span>
      ),
    },
    {
      id: 'holiday',
      header: 'Libur',
      meta: { label: 'Libur', className: 'w-[8%] px-2' },
      cell: ({ row }) => (
        <div className='tabular-nums'>
          <span className='block'>{row.original.holiday}</span>
          <span className='block text-[10px] leading-3 text-muted-foreground'>
            {row.original.weeklyOff} mingguan
          </span>
        </div>
      ),
    },
    {
      accessorKey: 'lateMinutes',
      header: 'Terlambat',
      meta: { label: 'Terlambat', className: 'w-[9%] px-2' },
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
      meta: { className: 'w-[4%] px-1' },
    },
  ]
}

function numericCell({ getValue }: { getValue: () => unknown }) {
  return <span className='tabular-nums'>{Number(getValue() ?? 0)}</span>
}

function compactList(values: string[]) {
  return values.length ? values.join(', ') : '-'
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

export function employeeSiteLabel(value: string) {
  return `${value[0]}${value.slice(1).toLowerCase()}`
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
