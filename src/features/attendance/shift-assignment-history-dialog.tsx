import { useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  LoaderCircle,
  RefreshCcw,
} from 'lucide-react'
import { toast } from 'sonner'
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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DatePicker } from '@/components/date-picker'
import {
  useApplyHistoricalShiftAssignment,
  usePreviewHistoricalShiftAssignment,
} from './data/queries'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'
import type {
  HistoricalShiftAssignmentInput,
  HistoricalShiftAssignmentPreview,
  Shift,
  ShiftAssignment,
} from './domain'

const weekdays = [
  { value: 1, label: 'Sen' },
  { value: 2, label: 'Sel' },
  { value: 3, label: 'Rab' },
  { value: 4, label: 'Kam' },
  { value: 5, label: 'Jum' },
  { value: 6, label: 'Sab' },
  { value: 7, label: 'Min' },
]

export function ShiftAssignmentHistoryDialog({
  assignment,
  shifts,
  goLiveDate,
  open,
  onOpenChange,
}: {
  assignment: ShiftAssignment
  shifts: Shift[]
  goLiveDate: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const today = todayJakarta()
  const [shiftUid, setShiftUid] = useState(assignment.shiftUid)
  const [effectiveFrom, setEffectiveFrom] = useState(
    assignment.effectiveFrom < goLiveDate
      ? goLiveDate
      : assignment.effectiveFrom
  )
  const [effectiveTo, setEffectiveTo] = useState(
    assignment.effectiveTo && assignment.effectiveTo < today
      ? assignment.effectiveTo
      : today
  )
  const [workDays, setWorkDays] = useState([...assignment.workDays])
  const [reason, setReason] = useState('')
  const [previewedSignature, setPreviewedSignature] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const preview = usePreviewHistoricalShiftAssignment()
  const apply = useApplyHistoricalShiftAssignment()
  const input: HistoricalShiftAssignmentInput = {
    employeeUid: assignment.employeeUid,
    shiftUid,
    effectiveFrom,
    effectiveTo,
    workDays: [...workDays].sort((a, b) => a - b),
  }
  const signature = JSON.stringify(input)
  const previewIsCurrent =
    previewedSignature === signature && Boolean(preview.data)
  const validRange =
    effectiveFrom >= goLiveDate &&
    effectiveFrom <= effectiveTo &&
    effectiveTo <= today
  const canPreview = Boolean(shiftUid && workDays.length && validRange)
  const canApply =
    previewIsCurrent &&
    preview.data?.canApply === true &&
    reason.trim().length >= 10 &&
    reason.trim().length <= 500
  const availableShifts = shifts.filter(
    (shift) => shift.site === assignment.site && shift.isActive
  )

  const runPreview = () => {
    if (!canPreview) return
    preview.mutate(input, {
      onSuccess: () => setPreviewedSignature(signature),
      onError: (error) =>
        toast.error(apiMessage(error, 'Pratinjau koreksi gagal dimuat.')),
    })
  }

  const submit = () => {
    if (!canApply) return
    apply.mutate(
      { ...input, reason: reason.trim() },
      {
        onSuccess: (result) => {
          toast.success(
            `Koreksi penugasan diterapkan. ${result.reconciledAttendanceCount} attendance direkonsiliasi dan ${result.invalidatedFinalizationCount} finalisasi ditandai untuk dijalankan ulang.`
          )
          setConfirmOpen(false)
          onOpenChange(false)
        },
        onError: (error) => {
          setConfirmOpen(false)
          toast.error(apiMessage(error, 'Koreksi penugasan gagal diterapkan.'))
        },
      }
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='max-h-[92vh] overflow-y-auto sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle>Koreksi Penugasan Shift</DialogTitle>
            <DialogDescription>
              {assignment.employeeName} · {assignment.employeeNumber}. Koreksi
              langsung diterapkan setelah pratinjau; tidak ada tahap approval.
            </DialogDescription>
          </DialogHeader>

          <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
            <p className='font-medium'>Penugasan yang dipilih</p>
            <p className='text-muted-foreground'>
              {assignment.shiftName} · {dateLabel(assignment.effectiveFrom)}–
              {assignment.effectiveTo
                ? dateLabel(assignment.effectiveTo)
                : 'seterusnya'}
            </p>
          </div>

          <div className='grid gap-4 sm:grid-cols-3'>
            <div className='grid gap-1.5 text-sm'>
              <Label>Shift pengganti</Label>
              <Select value={shiftUid} onValueChange={setShiftUid}>
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableShifts.map((shift) => (
                    <SelectItem key={shift.uid} value={shift.uid}>
                      {shift.name} ({shift.startTime.slice(0, 5)}–
                      {shift.endTime.slice(0, 5)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-1.5 text-sm'>
              <Label>Dari tanggal</Label>
              <DatePicker
                selected={dateOnlyFromInput(effectiveFrom)}
                onSelect={(date) => {
                  const next = dateOnlyToInput(date)
                  if (!next) return
                  setEffectiveFrom(next)
                  if (effectiveTo < next) setEffectiveTo(next)
                }}
                disabledDates={(date) => outsideRange(date, goLiveDate, today)}
              />
            </div>
            <div className='grid gap-1.5 text-sm'>
              <Label>Sampai tanggal</Label>
              <DatePicker
                selected={dateOnlyFromInput(effectiveTo)}
                onSelect={(date) => {
                  const next = dateOnlyToInput(date)
                  if (next) setEffectiveTo(next)
                }}
                disabledDates={(date) =>
                  outsideRange(date, effectiveFrom, today)
                }
              />
            </div>
          </div>

          <div className='grid gap-1.5 text-sm'>
            <Label>Hari kerja pada rentang koreksi</Label>
            <div className='flex flex-wrap gap-2'>
              {weekdays.map((day) => (
                <Button
                  key={day.value}
                  type='button'
                  size='sm'
                  variant={workDays.includes(day.value) ? 'default' : 'outline'}
                  aria-pressed={workDays.includes(day.value)}
                  onClick={() =>
                    setWorkDays((current) =>
                      current.includes(day.value)
                        ? current.filter((value) => value !== day.value)
                        : [...current, day.value]
                    )
                  }
                >
                  {day.label}
                </Button>
              ))}
            </div>
          </div>

          {!validRange && (
            <p role='alert' className='text-sm text-destructive'>
              Rentang koreksi harus berada antara {dateLabel(goLiveDate)} dan{' '}
              {dateLabel(today)}.
            </p>
          )}

          <Button
            type='button'
            variant='outline'
            className='w-full'
            disabled={!canPreview || preview.isPending}
            onClick={runPreview}
          >
            {preview.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <RefreshCcw />
            )}
            {previewIsCurrent ? 'Muat ulang pratinjau' : 'Pratinjau dampak'}
          </Button>

          {previewIsCurrent && preview.data && (
            <HistoryPreview data={preview.data} />
          )}

          <div className='grid gap-1.5 text-sm'>
            <Label htmlFor='historical-assignment-reason'>Alasan koreksi</Label>
            <Textarea
              id='historical-assignment-reason'
              value={reason}
              maxLength={500}
              placeholder='Jelaskan alasan koreksi, minimal 10 karakter.'
              onChange={(event) => setReason(event.target.value)}
            />
            <p className='text-xs text-muted-foreground'>
              {reason.trim().length}/500 karakter · wajib untuk audit trail.
            </p>
            {reason.length > 0 && reason.trim().length < 10 && (
              <p className='text-xs text-destructive'>
                Alasan minimal 10 karakter.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant='outline'
              disabled={apply.isPending}
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button
              disabled={!canApply || apply.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              Terapkan koreksi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title='Terapkan koreksi penugasan?'
        desc={`Timeline shift ${assignment.employeeName} pada ${dateLabel(effectiveFrom)}–${dateLabel(effectiveTo)} akan disusun ulang. Attendance terkait direkonsiliasi dan finalisasi terdampak harus dijalankan ulang.`}
        confirmText='Ya, terapkan koreksi'
        isLoading={apply.isPending}
        handleConfirm={submit}
      />
    </>
  )
}

function HistoryPreview({ data }: { data: HistoricalShiftAssignmentPreview }) {
  return (
    <section className='space-y-3 rounded-lg border p-3' aria-live='polite'>
      <div className='flex items-center justify-between gap-2'>
        <div>
          <h3 className='font-semibold'>Pratinjau dampak</h3>
          <p className='text-xs text-muted-foreground'>
            Periksa timeline dan dampaknya sebelum diterapkan.
          </p>
        </div>
        <Badge variant={data.canApply ? 'default' : 'destructive'}>
          {data.canApply ? (
            <CheckCircle2 className='size-3' />
          ) : (
            <AlertTriangle className='size-3' />
          )}
          {data.canApply ? 'Dapat diterapkan' : 'Diblokir'}
        </Badge>
      </div>

      {data.blockers.length > 0 && (
        <MessageList title='Pemblokir' items={data.blockers} destructive />
      )}
      {data.warnings.length > 0 && (
        <MessageList title='Perhatian' items={data.warnings} />
      )}

      <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
        {Object.entries(data.impact).map(([key, value]) => (
          <div key={key} className='rounded-md bg-muted/60 px-3 py-2'>
            <p className='text-lg font-semibold tabular-nums'>{value}</p>
            <p className='text-[11px] text-muted-foreground'>
              {impactLabel(key)}
            </p>
          </div>
        ))}
      </div>

      <div>
        <p className='mb-2 flex items-center gap-1.5 text-sm font-medium'>
          <CalendarRange className='size-4' /> Timeline setelah koreksi
        </p>
        <div className='space-y-1.5'>
          {data.timeline.map((item, index) => (
            <div
              key={`${item.shiftUid}:${item.effectiveFrom}:${index}`}
              className='flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-sm'
            >
              <div>
                <p className='font-medium'>{item.shiftName}</p>
                <p className='text-xs text-muted-foreground'>
                  {dateLabel(item.effectiveFrom)}–
                  {item.effectiveTo
                    ? dateLabel(item.effectiveTo)
                    : 'seterusnya'}
                  {' · '}
                  {workDaysLabel(item.workDays)}
                </p>
              </div>
              <Badge variant={changeVariant(item.change)}>
                {changeLabel(item.change)}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function MessageList({
  title,
  items,
  destructive = false,
}: {
  title: string
  items: string[]
  destructive?: boolean
}) {
  return (
    <div
      className={`rounded-md border p-2.5 text-xs ${destructive ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-warning/40 bg-warning/10 text-warning-foreground'}`}
    >
      <p className='font-medium'>{title}</p>
      <ul className='mt-1 list-disc space-y-1 pl-4'>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function outsideRange(date: Date, minimum: string, maximum: string) {
  const min = dateOnlyFromInput(minimum)
  const max = dateOnlyFromInput(maximum)
  return Boolean((min && date < min) || (max && date > max))
}

function dateLabel(value: string) {
  const date = dateOnlyFromInput(value)
  return date
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date)
    : value
}

function workDaysLabel(days: number[]) {
  return weekdays
    .filter((day) => days.includes(day.value))
    .map((day) => day.label)
    .join(', ')
}

function changeLabel(
  value: HistoricalShiftAssignmentPreview['timeline'][number]['change']
) {
  return {
    UNCHANGED: 'Tetap',
    TRUNCATED: 'Disesuaikan',
    SPLIT: 'Dipecah',
    REPLACEMENT: 'Pengganti',
  }[value]
}

function changeVariant(
  value: HistoricalShiftAssignmentPreview['timeline'][number]['change']
): 'default' | 'secondary' | 'outline' {
  if (value === 'REPLACEMENT') return 'default'
  if (value === 'UNCHANGED') return 'outline'
  return 'secondary'
}

function impactLabel(value: string) {
  return (
    {
      affectedAssignmentCount: 'Penugasan terdampak',
      attendanceRecordCount: 'Attendance terdampak',
      rawScanCount: 'Scan mentah terkait',
      approvedClassificationCount: 'Klasifikasi disetujui',
      approvedCorrectionCount: 'Koreksi disetujui',
      postedProductionCount: 'Produksi sudah diposting',
      lockedPayrollPeriodCount: 'Periode payroll terkunci',
      runningFinalizationCount: 'Finalisasi sedang berjalan',
      finalizationToInvalidateCount: 'Finalisasi perlu diulang',
    }[value] ?? value
  )
}

function todayJakarta() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data.message ?? fallback)
    : fallback
}
