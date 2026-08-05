import { useEffect, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  History,
  LoaderCircle,
  Play,
  RefreshCw,
  ServerCog,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Main } from '@/components/layout/main'
import {
  useCronRuns,
  useRunContractsReconcile,
} from './data/cron-monitoring-query'
import type {
  CronRun,
  CronRunListParams,
  CronRunStatus,
  CronRunSummary,
} from './domain'

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
})
const businessDateFormatter = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeZone: 'Asia/Jakarta',
})
const numberFormatter = new Intl.NumberFormat('id-ID')

const statuses: Array<{ value: CronRunStatus; label: string }> = [
  { value: 'RUNNING', label: 'Sedang berjalan' },
  { value: 'SUCCEEDED', label: 'Berhasil' },
  { value: 'FAILED', label: 'Gagal' },
  { value: 'SKIPPED', label: 'Dilewati' },
]

type Search = {
  page?: number
  pageSize?: number
  status?: CronRunStatus
}

export function CronMonitoringPage({
  search,
  onSearchChange,
}: {
  search: Search
  onSearchChange: (next: Search) => void
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const user = useAuthStore((state) => state.session?.user)
  const params: CronRunListParams = {
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
    status: search.status,
  }
  const runs = useCronRuns(params)
  const reconcile = useRunContractsReconcile()
  const totalPages = runs.data
    ? validTotalPages(runs.data.totalPages, runs.data.total, runs.data.pageSize)
    : 1

  useEffect(() => {
    if (!runs.data || runs.isFetching || params.page <= totalPages) return
    const timeout = window.setTimeout(
      () => onSearchChange({ ...search, page: totalPages }),
      0
    )
    return () => window.clearTimeout(timeout)
  }, [
    onSearchChange,
    params.page,
    runs.data,
    runs.isFetching,
    search,
    totalPages,
  ])

  return (
    <Main>
      <div className='mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Monitoring Cron
          </h1>
          <p className='mt-1 text-muted-foreground'>
            Pantau rekonsiliasi kontrak dan proses status karyawan terjadwal.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            disabled={runs.isFetching}
            onClick={() => void runs.refetch()}
          >
            <RefreshCw className={runs.isFetching ? 'animate-spin' : ''} />
            Muat ulang
          </Button>
          {user?.role === 'SUPER_ADMIN' && (
            <Button type='button' onClick={() => setConfirmOpen(true)}>
              <Play /> Jalankan sekarang
            </Button>
          )}
        </div>
      </div>

      {runs.data?.overview.runningCount ? (
        <Alert className='mb-4 border-sky-500/40 bg-sky-500/5'>
          <LoaderCircle className='animate-spin text-sky-600' />
          <AlertTitle>Rekonsiliasi sedang berjalan</AlertTitle>
          <AlertDescription>
            Gunakan tombol Muat ulang untuk melihat hasil proses terbaru.
          </AlertDescription>
        </Alert>
      ) : null}

      <OverviewCards
        data={runs.data?.overview}
        isPending={runs.isPending}
        isError={runs.isError}
      />

      <Card>
        <CardHeader className='gap-4 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <CardTitle>Riwayat eksekusi</CardTitle>
            <CardDescription>
              Hasil setiap proses, termasuk kegagalan dan eksekusi yang
              dilewati.
            </CardDescription>
          </div>
          <div className='w-full sm:w-52'>
            <label
              htmlFor='cron-status-filter'
              className='mb-1.5 block text-xs font-medium text-muted-foreground'
            >
              Status eksekusi
            </label>
            <Select
              value={search.status ?? 'ALL'}
              onValueChange={(value) =>
                onSearchChange({
                  ...search,
                  page: 1,
                  status:
                    value === 'ALL' ? undefined : (value as CronRunStatus),
                })
              }
            >
              <SelectTrigger id='cron-status-filter' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>Semua status</SelectItem>
                {statuses.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {runs.isPending ? (
            <RunListSkeleton />
          ) : runs.isError ? (
            <ErrorState onRetry={() => void runs.refetch()} />
          ) : runs.data.items.length === 0 ? (
            <EmptyState filtered={Boolean(search.status)} />
          ) : (
            <>
              <div
                aria-busy={runs.isFetching}
                className={runs.isFetching ? 'opacity-60' : undefined}
              >
                <div className='space-y-3 sm:hidden'>
                  {runs.data.items.map((run) => (
                    <RunCard key={run.uid} run={run} />
                  ))}
                </div>
                <div className='hidden rounded-md border sm:block'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Proses</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Mulai</TableHead>
                        <TableHead>Durasi</TableHead>
                        <TableHead>Hasil</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.data.items.map((run) => (
                        <TableRow key={run.uid}>
                          <TableCell>
                            <p className='font-medium'>
                              {jobLabel(run.jobCode)}
                            </p>
                            <p className='text-xs text-muted-foreground'>
                              Tanggal bisnis{' '}
                              {formatBusinessDate(run.businessDate)}
                            </p>
                          </TableCell>
                          <TableCell>
                            <RunStatusBadge status={run.status} />
                          </TableCell>
                          <TableCell>{formatDateTime(run.startedAt)}</TableCell>
                          <TableCell className='tabular-nums'>
                            {formatDuration(run.durationMs)}
                          </TableCell>
                          <TableCell className='max-w-sm whitespace-normal'>
                            <RunResult run={run} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <Pagination
                data={runs.data}
                disabled={runs.isFetching}
                onChange={onSearchChange}
                search={search}
              />
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!reconcile.isPending) setConfirmOpen(open)
        }}
        title='Jalankan rekonsiliasi sekarang?'
        desc='Proses akan memeriksa lifecycle kontrak, mutasi, dan perubahan status kerja terjadwal untuk seluruh site.'
        cancelBtnText='Batal'
        confirmText='Jalankan sekarang'
        isLoading={reconcile.isPending}
        handleConfirm={() =>
          reconcile.mutate(undefined, {
            onSuccess: (result) => {
              setConfirmOpen(false)
              toast.success(
                result.status === 'SKIPPED'
                  ? 'Eksekusi dilewati karena proses lain masih berjalan.'
                  : 'Rekonsiliasi berhasil dijalankan.'
              )
            },
            onError: (error) =>
              toast.error(
                isAxiosError<{ message?: string }>(error)
                  ? (error.response?.data.message ??
                      'Rekonsiliasi gagal dijalankan.')
                  : 'Rekonsiliasi gagal dijalankan.'
              ),
          })
        }
      />
    </Main>
  )
}

function OverviewCards({
  data,
  isPending,
  isError,
}: {
  data?: {
    lastRun?: CronRun | null
    lastSucceededAt?: string | null
    runningCount: number
    failedLast24Hours: number
  }
  isPending: boolean
  isError: boolean
}) {
  if (isPending) {
    return (
      <div className='mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className='h-[68px] rounded-lg' />
        ))}
      </div>
    )
  }
  if (isError || !data) return null

  const cards = [
    {
      label: 'Eksekusi terakhir',
      value: data.lastRun ? statusLabel(data.lastRun.status) : 'Belum ada',
      title: data.lastRun ? formatDateTime(data.lastRun.startedAt) : undefined,
      icon: History,
      className:
        data.lastRun?.status === 'FAILED'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-muted-foreground/20 bg-muted/40 text-foreground',
      valueClassName: 'text-base',
    },
    {
      label: 'Berhasil terakhir',
      value: data.lastSucceededAt
        ? formatDateTime(data.lastSucceededAt)
        : 'Belum ada',
      icon: CheckCircle2,
      className:
        'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
      valueClassName: 'truncate text-sm',
    },
    {
      label: 'Sedang berjalan',
      value: numberFormatter.format(data.runningCount),
      icon: LoaderCircle,
      className: data.runningCount
        ? 'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-400'
        : 'border-muted-foreground/20 bg-muted/40 text-foreground',
      valueClassName: 'text-xl',
    },
    {
      label: 'Gagal 24 jam',
      value: numberFormatter.format(data.failedLast24Hours),
      icon: AlertCircle,
      className: data.failedLast24Hours
        ? 'border-destructive/30 bg-destructive/5 text-destructive'
        : 'border-muted-foreground/20 bg-muted/40 text-foreground',
      valueClassName: 'text-xl',
    },
  ] as const

  return (
    <div className='mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
      {cards.map((card) => (
        <section
          key={card.label}
          className={`min-h-[68px] rounded-lg border px-3 py-2.5 ${card.className}`}
          aria-label={card.label}
        >
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <p className='text-[11px] leading-3 font-medium'>{card.label}</p>
              <p
                className={`mt-1 leading-none font-semibold tabular-nums ${card.valueClassName}`}
                title={'title' in card ? card.title : undefined}
              >
                {card.value}
              </p>
            </div>
            <card.icon
              className={`size-3.5 shrink-0 ${card.label === 'Sedang berjalan' && data.runningCount ? 'animate-spin' : ''}`}
              aria-hidden='true'
            />
          </div>
        </section>
      ))}
    </div>
  )
}

function RunCard({ run }: { run: CronRun }) {
  return (
    <article className='rounded-lg border p-4'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='font-semibold'>{jobLabel(run.jobCode)}</p>
          <p className='text-xs text-muted-foreground'>
            Tanggal bisnis {formatBusinessDate(run.businessDate)}
          </p>
        </div>
        <RunStatusBadge status={run.status} />
      </div>
      <dl className='mt-4 grid grid-cols-2 gap-3 text-sm'>
        <div>
          <dt className='text-xs text-muted-foreground'>Mulai</dt>
          <dd>{formatDateTime(run.startedAt)}</dd>
        </div>
        <div>
          <dt className='text-xs text-muted-foreground'>Durasi</dt>
          <dd className='tabular-nums'>{formatDuration(run.durationMs)}</dd>
        </div>
      </dl>
      <div className='mt-3 border-t pt-3'>
        <RunResult run={run} />
      </div>
    </article>
  )
}

function RunResult({ run }: { run: CronRun }) {
  if (run.errorMessage) {
    return <p className='text-sm text-destructive'>{run.errorMessage}</p>
  }
  const summary = summaryLabel(run.summary)
  return (
    <p className='text-sm text-muted-foreground'>
      {summary ?? (run.status === 'RUNNING' ? 'Proses belum selesai.' : '-')}
    </p>
  )
}

function Pagination({
  data,
  disabled,
  search,
  onChange,
}: {
  data: {
    total: number
    page: number
    pageSize: number
    totalPages: number
    hasMore: boolean
  }
  disabled: boolean
  search: Search
  onChange: (next: Search) => void
}) {
  const start = data.total ? (data.page - 1) * data.pageSize + 1 : 0
  const end = Math.min(data.page * data.pageSize, data.total)
  const totalPages = validTotalPages(data.totalPages, data.total, data.pageSize)
  return (
    <div className='mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
      <p className='text-sm text-muted-foreground' aria-live='polite'>
        Menampilkan {start}-{end} dari {data.total} eksekusi
      </p>
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          value={String(data.pageSize)}
          onValueChange={(value) =>
            onChange({ ...search, page: 1, pageSize: Number(value) })
          }
        >
          <SelectTrigger className='h-9 w-24' aria-label='Baris per halaman'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent side='top'>
            {[50, 100, 200, 300, 500].map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} baris
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={disabled || data.page <= 1}
          onClick={() => onChange({ ...search, page: data.page - 1 })}
        >
          <ArrowLeft /> Sebelumnya
        </Button>
        <span className='min-w-20 text-center text-sm'>
          {data.page} / {totalPages}
        </span>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={disabled || !data.hasMore}
          onClick={() => onChange({ ...search, page: data.page + 1 })}
        >
          Berikutnya <ArrowRight />
        </Button>
      </div>
    </div>
  )
}

function validTotalPages(value: number, total: number, pageSize: number) {
  return Number.isInteger(value) && value > 0
    ? value
    : Math.max(1, Math.ceil(total / pageSize))
}

function RunStatusBadge({ status }: { status: CronRunStatus }) {
  const className =
    status === 'SUCCEEDED'
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : status === 'FAILED'
        ? 'border-destructive/30 bg-destructive/10 text-destructive'
        : status === 'RUNNING'
          ? 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
  return (
    <Badge variant='outline' className={className}>
      {status === 'RUNNING' && <LoaderCircle className='animate-spin' />}
      {statusLabel(status)}
    </Badge>
  )
}

function RunListSkeleton() {
  return (
    <div className='space-y-3' aria-label='Memuat riwayat cron'>
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className='h-16 rounded-md' />
      ))}
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className='flex min-h-56 flex-col items-center justify-center text-center'>
      <AlertCircle className='mb-3 size-9 text-destructive' />
      <p className='font-semibold'>Riwayat cron gagal dimuat</p>
      <p className='mt-1 max-w-md text-sm text-muted-foreground'>
        Periksa koneksi API lalu muat ulang. Detail internal tidak ditampilkan
        demi keamanan.
      </p>
      <Button
        type='button'
        variant='outline'
        className='mt-4'
        onClick={onRetry}
      >
        <RefreshCw /> Coba lagi
      </Button>
    </div>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className='flex min-h-56 flex-col items-center justify-center text-center'>
      <ServerCog className='mb-3 size-9 text-muted-foreground' />
      <p className='font-semibold'>
        {filtered
          ? 'Tidak ada eksekusi dengan status ini'
          : 'Belum ada riwayat cron'}
      </p>
      <p className='mt-1 text-sm text-muted-foreground'>
        {filtered
          ? 'Pilih status lain untuk melihat riwayat eksekusi.'
          : 'Riwayat akan muncul setelah rekonsiliasi pertama dijalankan.'}
      </p>
    </div>
  )
}

function summaryLabel(summary?: CronRunSummary | null) {
  if (!summary) return undefined
  if (summary.reason) return summary.reason
  const parts: string[] = []
  const contracts = summary.contracts
  if (contracts?.activated) parts.push(`${contracts.activated} kontrak aktif`)
  if (contracts?.expired) parts.push(`${contracts.expired} kontrak berakhir`)
  if (contracts?.activatedEmployees)
    parts.push(`${contracts.activatedEmployees} karyawan diaktifkan`)
  if (contracts?.inactivatedEmployees)
    parts.push(`${contracts.inactivatedEmployees} karyawan dinonaktifkan`)
  if (contracts?.legacyConflicts)
    parts.push(`${contracts.legacyConflicts} konflik legacy`)
  if (contracts?.skippedConflicts)
    parts.push(`${contracts.skippedConflicts} konflik dilewati`)
  if (summary.scheduledMutations?.applied)
    parts.push(`${summary.scheduledMutations.applied} mutasi diterapkan`)
  if (summary.scheduledMutations?.failed)
    parts.push(`${summary.scheduledMutations.failed} mutasi gagal`)
  if (summary.scheduledMutations?.skipped)
    parts.push(`${summary.scheduledMutations.skipped} mutasi dilewati`)
  if (summary.scheduledStatusChanges?.applied)
    parts.push(
      `${summary.scheduledStatusChanges.applied} status kerja diterapkan`
    )
  if (summary.scheduledStatusChanges?.failed)
    parts.push(`${summary.scheduledStatusChanges.failed} status kerja gagal`)
  if (summary.scheduledStatusChanges?.skipped)
    parts.push(
      `${summary.scheduledStatusChanges.skipped} status kerja dilewati`
    )
  return parts.length ? parts.join(' • ') : 'Selesai tanpa perubahan data.'
}

function statusLabel(status: CronRunStatus) {
  return statuses.find((item) => item.value === status)?.label ?? status
}

function jobLabel(jobCode: string) {
  return jobCode === 'CONTRACTS_RECONCILE'
    ? 'Rekonsiliasi kontrak'
    : jobCode.replace(/_/g, ' ')
}

function formatDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : `${dateFormatter.format(date)} WIB`
}

function formatBusinessDate(value: string) {
  const date = new Date(`${value}T00:00:00+07:00`)
  return Number.isNaN(date.getTime())
    ? value
    : businessDateFormatter.format(date)
}

function formatDuration(value?: number | null) {
  if (value == null) return '-'
  if (value < 1_000) return `${Math.max(0, Math.round(value))} ms`
  if (value < 60_000)
    return `${(value / 1_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} dtk`
  const minutes = Math.floor(value / 60_000)
  const seconds = Math.round((value % 60_000) / 1_000)
  return `${minutes} mnt ${seconds} dtk`
}
