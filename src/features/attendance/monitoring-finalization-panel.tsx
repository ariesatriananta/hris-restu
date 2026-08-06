import { useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
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
import { Card, CardContent } from '@/components/ui/card'
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
  useAttendanceFinalizations,
  useRunAttendanceFinalization,
} from './data/queries'
import type {
  AttendanceFinalization,
  AttendanceFinalizationStatus,
  AttendanceSiteCode,
} from './domain'

export function MonitoringFinalizationPanel({
  businessDate,
  sites,
  canFinalize,
}: {
  businessDate: string
  sites?: AttendanceSiteCode[]
  canFinalize: boolean
}) {
  const result = useAttendanceFinalizations({ businessDate, site: sites })
  const [selected, setSelected] = useState<AttendanceFinalization>()

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
  return (
    <section className='mb-5 space-y-3' aria-labelledby='finalization-title'>
      <div className='flex flex-wrap items-end justify-between gap-2'>
        <div>
          <h2 id='finalization-title' className='font-semibold'>
            Status finalisasi harian
          </h2>
          <p className='text-xs text-muted-foreground'>
            Pembuatan attendance Alpha/Libur per site setelah batas akhir shift.
          </p>
        </div>
        {!canFinalize && <Badge variant='outline'>Mode lihat saja</Badge>}
      </div>
      {!items.length ? (
        <p className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
          Tidak ada site dalam cakupan akun ini.
        </p>
      ) : (
        <div className='grid gap-3 lg:grid-cols-2 xl:grid-cols-3'>
          {items.map((item) => (
            <FinalizationCard
              key={item.site}
              item={item}
              canFinalize={canFinalize}
              onRun={setSelected}
            />
          ))}
        </div>
      )}
      {selected && (
        <RunFinalizationDialog
          item={selected}
          open
          onOpenChange={(open) => !open && setSelected(undefined)}
        />
      )}
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
    <Card className='rounded-lg'>
      <CardContent className='space-y-3 p-3'>
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
        <div className='grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-6'>
          <Count label='Eligible' value={item.counts.eligible ?? 0} />
          <Count label='Alpha' value={item.counts.absent ?? 0} />
          <Count label='Libur' value={item.counts.holiday ?? 0} />
          <Count label='Fakta lama' value={item.counts.preserved ?? 0} />
          <Count label='Libur pekan' value={item.counts.weeklyOff ?? 0} />
          <Count label='Tertunda' value={item.counts.pendingDue ?? 0} />
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
              variant='outline'
              className='ml-auto'
              onClick={() => onRun(item)}
            >
              <Play />
              {item.status === 'NOT_STARTED'
                ? 'Jalankan finalisasi'
                : 'Finalisasi ulang'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
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

function FinalizationBadge({ value }: { value: AttendanceFinalizationStatus }) {
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
      <Icon className='size-3' /> {label}
    </Badge>
  )
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className='rounded-md bg-muted/60 px-1.5 py-2'>
      <p className='font-semibold tabular-nums'>{value}</p>
      <p className='text-[10px] text-muted-foreground'>{label}</p>
    </div>
  )
}

function siteLabel(site: AttendanceSiteCode) {
  return `Site ${site[0]}${site.slice(1).toLowerCase()}`
}

function sourceLabel(source?: AttendanceFinalization['source']) {
  return source === 'MANUAL' ? 'Manual' : source === 'CRON' ? 'Cron' : 'Sistem'
}

function warningMessages(item: AttendanceFinalization) {
  if (item.warnings.length) return [...new Set(item.warnings)]
  const messages: string[] = []
  if ((item.counts.missingAssignment ?? 0) > 0) {
    messages.push(
      `${item.counts.missingAssignment ?? 0} tanpa penugasan shift.`
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
  return messages
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
