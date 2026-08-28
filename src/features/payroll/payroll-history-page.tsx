import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileClock,
  GitCompareArrows,
  LoaderCircle,
  Search,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
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
import {
  canExportPayrollPayment,
  emptyPayrollHistoryFilters,
  updatePayrollComparisonSelection,
} from './payroll-history-policy'
import { formatDecimalString } from './money'

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
  return formatDecimalString(value, { currency: true, maximumFractionDigits: 2 })
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
  const siteCode = typeof search.siteCode === 'string' ? search.siteCode : ''
  const status = typeof search.status === 'string' ? search.status : ''
  const dateFrom = typeof search.dateFrom === 'string' ? search.dateFrom : ''
  const dateTo = typeof search.dateTo === 'string' ? search.dateTo : ''
  const page = typeof search.page === 'number' ? search.page : 1
  const pageSize = typeof search.pageSize === 'number' ? search.pageSize : 50
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
  const hasFilters = Boolean(query || siteCode || status || dateFrom || dateTo)

  return (
    <Main>
      <div className='space-y-4'>
        <header>
          <p className='text-sm font-medium text-primary'>Payroll Borongan</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Riwayat Payroll
          </h1>
          <p className='text-sm text-muted-foreground'>
            Telusuri periode, histori perhitungan, perubahan nominal, dan hasil
            yang telah disahkan.
          </p>
        </header>

        <Alert className='border-sky-200 bg-sky-50/70 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100'>
          <AlertCircle className='size-4' />
          <AlertDescription>
            Status Ditutup mengesahkan hasil Payroll, tetapi tidak menyatakan
            dana sudah ditransfer atau diterima karyawan.
          </AlertDescription>
        </Alert>

        <div className='grid grid-cols-2 gap-2 lg:grid-cols-4' aria-label='Ringkasan riwayat Payroll'>
          <Kpi icon={CalendarDays} label='Periode ditemukan' value={summary.periods} tone='blue' />
          <Kpi icon={CheckCircle2} label='Ditutup di halaman ini' value={summary.closed} tone='green' />
          <Kpi icon={FileClock} label='Run di halaman ini' value={summary.runs} tone='violet' />
          <Kpi icon={AlertCircle} label='Run gagal' value={summary.failed} tone='amber' />
        </div>

        <section className='grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_180px_180px_170px_170px_auto]'>
          <div className='relative'>
            <Search className='absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={query}
              onChange={(event) => resetPage({ query: event.target.value || undefined })}
              placeholder='Cari kode atau nama periode...'
              className='pl-9'
              aria-label='Cari riwayat Payroll'
            />
          </div>
          <Select value={siteCode || 'ALL'} onValueChange={(value) => resetPage({ siteCode: value === 'ALL' ? undefined : value })}>
            <SelectTrigger aria-label='Filter site'><SelectValue placeholder='Semua site' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>Semua site</SelectItem>
              {history.data?.meta.sites.map((site) => (
                <SelectItem key={site.uid} value={site.code}>{site.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status || 'ALL'} onValueChange={(value) => resetPage({ status: value === 'ALL' ? undefined : value })}>
            <SelectTrigger aria-label='Filter status'><SelectValue placeholder='Semua status' /></SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>Semua status</SelectItem>
              {statuses.map((item) => <SelectItem key={item} value={item}>{statusLabel[item]}</SelectItem>)}
            </SelectContent>
          </Select>
          <DatePicker selected={dateFrom ? parseISO(dateFrom) : undefined} onSelect={(value) => resetPage({ dateFrom: value ? format(value, 'yyyy-MM-dd') : undefined })} placeholder='Dari tanggal' />
          <DatePicker selected={dateTo ? parseISO(dateTo) : undefined} onSelect={(value) => resetPage({ dateTo: value ? format(value, 'yyyy-MM-dd') : undefined })} placeholder='Sampai tanggal' />
          {hasFilters && (
            <Button variant='ghost' onClick={() => patch(emptyPayrollHistoryFilters())}>
              Reset
            </Button>
          )}
        </section>

        {history.isPending ? (
          <HistorySkeleton />
        ) : history.isError ? (
          <ErrorState onRetry={() => history.refetch()} />
        ) : history.data?.data.length ? (
          <div className='space-y-2'>
            {history.data.data.map((period) => (
              <PeriodCard
                key={period.uid}
                period={period}
                onOpen={() =>
                  patch({
                    periodUid: period.uid,
                    baseRunUid: undefined,
                    targetRunUid: undefined,
                  })
                }
              />
            ))}
          </div>
        ) : (
          <div className='rounded-lg border border-dashed px-4 py-12 text-center'>
            <FileClock className='mx-auto size-8 text-muted-foreground' />
            <p className='mt-3 font-medium'>Riwayat Payroll tidak ditemukan</p>
            <p className='text-sm text-muted-foreground'>Ubah filter atau buat dan hitung periode Payroll terlebih dahulu.</p>
          </div>
        )}

        {history.data && history.data.meta.totalPages > 1 && (
          <div className='flex items-center justify-between gap-3 text-sm text-muted-foreground'>
            <span>Halaman {history.data.meta.page} dari {history.data.meta.totalPages}</span>
            <div className='flex gap-2'>
              <Button variant='outline' size='sm' disabled={page <= 1} onClick={() => patch({ page: page - 1 })}>Sebelumnya</Button>
              <Button variant='outline' size='sm' disabled={page >= history.data.meta.totalPages} onClick={() => patch({ page: page + 1 })}>Berikutnya</Button>
            </div>
          </div>
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
        onClose={() => patch({ periodUid: undefined, baseRunUid: undefined, targetRunUid: undefined })}
      />
    </Main>
  )
}

function Kpi({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: number; tone: 'blue' | 'green' | 'violet' | 'amber' }) {
  const tones = { blue: 'border-blue-200 bg-blue-50/50 text-blue-950 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-100', green: 'border-emerald-200 bg-emerald-50/50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-100', violet: 'border-violet-200 bg-violet-50/50 text-violet-950 dark:border-violet-900 dark:bg-violet-950/20 dark:text-violet-100', amber: 'border-amber-200 bg-amber-50/50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-100' }
  return <div className={cn('flex min-h-[68px] items-center justify-between rounded-lg border px-3 py-2.5', tones[tone])}><div><p className='text-xs opacity-70'>{label}</p><p className='text-xl font-bold'>{value.toLocaleString('id-ID')}</p></div><Icon className='size-4 opacity-70' /></div>
}

function PeriodCard({ period, onOpen }: { period: PayrollHistoryPeriod; onOpen: () => void }) {
  return (
    <article className='grid gap-3 rounded-lg border bg-card p-3 transition-colors hover:border-primary/30 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center'>
      <div className='min-w-0'>
        <div className='flex flex-wrap items-center gap-2'>
          <h2 className='truncate font-semibold'>{period.periodName}</h2>
          <PeriodBadge status={period.status} />
          {period.currentRun?.runType === 'FINAL' && <Badge className='bg-emerald-700'>FINAL</Badge>}
        </div>
        <p className='mt-1 text-sm text-muted-foreground'>{period.site.name} · {period.periodCode} · {localDate(period.periodStart)}–{localDate(period.periodEnd)}</p>
        <div className='mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
          <span>{period.runCount} run</span><span>{period.completedRunCount} selesai</span>
          {period.failedRunCount > 0 && <span className='font-medium text-destructive'>{period.failedRunCount} gagal</span>}
          {period.currentRun && <span>Neto terbaru: <b className='text-foreground'>{money(period.currentRun.totalNetPay)}</b></span>}
        </div>
      </div>
      <Button variant='outline' size='sm' onClick={onOpen}><Eye className='mr-2 size-4' />Lihat histori</Button>
    </article>
  )
}

function HistoryDrawer({ period, periodUid, selectedRunUids, onSelectionChange, capabilities, onClose }: { period?: PayrollHistoryPeriod; periodUid?: string; selectedRunUids: string[]; onSelectionChange: (selectedRunUids: string[]) => void; capabilities?: { canExport: boolean; canPaymentExport: boolean; canPrint: boolean }; onClose: () => void }) {
  const runs = usePayrollRuns(periodUid)
  const comparison = usePayrollRunComparison(
    periodUid,
    selectedRunUids[0],
    selectedRunUids[1]
  )
  const toggle = (uid: string) =>
    onSelectionChange(
      updatePayrollComparisonSelection(selectedRunUids, uid)
    )
  return (
    <Sheet open={Boolean(periodUid)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-3xl'>
        <SheetHeader>
          <SheetTitle>Histori {period?.periodName ?? 'Payroll'}</SheetTitle>
          <SheetDescription>{period ? `${period.site.name} · ${localDate(period.periodStart)}–${localDate(period.periodEnd)}` : 'Memuat detail periode...'}</SheetDescription>
        </SheetHeader>
        <div className='space-y-4 p-4 pt-2'>
          {period?.status === 'CLOSED' && <Alert className='border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20'><CheckCircle2 className='size-4' /><AlertDescription>Hasil resmi telah dikunci. Status ini bukan tanda pembayaran sudah dilakukan.</AlertDescription></Alert>}
          <div className='flex items-center justify-between gap-3'><div><h3 className='font-semibold'>Timeline perhitungan</h3><p className='text-xs text-muted-foreground'>Pilih tepat dua run selesai untuk membandingkan hasil.</p></div><Badge variant='outline'>{selectedRunUids.length}/2 dipilih</Badge></div>
          {runs.isPending ? <HistorySkeleton /> : runs.data?.length ? <div className='space-y-2'>{runs.data.map((run) => <RunCard key={run.uid} run={run} checked={selectedRunUids.includes(run.uid)} selectable={run.status === 'COMPLETED'} onToggle={() => toggle(run.uid)} capabilities={capabilities} periodClosed={period?.status === 'CLOSED'} />)}</div> : <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>Belum ada run.</p>}
          {selectedRunUids.length === 2 && <ComparisonPanel data={comparison.data} pending={comparison.isPending} error={comparison.isError} retry={() => comparison.refetch()} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function RunCard({ run, checked, selectable, onToggle, capabilities, periodClosed }: { run: PayrollRunSummary; checked: boolean; selectable: boolean; onToggle: () => void; capabilities?: { canExport: boolean; canPaymentExport: boolean; canPrint: boolean }; periodClosed: boolean }) {
  const [exporting, setExporting] = useState<'SUMMARY' | 'PAYMENT' | null>(null)
  const exportFile = async (type: 'SUMMARY' | 'PAYMENT') => { try { setExporting(type); await exportPayrollRun(run.uid, type); toast.success('File Payroll berhasil diunduh.') } catch (error) { toast.error(apiError(error, 'Export Payroll gagal.')) } finally { setExporting(null) } }
  const final = canExportPayrollPayment(
    run,
    periodClosed,
    capabilities?.canPaymentExport === true
  )
  return <div className={cn('rounded-lg border p-3', checked && 'border-primary bg-primary/[0.03]')}><div className='flex gap-3'><Checkbox checked={checked} disabled={!selectable} onCheckedChange={onToggle} aria-label={`Pilih run ${run.runNumber} untuk perbandingan`} className='mt-1' /><div className='min-w-0 flex-1'><div className='flex flex-wrap items-center gap-2'><p className='font-semibold'>Run #{run.runNumber}</p><Badge variant={run.status === 'COMPLETED' ? 'secondary' : run.status === 'FAILED' ? 'destructive' : 'outline'}>{run.status === 'COMPLETED' ? 'Selesai' : run.status === 'FAILED' ? 'Gagal' : run.status}</Badge>{run.isCurrent && <Badge variant='outline'>Terbaru</Badge>}{run.runType === 'FINAL' && <Badge className='bg-emerald-700'>FINAL</Badge>}</div><p className='text-xs text-muted-foreground'>{localDateTime(run.finishedAt)} · {run.employeeCount.toLocaleString('id-ID')} karyawan</p><div className='mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4'><RunAmount label='Produksi' value={run.totalPieceRateAmount} /><RunAmount label='Pendapatan' value={run.totalEarnings} /><RunAmount label='Potongan' value={run.totalDeductions} /><RunAmount label='Neto' value={run.totalNetPay} strong /></div>{selectable && capabilities?.canExport && <div className='mt-3 flex flex-wrap gap-2'><Button variant='outline' size='sm' disabled={Boolean(exporting)} onClick={() => exportFile('SUMMARY')}>{exporting === 'SUMMARY' ? <LoaderCircle className='mr-2 size-4 animate-spin' /> : <Download className='mr-2 size-4' />}Rekap</Button>{capabilities.canPaymentExport && final && <Button variant='outline' size='sm' disabled={Boolean(exporting)} onClick={() => exportFile('PAYMENT')}>{exporting === 'PAYMENT' ? <LoaderCircle className='mr-2 size-4 animate-spin' /> : <Download className='mr-2 size-4' />}Daftar pembayaran</Button>}</div>}</div></div></div>
}

function RunAmount({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div><p className='text-xs text-muted-foreground'>{label}</p><p className={cn('truncate', strong && 'font-semibold')}>{money(value)}</p></div> }

export function ComparisonPanel({ data, pending, error, retry }: { data?: PayrollRunComparison; pending: boolean; error: boolean; retry: () => void }) {
  if (pending) return <div className='rounded-lg border p-4'><Skeleton className='h-20 w-full' /></div>
  if (error || !data) return <ErrorState onRetry={retry} compact />
  const changed = data.employees.filter((item) => item.change !== 'UNCHANGED')
  return <section className='space-y-3 rounded-xl border bg-muted/20 p-3'><div className='flex items-center gap-2'><GitCompareArrows className='size-4 text-primary' /><h3 className='font-semibold'>Perbandingan Run #{data.baseRun.runNumber} → Run #{data.targetRun.runNumber}</h3></div><div className='grid grid-cols-2 gap-2 sm:grid-cols-5'><Delta label='Karyawan' value={String(data.summary.employeeCountDelta)} /><Delta label='Produksi' value={data.summary.totalPieceRateAmountDelta} moneyValue /><Delta label='Pendapatan' value={data.summary.totalEarningsDelta} moneyValue /><Delta label='Potongan' value={data.summary.totalDeductionsDelta} moneyValue /><Delta label='Neto' value={data.summary.totalNetPayDelta} moneyValue /></div><div><p className='mb-2 text-sm font-medium'>Perubahan per karyawan ({changed.length})</p>{changed.length ? <div className='max-h-72 space-y-1 overflow-y-auto'>{changed.map((item) => <div key={item.employeeUid} className='grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md bg-background px-3 py-2 text-sm'><div className='min-w-0'><p className='truncate font-medium'>{item.fullName}</p><p className='text-xs text-muted-foreground'>{item.employeeNumber} · {item.change === 'ADDED' ? 'Ditambahkan' : item.change === 'REMOVED' ? 'Dihapus dari hasil' : 'Nominal berubah'}</p></div><div className='text-right'><p className={cn('font-medium', item.deltas.netPay.startsWith('-') ? 'text-destructive' : 'text-emerald-700')}>{signedMoney(item.deltas.netPay)}</p><p className='text-xs text-muted-foreground'>selisih neto</p></div></div>)}</div> : <p className='rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground'>Tidak ada hasil karyawan yang berubah.</p>}</div></section>
}

function signedMoney(value: string) { const zero = Number(value) === 0; return zero ? money(value) : `${value.startsWith('-') ? '−' : '+'}${money(value.replace('-', ''))}` }
function Delta({ label, value, moneyValue = false }: { label: string; value: string; moneyValue?: boolean }) { const negative = value.startsWith('-'); const zero = Number(value) === 0; return <div className='rounded-md border bg-background p-2'><p className='text-[11px] text-muted-foreground'>{label}</p><p className={cn('truncate text-sm font-semibold', !zero && (negative ? 'text-destructive' : 'text-emerald-700'))}>{moneyValue ? signedMoney(value) : `${!zero && !negative ? '+' : ''}${value}`}</p></div> }

function PeriodBadge({ status }: { status: PayrollPeriodStatus }) { return <Badge variant={status === 'CLOSED' ? 'default' : status === 'CANCELLED' ? 'destructive' : 'secondary'} className={status === 'CLOSED' ? 'bg-emerald-700' : undefined}>{statusLabel[status]}</Badge> }
function HistorySkeleton() { return <div className='space-y-2'>{[1,2,3].map((item) => <Skeleton key={item} className='h-28 w-full rounded-lg' />)}</div> }
function ErrorState({ onRetry, compact = false }: { onRetry: () => void; compact?: boolean }) { return <div className={cn('rounded-lg border border-dashed px-4 text-center', compact ? 'py-6' : 'py-12')}><AlertCircle className='mx-auto size-7 text-destructive' /><p className='mt-2 font-medium'>Data riwayat gagal dimuat</p><Button variant='outline' size='sm' className='mt-3' onClick={onRetry}>Coba lagi</Button></div> }
