import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  Ban,
  CalendarRange,
  CheckCircle2,
  CircleDashed,
  LoaderCircle,
  Play,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/date-picker'
import { attendanceDateLabel, bulkRangeError } from './bulk-finalization-utils'
import {
  usePreviewBulkAttendanceFinalization,
  useRunBulkAttendanceFinalization,
} from './data/queries'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'
import type {
  AttendanceBulkFinalizationMode,
  AttendanceBulkFinalizationPreview,
  AttendanceBulkFinalizationPreviewItem,
  AttendanceBulkFinalizationResult,
  AttendanceSite,
  AttendanceSiteCode,
} from './domain'

export function BulkFinalizationDialog({
  open,
  onOpenChange,
  sites,
  selectedSites,
  businessDate,
  goLiveDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sites: AttendanceSite[]
  selectedSites: AttendanceSiteCode[]
  businessDate: string
  goLiveDate?: string
}) {
  const defaultSite = useMemo(() => {
    if (selectedSites.length === 1) return selectedSites[0]
    if (sites.length === 1) return sites[0]?.code as AttendanceSiteCode
    return undefined
  }, [selectedSites, sites])
  const [siteCode, setSiteCode] = useState<AttendanceSiteCode | undefined>(
    defaultSite
  )
  const [mode, setMode] =
    useState<AttendanceBulkFinalizationMode>('ALL_PENDING')
  const [dateFrom, setDateFrom] = useState(businessDate)
  const [dateTo, setDateTo] = useState(businessDate)
  const [result, setResult] = useState<AttendanceBulkFinalizationResult>()
  const preview = usePreviewBulkAttendanceFinalization()
  const run = useRunBulkAttendanceFinalization()

  const initializeDialog = () => {
    setSiteCode(defaultSite)
    setMode('ALL_PENDING')
    setDateFrom(businessDate)
    setDateTo(businessDate)
    setResult(undefined)
    preview.reset()
    run.reset()
  }

  const input = siteCode
    ? {
        siteCode,
        mode,
        ...(mode === 'RANGE' ? { dateFrom, dateTo } : {}),
      }
    : undefined
  const rangeError =
    mode === 'RANGE'
      ? bulkRangeError(dateFrom, dateTo, goLiveDate, today())
      : undefined
  const previewData = preview.data
  const executableCount = previewData?.executableDates.length ?? 0

  const resetPreview = () => {
    preview.reset()
    run.reset()
    setResult(undefined)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    if (run.isPending) return
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className='max-h-[90svh] overflow-y-auto sm:max-w-2xl'
        onOpenAutoFocus={initializeDialog}
      >
        <DialogHeader>
          <DialogTitle>Finalisasi periode Attendance</DialogTitle>
          <DialogDescription>
            Pilih satu site dan cakupan tanggal. Sistem akan memeriksa tanggal
            yang aman sebelum finalisasi dijalankan.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className='space-y-4'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <label className='grid gap-1.5 text-sm font-medium'>
                Site
                <Select
                  value={siteCode}
                  disabled={preview.isPending || run.isPending}
                  onValueChange={(value) => {
                    setSiteCode(value as AttendanceSiteCode)
                    resetPreview()
                  }}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='Pilih satu site' />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((site) => (
                      <SelectItem key={site.uid} value={site.code}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <fieldset className='grid gap-1.5'>
                <legend className='text-sm font-medium'>Cakupan tanggal</legend>
                <RadioGroup
                  value={mode}
                  className='grid grid-cols-2 gap-2'
                  disabled={preview.isPending || run.isPending}
                  onValueChange={(value) => {
                    setMode(value as AttendanceBulkFinalizationMode)
                    resetPreview()
                  }}
                >
                  <ModeOption
                    value='ALL_PENDING'
                    title='Semua tertunda'
                    description='Maks. 31 tanggal terlama'
                  />
                  <ModeOption
                    value='RANGE'
                    title='Rentang tanggal'
                    description='Maks. 31 hari kalender'
                  />
                </RadioGroup>
              </fieldset>
            </div>

            {mode === 'RANGE' && (
              <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2'>
                <label className='grid gap-1.5 text-sm font-medium'>
                  Dari tanggal
                  <DatePicker
                    selected={dateOnlyFromInput(dateFrom)}
                    disabled={preview.isPending || run.isPending}
                    disabledDates={(date) => disabledDate(date, goLiveDate)}
                    onSelect={(date) => {
                      const value = dateOnlyToInput(date)
                      if (value) {
                        setDateFrom(value)
                        resetPreview()
                      }
                    }}
                  />
                </label>
                <label className='grid gap-1.5 text-sm font-medium'>
                  Sampai tanggal
                  <DatePicker
                    selected={dateOnlyFromInput(dateTo)}
                    disabled={preview.isPending || run.isPending}
                    disabledDates={(date) => disabledDate(date, goLiveDate)}
                    onSelect={(date) => {
                      const value = dateOnlyToInput(date)
                      if (value) {
                        setDateTo(value)
                        resetPreview()
                      }
                    }}
                  />
                </label>
                {rangeError && (
                  <p className='text-sm text-destructive sm:col-span-2'>
                    {rangeError}
                  </p>
                )}
              </div>
            )}

            <Alert>
              <ShieldCheck />
              <AlertTitle>Pemeriksaan tetap berlaku per tanggal</AlertTitle>
              <AlertDescription>
                Tanggal bermasalah atau terkunci Payroll tidak akan dipaksa.
                Alasan finalisasi akan dicatat otomatis oleh sistem.
              </AlertDescription>
            </Alert>

            {preview.isError && (
              <Alert variant='destructive'>
                <AlertTriangle />
                <AlertTitle>Pratinjau gagal dimuat</AlertTitle>
                <AlertDescription>
                  {apiMessage(
                    preview.error,
                    'Tanggal finalisasi belum dapat diperiksa.'
                  )}
                </AlertDescription>
              </Alert>
            )}

            {previewData && <PreviewResult preview={previewData} />}

            {run.isPending && (
              <div className='flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm'>
                <LoaderCircle className='size-5 animate-spin text-primary' />
                <div>
                  <p className='font-medium'>Finalisasi sedang dijalankan</p>
                  <p className='text-muted-foreground'>
                    Memproses {executableCount} tanggal secara berurutan. Jangan
                    tutup dialog ini dahulu.
                  </p>
                </div>
              </div>
            )}

            {run.isError && (
              <Alert variant='destructive'>
                <XCircle />
                <AlertTitle>Finalisasi periode gagal dijalankan</AlertTitle>
                <AlertDescription>
                  {apiMessage(
                    run.error,
                    'Tidak ada tanggal yang berhasil diproses. Silakan periksa kembali.'
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <BulkResult result={result} />
        )}

        <DialogFooter>
          <Button
            variant='outline'
            disabled={run.isPending}
            onClick={() => handleOpenChange(false)}
          >
            {result ? 'Tutup' : 'Batal'}
          </Button>
          {!result && !previewData && (
            <Button
              disabled={!input || Boolean(rangeError) || preview.isPending}
              onClick={() => input && preview.mutate(input)}
            >
              {preview.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <CalendarRange />
              )}
              Periksa tanggal
            </Button>
          )}
          {!result && previewData && (
            <Button
              disabled={!input || executableCount === 0 || run.isPending}
              onClick={() => {
                if (!input || !previewData.executableDates.length) return
                run.mutate(
                  {
                    ...input,
                    confirmedDates: previewData.executableDates,
                  },
                  {
                    onSuccess: (response) => {
                      setResult(response)
                      if (response.failed > 0 || response.skipped > 0) {
                        toast.warning(
                          'Finalisasi periode selesai dengan beberapa catatan.'
                        )
                      } else {
                        toast.success(
                          'Finalisasi periode berhasil diselesaikan.'
                        )
                      }
                    },
                  }
                )
              }}
            >
              {run.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Play />
              )}
              Jalankan {executableCount} tanggal
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ModeOption({
  value,
  title,
  description,
}: {
  value: AttendanceBulkFinalizationMode
  title: string
  description: string
}) {
  return (
    <label className='flex min-h-16 cursor-pointer items-start gap-2 rounded-md border p-2.5 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5'>
      <RadioGroupItem value={value} className='mt-0.5' />
      <span>
        <span className='block text-sm font-medium'>{title}</span>
        <span className='block text-xs font-normal text-muted-foreground'>
          {description}
        </span>
      </span>
    </label>
  )
}

function PreviewResult({
  preview,
}: {
  preview: AttendanceBulkFinalizationPreview
}) {
  return (
    <section className='space-y-3 rounded-lg border p-3'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div>
          <h3 className='font-semibold'>Tanggal yang ditemukan</h3>
          <p className='text-xs text-muted-foreground'>
            {attendanceDateLabel(preview.dateFrom)}–
            {attendanceDateLabel(preview.dateTo)}
          </p>
          <p className='mt-1 text-xs text-muted-foreground'>
            Catatan otomatis: {preview.defaultReason}
          </p>
        </div>
        <div className='flex flex-wrap gap-1.5'>
          <Badge className='gap-1'>
            <CheckCircle2 className='size-3' /> {preview.summary.ready} siap
          </Badge>
          <Badge variant='destructive' className='gap-1'>
            <AlertTriangle className='size-3' /> {preview.summary.blocked} perlu
            diperbaiki
          </Badge>
          <Badge variant='secondary' className='gap-1'>
            <Ban className='size-3' /> {preview.summary.skipped} dilewati
          </Badge>
        </div>
      </div>
      {preview.truncated && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Masih ada tanggal lain</AlertTitle>
          <AlertDescription>
            Sistem memilih maksimal {preview.maxReadyDates} tanggal siap yang
            paling lama. Jalankan kembali setelah batch ini selesai.
          </AlertDescription>
        </Alert>
      )}
      <div className='max-h-64 divide-y overflow-y-auto rounded-md border'>
        {preview.items.length ? (
          preview.items.map((item) => (
            <PreviewRow key={item.businessDate} item={item} />
          ))
        ) : (
          <p className='p-4 text-center text-sm text-muted-foreground'>
            Tidak ada tanggal dalam cakupan ini.
          </p>
        )}
      </div>
    </section>
  )
}

function PreviewRow({ item }: { item: AttendanceBulkFinalizationPreviewItem }) {
  const config = {
    READY: {
      label: 'Siap',
      icon: CheckCircle2,
      className: 'text-emerald-700 dark:text-emerald-400',
    },
    BLOCKED: {
      label: 'Perlu diperbaiki',
      icon: AlertTriangle,
      className: 'text-destructive',
    },
    SKIPPED: {
      label: 'Dilewati',
      icon: CircleDashed,
      className: 'text-muted-foreground',
    },
  } as const
  const state = config[item.status]
  const Icon = state.icon
  return (
    <div className='flex items-start gap-3 px-3 py-2.5 text-sm'>
      <Icon className={cn('mt-0.5 size-4 shrink-0', state.className)} />
      <div className='min-w-0 flex-1'>
        <p className='font-medium'>{attendanceDateLabel(item.businessDate)}</p>
        <p className='text-xs text-muted-foreground'>{item.message}</p>
      </div>
      <span className={cn('shrink-0 text-xs font-medium', state.className)}>
        {state.label}
      </span>
    </div>
  )
}

function BulkResult({ result }: { result: AttendanceBulkFinalizationResult }) {
  return (
    <section className='space-y-3'>
      <Alert variant={result.failed > 0 ? 'destructive' : 'default'}>
        {result.failed > 0 ? <AlertTriangle /> : <CheckCircle2 />}
        <AlertTitle>
          {result.failed > 0
            ? 'Finalisasi selesai dengan catatan'
            : 'Finalisasi periode selesai'}
        </AlertTitle>
        <AlertDescription>
          {result.succeeded} berhasil, {result.failed} gagal, dan{' '}
          {result.skipped} dilewati dari {result.requested} tanggal yang
          dikonfirmasi.
        </AlertDescription>
      </Alert>
      <div className='max-h-80 divide-y overflow-y-auto rounded-md border'>
        {result.results.map((item) => {
          const Icon =
            item.status === 'SUCCEEDED'
              ? CheckCircle2
              : item.status === 'FAILED'
                ? XCircle
                : CircleDashed
          return (
            <div
              key={item.businessDate}
              className='flex items-start gap-3 px-3 py-2.5 text-sm'
            >
              <Icon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  item.status === 'SUCCEEDED'
                    ? 'text-emerald-600'
                    : item.status === 'FAILED'
                      ? 'text-destructive'
                      : 'text-muted-foreground'
                )}
              />
              <div>
                <p className='font-medium'>
                  {attendanceDateLabel(item.businessDate)}
                </p>
                <p className='text-xs text-muted-foreground'>{item.message}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function disabledDate(date: Date, goLiveDate?: string) {
  const value = dateOnlyToInput(date)
  return Boolean(
    value && ((goLiveDate && value < goLiveDate) || value > today())
  )
}

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
