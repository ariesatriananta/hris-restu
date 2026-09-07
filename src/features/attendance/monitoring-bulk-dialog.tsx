import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { AttendanceDateTimePicker } from './attendance-date-time-picker'
import {
  useBulkCreateAttendanceClassifications,
  useBulkCreateAttendanceCorrections,
  useBulkReviewAttendanceClassifications,
  useBulkReviewAttendanceCorrections,
} from './data/queries'
import type {
  AttendanceClassificationType,
  AttendanceCorrectionInput,
  AttendanceMonitoringRecord,
  AttendanceSiteCode,
} from './domain'

export type MonitoringBulkAction =
  | 'CREATE_CORRECTION'
  | 'CREATE_CLASSIFICATION'
  | 'APPROVE_CORRECTION'
  | 'APPROVE_CLASSIFICATION'

type CorrectionDraft = {
  type: 'CLOCK_IN' | 'CLOCK_OUT' | 'BOTH'
  clockIn: string
  clockOut: string
}

type BulkResult = {
  requested: number
  succeeded: number
  failed: number
  failures: Array<{ uid: string; message: string }>
}

export function MonitoringBulkDialog({
  action,
  records,
  site,
  open,
  onOpenChange,
  onCompleted,
}: {
  action?: MonitoringBulkAction
  records: AttendanceMonitoringRecord[]
  site?: AttendanceSiteCode
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
}) {
  const createCorrections = useBulkCreateAttendanceCorrections()
  const createClassifications = useBulkCreateAttendanceClassifications()
  const approveCorrections = useBulkReviewAttendanceCorrections()
  const approveClassifications = useBulkReviewAttendanceClassifications()
  const [reason, setReason] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [classificationType, setClassificationType] =
    useState<AttendanceClassificationType>('SICK')
  const [result, setResult] = useState<BulkResult>()
  const [drafts, setDrafts] = useState<Record<string, CorrectionDraft>>(() =>
    Object.fromEntries(
      records.map((record) => [
        record.uid,
        {
          type:
            record.abnormalReasons.includes('MISSING_CLOCK_IN') &&
            record.abnormalReasons.includes('MISSING_CLOCK_OUT')
              ? 'BOTH'
              : record.abnormalReasons.includes('MISSING_CLOCK_IN')
                ? 'CLOCK_IN'
                : 'CLOCK_OUT',
          clockIn: '',
          clockOut: '',
        },
      ])
    )
  )

  const pending =
    createCorrections.isPending ||
    createClassifications.isPending ||
    approveCorrections.isPending ||
    approveClassifications.isPending
  const title = useMemo(() => bulkActionLabel(action), [action])

  const succeed = (next: BulkResult) => {
    setResult(next)
    if (next.failed)
      toast.warning(
        `${next.succeeded} berhasil, ${next.failed} gagal diproses.`
      )
    else toast.success(`${next.succeeded} data berhasil diproses.`)
    onCompleted()
  }
  const fail = (error: unknown) =>
    toast.error(apiError(error, 'Aksi massal gagal diproses.'))

  const submit = () => {
    if (!action || !site || !records.length) return
    if (action === 'CREATE_CORRECTION') {
      if (reason.trim().length < 5) {
        return toast.error('Alasan koreksi minimal 5 karakter.')
      }
      const items: AttendanceCorrectionInput[] = []
      for (const record of records) {
        const draft = drafts[record.uid]
        if (!draft)
          return toast.error(`Draft ${record.employeeName} belum siap.`)
        if (
          ((draft.type === 'CLOCK_IN' || draft.type === 'BOTH') &&
            !draft.clockIn) ||
          ((draft.type === 'CLOCK_OUT' || draft.type === 'BOTH') &&
            !draft.clockOut)
        ) {
          return toast.error(`Lengkapi jam koreksi ${record.employeeName}.`)
        }
        items.push({
          attendanceUid: record.uid,
          correctionType: draft.type,
          newClockInAt:
            draft.type === 'CLOCK_IN' || draft.type === 'BOTH'
              ? draft.clockIn
              : undefined,
          newClockOutAt:
            draft.type === 'CLOCK_OUT' || draft.type === 'BOTH'
              ? draft.clockOut
              : undefined,
          reason: reason.trim(),
        })
      }
      return createCorrections.mutate(
        { site, operationId: crypto.randomUUID(), items },
        {
          onSuccess: (response) =>
            succeed({
              requested: response.requested,
              succeeded: response.created,
              failed: response.failed,
              failures: response.failures,
            }),
          onError: fail,
        }
      )
    }
    if (action === 'CREATE_CLASSIFICATION') {
      if (reason.trim().length < 3) {
        return toast.error('Alasan klasifikasi minimal 3 karakter.')
      }
      return createClassifications.mutate(
        {
          site,
          operationId: crypto.randomUUID(),
          items: records.map((record) => ({
            employeeUid: record.employeeUid,
            startDate: record.businessDate,
            endDate: record.businessDate,
            classificationType,
            reason: reason.trim(),
          })),
        },
        {
          onSuccess: (response) =>
            succeed({
              requested: response.requested,
              succeeded: response.created,
              failed: response.failed,
              failures: response.failures,
            }),
          onError: fail,
        }
      )
    }
    const uids = Array.from(
      new Set(
        records.flatMap((record) => {
          const uid =
            action === 'APPROVE_CORRECTION'
              ? record.pendingCorrectionUid
              : record.pendingClassificationUid
          return uid ? [uid] : []
        })
      )
    )
    const mutation =
      action === 'APPROVE_CORRECTION'
        ? approveCorrections
        : approveClassifications
    mutation.mutate(
      {
        site,
        uids,
        decision: 'APPROVED',
        reviewNotes: reviewNotes.trim() || undefined,
      },
      {
        onSuccess: (response) =>
          succeed({
            requested: response.requested,
            succeeded: response.approved,
            failed: response.failed,
            failures: response.failures,
          }),
        onError: fail,
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {records.length} baris terpilih pada site {site ?? '-'}. Sistem
            tetap memvalidasi setiap baris saat diproses.
          </DialogDescription>
        </DialogHeader>

        {result && (
          <div className='grid gap-3 rounded-md border p-3 text-sm'>
            <p className='font-medium'>
              {result.succeeded} berhasil, {result.failed} gagal dari{' '}
              {result.requested} data.
            </p>
            {result.failures.length > 0 && (
              <div className='max-h-48 space-y-2 overflow-y-auto'>
                {result.failures.map((failure) => (
                  <div
                    key={failure.uid}
                    className='rounded bg-destructive/10 p-2'
                  >
                    <p className='text-xs font-medium break-all'>
                      {failure.uid}
                    </p>
                    <p className='text-xs text-destructive'>
                      {failure.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {!result && action === 'CREATE_CORRECTION' && (
          <div className='grid gap-4'>
            <div className='grid max-h-[55svh] gap-3 overflow-y-auto pr-1'>
              {records.map((record) => {
                const draft = drafts[record.uid]
                if (!draft) return null
                return (
                  <div
                    key={record.uid}
                    className='grid gap-3 rounded-md border p-3'
                  >
                    <div>
                      <p className='font-medium'>{record.employeeName}</p>
                      <p className='text-xs text-muted-foreground'>
                        {record.employeeNumber} · {record.businessDate}
                      </p>
                    </div>
                    {(draft.type === 'CLOCK_IN' || draft.type === 'BOTH') && (
                      <div className='grid gap-1'>
                        <Label>Jam masuk baru</Label>
                        <AttendanceDateTimePicker
                          value={draft.clockIn}
                          defaultDate={record.businessDate}
                          onChange={(clockIn) =>
                            setDrafts((current) => ({
                              ...current,
                              [record.uid]: { ...draft, clockIn },
                            }))
                          }
                        />
                      </div>
                    )}
                    {(draft.type === 'CLOCK_OUT' || draft.type === 'BOTH') && (
                      <div className='grid gap-1'>
                        <Label>Jam pulang baru</Label>
                        <AttendanceDateTimePicker
                          value={draft.clockOut}
                          defaultDate={record.businessDate}
                          onChange={(clockOut) =>
                            setDrafts((current) => ({
                              ...current,
                              [record.uid]: { ...draft, clockOut },
                            }))
                          }
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <ReasonField
              value={reason}
              onChange={setReason}
              label='Alasan koreksi'
            />
          </div>
        )}

        {!result && action === 'CREATE_CLASSIFICATION' && (
          <div className='grid gap-4'>
            <div className='grid gap-1'>
              <Label>Jenis klasifikasi</Label>
              <Select
                value={classificationType}
                onValueChange={(value) =>
                  setClassificationType(value as AttendanceClassificationType)
                }
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='SICK'>Sakit</SelectItem>
                  <SelectItem value='PERMISSION'>Izin</SelectItem>
                  <SelectItem value='LEAVE'>Cuti</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <ReasonField
              value={reason}
              onChange={setReason}
              label='Alasan klasifikasi'
            />
          </div>
        )}

        {!result &&
          (action === 'APPROVE_CORRECTION' ||
            action === 'APPROVE_CLASSIFICATION') && (
            <ReasonField
              value={reviewNotes}
              onChange={setReviewNotes}
              label='Catatan approval (opsional)'
            />
          )}

        <div className='flex justify-end gap-2'>
          {result ? (
            <Button onClick={() => onOpenChange(false)}>Tutup</Button>
          ) : (
            <>
              <Button
                variant='outline'
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Batal
              </Button>
              <Button
                onClick={submit}
                disabled={pending || !site || !records.length}
              >
                {pending ? 'Memproses...' : 'Proses terpilih'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ReasonField({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div className='grid gap-1'>
      <Label>{label}</Label>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function bulkActionLabel(action?: MonitoringBulkAction) {
  switch (action) {
    case 'CREATE_CORRECTION':
      return 'Ajukan koreksi massal'
    case 'CREATE_CLASSIFICATION':
      return 'Ajukan klasifikasi massal'
    case 'APPROVE_CORRECTION':
      return 'Approve koreksi massal'
    case 'APPROVE_CLASSIFICATION':
      return 'Approve klasifikasi massal'
    default:
      return 'Pilih aksi massal'
  }
}

function apiError(error: unknown, fallback: string) {
  if (!isAxiosError(error)) return fallback
  return String(error.response?.data?.message ?? fallback)
}
