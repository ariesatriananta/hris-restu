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
import { Pencil, RefreshCcw, Trash2 } from 'lucide-react'
import { currentListReturnTo } from '@/lib/list-return-to'
import { useTableUrlState, type NavigateFn } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DataTableActionButton,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import {
  useCancelScheduledStatusChange,
  useScheduledStatusChangeList,
  useUpdateScheduledStatusChange,
} from '../data/queries'
import type {
  EmployeeRecordListParams,
  ScheduledEmployeeStatusChange,
  ScheduledStatusChangeAction,
} from '../domain'
import { formatDate, statusLabel } from '../utils'

export function ScheduledStatusChangesTable({
  search,
  navigate,
  params,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
  params: EmployeeRecordListParams
}) {
  const returnTo = currentListReturnTo()
  const query = useScheduledStatusChangeList(params)
  const update = useUpdateScheduledStatusChange()
  const cancel = useCancelScheduledStatusChange()
  const [sorting, setSorting] = useState<SortingState>([])
  const [editing, setEditing] = useState<ScheduledEmployeeStatusChange>()
  const [cancelling, setCancelling] = useState<ScheduledEmployeeStatusChange>()
  const [action, setAction] = useState<ScheduledStatusChangeAction>('TERMINATE')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [reason, setReason] = useState('')
  const url = useTableUrlState({
    search,
    navigate,
    pagination: {
      pageKey: 'statusChangePage',
      pageSizeKey: 'statusChangePageSize',
    },
    globalFilter: { key: 'statusChangeFilter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'statusChangeSite', type: 'array' },
      { columnId: 'status', searchKey: 'statusChangeStatus', type: 'array' },
      { columnId: 'action', searchKey: 'statusChangeAction', type: 'array' },
    ],
  })
  const edit = (item: ScheduledEmployeeStatusChange) => {
    setEditing(item)
    setAction(item.action)
    setEffectiveDate(item.effectiveDate)
    setReason(item.reason)
  }
  const columns: ColumnDef<ScheduledEmployeeStatusChange>[] = [
    {
      accessorKey: 'employeeName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Karyawan' />
      ),
      cell: ({ row }) => (
        <Link
          className='font-medium text-primary hover:underline'
          to='/karyawan/data-karyawan/$employeeUid'
          params={{ employeeUid: row.original.employeeUid }}
          search={{ returnTo }}
        >
          {row.original.employeeName}
          <span className='block text-[11px] leading-3 text-muted-foreground'>
            {row.original.employeeNumber}
          </span>
        </Link>
      ),
    },
    {
      accessorKey: 'contractNumber',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Kontrak acuan' />
      ),
      cell: ({ row }) => row.original.contractNumber ?? '—',
    },
    {
      accessorKey: 'action',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Aksi' />
      ),
      cell: ({ row }) =>
        row.original.action === 'RESIGN' ? 'Resign' : 'Terminasi',
    },
    {
      accessorKey: 'effectiveDate',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Efektif' />
      ),
      cell: ({ row }) => formatDate(row.original.effectiveDate),
    },
    {
      accessorKey: 'site',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Site' />
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => (
        <div>
          <Badge variant='secondary'>{statusLabel(row.original.status)}</Badge>
          {row.original.failureReason && (
            <p className='mt-1 max-w-64 text-[11px] leading-3 text-destructive'>
              {row.original.failureReason}
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) =>
        ['SCHEDULED', 'FAILED'].includes(row.original.status) && (
          <div className='flex gap-1'>
            <DataTableActionButton
              label={
                row.original.status === 'FAILED'
                  ? 'Jadwalkan ulang'
                  : 'Ubah jadwal'
              }
              onClick={() => edit(row.original)}
            >
              <Pencil />
            </DataTableActionButton>
            <DataTableActionButton
              label='Batalkan jadwal'
              className='text-destructive hover:text-destructive'
              onClick={() => setCancelling(row.original)}
            >
              <Trash2 />
            </DataTableActionButton>
          </div>
        ),
    },
  ]
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: query.data?.items ?? [],
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
    pageCount: Math.max(
      1,
      Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 50))
    ),
  })
  const itemCount = query.data?.total ?? 0
  return (
    <div className='space-y-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari karyawan atau kontrak...'
        searchDebounceMs={300}
        filters={[
          {
            columnId: 'site',
            title: 'Site',
            options: ['JEPARA', 'SEMARANG', 'KLATEN'].map((value) => ({
              value,
              label: value,
            })),
          },
          {
            columnId: 'status',
            title: 'Status',
            options: ['SCHEDULED', 'APPLIED', 'FAILED', 'CANCELLED'].map(
              (value) => ({ value, label: statusLabel(value) })
            ),
          },
          {
            columnId: 'action',
            title: 'Aksi',
            options: [
              { value: 'TERMINATE', label: 'Terminasi' },
              { value: 'RESIGN', label: 'Resign' },
            ],
          },
        ]}
      />
      {query.isPending ? (
        <p className='py-10 text-center text-muted-foreground'>
          Memuat data...
        </p>
      ) : query.isError ? (
        <div className='py-10 text-center'>
          <p>Data gagal dimuat.</p>
          <Button
            variant='outline'
            className='mt-3'
            onClick={() => query.refetch()}
          >
            <RefreshCcw /> Coba lagi
          </Button>
        </div>
      ) : table.getRowModel().rows.length === 0 ? (
        <p className='py-10 text-center text-muted-foreground'>
          Belum ada status kerja terjadwal.
        </p>
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
                {itemCount
                  ? (query.data!.page - 1) * query.data!.pageSize + 1
                  : 0}
                –
                {Math.min(
                  (query.data?.page ?? 1) * (query.data?.pageSize ?? 50),
                  itemCount
                )}{' '}
                dari {itemCount} data.
              </>
            }
          />
        </>
      )}
      <ConfirmDialog
        open={Boolean(editing)}
        onOpenChange={(open) =>
          !open && !update.isPending && setEditing(undefined)
        }
        title='Ubah status kerja terjadwal'
        desc='Jadwal akan diterapkan cron pada tanggal efektif.'
        confirmText={
          editing?.status === 'FAILED' ? 'Jadwalkan ulang' : 'Simpan perubahan'
        }
        disabled={!reason.trim() || !effectiveDate}
        isLoading={update.isPending}
        handleConfirm={() =>
          editing &&
          update.mutate(
            {
              uid: editing.uid,
              input: { action, effectiveDate, reason: reason.trim() },
            },
            { onSuccess: () => setEditing(undefined) }
          )
        }
      >
        <div className='grid gap-4'>
          <label className='grid gap-2 text-sm font-medium'>
            Aksi
            <Select
              value={action}
              onValueChange={(value) =>
                setAction(value as ScheduledStatusChangeAction)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='TERMINATE'>Terminasi</SelectItem>
                <SelectItem value='RESIGN'>Resign</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className='grid gap-2 text-sm font-medium'>
            Tanggal efektif
            <DatePicker
              selected={
                effectiveDate
                  ? new Date(`${effectiveDate}T00:00:00`)
                  : undefined
              }
              onSelect={(date) => date && setEffectiveDate(toInput(date))}
              fromYear={new Date().getFullYear()}
              toYear={new Date().getFullYear() + 10}
              disabledDates={(date) => toInput(date) <= today()}
            />
          </label>
          <label className='grid gap-2 text-sm font-medium'>
            Alasan
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(open) =>
          !open && !cancel.isPending && setCancelling(undefined)
        }
        title='Batalkan jadwal status kerja?'
        desc={
          cancelling
            ? `Jadwal ${cancelling.employeeName} tidak akan diterapkan.`
            : ''
        }
        confirmText='Batalkan jadwal'
        destructive
        isLoading={cancel.isPending}
        handleConfirm={() =>
          cancelling &&
          cancel.mutate(cancelling.uid, {
            onSuccess: () => setCancelling(undefined),
          })
        }
      />
    </div>
  )
}
function toInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function today() {
  return toInput(new Date())
}
