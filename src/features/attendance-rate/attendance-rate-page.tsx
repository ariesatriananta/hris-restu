import { useEffect, useState } from 'react'
import { format, isValid, parseISO } from 'date-fns'
import { id as locale } from 'date-fns/locale'
import {
  AlertTriangle,
  Boxes,
  Camera,
  GraduationCap,
  RefreshCw,
  Users,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import { canAccessAttendanceRate } from '@/features/auth/attendance-rate-access'
import {
  useAttendanceRateOptions,
  useAttendanceRateReport,
} from './data/queries'
import type {
  AttendanceRateAverage,
  AttendanceRateGroup,
  AttendanceRateReport,
  Category,
} from './data/types'

const number = (value: string | number, decimals = 0) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: decimals }).format(
    Number(value)
  )
const categoryName = (category: Category) =>
  ({ REGULER: 'Reguler', PREMIUM: 'Premium', TOTAL: 'Total' })[category]
const typeName = (type: string) =>
  type === 'TRAINING'
    ? 'Training'
    : type === 'BORONGAN'
      ? 'Borong'
      : 'Attendance Total'
const dateLabel = (value: string) =>
  format(parseISO(value), 'd MMMM yyyy', { locale })
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  isValid(parseISO(value)) &&
  format(parseISO(value), 'yyyy-MM-dd') === value &&
  value >= '1000-01-15'

const categorySurface = (category: Category) =>
  category === 'REGULER'
    ? 'border-positive bg-card'
    : category === 'PREMIUM'
      ? 'border-warning bg-card'
      : 'border-primary bg-card'
const categoryText = (category: Category) =>
  category === 'REGULER'
    ? 'text-[color-mix(in_srgb,var(--positive)_80%,var(--foreground))] dark:text-positive'
    : category === 'PREMIUM'
      ? 'text-amber-600 dark:text-warning'
      : 'text-primary'

function GroupCard({ group }: { group: AttendanceRateGroup }) {
  const Icon = group.employeeType === 'TRAINING' ? GraduationCap : Users
  return (
    <section
      className='min-w-0 overflow-hidden rounded-lg border bg-card'
      aria-label={`${typeName(group.employeeType)} ${categoryName(group.category)}`}
    >
      <div
        className={cn(
          'flex items-center justify-between gap-2 border-b px-3 py-2.5',
          group.category === 'REGULER'
            ? 'border-positive bg-positive/5'
            : 'border-warning bg-warning/5'
        )}
      >
        <h2 className='flex min-w-0 items-center gap-1.5 text-xs font-semibold'>
          <Icon className='size-3.5 shrink-0' />
          {typeName(group.employeeType)} {categoryName(group.category)}
        </h2>
        <Badge
          variant='outline'
          className={cn(
            'shrink-0 px-1.5 text-[10px] font-normal',
            group.category === 'REGULER'
              ? 'border-positive/60 bg-positive/10'
              : 'border-warning/60 bg-warning/10',
            categoryText(group.category)
          )}
        >
          Rate{' '}
          {group.ratePercent === null
            ? '—'
            : `${number(group.ratePercent, 1)}%`}
        </Badge>
      </div>
      <div className='px-3 py-2'>
        <p className='mb-1.5 min-h-4 text-[11px] text-muted-foreground'>
          {group.modules.length
            ? group.modules.map((module) => module.name).join(', ')
            : 'Belum ada modul'}
        </p>
        <dl className='space-y-0.5 text-xs'>
          {group.jobs.map(({ job, present, roster }) => (
            <div
              key={job.uid}
              className='flex items-start justify-between gap-2 border-b border-dashed py-1.5'
            >
              <dt className='min-w-0 break-words'>{job.name}</dt>
              <dd className='shrink-0 tabular-nums'>
                <strong>{number(present)}</strong> / {number(roster)}
              </dd>
            </div>
          ))}
          {group.unassigned.roster > 0 && (
            <div className='flex justify-between gap-2 py-1.5 text-warning-foreground dark:text-warning'>
              <dt>Belum ada pekerjaan utama</dt>
              <dd className='shrink-0 tabular-nums'>
                {number(group.unassigned.present)} /{' '}
                {number(group.unassigned.roster)}
              </dd>
            </div>
          )}
        </dl>
        <p className='mt-2 border-t pt-2 text-center text-[11px] font-semibold tabular-nums'>
          Total: {number(group.present)} / {number(group.roster)} orang
        </p>
      </div>
    </section>
  )
}

function AverageCard({ average }: { average: AttendanceRateAverage }) {
  const unavailable =
    average.status === 'INCOMPLETE'
      ? 'Perlu pemetaan / periksa data'
      : 'Belum ada data'
  return (
    <div
      className={cn(
        'rounded-lg border px-2 py-2.5 text-center',
        categorySurface(average.category)
      )}
      title={`${number(average.quantityPcs, 2)} PCS / ${number(average.presentDays)} hari-orang hadir; ${number(average.transactions)} setoran`}
    >
      <p className={cn('text-[11px]', categoryText(average.category))}>
        AVG {typeName(average.employeeType)} {categoryName(average.category)}
      </p>
      <p
        className={cn(
          'mt-1 font-semibold tabular-nums',
          average.averagePcs === null
            ? 'text-base text-muted-foreground'
            : cn('text-lg', categoryText(average.category))
        )}
      >
        {average.averagePcs === null ? '—' : number(average.averagePcs, 2)}
      </p>
      <p className='mt-0.5 text-[10px] text-muted-foreground'>
        {average.averagePcs === null ? unavailable : 'PCS / orang hadir / hari'}
      </p>
    </div>
  )
}

export function AttendanceRateReportView({
  report,
}: {
  report: AttendanceRateReport
}) {
  const unmapped = report.unmapped.reduce((sum, item) => sum + item.roster, 0)
  return (
    <div
      className='mx-auto w-full max-w-7xl space-y-3'
      data-testid='attendance-rate-report'
    >
      <div className='rounded-lg bg-gradient-to-r from-blue-800 to-amber-900 px-4 py-3 text-center text-white dark:from-blue-950 dark:to-amber-950'>
        <h1 className='text-lg font-semibold'>Monitoring Attendance Rate</h1>
        <p className='mt-0.5 text-xs opacity-90'>
          {report.site.name} · {dateLabel(report.date)}
        </p>
      </div>
      {(report.warnings.length > 0 || unmapped > 0) && (
        <details className='rounded-lg border border-warning/50 bg-warning/5 px-3 py-2 text-xs'>
          <summary className='cursor-pointer font-medium text-warning-foreground dark:text-warning'>
            <AlertTriangle className='me-1 inline size-3.5' />
            Data perlu diperiksa · {number(report.warnings.length)} peringatan
            {unmapped > 0
              ? ` · ${number(unmapped)} roster belum dipetakan`
              : ''}
            <span className='ms-1 font-normal'>(lihat detail)</span>
          </summary>
          <p className='mt-2 text-muted-foreground'>
            Periksa data sebelum membagikan laporan. Angka yang belum lengkap
            ditandai —.
          </p>
          <ul className='mt-1 space-y-1'>
            {report.warnings.map((warning) => (
              <li key={`${warning.scope}-${warning.code}`}>
                {warning.scope === 'DAY' ? 'Tanggal terpilih' : 'Minggu sumber'}{' '}
                · {warning.message} ({number(warning.count)})
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className='grid grid-cols-1 items-start gap-2 sm:grid-cols-2 xl:grid-cols-4'>
        {report.groups.map((group) => (
          <GroupCard
            key={`${group.employeeType}-${group.category}`}
            group={group}
          />
        ))}
      </div>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
        {report.totals.map((total) => (
          <section
            key={total.employeeType}
            className={cn(
              'rounded-lg border px-3 py-2.5 text-center',
              total.employeeType === 'TRAINING'
                ? categorySurface('PREMIUM')
                : total.employeeType === 'BORONGAN'
                  ? categorySurface('REGULER')
                  : categorySurface('TOTAL')
            )}
            aria-label={`${typeName(total.employeeType)} Rate`}
          >
            <h2 className='text-xs font-medium'>
              {typeName(total.employeeType)}
              {total.employeeType === 'TOTAL' ? '' : ' Rate'}
            </h2>
            <p
              className={cn(
                'my-1 text-2xl font-bold tabular-nums',
                categoryText(
                  total.employeeType === 'TRAINING'
                    ? 'PREMIUM'
                    : total.employeeType === 'BORONGAN'
                      ? 'REGULER'
                      : 'TOTAL'
                )
              )}
            >
              {total.ratePercent === null
                ? '—'
                : `${number(total.ratePercent, 1)}%`}
            </p>
            <p className='text-[11px] text-muted-foreground'>
              {number(total.present)} / {number(total.roster)} hadir
            </p>
          </section>
        ))}
      </div>
      <section aria-label='Rata-rata hasil Linting'>
        <h2
          className='mb-1.5 text-xs font-semibold'
          title={`Sumber AVG: ${dateLabel(report.referenceWeek.from)} - ${dateLabel(report.referenceWeek.to)}`}
        >
          Rata-rata Linting{' '}
          <span className='font-normal text-muted-foreground'>
            · minggu sumber
          </span>
        </h2>
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6'>
          {report.averages
            .filter((average) => average.job.code === 'BORONGAN-LINTING')
            .map((average) => (
              <AverageCard
                key={`${average.employeeType}-${average.category}`}
                average={average}
              />
            ))}
        </div>
      </section>
      <div className='grid gap-2 lg:grid-cols-2'>
        {report.estimates.map((estimate) => (
          <section
            key={estimate.job.code}
            className={cn(
              'rounded-lg border bg-card p-2.5',
              estimate.job.code === 'BORONGAN-LINTING'
                ? 'border-purple-500 dark:border-purple-400'
                : 'border-warning'
            )}
          >
            <h2
              className={cn(
                'mb-2 flex items-center justify-center gap-1.5 text-xs font-semibold',
                estimate.job.code === 'BORONGAN-LINTING'
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-amber-600 dark:text-warning'
              )}
            >
              <Boxes className='size-4' />
              Estimasi Box {estimate.job.name}
            </h2>
            <div className='grid grid-cols-3 gap-2'>
              {estimate.categories.map((item) => (
                <div
                  key={item.category}
                  className={cn(
                    'rounded-md border px-1.5 py-2 text-center',
                    estimate.job.code === 'BORONGAN-LINTING'
                      ? item.category === 'TOTAL'
                        ? 'border-purple-600 bg-purple-600 text-white dark:border-purple-700 dark:bg-purple-700'
                        : 'border-purple-400 bg-purple-50 dark:border-purple-500 dark:bg-purple-500/10'
                      : item.category === 'TOTAL'
                        ? 'border-amber-600 bg-amber-600 text-white dark:border-amber-700 dark:bg-amber-700'
                        : 'border-warning bg-warning/10'
                  )}
                  title={`Estimasi memakai AVG ${estimate.job.name} sendiri, terpisah untuk Training dan Borong.`}
                >
                  <p className='text-[10px] font-medium'>
                    {categoryName(item.category)}
                  </p>
                  <p className='my-1 text-base font-semibold tabular-nums'>
                    {item.boxes === null ? '—' : `${number(item.boxes, 2)} Box`}
                  </p>
                  <p className='text-[10px] opacity-75'>
                    {item.boxes === null
                      ? 'Data belum lengkap'
                      : `${number(item.present)} hadir · ${number(estimate.pcsPerBox)} PCS/box`}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className='text-center text-[10px] text-muted-foreground'>
        Estimasi kapasitas berdasarkan kehadiran dan AVG minggu sebelumnya.
        Bukan hasil produksi aktual.
      </p>
    </div>
  )
}

export function AttendanceRatePage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const session = useAuthStore((state) => state.session)
  const accessKey = JSON.stringify(
    session
      ? [
          session.user.uid,
          session.user.role,
          session.user.roles,
          session.permissions,
          session.user.siteAccess,
        ]
      : null
  )
  if (!canAccessAttendanceRate(session))
    return (
      <Main>
        <p role='alert'>
          Attendance Rate hanya tersedia untuk HR atau Superadmin dengan akses
          Attendance dan Produksi.
        </p>
      </Main>
    )
  return (
    <AttendanceRateBody key={accessKey} search={search} navigate={navigate} />
  )
}

function AttendanceRateBody({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const options = useAttendanceRateOptions()
  const [screenshot, setScreenshot] = useState(false)
  const sites = options.data?.sites ?? []
  const rawSite = typeof search.site === 'string' ? search.site : undefined
  const rawDate = typeof search.date === 'string' ? search.date : undefined
  const site = rawSite ?? sites[0]?.code
  const date = rawDate ?? options.data?.serverToday
  const valid = Boolean(
    options.data &&
    site &&
    sites.some((item) => item.code === site) &&
    date &&
    validDate(date) &&
    date <= options.data.serverToday
  )
  const report = useAttendanceRateReport(site, date, valid && !options.isError)
  const current =
    valid &&
    !options.isError &&
    !report.isError &&
    !report.isFetching &&
    report.data?.data.site.code === site &&
    report.data.data.date === date
      ? report.data.data
      : undefined
  useEffect(() => {
    if (options.isSuccess && valid && (!rawSite || !rawDate))
      navigate({
        search: (previous) => ({ ...previous, site, date }),
        replace: true,
      })
  }, [options.isSuccess, valid, rawSite, rawDate, navigate, site, date])
  const update = (value: { site?: string; date?: string }) => {
    setScreenshot(false)
    navigate({ search: (previous) => ({ ...previous, site, date, ...value }) })
  }
  const refreshing = options.isFetching || report.isFetching
  const refresh = () => {
    if (options.isError || !options.data) void options.refetch()
    else if (valid) void report.refetch()
  }
  return (
    <Main className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Attendance Rate</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Kehadiran dan estimasi kapasitas produksi harian per site.
          </p>
        </div>
        <div
          className='grid w-full grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap lg:w-auto'
          data-testid='attendance-rate-toolbar'
        >
          <div className='min-w-0 sm:w-44 sm:flex-none'>
            <Label className='sr-only' htmlFor='attendance-rate-site'>
              Site
            </Label>
            <Select
              value={site ?? ''}
              onValueChange={(next) => update({ site: next })}
              disabled={
                !sites.length ||
                (sites.length === 1 && sites[0].code === site) ||
                options.isError
              }
            >
              <SelectTrigger id='attendance-rate-site' className='h-9 w-full'>
                <SelectValue placeholder='Pilih site' />
              </SelectTrigger>
              <SelectContent>
                {sites.map((item) => (
                  <SelectItem key={item.uid} value={item.code}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='min-w-0 sm:w-44 sm:flex-none'>
            <Label className='sr-only' htmlFor='attendance-rate-date'>
              Tanggal
            </Label>
            <DatePicker
              id='attendance-rate-date'
              triggerClassName='h-9 text-xs sm:text-sm'
              selected={date && validDate(date) ? parseISO(date) : undefined}
              disabled={!options.data || options.isError}
              disabledDates={(value) => {
                const day = format(value, 'yyyy-MM-dd')
                return (
                  day < '1000-01-15' || day > (options.data?.serverToday ?? '')
                )
              }}
              onSelect={(value) => {
                if (value) update({ date: format(value, 'yyyy-MM-dd') })
              }}
            />
          </div>

          <Button
            variant='outline'
            size='sm'
            className='h-9'
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant='outline'
            size='sm'
            className='h-9'
            disabled={!current}
            onClick={() => setScreenshot(true)}
          >
            <Camera className='size-4' />
            Mode Screenshot
          </Button>
        </div>
      </div>
      {options.isError || report.isError ? (
        <div
          role='alert'
          className='rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm'
        >
          Laporan gagal dimuat. Periksa koneksi dan akses, lalu klik Refresh.
        </div>
      ) : options.isPending ? (
        <Loading />
      ) : !sites.length ? (
        <p className='rounded-lg border p-4 text-sm text-muted-foreground'>
          Belum ada site aktif yang dapat diakses.
        </p>
      ) : !valid ? (
        <div role='alert' className='rounded-lg border p-4 text-sm'>
          Pilih site yang tersedia dan tanggal valid hingga{' '}
          {dateLabel(options.data.serverToday)}.
        </div>
      ) : current ? (
        <AttendanceRateReportView report={current} />
      ) : (
        <Loading />
      )}
      <Dialog
        open={screenshot && Boolean(current)}
        onOpenChange={setScreenshot}
      >
        <DialogContent className='inset-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none p-4 pt-12 sm:max-w-none'>
          <DialogTitle className='sr-only'>
            Screenshot Attendance Rate
          </DialogTitle>
          <DialogDescription className='sr-only'>
            Laporan compact tanpa navigasi. Tekan Escape atau tombol tutup untuk
            kembali.
          </DialogDescription>
          {current && <AttendanceRateReportView report={current} />}
        </DialogContent>
      </Dialog>
    </Main>
  )
}

function Loading() {
  return (
    <div role='status' className='space-y-3'>
      <span className='sr-only'>Memuat Attendance Rate…</span>
      <Skeleton className='h-20 w-full' />
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4'>
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className='h-64' />
        ))}
      </div>
    </div>
  )
}
