import { useEffect, useMemo, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileCheck2,
  LoaderCircle,
  RefreshCcw,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { currentListReturnTo } from '@/lib/list-return-to'
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
import { hasPermission } from '@/features/auth/permissions'
import {
  useAttendanceClassificationReport,
  useAttendanceClassificationReportMeta,
  useExportAttendanceClassificationReport,
} from './data'
import type {
  AttendanceClassificationApprovalStatus,
  AttendanceClassificationReportItem,
  AttendanceClassificationReportParams,
  AttendanceClassificationType,
} from './domain'
import {
  attendanceClassificationRangeError,
  dateLabel,
  defaultAttendanceClassificationPeriod,
  downloadBlob,
  numberLabel,
} from './utils'

type Search = {
  dateFrom?: string
  dateTo?: string
  filter?: string
  site?: string[]
  employeeType?: string[]
  productionSection?: string[]
  classificationType?: AttendanceClassificationType[]
  approvalStatus?: AttendanceClassificationApprovalStatus[]
  page?: number
  pageSize?: number
  detailUid?: string
}

export function AttendanceClassificationReportPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const defaults = defaultAttendanceClassificationPeriod()
  const dateFrom = search.dateFrom ?? defaults.dateFrom
  const dateTo = search.dateTo ?? defaults.dateTo
  const rangeError = attendanceClassificationRangeError(dateFrom, dateTo)
  const params: AttendanceClassificationReportParams = {
    dateFrom,
    dateTo,
    query: search.filter,
    site: search.site,
    employeeType: search.employeeType,
    productionSection: search.productionSection,
    classificationType: search.classificationType,
    approvalStatus: search.approvalStatus,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  }
  const result = useAttendanceClassificationReport(params, !rangeError)
  const meta = useAttendanceClassificationReportMeta(
    dateFrom,
    dateTo,
    !rangeError
  )
  const exportReport = useExportAttendanceClassificationReport()
  const session = useAuthStore((state) => state.session)
  const canExport = hasPermission(session, 'attendance.export')
  const returnTo = currentListReturnTo()
  const showDetail = (detailUid?: string) =>
    navigate({ search: (previous) => ({ ...previous, detailUid }) })
  const columns = useMemo(
    () => classificationColumns(returnTo, showDetail),
    // Navigate stabil dari TanStack Router; returnTo mengikuti URL aktif.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, returnTo]
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
        columnId: 'classificationType',
        searchKey: 'classificationType',
        type: 'array',
      },
      {
        columnId: 'approvalStatus',
        searchKey: 'approvalStatus',
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
    initialState: {
      columnVisibility: {
        site: false,
        employeeType: false,
        productionSection: false,
      },
    },
    pageCount: Math.max(
      1,
      Math.ceil((result.data?.total ?? 0) / (result.data?.pageSize ?? 50))
    ),
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.classificationUid,
  })

  useEffect(() => {
    if (search.dateFrom && search.dateTo) return
    navigate({
      replace: true,
      search: (previous) => ({ ...previous, dateFrom, dateTo }),
    })
  }, [dateFrom, dateTo, navigate, search.dateFrom, search.dateTo])

  useEffect(() => {
    if (result.data) {
      url.ensurePageInRange(
        Math.max(1, Math.ceil(result.data.total / result.data.pageSize))
      )
    }
  }, [result.data, url])

  const selected = result.data?.items.find(
    (item) => item.classificationUid === search.detailUid
  )
  const exportExcel = () => {
    if (rangeError || !canExport) return
    exportReport.mutate(
      {
        dateFrom,
        dateTo,
        query: params.query,
        site: params.site,
        employeeType: params.employeeType,
        productionSection: params.productionSection,
        classificationType: params.classificationType,
        approvalStatus: params.approvalStatus,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          downloadBlob(blob, fileName)
          toast.success('Laporan Cuti, Sakit & Izin berhasil diunduh.')
        },
        onError: () => toast.error('Ekspor laporan Cuti, Sakit & Izin gagal.'),
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
            Laporan Cuti, Sakit & Izin
          </h1>
          <p className='text-sm text-muted-foreground'>
            Pantau pengajuan dan hasil penerapannya tanpa membuka dokumen
            pribadi karyawan.
          </p>
        </div>
        <div className='grid w-full gap-3 sm:grid-cols-3 xl:w-auto'>
          <DateField
            label='Mulai periode'
            value={dateFrom}
            onChange={(value) => updateDate(navigate, 'dateFrom', value)}
          />
          <DateField
            label='Sampai periode'
            value={dateTo}
            onChange={(value) => updateDate(navigate, 'dateTo', value)}
          />
          {canExport && (
            <div className='grid gap-1.5'>
              <span className='hidden text-sm font-medium sm:block' aria-hidden>
                &nbsp;
              </span>
              <Button
                className='w-full'
                onClick={exportExcel}
                disabled={Boolean(rangeError) || exportReport.isPending}
              >
                {exportReport.isPending ? (
                  <LoaderCircle className='animate-spin' />
                ) : (
                  <Download />
                )}
                Ekspor Excel
              </Button>
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

      {summary && (
        <div className='mb-4 grid grid-cols-2 gap-2 xl:grid-cols-5'>
          <Kpi
            label='Total pengajuan'
            value={summary.total}
            icon={FileCheck2}
          />
          <Kpi label='Menunggu' value={summary.pending} icon={Clock3} />
          <Kpi label='Disetujui' value={summary.approved} icon={CheckCircle2} />
          <Kpi label='Ditolak' value={summary.rejected} icon={XCircle} />
          <Kpi
            label='Hari diterapkan'
            value={summary.appliedDays}
            icon={CalendarDays}
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
                  options: (meta.data?.sites ?? []).map(optionByCode),
                },
                {
                  columnId: 'employeeType',
                  title: 'Jenis karyawan',
                  options: (meta.data?.employeeTypes ?? []).map(optionByCode),
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
                  columnId: 'classificationType',
                  title: 'Jenis pengajuan',
                  options: (meta.data?.classificationTypes ?? []).map(
                    optionByCode
                  ),
                },
                {
                  columnId: 'approvalStatus',
                  title: 'Status',
                  options: (meta.data?.approvalStatuses ?? []).map(
                    optionByCode
                  ),
                },
              ]}
            />
          </div>
        </div>

        {result.isFetching && !result.isPending && <Refreshing />}
        {result.isPending ? (
          <EmptyState text='Memuat laporan Cuti, Sakit & Izin...' loading />
        ) : result.isError ? (
          <EmptyState text='Laporan Cuti, Sakit & Izin gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EmptyState>
        ) : !result.data?.items.length ? (
          <EmptyState text='Tidak ada pengajuan yang sesuai filter.' />
        ) : (
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
              {result.data.items.map((item) => (
                <ClassificationCard
                  key={item.classificationUid}
                  item={item}
                  returnTo={returnTo}
                  onDetail={() => showDetail(item.classificationUid)}
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

      <ClassificationDetailSheet
        item={selected}
        returnTo={returnTo}
        open={Boolean(search.detailUid && selected)}
        onOpenChange={(open) => {
          if (!open) showDetail(undefined)
        }}
      />
    </Main>
  )
}

function classificationColumns(
  returnTo: string | undefined,
  onDetail: (uid: string) => void
): ColumnDef<AttendanceClassificationReportItem>[] {
  return [
    {
      accessorKey: 'employeeName',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Karyawan' />
      ),
      cell: ({ row }) => <Employee item={row.original} returnTo={returnTo} />,
      meta: { label: 'Karyawan' },
    },
    hiddenFilterColumn('site', (item) => item.site.code),
    hiddenFilterColumn('employeeType', (item) => item.employeeType?.code ?? ''),
    hiddenFilterColumn(
      'productionSection',
      (item) => item.productionSection?.uid ?? ''
    ),
    {
      accessorKey: 'classificationType',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Jenis pengajuan' />
      ),
      cell: ({ row }) => (
        <Badge variant='secondary'>
          {classificationTypeLabel(row.original.classificationType)}
        </Badge>
      ),
      filterFn: arrayFilter,
      meta: { label: 'Jenis pengajuan' },
    },
    {
      accessorKey: 'startDate',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Tanggal' />
      ),
      cell: ({ row }) => <Period item={row.original} />,
      meta: { label: 'Tanggal' },
    },
    {
      id: 'placement',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Penempatan' />
      ),
      cell: ({ row }) => <Placement item={row.original} />,
      meta: { label: 'Penempatan' },
    },
    {
      accessorKey: 'approvalStatus',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => <StatusBadge status={row.original.approvalStatus} />,
      filterFn: arrayFilter,
      meta: { label: 'Status' },
    },
    {
      id: 'outcomes',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Penerapan' />
      ),
      cell: ({ row }) => <OutcomeSummary item={row.original} />,
      meta: { label: 'Penerapan' },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      header: () => <span className='sr-only'>Aksi</span>,
      cell: ({ row }) => (
        <DataTableActionButton
          label={`Lihat rincian pengajuan ${row.original.employeeName}`}
          onClick={() => onDetail(row.original.classificationUid)}
        >
          <Eye />
        </DataTableActionButton>
      ),
      meta: { label: 'Aksi' },
    },
  ]
}

function hiddenFilterColumn(
  id: string,
  accessor: (item: AttendanceClassificationReportItem) => string
): ColumnDef<AttendanceClassificationReportItem> {
  return {
    id,
    accessorFn: accessor,
    enableHiding: true,
    filterFn: arrayFilter,
    meta: { label: id },
  }
}

function Employee({
  item,
  returnTo,
}: {
  item: AttendanceClassificationReportItem
  returnTo?: string
}) {
  return (
    <div className='min-w-44'>
      <Link
        to='/karyawan/data-karyawan/$employeeUid'
        params={{ employeeUid: item.employeeUid }}
        search={{ returnTo }}
        className='font-medium hover:underline'
      >
        {item.employeeName}
      </Link>
      <p className='text-xs text-muted-foreground'>{item.employeeNumber}</p>
      <p className='text-xs text-muted-foreground'>
        {item.employeeType?.name ?? 'Jenis karyawan tidak ditemukan'}
      </p>
    </div>
  )
}

function Period({ item }: { item: AttendanceClassificationReportItem }) {
  return (
    <div className='min-w-36'>
      <p className='whitespace-nowrap'>
        {dateLabel(item.startDate)}
        {item.startDate !== item.endDate && `–${dateLabel(item.endDate)}`}
      </p>
      <p className='text-xs text-muted-foreground'>
        {numberLabel(item.calendarDays)} hari kalender
      </p>
    </div>
  )
}

function Placement({ item }: { item: AttendanceClassificationReportItem }) {
  return (
    <div className='min-w-36'>
      <p>{item.site.name}</p>
      <p className='text-xs text-muted-foreground'>
        {item.productionModule?.name ?? 'Nonproduksi'}
        {item.productionSection ? ` · ${item.productionSection.name}` : ''}
      </p>
      {item.historyStatus !== 'VALID' && (
        <p className='text-xs text-amber-700 dark:text-amber-400'>
          Penempatan perlu diperiksa
        </p>
      )}
    </div>
  )
}

function OutcomeSummary({
  item,
}: {
  item: AttendanceClassificationReportItem
}) {
  const { outcomes } = item
  return (
    <div className='min-w-32 text-sm'>
      <p>{numberLabel(outcomes.applied)} hari diterapkan</p>
      {(outcomes.skipped > 0 || outcomes.reversed > 0) && (
        <p className='text-xs text-muted-foreground'>
          {outcomes.skipped > 0 && `${numberLabel(outcomes.skipped)} dilewati`}
          {outcomes.skipped > 0 && outcomes.reversed > 0 ? ' · ' : ''}
          {outcomes.reversed > 0 &&
            `${numberLabel(outcomes.reversed)} dibatalkan`}
        </p>
      )}
      {outcomes.pending > 0 && (
        <p className='text-xs text-amber-700 dark:text-amber-400'>
          {numberLabel(outcomes.pending)} menunggu
        </p>
      )}
    </div>
  )
}

function ClassificationCard({
  item,
  returnTo,
  onDetail,
}: {
  item: AttendanceClassificationReportItem
  returnTo?: string
  onDetail: () => void
}) {
  return (
    <Card>
      <CardContent className='p-4'>
        <div className='flex items-start justify-between gap-3'>
          <Employee item={item} returnTo={returnTo} />
          <StatusBadge status={item.approvalStatus} />
        </div>
        <div className='mt-3 flex flex-wrap items-center gap-2'>
          <Badge variant='secondary'>
            {classificationTypeLabel(item.classificationType)}
          </Badge>
          <span className='text-sm text-muted-foreground'>
            {dateLabel(item.startDate)}
            {item.startDate !== item.endDate && `–${dateLabel(item.endDate)}`}
          </span>
        </div>
        <div className='mt-3 grid grid-cols-2 gap-2 rounded-md bg-muted/50 p-3 text-sm'>
          <div>
            <p className='text-xs text-muted-foreground'>Penempatan</p>
            <p className='font-medium'>{item.site.name}</p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>Penerapan</p>
            <p className='font-medium'>{item.outcomes.applied} hari</p>
          </div>
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

function ClassificationDetailSheet({
  item,
  open,
  onOpenChange,
  returnTo,
}: {
  item?: AttendanceClassificationReportItem
  open: boolean
  onOpenChange: (open: boolean) => void
  returnTo?: string
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
        {item && (
          <>
            <SheetHeader>
              <SheetTitle>Rincian pengajuan Attendance</SheetTitle>
              <SheetDescription>
                Informasi proses dan hasil penerapan pengajuan.
              </SheetDescription>
            </SheetHeader>
            <div className='space-y-5 px-4 pb-6'>
              <section className='rounded-lg border p-4'>
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
                    <p className='text-sm text-muted-foreground'>
                      {item.employeeNumber} · {item.site.name}
                    </p>
                  </div>
                  <StatusBadge status={item.approvalStatus} />
                </div>
              </section>

              <DetailSection title='Pengajuan'>
                <DetailRow
                  label='Jenis'
                  value={classificationTypeLabel(item.classificationType)}
                />
                <DetailRow
                  label='Tanggal'
                  value={`${dateLabel(item.startDate)}${item.startDate === item.endDate ? '' : `–${dateLabel(item.endDate)}`}`}
                />
                <DetailRow
                  label='Durasi'
                  value={`${numberLabel(item.calendarDays)} hari kalender`}
                />
                <DetailRow label='Diajukan oleh' value={item.requestedByName} />
                <DetailRow
                  label='Waktu pengajuan'
                  value={dateTimeLabel(item.requestedAt)}
                />
              </DetailSection>

              <DetailSection title='Pemeriksaan'>
                <DetailRow
                  label='Status'
                  value={approvalStatusLabel(item.approvalStatus)}
                />
                {item.reviewedByName && (
                  <DetailRow
                    label='Diperiksa oleh'
                    value={item.reviewedByName}
                  />
                )}
                {item.reviewedAt && (
                  <DetailRow
                    label='Waktu pemeriksaan'
                    value={dateTimeLabel(item.reviewedAt)}
                  />
                )}
                {item.cancelledByName && (
                  <DetailRow
                    label='Dibatalkan oleh'
                    value={item.cancelledByName}
                  />
                )}
                {item.cancelledAt && (
                  <DetailRow
                    label='Waktu pembatalan'
                    value={dateTimeLabel(item.cancelledAt)}
                  />
                )}
              </DetailSection>

              <DetailSection title='Hasil penerapan'>
                <DetailRow label='Total tanggal' value={item.outcomes.total} />
                <DetailRow label='Diterapkan' value={item.outcomes.applied} />
                <DetailRow label='Menunggu' value={item.outcomes.pending} />
                <DetailRow label='Dilewati' value={item.outcomes.skipped} />
                <DetailRow label='Dibatalkan' value={item.outcomes.reversed} />
              </DetailSection>

              <Alert>
                <FileCheck2 />
                <AlertTitle>Privasi tetap dijaga</AlertTitle>
                <AlertDescription>
                  Alasan, catatan pemeriksaan, dan dokumen pribadi tidak
                  ditampilkan di laporan ini.
                </AlertDescription>
              </Alert>
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

function StatusBadge({
  status,
}: {
  status: AttendanceClassificationApprovalStatus
}) {
  const variant =
    status === 'REJECTED'
      ? 'destructive'
      : status === 'APPROVED'
        ? 'default'
        : 'outline'
  return <Badge variant={variant}>{approvalStatusLabel(status)}</Badge>
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
        <FileCheck2 className='size-5' />
      )}
      <p>{text}</p>
      {children}
    </div>
  )
}

function optionByCode(item: { code: string; name: string }) {
  return { value: item.code, label: item.name }
}

function arrayFilter(
  row: { getValue: (id: string) => unknown },
  id: string,
  value: string[]
) {
  return value.includes(String(row.getValue(id)))
}

function classificationTypeLabel(type: AttendanceClassificationType) {
  return { LEAVE: 'Cuti', SICK: 'Sakit', PERMISSION: 'Izin' }[type]
}

function approvalStatusLabel(status: AttendanceClassificationApprovalStatus) {
  return {
    PENDING: 'Menunggu',
    APPROVED: 'Disetujui',
    REJECTED: 'Ditolak',
    CANCELLED: 'Dibatalkan',
  }[status]
}

function dateTimeLabel(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function pageSummary(page: number, pageSize: number, total: number) {
  return (
    <>
      Menampilkan {total ? (page - 1) * pageSize + 1 : 0}–
      {Math.min(page * pageSize, total)} dari {numberLabel(total)} data.
    </>
  )
}
