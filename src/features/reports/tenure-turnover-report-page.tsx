import { useEffect, useMemo, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  Download,
  Eye,
  LoaderCircle,
  Percent,
  RefreshCcw,
  Timer,
  TriangleAlert,
  UserMinus,
  UserPlus,
  Users,
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
  useExportTenureTurnoverReport,
  useTenureTurnoverReport,
  useTenureTurnoverReportMeta,
} from './data'
import type {
  TenureBand,
  TenureTurnoverReportItem,
  TenureTurnoverReportParams,
  TenureTurnoverView,
} from './domain'
import {
  dateLabel,
  defaultTenureTurnoverPeriod,
  downloadBlob,
  numberLabel,
  tenureTurnoverRangeError,
} from './utils'

type Search = {
  dateFrom?: string
  dateTo?: string
  filter?: string
  site?: string[]
  employeeType?: string[]
  productionSection?: string[]
  tenureBand?: TenureBand[]
  view?: TenureTurnoverView
  detailUid?: string
  page?: number
  pageSize?: number
}

export function TenureTurnoverReportPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const defaults = defaultTenureTurnoverPeriod()
  const dateFrom = search.dateFrom ?? defaults.dateFrom
  const dateTo = search.dateTo ?? defaults.dateTo
  const view = search.view ?? 'TENURE'
  const rangeError = tenureTurnoverRangeError(dateFrom, dateTo)
  const params: TenureTurnoverReportParams = {
    dateFrom,
    dateTo,
    query: search.filter,
    site: search.site,
    employeeType: search.employeeType,
    productionSection: search.productionSection,
    tenureBand: search.tenureBand,
    view,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  }
  const result = useTenureTurnoverReport(params, !rangeError)
  const meta = useTenureTurnoverReportMeta(
    dateFrom,
    dateTo,
    search.site,
    !rangeError
  )
  const exportReport = useExportTenureTurnoverReport()
  const showDetail = (item?: TenureTurnoverReportItem) =>
    navigate({
      search: (previous) => ({
        ...previous,
        detailUid: item?.recordUid,
      }),
    })
  const selected = result.data?.items.find(
    (item) => item.recordUid === search.detailUid
  )
  const columns = useMemo(
    () => reportColumns(view, showDetail),
    // navigate stabil selama route aktif.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view]
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
      { columnId: 'tenureBand', searchKey: 'tenureBand', type: 'array' },
    ],
  })
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
    getRowId: (row) => row.recordUid,
  })

  useEffect(() => {
    if (!search.dateFrom || !search.dateTo || !search.view) {
      navigate({
        replace: true,
        search: (previous) => ({
          ...previous,
          dateFrom,
          dateTo,
          view,
        }),
      })
    }
  }, [
    dateFrom,
    dateTo,
    navigate,
    search.dateFrom,
    search.dateTo,
    search.view,
    view,
  ])
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
        employeeType: params.employeeType,
        productionSection: params.productionSection,
        tenureBand: params.tenureBand,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          downloadBlob(blob, fileName)
          toast.success('Laporan masa kerja dan turnover berhasil diunduh.')
        },
        onError: () =>
          toast.error('Ekspor laporan masa kerja dan turnover gagal.'),
      }
    )
  }
  const summary = result.data?.summary
  const hasAmbiguous = Boolean(
    summary && (summary.ambiguousOpening || summary.ambiguousClosing)
  )

  return (
    <Main>
      <div className='mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Pusat Laporan</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Laporan Masa Kerja & Turnover Karyawan
          </h1>
          <p className='text-sm text-muted-foreground'>
            Pantau lama bekerja karyawan aktif dan tingkat resign dalam periode.
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
              disabled={Boolean(rangeError) || exportReport.isPending}
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
          <TriangleAlert />
          <AlertTitle>Periode belum valid</AlertTitle>
          <AlertDescription>{rangeError}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <div className='mb-4 grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-6'>
          <Kpi
            label='Aktif awal'
            value={numberLabel(summary.openingHeadcount)}
            icon={Users}
          />
          <Kpi
            label='Karyawan masuk'
            value={numberLabel(summary.joined)}
            icon={UserPlus}
          />
          <Kpi
            label='Resign'
            value={numberLabel(summary.resigned)}
            icon={UserMinus}
          />
          <Kpi
            label='Aktif akhir'
            value={numberLabel(summary.closingHeadcount)}
            icon={Users}
          />
          <Kpi
            label='Rata-rata masa kerja'
            value={tenureLabel(summary.averageTenureMonths)}
            icon={Timer}
          />
          <Kpi
            label='Turnover'
            value={`${summary.turnoverRate.toFixed(2)}%`}
            icon={Percent}
          />
        </div>
      )}

      {hasAmbiguous && summary && (
        <Alert variant='destructive' className='mb-4'>
          <TriangleAlert />
          <AlertTitle>Ada histori kerja yang perlu diperiksa</AlertTitle>
          <AlertDescription>
            {numberLabel(summary.ambiguousOpening)} karyawan bermasalah pada
            awal periode dan {numberLabel(summary.ambiguousClosing)} pada akhir
            periode. Data tersebut tidak dimasukkan ke jumlah aktif.
          </AlertDescription>
        </Alert>
      )}

      <Alert className='mb-4'>
        <Percent />
        <AlertTitle>Cara membaca turnover</AlertTitle>
        <AlertDescription>
          Turnover dihitung dari jumlah karyawan resign dalam periode dibagi
          rata-rata jumlah karyawan aktif pada awal dan akhir periode. Masa
          kerja dihitung sejak tanggal bergabung sampai tanggal akhir periode
          atau tanggal resign.
        </AlertDescription>
      </Alert>

      <div className='mb-4 grid grid-cols-2 rounded-lg bg-muted p-1 sm:w-fit'>
        <ViewButton
          active={view === 'TENURE'}
          onClick={() => changeView(navigate, 'TENURE')}
        >
          Masa Kerja Aktif
        </ViewButton>
        <ViewButton
          active={view === 'TURNOVER'}
          onClick={() => changeView(navigate, 'TURNOVER')}
        >
          Karyawan Resign
        </ViewButton>
      </div>

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
                  columnId: 'tenureBand',
                  title: 'Masa kerja',
                  options: (meta.data?.tenureBands ?? []).map(option),
                },
              ]}
            />
          </div>
        </div>
        {result.isFetching && !result.isPending && <Refreshing />}
        {result.isPending && !rangeError ? (
          <EmptyState text='Memuat laporan masa kerja...' loading />
        ) : result.isError ? (
          <EmptyState text='Laporan masa kerja dan turnover gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EmptyState>
        ) : !rangeError && !result.data?.items.length ? (
          <EmptyState
            text={
              view === 'TENURE'
                ? 'Tidak ada karyawan aktif yang sesuai filter.'
                : 'Tidak ada karyawan resign yang sesuai filter.'
            }
          />
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
                <EmployeeCard
                  key={item.recordUid}
                  item={item}
                  view={view}
                  onDetail={() => showDetail(item)}
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

      <EmployeeDetail
        item={selected}
        view={view}
        open={Boolean(search.detailUid)}
        onOpenChange={(open) => !open && showDetail(undefined)}
      />
    </Main>
  )
}

function reportColumns(
  view: TenureTurnoverView,
  onDetail: (item: TenureTurnoverReportItem) => void
): ColumnDef<TenureTurnoverReportItem>[] {
  return [
    {
      accessorKey: 'employeeName',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Karyawan' />
      ),
      cell: ({ row }) => <Employee item={row.original} />,
      meta: { label: 'Karyawan' },
    },
    hiddenFilter('site', (item) => item.site.code),
    hiddenFilter('employeeType', (item) => item.employeeType.code),
    hiddenFilter(
      'productionSection',
      (item) => item.productionSection?.uid ?? ''
    ),
    hiddenFilter('tenureBand', (item) => item.tenureBand),
    {
      accessorKey: 'joinDate',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Bergabung' />
      ),
      cell: ({ row }) => (
        <span className='whitespace-nowrap'>
          {dateLabel(row.original.joinDate)}
        </span>
      ),
      meta: { label: 'Bergabung' },
    },
    ...(view === 'TURNOVER'
      ? [
          {
            accessorKey: 'referenceDate',
            enableSorting: false,
            header: ({
              column,
            }: {
              column: Parameters<typeof DataTableColumnHeader>[0]['column']
            }) => (
              <DataTableColumnHeader column={column} title='Tanggal resign' />
            ),
            cell: ({
              row,
            }: {
              row: { original: TenureTurnoverReportItem }
            }) => (
              <span className='whitespace-nowrap'>
                {row.original.referenceDate
                  ? dateLabel(row.original.referenceDate)
                  : '-'}
              </span>
            ),
            meta: { label: 'Tanggal resign' },
          } as ColumnDef<TenureTurnoverReportItem>,
        ]
      : []),
    {
      accessorKey: 'tenureMonths',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={view === 'TENURE' ? 'Masa kerja' : 'Masa kerja saat resign'}
        />
      ),
      cell: ({ row }) => (
        <div>
          <p className='font-medium'>
            {tenureLabel(row.original.tenureMonths)}
          </p>
          <Badge variant='outline'>
            {tenureBandLabel(row.original.tenureBand)}
          </Badge>
        </div>
      ),
      meta: { label: 'Masa kerja' },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      header: () => <span className='sr-only'>Aksi</span>,
      cell: ({ row }) => (
        <DataTableActionButton
          label='Lihat rincian'
          onClick={() => onDetail(row.original)}
        >
          <Eye />
        </DataTableActionButton>
      ),
      meta: { label: 'Aksi' },
    },
  ]
}

function Employee({ item }: { item: TenureTurnoverReportItem }) {
  return (
    <div className='min-w-44'>
      <p className='font-medium'>{item.employeeName}</p>
      <p className='text-xs text-muted-foreground'>
        {item.employeeNumber} · {item.site.name}
      </p>
      <p className='text-xs text-muted-foreground'>
        {item.employeeType.name}
        {item.productionSection ? ` · ${item.productionSection.name}` : ''}
      </p>
    </div>
  )
}
function EmployeeCard({
  item,
  view,
  onDetail,
}: {
  item: TenureTurnoverReportItem
  view: TenureTurnoverView
  onDetail: () => void
}) {
  return (
    <Card>
      <CardContent className='p-4'>
        <Employee item={item} />
        <div className='mt-3 grid grid-cols-2 gap-3 text-sm'>
          <div>
            <p className='text-xs text-muted-foreground'>
              {view === 'TENURE' ? 'Tanggal bergabung' : 'Tanggal resign'}
            </p>
            <p>
              {view === 'TENURE'
                ? dateLabel(item.joinDate)
                : item.referenceDate
                  ? dateLabel(item.referenceDate)
                  : '-'}
            </p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>Masa kerja</p>
            <p>{tenureLabel(item.tenureMonths)}</p>
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
function EmployeeDetail({
  item,
  view,
  open,
  onOpenChange,
}: {
  item?: TenureTurnoverReportItem
  view: TenureTurnoverView
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
        {item && (
          <>
            <SheetHeader>
              <SheetTitle>
                {view === 'TENURE'
                  ? 'Rincian Masa Kerja'
                  : 'Rincian Karyawan Resign'}
              </SheetTitle>
              <SheetDescription>
                Perhitungan memakai tanggal bergabung dan histori kerja resmi.
              </SheetDescription>
            </SheetHeader>
            <div className='space-y-5 px-4 pb-6'>
              <section className='rounded-lg border p-4'>
                <Employee item={item} />
              </section>
              <DetailSection title='Perhitungan'>
                <DetailRow
                  label='Tanggal bergabung'
                  value={dateLabel(item.joinDate)}
                />
                <DetailRow
                  label={view === 'TENURE' ? 'Tanggal acuan' : 'Tanggal resign'}
                  value={
                    item.referenceDate
                      ? dateLabel(item.referenceDate)
                      : 'Akhir periode pilihan'
                  }
                />
                <DetailRow
                  label='Masa kerja'
                  value={tenureLabel(item.tenureMonths)}
                />
                <DetailRow
                  label='Kelompok'
                  value={tenureBandLabel(item.tenureBand)}
                />
                <DetailRow
                  label='Nomor referensi'
                  value={item.referenceNumber ?? '-'}
                />
              </DetailSection>
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
function hiddenFilter(
  id: string,
  accessor: (item: TenureTurnoverReportItem) => string
): ColumnDef<TenureTurnoverReportItem> {
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
function changeView(navigate: NavigateFn, view: TenureTurnoverView) {
  navigate({
    search: (previous) => ({
      ...previous,
      view,
      page: undefined,
      detailUid: undefined,
    }),
  })
}
function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      type='button'
      variant={active ? 'default' : 'ghost'}
      size='sm'
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
function option(item: { code: string; name: string }) {
  return { value: item.code, label: item.name }
}
function tenureLabel(months: number) {
  const value = Math.max(0, Math.round(months))
  const years = Math.floor(value / 12)
  const remaining = value % 12
  return years ? `${years} th ${remaining} bln` : `${remaining} bulan`
}
function tenureBandLabel(value: TenureBand) {
  return {
    LT_1_YEAR: '< 1 tahun',
    Y1_TO_3: '1–<3 tahun',
    Y3_TO_5: '3–<5 tahun',
    GTE_5_YEARS: '≥ 5 tahun',
  }[value]
}
function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: LucideIcon
}) {
  return (
    <section className='min-h-17 rounded-lg border bg-card px-3 py-2.5'>
      <div className='flex items-start justify-between gap-2'>
        <div>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='mt-1 text-xl font-semibold tabular-nums'>{value}</p>
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
        <Users className='size-5' />
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
      {Math.min(page * pageSize, total)} dari {numberLabel(total)} karyawan.
    </>
  )
}
