import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { ClipboardPenLine, Eye, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  DataTableActionButton,
  DataTableColumnHeader,
} from '@/components/data-table'
import type { Employee } from '../domain'
import {
  employeeStatusBadgeClassName,
  employeeStatusBadgeVariant,
  statusLabel,
} from '../utils'

export function createEmployeeColumns(
  onEdit: (employee: Employee) => void,
  onCorrectRegistration: (employee: Employee) => void,
  returnTo?: string
): ColumnDef<Employee>[] {
  return [
    {
      accessorKey: 'fullName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Karyawan' />
      ),
      cell: ({ row }) => (
        <div>
          <Link
            className='font-medium hover:underline'
            to='/karyawan/data-karyawan/$employeeUid'
            params={{ employeeUid: row.original.uid }}
            search={{ returnTo }}
          >
            {row.original.fullName}
          </Link>
          <p className='text-[11px] leading-3 text-muted-foreground'>
            {row.original.employeeNumber} · {row.original.barcode}
          </p>
        </div>
      ),
      meta: {
        label: 'Karyawan',
      },
    },
    {
      accessorKey: 'site',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Site' />
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      meta: {
        label: 'Site',
      },
    },
    {
      accessorKey: 'employeeType',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Jenis & Jabatan' />
      ),
      cell: ({ row }) => (
        <div>
          <p className='font-medium'>{statusLabel(row.original.employeeType)}</p>
          <p className='text-[11px] leading-3 text-muted-foreground'>
            {row.original.position || '-'}
          </p>
        </div>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      meta: {
        label: 'Jenis & Jabatan',
      },
    },
    {
      id: 'productionArea',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Bagian Produksi' />
      ),
      cell: ({ row }) => (
        <div>
          <p className='font-medium'>{row.original.productionModule || '-'}</p>
          <p className='text-[11px] leading-3 text-muted-foreground'>
            {row.original.productionSection || '-'}
          </p>
        </div>
      ),
      meta: {
        label: 'Bagian Produksi',
      },
    },
    {
      accessorKey: 'employeeStatus',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => (
        <Badge
          variant={employeeStatusBadgeVariant(row.original.employeeStatus)}
          className={employeeStatusBadgeClassName(row.original.employeeStatus)}
        >
          {statusLabel(row.original.employeeStatus)}
        </Badge>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      meta: {
        label: 'Status',
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex justify-end gap-1'>
          <DataTableActionButton label={`Detail ${row.original.fullName}`} asChild>
            <Link
              to='/karyawan/data-karyawan/$employeeUid'
              params={{ employeeUid: row.original.uid }}
              search={{ returnTo }}
            >
              <Eye />
            </Link>
          </DataTableActionButton>
          <DataTableActionButton
            label={`Ubah data ${row.original.fullName}`}
            onClick={() => onEdit(row.original)}
          >
            <Pencil />
          </DataTableActionButton>
          {row.original.canCorrectRegistration && (
            <DataTableActionButton
              label={`Koreksi data registrasi ${row.original.fullName}`}
              onClick={() => onCorrectRegistration(row.original)}
            >
              <ClipboardPenLine />
            </DataTableActionButton>
          )}
        </div>
      ),
    },
  ]
}
