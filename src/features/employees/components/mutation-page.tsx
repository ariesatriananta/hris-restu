import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { Eye, GitBranch, RefreshCcw } from 'lucide-react'
import { useTableUrlState, type NavigateFn } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
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
import { Main } from '@/components/layout/main'
import { useEmployeeList, useHistories } from '../data/queries'
import type { EmploymentHistory } from '../domain'
import { formatDate, statusLabel } from '../utils'
import { MutationDetailDrawer } from './mutation-detail-drawer'

type MutationRow = EmploymentHistory & {
  employeeName: string
  employeeNumber: string
}

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
    columnId: 'changeType',
    title: 'Perubahan',
    options: [
      'INITIAL',
      'TRANSFER',
      'PROMOTION',
      'DEMOTION',
      'STATUS_CHANGE',
      'TYPE_CHANGE',
      'PRODUCTION_ASSIGNMENT_CHANGE',
      'OTHER',
    ].map((value) => ({ value, label: statusLabel(value) })),
  },
]

function getColumns(
  onView: (history: MutationRow) => void
): ColumnDef<MutationRow>[] {
  return [
    {
      accessorKey: 'employeeName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Karyawan' />
      ),
      cell: ({ row }) => (
        <div>
          <Link
            className='font-medium hover:underline'
            to='/karyawan/data-karyawan/$employeeUid'
            params={{ employeeUid: row.original.employeeUid }}
          >
            {row.original.employeeName}
          </Link>
          <p className='text-[11px] leading-3 text-muted-foreground'>
            {row.original.employeeNumber}
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
      accessorKey: 'position',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Jabatan' />
      ),
      cell: ({ row }) => row.original.position ?? '—',
    },
    {
      accessorKey: 'changeType',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Perubahan' />
      ),
      cell: ({ row }) => statusLabel(row.original.changeType),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'effectiveFrom',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Efektif' />
      ),
      cell: ({ row }) => formatDate(row.original.effectiveFrom),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <Button
          size='sm'
          variant='ghost'
          onClick={() => onView(row.original)}
          aria-label={`Lihat detail mutasi ${row.original.employeeName}`}
        >
          <Eye /> Detail
        </Button>
      ),
    },
  ]
}

export function MutationPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedHistory, setSelectedHistory] = useState<MutationRow>()
  const histories = useHistories()
  const employees = useEmployeeList({ page: 1, pageSize: 100 })
  const rows = useMemo<MutationRow[]>(() => {
    const employeeByUid = new Map(
      (employees.data?.items ?? []).map((employee) => [employee.uid, employee])
    )
    return (histories.data ?? []).map((history) => {
      const employee = employeeByUid.get(history.employeeUid)
      return {
        ...history,
        employeeName: employee?.fullName ?? 'Karyawan tidak ditemukan',
        employeeNumber: employee?.employeeNumber ?? '—',
      }
    })
  }, [employees.data?.items, histories.data])
  const tableState = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'changeType', searchKey: 'changeType', type: 'array' },
    ],
  })
  // TanStack Table mengembalikan fungsi stateful; pola ini sama dengan tabel starter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns: useMemo(() => getColumns(setSelectedHistory), []),
    state: {
      sorting,
      globalFilter: tableState.globalFilter,
      columnFilters: tableState.columnFilters,
      pagination: tableState.pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: tableState.onGlobalFilterChange,
    onColumnFiltersChange: tableState.onColumnFiltersChange,
    onPaginationChange: tableState.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <Main>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold'>Riwayat Mutasi</h1>
        <p className='text-muted-foreground'>
          Jejak penempatan dan perubahan status yang bersifat append-only.
        </p>
      </div>
      <div className='space-y-4'>
        <DataTableToolbar
          table={table}
          searchPlaceholder='Cari karyawan, nomor, atau jabatan...'
          searchDebounceMs={300}
          filters={filters}
        />
        {histories.isPending || employees.isPending ? (
          <p className='py-10 text-center text-sm text-muted-foreground'>
            Memuat riwayat mutasi...
          </p>
        ) : histories.isError || employees.isError ? (
          <div className='py-10 text-center'>
            <p className='text-sm'>Riwayat mutasi gagal dimuat.</p>
            <Button
              variant='outline'
              className='mt-3'
              onClick={() => {
                void histories.refetch()
                void employees.refetch()
              }}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </div>
        ) : table.getRowModel().rows.length === 0 ? (
          <div className='py-10 text-center text-sm text-muted-foreground'>
            <GitBranch className='mx-auto mb-2' />
            Tidak ada histori yang sesuai filter.
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
            <DataTablePagination table={table} />
          </>
        )}
      </div>
      <MutationDetailDrawer
        history={selectedHistory}
        employee={
          selectedHistory
            ? {
                uid: selectedHistory.employeeUid,
                fullName: selectedHistory.employeeName,
                employeeNumber: selectedHistory.employeeNumber,
              }
            : undefined
        }
        open={Boolean(selectedHistory)}
        onOpenChange={(open) => {
          if (!open) setSelectedHistory(undefined)
        }}
      />
    </Main>
  )
}
