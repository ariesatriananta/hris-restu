import { useCallback, useEffect } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileWarning,
  LoaderCircle,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import {
  useAttendanceFoundation,
  useAttendanceRecaps,
  useExportAttendanceRecaps,
} from './data/queries'
import type {
  AttendanceEmployeeType,
  AttendanceRecapCompleteness,
  AttendanceRecapGroup,
  AttendanceRecapListParams,
  AttendanceRecapSummary,
  AttendanceRecapStatus,
  AttendanceSiteCode,
} from './domain'
import { durationLabel, siteLabel } from './recap-columns'
import { AttendanceRecapDetailSheet } from './recap-detail-sheet'
import { AttendanceRecapTable } from './recap-table'

export function AttendanceRecapPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const defaults = defaultPeriod()
  const dateFrom = stringValue(search.dateFrom) ?? defaults.dateFrom
  const dateTo = stringValue(search.dateTo) ?? defaults.dateTo
  const error = rangeError(dateFrom, dateTo)
  const params: AttendanceRecapListParams = {
    dateFrom,
    dateTo,
    query: stringValue(search.filter),
    site: arrayValue<AttendanceSiteCode>(search.site),
    employeeType: arrayValue<AttendanceEmployeeType>(search.employeeType),
    attendanceStatus: arrayValue<AttendanceRecapStatus>(
      search.attendanceStatus
    ),
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  }
  const result = useAttendanceRecaps(params, !error)
  const foundation = useAttendanceFoundation()
  const session = useAuthStore((state) => state.session)
  const exportMutation = useExportAttendanceRecaps()
  const canExportPermission = hasPermission(session, 'attendance.export')
  const capabilityAllowsExport = foundation.data?.capabilities.export ?? false
  const completeness = result.data?.completeness
  const exportDisabledReason = exportReason({
    rangeError: error,
    canExportPermission,
    capabilityAllowsExport,
    completeness,
    isLoading: result.isPending || foundation.isPending,
  })
  const selectedEmployeeUid = stringValue(search.employeeUid)

  useEffect(() => {
    if (search.dateFrom && search.dateTo) return
    navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        dateFrom,
        dateTo,
        page: undefined,
      }),
    })
  }, [dateFrom, dateTo, navigate, search.dateFrom, search.dateTo])

  const openDetail = useCallback(
    (item: AttendanceRecapGroup) =>
      navigate({
        search: (previous) => ({
          ...previous,
          employeeUid: item.employeeUid,
          detailSite: item.site,
          detailEmployeeType: item.employeeType,
        }),
      }),
    [navigate]
  )

  const exportRecap = () => {
    if (exportDisabledReason) return
    exportMutation.mutate(
      {
        dateFrom,
        dateTo,
        query: params.query,
        site: params.site,
        employeeType: params.employeeType,
        attendanceStatus: params.attendanceStatus,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = fileName
          anchor.click()
          window.setTimeout(() => URL.revokeObjectURL(url), 0)
          toast.success('Rekap attendance berhasil diunduh.')
        },
        onError: (exportError) =>
          toast.error(
            isAxiosError(exportError) && exportError.response?.status === 409
              ? 'Ekspor diblokir karena rekap belum lengkap atau belum official.'
              : 'Ekspor rekap attendance gagal.'
          ),
      }
    )
  }

  const siteOptions = (foundation.data?.sites ?? []).map((site) => ({
    value: site.code,
    label: site.name,
  }))

  return (
    <Main>
      <div className='mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Attendance</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Rekap Attendance
          </h1>
          <p className='text-sm text-muted-foreground'>
            Ringkasan per karyawan, site, dan jenis kerja berdasarkan histori
            efektif.
          </p>
        </div>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-end'>
          <div className='grid grid-cols-2 gap-2'>
            <label className='grid gap-1 text-sm'>
              <span className='font-medium'>Dari tanggal</span>
              <Input
                type='date'
                value={dateFrom}
                onChange={(event) => {
                  const nextFrom = event.target.value
                  const maxTo = addDays(nextFrom, 30)
                  const nextTo =
                    dateTo < nextFrom
                      ? nextFrom
                      : dateTo > maxTo
                        ? maxTo
                        : dateTo
                  updatePeriod(navigate, nextFrom, nextTo)
                }}
              />
            </label>
            <label className='grid gap-1 text-sm'>
              <span className='font-medium'>Sampai tanggal</span>
              <Input
                type='date'
                value={dateTo}
                min={dateFrom}
                max={addDays(dateFrom, 30)}
                onChange={(event) =>
                  updatePeriod(navigate, dateFrom, event.target.value)
                }
              />
            </label>
          </div>
          <div className='grid gap-1'>
            <span
              className='hidden text-sm font-medium sm:block'
              aria-hidden='true'
            >
              &nbsp;
            </span>
            <Button
              onClick={exportRecap}
              disabled={
                Boolean(exportDisabledReason) || exportMutation.isPending
              }
              title={exportDisabledReason}
              aria-describedby={
                exportDisabledReason ? 'attendance-export-reason' : undefined
              }
            >
              {exportMutation.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Download />
              )}
              Ekspor Excel
            </Button>
            {exportDisabledReason && (
              <p id='attendance-export-reason' className='sr-only'>
                {exportDisabledReason}
              </p>
            )}
          </div>
        </div>
      </div>

      {error ? (
        <Alert variant='destructive' className='mb-4'>
          <AlertTriangle />
          <AlertTitle>Periode tidak valid</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : (
        <CompletenessPanel data={completeness} isLoading={result.isPending} />
      )}

      {!error && (
        <>
          <Summary data={result.data?.summary} />
          <div className='mt-5'>
            <AttendanceRecapTable
              data={result.data}
              search={search}
              navigate={navigate}
              siteOptions={siteOptions}
              isPending={result.isPending}
              isFetching={result.isFetching}
              isError={result.isError}
              onRetry={() => void result.refetch()}
              onDetail={openDetail}
            />
          </div>
        </>
      )}

      <AttendanceRecapDetailSheet
        employeeUid={selectedEmployeeUid}
        site={enumValue<AttendanceSiteCode>(search.detailSite)}
        employeeType={enumValue<AttendanceEmployeeType>(
          search.detailEmployeeType
        )}
        dateFrom={dateFrom}
        dateTo={dateTo}
        attendanceStatus={params.attendanceStatus}
        onOpenChange={(open) => {
          if (open) return
          navigate({
            search: (previous) => ({
              ...previous,
              employeeUid: undefined,
              detailSite: undefined,
              detailEmployeeType: undefined,
            }),
          })
        }}
      />
    </Main>
  )
}

function Summary({ data }: { data?: AttendanceRecapSummary }) {
  const items = [
    ['Grup karyawan', data?.groups ?? 0, Users, 'text-primary', undefined],
    [
      'Hari kerja',
      data?.scheduledDays ?? 0,
      CalendarDays,
      'text-primary',
      `${data?.holiday ?? 0} libur kalender · ${data?.weeklyOff ?? 0} libur mingguan`,
    ],
    [
      'Hadir kerja',
      data?.presentWorkday ?? 0,
      UserCheck,
      'text-positive',
      undefined,
    ],
    [
      'Hadir hari libur',
      data?.presentHoliday ?? 0,
      CalendarCheck2,
      'text-positive',
      undefined,
    ],
    ['Alpha', data?.absent ?? 0, UserMinus, 'text-destructive', undefined],
    [
      'Cuti / Sakit / Izin',
      `${data?.leave ?? 0} / ${data?.sick ?? 0} / ${data?.permission ?? 0}`,
      CalendarDays,
      'text-primary',
      undefined,
    ],
    [
      'Abnormal',
      data?.abnormal ?? 0,
      AlertTriangle,
      'text-warning-foreground',
      undefined,
    ],
    [
      'Total durasi',
      durationLabel(data?.workedMinutes),
      Clock3,
      'text-primary',
      'Informasi, bukan dasar upah borongan',
    ],
  ] as const
  return (
    <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
      {items.map(([label, value, Icon, color, hint]) => (
        <Card key={label} className='min-h-[68px] rounded-lg'>
          <CardContent className='flex items-center justify-between px-3 py-2.5'>
            <div>
              <p className='text-xs text-muted-foreground'>{label}</p>
              <p className='text-xl font-bold tabular-nums'>{value}</p>
              {hint && (
                <p className='text-[10px] text-muted-foreground'>{hint}</p>
              )}
            </div>
            <Icon className={`size-4 ${color}`} aria-hidden='true' />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function CompletenessPanel({
  data,
  isLoading,
}: {
  data?: AttendanceRecapCompleteness
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className='mb-4 flex min-h-16 items-center justify-center gap-2 rounded-md border border-dashed text-sm text-muted-foreground'>
        <LoaderCircle className='size-4 animate-spin' /> Memeriksa kelengkapan
        periode...
      </div>
    )
  }
  if (!data) return null
  const complete = data.sites.filter((item) =>
    ['FINALIZED', 'NOT_REQUIRED'].includes(item.status)
  ).length
  const failed = data.sites.filter((item) => item.status === 'FAILED').length
  const state = !data.official
    ? 'PRE_GO_LIVE'
    : data.exportAllowed
      ? 'COMPLETE'
      : 'INCOMPLETE'
  return (
    <section
      className='mb-4 rounded-lg border p-3'
      aria-labelledby='completeness-title'
    >
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex items-start gap-2'>
          {state === 'COMPLETE' ? (
            <ShieldCheck className='mt-0.5 size-4 text-positive' />
          ) : (
            <FileWarning className='mt-0.5 size-4 text-warning-foreground' />
          )}
          <div>
            <h2 id='completeness-title' className='text-sm font-semibold'>
              Kelengkapan periode
            </h2>
            <p className='text-xs text-muted-foreground'>
              {complete}/{data.sites.length} kombinasi tanggal-site selesai
              {failed ? ` · ${failed} gagal` : ''}.
            </p>
          </div>
        </div>
        <Badge variant={state === 'COMPLETE' ? 'default' : 'outline'}>
          {state === 'COMPLETE' ? (
            <>
              <CheckCircle2 className='size-3' /> Lengkap
            </>
          ) : state === 'PRE_GO_LIVE' ? (
            <>
              <FileWarning className='size-3' /> Sebelum go-live
            </>
          ) : (
            <>
              <AlertTriangle className='size-3' /> Belum lengkap
            </>
          )}
        </Badge>
      </div>
      {data.blockedReasons.length > 0 && (
        <ul className='mt-2 space-y-1 text-xs text-warning-foreground'>
          {data.blockedReasons.map((reason) => (
            <li key={reason}>• {reason}</li>
          ))}
        </ul>
      )}
      {data.sites.length > 0 && (
        <details className='mt-2 text-xs'>
          <summary className='cursor-pointer font-medium'>
            Lihat rincian status
          </summary>
          <div className='mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3'>
            {data.sites.map((item) => (
              <div
                key={`${item.site}:${item.date}`}
                className='rounded-md bg-muted/50 p-2'
              >
                <p className='font-medium'>
                  {siteLabel(item.site)} · {dateShort(item.date)}
                </p>
                <p className='text-muted-foreground'>
                  {finalizationLabel(item.status)}
                </p>
                {item.reasons.map((reason) => (
                  <p key={reason} className='text-warning-foreground'>
                    {reason}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  )
}

function exportReason(input: {
  rangeError?: string
  canExportPermission: boolean
  capabilityAllowsExport: boolean
  completeness?: AttendanceRecapCompleteness
  isLoading: boolean
}) {
  if (input.rangeError) return input.rangeError
  if (!input.canExportPermission || !input.capabilityAllowsExport)
    return 'Akun tidak memiliki izin ekspor attendance.'
  if (input.isLoading) return 'Tunggu pemeriksaan kelengkapan selesai.'
  if (!input.completeness) return 'Status kelengkapan belum tersedia.'
  if (!input.completeness.official || !input.completeness.exportAllowed)
    return (
      input.completeness.blockedReasons.join(' ') ||
      'Rekap belum lengkap atau belum official.'
    )
  return undefined
}

function updatePeriod(navigate: NavigateFn, dateFrom: string, dateTo: string) {
  navigate({
    search: (previous) => ({
      ...previous,
      dateFrom,
      dateTo,
      page: undefined,
      employeeUid: undefined,
      detailSite: undefined,
      detailEmployeeType: undefined,
    }),
  })
}

function defaultPeriod() {
  const now = new Date()
  return {
    dateFrom: localDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: localDate(now),
  }
}

function rangeError(dateFrom: string, dateTo: string) {
  const start = new Date(`${dateFrom}T00:00:00`)
  const end = new Date(`${dateTo}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
    return 'Tanggal periode tidak valid.'
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1
  if (days < 1) return 'Tanggal akhir tidak boleh sebelum tanggal awal.'
  if (days > 31) return 'Rentang rekap maksimal 31 hari kalender.'
  return undefined
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() + days)
  return localDate(date)
}

function localDate(value: Date) {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function dateShort(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`)
  )
}

function finalizationLabel(value: string) {
  return (
    {
      NOT_STARTED: 'Belum dimulai',
      PRE_GO_LIVE: 'Sebelum go-live',
      NOT_REQUIRED: 'Tidak perlu finalisasi',
      PARTIAL: 'Sebagian',
      FINALIZED: 'Selesai',
      FAILED: 'Gagal',
    }[value] ?? value
  )
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback
}

function arrayValue<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : undefined
}

function enumValue<T>(value: unknown) {
  return typeof value === 'string' ? (value as T) : undefined
}
