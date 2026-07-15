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
import { Eye, LoaderCircle, Pencil, Users } from 'lucide-react'
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
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'
import type { Employee, PaginatedResult } from '../domain'
import { statusLabel } from '../utils'

const filters = [
  {
    columnId: 'site',
    title: 'Site',
    options: ['JEPARA', 'SEMARANG', 'KLATEN'].map((value) => ({
      value,
      label: statusLabel(value),
    })),
  },
  {
    columnId: 'employeeType',
    title: 'Jenis',
    options: ['BORONGAN', 'BULANAN'].map((value) => ({
      value,
      label: statusLabel(value),
    })),
  },
  {
    columnId: 'employeeStatus',
    title: 'Status',
    options: ['ACTIVE', 'RESIGNED', 'INACTIVE'].map((value) => ({
      value,
      label: statusLabel(value),
    })),
  },
]

export function EmployeesTable({
  data,
  columns,
  search,
  navigate,
  onEdit,
  isFetching,
}: {
  data: PaginatedResult<Employee>
  columns: ColumnDef<Employee>[]
  search: Record<string, unknown>
  navigate: NavigateFn
  onEdit: (employee: Employee) => void
  isFetching?: boolean
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const tableState = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'employeeType', searchKey: 'employeeType', type: 'array' },
      {
        columnId: 'employeeStatus',
        searchKey: 'employeeStatus',
        type: 'array',
      },
    ],
  })
  // TanStack Table sengaja mengembalikan fungsi stateful; ini pola resmi starter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data.items,
    columns,
    state: {
      sorting,
      globalFilter: tableState.globalFilter,
      columnFilters: tableState.columnFilters,
      pagination: tableState.pagination,
    },
    pageCount: Math.max(1, Math.ceil(data.total / data.pageSize)),
    manualPagination: true,
    manualFiltering: true,
    onSortingChange: setSorting,
    onGlobalFilterChange: tableState.onGlobalFilterChange,
    onColumnFiltersChange: tableState.onColumnFiltersChange,
    onPaginationChange: tableState.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className='space-y-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari nama, nomor, atau barcode...'
        searchDebounceMs={600}
        filters={filters}
      />
      {isFetching && (
        <div
          role='status'
          className='flex items-center gap-2 text-xs text-muted-foreground'
        >
          <LoaderCircle className='size-3 animate-spin' /> Memperbarui data...
        </div>
      )}
      {data.items.length === 0 ? (
        <div className='py-10 text-center text-muted-foreground'>
          <Users className='mx-auto mb-2' />
          Tidak ada karyawan yang sesuai filter.
        </div>
      ) : (
        <>
          <div className='hidden rounded-md border md:block'>
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
          <div className='grid gap-3 md:hidden'>
            {data.items.map((employee) => (
              <Card key={employee.uid}>
                <CardContent className='p-4'>
                  <div className='flex justify-between gap-3'>
                    <div>
                      <Link
                        className='font-semibold hover:underline'
                        to='/karyawan/data-karyawan/$employeeUid'
                        params={{ employeeUid: employee.uid }}
                      >
                        {employee.fullName}
                      </Link>
                      <p className='text-[11px] leading-3 text-muted-foreground'>
                        {employee.employeeNumber} ·{' '}
                        {employee.position ?? 'Belum ada jabatan'}
                      </p>
                    </div>
                    <Badge>{statusLabel(employee.employeeStatus)}</Badge>
                  </div>
                  <div className='mt-3 flex items-center justify-between gap-2 text-sm'>
                    <span>
                      {employee.site} · {statusLabel(employee.employeeType)}
                    </span>
                    <div className='flex gap-2'>
                      <Button size='sm' variant='outline' asChild>
                        <Link
                          to='/karyawan/data-karyawan/$employeeUid'
                          params={{ employeeUid: employee.uid }}
                        >
                          <Eye /> Detail
                        </Link>
                      </Button>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => onEdit(employee)}
                      >
                        <Pencil /> Ubah
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <DataTablePagination table={table} />
        </>
      )}
    </div>
  )
}
