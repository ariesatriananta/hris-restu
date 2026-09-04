import { useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  Ban,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Clock3,
  LoaderCircle,
  Play,
  RefreshCcw,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { BulkFinalizationDialog } from './bulk-finalization-dialog'
import {
  useAttendanceFinalizations,
  useRunAttendanceFinalization,
} from './data/queries'
import type {
  AttendanceFinalization,
  AttendanceFinalizationStatus,
  AttendanceSite,
  AttendanceSiteCode,
} from './domain'

export function MonitoringFinalizationPanel({
  businessDate,
  sites,
  availableSites,
  goLiveDate,
  canFinalize,
}: {
  businessDate: string
  sites?: AttendanceSiteCode[]
  availableSites: AttendanceSite[]
  goLiveDate?: string
  canFinalize: boolean
}) {
  const result = useAttendanceFinalizations({ businessDate, site: sites })
  const [selected, setSelected] = useState<AttendanceFinalization>()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  if (result.isPending) {
    return (
      <div className='mb-4 flex min-h-20 items-center justify-center gap-2 rounded-md border border-dashed text-sm text-muted-foreground'>
        <LoaderCircle className='size-4 animate-spin' /> Memuat status
        finalisasi...
      </div>
    )
  }
  if (result.isError) {
    return (
      <Alert variant='destructive' className='mb-4'>
        <AlertTriangle />
        <AlertTitle>Status finalisasi gagal dimuat</AlertTitle>
        <AlertDescription className='flex flex-wrap items-center gap-2'>
          Monitoring attendance tetap ditampilkan, tetapi status pembuatan
          Alpha/libur belum dapat dipastikan.
          <Button
            size='sm'
            variant='outline'
            onClick={() => void result.refetch()}
          >
            <RefreshCcw /> Coba lagi
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const items = result.data?.items ?? []
  const completed = items.filter((item) =>
    ['FINALIZED', 'NOT_REQUIRED'].includes(item.status)
  ).length
  const needsAttention = items.filter(
    (item) =>
      !['FINALIZED', 'NOT_REQUIRED'].includes(item.status) ||
      warningMessages(item).length > 0
  ).length
  const firstRunnable = items.find(
    (item) =>
      item.canRun &&
      item.status !== 'NOT_REQUIRED' &&
      (!['FINALIZED', 'NOT_REQUIRED'].includes(item.status) ||
        warningMessages(item).length > 0)
  )
  return (
    <section className='mb-4' aria-labelledby='finalization-title'>
      {!items.length ? (
        <p className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
          Tidak ada site dalam cakupan akun ini.
        </p>
      ) : (
        <Collapsible
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          className='rounded-lg border bg-card'
        >
          <div className='flex flex-wrap items-center gap-3 p-3'>
            <div className='mr-auto min-w-48'>
              <div className='flex flex-wrap items-center gap-2'>
                <h2 id='finalization-title' className='text-sm font-semibold'>
                  Finalisasi harian
                </h2>
                <Badge
                  variant={needsAttention > 0 ? 'outline' : 'default'}
                  className='gap-1'
                >
                  {needsAttention > 0 ? (
                    <AlertTriangle className='size-3' />
                  ) : (
                    <CheckCircle2 className='size-3' />
                  )}
                  {completed}/{items.length} selesai
                </Badge>
                {!canFinalize && <Badge variant='outline'>Lihat saja</Badge>}
              </div>
              <p className='mt-1 text-xs text-muted-foreground'>
                {needsAttention > 0
                  ? `${needsAttention} site perlu diperiksa sebelum rekap dianggap lengkap.`
                  : 'Semua site sudah selesai atau tidak memerlukan finalisasi.'}
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-1.5'>
              {items.map((item) => (
                <div
                  key={item.site}
                  className='flex items-center gap-1.5 rounded-md bg-muted/60 px-2 py-1'
                >
                  <span className='text-xs font-medium'>
                    {siteLabel(item.site).replace('Site ', '')}
                  </span>
                  <FinalizationBadge value={item.status} compact />
                </div>
              ))}
            </div>
            {canFinalize && firstRunnable && (
              <Button
                size='sm'
                variant={
                  firstRunnable.status === 'NOT_STARTED' ? 'default' : 'outline'
                }
                className={
                  firstRunnable.status === 'NOT_STARTED'
                    ? undefined
                    : 'border-amber-500/50 bg-amber-500/5 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-400'
                }
                onClick={() => setSelected(firstRunnable)}
              >
                <Play />
                {firstRunnable.status === 'NOT_STARTED'
                  ? `Jalankan ${siteLabel(firstRunnable.site).replace('Site ', '')}`
                  : `Ulangi ${siteLabel(firstRunnable.site).replace('Site ', '')}`}
              </Button>
            )}
            {canFinalize && availableSites.length > 0 && (
              <Button
                size='sm'
                variant='outline'
                onClick={() => setBulkOpen(true)}
              >
                <CalendarRange /> Finalisasi periode
              </Button>
            )}
            <CollapsibleTrigger asChild>
              <Button size='sm' variant='ghost' className='group'>
                Rincian
                <ChevronDown className='transition-transform group-data-[state=open]:rotate-180' />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className='border-t p-3'>
            <p className='mb-3 text-xs text-muted-foreground'>
              Pembuatan attendance Alpha/Libur per site setelah batas akhir
              shift.
            </p>
            <div className='grid gap-2 lg:grid-cols-2 xl:grid-cols-3'>
              {items.map((item) => (
                <FinalizationCard
                  key={item.site}
                  item={item}
                  canFinalize={canFinalize}
                  onRun={setSelected}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
      {selected && (
        <RunFinalizationDialog
          item={selected}
          open
          onOpenChange={(open) => !open && setSelected(undefined)}
        />
      )}
      <BulkFinalizationDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        sites={availableSites}
        selectedSites={sites ?? []}
        businessDate={businessDate}
        goLiveDate={goLiveDate}
      />
    </section>
  )
}

function FinalizationCard({
  item,
  canFinalize,
  onRun,
}: {
  item: AttendanceFinalization
  canFinalize: boolean
  onRun: (item: AttendanceFinalization) => void
}) {
  const warnings = warningMessages(item)
  const isNotRequired = item.status === 'NOT_REQUIRED'
  return (
    <section className='space-y-2.5 rounded-lg border bg-card p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <p className='font-semibold'>{siteLabel(item.site)}</p>
          <p className='text-xs text-muted-foreground'>
            {item.lastRunAt
              ? `${sourceLabel(item.source)} · ${dateTimeLabel(item.lastRunAt)}`
              : 'Belum pernah dijalankan'}
          </p>
        </div>
        <FinalizationBadge value={item.status} />
      </div>
      <div className='grid grid-cols-3 gap-1.5 text-center text-xs sm:grid-cols-6'>
        <Count
          label='Eligible'
          value={item.counts.eligible ?? 0}
          description='Karyawan yang memenuhi syarat attendance pada site dan tanggal kerja ini.'
          tone='border-blue-500/20 bg-gradient-to-br from-blue-500/[0.09] via-background to-blue-500/[0.025] text-foreground'
        />
        <Count
          label='Alpha'
          value={item.counts.absent ?? 0}
          description='Record Alpha yang dibentuk karena tidak ada scan maupun klasifikasi terapproval.'
          tone='border-rose-500/20 bg-gradient-to-br from-rose-500/[0.09] via-background to-rose-500/[0.025] text-foreground'
        />
        <Count
          label='Libur'
          value={item.counts.holiday ?? 0}
          description='Record Libur yang mengikuti kalender kerja efektif pada tanggal ini.'
          tone='border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.09] via-background to-indigo-500/[0.025] text-foreground'
        />
        <Count
          label='Fakta lama'
          value={item.counts.preserved ?? 0}
          description='Record yang sudah ada dari scan, klasifikasi, atau koreksi dan tetap dipertahankan.'
          tone='border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.09] via-background to-emerald-500/[0.025] text-foreground'
        />
        <Count
          label='Libur pekan'
          value={item.counts.weeklyOff ?? 0}
          description='Karyawan yang tidak dijadwalkan bekerja berdasarkan kombinasi hari penugasan shift.'
          tone='border-teal-500/20 bg-gradient-to-br from-teal-500/[0.09] via-background to-teal-500/[0.025] text-foreground'
        />
        <Count
          label='Tertunda'
          value={item.counts.pendingDue ?? 0}
          description='Belum diproses karena batas akhir shift ditambah 60 menit belum terlewati.'
          tone='border-amber-500/20 bg-gradient-to-br from-amber-500/[0.09] via-background to-amber-500/[0.025] text-foreground'
        />
      </div>
      {warnings.length > 0 && (
        <div className='rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs'>
          <p className='flex items-center gap-1.5 font-medium'>
            <AlertTriangle className='size-3.5' /> Perlu tindak lanjut
          </p>
          <ul className='mt-1 space-y-0.5 text-muted-foreground'>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {item.status === 'FAILED' && item.errorMessage && (
        <p role='alert' className='text-xs text-destructive'>
          {item.errorMessage}
        </p>
      )}
      {isNotRequired && (
        <div className='rounded-md border border-border bg-muted/40 p-2.5 text-xs'>
          <p className='font-medium'>Tidak perlu finalisasi</p>
          <p className='mt-1 text-muted-foreground'>
            Hari libur mingguan tidak membentuk attendance Alpha atau Libur.
            Scan aktual tetap tercatat sebagai fakta kehadiran.
          </p>
        </div>
      )}
      <div className='flex items-center justify-between gap-2 border-t pt-2'>
        {isNotRequired ? (
          <span className='text-xs text-muted-foreground'>
            Finalisasi tidak tersedia untuk hari ini.
          </span>
        ) : !item.canRun ? (
          <span className='text-xs text-muted-foreground'>
            Belum dapat dijalankan untuk tanggal ini.
          </span>
        ) : null}
        {canFinalize && item.canRun && !isNotRequired && (
          <Button
            size='sm'
            variant={item.status === 'NOT_STARTED' ? 'default' : 'outline'}
            className={
              item.status === 'NOT_STARTED'
                ? 'ml-auto'
                : 'ml-auto border-amber-500/50 bg-amber-500/5 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800 dark:text-amber-400'
            }
            onClick={() => onRun(item)}
          >
            <Play />
            {item.status === 'NOT_STARTED'
              ? 'Jalankan finalisasi'
              : 'Ulangi finalisasi'}
          </Button>
        )}
      </div>
    </section>
  )
}

function RunFinalizationDialog({
  item,
  open,
  onOpenChange,
}: {
  item: AttendanceFinalization
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const run = useRunAttendanceFinalization()
  const [reason, setReason] = useState('')
  const valid = reason.trim().length >= 3
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>
            {item.status === 'NOT_STARTED'
              ? 'Jalankan finalisasi attendance?'
              : 'Finalisasi ulang attendance?'}
          </DialogTitle>
          <DialogDescription>
            {siteLabel(item.site)} · {dateLabel(item.businessDate)}. Attendance
            dari scan dan klasifikasi yang sudah ada tetap dipertahankan.
          </DialogDescription>
        </DialogHeader>
        <label className='grid gap-1.5 text-sm font-medium'>
          Alasan
          <Textarea
            value={reason}
            maxLength={500}
            placeholder='Minimal 3 karakter untuk audit trail.'
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <DialogFooter>
          <Button
            variant='outline'
            disabled={run.isPending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            disabled={!valid || run.isPending}
            onClick={() =>
              run.mutate(
                {
                  siteCode: item.site,
                  businessDate: item.businessDate,
                  reason: reason.trim(),
                },
                {
                  onSuccess: () => {
                    toast.success('Finalisasi attendance selesai dijalankan.')
                    onOpenChange(false)
                  },
                  onError: (error) =>
                    toast.error(
                      apiMessage(
                        error,
                        'Finalisasi attendance gagal dijalankan.'
                      )
                    ),
                }
              )
            }
          >
            {run.isPending && <LoaderCircle className='animate-spin' />}
            Jalankan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FinalizationBadge({
  value,
  compact = false,
}: {
  value: AttendanceFinalizationStatus
  compact?: boolean
}) {
  const config = {
    NOT_STARTED: ['Belum dimulai', CircleDashed, 'outline'],
    NOT_REQUIRED: ['Tidak perlu finalisasi', Ban, 'secondary'],
    PARTIAL: ['Sebagian', Clock3, 'secondary'],
    FINALIZED: ['Selesai', CheckCircle2, 'default'],
    FAILED: ['Gagal', XCircle, 'destructive'],
  } as const
  const [label, Icon, variant] = config[value]
  return (
    <Badge variant={variant} className='gap-1'>
      <Icon className='size-3' /> {compact ? compactStatusLabel(value) : label}
    </Badge>
  )
}

function compactStatusLabel(value: AttendanceFinalizationStatus) {
  return (
    {
      NOT_STARTED: 'Belum',
      NOT_REQUIRED: 'Tidak perlu',
      PARTIAL: 'Sebagian',
      FINALIZED: 'Final',
      FAILED: 'Gagal',
    } as const
  )[value]
}

function Count({
  label,
  value,
  description,
  tone,
}: {
  label: string
  value: number
  description: string
  tone: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type='button'
          className={`min-h-12 rounded-md border px-1.5 py-1.5 text-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${tone}`}
          aria-label={`${label}: ${value}. ${description}`}
        >
          <span className='block font-semibold tabular-nums'>{value}</span>
          <span className='block text-[10px] leading-3 opacity-80'>
            {label}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent className='max-w-64'>{description}</TooltipContent>
    </Tooltip>
  )
}

function siteLabel(site: AttendanceSiteCode) {
  return `Site ${site[0]}${site.slice(1).toLowerCase()}`
}

function sourceLabel(source?: AttendanceFinalization['source']) {
  return source === 'MANUAL' ? 'Manual' : source === 'CRON' ? 'Cron' : 'Sistem'
}

function warningMessages(item: AttendanceFinalization) {
  // NOT_REQUIRED adalah hasil perhitungan kondisi terkini. Warning dari run
  // lama (misalnya marker invalidasi reset development) tidak actionable
  // karena endpoint memang tidak mengizinkan finalisasi pada tanggal ini.
  if (item.status === 'NOT_REQUIRED') return []

  const messages: string[] = []
  if ((item.counts.missingAssignment ?? 0) > 0) {
    messages.push(
      `${item.counts.missingAssignment ?? 0} karyawan eligible belum dapat diproses karena penugasan shift tidak tersedia atau tidak valid untuk site dan tanggal ini.`
    )
  }
  if ((item.counts.ambiguousAssignment ?? 0) > 0) {
    messages.push(
      `${item.counts.ambiguousAssignment ?? 0} memiliki penugasan shift ambigu.`
    )
  }
  if ((item.counts.ambiguousEmployment ?? 0) > 0) {
    messages.push(
      `${item.counts.ambiguousEmployment ?? 0} memiliki histori kerja ambigu.`
    )
  }
  const knownAssignmentWarnings = [
    'Ada karyawan eligible tanpa assignment Shift efektif.',
    'Ada karyawan yang eligible berdasarkan histori kerja, tetapi belum memiliki penugasan shift efektif pada tanggal ini.',
    'Ada assignment Shift yang tumpang tindih.',
    'Ada penugasan shift efektif yang tumpang tindih pada tanggal ini.',
  ]
  for (const warning of item.warnings) {
    if (!knownAssignmentWarnings.includes(warning)) messages.push(warning)
  }
  return [...new Set(messages)]
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(
    new Date(`${value}T00:00:00`)
  )
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
