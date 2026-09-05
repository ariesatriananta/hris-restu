import {
  AlertTriangle,
  CalendarOff,
  LoaderCircle,
  RefreshCcw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAttendanceRecapDays } from './data/queries'
import type {
  AttendanceEmployeeType,
  AttendanceRecapDay,
  AttendanceRecapStatus,
  AttendanceSiteCode,
} from './domain'
import { durationLabel, recapStatusLabel } from './recap-columns'

export function AttendanceRecapDetailSheet({
  employeeUid,
  site,
  employeeType,
  dateFrom,
  dateTo,
  attendanceStatus,
  productionSection,
  onOpenChange,
}: {
  employeeUid?: string
  site?: AttendanceSiteCode
  employeeType?: AttendanceEmployeeType
  dateFrom: string
  dateTo: string
  attendanceStatus?: AttendanceRecapStatus[]
  productionSection?: string[]
  onOpenChange: (open: boolean) => void
}) {
  const result = useAttendanceRecapDays(employeeUid, {
    dateFrom,
    dateTo,
    site,
    employeeType,
    productionSection,
    attendanceStatus,
    page: 1,
    pageSize: 50,
  })
  const first = result.data?.items[0]

  return (
    <Sheet open={Boolean(employeeUid)} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-4xl'>
        <SheetHeader className='border-b pe-12'>
          <SheetTitle>Rincian Attendance Harian</SheetTitle>
          <SheetDescription>
            {first
              ? `${first.employeeName} · ${first.employeeNumber} · ${first.siteName}`
              : 'Rincian kehadiran dan hari libur mingguan.'}
          </SheetDescription>
        </SheetHeader>
        <div className='px-4 pb-6'>
          <div className='mb-3 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground'>
            Hari libur mingguan tanpa scan ditampilkan otomatis agar rekap tetap
            lengkap. Data ini hanya tampil di rekap dan bukan catatan kehadiran
            yang tersimpan. Jika ada scan pada hari libur, statusnya tetap
            tampil sebagai{' '}
            <strong className='text-foreground'>Hadir Hari Libur</strong>.
          </div>
          {result.isPending ? (
            <StateText>
              <LoaderCircle className='size-4 animate-spin' /> Memuat rincian...
            </StateText>
          ) : result.isError ? (
            <StateText>
              Rincian gagal dimuat.
              <Button
                size='sm'
                variant='outline'
                onClick={() => void result.refetch()}
              >
                <RefreshCcw /> Coba lagi
              </Button>
            </StateText>
          ) : !result.data?.items.length ? (
            <StateText>
              Tidak ada rincian pada periode dan filter ini.
            </StateText>
          ) : (
            <>
              <div className='hidden overflow-x-auto rounded-md border md:block'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Masuk / Pulang</TableHead>
                      <TableHead>Keterlambatan</TableHead>
                      <TableHead>Keterangan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.data.items.map((item) => (
                      <TableRow
                        key={`${item.businessDate}:${item.site}:${item.employeeType}`}
                      >
                        <TableCell>
                          <p className='font-medium'>
                            {dateLabel(item.businessDate)}
                          </p>
                          <p className='text-xs text-muted-foreground'>
                            {item.dayName}
                          </p>
                        </TableCell>
                        <TableCell>
                          <DailyStatus item={item} />
                        </TableCell>
                        <TableCell>
                          <p>{item.shiftName ?? '-'}</p>
                          {item.shiftStartTime && (
                            <p className='text-xs text-muted-foreground'>
                              {shortTime(item.shiftStartTime)}–
                              {shortTime(item.shiftEndTime)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className='whitespace-nowrap'>
                          {timeLabel(item.clockInAt)} /{' '}
                          {timeLabel(item.clockOutAt)}
                        </TableCell>
                        <TableCell>
                          <p>
                            {item.lateMinutes
                              ? `Terlambat ${durationLabel(item.lateMinutes)}`
                              : '-'}
                          </p>
                          {item.earlyLeaveMinutes > 0 && (
                            <p className='text-xs text-muted-foreground'>
                              Pulang awal{' '}
                              {durationLabel(item.earlyLeaveMinutes)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className='max-w-56'>
                          <DailyNotes item={item} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className='grid gap-3 md:hidden'>
                {result.data.items.map((item) => (
                  <article
                    key={`${item.businessDate}:${item.site}:${item.employeeType}`}
                    className='space-y-3 rounded-lg border p-3'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <p className='font-medium'>
                          {dateLabel(item.businessDate)}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {item.dayName} · {item.shiftName ?? 'Tanpa shift'}
                        </p>
                      </div>
                      <DailyStatus item={item} />
                    </div>
                    <div className='grid grid-cols-2 gap-2 text-sm'>
                      <Detail label='Masuk' value={timeLabel(item.clockInAt)} />
                      <Detail
                        label='Pulang'
                        value={timeLabel(item.clockOutAt)}
                      />
                      <Detail
                        label='Terlambat'
                        value={durationLabel(item.lateMinutes)}
                      />
                      <Detail
                        label='Durasi'
                        value={durationLabel(item.workedMinutes)}
                      />
                    </div>
                    <DailyNotes item={item} />
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function DailyStatus({ item }: { item: AttendanceRecapDay }) {
  const holidayPresence =
    item.status === 'PRESENT' && item.calendarDayType !== 'WORKDAY'
  const label = holidayPresence
    ? 'Hadir Hari Libur'
    : recapStatusLabel(item.status)
  return (
    <div className='flex flex-wrap gap-1'>
      <Badge
        variant={
          item.status === 'ABSENT'
            ? 'destructive'
            : item.status === 'WEEKLY_OFF'
              ? 'secondary'
              : 'outline'
        }
        className={
          holidayPresence
            ? 'border-positive/50 bg-positive/10 text-positive'
            : undefined
        }
      >
        {item.status === 'WEEKLY_OFF' && <CalendarOff className='size-3' />}
        {label}
      </Badge>
      {item.virtual && <Badge variant='outline'>Hanya di rekap</Badge>}
      {item.isCorrected && <Badge variant='outline'>Dikoreksi</Badge>}
      {item.qualityStatus === 'ABNORMAL' && (
        <Badge
          variant='outline'
          className='border-warning/60 bg-warning/10 text-amber-800 dark:text-amber-300'
        >
          <AlertTriangle className='size-3' /> Abnormal
        </Badge>
      )}
    </div>
  )
}

function DailyNotes({ item }: { item: AttendanceRecapDay }) {
  const calendar =
    item.calendarName || calendarReasonLabel(item.calendarReasonType)
  const placement = [
    item.department,
    item.productionModule,
    item.productionSection,
    item.workGroup,
  ].filter(Boolean)
  return (
    <div className='space-y-1 text-xs text-muted-foreground'>
      {calendar && <p>{calendar}</p>}
      {placement.length > 0 && <p>{placement.join(' · ')}</p>}
      {item.notes && <p className='text-foreground'>{item.notes}</p>}
      {item.abnormalReasons.length > 0 && (
        <p>{item.abnormalReasons.map(abnormalReasonLabel).join(', ')}</p>
      )}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-md bg-muted/50 p-2'>
      <p className='text-[10px] text-muted-foreground'>{label}</p>
      <p className='font-medium'>{value}</p>
    </div>
  )
}

function StateText({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex min-h-48 flex-wrap items-center justify-center gap-2 text-center text-sm text-muted-foreground'>
      {children}
    </div>
  )
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`)
  )
}

function timeLabel(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(value))
    : '-'
}

function shortTime(value?: string | null) {
  return value ? value.slice(0, 5) : '-'
}

function calendarReasonLabel(value: string) {
  return (
    {
      WEEKLY_OFF: 'Libur mingguan',
      NATIONAL_HOLIDAY: 'Hari libur nasional',
      COLLECTIVE_LEAVE: 'Cuti bersama',
      SITE_HOLIDAY: 'Libur site',
      WORKDAY_OVERRIDE: 'Hari kerja pengganti',
      SHIFT_WEEKDAY: 'Hari kerja shift',
    }[value] ?? value
  )
}

function abnormalReasonLabel(value: string) {
  return (
    {
      MISSING_CLOCK_IN: 'Tanpa jam masuk',
      MISSING_CLOCK_OUT: 'Tanpa jam pulang',
    }[value] ?? value
  )
}
