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
  CalendarClock,
  CheckCircle2,
  Download,
  Eye,
  LoaderCircle,
  RefreshCcw,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
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
import {
  useExportShiftAssignmentReport,
  useShiftAssignmentReport,
  useShiftAssignmentReportMeta,
} from './data'
import type {
  ShiftAssignmentReadinessStatus,
  ShiftAssignmentReportItem,
  ShiftAssignmentReportParams,
} from './domain'
import { dateLabel, downloadBlob, localDate, numberLabel } from './utils'

type Search = {
  referenceDate?: string
  filter?: string
  site?: string[]
  employeeType?: string[]
  productionSection?: string[]
  shift?: string[]
  readinessStatus?: ShiftAssignmentReadinessStatus[]
  detailUid?: string
  page?: number
  pageSize?: number
}

export function ShiftAssignmentReportPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const referenceDate = search.referenceDate ?? localDate(new Date())
  const params: ShiftAssignmentReportParams = {
    referenceDate,
    query: search.filter,
    site: search.site,
    employeeType: search.employeeType,
    productionSection: search.productionSection,
    shift: search.shift,
    readinessStatus: search.readinessStatus,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  }
  const result = useShiftAssignmentReport(params)
  const meta = useShiftAssignmentReportMeta(referenceDate)
  const exportReport = useExportShiftAssignmentReport()
  const returnTo = currentListReturnTo()
  const showDetail = (employeeUid?: string) =>
    navigate({
      search: (previous) => ({ ...previous, detailUid: employeeUid }),
    })
  const selected = result.data?.items.find(
    (item) => item.employeeUid === search.detailUid
  )
  const columns = useMemo(
    () => shiftColumns(returnTo, showDetail),
    // navigate dari TanStack Router stabil untuk siklus hidup halaman.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      { columnId: 'shift', searchKey: 'shift', type: 'array' },
      {
        columnId: 'readinessStatus',
        searchKey: 'readinessStatus',
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
    getRowId: (row) => row.employeeUid,
  })

  useEffect(() => {
    if (!search.referenceDate) {
      navigate({
        replace: true,
        search: (previous) => ({ ...previous, referenceDate }),
      })
    }
  }, [navigate, referenceDate, search.referenceDate])

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
        referenceDate,
        query: params.query,
        site: params.site,
        employeeType: params.employeeType,
        productionSection: params.productionSection,
        shift: params.shift,
        readinessStatus: params.readinessStatus,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          downloadBlob(blob, fileName)
          toast.success('Laporan Penugasan Shift berhasil diunduh.')
        },
        onError: () => toast.error('Ekspor Laporan Penugasan Shift gagal.'),
      }
    )
  }
  const summary = result.data?.summary

  return (
    <Main>
      <div className='mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Pusat Laporan</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Laporan Penugasan Shift
          </h1>
          <p className='text-sm text-muted-foreground'>
            Periksa kesiapan shift setiap karyawan pada tanggal yang dipilih.
          </p>
        </div>
        <div className='flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto'>
          <div className='w-full sm:w-64'>
            <label className='mb-1.5 block text-sm font-medium'>
              Posisi per tanggal
            </label>
            <DatePicker
              selected={dateOnlyFromInput(referenceDate)}
              onSelect={(value) =>
                navigate({
                  search: (previous) => ({
                    ...previous,
                    referenceDate: dateOnlyToInput(value) || undefined,
                    page: undefined,
                    detailUid: undefined,
                  }),
                })
              }
              toYear={new Date().getFullYear() + 1}
            />
          </div>
          {meta.data?.canExport && (
            <Button
              onClick={exportExcel}
              disabled={exportReport.isPending || result.isPending}
              className='w-full sm:w-auto'
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

      {summary && (
        <div className='mb-4 grid grid-cols-2 gap-2 xl:grid-cols-4 2xl:grid-cols-7'>
          <Kpi label='Total karyawan' value={summary.total} icon={Users} />
          <Kpi label='Siap' value={summary.ready} icon={CheckCircle2} />
          <Kpi
            label='Perlu diperiksa'
            value={summary.attention}
            icon={AlertTriangle}
          />
          <Kpi
            label='Belum ada shift'
            value={summary.noAssignment}
            icon={CalendarClock}
          />
          <Kpi
            label='Sudah berakhir'
            value={summary.ended}
            icon={CalendarClock}
          />
          <Kpi label='Bertumpuk' value={summary.overlap} icon={XCircle} />
          <Kpi
            label='Berbeda site'
            value={summary.siteMismatch}
            icon={XCircle}
          />
        </div>
      )}

      {summary && summary.attention > 0 && (
        <Alert className='mb-4'>
          <AlertTriangle />
          <AlertTitle>Ada penugasan yang perlu diperiksa</AlertTitle>
          <AlertDescription>
            Gunakan filter Kondisi untuk melihat karyawan yang belum siap
            memakai Attendance pada tanggal acuan.
          </AlertDescription>
        </Alert>
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
                  columnId: 'shift',
                  title: 'Shift',
                  options: (meta.data?.shifts ?? []).map((item) => ({
                    value: item.uid,
                    label: item.name,
                  })),
                },
                {
                  columnId: 'readinessStatus',
                  title: 'Kondisi',
                  options: (meta.data?.readinessStatuses ?? []).map(option),
                },
              ]}
            />
          </div>
        </div>
        {result.isFetching && !result.isPending && <Refreshing />}
        {result.isPending ? (
          <EmptyState text='Memuat Laporan Penugasan Shift...' loading />
        ) : result.isError ? (
          <EmptyState text='Laporan Penugasan Shift gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EmptyState>
        ) : !result.data?.items.length ? (
          <EmptyState text='Tidak ada karyawan yang sesuai filter.' />
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
                <AssignmentCard
                  key={item.employeeUid}
                  item={item}
                  returnTo={returnTo}
                  onDetail={() => showDetail(item.employeeUid)}
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

      <AssignmentDetail
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

function shiftColumns(
  returnTo: string | undefined,
  onDetail: (uid: string) => void
): ColumnDef<ShiftAssignmentReportItem>[] {
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
    hiddenFilter('site', (item) => item.site.code),
    hiddenFilter('employeeType', (item) => item.employeeType.code),
    hiddenFilter(
      'productionSection',
      (item) => item.productionSection?.uid ?? ''
    ),
    {
      id: 'placement',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Penempatan' />
      ),
      cell: ({ row }) => (
        <div className='min-w-36'>
          <p>{row.original.site.name}</p>
          <p className='text-xs text-muted-foreground'>
            {row.original.productionSection?.name ?? 'Nonproduksi'}
          </p>
        </div>
      ),
      meta: { label: 'Penempatan' },
    },
    {
      id: 'shift',
      accessorFn: (item) => item.shift?.uid ?? '',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Shift' />
      ),
      cell: ({ row }) => <ShiftInfo item={row.original} />,
      filterFn: arrayFilter,
      meta: { label: 'Shift' },
    },
    {
      id: 'period',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Masa berlaku' />
      ),
      cell: ({ row }) => <Period item={row.original} />,
      meta: { label: 'Masa berlaku' },
    },
    {
      id: 'workDays',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Hari kerja' />
      ),
      cell: ({ row }) => (
        <span className='text-sm'>{workDaysLabel(row.original.workDays)}</span>
      ),
      meta: { label: 'Hari kerja' },
    },
    {
      accessorKey: 'readinessStatus',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Kondisi' />
      ),
      cell: ({ row }) => (
        <ReadinessBadge status={row.original.readinessStatus} />
      ),
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
          label={`Lihat rincian penugasan ${row.original.employeeName}`}
          onClick={() => onDetail(row.original.employeeUid)}
        >
          <Eye />
        </DataTableActionButton>
      ),
      meta: { label: 'Aksi' },
    },
  ]
}

function Employee({
  item,
  returnTo,
}: {
  item: ShiftAssignmentReportItem
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
      <p className='text-xs text-muted-foreground'>{item.employeeType.name}</p>
    </div>
  )
}

function ShiftInfo({ item }: { item: ShiftAssignmentReportItem }) {
  if (!item.shift)
    return <span className='text-muted-foreground'>Belum ada shift</span>
  return (
    <div className='min-w-40'>
      <p>{item.shift.name}</p>
      <p className='text-xs text-muted-foreground'>
        {item.startTime?.slice(0, 5)}-{item.endTime?.slice(0, 5)}
        {item.crossesMidnight ? ' · lintas hari' : ''}
      </p>
    </div>
  )
}

function Period({ item }: { item: ShiftAssignmentReportItem }) {
  if (!item.effectiveFrom)
    return <span className='text-muted-foreground'>-</span>
  return (
    <div className='min-w-36 text-sm'>
      <p>{dateLabel(item.effectiveFrom)}</p>
      <p className='text-xs text-muted-foreground'>
        sampai {item.effectiveTo ? dateLabel(item.effectiveTo) : 'seterusnya'}
      </p>
    </div>
  )
}

function AssignmentCard({
  item,
  returnTo,
  onDetail,
}: {
  item: ShiftAssignmentReportItem
  returnTo?: string
  onDetail: () => void
}) {
  return (
    <Card>
      <CardContent className='p-4'>
        <div className='flex items-start justify-between gap-3'>
          <Employee item={item} returnTo={returnTo} />
          <ReadinessBadge status={item.readinessStatus} />
        </div>
        <div className='mt-3 grid grid-cols-2 gap-3 text-sm'>
          <Info label='Site' value={item.site.name} />
          <Info label='Shift' value={item.shift?.name ?? 'Belum ada'} />
          <Info
            label='Jam kerja'
            value={
              item.startTime && item.endTime
                ? `${item.startTime.slice(0, 5)}-${item.endTime.slice(0, 5)}`
                : '-'
            }
          />
          <Info label='Hari kerja' value={workDaysLabel(item.workDays)} />
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

function AssignmentDetail({
  item,
  open,
  onOpenChange,
  returnTo,
}: {
  item?: ShiftAssignmentReportItem
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
              <SheetTitle>Rincian Penugasan Shift</SheetTitle>
              <SheetDescription>
                Posisi penugasan dan kesiapan Attendance pada tanggal acuan.
              </SheetDescription>
            </SheetHeader>
            <div className='space-y-5 px-4 pb-6'>
              <section className='rounded-lg border p-4'>
                <div className='flex items-start justify-between gap-3'>
                  <Employee item={item} returnTo={returnTo} />
                  <ReadinessBadge status={item.readinessStatus} />
                </div>
              </section>
              <DetailSection title='Penempatan karyawan'>
                <DetailRow label='Site' value={item.site.name} />
                <DetailRow
                  label='Jenis karyawan'
                  value={item.employeeType.name}
                />
                <DetailRow
                  label='Modul produksi'
                  value={item.productionModule?.name ?? '-'}
                />
                <DetailRow
                  label='Bagian produksi'
                  value={item.productionSection?.name ?? '-'}
                />
              </DetailSection>
              <DetailSection title='Penugasan shift'>
                <DetailRow
                  label='Shift'
                  value={item.shift?.name ?? 'Belum ada'}
                />
                <DetailRow
                  label='Site shift'
                  value={item.shiftSite?.name ?? '-'}
                />
                <DetailRow
                  label='Jam kerja'
                  value={
                    item.startTime && item.endTime
                      ? `${item.startTime.slice(0, 5)}-${item.endTime.slice(0, 5)}`
                      : '-'
                  }
                />
                <DetailRow
                  label='Berlaku mulai'
                  value={
                    item.effectiveFrom ? dateLabel(item.effectiveFrom) : '-'
                  }
                />
                <DetailRow
                  label='Berlaku sampai'
                  value={
                    item.effectiveTo
                      ? dateLabel(item.effectiveTo)
                      : item.effectiveFrom
                        ? 'Seterusnya'
                        : '-'
                  }
                />
                <DetailRow
                  label='Hari kerja'
                  value={workDaysLabel(item.workDays)}
                />
              </DetailSection>
              {item.readinessStatus !== 'READY' && (
                <Alert>
                  <AlertTriangle />
                  <AlertTitle>
                    {readinessLabel(item.readinessStatus)}
                  </AlertTitle>
                  <AlertDescription>
                    {readinessHelp(item.readinessStatus)}
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

function ReadinessBadge({
  status,
}: {
  status: ShiftAssignmentReadinessStatus
}) {
  return (
    <Badge
      variant={
        status === 'READY'
          ? 'default'
          : status === 'UPCOMING'
            ? 'outline'
            : 'destructive'
      }
    >
      {readinessLabel(status)}
    </Badge>
  )
}

function hiddenFilter(
  id: string,
  accessor: (item: ShiftAssignmentReportItem) => string
): ColumnDef<ShiftAssignmentReportItem> {
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

function option(item: { code: string; name: string }) {
  return { value: item.code, label: item.name }
}

function readinessLabel(status: ShiftAssignmentReadinessStatus) {
  return {
    READY: 'Siap digunakan',
    NO_ASSIGNMENT: 'Belum ada shift',
    ENDED: 'Sudah berakhir',
    UPCOMING: 'Belum mulai',
    OVERLAP: 'Bertumpang-tindih',
    SITE_MISMATCH: 'Berbeda site',
    SHIFT_INACTIVE: 'Shift tidak aktif',
    NO_WORK_DAYS: 'Hari kerja kosong',
    EMPLOYMENT_AMBIGUOUS: 'Riwayat kerja bermasalah',
  }[status]
}

function readinessHelp(status: ShiftAssignmentReadinessStatus) {
  return {
    READY: 'Penugasan siap digunakan.',
    NO_ASSIGNMENT: 'Karyawan belum pernah memiliki penugasan shift.',
    ENDED: 'Penugasan terakhir sudah berakhir sebelum tanggal acuan.',
    UPCOMING: 'Penugasan terdekat baru mulai setelah tanggal acuan.',
    OVERLAP:
      'Ada lebih dari satu penugasan yang berlaku pada tanggal yang sama.',
    SITE_MISMATCH: 'Site pada shift berbeda dengan site penempatan karyawan.',
    SHIFT_INACTIVE: 'Shift yang ditugaskan sedang tidak aktif.',
    NO_WORK_DAYS: 'Belum ada hari kerja yang dipilih pada penugasan ini.',
    EMPLOYMENT_AMBIGUOUS:
      'Ada lebih dari satu riwayat kerja yang berlaku pada tanggal acuan.',
  }[status]
}

function workDaysLabel(days: number[]) {
  if (!days.length) return '-'
  const labels = ['-', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
  return days.map((day) => labels[day] ?? '-').join(', ')
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
        <CalendarClock className='size-5' />
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
