import { useEffect, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
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
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'

type Props<TData> = {
  data: TData[]
  columns: ColumnDef<TData>[]
  search: Record<string, unknown>
  navigate: NavigateFn
  total: number
  totalPages: number
  isPending: boolean
  isError: boolean
  onRetry: () => void
  sortBy: string
  sortDirection: 'asc' | 'desc'
  searchPlaceholder: string
  emptyMessage: string
  additionalFilters?: ReactNode
  hasAdditionalFilters?: boolean
  onResetAdditionalFilters?: () => void
  mobileCard: (item: TData) => ReactNode
  getRowId: (item: TData) => string
}

function summary(pageIndex: number, pageSize: number, total: number) {
  if (!total) return 'Tidak ada data.'
  const first = pageIndex * pageSize + 1
  return `Menampilkan ${first}–${Math.min(first + pageSize - 1, total)} dari ${total} data.`
}

export function ConfigurationDataTable<TData>({
  data,
  columns,
  search,
  navigate,
  total,
  totalPages,
  isPending,
  isError,
  onRetry,
  sortBy,
  sortDirection,
  searchPlaceholder,
  emptyMessage,
  additionalFilters,
  hasAdditionalFilters,
  onResetAdditionalFilters,
  mobileCard,
  getRowId,
}: Props<TData>) {
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'query' },
  })
  const sorting: SortingState = [{ id: sortBy, desc: sortDirection === 'desc' }]
  // TanStack Table mengembalikan fungsi stateful; ini pola resmi starter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter: url.globalFilter,
      pagination: url.pagination,
      sorting,
    },
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    pageCount: totalPages,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onPaginationChange: url.onPaginationChange,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      const first = next[0]
      navigate({
        search: (previous) => ({
          ...previous,
          sortBy: first?.id,
          sortDirection: first ? (first.desc ? 'desc' : 'asc') : undefined,
          page: undefined,
        }),
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId,
  })

  useEffect(() => {
    url.ensurePageInRange(totalPages)
  }, [totalPages, url])

  return (
    <div className='space-y-3'>
      <DataTableToolbar
        table={table}
        searchPlaceholder={searchPlaceholder}
        searchDebounceMs={300}
        additionalFilters={additionalFilters}
        hasAdditionalFilters={hasAdditionalFilters}
        onResetAdditionalFilters={onResetAdditionalFilters}
      />

      {isPending ? (
        <div className='h-48 animate-pulse rounded-md border bg-muted/30' />
      ) : isError ? (
        <div className='rounded-md border border-dashed p-8 text-center'>
          <p className='text-sm text-muted-foreground'>Data gagal dimuat.</p>
          <Button variant='outline' className='mt-3' onClick={onRetry}>
            Coba lagi
          </Button>
        </div>
      ) : data.length === 0 ? (
        <div className='rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground'>
          {emptyMessage}
        </div>
      ) : (
        <>
          <div className='hidden overflow-x-auto rounded-md border md:block'>
            <Table className='text-sm'>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead key={header.id} className='h-10'>
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
                      <TableCell key={cell.id} className='py-2.5'>
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
          <div className='grid gap-2 md:hidden'>{data.map(mobileCard)}</div>
        </>
      )}

      {!isPending && !isError && total > 0 && (
        <DataTablePagination
          table={table}
          pageSizeOptions={[50, 100, 200, 300, 500]}
          summary={summary(
            url.pagination.pageIndex,
            url.pagination.pageSize,
            total
          )}
        />
      )}
    </div>
  )
}
