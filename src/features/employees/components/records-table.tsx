import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { FileText, Pencil, Plus, RefreshCcw } from 'lucide-react'
import { useTableUrlState, type NavigateFn } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import type { PaginatedResult } from '../domain'
import { statusLabel } from '../utils'

export type EmployeeRecordRow = {
  uid: string
  employeeUid: string
  title: string
  employee: string
  site: string
  status: string
  detail: string
  expiry?: string
}

export function RecordsTable({
  data,
  search,
  navigate,
  prefix,
  statuses,
  actionLabel,
  onCreate,
  onEdit,
  isPending,
  isError,
  onRetry,
}: {
  data: PaginatedResult<EmployeeRecordRow>
  search: Record<string, unknown>
  navigate: NavigateFn
  prefix: 'contract' | 'document'
  statuses: string[]
  actionLabel: string
  onCreate: () => void
  onEdit: (uid: string) => void
  isPending: boolean
  isError: boolean
  onRetry: () => void
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const url = useTableUrlState({
    search,
    navigate,
    pagination: { pageKey: `${prefix}Page`, pageSizeKey: `${prefix}PageSize` },
    globalFilter: { key: `${prefix}Filter` },
    columnFilters: [
      { columnId: 'site', searchKey: `${prefix}Site`, type: 'array' },
      { columnId: 'status', searchKey: `${prefix}Status`, type: 'array' },
    ],
  })
  const columns: ColumnDef<EmployeeRecordRow>[] = [
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={prefix === 'contract' ? 'Kontrak' : 'Dokumen'}
        />
      ),
      cell: ({ row }) => (
        <div>
          <p className='font-medium'>{row.original.title}</p>
          <p className='text-xs text-muted-foreground'>{row.original.detail}</p>
        </div>
      ),
    },
    {
      accessorKey: 'employee',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Karyawan' />
      ),
      cell: ({ row }) => (
        <Link
          className='font-medium text-primary hover:underline'
          to='/karyawan/data-karyawan/$employeeUid'
          params={{ employeeUid: row.original.employeeUid }}
        >
          {row.original.employee}
        </Link>
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
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => (
        <div className='flex gap-1'>
          <Badge variant='secondary'>{statusLabel(row.original.status)}</Badge>
          {row.original.expiry && (
            <Badge variant='outline'>{row.original.expiry}</Badge>
          )}
        </div>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <Button
          size='sm'
          variant='ghost'
          onClick={() => onEdit(row.original.uid)}
        >
          <Pencil />
          <span className='sr-only'>Ubah</span>
        </Button>
      ),
    },
  ]
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data.items,
    columns,
    state: {
      sorting,
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualFiltering: true,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(data.total / data.pageSize)),
  })
  return (
    <Card>
      <CardContent className='space-y-4 pt-6'>
        <div className='flex justify-end'>
          <Button onClick={onCreate}>
            <Plus /> {actionLabel}
          </Button>
        </div>
        <DataTableToolbar
          table={table}
          searchPlaceholder='Cari karyawan, nomor, atau dokumen...'
          filters={[
            {
              columnId: 'site',
              title: 'Site',
              options: ['JEPARA', 'SEMARANG', 'KLATEN'].map((value) => ({
                value,
                label: statusLabel(value),
              })),
            },
            {
              columnId: 'status',
              title: 'Status',
              options: statuses.map((value) => ({
                value,
                label: statusLabel(value),
              })),
            },
          ]}
        />
        {isPending ? (
          <p className='py-10 text-center text-muted-foreground'>
            Memuat data...
          </p>
        ) : isError ? (
          <div className='py-10 text-center'>
            <p>Data gagal dimuat.</p>
            <Button variant='outline' className='mt-3' onClick={onRetry}>
              <RefreshCcw /> Coba lagi
            </Button>
          </div>
        ) : table.getRowModel().rows.length === 0 ? (
          <div className='py-10 text-center text-muted-foreground'>
            <FileText className='mx-auto mb-2' />
            Tidak ada data yang sesuai filter.
          </div>
        ) : (
          <>
            <div className='overflow-x-auto rounded-md border'>
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((group) => (
                    <TableRow key={group.id}>
                      {group.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className='text-sm text-muted-foreground'>
              Menampilkan {data.total ? (data.page - 1) * data.pageSize + 1 : 0}
              –{Math.min(data.page * data.pageSize, data.total)} dari{' '}
              {data.total} data.
            </p>
            <DataTablePagination table={table} />
          </>
        )}
      </CardContent>
    </Card>
  )
}
