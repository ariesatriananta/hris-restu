import { useMemo } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { AlertTriangle, LogIn, LogOut, RefreshCcw, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTableUrlState, type NavigateFn } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'
import type {
  AttendanceRecapMatrixCell,
  AttendanceRecapMatrixItem,
  AttendanceRecapMatrixResult,
} from './domain'
import { employeeTypeLabel } from './recap-columns'
import { abnormalReasonLabel, timeLabel } from './recap-matrix-presentation'

const employeeTypeOptions = ['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING'].map(
  (value) => ({ value, label: employeeTypeLabel(value) })
)

const statusOptions = [
  { value: 'PRESENT', label: 'Hadir' },
  { value: 'ABSENT', label: 'Alpha' },
  { value: 'LEAVE', label: 'Cuti' },
  { value: 'SICK', label: 'Sakit' },
  { value: 'PERMISSION', label: 'Izin' },
  { value: 'HOLIDAY', label: 'Libur kalender' },
  { value: 'WEEKLY_OFF', label: 'Libur mingguan' },
]

export function AttendanceRecapMatrixTable({
  data,
  search,
  navigate,
  siteOptions,
  productionSectionOptions,
  isPending,
  isFetching,
  isError,
  onRetry,
  onDetail,
}: {
  data?: AttendanceRecapMatrixResult
  search: Record<string, unknown>
  navigate: NavigateFn
  siteOptions: { value: string; label: string }[]
  productionSectionOptions: { value: string; label: string }[]
  isPending: boolean
  isFetching: boolean
  isError: boolean
  onRetry: () => void
  onDetail: (item: AttendanceRecapMatrixItem) => void
}) {
  const columns = useMemo<ColumnDef<AttendanceRecapMatrixItem>[]>(
    () => matrixColumns(data?.dates ?? [], onDetail),
    [data?.dates, onDetail]
  )
  const url = useTableUrlState({
    search,
    navigate,
    pagination: {
      pageKey: 'matrixPage',
      pageSizeKey: 'matrixPageSize',
      defaultPageSize: 50,
    },
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'employeeType', searchKey: 'employeeType', type: 'array' },
      {
        columnId: 'productionSection',
        searchKey: 'productionSection',
        type: 'array',
      },
      {
        columnId: 'attendanceStatus',
        searchKey: 'attendanceStatus',
        type: 'array',
      },
    ],
  })
  // TanStack Table exposes stateful callbacks; this is the established repo pattern.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    state: {
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
    },
    initialState: {
      columnVisibility: { productionSection: false, attendanceStatus: false },
    },
    pageCount: Math.max(
      1,
      Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 50))
    ),
    manualFiltering: true,
    manualPagination: true,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => `${row.employeeUid}:${row.site}:${row.employeeType}`,
  })

  return (
    <div className='space-y-4'>
      <div className='overflow-x-auto pb-1'>
        <div className='min-w-max sm:min-w-0'>
          <DataTableToolbar
            table={table}
            searchPlaceholder='Cari nama atau nomor karyawan...'
            searchDebounceMs={500}
            showViewOptions={false}
            filters={[
              { columnId: 'site', title: 'Site', options: siteOptions },
              {
                columnId: 'employeeType',
                title: 'Jenis karyawan',
                options: employeeTypeOptions,
              },
              {
                columnId: 'productionSection',
                title: 'Bagian produksi',
                options: productionSectionOptions,
              },
              {
                columnId: 'attendanceStatus',
                title: 'Status harian',
                options: statusOptions,
              },
            ]}
          />
        </div>
      </div>

      <MatrixLegend />

      {isFetching && !isPending ? (
        <p role='status' className='text-xs text-muted-foreground'>
          Memperbarui rincian per tanggal...
        </p>
      ) : null}

      {isPending ? (
        <MatrixState>Memuat rincian attendance...</MatrixState>
      ) : isError ? (
        <MatrixState>
          Data rincian per tanggal gagal dimuat.
          <Button size='sm' variant='outline' onClick={onRetry}>
            <RefreshCcw /> Coba lagi
          </Button>
        </MatrixState>
      ) : !data?.items.length ? (
        <MatrixState>
          <Users className='size-4' /> Tidak ada data yang sesuai filter.
        </MatrixState>
      ) : (
        <>
          <p className='text-[10px] text-muted-foreground sm:hidden'>
            Geser tabel ke samping untuk melihat tanggal lainnya.
          </p>
          <div
            className='overflow-x-auto rounded-md border bg-card'
            role='region'
            aria-label='Rincian attendance per karyawan dan tanggal'
            tabIndex={0}
          >
            <table className='w-max min-w-full border-separate border-spacing-0 text-[10px] leading-tight'>
              <thead className='sticky top-0 z-30 bg-muted/95 shadow-sm backdrop-blur'>
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header, index) => (
                      <th
                        key={header.id}
                        scope='col'
                        className={cn(
                          'h-12 border-r border-b px-1.5 text-center font-semibold whitespace-nowrap last:border-r-0',
                          index === 0 &&
                            'sticky left-0 z-40 min-w-48 bg-muted text-left shadow-[2px_0_0_0_hsl(var(--border))]',
                          header.column.columnDef.meta?.thClassName
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className='group'>
                    {row.getVisibleCells().map((cell, index) => (
                      <td
                        key={cell.id}
                        className={cn(
                          'h-12 border-r border-b bg-card px-1 text-center align-middle group-last:border-b-0 group-hover:bg-muted/35 last:border-r-0',
                          index === 0 &&
                            'sticky left-0 z-20 min-w-48 bg-card px-2 text-left shadow-[2px_0_0_0_hsl(var(--border))] group-hover:bg-muted',
                          cell.column.columnDef.meta?.tdClassName
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DataTablePagination
            table={table}
            summary={paginationSummary(data.page, data.pageSize, data.total)}
          />
        </>
      )}
    </div>
  )
}

function matrixColumns(
  dates: AttendanceRecapMatrixResult['dates'],
  onDetail: (item: AttendanceRecapMatrixItem) => void
): ColumnDef<AttendanceRecapMatrixItem>[] {
  return [
    {
      id: 'employee',
      enableHiding: false,
      header: 'Karyawan',
      cell: ({ row }) => (
        <button
          type='button'
          className='max-w-44 text-left focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
          onClick={() => onDetail(row.original)}
          aria-label={`Lihat rincian ${row.original.employeeName}`}
        >
          <span className='block truncate text-[11px] font-semibold text-foreground hover:underline'>
            {row.original.employeeName}
          </span>
          <span className='block truncate text-[10px] text-muted-foreground'>
            {row.original.employeeNumber}
          </span>
          <span className='block truncate text-[9px] text-muted-foreground'>
            {row.original.positions.join(', ') || 'Tanpa jabatan'}
          </span>
        </button>
      ),
    },
    {
      accessorKey: 'site',
      enableHiding: false,
      header: 'Site',
      cell: ({ row }) => (
        <span className='font-medium whitespace-nowrap'>
          {row.original.siteName}
        </span>
      ),
    },
    {
      accessorKey: 'employeeType',
      enableHiding: false,
      header: 'Jenis',
      cell: ({ row }) => (
        <span className='whitespace-nowrap'>
          {employeeTypeLabel(row.original.employeeType)}
        </span>
      ),
    },
    filterColumn('productionSection', (item) => item.productionSections),
    filterColumn('attendanceStatus', () => []),
    ...dates.map<ColumnDef<AttendanceRecapMatrixItem>>((date) => ({
      id: date.date,
      enableHiding: false,
      header: () => (
        <span className='grid leading-tight'>
          <span className='text-[10px] font-medium text-muted-foreground'>
            {shortDay(date.dayName)}
          </span>
          <span className='tabular-nums'>{dayNumber(date.date)}</span>
        </span>
      ),
      meta: {
        thClassName: isWeekend(date.date) ? 'bg-muted' : undefined,
        tdClassName: isWeekend(date.date) ? 'bg-muted/20' : undefined,
      },
      cell: ({ row }) => <MatrixCell value={row.original.days[date.date]} />,
    })),
  ]
}

function filterColumn(
  id: string,
  accessorFn: (item: AttendanceRecapMatrixItem) => unknown
): ColumnDef<AttendanceRecapMatrixItem> {
  return {
    id,
    accessorFn,
    enableHiding: false,
    header: () => null,
    cell: () => null,
    meta: { thClassName: 'hidden' },
  }
}

function MatrixCell({ value }: { value?: AttendanceRecapMatrixCell | null }) {
  if (!value) {
    return (
      <span
        className='text-muted-foreground/60'
        title='Data attendance belum tersedia'
        aria-label='Data attendance belum tersedia'
      >
        —
      </span>
    )
  }

  const abnormal =
    value.qualityStatus === 'ABNORMAL' || value.abnormalReasons.length > 0
  const timingIssue = value.lateMinutes > 0 || value.earlyLeaveMinutes > 0

  if (value.status === 'PRESENT') {
    return (
      <div
        className={cn(
          'relative mx-auto grid min-w-15 gap-px rounded px-1 py-0.5 text-left tabular-nums',
          value.calendarDayType !== 'WORKDAY' && 'ring-1 ring-border',
          timingIssue && 'bg-amber-500/10 text-amber-800 dark:text-amber-300'
        )}
      >
        <span className='flex items-center gap-1 whitespace-nowrap'>
          <LogIn className='size-2.5 text-emerald-600' aria-hidden='true' />
          {timeLabel(value.clockInAt)}
        </span>
        <span className='flex items-center gap-1 whitespace-nowrap'>
          <LogOut className='size-2.5 text-blue-600' aria-hidden='true' />
          {timeLabel(value.clockOutAt)}
        </span>
        {abnormal ? (
          <AbnormalIndicator reasons={value.abnormalReasons} />
        ) : null}
      </div>
    )
  }

  const display = statusDisplay(value.status)
  return (
    <div className='relative mx-auto flex min-h-8 min-w-9 items-center justify-center'>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className={cn(
              'inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 font-bold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              display.className
            )}
            aria-label={display.label}
          >
            {display.code}
          </span>
        </TooltipTrigger>
        <TooltipContent>{display.label}</TooltipContent>
      </Tooltip>
      {abnormal ? <AbnormalIndicator reasons={value.abnormalReasons} /> : null}
    </div>
  )
}

function AbnormalIndicator({ reasons }: { reasons: string[] }) {
  const description = reasons.length
    ? reasons.map(abnormalReasonLabel).join(' · ')
    : 'Data attendance perlu diperiksa.'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          className='absolute -top-1 -right-1 rounded-full bg-card text-amber-600 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:text-amber-300'
          aria-label={`Abnormal: ${description}`}
        >
          <AlertTriangle className='size-3' />
        </button>
      </TooltipTrigger>
      <TooltipContent className='max-w-64'>{description}</TooltipContent>
    </Tooltip>
  )
}

function MatrixLegend() {
  return (
    <div className='flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground'>
      <span className='font-semibold text-foreground'>Legenda:</span>
      <span>C Cuti</span>
      <span>I Izin</span>
      <span>S Sakit</span>
      <span>A Alpha</span>
      <span>L Libur kalender</span>
      <span>OFF Libur mingguan</span>
      <span className='flex items-center gap-1'>
        <AlertTriangle className='size-3 text-amber-600' /> Abnormal
      </span>
      <span className='rounded bg-amber-500/10 px-1 text-amber-800 dark:text-amber-300'>
        Terlambat / pulang awal
      </span>
    </div>
  )
}

function MatrixState({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex min-h-48 flex-wrap items-center justify-center gap-2 rounded-md border border-dashed text-center text-sm text-muted-foreground'>
      {children}
    </div>
  )
}

function statusDisplay(status: AttendanceRecapMatrixCell['status']) {
  return {
    ABSENT: {
      code: 'A',
      label: 'Alpha',
      className: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
    },
    LEAVE: {
      code: 'C',
      label: 'Cuti',
      className: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    },
    SICK: {
      code: 'S',
      label: 'Sakit',
      className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    },
    PERMISSION: {
      code: 'I',
      label: 'Izin',
      className: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
    },
    HOLIDAY: {
      code: 'L',
      label: 'Libur kalender',
      className: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
    },
    WEEKLY_OFF: {
      code: 'OFF',
      label: 'Libur mingguan',
      className: 'bg-muted text-muted-foreground',
    },
    PRESENT: {
      code: 'H',
      label: 'Hadir',
      className: 'bg-emerald-500/10 text-emerald-700',
    },
  }[status]
}

function shortDay(value: string) {
  return value.slice(0, 3)
}

function dayNumber(value: string) {
  return new Intl.NumberFormat('id-ID', { minimumIntegerDigits: 2 }).format(
    Number(value.slice(-2))
  )
}

function isWeekend(value: string) {
  const day = new Date(`${value}T00:00:00`).getDay()
  return day === 0 || day === 6
}

function paginationSummary(page: number, pageSize: number, total: number) {
  return total
    ? `Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} dari ${total} grup karyawan.`
    : 'Tidak ada data.'
}
