import { useEffect, useMemo, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Download,
  Eye,
  LoaderCircle,
  RefreshCcw,
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
  useExportHeadcountChangeReport,
  useHeadcountChangeReport,
  useHeadcountChangeReportMeta,
} from './data'
import type {
  HeadcountChangeReportItem,
  HeadcountChangeReportParams,
  HeadcountMovementType,
} from './domain'
import {
  defaultHeadcountChangePeriod,
  downloadBlob,
  headcountChangeRangeError,
  numberLabel,
} from './utils'

type Search = {
  dateFrom?: string
  dateTo?: string
  filter?: string
  site?: string[]
  employeeType?: string[]
  productionSection?: string[]
  movementType?: HeadcountMovementType[]
  detailUid?: string
  detailMovement?: HeadcountMovementType
  page?: number
  pageSize?: number
}

export function HeadcountChangeReportPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const defaults = defaultHeadcountChangePeriod()
  const dateFrom = search.dateFrom ?? defaults.dateFrom
  const dateTo = search.dateTo ?? defaults.dateTo
  const rangeError = headcountChangeRangeError(dateFrom, dateTo)
  const params: HeadcountChangeReportParams = {
    dateFrom,
    dateTo,
    query: search.filter,
    site: search.site,
    employeeType: search.employeeType,
    productionSection: search.productionSection,
    movementType: search.movementType,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  }
  const result = useHeadcountChangeReport(params, !rangeError)
  const meta = useHeadcountChangeReportMeta(
    dateFrom,
    dateTo,
    search.site,
    !rangeError
  )
  const exportReport = useExportHeadcountChangeReport()
  const showDetail = (item?: HeadcountChangeReportItem) =>
    navigate({
      search: (previous) => ({
        ...previous,
        detailUid: item?.historyUid,
        detailMovement: item?.movementType,
      }),
    })
  const selected = result.data?.items.find(
    (item) =>
      item.historyUid === search.detailUid &&
      item.movementType === search.detailMovement
  )
  const columns = useMemo(
    () => movementColumns(showDetail),
    // navigate dari TanStack Router stabil selama halaman aktif.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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
        columnId: 'movementType',
        searchKey: 'movementType',
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
    getRowId: (row) => `${row.historyUid}-${row.movementType}`,
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
        employeeType: params.employeeType,
        productionSection: params.productionSection,
        movementType: params.movementType,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          downloadBlob(blob, fileName)
          toast.success('Laporan perubahan jumlah karyawan berhasil diunduh.')
        },
        onError: () =>
          toast.error('Ekspor laporan perubahan jumlah karyawan gagal.'),
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
            Laporan Perubahan Jumlah Karyawan
          </h1>
          <p className='text-sm text-muted-foreground'>
            Pantau jumlah aktif, karyawan masuk, mutasi, resign, dan perubahan
            status berdasarkan histori kerja.
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
        <div className='mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4 2xl:grid-cols-8'>
          <Kpi
            label='Aktif awal'
            value={summary.openingHeadcount}
            icon={Users}
          />
          <Kpi label='Karyawan masuk' value={summary.joined} icon={UserPlus} />
          <Kpi
            label='Mutasi masuk'
            value={summary.transferredIn}
            icon={ArrowDownRight}
          />
          <Kpi
            label='Mutasi keluar'
            value={summary.transferredOut}
            icon={ArrowUpRight}
          />
          <Kpi label='Resign' value={summary.resigned} icon={UserMinus} />
          <Kpi
            label='Perubahan status'
            value={summary.statusChanges}
            icon={ArrowRightLeft}
          />
          <Kpi
            label='Aktif akhir'
            value={summary.closingHeadcount}
            icon={Users}
          />
          <Kpi
            label='Selisih bersih'
            value={summary.netChange}
            icon={summary.netChange < 0 ? ArrowDownRight : ArrowUpRight}
            signed
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
        <Users />
        <AlertTitle>Cara membaca jumlah aktif</AlertTitle>
        <AlertDescription>
          Jumlah awal memakai kondisi sehari sebelum periode. Jumlah akhir
          memakai kondisi pada tanggal akhir. Mutasi dicatat keluar pada site
          asal dan masuk pada site tujuan, sehingga tidak dianggap karyawan
          baru. Jumlah aktif mengikuti filter site, jenis karyawan, dan bagian
          produksi. Pencarian dan filter jenis perubahan hanya menyaring tabel
          rincian.
        </AlertDescription>
      </Alert>

      <div className='space-y-4'>
        <div className='overflow-x-auto pb-1'>
          <div className='min-w-max sm:min-w-0'>
            <DataTableToolbar
              table={table}
              searchPlaceholder='Cari nama, nomor karyawan, atau referensi...'
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
                  columnId: 'movementType',
                  title: 'Jenis perubahan',
                  options: (meta.data?.movementTypes ?? []).map(option),
                },
              ]}
            />
          </div>
        </div>
        {result.isFetching && !result.isPending && <Refreshing />}
        {result.isPending && !rangeError ? (
          <EmptyState text='Memuat perubahan jumlah karyawan...' loading />
        ) : result.isError ? (
          <EmptyState text='Laporan perubahan jumlah karyawan gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EmptyState>
        ) : !rangeError && !result.data?.items.length ? (
          <EmptyState text='Tidak ada perubahan karyawan yang sesuai filter.' />
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
                <MovementCard
                  key={`${item.historyUid}-${item.movementType}`}
                  item={item}
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

      <MovementDetail
        item={selected}
        open={Boolean(search.detailUid && search.detailMovement)}
        onOpenChange={(open) => !open && showDetail(undefined)}
      />
    </Main>
  )
}

function movementColumns(
  onDetail: (item: HeadcountChangeReportItem) => void
): ColumnDef<HeadcountChangeReportItem>[] {
  return [
    {
      accessorKey: 'effectiveDate',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Tanggal' />
      ),
      cell: ({ row }) => (
        <span className='whitespace-nowrap'>
          {dateLabel(row.original.effectiveDate)}
        </span>
      ),
      meta: { label: 'Tanggal' },
    },
    {
      accessorKey: 'employeeName',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Karyawan' />
      ),
      cell: ({ row }) => <Employee item={row.original} />,
      meta: { label: 'Karyawan' },
    },
    hiddenFilter('site', (item) => item.eventSite.code),
    hiddenFilter('employeeType', (item) => item.employeeType.code),
    hiddenFilter(
      'productionSection',
      (item) => item.productionSection?.uid ?? ''
    ),
    {
      accessorKey: 'movementType',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Perubahan' />
      ),
      cell: ({ row }) => <MovementBadge value={row.original.movementType} />,
      filterFn: arrayFilter,
      meta: { label: 'Perubahan' },
    },
    {
      id: 'transition',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Sebelum → Sesudah' />
      ),
      cell: ({ row }) => <Transition item={row.original} />,
      meta: { label: 'Sebelum → Sesudah' },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      header: () => <span className='sr-only'>Aksi</span>,
      cell: ({ row }) => (
        <DataTableActionButton
          label='Lihat rincian perubahan'
          onClick={() => onDetail(row.original)}
        >
          <Eye />
        </DataTableActionButton>
      ),
      meta: { label: 'Aksi' },
    },
  ]
}

function Employee({ item }: { item: HeadcountChangeReportItem }) {
  return (
    <div className='min-w-44'>
      <p className='font-medium'>{item.employeeName}</p>
      <p className='text-xs text-muted-foreground'>
        {item.employeeNumber} · {item.eventSite.name}
      </p>
      <p className='text-xs text-muted-foreground'>
        {item.employeeType.name}
        {item.productionSection ? ` · ${item.productionSection.name}` : ''}
      </p>
    </div>
  )
}
function Transition({ item }: { item: HeadcountChangeReportItem }) {
  if (item.movementType === 'JOIN')
    return (
      <span className='text-sm'>
        {item.targetStatus?.name ?? 'Aktif'} di{' '}
        {item.targetSite?.name ?? item.eventSite.name}
      </span>
    )
  const before = item.movementType.startsWith('TRANSFER')
    ? item.sourceSite?.name
    : item.sourceStatus?.name
  const after = item.movementType.startsWith('TRANSFER')
    ? item.targetSite?.name
    : item.targetStatus?.name
  return (
    <div className='min-w-48 text-sm'>
      <p>
        {before ?? '-'} → {after ?? '-'}
      </p>
      {item.referenceNumber && (
        <p className='text-xs text-muted-foreground'>
          Ref. {item.referenceNumber}
        </p>
      )}
    </div>
  )
}
function MovementBadge({ value }: { value: HeadcountMovementType }) {
  return (
    <Badge
      variant={
        value === 'JOIN' || value === 'TRANSFER_IN' || value === 'REACTIVATED'
          ? 'default'
          : value === 'RESIGN' || value === 'DEACTIVATED'
            ? 'destructive'
            : 'outline'
      }
    >
      {movementLabel(value)}
    </Badge>
  )
}
function MovementCard({
  item,
  onDetail,
}: {
  item: HeadcountChangeReportItem
  onDetail: () => void
}) {
  return (
    <Card>
      <CardContent className='p-4'>
        <div className='flex items-start justify-between gap-3'>
          <Employee item={item} />
          <MovementBadge value={item.movementType} />
        </div>
        <div className='mt-3'>
          <Transition item={item} />
        </div>
        <p className='mt-2 text-xs text-muted-foreground'>
          {dateLabel(item.effectiveDate)}
        </p>
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
function MovementDetail({
  item,
  open,
  onOpenChange,
}: {
  item?: HeadcountChangeReportItem
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
        {item && (
          <>
            <SheetHeader>
              <SheetTitle>Rincian Perubahan Karyawan</SheetTitle>
              <SheetDescription>
                Fakta perubahan berdasarkan histori kerja yang berlaku.
              </SheetDescription>
            </SheetHeader>
            <div className='space-y-5 px-4 pb-6'>
              <section className='rounded-lg border p-4'>
                <div className='flex items-start justify-between gap-3'>
                  <Employee item={item} />
                  <MovementBadge value={item.movementType} />
                </div>
              </section>
              <DetailSection title='Perubahan'>
                <DetailRow
                  label='Tanggal efektif'
                  value={dateLabel(item.effectiveDate)}
                />
                <DetailRow
                  label='Site perhitungan'
                  value={item.eventSite.name}
                />
                <DetailRow
                  label='Site sebelum'
                  value={item.sourceSite?.name ?? '-'}
                />
                <DetailRow
                  label='Site sesudah'
                  value={item.targetSite?.name ?? '-'}
                />
                <DetailRow
                  label='Status sebelum'
                  value={item.sourceStatus?.name ?? '-'}
                />
                <DetailRow
                  label='Status sesudah'
                  value={item.targetStatus?.name ?? '-'}
                />
                <DetailRow
                  label='Nomor referensi'
                  value={item.referenceNumber ?? '-'}
                />
              </DetailSection>
              <Alert>
                <Users />
                <AlertTitle>Data historis</AlertTitle>
                <AlertDescription>
                  Rincian ini mengikuti kondisi sebelum dan sesudah pada histori
                  kerja, bukan kondisi karyawan saat ini.
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
function hiddenFilter(
  id: string,
  accessor: (item: HeadcountChangeReportItem) => string
): ColumnDef<HeadcountChangeReportItem> {
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
      detailMovement: undefined,
    }),
  })
}
function option(item: { code: string; name: string }) {
  return { value: item.code, label: item.name }
}
function movementLabel(value: HeadcountMovementType) {
  return {
    JOIN: 'Karyawan masuk',
    TRANSFER_IN: 'Mutasi masuk',
    TRANSFER_OUT: 'Mutasi keluar',
    RESIGN: 'Resign',
    DEACTIVATED: 'Menjadi nonaktif',
    REACTIVATED: 'Aktif kembali',
    STATUS_CHANGE: 'Perubahan status lainnya',
  }[value]
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(`${value}T00:00:00+07:00`))
}
function Kpi({
  label,
  value,
  icon: Icon,
  signed,
}: {
  label: string
  value: number
  icon: LucideIcon
  signed?: boolean
}) {
  return (
    <section className='min-h-17 rounded-lg border bg-card px-3 py-2.5'>
      <div className='flex items-start justify-between gap-2'>
        <div>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='mt-1 text-xl font-semibold tabular-nums'>
            {signed && value > 0 ? '+' : ''}
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
      {Math.min(page * pageSize, total)} dari {numberLabel(total)} perubahan.
    </>
  )
}
