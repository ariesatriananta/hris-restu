import { useEffect, useMemo, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  LoaderCircle,
  MonitorSmartphone,
  RefreshCcw,
  ScanLine,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DataTableActionButton,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import {
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import {
  useDeviceScanReport,
  useDeviceScanReportMeta,
  useExportDeviceScanReport,
} from './data'
import type {
  DeviceActivityStatus,
  DeviceScanReportItem,
  DeviceScanReportParams,
  ReportDeviceType,
  ScanResultStatus,
} from './domain'
import {
  defaultDeviceScanPeriod,
  deviceScanRangeError,
  downloadBlob,
  numberLabel,
} from './utils'

type Search = {
  dateFrom?: string
  dateTo?: string
  filter?: string
  site?: string[]
  deviceType?: ReportDeviceType[]
  resultStatus?: ScanResultStatus[]
  activityStatus?: DeviceActivityStatus[]
  detailUid?: string
  page?: number
  pageSize?: number
}

export function DeviceScanReportPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const defaults = defaultDeviceScanPeriod()
  const dateFrom = search.dateFrom ?? defaults.dateFrom
  const dateTo = search.dateTo ?? defaults.dateTo
  const rangeError = deviceScanRangeError(dateFrom, dateTo)
  const params: DeviceScanReportParams = {
    dateFrom,
    dateTo,
    query: search.filter,
    site: search.site,
    deviceType: search.deviceType,
    resultStatus: search.resultStatus,
    activityStatus: search.activityStatus,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  }
  const result = useDeviceScanReport(params, !rangeError)
  const meta = useDeviceScanReportMeta(dateFrom, dateTo, !rangeError)
  const exportReport = useExportDeviceScanReport()
  const showDetail = (deviceUid?: string) =>
    navigate({
      search: (previous) => ({ ...previous, detailUid: deviceUid }),
    })
  const selected = result.data?.items.find(
    (item) => item.deviceUid === search.detailUid
  )
  const columns = useMemo(
    () => deviceColumns(showDetail),
    // navigate dari TanStack Router stabil untuk siklus hidup halaman.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'deviceType', searchKey: 'deviceType', type: 'array' },
      { columnId: 'resultStatus', searchKey: 'resultStatus', type: 'array' },
      {
        columnId: 'activityStatus',
        searchKey: 'activityStatus',
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
    getRowId: (row) => row.deviceUid,
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

  const exportExcel = () => {
    exportReport.mutate(
      {
        dateFrom,
        dateTo,
        query: params.query,
        site: params.site,
        deviceType: params.deviceType,
        resultStatus: params.resultStatus,
        activityStatus: params.activityStatus,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          downloadBlob(blob, fileName)
          toast.success('Laporan perangkat dan scan berhasil diunduh.')
        },
        onError: () => toast.error('Ekspor laporan perangkat dan scan gagal.'),
      }
    )
  }
  const summary = result.data?.summary

  return (
    <Main>
      <div className='mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Pusat Laporan</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Laporan Perangkat & Aktivitas Scan
          </h1>
          <p className='text-sm text-muted-foreground'>
            Pantau kesiapan perangkat dan hasil scan Attendance per periode.
          </p>
        </div>
        <div className='flex w-full flex-col gap-3 sm:flex-row sm:items-end xl:w-auto'>
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
          {meta.data?.canExport && (
            <Button
              className='w-full sm:w-auto'
              onClick={exportExcel}
              disabled={
                Boolean(rangeError) ||
                exportReport.isPending ||
                result.isPending
              }
            >
              {exportReport.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Download />
              )}
              Ekspor Excel
            </Button>
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

      {summary && (
        <div className='mb-4 grid grid-cols-2 gap-2 xl:grid-cols-5 2xl:grid-cols-10'>
          <Kpi
            label='Perangkat'
            value={summary.totalDevices}
            icon={MonitorSmartphone}
          />
          <Kpi
            label='Normal'
            value={summary.healthyDevices}
            icon={CheckCircle2}
          />
          <Kpi
            label='Perlu perhatian'
            value={summary.attentionDevices}
            icon={AlertTriangle}
          />
          <Kpi
            label='Tanpa aktivitas'
            value={summary.noActivityDevices}
            icon={ScanLine}
          />
          <Kpi
            label='Belum aktivasi'
            value={summary.notActivatedDevices}
            icon={XCircle}
          />
          <Kpi
            label='Nonaktif'
            value={summary.inactiveDevices}
            icon={XCircle}
          />
          <Kpi label='Total scan' value={summary.totalScans} icon={ScanLine} />
          <Kpi
            label='Berhasil'
            value={summary.successfulScans}
            icon={CheckCircle2}
          />
          <Kpi
            label='Ditolak'
            value={summary.rejectedScans}
            icon={AlertTriangle}
          />
          <Kpi label='Error' value={summary.errorScans} icon={XCircle} />
        </div>
      )}

      <Alert className='mb-4'>
        <MonitorSmartphone />
        <AlertTitle>Cara membaca waktu terakhir terhubung</AlertTitle>
        <AlertDescription>
          Waktu tersebut dapat berasal dari penggunaan Attendance atau Produksi.
          Kondisi aktivitas pada laporan ini hanya dihitung dari scan Attendance
          dalam periode yang dipilih.
        </AlertDescription>
      </Alert>

      <div className='space-y-4'>
        <div className='overflow-x-auto pb-1'>
          <div className='min-w-max sm:min-w-0'>
            <DataTableToolbar
              table={table}
              searchPlaceholder='Cari kode, nama, atau lokasi perangkat...'
              searchDebounceMs={500}
              filters={[
                {
                  columnId: 'site',
                  title: 'Site',
                  options: (meta.data?.sites ?? []).map(option),
                },
                {
                  columnId: 'deviceType',
                  title: 'Jenis perangkat',
                  options: (meta.data?.deviceTypes ?? []).map(option),
                },
                {
                  columnId: 'resultStatus',
                  title: 'Hasil scan',
                  options: (meta.data?.resultStatuses ?? []).map(option),
                },
                {
                  columnId: 'activityStatus',
                  title: 'Kondisi',
                  options: (meta.data?.activityStatuses ?? []).map(option),
                },
              ]}
            />
          </div>
        </div>
        {result.isFetching && !result.isPending && <Refreshing />}
        {result.isPending && !rangeError ? (
          <EmptyState text='Memuat laporan perangkat dan scan...' loading />
        ) : result.isError ? (
          <EmptyState text='Laporan perangkat dan scan gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EmptyState>
        ) : !rangeError && !result.data?.items.length ? (
          <EmptyState text='Tidak ada perangkat yang sesuai filter.' />
        ) : !rangeError ? (
          <>
            <div className='hidden overflow-x-auto rounded-md border lg:block'>
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
            <div className='grid gap-3 lg:hidden'>
              {result.data?.items.map((item) => (
                <DeviceCard
                  key={item.deviceUid}
                  item={item}
                  onDetail={() => showDetail(item.deviceUid)}
                />
              ))}
            </div>
            {result.data && (
              <DataTablePagination
                table={table}
                summary={pageSummary(
                  result.data.page,
                  result.data.pageSize,
                  result.data.total
                )}
              />
            )}
          </>
        ) : null}
      </div>

      <DeviceDetail
        item={selected}
        open={Boolean(search.detailUid && selected)}
        onOpenChange={(open) => {
          if (!open) showDetail(undefined)
        }}
      />
    </Main>
  )
}

function deviceColumns(
  onDetail: (uid: string) => void
): ColumnDef<DeviceScanReportItem>[] {
  return [
    {
      accessorKey: 'deviceName',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Perangkat' />
      ),
      cell: ({ row }) => <DeviceName item={row.original} />,
      meta: { label: 'Perangkat' },
    },
    hiddenFilter('site', (item) => item.site.code),
    {
      accessorKey: 'deviceType',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Jenis' />
      ),
      cell: ({ row }) => (
        <Badge variant='outline'>
          {deviceTypeLabel(row.original.deviceType)}
        </Badge>
      ),
      filterFn: arrayFilter,
      meta: { label: 'Jenis' },
    },
    hiddenFilter('resultStatus', () => ''),
    {
      id: 'connection',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Aktivasi & koneksi' />
      ),
      cell: ({ row }) => <Connection item={row.original} />,
      meta: { label: 'Aktivasi & koneksi' },
    },
    {
      id: 'scans',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Aktivitas scan' />
      ),
      cell: ({ row }) => <ScanSummary item={row.original} />,
      meta: { label: 'Aktivitas scan' },
    },
    {
      accessorKey: 'activityStatus',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Kondisi' />
      ),
      cell: ({ row }) => <ActivityBadge status={row.original.activityStatus} />,
      filterFn: arrayFilter,
      meta: { label: 'Kondisi' },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      header: () => <span className='sr-only'>Aksi</span>,
      cell: ({ row }) => (
        <DataTableActionButton
          label={`Lihat rincian perangkat ${row.original.deviceName}`}
          onClick={() => onDetail(row.original.deviceUid)}
        >
          <Eye />
        </DataTableActionButton>
      ),
      meta: { label: 'Aksi' },
    },
  ]
}

function DeviceName({ item }: { item: DeviceScanReportItem }) {
  return (
    <div className='min-w-44'>
      <p className='font-medium'>{item.deviceName}</p>
      <p className='text-xs text-muted-foreground'>
        {item.deviceCode} · {item.site.name}
      </p>
      <p className='text-xs text-muted-foreground'>
        {item.locationDescription ?? 'Lokasi belum diisi'}
      </p>
    </div>
  )
}

function Connection({ item }: { item: DeviceScanReportItem }) {
  return (
    <div className='min-w-44 text-sm'>
      <p>
        {item.isAttendanceActivated
          ? 'Attendance teraktivasi'
          : 'Belum aktivasi Attendance'}
      </p>
      <p className='text-xs text-muted-foreground'>
        {item.lastSeenAt
          ? `Terhubung ${dateTimeLabel(item.lastSeenAt)}`
          : 'Belum pernah terhubung'}
      </p>
    </div>
  )
}

function ScanSummary({ item }: { item: DeviceScanReportItem }) {
  return (
    <div className='min-w-44 text-sm'>
      <p>
        {numberLabel(item.scans.total)} scan ·{' '}
        {numberLabel(item.scans.uniqueEmployees)} karyawan
      </p>
      <p className='text-xs text-muted-foreground'>
        {numberLabel(item.scans.successful)} berhasil ·{' '}
        {numberLabel(item.scans.rejected)} ditolak ·{' '}
        {numberLabel(item.scans.error)} error
      </p>
    </div>
  )
}

function DeviceCard({
  item,
  onDetail,
}: {
  item: DeviceScanReportItem
  onDetail: () => void
}) {
  return (
    <Card>
      <CardContent className='p-4'>
        <div className='flex items-start justify-between gap-3'>
          <DeviceName item={item} />
          <ActivityBadge status={item.activityStatus} />
        </div>
        <div className='mt-3 grid grid-cols-2 gap-3 text-sm'>
          <Info label='Jenis' value={deviceTypeLabel(item.deviceType)} />
          <Info
            label='Aktivasi'
            value={item.isAttendanceActivated ? 'Sudah' : 'Belum'}
          />
          <Info label='Total scan' value={numberLabel(item.scans.total)} />
          <Info label='Berhasil' value={numberLabel(item.scans.successful)} />
        </div>
        <Button
          variant='outline'
          size='sm'
          className='mt-3 w-full'
          onClick={onDetail}
        >
          <Eye /> Lihat rincian
        </Button>
      </CardContent>
    </Card>
  )
}

function DeviceDetail({
  item,
  open,
  onOpenChange,
}: {
  item?: DeviceScanReportItem
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
        {item && (
          <>
            <SheetHeader>
              <SheetTitle>Rincian Perangkat & Aktivitas Scan</SheetTitle>
              <SheetDescription>
                Status perangkat dan ringkasan scan Attendance pada periode
                laporan.
              </SheetDescription>
            </SheetHeader>
            <div className='space-y-5 px-4 pb-6'>
              <section className='rounded-lg border p-4'>
                <div className='flex items-start justify-between gap-3'>
                  <DeviceName item={item} />
                  <ActivityBadge status={item.activityStatus} />
                </div>
              </section>
              <DetailSection title='Perangkat'>
                <DetailRow label='Site' value={item.site.name} />
                <DetailRow
                  label='Jenis'
                  value={deviceTypeLabel(item.deviceType)}
                />
                <DetailRow
                  label='Status master'
                  value={item.isActive ? 'Aktif' : 'Nonaktif'}
                />
                <DetailRow
                  label='Aktivasi Attendance'
                  value={
                    item.isAttendanceActivated
                      ? 'Sudah diaktivasi'
                      : 'Belum diaktivasi'
                  }
                />
                <DetailRow
                  label='Waktu aktivasi'
                  value={
                    item.activatedAt ? dateTimeLabel(item.activatedAt) : '-'
                  }
                />
                <DetailRow
                  label='Terakhir terhubung'
                  value={item.lastSeenAt ? dateTimeLabel(item.lastSeenAt) : '-'}
                />
              </DetailSection>
              <DetailSection title='Aktivitas scan Attendance'>
                <DetailRow
                  label='Scan pertama'
                  value={
                    item.firstScanAt ? dateTimeLabel(item.firstScanAt) : '-'
                  }
                />
                <DetailRow
                  label='Scan terakhir'
                  value={item.lastScanAt ? dateTimeLabel(item.lastScanAt) : '-'}
                />
                <DetailRow
                  label='Total scan'
                  value={numberLabel(item.scans.total)}
                />
                <DetailRow
                  label='Scan masuk'
                  value={numberLabel(item.scans.clockIn)}
                />
                <DetailRow
                  label='Scan pulang'
                  value={numberLabel(item.scans.clockOut)}
                />
                <DetailRow
                  label='Berhasil'
                  value={numberLabel(item.scans.successful)}
                />
                <DetailRow
                  label='Ditolak'
                  value={numberLabel(item.scans.rejected)}
                />
                <DetailRow
                  label='Error'
                  value={numberLabel(item.scans.error)}
                />
                <DetailRow
                  label='Karyawan unik'
                  value={numberLabel(item.scans.uniqueEmployees)}
                />
              </DetailSection>
              {item.activityStatus !== 'HEALTHY' && (
                <Alert>
                  <AlertTriangle />
                  <AlertTitle>
                    {activityStatusLabel(item.activityStatus)}
                  </AlertTitle>
                  <AlertDescription>
                    {activityStatusHelp(item.activityStatus)}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <h3 className='mb-2 font-semibold'>{title}</h3>
      <div className='divide-y rounded-lg border px-4'>{children}</div>
    </section>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 py-3 text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='text-right font-medium break-words'>{value}</span>
    </div>
  )
}

function ActivityBadge({ status }: { status: DeviceActivityStatus }) {
  return (
    <Badge
      variant={
        status === 'HEALTHY'
          ? 'default'
          : status === 'NO_ACTIVITY'
            ? 'outline'
            : 'destructive'
      }
    >
      {activityStatusLabel(status)}
    </Badge>
  )
}

function hiddenFilter(
  id: string,
  accessor: (item: DeviceScanReportItem) => string
): ColumnDef<DeviceScanReportItem> {
  return {
    id,
    accessorFn: accessor,
    enableHiding: true,
    filterFn: arrayFilter,
    meta: { label: id },
  }
}

function arrayFilter(
  row: { getValue: (id: string) => unknown },
  id: string,
  value: string[]
) {
  return value.includes(String(row.getValue(id)))
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
    <div className='w-full sm:w-52'>
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
      detailUid: undefined,
    }),
  })
}

function option(item: { code: string; name: string }) {
  return { value: item.code, label: item.name }
}

function deviceTypeLabel(value: ReportDeviceType) {
  return {
    MOBILE_CAMERA: 'Kamera HP',
    USB_SCANNER: 'Scanner USB',
    TERMINAL: 'Terminal',
    OTHER: 'Lainnya',
  }[value]
}

function activityStatusLabel(value: DeviceActivityStatus) {
  return {
    HEALTHY: 'Aktivitas normal',
    ATTENTION: 'Perlu perhatian',
    NO_ACTIVITY: 'Tanpa aktivitas',
    NOT_ACTIVATED: 'Belum aktivasi',
    INACTIVE: 'Nonaktif',
  }[value]
}

function activityStatusHelp(value: DeviceActivityStatus) {
  return {
    HEALTHY: 'Aktivitas scan berjalan normal.',
    ATTENTION: 'Ada scan yang ditolak atau mengalami error pada periode ini.',
    NO_ACTIVITY:
      'Tidak ada aktivitas scan Attendance pada periode yang dipilih.',
    NOT_ACTIVATED:
      'Perangkat belum diaktivasi untuk digunakan pada Attendance.',
    INACTIVE: 'Perangkat dinonaktifkan pada Master Perangkat.',
  }[value]
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p>{value}</p>
    </div>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: LucideIcon
}) {
  return (
    <section className='min-h-17 rounded-lg border bg-card px-3 py-2.5'>
      <div className='flex items-start justify-between gap-2'>
        <div>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='mt-1 text-xl font-semibold tabular-nums'>
            {numberLabel(value)}
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
  children?: ReactNode
}) {
  return (
    <div className='flex min-h-40 flex-col items-center justify-center gap-3 text-center text-muted-foreground'>
      {loading ? (
        <LoaderCircle className='size-5 animate-spin' />
      ) : (
        <MonitorSmartphone className='size-5' />
      )}
      <p>{text}</p>
      {children}
    </div>
  )
}

function pageSummary(page: number, pageSize: number, total: number) {
  return (
    <>
      Menampilkan {total ? (page - 1) * pageSize + 1 : 0}–
      {Math.min(page * pageSize, total)} dari {numberLabel(total)} data.
    </>
  )
}
