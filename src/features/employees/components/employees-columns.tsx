import { Link } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Eye, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTableColumnHeader } from '@/components/data-table'
import type { Employee } from '../domain'
import { statusLabel } from '../utils'

export function createEmployeeColumns(
  onEdit: (employee: Employee) => void
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
          >
            {row.original.fullName}
          </Link>
          <p className='text-xs text-muted-foreground'>
            {row.original.employeeNumber} · {row.original.barcode}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'site',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Site' />
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'employeeType',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Jenis' />
      ),
      cell: ({ row }) => statusLabel(row.original.employeeType),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'position',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Jabatan' />
      ),
      cell: ({ row }) => row.original.position ?? '—',
    },
    {
      accessorKey: 'employeeStatus',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.employeeStatus === 'ACTIVE' ? 'default' : 'secondary'
          }
        >
          {statusLabel(row.original.employeeStatus)}
        </Badge>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex justify-end gap-1'>
          <Button size='sm' variant='ghost' asChild>
            <Link
              to='/karyawan/data-karyawan/$employeeUid'
              params={{ employeeUid: row.original.uid }}
            >
              <Eye />
              <span>Detail</span>
            </Link>
          </Button>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => onEdit(row.original)}
          >
            <Pencil />
            <span className='sr-only'>Ubah {row.original.fullName}</span>
          </Button>
        </div>
      ),
    },
  ]
}
