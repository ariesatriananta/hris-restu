import { useEffect, useMemo } from 'react'
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
  GitBranch,
  LoaderCircle,
  RefreshCcw,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { currentListReturnTo } from '@/lib/list-return-to'
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
import {
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import {
  useExportMutationReport,
  useMutationReport,
  useMutationReportMeta,
} from './data'
import type {
  MutationChangeType,
  MutationReportItem,
  MutationReportParams,
  MutationReportPlacement,
  MutationReportStatus,
} from './domain'
import {
  dateLabel,
  defaultMutationPeriod,
  downloadBlob,
  mutationRangeError,
  numberLabel,
} from './utils'

type Search = {
  dateFrom?: string
  dateTo?: string
  filter?: string
  site?: string[]
  sourceSite?: string[]
  employeeType?: string[]
  productionSection?: string[]
  changeType?: MutationChangeType[]
  mutationStatus?: MutationReportStatus[]
  page?: number
  pageSize?: number
}

export function MutationReportPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const defaults = defaultMutationPeriod()
  const dateFrom = search.dateFrom ?? defaults.dateFrom
  const dateTo = search.dateTo ?? defaults.dateTo
  const rangeError = mutationRangeError(dateFrom, dateTo)
  const params: MutationReportParams = {
    dateFrom,
    dateTo,
    query: search.filter,
    site: search.site,
    sourceSite: search.sourceSite,
    employeeType: search.employeeType,
    productionSection: search.productionSection,
    changeType: search.changeType,
    mutationStatus: search.mutationStatus,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  }
  const result = useMutationReport(params, !rangeError)
  const meta = useMutationReportMeta(dateFrom, dateTo, !rangeError)
  const exportReport = useExportMutationReport()
  const returnTo = currentListReturnTo()
  const columns = useMemo(() => mutationColumns(returnTo), [returnTo])
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'sourceSite', searchKey: 'sourceSite', type: 'array' },
      { columnId: 'employeeType', searchKey: 'employeeType', type: 'array' },
      {
        columnId: 'productionSection',
        searchKey: 'productionSection',
        type: 'array',
      },
      { columnId: 'changeType', searchKey: 'changeType', type: 'array' },
      {
        columnId: 'mutationStatus',
        searchKey: 'mutationStatus',
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
        sourceSite: false,
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
    getRowId: (row) => `${row.recordSource}-${row.mutationUid}`,
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

  const exportExcel = () => {
    if (rangeError) return
    exportReport.mutate(
      {
        dateFrom,
        dateTo,
        query: params.query,
        site: params.site,
        sourceSite: params.sourceSite,
        employeeType: params.employeeType,
        productionSection: params.productionSection,
        changeType: params.changeType,
        mutationStatus: params.mutationStatus,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          downloadBlob(blob, fileName)
          toast.success('Laporan mutasi berhasil diunduh.')
        },
        onError: () => toast.error('Ekspor laporan mutasi gagal.'),
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
            Laporan Mutasi Karyawan
          </h1>
          <p className='text-sm text-muted-foreground'>
            Lihat perubahan penempatan yang sudah berlaku maupun masih menunggu
            jadwal.
          </p>
        </div>
        <div className='grid w-full gap-3 sm:grid-cols-3 xl:w-auto'>
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
          <div className='grid gap-1.5'>
            <span className='hidden text-sm font-medium sm:block' aria-hidden>
              &nbsp;
            </span>
            <Button
              onClick={exportExcel}
              disabled={Boolean(rangeError) || exportReport.isPending}
              className='w-full'
            >
              {exportReport.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Download />
              )}
              Ekspor Excel
            </Button>
          </div>
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
        <div className='mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5'>
          <Kpi label='Total perubahan' value={summary.total} icon={GitBranch} />
          <Kpi
            label='Sudah berlaku'
            value={summary.applied}
            icon={CheckCircle2}
          />
          <Kpi
            label='Terjadwal'
            value={summary.scheduled}
            icon={CalendarClock}
          />
          <Kpi
            label='Perlu diperbaiki'
            value={summary.failed}
            icon={AlertTriangle}
          />
          <Kpi label='Dibatalkan' value={summary.cancelled} icon={XCircle} />
        </div>
      )}

      <div className='space-y-4'>
        <div className='overflow-x-auto pb-1'>
          <div className='min-w-max sm:min-w-0'>
            <DataTableToolbar
              table={table}
              searchPlaceholder='Cari nama, nomor karyawan, atau referensi...'
              searchDebounceMs={500}
              filters={[
                {
                  columnId: 'sourceSite',
                  title: 'Site asal',
                  options: (meta.data?.sites ?? []).map(optionByCode),
                },
                {
                  columnId: 'site',
                  title: 'Site tujuan',
                  options: (meta.data?.sites ?? []).map(optionByCode),
                },
                {
                  columnId: 'employeeType',
                  title: 'Jenis karyawan tujuan',
                  options: (meta.data?.employeeTypes ?? []).map(optionByCode),
                },
                {
                  columnId: 'productionSection',
                  title: 'Bagian produksi tujuan',
                  options: (meta.data?.productionSections ?? []).map(
                    (item) => ({
                      value: item.uid,
                      label: `${item.moduleName} - ${item.name}`,
                    })
                  ),
                },
                {
                  columnId: 'changeType',
                  title: 'Jenis perubahan',
                  options: (meta.data?.changeTypes ?? []).map(optionByCode),
                },
                {
                  columnId: 'mutationStatus',
                  title: 'Status proses',
                  options: (meta.data?.mutationStatuses ?? []).map(
                    optionByCode
                  ),
                },
              ]}
            />
          </div>
        </div>
        {result.isFetching && !result.isPending && <Refreshing />}
        {result.isPending ? (
          <EmptyState text='Memuat laporan mutasi...' loading />
        ) : result.isError ? (
          <EmptyState text='Laporan mutasi gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EmptyState>
        ) : !result.data?.items.length ? (
          <EmptyState text='Tidak ada mutasi yang sesuai filter.' />
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
                <MutationCard
                  key={`${item.recordSource}-${item.mutationUid}`}
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

function mutationColumns(returnTo?: string): ColumnDef<MutationReportItem>[] {
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
            {row.original.employeeNumber}
          </p>
        </div>
      ),
      meta: { label: 'Karyawan' },
    },
    {
      accessorKey: 'effectiveDate',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Efektif' />
      ),
      cell: ({ row }) => (
        <span className='whitespace-nowrap'>
          {dateLabel(row.original.effectiveDate)}
        </span>
      ),
      meta: { label: 'Efektif' },
    },
    {
      accessorKey: 'changeType',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Perubahan' />
      ),
      cell: ({ row }) => (
        <div>
          <p>{changeTypeLabel(row.original.changeType)}</p>
          {row.original.referenceNumber && (
            <p className='text-xs text-muted-foreground'>
              Ref. {row.original.referenceNumber}
            </p>
          )}
        </div>
      ),
      filterFn: arrayFilter,
      meta: { label: 'Perubahan' },
    },
    hiddenFilterColumn('sourceSite', (item) => item.source.site?.code ?? ''),
    hiddenFilterColumn('site', (item) => item.target.site?.code ?? ''),
    hiddenFilterColumn(
      'employeeType',
      (item) => item.target.employeeType?.code ?? ''
    ),
    hiddenFilterColumn(
      'productionSection',
      (item) => item.target.productionSection?.uid ?? ''
    ),
    {
      id: 'before',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Sebelum' />
      ),
      cell: ({ row }) => <Placement placement={row.original.source} />,
      meta: { label: 'Sebelum' },
    },
    {
      id: 'after',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Sesudah' />
      ),
      cell: ({ row }) => <Placement placement={row.original.target} />,
      meta: { label: 'Sesudah' },
    },
    {
      accessorKey: 'mutationStatus',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => (
        <div>
          <StatusBadge status={row.original.mutationStatus} />
          {row.original.failureReason && (
            <p className='mt-1 max-w-56 text-xs text-destructive'>
              {row.original.failureReason}
            </p>
          )}
        </div>
      ),
      filterFn: arrayFilter,
      meta: { label: 'Status' },
    },
  ]
}

function hiddenFilterColumn(
  id: string,
  accessor: (item: MutationReportItem) => string
): ColumnDef<MutationReportItem> {
  return {
    id,
    accessorFn: accessor,
    enableHiding: true,
    filterFn: arrayFilter,
    meta: { label: id },
  }
}

function Placement({ placement }: { placement: MutationReportPlacement }) {
  return (
    <div className='min-w-36'>
      <p>{placement.site?.name ?? '-'}</p>
      <p className='text-xs text-muted-foreground'>
        {placement.employeeType?.name ?? '-'} ·{' '}
        {placement.position?.name ?? 'Tanpa jabatan'}
      </p>
      <p className='text-xs text-muted-foreground'>
        {placement.productionModule?.name ?? '-'} ·{' '}
        {placement.productionSection?.name ?? '-'}
      </p>
    </div>
  )
}

function MutationCard({
  item,
  returnTo,
}: {
  item: MutationReportItem
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
              {item.employeeNumber} · {dateLabel(item.effectiveDate)}
            </p>
          </div>
          <StatusBadge status={item.mutationStatus} />
        </div>
        <p className='mt-3 text-sm font-medium'>
          {changeTypeLabel(item.changeType)}
        </p>
        <div className='mt-3 grid gap-3 sm:grid-cols-2'>
          <div>
            <p className='mb-1 text-xs text-muted-foreground'>Sebelum</p>
            <Placement placement={item.source} />
          </div>
          <div>
            <p className='mb-1 text-xs text-muted-foreground'>Sesudah</p>
            <Placement placement={item.target} />
          </div>
        </div>
        {item.failureReason && (
          <p className='mt-3 text-sm text-destructive'>{item.failureReason}</p>
        )}
        {(item.reason || item.notes) && (
          <p className='mt-3 text-sm text-muted-foreground'>
            {item.reason ?? item.notes}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: MutationReportStatus }) {
  const variant =
    status === 'FAILED'
      ? 'destructive'
      : status === 'APPLIED'
        ? 'default'
        : 'outline'
  return <Badge variant={variant}>{mutationStatusLabel(status)}</Badge>
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
  icon: typeof GitBranch
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
  children?: React.ReactNode
}) {
  return (
    <div className='flex min-h-40 flex-col items-center justify-center gap-3 text-center text-muted-foreground'>
      {loading ? (
        <LoaderCircle className='size-5 animate-spin' />
      ) : (
        <GitBranch className='size-5' />
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

function mutationStatusLabel(status: MutationReportStatus) {
  return {
    APPLIED: 'Sudah berlaku',
    SCHEDULED: 'Terjadwal',
    FAILED: 'Perlu diperbaiki',
    CANCELLED: 'Dibatalkan',
  }[status]
}

function changeTypeLabel(changeType: MutationChangeType) {
  return {
    TRANSFER: 'Pindah site',
    PROMOTION: 'Promosi',
    DEMOTION: 'Penurunan jabatan',
    STATUS_CHANGE: 'Perubahan status kerja',
    TYPE_CHANGE: 'Perubahan jenis karyawan',
    DEPARTMENT_CHANGE: 'Perubahan departemen',
    GROUP_CHANGE: 'Perubahan kelompok kerja',
    PRODUCTION_ASSIGNMENT_CHANGE: 'Perubahan bagian produksi',
    OTHER: 'Perubahan lainnya',
  }[changeType]
}

function pageSummary(page: number, pageSize: number, total: number) {
  return (
    <>
      Menampilkan {total ? (page - 1) * pageSize + 1 : 0}–
      {Math.min(page * pageSize, total)} dari {numberLabel(total)} data.
    </>
  )
}
