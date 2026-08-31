import { useEffect, useMemo } from 'react'
import { isAxiosError } from 'axios'
import { Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  CalendarCheck2,
  Clock3,
  Download,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { currentListReturnTo } from '@/lib/list-return-to'
import { cn } from '@/lib/utils'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import { useExportAttendanceRecaps } from '@/features/attendance/data/queries'
import {
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import type {
  AttendanceEmployeeType,
  AttendanceRecapGroup,
  AttendanceRecapStatus,
  AttendanceSiteCode,
} from '@/features/attendance/domain'
import {
  durationLabel,
  employeeTypeLabel,
} from '@/features/attendance/recap-columns'
import { hasPermission } from '@/features/auth/permissions'
import { useAttendanceReport, useAttendanceReportMeta } from './data'
import type { AttendanceReportParams } from './domain'
import {
  attendanceRangeError,
  defaultAttendancePeriod,
  downloadBlob,
  numberLabel,
} from './utils'

type Search = {
  dateFrom?: string
  dateTo?: string
  filter?: string
  site?: AttendanceSiteCode[]
  employeeType?: AttendanceEmployeeType[]
  productionSection?: string[]
  attendanceStatus?: AttendanceRecapStatus[]
  page?: number
  pageSize?: number
}

const statusOptions: Array<{ value: AttendanceRecapStatus; label: string }> = [
  { value: 'PRESENT', label: 'Hadir' },
  { value: 'ABSENT', label: 'Alpha' },
  { value: 'LEAVE', label: 'Cuti' },
  { value: 'SICK', label: 'Sakit' },
  { value: 'PERMISSION', label: 'Izin' },
  { value: 'HOLIDAY', label: 'Libur kalender' },
  { value: 'WEEKLY_OFF', label: 'Libur mingguan' },
]

export function AttendanceReportPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const defaults = defaultAttendancePeriod()
  const dateFrom = search.dateFrom ?? defaults.dateFrom
  const dateTo = search.dateTo ?? defaults.dateTo
  const rangeError = attendanceRangeError(dateFrom, dateTo)
  const params: AttendanceReportParams = {
    dateFrom,
    dateTo,
    query: search.filter,
    site: search.site,
    employeeType: search.employeeType,
    productionSection: search.productionSection,
    attendanceStatus: search.attendanceStatus,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  }
  const result = useAttendanceReport(params, !rangeError)
  const meta = useAttendanceReportMeta(dateFrom, dateTo, !rangeError)
  const session = useAuthStore((state) => state.session)
  const canExport = hasPermission(session, 'attendance.export')
  const exportReport = useExportAttendanceRecaps()
  const returnTo = currentListReturnTo()
  const columns = useMemo<ColumnDef<AttendanceRecapGroup>[]>(
    () => attendanceColumns(returnTo),
    [returnTo]
  )
  const url = useTableUrlState({
    search,
    navigate,
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
  // TanStack Table mengembalikan fungsi stateful; ini pola resmi starter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: result.data?.items ?? [],
    columns,
    state: {
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
    },
    initialState: {
      columnVisibility: {
        site: false,
        productionSection: false,
        attendanceStatus: false,
      },
    },
    manualFiltering: true,
    manualPagination: true,
    pageCount: Math.max(
      1,
      Math.ceil((result.data?.total ?? 0) / (result.data?.pageSize ?? 50))
    ),
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => `${row.employeeUid}:${row.site}:${row.employeeType}`,
  })

  useEffect(() => {
    if (!search.dateFrom || !search.dateTo) {
      navigate({
        replace: true,
        search: (previous) => ({ ...previous, dateFrom, dateTo }),
      })
    }
  }, [dateFrom, dateTo, navigate, search.dateFrom, search.dateTo])

  useEffect(() => {
    if (result.data) {
      url.ensurePageInRange(
        Math.max(1, Math.ceil(result.data.total / result.data.pageSize))
      )
    }
  }, [result.data, url])

  const summary = result.data?.summary
  const exportBlockedReason = attendanceExportReason({
    rangeError,
    isLoading: result.isPending,
    finalization: result.data?.finalization,
  })
  const exportExcel = () => {
    if (exportBlockedReason) return
    exportReport.mutate(
      {
        dateFrom,
        dateTo,
        query: params.query,
        site: params.site,
        employeeType: params.employeeType,
        productionSection: params.productionSection,
        attendanceStatus: params.attendanceStatus,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          downloadBlob(blob, fileName)
          toast.success('Laporan attendance berhasil diunduh.')
        },
        onError: (error) =>
          toast.error(
            isAxiosError(error) && error.response?.status === 409
              ? 'Ekspor diblokir karena laporan belum lengkap atau belum resmi.'
              : 'Ekspor laporan attendance gagal.'
          ),
      }
    )
  }

  return (
    <Main>
      <div className='mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Pusat Laporan</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Laporan Attendance
          </h1>
          <p className='text-sm text-muted-foreground'>
            Ringkasan attendance per karyawan berdasarkan fakta dan finalisasi
            periode.
          </p>
        </div>
        <div className='grid w-full gap-3 sm:grid-cols-2 xl:w-auto xl:grid-cols-[auto_auto_auto]'>
          <DateField
            label='Dari tanggal'
            value={dateFrom}
            onChange={(value) => updateDate(navigate, 'dateFrom', value)}
          />
          <DateField
            label='Sampai tanggal'
            value={dateTo}
            onChange={(value) => updateDate(navigate, 'dateTo', value)}
          />
          {canExport && (
            <div className='grid gap-1.5'>
              <span
                className='hidden text-sm font-medium xl:block'
                aria-hidden='true'
              >
                &nbsp;
              </span>
              <Button
                onClick={exportExcel}
                disabled={
                  Boolean(exportBlockedReason) || exportReport.isPending
                }
                title={exportBlockedReason}
                aria-describedby={
                  exportBlockedReason
                    ? 'attendance-report-export-reason'
                    : undefined
                }
                className='w-full'
              >
                {exportReport.isPending ? (
                  <LoaderCircle className='animate-spin' />
                ) : (
                  <Download />
                )}
                Ekspor Excel
              </Button>
              {exportBlockedReason && (
                <p id='attendance-report-export-reason' className='sr-only'>
                  {exportBlockedReason}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {rangeError && (
        <Alert variant='destructive' className='mb-4'>
          <AlertTriangle />
          <AlertTitle>Periode belum valid</AlertTitle>
          <AlertDescription>{rangeError}</AlertDescription>
        </Alert>
      )}

      {result.data?.finalization && (
        <FinalizationNotice finalization={result.data.finalization} />
      )}

      {summary && (
        <div className='mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
          <Kpi label='Karyawan' value={summary.groups} icon={Users} />
          <Kpi
            label='Hadir kerja'
            value={summary.presentWorkday}
            icon={UserCheck}
          />
          <Kpi label='Alpha' value={summary.absent} icon={UserMinus} />
          <Kpi
            label='Terlambat'
            value={summary.lateDays}
            icon={Clock3}
            suffix='hari'
          />
        </div>
      )}

      <div className='space-y-4'>
        <div className='overflow-x-auto pb-1'>
          <div className='min-w-max sm:min-w-0'>
            <DataTableToolbar
              table={table}
              searchPlaceholder='Cari nama atau nomor karyawan...'
              searchDebounceMs={500}
              filters={[
                {
                  columnId: 'site',
                  title: 'Site',
                  options: (meta.data?.sites ?? []).map(option),
                },
                {
                  columnId: 'employeeType',
                  title: 'Jenis karyawan',
                  options: (meta.data?.employeeTypes ?? []).map(option),
                },
                {
                  columnId: 'productionSection',
                  title: 'Bagian produksi',
                  options: (meta.data?.productionSections ?? []).map(
                    (item) => ({
                      value: item.uid,
                      label: `${item.moduleName} - ${item.name}`,
                    })
                  ),
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
        {result.isFetching && !result.isPending && <Refreshing />}
        {result.isPending ? (
          <EmptyState text='Memuat laporan attendance...' loading />
        ) : result.isError ? (
          <EmptyState text='Laporan attendance gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EmptyState>
        ) : !result.data?.items.length ? (
          <EmptyState text='Tidak ada data attendance yang sesuai filter.' />
        ) : (
          <>
            <div className='hidden overflow-x-auto rounded-md border xl:block'>
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((group) => (
                    <TableRow key={group.id}>
                      {group.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className={header.column.columnDef.meta?.className}
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
            <div className='grid gap-3 xl:hidden'>
              {result.data.items.map((item) => (
                <AttendanceCard
                  key={`${item.employeeUid}:${item.site}:${item.employeeType}`}
                  item={item}
                  returnTo={returnTo}
                />
              ))}
            </div>
            <DataTablePagination
              table={table}
              summary={pageSummary(
                result.data.page,
                result.data.pageSize,
                result.data.total
              )}
            />
          </>
        )}
      </div>
    </Main>
  )
}

function attendanceColumns(
  returnTo?: string
): ColumnDef<AttendanceRecapGroup>[] {
  return [
    {
      accessorKey: 'employeeName',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Karyawan' />
      ),
      cell: ({ row }) => (
        <div>
          <Link
            to='/karyawan/data-karyawan/$employeeUid'
            params={{ employeeUid: row.original.employeeUid }}
            search={{ returnTo }}
            className='font-medium hover:underline'
          >
            {row.original.employeeName}
          </Link>
          <p className='text-xs text-muted-foreground'>
            {row.original.employeeNumber} · {row.original.siteName}
          </p>
        </div>
      ),
      meta: { label: 'Karyawan' },
    },
    {
      accessorKey: 'site',
      enableSorting: false,
      header: 'Site',
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      meta: { label: 'Site' },
    },
    {
      accessorKey: 'employeeType',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Jenis & Jabatan' />
      ),
      cell: ({ row }) => (
        <div>
          <p>{employeeTypeLabel(row.original.employeeType)}</p>
          <p className='text-xs text-muted-foreground'>
            {row.original.positions.join(', ') || '-'}
          </p>
        </div>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      meta: { label: 'Jenis & Jabatan' },
    },
    {
      id: 'productionSection',
      enableSorting: false,
      accessorFn: (item) => item.productionSectionUids,
      header: 'Bagian produksi',
      meta: { label: 'Bagian produksi' },
    },
    numberColumn('scheduledDays', 'Hari kerja'),
    numberColumn('presentWorkday', 'Hadir'),
    numberColumn('absent', 'Alpha'),
    {
      id: 'classified',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='C / S / I' />
      ),
      cell: ({ row }) => (
        <span className='whitespace-nowrap tabular-nums'>
          {row.original.leave} / {row.original.sick} / {row.original.permission}
        </span>
      ),
      meta: { label: 'Cuti / Sakit / Izin' },
    },
    {
      accessorKey: 'lateMinutes',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Terlambat' />
      ),
      cell: ({ row }) => (
        <div>
          <p>{durationLabel(row.original.lateMinutes)}</p>
          <p className='text-xs text-muted-foreground'>
            {row.original.lateDays} hari
          </p>
        </div>
      ),
      meta: { label: 'Terlambat' },
    },
    {
      accessorKey: 'earlyLeaveMinutes',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Pulang awal' />
      ),
      cell: ({ row }) => (
        <div>
          <p>{durationLabel(row.original.earlyLeaveMinutes)}</p>
          <p className='text-xs text-muted-foreground'>
            {row.original.earlyLeaveDays} hari
          </p>
        </div>
      ),
      meta: { label: 'Pulang awal' },
    },
    {
      accessorKey: 'abnormal',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Abnormal' />
      ),
      cell: ({ row }) =>
        row.original.abnormal ? (
          <Badge variant='outline'>{row.original.abnormal}</Badge>
        ) : (
          '0'
        ),
      meta: { label: 'Abnormal' },
    },
    {
      id: 'attendanceStatus',
      accessorFn: () => [],
      header: () => null,
      cell: () => null,
      enableHiding: false,
    },
  ]
}

function numberColumn(
  key: keyof AttendanceRecapGroup,
  title: string
): ColumnDef<AttendanceRecapGroup> {
  return {
    accessorKey: key,
    enableSorting: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={title} />
    ),
    cell: ({ getValue }) => (
      <span className='tabular-nums'>
        {numberLabel(Number(getValue() ?? 0))}
      </span>
    ),
    meta: { label: title },
  }
}

function FinalizationNotice({
  finalization,
}: {
  finalization: NonNullable<
    import('./domain').AttendanceReportResult['finalization']
  >
}) {
  const official = finalization.status === 'OFFICIAL'
  return (
    <Alert
      className={cn(
        'mb-4',
        official
          ? 'border-positive/40 bg-positive/5'
          : 'border-warning/50 bg-warning/5'
      )}
    >
      {official ? (
        <ShieldCheck className='text-positive' />
      ) : (
        <AlertTriangle className='text-warning-foreground' />
      )}
      <AlertTitle className='flex items-center gap-2'>
        Status laporan{' '}
        <Badge variant={official ? 'default' : 'outline'}>
          {official ? 'Resmi' : 'Sementara'}
        </Badge>
      </AlertTitle>
      <AlertDescription>
        {official
          ? 'Seluruh tanggal dan site dalam periode ini sudah final.'
          : (finalization.blockedReasons[0] ??
            'Masih ada tanggal atau site yang belum selesai difinalisasi.')}
      </AlertDescription>
    </Alert>
  )
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className='w-full sm:w-56'>
      <label className='mb-1.5 block text-sm font-medium'>{label}</label>
      <DatePicker
        selected={dateOnlyFromInput(value)}
        onSelect={(date) => onChange(dateOnlyToInput(date))}
      />
    </div>
  )
}

function updateDate(
  navigate: NavigateFn,
  key: 'dateFrom' | 'dateTo',
  value: string
) {
  navigate({
    search: (previous) => ({
      ...previous,
      [key]: value || undefined,
      page: undefined,
    }),
  })
}

function AttendanceCard({
  item,
  returnTo,
}: {
  item: AttendanceRecapGroup
  returnTo?: string
}) {
  return (
    <Card>
      <CardContent className='p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <Link
              to='/karyawan/data-karyawan/$employeeUid'
              params={{ employeeUid: item.employeeUid }}
              search={{ returnTo }}
              className='font-semibold hover:underline'
            >
              {item.employeeName}
            </Link>
            <p className='text-xs text-muted-foreground'>
              {item.employeeNumber} · {item.siteName}
            </p>
          </div>
          <Badge variant='outline'>
            {employeeTypeLabel(item.employeeType)}
          </Badge>
        </div>
        <div className='mt-3 grid grid-cols-3 gap-3 text-center text-sm'>
          <Info label='Hadir' value={item.presentWorkday} />
          <Info label='Alpha' value={item.absent} />
          <Info
            label='C / S / I'
            value={`${item.leave}/${item.sick}/${item.permission}`}
          />
          <Info label='Terlambat' value={durationLabel(item.lateMinutes)} />
          <Info
            label='Pulang awal'
            value={durationLabel(item.earlyLeaveMinutes)}
          />
          <Info label='Abnormal' value={item.abnormal} />
        </div>
      </CardContent>
    </Card>
  )
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='font-medium tabular-nums'>{value}</p>
    </div>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
  suffix,
}: {
  label: string
  value: number
  icon: typeof Users
  suffix?: string
}) {
  return (
    <section className='min-h-17 rounded-lg border bg-card px-3 py-2.5'>
      <div className='flex items-start justify-between gap-2'>
        <div>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='mt-1 text-xl font-semibold tabular-nums'>
            {numberLabel(value)}{' '}
            {suffix && (
              <span className='text-xs font-normal text-muted-foreground'>
                {suffix}
              </span>
            )}
          </p>
        </div>
        <Icon className='size-4 text-muted-foreground' />
      </div>
    </section>
  )
}

function Refreshing() {
  return (
    <p
      role='status'
      className='flex items-center gap-2 text-xs text-muted-foreground'
    >
      <LoaderCircle className='size-3.5 animate-spin' /> Memperbarui laporan...
    </p>
  )
}

function EmptyState({
  text,
  loading,
  children,
}: {
  text: string
  loading?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className='flex min-h-40 flex-col items-center justify-center gap-3 text-center text-muted-foreground'>
      {loading ? (
        <LoaderCircle className='size-5 animate-spin' />
      ) : (
        <CalendarCheck2 className='size-5' />
      )}
      <p>{text}</p>
      {children}
    </div>
  )
}

function option(item: { code: string; name: string }) {
  return { value: item.code, label: item.name }
}

function pageSummary(page: number, pageSize: number, total: number) {
  return (
    <>
      Menampilkan {total ? (page - 1) * pageSize + 1 : 0}–
      {Math.min(page * pageSize, total)} dari {numberLabel(total)} data.
    </>
  )
}

function attendanceExportReason(input: {
  rangeError?: string
  isLoading: boolean
  finalization?: import('./domain').AttendanceReportFinalization
}) {
  if (input.rangeError) return input.rangeError
  if (input.isLoading) return 'Tunggu pemeriksaan status laporan selesai.'
  if (!input.finalization) return 'Status finalisasi laporan belum tersedia.'
  if (!input.finalization.official || !input.finalization.exportAllowed) {
    return (
      input.finalization.blockedReasons.join(' ') ||
      'Laporan belum lengkap atau belum resmi.'
    )
  }
  return undefined
}
