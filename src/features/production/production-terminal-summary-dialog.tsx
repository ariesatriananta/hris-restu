import { useEffect, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from '@tanstack/react-table'
import { LoaderCircle, RefreshCcw, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useProductionTerminalSummaryEmployees } from './data/queries'
import type {
  ProductionTerminalSummaryCondition,
  ProductionTerminalSummaryEmployee,
} from './domain'

const time = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Jakarta',
      }).format(new Date(value))
    : '—'

function Attendance({ item }: { item: ProductionTerminalSummaryEmployee }) {
  return (
    <div className='text-xs leading-relaxed'>
      <p>
        <span className='text-muted-foreground'>Masuk </span>
        {time(item.attendance.clockInAt)}
      </p>
      <p>
        <span className='text-muted-foreground'>Pulang </span>
        {time(item.attendance.clockOutAt)}
      </p>
    </div>
  )
}

function Deposits({ item }: { item: ProductionTerminalSummaryEmployee }) {
  if (!item.deposits) return null
  return (
    <div className='text-xs leading-relaxed'>
      <p className='font-medium'>
        {Number(item.deposits.quantityPcs).toLocaleString('id-ID')} PCS
      </p>
      <p className='text-muted-foreground'>
        {item.deposits.count} setoran · {time(item.deposits.lastTransactionAt)}
      </p>
    </div>
  )
}

const columns: ColumnDef<ProductionTerminalSummaryEmployee>[] = [
  {
    id: 'employee',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Karyawan' />
    ),
    cell: ({ row }) => (
      <div className='min-w-0 whitespace-normal'>
        <p className='text-xs font-medium'>{row.original.fullName}</p>
        <p className='text-[11px] text-muted-foreground'>
          {row.original.employeeNumber}
        </p>
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: 'placement',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Bagian / Modul' />
    ),
    cell: ({ row }) => (
      <div className='text-xs whitespace-normal'>
        <p>{row.original.section.name}</p>
        <p className='text-[11px] text-muted-foreground'>
          {row.original.module.name}
        </p>
      </div>
    ),
    enableSorting: false,
  },
  {
    id: 'attendance',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Absen' />
    ),
    cell: ({ row }) => <Attendance item={row.original} />,
    enableSorting: false,
  },
  {
    id: 'deposits',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title='Setoran hari ini' />
    ),
    cell: ({ row }) => <Deposits item={row.original} />,
    enableSorting: false,
  },
]

export function ProductionTerminalSummaryDialog({
  deviceUid,
  deviceToken,
  selection,
  onClose,
  onDialogClosed,
}: {
  deviceUid: string
  deviceToken: string
  selection: {
    sectionUid: string
    condition: ProductionTerminalSummaryCondition
    title: string
  }
  onClose: () => void
  onDialogClosed?: () => void
}) {
  const [search, setSearch] = useState('')
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  })
  const submitted = selection.condition === 'SUBMITTED'
  const query = useProductionTerminalSummaryEmployees(deviceUid, deviceToken, {
    sectionUid: selection.sectionUid,
    condition: selection.condition,
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
    search,
  })
  const items = query.data?.items ?? []
  const total = query.data?.pagination.total ?? 0
  useEffect(() => {
    if (!query.data || query.isFetching) return
    const resolvedPage = query.data.pagination.page - 1
    setPagination((previous) =>
      previous.pageIndex === resolvedPage
        ? previous
        : { ...previous, pageIndex: resolvedPage }
    )
  }, [query.data, query.isFetching])
  const table = useReactTable({
    data: items,
    columns: submitted
      ? columns
      : columns.filter((column) => column.id !== 'deposits'),
    state: { pagination, globalFilter: search },
    manualPagination: true,
    manualFiltering: true,
    pageCount: Math.max(1, query.data?.pagination.totalPages ?? 1),
    onPaginationChange: (updater) =>
      setPagination((previous) => {
        const next = typeof updater === 'function' ? updater(previous) : updater
        return next.pageSize !== previous.pageSize
          ? { ...next, pageIndex: 0 }
          : next
      }),
    onGlobalFilterChange: (updater) => {
      setSearch((previous) =>
        typeof updater === 'function' ? updater(previous) : updater
      )
      setPagination((previous) => ({ ...previous, pageIndex: 0 }))
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (item) => item.uid,
  })

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className='flex max-h-[92dvh] flex-col gap-3 overflow-hidden p-3 sm:max-w-4xl sm:p-5'
        onCloseAutoFocus={(event) => {
          if (!onDialogClosed) return
          event.preventDefault()
          onDialogClosed()
        }}
      >
        <DialogHeader className='shrink-0 rounded-lg bg-gradient-to-r from-primary/10 to-primary/[0.025] p-3 pr-8 text-start'>
          <DialogTitle className='flex items-center gap-2 text-sm'>
            <Users className='size-4 shrink-0 text-primary' />
            {selection.title}
          </DialogTitle>
          <DialogDescription className='text-xs'>
            {query.data
              ? `${query.data.siteName} · ${new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(`${query.data.businessDate}T00:00:00+07:00`))}`
              : 'Daftar karyawan hadir hari ini pada site perangkat.'}
          </DialogDescription>
        </DialogHeader>
        <div className='min-h-0 space-y-3 overflow-y-auto'>
          <DataTableToolbar
            table={table}
            searchPlaceholder='Cari nama / nomor karyawan...'
            searchDebounceMs={300}
            showViewOptions={false}
            searchInputClassName='w-full sm:w-72'
          />
          {query.isPending ? (
            <p
              role='status'
              className='flex justify-center gap-2 py-8 text-xs text-muted-foreground'
            >
              <LoaderCircle className='size-4 animate-spin' />
              Memuat daftar karyawan...
            </p>
          ) : query.isError ? (
            <div
              role='alert'
              className='space-y-2 rounded-lg border p-3 text-xs'
            >
              <p>Daftar karyawan belum dapat dimuat.</p>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => void query.refetch()}
              >
                <RefreshCcw className='size-3.5' />
                Muat ulang daftar
              </Button>
            </div>
          ) : (
            <>
              <div className='hidden rounded-lg border sm:block'>
                <Table className='table-fixed'>
                  <TableHeader>
                    {table.getHeaderGroups().map((group) => (
                      <TableRow key={group.id}>
                        {group.headers.map((header) => (
                          <TableHead key={header.id} scope='col'>
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.length ? (
                      table.getRowModel().rows.map((row) => (
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
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={table.getVisibleLeafColumns().length}
                          className='h-24 text-center text-xs text-muted-foreground'
                        >
                          Tidak ada karyawan sesuai pencarian.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <ul
                aria-label='Daftar karyawan ringkasan'
                className='space-y-2 sm:hidden'
              >
                {items.length ? (
                  items.map((item) => (
                    <li
                      key={item.uid}
                      className='space-y-2 rounded-lg border p-2.5'
                    >
                      <div className='min-w-0'>
                        <p className='text-xs font-semibold break-words'>
                          {item.fullName}
                        </p>
                        <p className='text-[11px] text-muted-foreground'>
                          {item.employeeNumber} · {item.section.name} /{' '}
                          {item.module.name}
                        </p>
                      </div>
                      <div className='grid grid-cols-2 gap-2'>
                        <Attendance item={item} />
                        {submitted && <Deposits item={item} />}
                      </div>
                    </li>
                  ))
                ) : (
                  <li className='rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground'>
                    Tidak ada karyawan sesuai pencarian.
                  </li>
                )}
              </ul>
            </>
          )}
        </div>
        {!query.isPending && !query.isError && (
          <DataTablePagination
            table={table}
            className='shrink-0 px-0'
            summary={
              <span className='text-xs'>
                {total.toLocaleString('id-ID')} karyawan
              </span>
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
