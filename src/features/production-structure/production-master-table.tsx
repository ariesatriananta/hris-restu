import { useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { RefreshCcw, TableProperties } from 'lucide-react'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'

export type ProductionMasterResult<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
}

const activeFilter = {
  columnId: 'isActive',
  title: 'Status',
  options: [
    { value: 'true', label: 'Aktif' },
    { value: 'false', label: 'Nonaktif' },
  ],
}
const siteFilter = {
  columnId: 'site',
  title: 'Site',
  options: ['JEPARA', 'SEMARANG', 'KLATEN'].map((value) => ({
    value,
    label: value[0] + value.slice(1).toLowerCase(),
  })),
}

export function ProductionMasterTable<T extends { uid: string }>({
  data,
  columns,
  search,
  navigate,
  isPending,
  isFetching,
  isError,
  onRetry,
  searchPlaceholder,
  hasSite = false,
}: {
  data?: ProductionMasterResult<T>
  columns: ColumnDef<T>[]
  search: Record<string, unknown>
  navigate: NavigateFn
  isPending: boolean
  isFetching?: boolean
  isError: boolean
  onRetry: () => void
  searchPlaceholder: string
  hasSite?: boolean
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const state = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      ...(hasSite
        ? [{ columnId: 'site', searchKey: 'site', type: 'array' as const }]
        : []),
      { columnId: 'isActive', searchKey: 'isActive', type: 'array' as const },
    ],
  })
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    state: {
      sorting,
      globalFilter: state.globalFilter,
      columnFilters: state.columnFilters,
      pagination: state.pagination,
    },
    pageCount: Math.max(
      1,
      Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 50))
    ),
    manualPagination: true,
    manualFiltering: true,
    onSortingChange: setSorting,
    onGlobalFilterChange: state.onGlobalFilterChange,
    onColumnFiltersChange: state.onColumnFiltersChange,
    onPaginationChange: state.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className='space-y-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder={searchPlaceholder}
        searchDebounceMs={500}
        filters={[...(hasSite ? [siteFilter] : []), activeFilter]}
      />
      {isFetching && !isPending && (
        <p className='text-xs text-muted-foreground'>Memperbarui data...</p>
      )}
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
      ) : !data?.items.length ? (
        <div className='py-10 text-center text-muted-foreground'>
          <TableProperties className='mx-auto mb-2' />
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
          <DataTablePagination
            table={table}
            summary={
              <>
                Menampilkan {(data.page - 1) * data.pageSize + 1}–
                {Math.min(data.page * data.pageSize, data.total)} dari{' '}
                {data.total} data.
              </>
            }
          />
        </>
      )}
    </div>
  )
}
