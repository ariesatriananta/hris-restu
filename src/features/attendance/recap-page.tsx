import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileWarning,
  LoaderCircle,
  ListChecks,
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import {
  useAttendanceFoundation,
  useAttendanceRecapMatrix,
  useAttendanceRecaps,
  useExportAttendanceRecaps,
} from './data/queries'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'
import type {
  AttendanceEmployeeType,
  AttendanceRecapCompleteness,
  AttendanceRecapCompletenessSite,
  AttendanceRecapGroup,
  AttendanceRecapListParams,
  AttendanceRecapMatrixItem,
  AttendanceRecapSummary,
  AttendanceRecapStatus,
  AttendanceSiteCode,
} from './domain'
import { attendanceProductionSectionOptions } from './filter-options'
import { durationLabel, siteLabel } from './recap-columns'
import { AttendanceRecapDetailSheet } from './recap-detail-sheet'
import { AttendanceRecapMatrixTable } from './recap-matrix-table'
import { AttendanceRecapTable } from './recap-table'

export function AttendanceRecapPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const routerNavigate = useNavigate()
  const defaults = defaultPeriod()
  const dateFrom = stringValue(search.dateFrom) ?? defaults.dateFrom
  const dateTo = stringValue(search.dateTo) ?? defaults.dateTo
  const error = rangeError(dateFrom, dateTo)
  const view = search.view === 'matrix' ? 'matrix' : 'summary'
  const params: AttendanceRecapListParams = {
    dateFrom,
    dateTo,
    query: stringValue(search.filter),
    site: arrayValue<AttendanceSiteCode>(search.site),
    employeeType: arrayValue<AttendanceEmployeeType>(search.employeeType),
    productionSection: arrayValue(search.productionSection),
    attendanceStatus: arrayValue<AttendanceRecapStatus>(
      search.attendanceStatus
    ),
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  }
  const matrixParams: AttendanceRecapListParams = {
    ...params,
    page: numberValue(search.matrixPage, 1),
    pageSize: numberValue(search.matrixPageSize, 50),
  }
  const result = useAttendanceRecaps(params, !error && view === 'summary')
  const matrixResult = useAttendanceRecapMatrix(
    matrixParams,
    !error && view === 'matrix'
  )
  const foundation = useAttendanceFoundation()
  const session = useAuthStore((state) => state.session)
  const exportMutation = useExportAttendanceRecaps()
  const canExportPermission = hasPermission(session, 'attendance.export')
  const capabilityAllowsExport = foundation.data?.capabilities.export ?? false
  const activeResult = view === 'matrix' ? matrixResult : result
  const completeness = activeResult.data?.completeness
  const exportDisabledReason = exportReason({
    rangeError: error,
    canExportPermission,
    capabilityAllowsExport,
  })
  const exportWarning =
    completeness && !completeness.exportAllowed
      ? 'Rekap belum lengkap. Excel tetap dapat diunduh dan akan ditandai sebagai draft.'
      : undefined
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
    (item: AttendanceRecapGroup | AttendanceRecapMatrixItem) =>
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
        productionSection: params.productionSection,
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
          if (fileName.startsWith('DRAFT_')) {
            toast.warning(
              'Data attendance diunduh sebagai draft karena rekap belum lengkap.'
            )
          } else {
            toast.success('Rekap attendance resmi berhasil diunduh.')
          }
        },
        onError: () => toast.error('Ekspor rekap attendance gagal.'),
      }
    )
  }

  const siteOptions = (foundation.data?.sites ?? []).map((site) => ({
    value: site.code,
    label: site.name,
  }))
  const productionSectionOptions = attendanceProductionSectionOptions(
    foundation.data,
    params.site
  )

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
              <DatePicker
                selected={dateOnlyFromInput(dateFrom)}
                onSelect={(date) => {
                  const nextFrom = dateOnlyToInput(date)
                  if (!nextFrom) return
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
              <DatePicker
                selected={dateOnlyFromInput(dateTo)}
                onSelect={(date) => {
                  const nextTo = dateOnlyToInput(date)
                  if (nextTo) updatePeriod(navigate, dateFrom, nextTo)
                }}
                disabledDates={(date) => {
                  const minimum = dateOnlyFromInput(dateFrom)
                  const maximum = dateOnlyFromInput(addDays(dateFrom, 30))
                  return Boolean(
                    (minimum && date < minimum) || (maximum && date > maximum)
                  )
                }}
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
              title={exportDisabledReason ?? exportWarning}
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
        <CompletenessPanel
          data={completeness}
          isLoading={activeResult.isPending}
          onOpenMonitoring={(item) =>
            void routerNavigate({
              to: '/attendance/monitoring-harian',
              search: { businessDate: item.date, site: [item.site] },
            })
          }
        />
      )}

      {!error && (
        <Tabs
          value={view}
          onValueChange={(nextView) =>
            navigate({
              search: (previous) => ({
                ...previous,
                view: nextView === 'matrix' ? 'matrix' : undefined,
                employeeUid: undefined,
                detailSite: undefined,
                detailEmployeeType: undefined,
              }),
            })
          }
          className='gap-4'
        >
          <TabsList
            className='h-auto min-h-12 max-w-full justify-start overflow-x-auto overflow-y-hidden p-1'
            aria-label='Jenis tampilan rekap attendance'
          >
            <TabsTrigger value='summary' className='h-10 shrink-0 px-4'>
              <ListChecks className='size-4' /> Rekap Ringkas
            </TabsTrigger>
            <TabsTrigger value='matrix' className='h-10 shrink-0 px-4'>
              <CalendarDays className='size-4' /> Rincian per Tanggal
            </TabsTrigger>
          </TabsList>
          <TabsContent value='summary' className='space-y-5'>
            <Summary data={result.data?.summary} />
            <AttendanceRecapTable
              data={result.data}
              search={search}
              navigate={navigate}
              siteOptions={siteOptions}
              productionSectionOptions={productionSectionOptions}
              isPending={result.isPending}
              isFetching={result.isFetching}
              isError={result.isError}
              onRetry={() => void result.refetch()}
              onDetail={openDetail}
            />
          </TabsContent>
          <TabsContent value='matrix'>
            <AttendanceRecapMatrixTable
              data={matrixResult.data}
              search={search}
              navigate={navigate}
              siteOptions={siteOptions}
              productionSectionOptions={productionSectionOptions}
              isPending={matrixResult.isPending}
              isFetching={matrixResult.isFetching}
              isError={matrixResult.isError}
              onRetry={() => void matrixResult.refetch()}
              onDetail={openDetail}
            />
          </TabsContent>
        </Tabs>
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
        productionSection={params.productionSection}
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
    {
      label: 'Grup karyawan',
      value: data?.groups ?? 0,
      icon: Users,
      description:
        'Jumlah grup rekap unik berdasarkan kombinasi karyawan, site, dan jenis karyawan pada periode terpilih.',
      tone: 'border-slate-400/25 bg-gradient-to-br from-slate-500/[0.08] via-background to-slate-500/[0.02] text-foreground',
      iconTone: 'text-slate-600 dark:text-slate-300',
    },
    {
      label: 'Hari kerja',
      value: data?.scheduledDays ?? 0,
      icon: CalendarDays,
      description: `Total hari kerja yang dijadwalkan. Periode ini juga memuat ${data?.holiday ?? 0} libur kalender dan ${data?.weeklyOff ?? 0} libur mingguan.`,
      tone: 'border-blue-500/20 bg-gradient-to-br from-blue-500/[0.09] via-background to-blue-500/[0.025] text-foreground',
      iconTone: 'text-blue-600 dark:text-blue-400',
    },
    {
      label: 'Hadir kerja',
      value: data?.presentWorkday ?? 0,
      icon: UserCheck,
      description:
        'Jumlah kehadiran aktual yang tercatat pada hari kerja terjadwal.',
      tone: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.09] via-background to-emerald-500/[0.025] text-foreground',
      iconTone: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Hadir hari libur',
      value: data?.presentHoliday ?? 0,
      icon: CalendarCheck2,
      description:
        'Jumlah kehadiran aktual pada hari libur kalender atau libur mingguan.',
      tone: 'border-teal-500/20 bg-gradient-to-br from-teal-500/[0.09] via-background to-teal-500/[0.025] text-foreground',
      iconTone: 'text-teal-600 dark:text-teal-400',
    },
    {
      label: 'Alpha',
      value: data?.absent ?? 0,
      icon: UserMinus,
      description:
        'Jumlah hari kerja terjadwal tanpa kehadiran atau klasifikasi ketidakhadiran yang disetujui.',
      tone: 'border-rose-500/20 bg-gradient-to-br from-rose-500/[0.09] via-background to-rose-500/[0.025] text-foreground',
      iconTone: 'text-rose-600 dark:text-rose-400',
    },
    {
      label: 'Cuti / Sakit / Izin',
      value: `${data?.leave ?? 0} / ${data?.sick ?? 0} / ${data?.permission ?? 0}`,
      icon: CalendarDays,
      description:
        'Jumlah klasifikasi yang telah diterapkan, berurutan: Cuti, Sakit, lalu Izin.',
      tone: 'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.09] via-background to-violet-500/[0.025] text-foreground',
      iconTone: 'text-violet-600 dark:text-violet-400',
    },
    {
      label: 'Abnormal',
      value: data?.abnormal ?? 0,
      icon: AlertTriangle,
      description:
        'Jumlah record yang kualitas kehadirannya belum normal, misalnya jam masuk atau jam pulang tidak lengkap.',
      tone: 'border-orange-500/20 bg-gradient-to-br from-orange-500/[0.09] via-background to-orange-500/[0.025] text-foreground',
      iconTone: 'text-orange-600 dark:text-orange-400',
    },
    {
      label: 'Total durasi',
      value: durationLabel(data?.workedMinutes),
      icon: Clock3,
      description:
        'Akumulasi durasi antara jam masuk dan jam pulang. Angka ini bersifat informatif dan bukan dasar upah borongan.',
      tone: 'border-cyan-500/20 bg-gradient-to-br from-cyan-500/[0.09] via-background to-cyan-500/[0.025] text-foreground',
      iconTone: 'text-cyan-600 dark:text-cyan-400',
    },
  ]
  return (
    <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8'>
      {items.map(
        ({ label, value, icon: Icon, tone, iconTone, description }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <section
                tabIndex={0}
                className={`min-h-[68px] rounded-lg border px-3 py-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none ${tone}`}
                aria-label={`${label}: ${value}. ${description}`}
              >
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <p className='text-[11px] leading-3 font-medium opacity-80'>
                      {label}
                    </p>
                    <p className='mt-1 text-xl leading-none font-semibold tabular-nums'>
                      {value}
                    </p>
                  </div>
                  <Icon
                    className={`size-3.5 shrink-0 ${iconTone}`}
                    aria-hidden='true'
                  />
                </div>
              </section>
            </TooltipTrigger>
            <TooltipContent className='max-w-72'>{description}</TooltipContent>
          </Tooltip>
        )
      )}
    </div>
  )
}

function CompletenessPanel({
  data,
  isLoading,
  onOpenMonitoring,
}: {
  data?: AttendanceRecapCompleteness
  isLoading: boolean
  onOpenMonitoring: (item: AttendanceRecapCompletenessSite) => void
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
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
  const actionable = data.sites.filter(isActionableCompletenessItem)
  const state = !data.official
    ? 'PRE_GO_LIVE'
    : data.exportAllowed
      ? 'COMPLETE'
      : 'INCOMPLETE'
  return (
    <Collapsible
      open={detailsOpen}
      onOpenChange={setDetailsOpen}
      className='mb-4 rounded-lg border bg-card'
      aria-labelledby='completeness-title'
    >
      <div className='flex flex-wrap items-center gap-3 p-3'>
        <div className='flex items-start gap-2'>
          {state === 'COMPLETE' ? (
            <ShieldCheck className='mt-0.5 size-4 text-positive' />
          ) : (
            <FileWarning className='mt-0.5 size-4 text-amber-700 dark:text-amber-300' />
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
        {actionable[0] && (
          <Button
            size='sm'
            variant='outline'
            className='ml-auto'
            onClick={() => onOpenMonitoring(actionable[0])}
          >
            Tindak lanjuti
          </Button>
        )}
        <CollapsibleTrigger asChild>
          <Button size='sm' variant='ghost' className='group'>
            Rincian
            <ChevronDown className='transition-transform group-data-[state=open]:rotate-180' />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className='border-t p-3 text-xs'>
        {data.blockedReasons.length > 0 && (
          <ul className='mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-300'>
            {data.blockedReasons.map((reason) => (
              <li key={reason}>• {reason}</li>
            ))}
          </ul>
        )}
        {data.sites.length > 0 && (
          <div className='mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3'>
            {data.sites.map((item) => (
              <div
                key={`${item.site}:${item.date}`}
                className='flex items-start justify-between gap-2 rounded-md bg-muted/50 p-2'
              >
                <div>
                  <p className='font-medium'>
                    {siteLabel(item.site)} · {dateShort(item.date)}
                  </p>
                  <p className='text-muted-foreground'>
                    {finalizationLabel(item.status)}
                  </p>
                  {item.reasons.map((reason) => (
                    <p
                      key={reason}
                      className='text-amber-800 dark:text-amber-300'
                    >
                      {reason}
                    </p>
                  ))}
                </div>
                {isActionableCompletenessItem(item) && (
                  <Button
                    size='sm'
                    variant='ghost'
                    className='h-7 shrink-0 px-2 text-xs'
                    onClick={() => onOpenMonitoring(item)}
                  >
                    Monitoring
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

function isActionableCompletenessItem(item: AttendanceRecapCompletenessSite) {
  return (
    ['NOT_STARTED', 'PARTIAL', 'FAILED'].includes(item.status) &&
    !item.reasons.some((reason) => /masa depan|sebelum go-live/i.test(reason))
  )
}

function exportReason(input: {
  rangeError?: string
  canExportPermission: boolean
  capabilityAllowsExport: boolean
}) {
  if (input.rangeError) return input.rangeError
  if (!input.canExportPermission || !input.capabilityAllowsExport)
    return 'Akun tidak memiliki izin ekspor attendance.'
  return undefined
}

function updatePeriod(navigate: NavigateFn, dateFrom: string, dateTo: string) {
  navigate({
    search: (previous) => ({
      ...previous,
      dateFrom,
      dateTo,
      page: undefined,
      matrixPage: undefined,
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
