import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import {
  CalendarClock,
  Eye,
  GitBranch,
  GitBranchPlus,
  Pencil,
  RefreshCcw,
  X,
} from 'lucide-react'
import { currentListReturnTo } from '@/lib/list-return-to'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DataTableColumnHeader,
  DataTableActionButton,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { Main } from '@/components/layout/main'
import {
  useCancelScheduledMutation,
  useEmployee,
  useHistories,
  useScheduledMutationList,
} from '../data/queries'
import type {
  EmploymentHistory,
  ScheduledEmployeeMutation,
  SiteCode,
} from '../domain'
import { formatDate, statusLabel } from '../utils'
import { BatchMutationDialog } from './batch-mutation-dialog'
import { MutationDetailDrawer } from './mutation-detail-drawer'
import { MutationDialog } from './mutation-dialog'

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
      'DEPARTMENT_CHANGE',
      'PRODUCTION_ASSIGNMENT_CHANGE',
      'OTHER',
    ].map((value) => ({ value, label: statusLabel(value) })),
  },
]

function getColumns(
  onView: (history: MutationRow) => void,
  returnTo?: string
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
            search={{ returnTo }}
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
  const returnTo = currentListReturnTo()
  const [sorting, setSorting] = useState<SortingState>([])
  const [selectedHistory, setSelectedHistory] = useState<MutationRow>()
  const [batchMutationOpen, setBatchMutationOpen] = useState(false)
  const histories = useHistories()
  const rows = useMemo<MutationRow[]>(() => {
    return (histories.data ?? []).map((history) => {
      return {
        ...history,
        employeeName: history.employeeName ?? 'Karyawan tidak ditemukan',
        employeeNumber: history.employeeNumber ?? '—',
      }
    })
  }, [histories.data])
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
    columns: useMemo(
      () => getColumns(setSelectedHistory, returnTo),
      [returnTo]
    ),
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
    getPaginationRowModel: getPaginationRowModel(),
  })

  return (
    <Main>
      <div className='mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end'>
        <div>
          <h1 className='text-2xl font-bold'>Riwayat Mutasi</h1>
          <p className='text-muted-foreground'>
            Jejak penempatan dan perubahan status yang bersifat append-only.
          </p>
        </div>
        <Button onClick={() => setBatchMutationOpen(true)}>
          <GitBranchPlus /> Catat mutasi
        </Button>
      </div>
      <Tabs
        value={(search.tab as string) ?? 'history'}
        onValueChange={(tab) =>
          navigate({
            search: (prev) => ({
              ...prev,
              tab: tab === 'history' ? undefined : tab,
            }),
          })
        }
      >
        <TabsList className='mb-5 h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1 sm:w-fit'>
          <TabsTrigger value='history' className='h-10 flex-none gap-2 px-4'>
            <GitBranch /> Riwayat diterapkan
          </TabsTrigger>
          <TabsTrigger value='scheduled' className='h-10 flex-none gap-2 px-4'>
            <CalendarClock /> Mutasi terjadwal
          </TabsTrigger>
        </TabsList>
        <TabsContent value='history' className='space-y-4'>
          <DataTableToolbar
            table={table}
            searchPlaceholder='Cari karyawan, nomor, atau jabatan...'
            searchDebounceMs={300}
            filters={filters}
          />
          {histories.isPending ? (
            <p className='py-10 text-center text-sm text-muted-foreground'>
              Memuat riwayat mutasi...
            </p>
          ) : histories.isError ? (
            <div className='py-10 text-center'>
              <p className='text-sm'>Riwayat mutasi gagal dimuat.</p>
              <Button
                variant='outline'
                className='mt-3'
                onClick={() => {
                  void histories.refetch()
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
              <DataTablePagination
                table={table}
                summary={
                  <>
                    Menampilkan{' '}
                    {table.getFilteredRowModel().rows.length
                      ? table.getState().pagination.pageIndex *
                          table.getState().pagination.pageSize +
                        1
                      : 0}
                    –
                    {Math.min(
                      (table.getState().pagination.pageIndex + 1) *
                        table.getState().pagination.pageSize,
                      table.getFilteredRowModel().rows.length
                    )}{' '}
                    dari {table.getFilteredRowModel().rows.length} data.
                  </>
                }
              />
            </>
          )}
        </TabsContent>
        <TabsContent value='scheduled'>
          <ScheduledMutationsTable search={search} navigate={navigate} />
        </TabsContent>
      </Tabs>
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
      <BatchMutationDialog
        open={batchMutationOpen}
        onOpenChange={setBatchMutationOpen}
      />
    </Main>
  )
}

const scheduledFilters = [
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
    options: ['SCHEDULED', 'FAILED', 'APPLIED', 'CANCELLED'].map((value) => ({
      value,
      label: statusLabel(value),
    })),
  },
]

function ScheduledMutationsTable({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const returnTo = currentListReturnTo()
  const [selected, setSelected] = useState<ScheduledEmployeeMutation>()
  const [cancelTarget, setCancelTarget] = useState<ScheduledEmployeeMutation>()
  const urlState = useTableUrlState({
    search,
    navigate,
    pagination: { pageKey: 'scheduledPage', pageSizeKey: 'scheduledPageSize' },
    globalFilter: { key: 'scheduledFilter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'scheduledSite', type: 'array' },
      { columnId: 'status', searchKey: 'scheduledStatus', type: 'array' },
    ],
  })
  const query = useScheduledMutationList({
    query: urlState.globalFilter,
    site: urlState.columnFilters.find((item) => item.id === 'site')?.value as
      | SiteCode[]
      | undefined,
    status: urlState.columnFilters.find((item) => item.id === 'status')
      ?.value as string[] | undefined,
    page: urlState.pagination.pageIndex + 1,
    pageSize: urlState.pagination.pageSize,
  })
  const cancel = useCancelScheduledMutation()
  const columns = useMemo<ColumnDef<ScheduledEmployeeMutation>[]>(
    () => [
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
              search={{ returnTo }}
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
          <DataTableColumnHeader column={column} title='Target site' />
        ),
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
      },
      {
        accessorKey: 'position',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Target penempatan' />
        ),
        cell: ({ row }) => (
          <div>
            <p>{row.original.position ?? '—'}</p>
            <p className='text-[11px] leading-3 text-muted-foreground'>
              {row.original.department ?? '—'}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'effectiveFrom',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Efektif' />
        ),
        cell: ({ row }) => formatDate(row.original.effectiveFrom),
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Status' />
        ),
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
        cell: ({ row }) => (
          <div>
            <span className='font-medium'>
              {statusLabel(row.original.status)}
            </span>
            {row.original.failureReason && (
              <p className='mt-1 max-w-xs text-[11px] leading-3 text-destructive'>
                {row.original.failureReason}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <div className='flex justify-end gap-1'>
            {['SCHEDULED', 'FAILED'].includes(row.original.status) && (
              <>
                <DataTableActionButton
                  label={
                    row.original.status === 'FAILED'
                      ? 'Jadwalkan ulang'
                      : 'Ubah jadwal'
                  }
                  onClick={() => setSelected(row.original)}
                >
                  <Pencil />
                </DataTableActionButton>
                <DataTableActionButton
                  label='Batalkan jadwal'
                  onClick={() => setCancelTarget(row.original)}
                >
                  <X />
                </DataTableActionButton>
              </>
            )}
          </div>
        ),
      },
    ],
    [returnTo]
  )
  // TanStack Table mengembalikan fungsi stateful; pola ini sama dengan tabel starter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: query.data?.items ?? [],
    columns,
    state: {
      globalFilter: urlState.globalFilter,
      columnFilters: urlState.columnFilters,
      pagination: urlState.pagination,
    },
    onGlobalFilterChange: urlState.onGlobalFilterChange,
    onColumnFiltersChange: urlState.onColumnFiltersChange,
    onPaginationChange: urlState.onPaginationChange,
    manualPagination: true,
    pageCount: query.data
      ? Math.ceil(query.data.total / query.data.pageSize)
      : -1,
    getCoreRowModel: getCoreRowModel(),
  })
  const selectedEmployee = useEmployee(selected?.employeeUid ?? '')
  return (
    <div className='space-y-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari karyawan, nomor, atau jabatan...'
        searchDebounceMs={300}
        filters={scheduledFilters}
      />
      {query.isPending ? (
        <p className='py-10 text-center text-sm text-muted-foreground'>
          Memuat mutasi terjadwal...
        </p>
      ) : query.isError ? (
        <div className='py-10 text-center'>
          <p className='text-sm'>Mutasi terjadwal gagal dimuat.</p>
          <Button
            variant='outline'
            className='mt-3'
            onClick={() => void query.refetch()}
          >
            <RefreshCcw /> Coba lagi
          </Button>
        </div>
      ) : !table.getRowModel().rows.length ? (
        <div className='py-10 text-center text-sm text-muted-foreground'>
          <CalendarClock className='mx-auto mb-2' />
          Tidak ada mutasi terjadwal.
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
                Menampilkan{' '}
                {(query.data?.total ?? 0)
                  ? ((query.data?.page ?? 1) - 1) *
                      (query.data?.pageSize ?? 50) +
                    1
                  : 0}
                –
                {Math.min(
                  (query.data?.page ?? 1) * (query.data?.pageSize ?? 50),
                  query.data?.total ?? 0
                )}{' '}
                dari {query.data?.total ?? 0} jadwal.
              </>
            }
          />
        </>
      )}
      {selected && selectedEmployee.data && (
        <MutationDialog
          employee={selectedEmployee.data}
          schedule={selected}
          open
          onOpenChange={(open) => {
            if (!open) setSelected(undefined)
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open && !cancel.isPending) setCancelTarget(undefined)
        }}
        title='Batalkan mutasi terjadwal?'
        desc={`Jadwal mutasi ${cancelTarget?.employeeName ?? ''} pada ${cancelTarget ? formatDate(cancelTarget.effectiveFrom) : ''} akan dibatalkan. Data penempatan karyawan tidak berubah.`}
        cancelBtnText='Kembali'
        confirmText='Batalkan jadwal'
        destructive
        isLoading={cancel.isPending}
        handleConfirm={() =>
          cancelTarget &&
          cancel.mutate(cancelTarget.uid, {
            onSuccess: () => {
              setCancelTarget(undefined)
            },
            onError: () => {},
          })
        }
      />
    </div>
  )
}
