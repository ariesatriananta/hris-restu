import { useMemo } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { Eye, LoaderCircle, RefreshCcw, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
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
import type { AttendanceRecapGroup, AttendanceRecapResult } from './domain'
import {
  durationLabel,
  employeeSiteLabel,
  employeeTypeLabel,
  recapColumns,
} from './recap-columns'

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

export function AttendanceRecapTable({
  data,
  search,
  navigate,
  siteOptions,
  isPending,
  isFetching,
  isError,
  onRetry,
  onDetail,
}: {
  data?: AttendanceRecapResult
  search: Record<string, unknown>
  navigate: NavigateFn
  siteOptions: { value: string; label: string }[]
  isPending: boolean
  isFetching: boolean
  isError: boolean
  onRetry: () => void
  onDetail: (item: AttendanceRecapGroup) => void
}) {
  const columns = useMemo(() => recapColumns(onDetail), [onDetail])
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'employeeType', searchKey: 'employeeType', type: 'array' },
      {
        columnId: 'attendanceStatus',
        searchKey: 'attendanceStatus',
        type: 'array',
      },
    ],
  })
  // TanStack Table mengembalikan fungsi stateful; ini pola starter.
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
      columnVisibility: {
        site: false,
        workedMinutes: false,
        earlyLeaveMinutes: false,
        abnormal: false,
        shiftNames: false,
        attendanceStatus: false,
      },
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
            filters={[
              { columnId: 'site', title: 'Site', options: siteOptions },
              {
                columnId: 'employeeType',
                title: 'Jenis',
                options: employeeTypeOptions,
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
      {isFetching && !isPending && (
        <p
          role='status'
          className='flex items-center gap-2 text-xs text-muted-foreground'
        >
          <LoaderCircle className='size-3.5 animate-spin' /> Memperbarui
          rekap...
        </p>
      )}
      {isPending ? (
        <StateText>
          <LoaderCircle className='size-4 animate-spin' /> Memuat rekap
          attendance...
        </StateText>
      ) : isError ? (
        <StateText>
          Data rekap gagal dimuat.
          <Button size='sm' variant='outline' onClick={onRetry}>
            <RefreshCcw /> Coba lagi
          </Button>
        </StateText>
      ) : !data?.items.length ? (
        <StateText>
          <Users className='size-4' /> Tidak ada data yang sesuai filter.
        </StateText>
      ) : (
        <>
          <div className='hidden rounded-md border xl:block'>
            <Table className='table-fixed [&_th]:leading-4 [&_th]:whitespace-normal'>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={cn(
                          header.column.columnDef.meta?.className,
                          header.column.columnDef.meta?.thClassName
                        )}
                      >
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
                      <TableCell
                        key={cell.id}
                        className={cn(
                          cell.column.columnDef.meta?.className,
                          cell.column.columnDef.meta?.tdClassName
                        )}
                      >
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
          <div className='grid gap-3 xl:hidden'>
            {data.items.map((item) => (
              <Card
                key={`${item.employeeUid}:${item.site}:${item.employeeType}`}
              >
                <CardContent className='space-y-3 p-4'>
                  <div className='flex items-start justify-between gap-3'>
                    <div>
                      <p className='font-semibold'>{item.employeeName}</p>
                      <p className='text-xs text-muted-foreground'>
                        {employeeSiteLabel(item.site)} - {item.employeeNumber}
                      </p>
                    </div>
                    {item.abnormal > 0 && (
                      <Badge
                        variant='outline'
                        className='border-warning/60 bg-warning/10'
                      >
                        {item.abnormal} abnormal
                      </Badge>
                    )}
                  </div>
                  <div className='grid grid-cols-2 gap-3 text-xs'>
                    <div className='min-w-0'>
                      <p className='text-muted-foreground'>Jenis & Jabatan</p>
                      <p className='truncate'>
                        {employeeTypeLabel(item.employeeType)} ·{' '}
                        {compactList(item.positions)}
                      </p>
                    </div>
                    <div className='min-w-0'>
                      <p className='text-muted-foreground'>Bagian Produksi</p>
                      <p className='truncate'>
                        {compactList(item.productionModules)} ·{' '}
                        {compactList(item.productionSections)}
                      </p>
                    </div>
                  </div>
                  <div className='grid grid-cols-4 gap-2 text-center text-xs'>
                    <MobileCount
                      label='Hari kerja'
                      value={item.scheduledDays}
                    />
                    <MobileCount
                      label='Hadir kerja'
                      value={item.presentWorkday}
                    />
                    <MobileCount label='Alpha' value={item.absent} />
                    <MobileCount
                      label='C/S/I'
                      value={`${item.leave}/${item.sick}/${item.permission}`}
                    />
                  </div>
                  {item.presentHoliday > 0 && (
                    <p className='text-xs font-medium text-positive'>
                      {item.presentHoliday} hadir pada hari libur
                    </p>
                  )}
                  <div className='flex items-center justify-between gap-2 border-t pt-2'>
                    <p className='text-xs text-muted-foreground'>
                      Terlambat {durationLabel(item.lateMinutes)}
                    </p>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => onDetail(item)}
                    >
                      <Eye /> Rincian
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
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

function MobileCount({
  label,
  value,
}: {
  label: string
  value: string | number
}) {
  return (
    <div className='rounded-md bg-muted/60 px-1 py-2'>
      <p className='font-semibold tabular-nums'>{value}</p>
      <p className='text-[10px] text-muted-foreground'>{label}</p>
    </div>
  )
}

function StateText({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex min-h-40 flex-wrap items-center justify-center gap-2 text-center text-sm text-muted-foreground'>
      {children}
    </div>
  )
}

function paginationSummary(page: number, pageSize: number, total: number) {
  return total
    ? `Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} dari ${total} grup karyawan.`
    : 'Tidak ada data.'
}

function compactList(values: string[]) {
  return values.length ? values.join(', ') : '-'
}
