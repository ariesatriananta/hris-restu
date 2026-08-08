import {
  CalendarRange,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  RefreshCcw,
  ScanBarcode,
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
import { useAttendanceRecordTimeline } from './data/queries'
import type { AttendanceTimelineType } from './domain'

export function AttendanceRecordTimelineSheet({
  attendanceUid,
  onOpenChange,
}: {
  attendanceUid?: string
  onOpenChange: (open: boolean) => void
}) {
  const result = useAttendanceRecordTimeline(attendanceUid)
  const attendance = result.data?.attendance

  return (
    <Sheet open={Boolean(attendanceUid)} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-lg'>
        <SheetHeader className='border-b pe-12'>
          <SheetTitle>Timeline Attendance</SheetTitle>
          <SheetDescription>
            {attendance
              ? `${attendance.employeeName} · ${attendance.employeeNumber} · ${dateLabel(attendance.businessDate)}`
              : 'Urutan scan dan perubahan yang membentuk record attendance.'}
          </SheetDescription>
        </SheetHeader>
        <div className='px-4 pb-6'>
          {result.isPending ? (
            <TimelineState>
              <LoaderCircle className='size-4 animate-spin' /> Memuat
              timeline...
            </TimelineState>
          ) : result.isError ? (
            <TimelineState>
              Timeline gagal dimuat.
              <Button
                size='sm'
                variant='outline'
                onClick={() => void result.refetch()}
              >
                <RefreshCcw /> Coba lagi
              </Button>
            </TimelineState>
          ) : !attendance ? (
            <TimelineState>Record attendance tidak ditemukan.</TimelineState>
          ) : (
            <>
              <div className='mb-5 grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-sm'>
                <Detail label='Site' value={attendance.site} />
                <Detail label='Shift' value={attendance.shiftName ?? '-'} />
                <Detail
                  label='Status attendance'
                  value={statusLabel(attendance.status)}
                />
                <Detail
                  label='Jumlah aktivitas'
                  value={`${result.data.items.length} aktivitas`}
                />
              </div>
              {!result.data.items.length ? (
                <TimelineState>
                  Belum ada aktivitas pada record ini.
                </TimelineState>
              ) : (
                <ol className='relative ms-3 border-s'>
                  {result.data.items.map((item) => {
                    const Icon = timelineIcon(item.type)
                    return (
                      <li
                        key={item.uid}
                        className='relative ps-6 pb-6 last:pb-0'
                      >
                        <span className='absolute -start-3 top-0 flex size-6 items-center justify-center rounded-full border bg-background'>
                          <Icon className='size-3.5 text-primary' />
                        </span>
                        <div className='flex flex-wrap items-start justify-between gap-2'>
                          <div className='min-w-0'>
                            <p className='font-medium'>{item.title}</p>
                            <p className='text-xs text-muted-foreground'>
                              {dateTimeLabel(item.occurredAt)}
                              {item.actorName ? ` · ${item.actorName}` : ''}
                            </p>
                          </div>
                          <Badge variant='outline'>{item.status}</Badge>
                        </div>
                        <p className='mt-2 text-sm break-words text-muted-foreground'>
                          {item.description}
                        </p>
                        <p className='mt-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase'>
                          {timelineTypeLabel(item.type)}
                        </p>
                      </li>
                    )
                  })}
                </ol>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className='min-w-0'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='truncate font-medium' title={value}>
        {value}
      </p>
    </div>
  )
}

function TimelineState({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex min-h-48 flex-wrap items-center justify-center gap-2 text-center text-sm text-muted-foreground'>
      {children}
    </div>
  )
}

function timelineIcon(type: AttendanceTimelineType) {
  return {
    SCAN: ScanBarcode,
    CORRECTION: ClipboardCheck,
    CLASSIFICATION: CalendarRange,
    FINALIZATION: CheckCircle2,
  }[type]
}

function timelineTypeLabel(type: AttendanceTimelineType) {
  return {
    SCAN: 'Scan',
    CORRECTION: 'Koreksi',
    CLASSIFICATION: 'Klasifikasi',
    FINALIZATION: 'Finalisasi',
  }[type]
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

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(
    new Date(`${value}T00:00:00`)
  )
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
}
