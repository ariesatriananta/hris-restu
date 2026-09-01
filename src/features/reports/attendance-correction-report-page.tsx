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
  Ban,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FilePenLine,
  LoaderCircle,
  RefreshCcw,
  RotateCcw,
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
  useAttendanceCorrectionReport,
  useAttendanceCorrectionReportMeta,
  useExportAttendanceCorrectionReport,
} from './data'
import type {
  AttendanceCorrectionApprovalStatus,
  AttendanceCorrectionReportItem,
  AttendanceCorrectionReportParams,
  AttendanceCorrectionType,
} from './domain'
import {
  attendanceCorrectionRangeError,
  dateLabel,
  defaultAttendanceCorrectionPeriod,
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
  correctionType?: AttendanceCorrectionType[]
  approvalStatus?: AttendanceCorrectionApprovalStatus[]
  page?: number
  pageSize?: number
  detailUid?: string
}

export function AttendanceCorrectionReportPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const defaults = defaultAttendanceCorrectionPeriod()
  const dateFrom = search.dateFrom ?? defaults.dateFrom
  const dateTo = search.dateTo ?? defaults.dateTo
  const rangeError = attendanceCorrectionRangeError(dateFrom, dateTo)
  const params: AttendanceCorrectionReportParams = {
    dateFrom,
    dateTo,
    query: search.filter,
    site: search.site,
    employeeType: search.employeeType,
    productionSection: search.productionSection,
    correctionType: search.correctionType,
    approvalStatus: search.approvalStatus,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  }
  const result = useAttendanceCorrectionReport(params, !rangeError)
  const meta = useAttendanceCorrectionReportMeta(dateFrom, dateTo, !rangeError)
  const exportReport = useExportAttendanceCorrectionReport()
  const session = useAuthStore((state) => state.session)
  const canExport = hasPermission(session, 'attendance.export')
  const returnTo = currentListReturnTo()
  const showDetail = (detailUid?: string) =>
    navigate({ search: (previous) => ({ ...previous, detailUid }) })
  const columns = useMemo(
    () => correctionColumns(returnTo, showDetail),
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
        columnId: 'correctionType',
        searchKey: 'correctionType',
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
    getRowId: (row) => row.correctionUid,
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
    (item) => item.correctionUid === search.detailUid
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
        correctionType: params.correctionType,
        approvalStatus: params.approvalStatus,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          downloadBlob(blob, fileName)
          toast.success('Laporan Koreksi Attendance berhasil diunduh.')
        },
        onError: () => toast.error('Ekspor laporan Koreksi Attendance gagal.'),
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
            Laporan Koreksi Attendance
          </h1>
          <p className='text-sm text-muted-foreground'>
            Telusuri perubahan jam dan status kehadiran beserta hasil
            pemeriksaannya.
          </p>
        </div>
        <div className='grid w-full gap-3 sm:grid-cols-3 xl:w-auto'>
          <DateField
            label='Mulai tanggal kerja'
            value={dateFrom}
            onChange={(value) => updateDate(navigate, 'dateFrom', value)}
          />
          <DateField
            label='Sampai tanggal kerja'
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
        <div className='mb-4 grid grid-cols-2 gap-2 xl:grid-cols-6'>
          <Kpi label='Total koreksi' value={summary.total} icon={FilePenLine} />
          <Kpi label='Menunggu' value={summary.pending} icon={Clock3} />
          <Kpi label='Disetujui' value={summary.approved} icon={CheckCircle2} />
          <Kpi label='Ditolak' value={summary.rejected} icon={XCircle} />
          <Kpi label='Dibatalkan' value={summary.cancelled} icon={Ban} />
          <Kpi
            label='Sudah diterapkan'
            value={summary.applied}
            icon={RotateCcw}
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
                  columnId: 'correctionType',
                  title: 'Jenis koreksi',
                  options: (meta.data?.correctionTypes ?? []).map(optionByCode),
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
          <EmptyState text='Memuat laporan Koreksi Attendance...' loading />
        ) : result.isError ? (
          <EmptyState text='Laporan Koreksi Attendance gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EmptyState>
        ) : !result.data?.items.length ? (
          <EmptyState text='Tidak ada koreksi yang sesuai filter.' />
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
                <CorrectionCard
                  key={item.correctionUid}
                  item={item}
                  returnTo={returnTo}
                  onDetail={() => showDetail(item.correctionUid)}
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

      <CorrectionDetailSheet
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

function correctionColumns(
  returnTo: string | undefined,
  onDetail: (uid: string) => void
): ColumnDef<AttendanceCorrectionReportItem>[] {
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
      accessorKey: 'businessDate',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Tanggal kerja' />
      ),
      cell: ({ row }) => (
        <div className='min-w-32'>
          <p>{dateLabel(row.original.businessDate)}</p>
          <p className='text-xs text-muted-foreground'>
            {row.original.site.name}
          </p>
        </div>
      ),
      meta: { label: 'Tanggal kerja' },
    },
    {
      accessorKey: 'correctionType',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Jenis koreksi' />
      ),
      cell: ({ row }) => (
        <Badge variant='secondary'>
          {correctionTypeLabel(row.original.correctionType)}
        </Badge>
      ),
      filterFn: arrayFilter,
      meta: { label: 'Jenis koreksi' },
    },
    {
      id: 'changes',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Perubahan' />
      ),
      cell: ({ row }) => <ChangeSummary item={row.original} />,
      meta: { label: 'Perubahan' },
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
      id: 'request',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Pengajuan' />
      ),
      cell: ({ row }) => (
        <div className='min-w-40 text-sm'>
          <p>{row.original.requestedByName}</p>
          <p className='text-xs text-muted-foreground'>
            {dateTimeLabel(row.original.requestedAt)}
          </p>
        </div>
      ),
      meta: { label: 'Pengajuan' },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      header: () => <span className='sr-only'>Aksi</span>,
      cell: ({ row }) => (
        <DataTableActionButton
          label={`Lihat rincian koreksi ${row.original.employeeName}`}
          onClick={() => onDetail(row.original.correctionUid)}
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
  accessor: (item: AttendanceCorrectionReportItem) => string
): ColumnDef<AttendanceCorrectionReportItem> {
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
  item: AttendanceCorrectionReportItem
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

function ChangeSummary({ item }: { item: AttendanceCorrectionReportItem }) {
  const rows = relevantChanges(item)
  return (
    <div className='min-w-48 space-y-1 text-sm'>
      {rows.map((change) => (
        <p key={change.label}>
          <span className='text-xs text-muted-foreground'>
            {change.label}:{' '}
          </span>
          <span className='line-through opacity-70'>{change.before}</span>
          <span aria-hidden> → </span>
          <span className='font-medium'>{change.after}</span>
        </p>
      ))}
    </div>
  )
}

function CorrectionCard({
  item,
  returnTo,
  onDetail,
}: {
  item: AttendanceCorrectionReportItem
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
            {correctionTypeLabel(item.correctionType)}
          </Badge>
          <span className='text-sm text-muted-foreground'>
            {dateLabel(item.businessDate)} · {item.site.name}
          </span>
        </div>
        <div className='mt-3 rounded-md bg-muted/50 p-3'>
          <ChangeSummary item={item} />
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

function CorrectionDetailSheet({
  item,
  open,
  onOpenChange,
  returnTo,
}: {
  item?: AttendanceCorrectionReportItem
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
              <SheetTitle>Rincian Koreksi Attendance</SheetTitle>
              <SheetDescription>
                Data sebelum dan sesudah koreksi serta alur pemeriksaannya.
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

              <DetailSection title='Koreksi'>
                <DetailRow
                  label='Tanggal kerja'
                  value={dateLabel(item.businessDate)}
                />
                <DetailRow
                  label='Jenis koreksi'
                  value={correctionTypeLabel(item.correctionType)}
                />
                <DetailRow label='Site' value={item.site.name} />
                <DetailRow
                  label='Bagian produksi'
                  value={
                    item.productionSection
                      ? `${item.productionModule?.name ?? ''} - ${item.productionSection.name}`
                      : 'Nonproduksi'
                  }
                />
              </DetailSection>

              <DetailSection title='Data yang berubah'>
                {relevantChanges(item).map((change) => (
                  <div key={change.label} className='py-3 text-sm'>
                    <p className='mb-2 font-medium'>{change.label}</p>
                    <div className='grid grid-cols-2 gap-3'>
                      <div className='rounded-md bg-muted/50 p-2.5'>
                        <p className='text-xs text-muted-foreground'>Sebelum</p>
                        <p className='mt-1 break-words'>{change.before}</p>
                      </div>
                      <div className='rounded-md border border-primary/20 bg-primary/5 p-2.5'>
                        <p className='text-xs text-muted-foreground'>Sesudah</p>
                        <p className='mt-1 font-medium break-words'>
                          {change.after}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </DetailSection>

              <DetailSection title='Proses pemeriksaan'>
                <DetailRow
                  label='Status'
                  value={approvalStatusLabel(item.approvalStatus)}
                />
                <DetailRow label='Diajukan oleh' value={item.requestedByName} />
                <DetailRow
                  label='Waktu pengajuan'
                  value={dateTimeLabel(item.requestedAt)}
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
                {item.appliedAt && (
                  <DetailRow
                    label='Diterapkan ke Attendance'
                    value={dateTimeLabel(item.appliedAt)}
                  />
                )}
              </DetailSection>

              {item.historyStatus !== 'VALID' && (
                <Alert>
                  <AlertTriangle />
                  <AlertTitle>Penempatan perlu diperiksa</AlertTitle>
                  <AlertDescription>
                    Histori kerja pada tanggal ini tidak ditemukan atau lebih
                    dari satu. Data koreksi tetap ditampilkan tanpa menebak
                    penempatan karyawan.
                  </AlertDescription>
                </Alert>
              )}

              <Button variant='outline' className='w-full' asChild>
                <Link
                  to='/attendance/monitoring-harian'
                  search={{
                    businessDate: item.businessDate,
                    filter: item.employeeNumber,
                    site: [item.site.code as 'JEPARA' | 'SEMARANG' | 'KLATEN'],
                  }}
                >
                  Buka Monitoring Harian
                </Link>
              </Button>
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
  status: AttendanceCorrectionApprovalStatus
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
        <FilePenLine className='size-5' />
      )}
      <p>{text}</p>
      {children}
    </div>
  )
}

function relevantChanges(item: AttendanceCorrectionReportItem) {
  const rows: Array<{ label: string; before: string; after: string }> = []
  if (item.correctionType === 'CLOCK_IN' || item.correctionType === 'BOTH') {
    rows.push({
      label: 'Jam masuk',
      before: timeLabel(item.changes.clockIn.before),
      after: timeLabel(item.changes.clockIn.after),
    })
  }
  if (item.correctionType === 'CLOCK_OUT' || item.correctionType === 'BOTH') {
    rows.push({
      label: 'Jam pulang',
      before: timeLabel(item.changes.clockOut.before),
      after: timeLabel(item.changes.clockOut.after),
    })
  }
  if (item.correctionType === 'STATUS') {
    rows.push({
      label: 'Status kehadiran',
      before: attendanceStatusLabel(item.changes.status.before),
      after: attendanceStatusLabel(item.changes.status.after),
    })
  }
  return rows
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

function correctionTypeLabel(type: AttendanceCorrectionType) {
  return {
    CLOCK_IN: 'Jam masuk',
    CLOCK_OUT: 'Jam pulang',
    BOTH: 'Jam masuk & pulang',
    STATUS: 'Status kehadiran',
  }[type]
}

function approvalStatusLabel(status: AttendanceCorrectionApprovalStatus) {
  return {
    PENDING: 'Menunggu',
    APPROVED: 'Disetujui',
    REJECTED: 'Ditolak',
    CANCELLED: 'Dibatalkan',
  }[status]
}

function attendanceStatusLabel(status: string | null) {
  if (!status) return 'Belum ada'
  return (
    {
      PRESENT: 'Hadir',
      ABSENT: 'Alpha',
      LEAVE: 'Cuti',
      SICK: 'Sakit',
      PERMISSION: 'Izin',
      HOLIDAY: 'Libur',
    }[status] ?? status
  )
}

function timeLabel(value: string | null) {
  if (!value) return 'Belum ada'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
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
