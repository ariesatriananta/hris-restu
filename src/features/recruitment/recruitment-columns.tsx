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
    NEW: 'border-primary/30 bg-primary/10 text-primary',
    IN_PROGRESS: 'border-warning/40 bg-warning/10 text-warning-foreground',
    PASSED: 'border-positive/40 bg-positive/10 text-positive',
    REJECTED: 'border-destructive/40 bg-destructive/10 text-destructive',
    CONVERTED: 'border-border bg-muted text-foreground',
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
