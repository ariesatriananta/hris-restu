import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  CalendarRange,
  ClipboardCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  RefreshCcw,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { currentListReturnTo } from '@/lib/list-return-to'
import { cn } from '@/lib/utils'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DataTableActionButton,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import { AttendanceDateTimePicker } from './attendance-date-time-picker'
import { AttendanceReadinessPanel } from './attendance-readiness-panel'
import { AttendanceRecordTimelineSheet } from './attendance-record-timeline-sheet'
import { AttendanceCorrectionReviewDialog } from './correction-review-dialog'
import {
  useAttendanceFoundation,
  useAttendanceMonitoring,
  useCreateAttendanceCorrection,
} from './data/queries'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'
import type {
  AttendanceCorrectionInput,
  AttendanceCorrectionType,
  AttendanceMonitoringRecord,
  AttendanceMonitoringSummary,
  AttendanceSiteCode,
  AttendanceStatus,
} from './domain'
import {
  attendanceEmployeeTypeOptions,
  attendanceProductionSectionOptions,
} from './filter-options'
import { MonitoringFinalizationPanel } from './monitoring-finalization-panel'

export function AttendanceMonitoringPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const session = useAuthStore((state) => state.session)
  const routerNavigate = useNavigate()
  const canCorrect = hasPermission(session, 'attendance.correct')
  const canApprove = hasPermission(session, 'attendance.approve')
  const isAttendanceHr =
    session?.user.role === 'HR_OFFICER' || session?.user.role === 'SUPER_ADMIN'
  const canClassify = canCorrect && isAttendanceHr
  const canFinalize =
    hasPermission(session, 'attendance.finalize') &&
    (session?.user.role === 'HR_OFFICER' ||
      session?.user.role === 'SUPER_ADMIN')
  const foundation = useAttendanceFoundation()
  const businessDate =
    typeof search.businessDate === 'string' ? search.businessDate : today()
  const result = useAttendanceMonitoring({
    businessDate,
    query: stringValue(search.filter),
    site: arrayValue(search.site),
    employeeType: arrayValue(search.employeeType),
    productionSection: arrayValue(search.productionSection),
    attendanceStatus: arrayValue(search.attendanceStatus),
    qualityStatus: arrayValue(search.qualityStatus),
    abnormalReason: arrayValue(search.abnormalReason),
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  })
  const [selected, setSelected] = useState<AttendanceMonitoringRecord>()
  const [reviewCorrectionUid, setReviewCorrectionUid] = useState<string>()
  const [timelineUid, setTimelineUid] = useState<string>()
  const goLiveDate = foundation.data?.configuration.goLiveDate
  const selectedSites = arrayValue<AttendanceSiteCode>(search.site)
  const setBusinessDate = (value: string) =>
    navigate({
      search: (previous) => ({
        ...previous,
        businessDate: value === today() ? undefined : value,
        page: undefined,
      }),
    })
  const siteOptions = (foundation.data?.sites ?? []).map((site) => ({
    value: site.code,
    label: site.name,
  }))
  const productionSectionOptions = attendanceProductionSectionOptions(
    foundation.data,
    selectedSites
  )

  return (
    <Main>
      <div className='mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Attendance</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Monitoring Harian
          </h1>
          <p className='text-sm text-muted-foreground'>
            Pantau kehadiran dan rekaman jam yang perlu ditindaklanjuti HR.
          </p>
        </div>
        <div className='grid gap-1 text-sm'>
          <span className='font-medium'>Tanggal kerja</span>
          <div className='flex flex-wrap items-center gap-1.5'>
            <Button
              type='button'
              size='icon'
              variant='outline'
              aria-label='Tanggal sebelumnya'
              disabled={Boolean(goLiveDate && businessDate <= goLiveDate)}
              onClick={() => setBusinessDate(moveDate(businessDate, -1))}
            >
              <ChevronLeft />
            </Button>
            <DatePicker
              selected={dateOnlyFromInput(businessDate)}
              onSelect={(date) => {
                const value = dateOnlyToInput(date)
                if (value) setBusinessDate(value)
              }}
              disabledDates={(date) => {
                const value = dateOnlyToInput(date)
                return Boolean(
                  value &&
                  ((goLiveDate && value < goLiveDate) || value > today())
                )
              }}
              triggerClassName='w-[11.5rem]'
            />
            <Button
              type='button'
              size='icon'
              variant='outline'
              aria-label='Tanggal berikutnya'
              disabled={businessDate >= today()}
              onClick={() => setBusinessDate(moveDate(businessDate, 1))}
            >
              <ChevronRight />
            </Button>
            <Button
              type='button'
              size='sm'
              variant={businessDate === today() ? 'secondary' : 'outline'}
              disabled={businessDate === today()}
              onClick={() => setBusinessDate(today())}
            >
              Hari ini
            </Button>
          </div>
        </div>
      </div>

      <AttendanceReadinessPanel
        sites={selectedSites}
        onOpenFinalization={(site, rerunDate) => {
          void navigate({
            search: (previous) => ({
              ...previous,
              site: [site],
              businessDate: rerunDate ?? previous.businessDate,
              page: undefined,
            }),
          })
          document
            .getElementById('finalisasi-attendance')
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }}
      />
      <div id='finalisasi-attendance' className='scroll-mt-4'>
        <MonitoringFinalizationPanel
          businessDate={businessDate}
          sites={selectedSites}
          availableSites={foundation.data?.sites ?? []}
          goLiveDate={goLiveDate}
          canFinalize={canFinalize}
        />
      </div>
      <AttentionShortcuts
        summary={result.data?.summary}
        businessDate={businessDate}
        search={search}
        navigate={navigate}
        onOpenCorrections={() =>
          void routerNavigate({
            to: '/attendance/tindak-lanjut',
            search: {
              tab: 'correction',
              businessDate,
              approvalStatus: ['PENDING'],
            },
          })
        }
        onOpenClassifications={() =>
          void routerNavigate({
            to: '/attendance/tindak-lanjut',
            search: {
              tab: 'classification',
              dateFrom: businessDate,
              dateTo: businessDate,
              approvalStatus: ['PENDING'],
            },
          })
        }
        canOpenCorrections={canCorrect || canApprove}
        canOpenClassifications={(canCorrect || canApprove) && isAttendanceHr}
      />
      <Summary
        data={result.data?.summary}
        search={search}
        navigate={navigate}
      />
      <div className='mt-5'>
        <MonitoringTable
          result={result}
          search={search}
          navigate={navigate}
          siteOptions={siteOptions}
          productionSectionOptions={productionSectionOptions}
          canCorrect={canCorrect}
          canApprove={canApprove}
          canClassify={canClassify}
          onOpenDetail={(record) => setTimelineUid(record.uid)}
          onCorrect={setSelected}
          onReviewCorrection={(record) =>
            setReviewCorrectionUid(record.pendingCorrectionUid ?? undefined)
          }
          onClassify={(record) =>
            void routerNavigate({
              to: '/attendance/tindak-lanjut',
              search: {
                tab: 'classification',
                employeeUid: record.employeeUid,
                employeeName: record.employeeName,
                employeeNumber: record.employeeNumber,
                employeeSite: record.site,
                employeeType: record.employeeType,
                businessDate: record.businessDate,
              },
            })
          }
        />
      </div>
      <CorrectionRequestDialog
        key={selected?.uid ?? 'closed'}
        record={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(undefined)}
      />
      <AttendanceCorrectionReviewDialog
        key={reviewCorrectionUid ?? 'closed-review'}
        correctionUid={reviewCorrectionUid}
        canApprove={canApprove}
        open={Boolean(reviewCorrectionUid)}
        onOpenChange={(open) => !open && setReviewCorrectionUid(undefined)}
      />
      <AttendanceRecordTimelineSheet
        attendanceUid={timelineUid}
        onOpenChange={(open) => !open && setTimelineUid(undefined)}
      />
    </Main>
  )
}

function Summary({
  data,
  search,
  navigate,
}: {
  data?: AttendanceMonitoringSummary
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const items = [
    {
      label: 'Total',
      value: data?.total ?? 0,
      icon: Users,
      filter: 'ALL',
      description:
        'Jumlah seluruh record Attendance pada tanggal dan filter yang sedang dipilih.',
      tone: 'border-slate-400/25 bg-gradient-to-br from-slate-500/[0.08] via-background to-slate-500/[0.02] text-foreground',
      iconTone: 'text-slate-600 dark:text-slate-300',
    },
    {
      label: 'Hadir',
      value: data?.present ?? 0,
      icon: Clock3,
      filter: 'PRESENT',
      description:
        'Karyawan dengan status Hadir, termasuk record yang masih perlu dilengkapi jam masuk atau pulangnya.',
      tone: 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.09] via-background to-emerald-500/[0.025] text-foreground',
      iconTone: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Alpha',
      value: data?.absent ?? 0,
      icon: AlertTriangle,
      filter: 'ABSENT',
      description:
        'Karyawan terjadwal yang tidak memiliki kehadiran atau klasifikasi ketidakhadiran yang disetujui.',
      tone: 'border-rose-500/20 bg-gradient-to-br from-rose-500/[0.09] via-background to-rose-500/[0.025] text-foreground',
      iconTone: 'text-rose-600 dark:text-rose-400',
    },
    {
      label: 'Cuti',
      value: data?.leave ?? 0,
      icon: CalendarRange,
      filter: 'LEAVE',
      description: 'Karyawan dengan klasifikasi Cuti yang telah diterapkan.',
      tone: 'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.09] via-background to-violet-500/[0.025] text-foreground',
      iconTone: 'text-violet-600 dark:text-violet-400',
    },
    {
      label: 'Sakit',
      value: data?.sick ?? 0,
      icon: Users,
      filter: 'SICK',
      description: 'Karyawan dengan klasifikasi Sakit yang telah diterapkan.',
      tone: 'border-amber-500/20 bg-gradient-to-br from-amber-500/[0.09] via-background to-amber-500/[0.025] text-foreground',
      iconTone: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Izin',
      value: data?.permission ?? 0,
      icon: CalendarRange,
      filter: 'PERMISSION',
      description: 'Karyawan dengan klasifikasi Izin yang telah diterapkan.',
      tone: 'border-sky-500/20 bg-gradient-to-br from-sky-500/[0.09] via-background to-sky-500/[0.025] text-foreground',
      iconTone: 'text-sky-600 dark:text-sky-400',
    },
    {
      label: 'Libur',
      value: data?.holiday ?? 0,
      icon: CalendarRange,
      filter: 'HOLIDAY',
      description:
        'Record libur berdasarkan kalender kerja yang berlaku pada site karyawan.',
      tone: 'border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.09] via-background to-indigo-500/[0.025] text-foreground',
      iconTone: 'text-indigo-600 dark:text-indigo-400',
    },
    {
      label: 'Abnormal',
      value: data?.abnormal ?? 0,
      icon: AlertTriangle,
      filter: 'ABNORMAL',
      description: `Record kehadiran belum lengkap atau tidak normal: ${data?.missingClockIn ?? 0} tanpa jam masuk dan ${data?.missingClockOut ?? 0} tanpa jam pulang.`,
      tone: 'border-orange-500/20 bg-gradient-to-br from-orange-500/[0.09] via-background to-orange-500/[0.025] text-foreground',
      iconTone: 'text-orange-600 dark:text-orange-400',
    },
  ] satisfies Array<{
    label: string
    value: number
    icon: typeof Users
    filter: MonitoringView
    tone: string
    iconTone: string
    description: string
  }>
  return (
    <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8'>
      {items.map(
        ({ label, value, icon: Icon, filter, tone, iconTone, description }) => (
          <section
            key={label}
            className={`min-h-[68px] rounded-lg border transition-colors ${tone} ${monitoringViewIsActive(search, filter) ? 'border-primary ring-1 ring-primary/30' : ''}`}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type='button'
                  className='h-full w-full rounded-lg px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none'
                  aria-pressed={monitoringViewIsActive(search, filter)}
                  aria-label={`Filter ${label}: ${value} data. ${description}`}
                  onClick={() => applyMonitoringView(navigate, filter)}
                >
                  <span className='flex items-start justify-between gap-3'>
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
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent className='max-w-72'>
                {description}
              </TooltipContent>
            </Tooltip>
          </section>
        )
      )}
    </div>
  )
}

function AttentionShortcuts({
  summary,
  businessDate,
  search,
  navigate,
  onOpenCorrections,
  onOpenClassifications,
  canOpenCorrections,
  canOpenClassifications,
}: {
  summary?: AttendanceMonitoringSummary
  businessDate: string
  search: Record<string, unknown>
  navigate: NavigateFn
  onOpenCorrections: () => void
  onOpenClassifications: () => void
  canOpenCorrections: boolean
  canOpenClassifications: boolean
}) {
  const attentionCount = (summary?.absent ?? 0) + (summary?.abnormal ?? 0)
  return (
    <div className='mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2'>
      <div className='mr-auto min-w-44'>
        <p className='text-sm font-semibold'>Perlu tindakan</p>
        <p className='text-xs text-muted-foreground'>
          {attentionCount} temuan pada {dateLabel(businessDate)}
        </p>
      </div>
      <Button
        size='sm'
        variant={
          monitoringViewIsActive(search, 'ABSENT') ? 'default' : 'outline'
        }
        onClick={() => applyMonitoringView(navigate, 'ABSENT')}
      >
        Alpha ({summary?.absent ?? 0})
      </Button>
      <Button
        size='sm'
        variant={
          monitoringViewIsActive(search, 'ABNORMAL') ? 'default' : 'outline'
        }
        onClick={() => applyMonitoringView(navigate, 'ABNORMAL')}
      >
        Abnormal ({summary?.abnormal ?? 0})
      </Button>
      {canOpenCorrections && (
        <Button size='sm' variant='outline' onClick={onOpenCorrections}>
          Koreksi pending
        </Button>
      )}
      {canOpenClassifications && (
        <Button size='sm' variant='outline' onClick={onOpenClassifications}>
          Klasifikasi pending
        </Button>
      )}
    </div>
  )
}

type MonitoringView = AttendanceStatus | 'ABNORMAL' | 'ALL'

function applyMonitoringView(navigate: NavigateFn, view: MonitoringView) {
  navigate({
    search: (previous) => ({
      ...previous,
      attendanceStatus:
        view !== 'ALL' && view !== 'ABNORMAL' ? [view] : undefined,
      qualityStatus: view === 'ABNORMAL' ? ['ABNORMAL'] : undefined,
      abnormalReason: undefined,
      page: undefined,
    }),
  })
}

function monitoringViewIsActive(
  search: Record<string, unknown>,
  view: MonitoringView
) {
  const attendance = arrayValue<string>(search.attendanceStatus) ?? []
  const quality = arrayValue<string>(search.qualityStatus) ?? []
  const reason = arrayValue<string>(search.abnormalReason) ?? []
  if (view === 'ALL') {
    return !attendance.length && !quality.length && !reason.length
  }
  if (view === 'ABNORMAL') {
    return !attendance.length && quality.length === 1 && quality[0] === view
  }
  return attendance.length === 1 && attendance[0] === view && !quality.length
}

function MonitoringTable({
  result,
  search,
  navigate,
  siteOptions,
  productionSectionOptions,
  canCorrect,
  canApprove,
  canClassify,
  onOpenDetail,
  onCorrect,
  onReviewCorrection,
  onClassify,
}: {
  result: ReturnType<typeof useAttendanceMonitoring>
  search: Record<string, unknown>
  navigate: NavigateFn
  siteOptions: { value: string; label: string }[]
  productionSectionOptions: { value: string; label: string }[]
  canCorrect: boolean
  canApprove: boolean
  canClassify: boolean
  onOpenDetail: (record: AttendanceMonitoringRecord) => void
  onCorrect: (record: AttendanceMonitoringRecord) => void
  onReviewCorrection: (record: AttendanceMonitoringRecord) => void
  onClassify: (record: AttendanceMonitoringRecord) => void
}) {
  const returnTo = currentListReturnTo()
  const columns = useMemo<ColumnDef<AttendanceMonitoringRecord>[]>(
    () => [
      {
        accessorKey: 'employeeName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Karyawan' />
        ),
        cell: ({ row }) => (
          <div className='min-w-0'>
            <Link
              className='block truncate font-medium hover:underline'
              title={row.original.employeeName}
              to='/karyawan/data-karyawan/$employeeUid'
              params={{ employeeUid: row.original.employeeUid }}
              search={{ returnTo }}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {row.original.employeeName}
            </Link>
            <p className='text-xs text-muted-foreground'>
              {monitoringSiteLabel(row.original.site)} -{' '}
              {row.original.employeeNumber}
            </p>
          </div>
        ),
        meta: {
          label: 'Karyawan',
          className: 'w-[18%] px-2',
          tdClassName: 'whitespace-normal',
        },
      },
      {
        accessorKey: 'site',
        header: 'Site',
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
      },
      {
        accessorKey: 'employeeType',
        header: 'Jenis & Jabatan',
        cell: ({ row }) => (
          <div className='min-w-0'>
            <p className='font-medium'>
              {employeeTypeLabel(row.original.employeeType)}
            </p>
            <p
              className='truncate text-[11px] leading-3 text-muted-foreground'
              title={row.original.position || '-'}
            >
              {row.original.position || '-'}
            </p>
          </div>
        ),
        meta: {
          label: 'Jenis & Jabatan',
          className: 'w-[14%] px-2',
          tdClassName: 'whitespace-normal',
        },
      },
      {
        accessorKey: 'productionSectionUid',
        id: 'productionSection',
        header: 'Bagian produksi',
      },
      {
        id: 'productionArea',
        header: 'Bagian Produksi',
        cell: ({ row }) => (
          <div className='min-w-0'>
            <p
              className='truncate font-medium'
              title={row.original.productionModule || '-'}
            >
              {row.original.productionModule || '-'}
            </p>
            <p
              className='truncate text-[11px] leading-3 text-muted-foreground'
              title={row.original.productionSection || '-'}
            >
              {row.original.productionSection || '-'}
            </p>
          </div>
        ),
        meta: {
          label: 'Bagian Produksi',
          className: 'w-[16%] px-2',
          tdClassName: 'whitespace-normal',
        },
      },
      {
        accessorKey: 'shiftName',
        header: 'Shift',
        cell: ({ row }) => (
          <p className='truncate' title={row.original.shiftName ?? '-'}>
            {row.original.shiftName ?? '-'}
          </p>
        ),
        meta: {
          label: 'Shift',
          className: 'w-[13%] px-2',
          tdClassName: 'whitespace-normal',
        },
      },
      {
        accessorKey: 'attendanceStatus',
        header: 'Status',
        cell: ({ row }) => (
          <AttendanceStatusBadge value={row.original.attendanceStatus} />
        ),
        meta: { label: 'Status', className: 'w-[9%] px-2' },
      },
      {
        id: 'clock',
        header: 'Masuk / Pulang',
        cell: ({ row }) => (
          <div className='text-sm whitespace-nowrap'>
            <span>{timeLabel(row.original.clockInAt)}</span>
            <span className='text-muted-foreground'> / </span>
            <span>{timeLabel(row.original.clockOutAt)}</span>
          </div>
        ),
        meta: { label: 'Masuk / Pulang', className: 'w-[13%] px-2' },
      },
      {
        accessorKey: 'qualityStatus',
        header: 'Kualitas',
        cell: ({ row }) => <QualityBadge record={row.original} />,
        meta: { label: 'Kualitas', className: 'w-[10%] px-2' },
      },
      {
        accessorKey: 'abnormalReasons',
        header: 'Penyebab abnormal',
        cell: ({ row }) =>
          row.original.abnormalReasons.map(abnormalLabel).join(', ') || '-',
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>Aksi</span>,
        cell: ({ row }) => (
          <div
            className='flex items-center justify-end gap-1'
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <DataTableActionButton
              label='Lihat timeline'
              onClick={() => onOpenDetail(row.original)}
            >
              <Eye />
            </DataTableActionButton>
            {canApprove && row.original.pendingCorrectionUid && (
              <DataTableActionButton
                label='Review koreksi menunggu'
                onClick={() => onReviewCorrection(row.original)}
              >
                <ClipboardCheck />
              </DataTableActionButton>
            )}
            {canCorrect &&
              !row.original.pendingCorrectionUid &&
              !row.original.hasAppliedClassification && (
                <DataTableActionButton
                  label='Ajukan koreksi'
                  onClick={() => onCorrect(row.original)}
                >
                  <Clock3 />
                </DataTableActionButton>
              )}
            {canClassify && row.original.attendanceStatus === 'ABSENT' && (
              <DataTableActionButton
                label='Ajukan klasifikasi'
                onClick={() => onClassify(row.original)}
              >
                <CalendarRange />
              </DataTableActionButton>
            )}
          </div>
        ),
        meta: { className: 'w-[7%] px-1' },
      },
    ],
    [
      canApprove,
      canClassify,
      canCorrect,
      onClassify,
      onCorrect,
      onOpenDetail,
      onReviewCorrection,
      returnTo,
    ]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      {
        columnId: 'employeeType',
        searchKey: 'employeeType',
        type: 'array',
      },
      {
        columnId: 'productionSection',
        searchKey: 'productionSection',
        type: 'array',
      },
      {
        columnId: 'attendanceStatus',
        searchKey: 'attendanceStatus',
        type: 'array',
      },
      { columnId: 'qualityStatus', searchKey: 'qualityStatus', type: 'array' },
      {
        columnId: 'abnormalReasons',
        searchKey: 'abnormalReason',
        type: 'array',
      },
    ],
  })
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: result.data?.items ?? [],
    columns,
    state: {
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
    },
    pageCount: Math.max(
      1,
      Math.ceil((result.data?.total ?? 0) / (result.data?.pageSize ?? 50))
    ),
    manualPagination: true,
    manualFiltering: true,
    initialState: {
      columnVisibility: {
        site: false,
        productionSection: false,
        abnormalReasons: false,
      },
    },
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
  })
  const data = result.data
  return (
    <div className='space-y-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari nama atau nomor karyawan...'
        searchDebounceMs={500}
        filters={[
          { columnId: 'site', title: 'Site', options: siteOptions },
          {
            columnId: 'employeeType',
            title: 'Jenis karyawan',
            options: attendanceEmployeeTypeOptions,
          },
          {
            columnId: 'productionSection',
            title: 'Bagian produksi',
            options: productionSectionOptions,
          },
          {
            columnId: 'attendanceStatus',
            title: 'Status',
            options: attendanceStatusOptions,
          },
          {
            columnId: 'qualityStatus',
            title: 'Kualitas',
            options: qualityOptions,
          },
          {
            columnId: 'abnormalReasons',
            title: 'Penyebab',
            options: abnormalOptions,
          },
        ]}
      />
      {result.isPending ? (
        <StateText>Memuat monitoring attendance...</StateText>
      ) : result.isError ? (
        <StateText>
          Data gagal dimuat.{' '}
          <Button
            variant='outline'
            size='sm'
            onClick={() => void result.refetch()}
          >
            <RefreshCcw /> Coba lagi
          </Button>
        </StateText>
      ) : !data?.items.length ? (
        <StateText>
          Tidak ada data attendance pada tanggal dan filter ini.
        </StateText>
      ) : (
        <>
          <div className='hidden rounded-md border xl:block'>
            <Table className='table-fixed [&_th]:leading-4 [&_th]:whitespace-normal'>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={cn(
                          header.column.columnDef.meta?.className,
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
                    tabIndex={0}
                    aria-label={`Buka timeline ${row.original.employeeName}`}
                    onClick={() => onOpenDetail(row.original)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpenDetail(row.original)
                      }
                    }}
                    className={cn(
                      'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      row.original.qualityStatus === 'ABNORMAL'
                        ? 'bg-warning/5'
                        : undefined
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          cell.column.columnDef.meta?.className,
                          cell.column.columnDef.meta?.tdClassName
                        )}
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
            {data.items.map((item) => (
              <MobileRecord
                key={item.uid}
                item={item}
                canCorrect={canCorrect}
                canApprove={canApprove}
                canClassify={canClassify}
                onOpenDetail={onOpenDetail}
                onCorrect={onCorrect}
                onReviewCorrection={onReviewCorrection}
                onClassify={onClassify}
                returnTo={returnTo}
              />
            ))}
          </div>
          <DataTablePagination
            table={table}
            summary={paginationSummary(data.page, data.pageSize, data.total)}
          />
        </>
      )}
    </div>
  )
}

function MobileRecord({
  item,
  canCorrect,
  canApprove,
  canClassify,
  onOpenDetail,
  onCorrect,
  onReviewCorrection,
  onClassify,
  returnTo,
}: {
  item: AttendanceMonitoringRecord
  canCorrect: boolean
  canApprove: boolean
  canClassify: boolean
  onOpenDetail: (item: AttendanceMonitoringRecord) => void
  onCorrect: (item: AttendanceMonitoringRecord) => void
  onReviewCorrection: (item: AttendanceMonitoringRecord) => void
  onClassify: (item: AttendanceMonitoringRecord) => void
  returnTo?: string
}) {
  return (
    <div className='space-y-3 rounded-lg border p-3'>
      <div className='flex items-start justify-between gap-2'>
        <div>
          <Link
            className='font-medium hover:underline'
            to='/karyawan/data-karyawan/$employeeUid'
            params={{ employeeUid: item.employeeUid }}
            search={{ returnTo }}
          >
            {item.employeeName}
          </Link>
          <p className='text-xs text-muted-foreground'>
            {monitoringSiteLabel(item.site)} - {item.employeeNumber}
          </p>
        </div>
        <div className='flex flex-wrap justify-end gap-1.5'>
          <AttendanceStatusBadge value={item.attendanceStatus} />
          <QualityBadge record={item} />
        </div>
      </div>
      <div className='grid grid-cols-2 gap-3 text-xs'>
        <div className='min-w-0'>
          <p className='text-muted-foreground'>Jenis & Jabatan</p>
          <p className='truncate'>
            {employeeTypeLabel(item.employeeType)} · {item.position || '-'}
          </p>
        </div>
        <div className='min-w-0'>
          <p className='text-muted-foreground'>Bagian Produksi</p>
          <p className='truncate'>
            {item.productionModule || '-'} · {item.productionSection || '-'}
          </p>
        </div>
      </div>
      <div className='grid grid-cols-2 gap-2 text-sm'>
        <div>
          <p className='text-xs text-muted-foreground'>Masuk</p>
          {timeLabel(item.clockInAt)}
        </div>
        <div>
          <p className='text-xs text-muted-foreground'>Pulang</p>
          {timeLabel(item.clockOutAt)}
        </div>
      </div>
      <Button
        variant='outline'
        className='w-full'
        onClick={() => onOpenDetail(item)}
      >
        <Eye /> Lihat timeline
      </Button>
      {canApprove && item.pendingCorrectionUid && (
        <Button className='w-full' onClick={() => onReviewCorrection(item)}>
          <ClipboardCheck /> Review koreksi menunggu
        </Button>
      )}
      {canCorrect &&
        !item.pendingCorrectionUid &&
        !item.hasAppliedClassification && (
          <Button
            variant='outline'
            className='w-full'
            onClick={() => onCorrect(item)}
          >
            <Clock3 /> Ajukan koreksi
          </Button>
        )}
      {canClassify && item.attendanceStatus === 'ABSENT' && (
        <Button
          variant='outline'
          className='w-full'
          onClick={() => onClassify(item)}
        >
          <CalendarRange /> Ajukan klasifikasi
        </Button>
      )}
    </div>
  )
}

function QualityBadge({ record }: { record: AttendanceMonitoringRecord }) {
  if (record.qualityStatus === 'NORMAL')
    return <Badge variant='secondary'>Normal</Badge>
  return (
    <Badge
      variant='outline'
      className='border-warning/60 bg-warning/15 text-warning-foreground'
    >
      {record.abnormalReasons.map(abnormalLabel).join(', ') || 'Abnormal'}
    </Badge>
  )
}

function AttendanceStatusBadge({ value }: { value: AttendanceStatus }) {
  const tone: Record<AttendanceStatus, string> = {
    PRESENT:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    ABSENT: 'border-destructive/30 bg-destructive/10 text-destructive',
    LEAVE: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    SICK: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    PERMISSION:
      'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400',
    HOLIDAY: 'border-muted-foreground/25 bg-muted text-muted-foreground',
  }
  return (
    <Badge variant='outline' className={tone[value]}>
      {statusLabel(value)}
    </Badge>
  )
}

function CorrectionRequestDialog({
  record,
  open,
  onOpenChange,
}: {
  record?: AttendanceMonitoringRecord
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mutation = useCreateAttendanceCorrection()
  const defaultType = record?.abnormalReasons.includes('MISSING_CLOCK_IN')
    ? 'CLOCK_IN'
    : record?.abnormalReasons.includes('MISSING_CLOCK_OUT')
      ? 'CLOCK_OUT'
      : 'BOTH'
  const [type, setType] = useState<AttendanceCorrectionType>(defaultType)
  const [clockIn, setClockIn] = useState('')
  const [clockOut, setClockOut] = useState('')
  const [status, setStatus] = useState<AttendanceStatus>('PRESENT')
  const [reason, setReason] = useState('')
  if (!record) return null
  const submit = () => {
    if (reason.trim().length < 5)
      return toast.error('Alasan koreksi minimal 5 karakter.')
    if ((type === 'CLOCK_IN' || type === 'BOTH') && !clockIn)
      return toast.error('Jam masuk baru wajib diisi.')
    if ((type === 'CLOCK_OUT' || type === 'BOTH') && !clockOut)
      return toast.error('Jam pulang baru wajib diisi.')
    const input: AttendanceCorrectionInput = {
      attendanceUid: record.uid,
      correctionType: type,
      newClockInAt:
        type === 'CLOCK_IN' || type === 'BOTH' ? clockIn || null : undefined,
      newClockOutAt:
        type === 'CLOCK_OUT' || type === 'BOTH' ? clockOut || null : undefined,
      newStatus: type === 'STATUS' ? status : undefined,
      reason: reason.trim(),
    }
    mutation.mutate(input, {
      onSuccess: () => {
        toast.success('Koreksi berhasil diajukan.')
        onOpenChange(false)
      },
      onError: (error) =>
        toast.error(apiError(error, 'Koreksi gagal diajukan.')),
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Ajukan Koreksi Attendance</DialogTitle>
          <DialogDescription>
            {record.employeeName} · {record.employeeNumber} ·{' '}
            {dateLabel(record.businessDate)}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <label className='grid gap-1 text-sm'>
            <span>Jenis koreksi</span>
            <select
              className='h-9 rounded-md border bg-background px-3'
              value={type}
              onChange={(event) =>
                setType(event.target.value as AttendanceCorrectionType)
              }
            >
              <option value='CLOCK_IN'>Jam masuk</option>
              <option value='CLOCK_OUT'>Jam pulang</option>
              <option value='BOTH'>Jam masuk dan pulang</option>
              <option value='STATUS'>Status kehadiran</option>
            </select>
          </label>
          {(type === 'CLOCK_IN' || type === 'BOTH') && (
            <label className='grid gap-1 text-sm'>
              <span>Jam masuk baru</span>
              <AttendanceDateTimePicker
                key={`${record.uid}-clock-in`}
                value={clockIn}
                defaultDate={record.businessDate}
                onChange={setClockIn}
              />
            </label>
          )}
          {(type === 'CLOCK_OUT' || type === 'BOTH') && (
            <label className='grid gap-1 text-sm'>
              <span>Jam pulang baru</span>
              <AttendanceDateTimePicker
                key={`${record.uid}-clock-out`}
                value={clockOut}
                defaultDate={record.businessDate}
                onChange={setClockOut}
              />
            </label>
          )}
          {type === 'STATUS' && (
            <label className='grid gap-1 text-sm'>
              <span>Status baru</span>
              <select
                className='h-9 rounded-md border bg-background px-3'
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as AttendanceStatus)
                }
              >
                {attendanceStatusOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className='grid gap-1'>
            <Label htmlFor='correction-reason'>Alasan koreksi</Label>
            <Textarea
              id='correction-reason'
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder='Jelaskan penyebab dan bukti koreksi.'
            />
          </div>
          <div className='flex justify-end gap-2'>
            <Button variant='outline' onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button onClick={submit} disabled={mutation.isPending}>
              Ajukan koreksi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const attendanceStatusOptions = [
  'PRESENT',
  'ABSENT',
  'LEAVE',
  'SICK',
  'PERMISSION',
  'HOLIDAY',
].map((value) => ({ value, label: statusLabel(value) }))
const qualityOptions = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'ABNORMAL', label: 'Abnormal' },
]
const abnormalOptions = [
  { value: 'MISSING_CLOCK_IN', label: 'Tanpa jam masuk' },
  { value: 'MISSING_CLOCK_OUT', label: 'Tanpa jam pulang' },
]
function StateText({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex min-h-40 items-center justify-center gap-2 text-center text-sm text-muted-foreground'>
      {children}
    </div>
  )
}
function today() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
}
function moveDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + days)
  return dateOnlyToInput(date) ?? value
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
function statusLabel(value: string) {
  return (
    {
      PRESENT: 'Hadir',
      ABSENT: 'Alpha',
      LEAVE: 'Cuti',
      SICK: 'Sakit',
      PERMISSION: 'Izin',
      HOLIDAY: 'Libur',
    }[value] ?? value
  )
}
function employeeTypeLabel(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase()
}
function monitoringSiteLabel(value: AttendanceSiteCode) {
  return `${value.charAt(0)}${value.slice(1).toLowerCase()}`
}
function abnormalLabel(value: string) {
  return value === 'MISSING_CLOCK_IN'
    ? 'Tanpa jam masuk'
    : value === 'MISSING_CLOCK_OUT'
      ? 'Tanpa jam pulang'
      : value
}
function timeLabel(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '-'
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(
    new Date(`${value}T00:00:00`)
  )
}
function paginationSummary(page: number, pageSize: number, total: number) {
  return total
    ? `Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} dari ${total} data.`
    : 'Tidak ada data.'
}
function apiError(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
