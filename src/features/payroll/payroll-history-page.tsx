import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { format, parseISO } from 'date-fns'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { id } from 'date-fns/locale'
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileClock,
  GitCompareArrows,
  LoaderCircle,
  Printer,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useSiteScopeFilter } from '@/hooks/use-site-scope-filter'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  DataTableActionButton,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import {
  exportPayrollRun,
  usePayrollHistory,
  usePayrollRunComparison,
  usePayrollRuns,
} from './data/queries'
import type {
  PayrollHistoryPeriod,
  PayrollPeriodStatus,
  PayrollRunComparison,
  PayrollRunSummary,
} from './domain'
import { formatDecimalString } from './money'
import { PayrollHandoverDialog } from './payroll-handover-dialog'
import {
  canExportPayrollPayment,
  emptyPayrollHistoryFilters,
  updatePayrollComparisonSelection,
} from './payroll-history-policy'
import {
  payrollBaseAmount,
  payrollBaseLabel,
  payrollSchemeName,
} from './payroll-presentation'
import { PayrollProductionDailySummaryDialog } from './payroll-production-daily-summary-dialog'

type SearchState = Record<string, unknown>

const statusLabel: Record<PayrollPeriodStatus, string> = {
  DRAFT: 'Draft',
  CALCULATED: 'Sudah dihitung',
  APPROVED: 'Disetujui',
  CLOSED: 'Ditutup',
  CANCELLED: 'Dibatalkan',
}

const statuses: PayrollPeriodStatus[] = [
  'DRAFT',
  'CALCULATED',
  'APPROVED',
  'CLOSED',
  'CANCELLED',
]

function money(value: string | number) {
  return formatDecimalString(value, {
    currency: true,
    maximumFractionDigits: 2,
  })
}

function localDate(value: string) {
  return format(parseISO(value), 'd MMM yyyy', { locale: id })
}

function localDateTime(value: string | null) {
  return value
    ? format(parseISO(value), 'd MMM yyyy, HH.mm', { locale: id })
    : 'Belum selesai'
}

function apiError(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}

export function PayrollHistoryPage({
  search,
  navigate,
}: {
  search: SearchState
  navigate: NavigateFn
}) {
  const query = typeof search.query === 'string' ? search.query : ''
  const requestedSiteCode =
    typeof search.siteCode === 'string' ? search.siteCode : ''
  const { lockedSite, effectiveSite } = useSiteScopeFilter(
    requestedSiteCode ? [requestedSiteCode] : undefined
  )
  const siteCode = effectiveSite ?? ''
  const status = typeof search.status === 'string' ? search.status : ''
  const dateFrom = typeof search.dateFrom === 'string' ? search.dateFrom : ''
  const dateTo = typeof search.dateTo === 'string' ? search.dateTo : ''
  const page = typeof search.page === 'number' ? search.page : 1
  const pageSize = typeof search.pageSize === 'number' ? search.pageSize : 50
  const sortBy =
    typeof search.sortBy === 'string' ? search.sortBy : 'periodStart'
  const sortDirection = search.sortDirection === 'asc' ? 'asc' : 'desc'
  const [handoverRunUid, setHandoverRunUid] = useState<string | undefined>()
  const [productionSummaryRunUid, setProductionSummaryRunUid] = useState<
    string | undefined
  >()
  const [exportingRunUid, setExportingRunUid] = useState<string | undefined>()
  const detailUid =
    typeof search.periodUid === 'string' ? search.periodUid : undefined
  const baseRunUid =
    typeof search.baseRunUid === 'string' ? search.baseRunUid : undefined
  const targetRunUid =
    typeof search.targetRunUid === 'string' ? search.targetRunUid : undefined

  const history = usePayrollHistory({
    query: query || undefined,
    siteCode: siteCode || undefined,
    status: status || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    pageSize,
    sortBy,
    sortDirection,
  })
  const patch = (value: SearchState) =>
    navigate({ search: (previous) => ({ ...previous, ...value }) })
  const resetPage = (value: SearchState) => patch({ ...value, page: undefined })

  const summary = useMemo(() => {
    const items = history.data?.data ?? []
    return {
      periods: history.data?.meta.total ?? 0,
      closed: items.filter((item) => item.status === 'CLOSED').length,
      runs: items.reduce((total, item) => total + item.runCount, 0),
      failed: items.reduce((total, item) => total + item.failedRunCount, 0),
    }
  }, [history.data])
  const hasFilters = Boolean(dateFrom || dateTo)
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'query' },
  })
  const sorting: SortingState = [{ id: sortBy, desc: sortDirection === 'desc' }]
  const openHistory = (period: PayrollHistoryPeriod) =>
    patch({
      periodUid: period.uid,
      baseRunUid: undefined,
      targetRunUid: undefined,
    })
  const canHandover = (period: PayrollHistoryPeriod) =>
    (history.data?.meta.capabilities.canPrint ||
      history.data?.meta.capabilities.canExport) &&
    ['CALCULATED', 'APPROVED', 'CLOSED'].includes(period.status) &&
    period.employeeType === 'BORONGAN' &&
    period.payrollBasis === 'PIECE_RATE' &&
    period.currentRun?.status === 'COMPLETED' &&
    period.currentRun.isCurrent
  const canShowProductionSummary = (period: PayrollHistoryPeriod) =>
    period.employeeType === 'BORONGAN' &&
    period.payrollBasis === 'PIECE_RATE' &&
    period.currentRun?.status === 'COMPLETED'
  const downloadRecap = async (runUid: string) => {
    try {
      setExportingRunUid(runUid)
      await exportPayrollRun(runUid, 'SUMMARY')
      toast.success('Rekap Payroll berhasil diunduh.')
    } catch (error) {
      toast.error(apiError(error, 'Unduh rekap Payroll gagal.'))
    } finally {
      setExportingRunUid(undefined)
    }
  }
  const columns: ColumnDef<PayrollHistoryPeriod>[] = [
    {
      accessorKey: 'periodName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Periode' />
      ),
      cell: ({ row }) => (
        <div
          className='max-w-44 min-w-0'
          title={`${row.original.periodName} · ${row.original.periodCode}`}
        >
          <p className='truncate font-semibold'>{row.original.periodName}</p>
          <p className='truncate text-xs text-muted-foreground'>
            {row.original.periodCode}
          </p>
        </div>
      ),
    },
    {
      id: 'site',
      accessorFn: (period) => period.site.code,
      header: 'Site',
      enableHiding: false,
    },
    {
      accessorKey: 'periodStart',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Rentang & skema' />
      ),
      cell: ({ row }) => (
        <div className='whitespace-nowrap'>
          <p>
            {localDate(row.original.periodStart)} –{' '}
            {localDate(row.original.periodEnd)}
          </p>
          <p className='text-xs text-muted-foreground'>
            {payrollSchemeName(row.original)}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => <PeriodBadge status={row.original.status} />,
    },
    {
      id: 'netPay',
      header: () => (
        <span className='block text-right'>Perhitungan & neto</span>
      ),
      enableSorting: false,
      cell: ({ row }) => (
        <div className='text-right whitespace-nowrap'>
          <p className='font-semibold'>
            {row.original.currentRun
              ? money(row.original.currentRun.totalNetPay)
              : '—'}
          </p>
          <span className='text-xs text-muted-foreground'>
            {row.original.runCount} perhitungan
          </span>
          {row.original.failedRunCount > 0 && (
            <p className='text-xs text-destructive'>
              {row.original.failedRunCount} gagal
            </p>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: () => <span className='block text-right'>Aksi</span>,
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex justify-end gap-1'>
          <DataTableActionButton
            label={`Lihat histori ${row.original.periodName}`}
            onClick={() => openHistory(row.original)}
          >
            <Eye className='size-4' />
          </DataTableActionButton>
          {history.data?.meta.capabilities.canExport &&
            row.original.currentRun?.status === 'COMPLETED' && (
              <DataTableActionButton
                label={`Unduh rekap aktif ${row.original.periodName}`}
                disabled={exportingRunUid === row.original.currentRun.uid}
                onClick={() => void downloadRecap(row.original.currentRun!.uid)}
              >
                {exportingRunUid === row.original.currentRun.uid ? (
                  <LoaderCircle className='size-4 animate-spin' />
                ) : (
                  <Download className='size-4' />
                )}
              </DataTableActionButton>
            )}
          {canShowProductionSummary(row.original) && (
            <DataTableActionButton
              label={`Ringkasan produksi ${row.original.periodName}`}
              onClick={() =>
                setProductionSummaryRunUid(row.original.currentRun!.uid)
              }
            >
              <BarChart3 className='size-4' />
            </DataTableActionButton>
          )}
          {canHandover(row.original) && (
            <DataTableActionButton
              label={`Lembar serah terima upah ${row.original.periodName}`}
              onClick={() => setHandoverRunUid(row.original.currentRun!.uid)}
            >
              <Printer className='size-4' />
            </DataTableActionButton>
          )}
        </div>
      ),
    },
  ]
  // TanStack Table mengembalikan fungsi stateful; ini pola resmi starter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: history.data?.data ?? [],
    columns,
    state: {
      globalFilter: url.globalFilter,
      pagination: url.pagination,
      sorting,
      columnVisibility: { site: false },
      columnFilters: [
        ...(siteCode ? [{ id: 'site', value: [siteCode] }] : []),
        ...(status ? [{ id: 'status', value: [status] }] : []),
      ],
    },
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    pageCount: history.data?.meta.totalPages ?? 0,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: (updater) => {
      const current = [
        ...(siteCode ? [{ id: 'site', value: [siteCode] }] : []),
        ...(status ? [{ id: 'status', value: [status] }] : []),
      ]
      const next = typeof updater === 'function' ? updater(current) : updater
      const nextSite = next.find((item) => item.id === 'site')?.value as
        | string[]
        | undefined
      const nextStatus = next.find((item) => item.id === 'status')?.value as
        | string[]
        | undefined
      resetPage({
        siteCode: lockedSite ? undefined : nextSite?.[nextSite.length - 1],
        status: nextStatus?.[nextStatus.length - 1],
      })
    },
    onPaginationChange: url.onPaginationChange,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      patch({
        sortBy: next[0]?.id ?? 'periodStart',
        sortDirection: next[0]?.desc ? 'desc' : 'asc',
        page: undefined,
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (period) => period.uid,
  })
  useEffect(() => {
    url.ensurePageInRange(history.data?.meta.totalPages ?? 0)
  }, [history.data?.meta.totalPages, url])

  return (
    <Main>
      <div className='space-y-4'>
        <header>
          <p className='text-sm font-medium text-primary'>Payroll</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Riwayat Payroll
          </h1>
          <p className='text-sm text-muted-foreground'>
            Telusuri periode, histori perhitungan, perubahan nominal, dan hasil
            yang telah disahkan.
          </p>
        </header>

        <div
          className='grid grid-cols-2 gap-2 lg:grid-cols-4'
          aria-label='Ringkasan riwayat Payroll'
        >
          <Kpi
            icon={CalendarDays}
            label='Periode ditemukan'
            value={summary.periods}
            tone='blue'
          />
          <Kpi
            icon={CheckCircle2}
            label='Ditutup di halaman ini'
            value={summary.closed}
            tone='green'
          />
          <Kpi
            icon={FileClock}
            label='Perhitungan di halaman ini'
            value={summary.runs}
            tone='violet'
          />
          <Kpi
            icon={AlertCircle}
            label='Perhitungan gagal'
            value={summary.failed}
            tone='amber'
          />
        </div>

        <DataTableToolbar
          table={table}
          searchPlaceholder='Cari kode atau nama periode...'
          searchDebounceMs={300}
          hasAdditionalFilters={hasFilters}
          onResetAdditionalFilters={() => patch(emptyPayrollHistoryFilters())}
          filters={[
            {
              columnId: 'site',
              title: 'Site',
              options: (history.data?.meta.sites ?? []).map((site) => ({
                value: site.code,
                label: site.name,
              })),
            },
            {
              columnId: 'status',
              title: 'Status',
              options: statuses.map((item) => ({
                value: item,
                label: statusLabel[item],
              })),
            },
          ]}
          additionalFilters={
            <div className='grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto'>
              <DatePicker
                selected={dateFrom ? parseISO(dateFrom) : undefined}
                onSelect={(value) =>
                  resetPage({
                    dateFrom: value ? format(value, 'yyyy-MM-dd') : undefined,
                  })
                }
                placeholder='Dari tanggal'
                triggerClassName='h-8 sm:w-38'
              />
              <DatePicker
                selected={dateTo ? parseISO(dateTo) : undefined}
                onSelect={(value) =>
                  resetPage({
                    dateTo: value ? format(value, 'yyyy-MM-dd') : undefined,
                  })
                }
                placeholder='Sampai tanggal'
                triggerClassName='h-8 sm:w-38'
              />
            </div>
          }
        />

        {history.isPending ? (
          <HistorySkeleton />
        ) : history.isError ? (
          <ErrorState onRetry={() => history.refetch()} />
        ) : history.data?.data.length ? (
          <>
            <div className='hidden overflow-x-auto rounded-md border md:block'>
              <Table className='text-sm'>
                <TableHeader>
                  {table.getHeaderGroups().map((group) => (
                    <TableRow key={group.id}>
                      {group.headers.map((header) => (
                        <TableHead key={header.id} className='h-10'>
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
                        <TableCell key={cell.id} className='py-2.5'>
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
            <div className='grid gap-2 md:hidden'>
              {history.data.data.map((period) => (
                <PeriodCard
                  key={period.uid}
                  period={period}
                  onOpen={() => openHistory(period)}
                  onExport={
                    history.data.meta.capabilities.canExport &&
                    period.currentRun?.status === 'COMPLETED'
                      ? () => void downloadRecap(period.currentRun!.uid)
                      : undefined
                  }
                  exporting={exportingRunUid === period.currentRun?.uid}
                  onProductionSummary={
                    canShowProductionSummary(period)
                      ? () => setProductionSummaryRunUid(period.currentRun!.uid)
                      : undefined
                  }
                  onHandover={
                    canHandover(period)
                      ? () => setHandoverRunUid(period.currentRun!.uid)
                      : undefined
                  }
                />
              ))}
            </div>
          </>
        ) : (
          <div className='rounded-lg border border-dashed px-4 py-12 text-center'>
            <FileClock className='mx-auto size-8 text-muted-foreground' />
            <p className='mt-3 font-medium'>Riwayat Payroll tidak ditemukan</p>
            <p className='text-sm text-muted-foreground'>
              Ubah filter atau buat dan hitung periode Payroll terlebih dahulu.
            </p>
          </div>
        )}

        {!history.isPending &&
          !history.isError &&
          Boolean(history.data?.meta.total) && (
            <DataTablePagination
              table={table}
              pageSizeOptions={[50, 100, 200, 300, 500]}
              summary={`Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, history.data!.meta.total)} dari ${history.data!.meta.total} periode.`}
            />
          )}
      </div>

      <HistoryDrawer
        period={history.data?.data.find((item) => item.uid === detailUid)}
        periodUid={detailUid}
        selectedRunUids={[baseRunUid, targetRunUid].filter(
          (value): value is string => Boolean(value)
        )}
        onSelectionChange={(selectedRunUids) =>
          patch({
            baseRunUid: selectedRunUids[0],
            targetRunUid: selectedRunUids[1],
          })
        }
        capabilities={history.data?.meta.capabilities}
        onHandover={(runUid) => setHandoverRunUid(runUid)}
        onClose={() =>
          patch({
            periodUid: undefined,
            baseRunUid: undefined,
            targetRunUid: undefined,
          })
        }
      />
      <PayrollHandoverDialog
        key={handoverRunUid ?? 'closed'}
        runUid={handoverRunUid}
        canPrint={history.data?.meta.capabilities.canPrint === true}
        canExport={history.data?.meta.capabilities.canExport === true}
        onClose={() => setHandoverRunUid(undefined)}
      />
      <PayrollProductionDailySummaryDialog
        key={productionSummaryRunUid ?? 'closed'}
        runUid={productionSummaryRunUid}
        onClose={() => setProductionSummaryRunUid(undefined)}
      />
    </Main>
  )
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: number
  tone: 'blue' | 'green' | 'violet' | 'amber'
}) {
  const tones = {
    blue: 'border-blue-200 bg-blue-50/50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-100',
    green:
      'border-emerald-200 bg-emerald-50/50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100',
    violet:
      'border-violet-200 bg-violet-50/50 text-violet-950 dark:border-violet-900 dark:bg-violet-950/20 dark:text-violet-100',
    amber:
      'border-amber-200 bg-amber-50/50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100',
  }
  return (
    <div
      className={cn(
        'flex min-h-[68px] items-center justify-between rounded-lg border px-3 py-2.5',
        tones[tone]
      )}
    >
      <div>
        <p className='text-xs opacity-70'>{label}</p>
        <p className='text-xl font-bold'>{value.toLocaleString('id-ID')}</p>
      </div>
      <Icon className='size-4 opacity-70' />
    </div>
  )
}

function PeriodCard({
  period,
  onOpen,
  onExport,
  exporting = false,
  onProductionSummary,
  onHandover,
}: {
  period: PayrollHistoryPeriod
  onOpen: () => void
  onExport?: () => void
  exporting?: boolean
  onProductionSummary?: () => void
  onHandover?: () => void
}) {
  return (
    <article className='grid gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <h2 className='truncate font-semibold'>{period.periodName}</h2>
          <PeriodBadge status={period.status} />
          {period.currentRun?.runType === 'FINAL' && (
            <Badge className='bg-emerald-700'>FINAL</Badge>
          )}
          <Badge variant='outline'>{payrollSchemeName(period)}</Badge>
        </div>
        <p className='mt-1 text-sm text-muted-foreground'>
          {period.site.name} · {period.periodCode} ·{' '}
          {localDate(period.periodStart)}–{localDate(period.periodEnd)}
        </p>
        <div className='mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
          <span>{period.runCount} perhitungan</span>
          <span>{period.completedRunCount} selesai</span>
          {period.failedRunCount > 0 && (
            <span className='font-medium text-destructive'>
              {period.failedRunCount} gagal
            </span>
          )}
          {period.currentRun && (
            <span>
              Neto terbaru:{' '}
              <b className='text-foreground'>
                {money(period.currentRun.totalNetPay)}
              </b>
            </span>
          )}
        </div>
      </div>
      <div className='flex flex-wrap gap-2'>
        <Button variant='outline' size='sm' onClick={onOpen}>
          <Eye className='mr-2 size-4' />
          Lihat histori
        </Button>
        {onExport && (
          <Button
            variant='outline'
            size='sm'
            disabled={exporting}
            onClick={onExport}
          >
            {exporting ? (
              <LoaderCircle className='mr-2 size-4 animate-spin' />
            ) : (
              <Download className='mr-2 size-4' />
            )}
            Rekap
          </Button>
        )}
        {onProductionSummary && (
          <Button variant='outline' size='sm' onClick={onProductionSummary}>
            <BarChart3 className='mr-2 size-4' />
            Ringkasan produksi
          </Button>
        )}
        {onHandover && (
          <Button variant='outline' size='sm' onClick={onHandover}>
            <Printer className='mr-2 size-4' />
            Daftar upah
          </Button>
        )}
      </div>
    </article>
  )
}

function HistoryDrawer({
  period,
  periodUid,
  selectedRunUids,
  onSelectionChange,
  capabilities,
  onHandover,
  onClose,
}: {
  period?: PayrollHistoryPeriod
  periodUid?: string
  selectedRunUids: string[]
  onSelectionChange: (selectedRunUids: string[]) => void
  capabilities?: {
    canExport: boolean
    canPaymentExport: boolean
    canPrint: boolean
  }
  onHandover: (runUid: string) => void
  onClose: () => void
}) {
  const runs = usePayrollRuns(periodUid)
  const comparison = usePayrollRunComparison(
    periodUid,
    selectedRunUids[0],
    selectedRunUids[1]
  )
  const toggle = (uid: string) =>
    onSelectionChange(updatePayrollComparisonSelection(selectedRunUids, uid))
  return (
    <Sheet
      open={Boolean(periodUid)}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent className='w-full overflow-y-auto sm:max-w-3xl'>
        <SheetHeader>
          <SheetTitle>Histori {period?.periodName ?? 'Payroll'}</SheetTitle>
          <SheetDescription>
            {period
              ? `${period.site.name} · ${localDate(period.periodStart)}–${localDate(period.periodEnd)}`
              : 'Memuat detail periode...'}
          </SheetDescription>
        </SheetHeader>
        <div className='space-y-4 p-4 pt-2'>
          {period?.status === 'CLOSED' && (
            <Alert className='border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20'>
              <CheckCircle2 className='size-4' />
              <AlertDescription>
                Hasil resmi telah dikunci. Status ini bukan tanda pembayaran
                sudah dilakukan.
              </AlertDescription>
            </Alert>
          )}
          <div className='flex items-center justify-between gap-3'>
            <div>
              <h3 className='font-semibold'>Timeline perhitungan</h3>
              <p className='text-xs text-muted-foreground'>
                Pilih tepat dua hasil perhitungan untuk dibandingkan.
              </p>
            </div>
            <Badge variant='outline'>{selectedRunUids.length}/2 dipilih</Badge>
          </div>
          {runs.isPending ? (
            <HistorySkeleton />
          ) : runs.data?.length ? (
            <div className='space-y-2'>
              {runs.data.map((run) => (
                <RunCard
                  key={run.uid}
                  run={run}
                  scheme={period}
                  checked={selectedRunUids.includes(run.uid)}
                  selectable={run.status === 'COMPLETED'}
                  onToggle={() => toggle(run.uid)}
                  capabilities={capabilities}
                  periodClosed={period?.status === 'CLOSED'}
                  onHandover={onHandover}
                />
              ))}
            </div>
          ) : (
            <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
              Belum ada hasil perhitungan.
            </p>
          )}
          {selectedRunUids.length === 2 && (
            <ComparisonPanel
              data={comparison.data}
              pending={comparison.isPending}
              error={comparison.isError}
              retry={() => comparison.refetch()}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function RunCard({
  run,
  scheme,
  checked,
  selectable,
  onToggle,
  capabilities,
  periodClosed,
  onHandover,
}: {
  run: PayrollRunSummary
  scheme?: Pick<
    PayrollHistoryPeriod,
    'payrollBasis' | 'payFrequency' | 'employeeType'
  >
  checked: boolean
  selectable: boolean
  onToggle: () => void
  capabilities?: {
    canExport: boolean
    canPaymentExport: boolean
    canPrint: boolean
  }
  periodClosed: boolean
  onHandover: (runUid: string) => void
}) {
  const [exporting, setExporting] = useState<'SUMMARY' | 'PAYMENT' | null>(null)
  const exportFile = async (type: 'SUMMARY' | 'PAYMENT') => {
    try {
      setExporting(type)
      await exportPayrollRun(run.uid, type)
      toast.success('File Payroll berhasil diunduh.')
    } catch (error) {
      toast.error(apiError(error, 'Export Payroll gagal.'))
    } finally {
      setExporting(null)
    }
  }
  const final = canExportPayrollPayment(
    run,
    periodClosed,
    capabilities?.canPaymentExport === true
  )
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        checked && 'border-primary bg-primary/[0.03]'
      )}
    >
      <div className='flex gap-3'>
        <Checkbox
          checked={checked}
          disabled={!selectable}
          onCheckedChange={onToggle}
          aria-label={`Pilih perhitungan ${run.runNumber} untuk perbandingan`}
          className='mt-1'
        />
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <p className='font-semibold'>Perhitungan #{run.runNumber}</p>
            <Badge
              variant={
                run.status === 'COMPLETED'
                  ? 'secondary'
                  : run.status === 'FAILED'
                    ? 'destructive'
                    : 'outline'
              }
            >
              {run.status === 'COMPLETED'
                ? 'Selesai'
                : run.status === 'FAILED'
                  ? 'Gagal'
                  : run.status}
            </Badge>
            {run.isCurrent && <Badge variant='outline'>Terbaru</Badge>}
            {run.runType === 'FINAL' && (
              <Badge className='bg-emerald-700'>FINAL</Badge>
            )}
          </div>
          <p className='text-xs text-muted-foreground'>
            {localDateTime(run.finishedAt)} ·{' '}
            {run.employeeCount.toLocaleString('id-ID')} karyawan
          </p>
          <div className='mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4'>
            <RunAmount
              label={payrollBaseLabel(scheme ?? run)}
              value={payrollBaseAmount(run, scheme ?? run)}
            />
            <RunAmount label='Pendapatan tambahan' value={run.totalEarnings} />
            <RunAmount label='Potongan' value={run.totalDeductions} />
            <RunAmount label='Neto' value={run.totalNetPay} strong />
          </div>
          {selectable &&
            (capabilities?.canExport || capabilities?.canPrint) && (
              <div className='mt-3 flex flex-wrap gap-2'>
                {capabilities?.canExport && (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={Boolean(exporting)}
                    onClick={() => exportFile('SUMMARY')}
                  >
                    {exporting === 'SUMMARY' ? (
                      <LoaderCircle className='mr-2 size-4 animate-spin' />
                    ) : (
                      <Download className='mr-2 size-4' />
                    )}
                    Rekap
                  </Button>
                )}
                {capabilities?.canPaymentExport && final && (
                  <Button
                    variant='outline'
                    size='sm'
                    disabled={Boolean(exporting)}
                    onClick={() => exportFile('PAYMENT')}
                  >
                    {exporting === 'PAYMENT' ? (
                      <LoaderCircle className='mr-2 size-4 animate-spin' />
                    ) : (
                      <Download className='mr-2 size-4' />
                    )}
                    Daftar pembayaran
                  </Button>
                )}
                {scheme?.employeeType === 'BORONGAN' &&
                  scheme.payrollBasis === 'PIECE_RATE' && (
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => onHandover(run.uid)}
                    >
                      <Printer className='mr-2 size-4' />
                      Serah terima{run.isCurrent ? '' : ' (historis)'}
                    </Button>
                  )}
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

function RunAmount({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className={cn('truncate', strong && 'font-semibold')}>
        {money(value)}
      </p>
    </div>
  )
}

export function ComparisonPanel({
  data,
  pending,
  error,
  retry,
}: {
  data?: PayrollRunComparison
  pending: boolean
  error: boolean
  retry: () => void
}) {
  if (pending)
    return (
      <div className='rounded-lg border p-4'>
        <Skeleton className='h-20 w-full' />
      </div>
    )
  if (error || !data) return <ErrorState onRetry={retry} compact />
  const changed = data.employees.filter((item) => item.change !== 'UNCHANGED')
  const baseDelta =
    data.period.payrollBasis === 'TIME_BASED'
      ? (data.summary.totalBasicSalaryAmountDelta ?? '0')
      : data.summary.totalPieceRateAmountDelta
  return (
    <section className='space-y-3 rounded-xl border bg-muted/20 p-3'>
      <div className='flex items-center gap-2'>
        <GitCompareArrows className='size-4 text-primary' />
        <h3 className='font-semibold'>
          Perbandingan Perhitungan #{data.baseRun.runNumber} → Perhitungan #
          {data.targetRun.runNumber}
        </h3>
      </div>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-5'>
        <Delta
          label='Karyawan'
          value={String(data.summary.employeeCountDelta)}
        />
        <Delta
          label={payrollBaseLabel(data.period)}
          value={baseDelta}
          moneyValue
        />
        <Delta
          label='Pendapatan tambahan'
          value={data.summary.totalEarningsDelta}
          moneyValue
        />
        <Delta
          label='Potongan'
          value={data.summary.totalDeductionsDelta}
          moneyValue
        />
        <Delta label='Neto' value={data.summary.totalNetPayDelta} moneyValue />
      </div>
      <div>
        <p className='mb-2 text-sm font-medium'>
          Perubahan per karyawan ({changed.length})
        </p>
        {changed.length ? (
          <div className='max-h-72 space-y-1 overflow-y-auto'>
            {changed.map((item) => (
              <div
                key={item.employeeUid}
                className='grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md bg-background px-3 py-2 text-sm'
              >
                <div className='min-w-0'>
                  <p className='truncate font-medium'>{item.fullName}</p>
                  <p className='text-xs text-muted-foreground'>
                    {item.employeeNumber} ·{' '}
                    {item.change === 'ADDED'
                      ? 'Ditambahkan'
                      : item.change === 'REMOVED'
                        ? 'Dihapus dari hasil'
                        : 'Nominal berubah'}
                  </p>
                </div>
                <div className='text-right'>
                  <p
                    className={cn(
                      'font-medium',
                      item.deltas.netPay.startsWith('-')
                        ? 'text-destructive'
                        : 'text-emerald-700'
                    )}
                  >
                    {signedMoney(item.deltas.netPay)}
                  </p>
                  <p className='text-xs text-muted-foreground'>selisih neto</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className='rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground'>
            Tidak ada hasil karyawan yang berubah.
          </p>
        )}
      </div>
    </section>
  )
}

function signedMoney(value: string) {
  const zero = Number(value) === 0
  return zero
    ? money(value)
    : `${value.startsWith('-') ? '−' : '+'}${money(value.replace('-', ''))}`
}
function Delta({
  label,
  value,
  moneyValue = false,
}: {
  label: string
  value: string
  moneyValue?: boolean
}) {
  const negative = value.startsWith('-')
  const zero = Number(value) === 0
  return (
    <div className='rounded-md border bg-background p-2'>
      <p className='text-[11px] text-muted-foreground'>{label}</p>
      <p
        className={cn(
          'truncate text-sm font-semibold',
          !zero && (negative ? 'text-destructive' : 'text-emerald-700')
        )}
      >
        {moneyValue
          ? signedMoney(value)
          : `${!zero && !negative ? '+' : ''}${value}`}
      </p>
    </div>
  )
}

function PeriodBadge({ status }: { status: PayrollPeriodStatus }) {
  return (
    <Badge
      variant='outline'
      className={cn(
        'font-medium',
        status === 'DRAFT' &&
          'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
        status === 'CALCULATED' &&
          'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
        status === 'APPROVED' &&
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
        status === 'CLOSED' &&
          'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200',
        status === 'CANCELLED' &&
          'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200'
      )}
    >
      {statusLabel[status]}
    </Badge>
  )
}
function HistorySkeleton() {
  return (
    <div className='space-y-2'>
      {[1, 2, 3].map((item) => (
        <Skeleton key={item} className='h-28 w-full rounded-lg' />
      ))}
    </div>
  )
}
function ErrorState({
  onRetry,
  compact = false,
}: {
  onRetry: () => void
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-dashed px-4 text-center',
        compact ? 'py-6' : 'py-12'
      )}
    >
      <AlertCircle className='mx-auto size-7 text-destructive' />
      <p className='mt-2 font-medium'>Data riwayat gagal dimuat</p>
      <Button variant='outline' size='sm' className='mt-3' onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  )
}
