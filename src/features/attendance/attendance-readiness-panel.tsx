import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  CalendarDays,
  ChevronDown,
  CircleCheck,
  ClipboardCheck,
  LoaderCircle,
  MonitorSmartphone,
  RefreshCcw,
  TriangleAlert,
  UsersRound,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { hasAnyPermission, hasPermission } from '@/features/auth/permissions'
import {
  getAttendanceAttentionDetails,
  getAttendanceAttentionLabel,
} from './attendance-readiness-utils'
import { useAttendanceReadiness } from './data/queries'
import type { AttendanceReadinessSite, AttendanceSiteCode } from './domain'

export function AttendanceReadinessPanel({
  sites,
  onOpenFinalization,
}: {
  sites?: AttendanceSiteCode[]
  onOpenFinalization?: (site: AttendanceSiteCode, businessDate?: string) => void
}) {
  const [open, setOpen] = useState(false)
  const result = useAttendanceReadiness({ site: sites })
  const session = useAuthStore((state) => state.session)
  const navigate = useNavigate()
  const canManageShift = hasPermission(session, 'attendance.manage_shift')
  const canManageDevice = hasPermission(session, 'attendance.manage_device')
  const canOpenFollowUp = hasAnyPermission(session, [
    'attendance.correct',
    'attendance.approve',
  ])
  const attentionDetails = result.data
    ? getAttendanceAttentionDetails(result.data.items)
    : []
  const attentionLabel = result.data
    ? getAttendanceAttentionLabel(
        result.data.totals.attentionCount,
        attentionDetails
      )
    : null

  return (
    <Collapsible open={open} onOpenChange={setOpen} className='mb-4'>
      <div className='rounded-xl border bg-card'>
        <div className='flex flex-wrap items-center gap-3 p-3 sm:p-4'>
          <div className='min-w-0 flex-1'>
            <div className='flex flex-wrap items-center gap-2'>
              <h2 className='font-semibold'>Kesiapan Attendance per Site</h2>
              {result.data && (
                <Badge
                  variant='outline'
                  className={
                    result.data.totals.attentionCount === 0
                      ? 'border-positive/40 bg-positive/10 text-positive'
                      : 'border-warning/50 bg-warning/10 text-warning-foreground'
                  }
                >
                  {result.data.totals.attentionCount === 0
                    ? 'Semua siap'
                    : attentionLabel}
                </Badge>
              )}
            </div>
            <p className='text-xs text-muted-foreground'>
              {result.data
                ? `Kondisi operasional per ${dateLabel(result.data.asOfDate)} · kalender ${result.data.calendarYear}`
                : 'Memeriksa shift, terminal, kalender, finalisasi, dan tindak lanjut.'}
            </p>
            {result.data && result.data.totals.attentionCount > 0 && (
              <p className='mt-1 text-xs text-warning-foreground'>
                Perlu diperiksa: {attentionDetails.join(' · ')}
              </p>
            )}
          </div>
          <CollapsibleTrigger asChild>
            <Button
              variant='ghost'
              size='sm'
              aria-label={
                open ? 'Tutup detail kesiapan' : 'Buka detail kesiapan'
              }
            >
              {open ? 'Ringkas' : 'Lihat detail'}
              <ChevronDown
                className={cn('transition-transform', open && 'rotate-180')}
              />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className='border-t p-3 sm:p-4'>
            {result.isPending ? (
              <PanelState>
                <LoaderCircle className='size-4 animate-spin' /> Memuat kesiapan
                site...
              </PanelState>
            ) : result.isError ? (
              <PanelState>
                Kesiapan gagal dimuat.
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => void result.refetch()}
                >
                  <RefreshCcw /> Coba lagi
                </Button>
              </PanelState>
            ) : !result.data?.items.length ? (
              <PanelState>Tidak ada site pada filter ini.</PanelState>
            ) : (
              <div className='grid gap-3 lg:grid-cols-3'>
                {result.data.items.map((item) => (
                  <ReadinessSiteCard
                    key={item.site}
                    item={item}
                    canManageShift={canManageShift}
                    canManageDevice={canManageDevice}
                    canOpenFollowUp={canOpenFollowUp}
                    calendarYear={result.data.calendarYear}
                    onOpenShift={() =>
                      void navigate({
                        to: '/attendance/master-shift',
                        search: { tab: 'assignment', site: [item.site] },
                      })
                    }
                    onOpenDevice={() =>
                      void navigate({
                        to: '/attendance/master-perangkat',
                        search: { site: [item.site] },
                      })
                    }
                    onOpenCalendar={() =>
                      void navigate({
                        to: '/attendance/kalender-kerja',
                        search: {
                          year: result.data.calendarYear,
                          site: [item.site],
                        },
                      })
                    }
                    onOpenFollowUp={() =>
                      void navigate({
                        to: '/attendance/tindak-lanjut',
                        search: {
                          tab:
                            item.followUp.pendingCorrectionCount === 0
                              ? 'classification'
                              : 'correction',
                          site: [item.site],
                          approvalStatus: ['PENDING'],
                        },
                      })
                    }
                    onOpenFinalization={
                      onOpenFinalization
                        ? (businessDate) =>
                            onOpenFinalization(item.site, businessDate)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function ReadinessSiteCard({
  item,
  canManageShift,
  canManageDevice,
  canOpenFollowUp,
  calendarYear,
  onOpenShift,
  onOpenDevice,
  onOpenCalendar,
  onOpenFollowUp,
  onOpenFinalization,
}: {
  item: AttendanceReadinessSite
  canManageShift: boolean
  canManageDevice: boolean
  canOpenFollowUp: boolean
  calendarYear: number
  onOpenShift: () => void
  onOpenDevice: () => void
  onOpenCalendar: () => void
  onOpenFollowUp: () => void
  onOpenFinalization?: (businessDate?: string) => void
}) {
  const ready = item.attentionCount === 0
  const attentionDetails = getAttendanceAttentionDetails([item])
  return (
    <section className='min-w-0 rounded-lg border bg-background p-3'>
      <div className='mb-3 flex items-center justify-between gap-2'>
        <div className='min-w-0'>
          <p className='truncate font-semibold'>{item.siteName}</p>
          <p className='text-xs text-muted-foreground'>{item.site}</p>
        </div>
        <Badge
          variant='outline'
          className={
            ready
              ? 'border-positive/40 bg-positive/10 text-positive'
              : 'border-warning/50 bg-warning/10 text-warning-foreground'
          }
        >
          {ready ? <CircleCheck /> : <TriangleAlert />}
          {ready
            ? 'Siap'
            : getAttendanceAttentionLabel(
                item.attentionCount,
                attentionDetails
              )}
        </Badge>
      </div>
      <div className='space-y-2 text-xs'>
        <ReadinessLine
          icon={UsersRound}
          label='Shift'
          ready={item.shift.ready}
          detail={
            item.shift.ready
              ? `${item.shift.eligibleEmployeeCount} karyawan sudah memiliki penugasan valid`
              : `${item.shift.withoutAssignmentCount} tanpa shift · ${item.shift.ambiguousAssignmentCount} tumpang tindih`
          }
        />
        <ReadinessLine
          icon={MonitorSmartphone}
          label='Terminal'
          ready={item.devices.hasReadyDevice}
          detail={`${item.devices.readyCount}/${item.devices.totalCount} perangkat siap · ${item.devices.notReadyCount} perangkat belum siap`}
        />
        <ReadinessLine
          icon={CalendarDays}
          label={`Kalender ${calendarYear}`}
          ready={item.calendar.evidenceStatus === 'CONFIGURED'}
          detail={
            item.calendar.evidenceStatus === 'CONFIGURED'
              ? `${item.calendar.nationalHolidayCount} libur nasional · ${item.calendar.collectiveLeaveSelectedCount}/${item.calendar.collectiveLeaveAvailableCount} cuti bersama dipilih`
              : 'Bukti kalender resmi belum dikonfigurasi'
          }
        />
        <ReadinessLine
          icon={ClipboardCheck}
          label='Tindak lanjut'
          ready={item.followUp.totalCount === 0}
          detail={`${item.followUp.pendingCorrectionCount} koreksi · ${item.followUp.pendingClassificationCount} klasifikasi pending`}
        />
        <ReadinessLine
          icon={RefreshCcw}
          label='Finalisasi'
          ready={item.finalization.rerunRequiredCount === 0}
          detail={
            item.finalization.rerunRequiredCount > 0 ? (
              <FinalizationReadinessDetail
                dates={item.finalization.rerunRequiredDates}
                onOpen={onOpenFinalization}
              />
            ) : (
              'Tidak ada finalisasi yang perlu diulang'
            )
          }
        />
      </div>
      {!ready && (
        <div className='mt-3 flex flex-wrap gap-1.5 border-t pt-3'>
          {!item.shift.ready && canManageShift && (
            <Button size='sm' variant='outline' onClick={onOpenShift}>
              Atur shift
            </Button>
          )}
          {!item.devices.hasReadyDevice && canManageDevice && (
            <Button size='sm' variant='outline' onClick={onOpenDevice}>
              Atur perangkat
            </Button>
          )}
          {item.calendar.evidenceStatus === 'NOT_CONFIGURED' && (
            <Button size='sm' variant='outline' onClick={onOpenCalendar}>
              Tinjau kalender
            </Button>
          )}
          {item.followUp.totalCount > 0 && canOpenFollowUp && (
            <Button size='sm' variant='outline' onClick={onOpenFollowUp}>
              Buka tindak lanjut
            </Button>
          )}
          {item.finalization.rerunRequiredCount > 0 &&
            (onOpenFinalization ? (
              <Button
                size='sm'
                variant='outline'
                onClick={() =>
                  onOpenFinalization(item.finalization.rerunRequiredDates[0])
                }
              >
                Tinjau finalisasi
              </Button>
            ) : (
              <Button size='sm' variant='outline' asChild>
                <a href='#finalisasi-attendance'>Tinjau finalisasi</a>
              </Button>
            ))}
        </div>
      )}
    </section>
  )
}

function ReadinessLine({
  icon: Icon,
  label,
  detail,
  ready,
}: {
  icon: typeof UsersRound
  label: string
  detail: React.ReactNode
  ready: boolean
}) {
  return (
    <div className='grid grid-cols-[1rem_minmax(0,1fr)] gap-2'>
      <Icon
        className={cn(
          'mt-0.5 size-4',
          ready ? 'text-positive' : 'text-warning-foreground'
        )}
        aria-hidden='true'
      />
      <div className='min-w-0'>
        <p className='font-medium'>{label}</p>
        <div className='break-words text-muted-foreground'>{detail}</div>
      </div>
    </div>
  )
}

function FinalizationReadinessDetail({
  dates,
  onOpen,
}: {
  dates: string[]
  onOpen?: (businessDate?: string) => void
}) {
  return (
    <div>
      <p>{dates.length} tanggal perlu dijalankan ulang:</p>
      <div className='mt-1 flex max-h-20 flex-wrap gap-x-2 gap-y-1 overflow-y-auto pr-1'>
        {dates.map((date) =>
          onOpen ? (
            <button
              key={date}
              type='button'
              className='rounded-sm font-medium text-foreground underline decoration-dotted underline-offset-2 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
              onClick={() => onOpen(date)}
            >
              {shortDateLabel(date)}
            </button>
          ) : (
            <span key={date} className='font-medium text-foreground'>
              {shortDateLabel(date)}
            </span>
          )
        )}
      </div>
    </div>
  )
}

function PanelState({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex min-h-24 flex-wrap items-center justify-center gap-2 text-center text-sm text-muted-foreground'>
      {children}
    </div>
  )
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(
    new Date(`${value}T00:00:00`)
  )
}

function shortDateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}
