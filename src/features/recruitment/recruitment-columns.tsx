import type { ColumnDef } from '@tanstack/react-table'
import { Eye } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  DataTableActionButton,
  DataTableColumnHeader,
} from '@/components/data-table'
import type { RecruitmentCandidateListItem, RecruitmentStatus } from './domain'
import { formatRecruitmentDateTime, recruitmentStatusLabel } from './utils'

// eslint-disable-next-line react-refresh/only-export-components
export function createRecruitmentColumns(
  onDetail: (uid: string) => void
): ColumnDef<RecruitmentCandidateListItem>[] {
  return [
    {
      accessorKey: 'fullName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Pelamar' />
      ),
      cell: ({ row }) => (
        <button
          type='button'
          className='text-left font-medium hover:underline'
          onClick={() => onDetail(row.original.uid)}
        >
          {row.original.fullName}
          <span className='block text-xs font-normal text-muted-foreground'>
            {row.original.applicationNumber}
          </span>
        </button>
      ),
      meta: { label: 'Pelamar' },
    },
    {
      id: 'site',
      accessorFn: (item) => item.site.code,
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Site' />
      ),
      cell: ({ row }) => row.original.site.name,
      filterFn: arrayFilter,
      meta: { label: 'Site' },
    },
    {
      id: 'identity',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Kontak & identitas' />
      ),
      cell: ({ row }) => (
        <div>
          <p>{row.original.phone}</p>
          <p className='text-xs text-muted-foreground'>
            NIK {row.original.nationalIdMasked}
          </p>
        </div>
      ),
      meta: { label: 'Kontak & identitas' },
    },
    {
      accessorKey: 'status',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => (
        <RecruitmentStatusBadge status={row.original.status} />
      ),
      filterFn: arrayFilter,
      meta: { label: 'Status' },
    },
    {
      accessorKey: 'submittedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Tanggal daftar' />
      ),
      cell: ({ row }) => (
        <time className='whitespace-nowrap tabular-nums'>
          {formatRecruitmentDateTime(row.original.submittedAt)}
        </time>
      ),
      meta: { label: 'Tanggal daftar' },
    },
    {
      accessorKey: 'statusChangedAt',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status diperbarui' />
      ),
      cell: ({ row }) => (
        <time className='whitespace-nowrap tabular-nums'>
          {formatRecruitmentDateTime(row.original.statusChangedAt)}
        </time>
      ),
      meta: { label: 'Status diperbarui' },
    },
    {
      id: 'applicationNumber',
      accessorKey: 'applicationNumber',
      enableHiding: true,
      meta: { label: 'Nomor pendaftaran' },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      header: () => <span className='sr-only'>Aksi</span>,
      cell: ({ row }) => (
        <DataTableActionButton
          label={`Lihat detail ${row.original.fullName}`}
          onClick={() => onDetail(row.original.uid)}
        >
          <Eye />
        </DataTableActionButton>
      ),
      meta: { label: 'Aksi' },
    },
  ]
}

export function RecruitmentStatusBadge({
  status,
}: {
  status: RecruitmentStatus
}) {
  const className = {
    NEW: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300',
    IN_PROGRESS:
      'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300',
    PASSED:
      'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300',
    REJECTED:
      'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300',
    CONVERTED: 'border-primary/30 bg-primary/10 text-primary',
  }[status]
  return (
    <Badge variant='outline' className={className}>
      {recruitmentStatusLabel(status)}
    </Badge>
  )
}

function arrayFilter(
  row: { getValue: (id: string) => unknown },
  id: string,
  values: string[]
) {
  return values.includes(String(row.getValue(id)))
}
