import { useCallback, useMemo } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  Banknote,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  Download,
  Eye,
  FileClock,
  Info,
  ListChecks,
  LoaderCircle,
  RefreshCcw,
  SearchX,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DataTableActionButton,
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
  useExportProductionRecaps,
  useProductionEmployeeRecap,
  useProductionJobRecap,
  useProductionRecaps,
} from './data/queries'
import type {
  ProductionEmployeeRecapDetail,
  ProductionJobRecapDetail,
  ProductionPayrollSnapshotStatus,
  ProductionRecapEmployee,
  ProductionRecapJob,
  ProductionRecapParams,
  ProductionRecapQuantity,
  ProductionRecapTransaction,
  ProductionSite,
} from './domain'
import {
  formatProductionRecapQuantity,
  productionRecapDefaultPeriod,
  productionRecapPayrollLabel,
  productionRecapRangeError,
} from './production-recap-policy'

export function ProductionRecapPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const defaults = productionRecapDefaultPeriod()
  const dateFrom = stringValue(search.dateFrom) ?? defaults.dateFrom
  const dateTo = stringValue(search.dateTo) ?? defaults.dateTo
  const rangeError = productionRecapRangeError(dateFrom, dateTo)
  const params: ProductionRecapParams = {
    dateFrom,
    dateTo,
    query: stringValue(search.filter),
    site: arrayValue<ProductionSite>(search.site),
    jobUid: arrayValue(search.jobUid),
    employeeType: arrayValue(search.employeeType),
    productionSectionUid: arrayValue(search.productionSectionUid),
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  }
  const result = useProductionRecaps(params, !rangeError)
  const session = useAuthStore((state) => state.session)
  const exportMutation = useExportProductionRecaps()
  const canExport = hasPermission(session, 'production.export')
  const view = search.view === 'jobs' ? 'jobs' : 'employees'
  const detailType = search.detailType === 'job' ? 'job' : 'employee'
  const detailUid = stringValue(search.detailUid)
  const detailSite = stringValue(search.detailSite)

  const updatePeriod = (nextFrom: string, nextTo: string) =>
    navigate({
      search: (previous) => ({
        ...previous,
        dateFrom: nextFrom,
        dateTo: nextTo,
        page: undefined,
        detailUid: undefined,
        detailType: undefined,
        detailSite: undefined,
      }),
    })

  const resetFilters = () =>
    navigate({
      search: (previous) => ({
        ...previous,
        filter: undefined,
        site: undefined,
        jobUid: undefined,
        employeeType: undefined,
        productionSectionUid: undefined,
        page: undefined,
      }),
    })

  const openEmployee = useCallback(
    (item: ProductionRecapEmployee) =>
      navigate({
        search: (previous) => ({
          ...previous,
          detailType: 'employee',
          detailUid: item.employee.uid,
          detailSite: item.site.code,
        }),
      }),
    [navigate]
  )
  const openJob = useCallback(
    (item: ProductionRecapJob) =>
      navigate({
        search: (previous) => ({
          ...previous,
          detailType: 'job',
          detailUid: item.job.uid,
          detailSite: undefined,
        }),
      }),
    [navigate]
  )

  const exportRecap = () => {
    if (!canExport || rangeError) return
    exportMutation.mutate(
      {
        dateFrom,
        dateTo,
        query: params.query,
        site: params.site,
        jobUid: params.jobUid,
        employeeType: params.employeeType,
        productionSectionUid: params.productionSectionUid,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = fileName
          anchor.click()
          window.setTimeout(() => URL.revokeObjectURL(url), 0)
          toast.success('Rekap produksi berhasil diunduh.')
        },
        onError: () => toast.error('Ekspor rekap produksi gagal.'),
      }
    )
  }

  return (
    <Main>
      <header className='mb-4 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <p className='text-sm font-medium text-primary'>
              Produksi Borongan
            </p>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge
                  variant='outline'
                  className='border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                >
                  <span className='relative me-1 flex size-1.5'>
                    <span className='absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-50' />
                    <span className='relative inline-flex size-1.5 rounded-full bg-emerald-500' />
                  </span>
                  Data live
                </Badge>
              </TooltipTrigger>
              <TooltipContent className='max-w-64'>
                Angka dapat berubah sampai transaksi disnapshot ke Payroll.
              </TooltipContent>
            </Tooltip>
          </div>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Rekap Produksi
          </h1>
          <p className='max-w-2xl text-sm text-muted-foreground'>
            Baca hasil kerja, pekerjaan, dan nilai bruto tercatat tanpa
            mencampurkan kuantitas dari satuan berbeda.
          </p>
        </div>

        <section
          aria-label='Periode rekap'
          className='flex flex-col gap-2 rounded-xl border bg-muted/20 p-3 sm:flex-row sm:items-end'
        >
          <div className='grid grid-cols-1 gap-2 min-[440px]:grid-cols-2'>
            <DateControl
              label='Dari tanggal'
              value={dateFrom}
              onChange={(nextFrom) => {
                const maxTo = addDays(nextFrom, 30)
                updatePeriod(
                  nextFrom,
                  dateTo < nextFrom ? nextFrom : dateTo > maxTo ? maxTo : dateTo
                )
              }}
            />
            <DateControl
              label='Sampai tanggal'
              value={dateTo}
              min={dateFrom}
              max={addDays(dateFrom, 30)}
              onChange={(nextTo) => updatePeriod(dateFrom, nextTo)}
            />
          </div>
          {canExport && (
            <Button
              className='h-9 shrink-0'
              onClick={exportRecap}
              disabled={Boolean(rangeError) || exportMutation.isPending}
            >
              {exportMutation.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Download />
              )}
              Ekspor Excel
            </Button>
          )}
        </section>
      </header>

      {rangeError ? (
        <Alert variant='destructive'>
          <CalendarDays />
          <AlertTitle>Periode tidak valid</AlertTitle>
          <AlertDescription>{rangeError}</AlertDescription>
        </Alert>
      ) : (
        <>
          <LiveDataNotice />
          <RecapSummary data={result.data} isPending={result.isPending} />
          <QuantityStrip
            items={result.data?.quantityTotals}
            isPending={result.isPending}
          />

          <Tabs
            value={view}
            onValueChange={(next) =>
              navigate({
                search: (previous) => ({
                  ...previous,
                  view: next === 'jobs' ? 'jobs' : undefined,
                  page: undefined,
                }),
              })
            }
            className='mt-4'
          >
            <div className='max-w-full border-b pb-2'>
              <TabsList className='h-auto max-w-full justify-start gap-1 overflow-x-auto bg-muted/70 p-1'>
                <TabsTrigger value='employees' className='h-10 flex-none px-4'>
                  <Users /> Per Karyawan
                </TabsTrigger>
                <TabsTrigger value='jobs' className='h-10 flex-none px-4'>
                  <BriefcaseBusiness /> Per Pekerjaan
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value='employees' className='mt-3'>
              <EmployeeLedger
                data={result.data}
                search={search}
                navigate={navigate}
                isPending={result.isPending}
                isFetching={result.isFetching}
                isError={result.isError}
                onRetry={() => void result.refetch()}
                onReset={resetFilters}
                onDetail={openEmployee}
              />
            </TabsContent>
            <TabsContent value='jobs' className='mt-3'>
              <JobGrid
                data={result.data}
                search={search}
                navigate={navigate}
                isPending={result.isPending}
                isFetching={result.isFetching}
                isError={result.isError}
                onRetry={() => void result.refetch()}
                onReset={resetFilters}
                onDetail={openJob}
                hasFilters={hasFilters(params)}
              />
            </TabsContent>
          </Tabs>
        </>
      )}

      <RecapDetailSheet
        type={detailType}
        uid={detailUid}
        site={detailSite}
        params={params}
        open={Boolean(detailUid)}
        onOpenChange={(open) => {
          if (open) return
          navigate({
            search: (previous) => ({
              ...previous,
              detailType: undefined,
              detailUid: undefined,
              detailSite: undefined,
            }),
          })
        }}
      />
    </Main>
  )
}

function LiveDataNotice() {
  return (
    <div className='mb-3 flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/[0.05] px-3 py-2 text-xs sm:text-sm'>
      <Info className='mt-0.5 size-4 shrink-0 text-sky-700 dark:text-sky-400' />
      <p>
        Hanya transaksi <strong>POSTED</strong> yang dihitung. Transaksi VOID
        dikecualikan dan nilai bruto di halaman ini belum merupakan gaji bersih.
      </p>
    </div>
  )
}

function RecapSummary({
  data,
  isPending,
}: {
  data?: { summary: ProductionRecapResult['summary'] }
  isPending: boolean
}) {
  const items = [
    {
      label: 'Karyawan tercatat',
      value: data?.summary.employeeCount,
      icon: Users,
      description:
        'Karyawan unik yang memiliki transaksi POSTED pada periode dan filter terpilih.',
      tone: 'border-sky-500/20 bg-sky-500/[0.05]',
    },
    {
      label: 'Transaksi POSTED',
      value: data?.summary.transactionCount,
      icon: FileClock,
      description:
        'Jumlah transaksi produksi berstatus POSTED yang masuk rekap.',
      tone: 'border-indigo-500/20 bg-indigo-500/[0.05]',
    },
    {
      label: 'Pekerjaan digunakan',
      value: data?.summary.jobCount,
      icon: ListChecks,
      description:
        'Jumlah pekerjaan produksi berbeda yang tercatat pada rekap.',
      tone: 'border-emerald-500/20 bg-emerald-500/[0.05]',
    },
    {
      label: 'Nilai bruto tercatat',
      value: data ? formatCurrency(data.summary.totalGrossAmount) : undefined,
      icon: Banknote,
      description:
        'Akumulasi nilai bruto dari snapshot tarif transaksi, sebelum proses Payroll.',
      tone: 'border-amber-500/20 bg-amber-500/[0.05]',
    },
  ]
  return (
    <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
      {items.map((item) => (
        <Tooltip key={item.label}>
          <TooltipTrigger asChild>
            <section
              tabIndex={0}
              className={cn(
                'min-h-[68px] rounded-lg border px-3 py-2.5 focus-visible:ring-2 focus-visible:ring-ring',
                item.tone
              )}
            >
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <p className='truncate text-xs text-muted-foreground'>
                    {item.label}
                  </p>
                  {isPending ? (
                    <Skeleton className='mt-1 h-5 w-20' />
                  ) : (
                    <p className='truncate text-lg font-bold tracking-tight'>
                      {typeof item.value === 'number'
                        ? formatNumber(item.value)
                        : item.value}
                    </p>
                  )}
                </div>
                <item.icon className='mt-0.5 size-4 shrink-0 text-primary' />
              </div>
            </section>
          </TooltipTrigger>
          <TooltipContent className='max-w-72'>
            {item.description}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

function QuantityStrip({
  items,
  isPending,
}: {
  items?: ProductionRecapQuantity[]
  isPending: boolean
}) {
  return (
    <section
      className='mt-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.035] px-3 py-2'
      aria-labelledby='quantity-strip-title'
    >
      <div className='flex flex-wrap items-center gap-x-4 gap-y-1.5'>
        <p
          id='quantity-strip-title'
          className='flex items-center gap-2 text-xs font-medium text-muted-foreground'
        >
          <Boxes className='size-4 text-emerald-700 dark:text-emerald-400' />{' '}
          Hasil per satuan
        </p>
        {isPending ? (
          <>
            <Skeleton className='h-5 w-24' />
            <Skeleton className='h-5 w-20' />
          </>
        ) : items?.length ? (
          items.map((item) => (
            <div key={item.unit.uid} className='flex items-baseline gap-1'>
              <strong className='text-sm'>
                {formatProductionRecapQuantity(
                  item.quantity,
                  item.unit.decimalPrecision
                )}
              </strong>
              <span className='text-xs text-muted-foreground'>
                {item.unit.code}
              </span>
            </div>
          ))
        ) : (
          <span className='text-xs text-muted-foreground'>
            Belum ada hasil produksi.
          </span>
        )}
      </div>
    </section>
  )
}

type ProductionRecapResult = import('./domain').ProductionRecapResult

function EmployeeLedger({
  data,
  search,
  navigate,
  isPending,
  isFetching,
  isError,
  onRetry,
  onReset,
  onDetail,
}: {
  data?: ProductionRecapResult
  search: Record<string, unknown>
  navigate: NavigateFn
  isPending: boolean
  isFetching: boolean
  isError: boolean
  onRetry: () => void
  onReset: () => void
  onDetail: (item: ProductionRecapEmployee) => void
}) {
  const columns = useMemo<ColumnDef<ProductionRecapEmployee>[]>(
    () => [
      {
        id: 'employee',
        header: 'Karyawan',
        meta: { thClassName: 'w-[22%]', tdClassName: 'min-w-0' },
        cell: ({ row }) => <EmployeeIdentity item={row.original} />,
      },
      {
        id: 'placement',
        header: 'Jenis & Penempatan',
        meta: { thClassName: 'w-[22%]', tdClassName: 'min-w-0' },
        cell: ({ row }) => <Placement item={row.original} />,
      },
      {
        id: 'results',
        header: 'Hasil Produksi',
        meta: { thClassName: 'w-[25%]', tdClassName: 'min-w-0' },
        cell: ({ row }) => <JobSummary jobs={row.original.jobs} />,
      },
      {
        id: 'transactions',
        header: 'Transaksi',
        meta: {
          thClassName: 'w-[7%] text-center',
          tdClassName: 'text-center tabular-nums',
        },
        cell: ({ row }) => formatNumber(row.original.transactionCount),
      },
      {
        id: 'gross',
        header: 'Bruto & Payroll',
        meta: { thClassName: 'w-[20%]', tdClassName: 'min-w-0' },
        cell: ({ row }) => (
          <div className='space-y-1'>
            <p className='font-semibold'>
              {formatCurrency(row.original.grossAmount)}
            </p>
            <PayrollBadge value={row.original.payrollStatus} />
          </div>
        ),
      },
      {
        id: 'action',
        header: '',
        meta: {
          thClassName: 'w-[4%] px-1',
          tdClassName: 'px-1 text-center',
        },
        enableHiding: false,
        cell: ({ row }) => (
          <DataTableActionButton
            label={`Lihat detail ${row.original.employee.fullName}`}
            onClick={() => onDetail(row.original)}
          >
            <Eye />
          </DataTableActionButton>
        ),
      },
      { id: 'site', accessorFn: (row) => row.site.code },
      {
        id: 'employeeType',
        accessorFn: (row) => row.placement.employeeType.code,
      },
      { id: 'jobUid', accessorFn: (row) => row.jobs.map((job) => job.job.uid) },
      {
        id: 'productionSectionUid',
        accessorFn: (row) => row.placement.productionSection?.uid,
      },
    ],
    [onDetail]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'jobUid', searchKey: 'jobUid', type: 'array' },
      { columnId: 'employeeType', searchKey: 'employeeType', type: 'array' },
      {
        columnId: 'productionSectionUid',
        searchKey: 'productionSectionUid',
        type: 'array',
      },
    ],
  })
  // TanStack Table mengembalikan fungsi stateful; ini pola starter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data?.employees.items ?? [],
    columns,
    state: {
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
    },
    initialState: {
      columnVisibility: {
        site: false,
        employeeType: false,
        jobUid: false,
        productionSectionUid: false,
      },
    },
    manualFiltering: true,
    manualPagination: true,
    pageCount: Math.max(
      1,
      Math.ceil((data?.employees.total ?? 0) / (data?.employees.pageSize ?? 50))
    ),
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => `${row.employee.uid}:${row.site.code}`,
  })
  const filters = data?.facets
  return (
    <div className='space-y-3'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari nama atau nomor karyawan...'
        searchDebounceMs={500}
        filters={[
          { columnId: 'site', title: 'Site', options: filters?.sites ?? [] },
          {
            columnId: 'jobUid',
            title: 'Pekerjaan',
            options: filters?.jobs ?? [],
          },
          {
            columnId: 'employeeType',
            title: 'Jenis',
            options: filters?.employeeTypes ?? [],
          },
          {
            columnId: 'productionSectionUid',
            title: 'Bagian produksi',
            options: filters?.productionSections ?? [],
          },
        ]}
      />
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
        <LedgerSkeleton />
      ) : isError ? (
        <StatePanel
          icon={RefreshCcw}
          title='Rekap produksi gagal dimuat.'
          actionLabel='Coba lagi'
          onAction={onRetry}
        />
      ) : !data?.employees.items.length ? (
        <EmptyRecap
          hasFilters={hasFiltersFromSearch(search)}
          onReset={onReset}
        />
      ) : (
        <>
          <div className='hidden max-w-full overflow-hidden rounded-lg border xl:block'>
            <Table className='w-full table-fixed [&_td]:px-2 [&_td]:py-2.5 [&_th]:px-2 [&_th]:leading-4 [&_th]:whitespace-normal'>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={cn(
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
                  <TableRow
                    key={row.id}
                    className='cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none'
                    tabIndex={0}
                    onClick={() => onDetail(row.original)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onDetail(row.original)
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(cell.column.columnDef.meta?.tdClassName)}
                        onClick={
                          cell.column.id === 'action'
                            ? (event) => event.stopPropagation()
                            : undefined
                        }
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
            {data.employees.items.map((item) => (
              <EmployeeCard
                key={`${item.employee.uid}:${item.site.code}`}
                item={item}
                onDetail={() => onDetail(item)}
              />
            ))}
          </div>
          <DataTablePagination
            table={table}
            summary={paginationSummary(
              data.employees.page,
              data.employees.pageSize,
              data.employees.total,
              'karyawan'
            )}
          />
        </>
      )}
    </div>
  )
}

function JobGrid({
  data,
  search,
  navigate,
  isPending,
  isFetching,
  isError,
  onRetry,
  onReset,
  onDetail,
  hasFilters,
}: {
  data?: ProductionRecapResult
  search: Record<string, unknown>
  navigate: NavigateFn
  isPending: boolean
  isFetching: boolean
  isError: boolean
  onRetry: () => void
  onReset: () => void
  onDetail: (item: ProductionRecapJob) => void
  hasFilters: boolean
}) {
  const filterColumns = useMemo<ColumnDef<ProductionRecapEmployee>[]>(
    () => [
      { id: 'site', accessorFn: (row) => row.site.code },
      { id: 'jobUid', accessorFn: (row) => row.jobs.map((job) => job.job.uid) },
      {
        id: 'employeeType',
        accessorFn: (row) => row.placement.employeeType.code,
      },
      {
        id: 'productionSectionUid',
        accessorFn: (row) => row.placement.productionSection?.uid,
      },
    ],
    []
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'jobUid', searchKey: 'jobUid', type: 'array' },
      { columnId: 'employeeType', searchKey: 'employeeType', type: 'array' },
      {
        columnId: 'productionSectionUid',
        searchKey: 'productionSectionUid',
        type: 'array',
      },
    ],
  })
  // TanStack Table mengembalikan fungsi stateful; ini pola starter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const filterTable = useReactTable({
    data: data?.employees.items ?? [],
    columns: filterColumns,
    state: {
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
    },
    initialState: {
      columnVisibility: {
        site: false,
        jobUid: false,
        employeeType: false,
        productionSectionUid: false,
      },
    },
    manualFiltering: true,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    getCoreRowModel: getCoreRowModel(),
  })

  const toolbar = (
    <DataTableToolbar
      table={filterTable}
      searchPlaceholder='Cari nama atau nomor karyawan...'
      searchDebounceMs={500}
      filters={[
        { columnId: 'site', title: 'Site', options: data?.facets.sites ?? [] },
        {
          columnId: 'jobUid',
          title: 'Pekerjaan',
          options: data?.facets.jobs ?? [],
        },
        {
          columnId: 'employeeType',
          title: 'Jenis',
          options: data?.facets.employeeTypes ?? [],
        },
        {
          columnId: 'productionSectionUid',
          title: 'Bagian produksi',
          options: data?.facets.productionSections ?? [],
        },
      ]}
    />
  )
  if (isPending)
    return (
      <div className='space-y-3'>
        {toolbar}
        <div className='grid gap-3 md:grid-cols-2 2xl:grid-cols-3'>
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className='h-48 rounded-xl' />
          ))}
        </div>
      </div>
    )
  if (isError)
    return (
      <StatePanel
        icon={RefreshCcw}
        title='Rekap pekerjaan gagal dimuat.'
        actionLabel='Coba lagi'
        onAction={onRetry}
      />
    )
  if (!data?.jobs.length)
    return <EmptyRecap hasFilters={hasFilters} onReset={onReset} />
  return (
    <div className='space-y-3'>
      {toolbar}
      {isFetching && (
        <p
          role='status'
          className='flex items-center gap-2 text-xs text-muted-foreground'
        >
          <LoaderCircle className='size-3.5 animate-spin' /> Memperbarui
          rekap...
        </p>
      )}
      <div className='grid gap-3 md:grid-cols-2 2xl:grid-cols-3'>
        {data.jobs.map((item) => (
          <Card
            key={item.job.uid}
            className='group overflow-hidden rounded-xl border-primary/10 shadow-none transition-colors hover:border-primary/30'
          >
            <CardContent className='space-y-3 p-4'>
              <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0'>
                  <p className='truncate font-semibold'>{item.job.name}</p>
                  <p className='truncate text-xs text-muted-foreground'>
                    {item.job.code} · {quantityUnitNames(item.quantityTotals)}
                  </p>
                </div>
                <PayrollBadge value={item.payrollStatus} />
              </div>
              <div className='rounded-lg border border-primary/10 bg-primary/[0.035] px-3 py-2'>
                <p className='text-xs text-muted-foreground'>Total hasil</p>
                <p className='text-xl font-bold tracking-tight'>
                  {formatQuantityTotals(item.quantityTotals)}
                </p>
              </div>
              <div className='grid grid-cols-3 divide-x text-center'>
                <Metric label='Pekerja' value={item.employeeCount} />
                <Metric label='Transaksi' value={item.transactionCount} />
                <Metric
                  label='Bruto'
                  value={formatCompactCurrency(item.grossAmount)}
                />
              </div>
              <Button
                size='sm'
                variant='outline'
                className='w-full'
                onClick={() => onDetail(item)}
              >
                <Eye /> Lihat rincian
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function EmployeeCard({
  item,
  onDetail,
}: {
  item: ProductionRecapEmployee
  onDetail: () => void
}) {
  return (
    <Card className='shadow-none'>
      <CardContent className='space-y-3 p-4'>
        <div className='flex items-start justify-between gap-3'>
          <EmployeeIdentity item={item} />
          <PayrollBadge value={item.payrollStatus} />
        </div>
        <div className='grid grid-cols-2 gap-3 text-xs'>
          <div>
            <p className='text-muted-foreground'>Jenis & jabatan</p>
            <p className='font-medium'>
              {item.placement.employeeType.name} ·{' '}
              {item.placement.position?.name ?? '-'}
            </p>
          </div>
          <div>
            <p className='text-muted-foreground'>Bagian produksi</p>
            <p className='font-medium'>
              {item.placement.productionSection?.name ?? '-'}
            </p>
          </div>
        </div>
        <JobSummary jobs={item.jobs} />
        <div className='flex items-end justify-between gap-3 border-t pt-3'>
          <div>
            <p className='text-xs text-muted-foreground'>
              {formatNumber(item.transactionCount)} transaksi POSTED
            </p>
            <p className='font-semibold'>{formatCurrency(item.grossAmount)}</p>
          </div>
          <Button size='sm' variant='outline' onClick={onDetail}>
            <Eye /> Detail
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function EmployeeIdentity({ item }: { item: ProductionRecapEmployee }) {
  return (
    <div className='min-w-0'>
      <p className='truncate font-semibold'>{item.employee.fullName}</p>
      <p className='truncate text-xs text-muted-foreground'>
        {item.site.name} · {item.employee.employeeNumber}
      </p>
      {item.placementChanged && (
        <Badge variant='outline' className='mt-1 text-[10px]'>
          Penempatan berubah
        </Badge>
      )}
    </div>
  )
}
function Placement({ item }: { item: ProductionRecapEmployee }) {
  return (
    <div className='min-w-0 text-xs'>
      <p className='truncate font-medium'>
        {item.placement.employeeType.name} ·{' '}
        {item.placement.position?.name ?? '-'}
      </p>
      <p className='truncate text-muted-foreground'>
        {item.placement.productionSection?.name ?? 'Tanpa bagian'}
      </p>
    </div>
  )
}
function JobSummary({ jobs }: { jobs: ProductionRecapEmployee['jobs'] }) {
  const shown = jobs.slice(0, 2)
  return (
    <div className='space-y-1 text-xs'>
      {shown.map((job) => (
        <div key={job.job.uid} className='flex min-w-0 justify-between gap-2'>
          <span className='truncate text-muted-foreground'>{job.job.name}</span>
          <strong className='shrink-0'>
            {formatQuantityTotals(job.quantityTotals)}
          </strong>
        </div>
      ))}
      {jobs.length > 2 && (
        <p className='text-primary'>+{jobs.length - 2} pekerjaan lainnya</p>
      )}
    </div>
  )
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className='px-2'>
      <p className='font-semibold'>
        {typeof value === 'number' ? formatNumber(value) : value}
      </p>
      <p className='text-[11px] text-muted-foreground'>{label}</p>
    </div>
  )
}

function PayrollBadge({ value }: { value: ProductionPayrollSnapshotStatus }) {
  return (
    <Badge
      variant='outline'
      className={cn(
        'max-w-full text-[10px] whitespace-nowrap',
        value === 'SNAPSHOTTED' &&
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        value === 'PARTIAL' &&
          'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        value === 'NONE' && 'text-muted-foreground'
      )}
    >
      {productionRecapPayrollLabel(value)}
    </Badge>
  )
}

function RecapDetailSheet({
  type,
  uid,
  site,
  params,
  open,
  onOpenChange,
}: {
  type: 'employee' | 'job'
  uid?: string
  site?: string
  params: ProductionRecapParams
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const detailParams = {
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    site: site ?? params.site,
    jobUid: params.jobUid,
    employeeType: params.employeeType,
    productionSectionUid: params.productionSectionUid,
  }
  const employee = useProductionEmployeeRecap(
    type === 'employee' ? uid : undefined,
    detailParams
  )
  const job = useProductionJobRecap(
    type === 'job' ? uid : undefined,
    detailParams
  )
  const query = type === 'employee' ? employee : job
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full max-w-none gap-0 p-0 sm:w-full sm:max-w-2xl lg:max-w-3xl'>
        <SheetHeader className='border-b pe-12'>
          <SheetTitle>
            {type === 'employee'
              ? 'Detail Rekap Karyawan'
              : 'Detail Rekap Pekerjaan'}
          </SheetTitle>
          <SheetDescription>
            {formatLongDate(params.dateFrom)} – {formatLongDate(params.dateTo)}
          </SheetDescription>
        </SheetHeader>
        <div className='min-h-0 flex-1 overflow-y-auto p-4'>
          {query.isPending ? (
            <DetailSkeleton />
          ) : query.isError ? (
            <StatePanel
              icon={RefreshCcw}
              title='Detail rekap gagal dimuat.'
              actionLabel='Coba lagi'
              onAction={() => void query.refetch()}
            />
          ) : type === 'employee' && employee.data ? (
            <EmployeeDetail data={employee.data} />
          ) : type === 'job' && job.data ? (
            <JobDetail data={job.data} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function EmployeeDetail({ data }: { data: ProductionEmployeeRecapDetail }) {
  return (
    <Tabs defaultValue='summary'>
      <TabsList className='h-10'>
        <TabsTrigger value='summary' className='h-9 px-4'>
          <ListChecks /> Ringkasan
        </TabsTrigger>
        <TabsTrigger value='transactions' className='h-9 px-4'>
          <FileClock /> Transaksi
        </TabsTrigger>
      </TabsList>
      <TabsContent value='summary' className='mt-4 space-y-4'>
        <DetailHero
          title={data.employee.fullName}
          subtitle={`${data.site.name} · ${data.employee.employeeNumber}`}
          gross={data.summary.grossAmount}
          payroll={data.summary.payrollStatus}
        />
        <DetailFacts
          rows={[
            [
              'Jenis & jabatan',
              `${data.summary.placement.employeeType.name} · ${data.summary.placement.position?.name ?? '-'}`,
            ],
            [
              'Bagian produksi',
              data.summary.placement.productionSection?.name ?? '-',
            ],
            ['Transaksi POSTED', formatNumber(data.summary.transactionCount)],
          ]}
        />
        <QuantityStrip items={data.summary.quantityTotals} isPending={false} />
        {data.placementTimeline.length > 1 && (
          <PlacementTimeline items={data.placementTimeline} />
        )}
        <BreakdownList jobs={data.summary.jobs} />
      </TabsContent>
      <TabsContent value='transactions' className='mt-4'>
        <TransactionTimeline items={data.transactions} />
      </TabsContent>
    </Tabs>
  )
}
function JobDetail({ data }: { data: ProductionJobRecapDetail }) {
  return (
    <Tabs defaultValue='summary'>
      <TabsList className='h-10'>
        <TabsTrigger value='summary' className='h-9 px-4'>
          <ListChecks /> Ringkasan
        </TabsTrigger>
        <TabsTrigger value='transactions' className='h-9 px-4'>
          <FileClock /> Transaksi
        </TabsTrigger>
      </TabsList>
      <TabsContent value='summary' className='mt-4 space-y-4'>
        <DetailHero
          title={data.job.name}
          subtitle={`${data.job.code} · ${quantityUnitNames(data.summary.quantityTotals)}`}
          gross={data.summary.grossAmount}
          payroll={data.summary.payrollStatus}
        />
        <DetailFacts
          rows={[
            ['Total hasil', formatQuantityTotals(data.summary.quantityTotals)],
            ['Karyawan', formatNumber(data.summary.employeeCount)],
            ['Transaksi POSTED', formatNumber(data.summary.transactionCount)],
          ]}
        />
        <section>
          <h3 className='mb-2 text-sm font-semibold'>Kontribusi karyawan</h3>
          <div className='divide-y rounded-lg border'>
            {data.employees.map((item) => (
              <div
                key={`${item.employee.uid}:${item.site.code}`}
                className='flex items-center justify-between gap-3 px-3 py-2.5 text-sm'
              >
                <div className='min-w-0'>
                  <p className='truncate font-medium'>
                    {item.employee.fullName}
                  </p>
                  <p className='truncate text-xs text-muted-foreground'>
                    {item.site.name} · {item.employee.employeeNumber}
                  </p>
                </div>
                <div className='text-right'>
                  <p className='font-semibold'>
                    {formatQuantityTotals(item.quantityTotals)}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {formatCurrency(item.grossAmount)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </TabsContent>
      <TabsContent value='transactions' className='mt-4'>
        <TransactionTimeline items={data.transactions} />
      </TabsContent>
    </Tabs>
  )
}

function DetailHero({
  title,
  subtitle,
  gross,
  payroll,
}: {
  title: string
  subtitle: string
  gross: string
  payroll: ProductionPayrollSnapshotStatus
}) {
  return (
    <div className='rounded-xl border bg-gradient-to-br from-primary/[0.06] to-transparent p-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <h2 className='text-lg font-semibold'>{title}</h2>
          <p className='text-sm text-muted-foreground'>{subtitle}</p>
        </div>
        <PayrollBadge value={payroll} />
      </div>
      <div className='mt-4'>
        <p className='text-xs text-muted-foreground'>Nilai bruto tercatat</p>
        <p className='text-2xl font-bold'>{formatCurrency(gross)}</p>
      </div>
    </div>
  )
}
function DetailFacts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className='grid gap-2 sm:grid-cols-2'>
      {rows.map(([label, value]) => (
        <div key={label} className='rounded-lg border px-3 py-2'>
          <dt className='text-xs text-muted-foreground'>{label}</dt>
          <dd className='mt-0.5 text-sm font-medium'>{value}</dd>
        </div>
      ))}
    </dl>
  )
}
function PlacementTimeline({
  items,
}: {
  items: ProductionEmployeeRecapDetail['placementTimeline']
}) {
  return (
    <section>
      <h3 className='mb-2 text-sm font-semibold'>Penempatan dalam periode</h3>
      <div className='divide-y rounded-lg border'>
        {items.map((item) => (
          <div key={item.uid} className='px-3 py-2.5 text-sm'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='font-medium'>
                {item.employeeType.name} · {item.position?.name ?? '-'}
              </p>
              <Badge variant='outline' className='text-[10px]'>
                {formatShortDate(item.effectiveFrom)} –{' '}
                {item.effectiveTo ? formatShortDate(item.effectiveTo) : 'Kini'}
              </Badge>
            </div>
            <p className='text-xs text-muted-foreground'>
              {item.productionSection?.name ?? 'Tanpa bagian'}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
function BreakdownList({ jobs }: { jobs: ProductionRecapEmployee['jobs'] }) {
  return (
    <section>
      <h3 className='mb-2 text-sm font-semibold'>Rincian pekerjaan</h3>
      <div className='divide-y rounded-lg border'>
        {jobs.map((job) => (
          <div
            key={job.job.uid}
            className='grid grid-cols-[1fr_auto] gap-3 px-3 py-2.5 text-sm'
          >
            <div className='min-w-0'>
              <p className='truncate font-medium'>{job.job.name}</p>
              <p className='text-xs text-muted-foreground'>
                {formatNumber(job.transactionCount)} transaksi
              </p>
            </div>
            <div className='text-right'>
              <p className='font-semibold'>
                {formatQuantityTotals(job.quantityTotals)}
              </p>
              <p className='text-xs text-muted-foreground'>
                {formatCurrency(job.grossAmount)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
function TransactionTimeline({
  items,
}: {
  items: ProductionRecapTransaction[]
}) {
  if (!items.length)
    return (
      <StatePanel
        icon={SearchX}
        title='Tidak ada transaksi POSTED pada detail ini.'
      />
    )
  return (
    <div className='space-y-2'>
      {items.map((item) => (
        <article key={item.uid} className='rounded-lg border p-3'>
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <p className='truncate text-sm font-semibold'>{item.job.name}</p>
              <p className='truncate text-xs text-muted-foreground'>
                {item.transactionNumber}
              </p>
            </div>
            <PayrollBadge
              value={item.payrollSnapshotted ? 'SNAPSHOTTED' : 'NONE'}
            />
          </div>
          <div className='mt-3 grid grid-cols-3 gap-2 text-xs'>
            <div>
              <p className='text-muted-foreground'>Waktu</p>
              <p className='font-medium'>
                {formatDateTime(item.transactionAt)}
              </p>
            </div>
            <div>
              <p className='text-muted-foreground'>Hasil</p>
              <p className='font-medium'>
                {formatProductionRecapQuantity(
                  item.quantity,
                  item.unit.decimalPrecision
                )}{' '}
                {item.unit.code}
              </p>
            </div>
            <div className='text-right'>
              <p className='text-muted-foreground'>Bruto</p>
              <p className='font-medium'>{formatCurrency(item.grossAmount)}</p>
            </div>
          </div>
          {item.correctionSource && (
            <p className='mt-2 rounded bg-muted px-2 py-1 text-xs text-muted-foreground'>
              Pengganti dari {item.correctionSource.transactionNumber} ·{' '}
              {item.correctionSource.reason}
            </p>
          )}
        </article>
      ))}
    </div>
  )
}

function StatePanel({
  icon: Icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: typeof SearchX
  title: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className='grid min-h-40 place-items-center rounded-lg border border-dashed p-6 text-center'>
      <div>
        <Icon className='mx-auto size-7 text-muted-foreground' />
        <p className='mt-2 text-sm text-muted-foreground'>{title}</p>
        {actionLabel && onAction && (
          <Button
            size='sm'
            variant='outline'
            className='mt-3'
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
function EmptyRecap({
  hasFilters,
  onReset,
}: {
  hasFilters: boolean
  onReset: () => void
}) {
  return hasFilters ? (
    <StatePanel
      icon={SearchX}
      title='Tidak ada data yang sesuai filter.'
      actionLabel='Reset filter'
      onAction={onReset}
    />
  ) : (
    <div className='grid min-h-48 place-items-center rounded-lg border border-dashed p-6 text-center'>
      <div>
        <Boxes className='mx-auto size-8 text-muted-foreground' />
        <p className='mt-2 font-medium'>Belum ada transaksi produksi</p>
        <p className='text-sm text-muted-foreground'>
          Transaksi POSTED akan tampil pada rekap ini.
        </p>
        <Button asChild size='sm' variant='outline' className='mt-3'>
          <a href='/produksi/transaksi'>Buka Transaksi Produksi</a>
        </Button>
      </div>
    </div>
  )
}
function LedgerSkeleton() {
  return (
    <div className='space-y-2'>
      <Skeleton className='h-8 w-full' />
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className='h-16 w-full' />
      ))}
    </div>
  )
}
function DetailSkeleton() {
  return (
    <div className='space-y-3'>
      <Skeleton className='h-10 w-64' />
      <Skeleton className='h-36 w-full' />
      <Skeleton className='h-24 w-full' />
      <Skeleton className='h-48 w-full' />
    </div>
  )
}

function DateControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: string
  min?: string
  max?: string
  onChange: (value: string) => void
}) {
  return (
    <label className='grid gap-1 text-sm'>
      <span className='font-medium'>{label}</span>
      <DatePicker
        selected={dateOnlyFromInput(value)}
        onSelect={(date) => {
          const next = dateOnlyToInput(date)
          if (next) onChange(next)
        }}
        disabledDates={(date) => {
          const current = dateOnlyToInput(date)
          return Boolean(
            current && ((min && current < min) || (max && current > max))
          )
        }}
        triggerClassName='h-9 w-full sm:w-44'
      />
    </label>
  )
}
function hasFilters(params: ProductionRecapParams) {
  return Boolean(
    params.query ||
    params.site?.length ||
    params.jobUid?.length ||
    params.employeeType?.length ||
    params.productionSectionUid?.length
  )
}
function hasFiltersFromSearch(search: Record<string, unknown>) {
  return [
    'filter',
    'site',
    'jobUid',
    'employeeType',
    'productionSectionUid',
  ].some((key) =>
    Array.isArray(search[key])
      ? (search[key] as unknown[]).length > 0
      : Boolean(search[key])
  )
}
function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}
function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback
}
function arrayValue<T = string>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : undefined
}
function addDays(value: string, amount: number) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + amount)
  return date.toISOString().slice(0, 10)
}
function formatNumber(value: string | number) {
  return new Intl.NumberFormat('id-ID').format(Number(value))
}
function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}
function formatCompactCurrency(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value))
}
function formatLongDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(
    new Date(`${value}T00:00:00`)
  )
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
}
function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}
function formatQuantityTotals(items: ProductionRecapQuantity[]) {
  return items.length
    ? items
        .map(
          (item) =>
            `${formatProductionRecapQuantity(item.quantity, item.unit.decimalPrecision)} ${item.unit.code}`
        )
        .join(' · ')
    : '-'
}
function quantityUnitNames(items: ProductionRecapQuantity[]) {
  return items.length ? items.map((item) => item.unit.name).join(', ') : '-'
}
function paginationSummary(
  page: number,
  pageSize: number,
  total: number,
  noun: string
) {
  return total
    ? `Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} dari ${formatNumber(total)} ${noun}.`
    : `Tidak ada ${noun}.`
}
