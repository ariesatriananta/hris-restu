import { useState } from 'react'
import { isAxiosError } from 'axios'
import { Check, LoaderCircle, RefreshCcw, X } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  useAttendanceCorrection,
  useReviewAttendanceCorrection,
} from './data/queries'
import type { AttendanceCorrection } from './domain'

export function AttendanceCorrectionReviewDialog({
  correction,
  correctionUid,
  canApprove,
  open,
  onOpenChange,
}: {
  correction?: AttendanceCorrection
  correctionUid?: string
  canApprove: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const detail = useAttendanceCorrection(correction ? undefined : correctionUid)
  const review = useReviewAttendanceCorrection()
  const [notes, setNotes] = useState('')
  const item = correction ?? detail.data

  const submit = (decision: 'APPROVED' | 'REJECTED') => {
    if (!item) return
    if (decision === 'REJECTED' && !notes.trim()) {
      toast.error('Catatan penolakan wajib diisi.')
      return
    }
    review.mutate(
      {
        uid: item.uid,
        input: { decision, reviewNotes: notes.trim() || undefined },
      },
      {
        onSuccess: () => {
          toast.success(
            decision === 'APPROVED'
              ? 'Koreksi disetujui dan diterapkan.'
              : 'Koreksi ditolak.'
          )
          onOpenChange(false)
        },
        onError: (error) =>
          toast.error(apiError(error, 'Review koreksi gagal diproses.')),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Detail Koreksi Attendance</DialogTitle>
          <DialogDescription>
            {item
              ? `${item.employeeName} · ${item.employeeNumber} · ${dateLabel(item.businessDate)}`
              : 'Periksa perubahan sebelum memberikan keputusan.'}
          </DialogDescription>
        </DialogHeader>

        {!correction && detail.isPending ? (
          <StateText>
            <LoaderCircle className='size-4 animate-spin' /> Memuat koreksi...
          </StateText>
        ) : !correction && detail.isError ? (
          <StateText>
            Detail koreksi gagal dimuat.
            <Button
              size='sm'
              variant='outline'
              onClick={() => void detail.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </StateText>
        ) : item ? (
          <>
            <div className='grid gap-3 text-sm sm:grid-cols-2'>
              <Detail
                label='Jenis'
                value={correctionTypeLabel(item.correctionType)}
              />
              <Detail
                label='Status'
                value={<ApprovalBadge value={item.approvalStatus} />}
              />
              <Detail
                label='Jam masuk lama'
                value={dateTimeLabel(item.oldClockInAt)}
              />
              <Detail
                label='Jam masuk baru'
                value={dateTimeLabel(item.newClockInAt)}
              />
              <Detail
                label='Jam pulang lama'
                value={dateTimeLabel(item.oldClockOutAt)}
              />
              <Detail
                label='Jam pulang baru'
                value={dateTimeLabel(item.newClockOutAt)}
              />
              <Detail label='Status lama' value={item.oldStatus ?? '-'} />
              <Detail label='Status baru' value={item.newStatus ?? '-'} />
            </div>
            <div className='rounded-lg border p-3 text-sm'>
              <p className='text-xs text-muted-foreground'>Alasan pengajuan</p>
              <p className='mt-1 whitespace-pre-wrap'>{item.reason}</p>
              <p className='mt-2 text-xs text-muted-foreground'>
                Diajukan {item.requestedByName} ·{' '}
                {dateTimeLabel(item.requestedAt)}
              </p>
            </div>
            {item.reviewedAt && (
              <div className='rounded-lg bg-muted p-3 text-sm'>
                <p className='font-medium'>
                  Review {item.reviewedByName ?? '-'}
                </p>
                <p className='text-xs text-muted-foreground'>
                  {dateTimeLabel(item.reviewedAt)}
                  {item.appliedAt
                    ? ` · Diterapkan ${dateTimeLabel(item.appliedAt)}`
                    : ''}
                </p>
                {item.reviewNotes && <p className='mt-2'>{item.reviewNotes}</p>}
              </div>
            )}
            {canApprove && item.approvalStatus === 'PENDING' && (
              <div className='grid gap-2'>
                <label htmlFor='review-notes' className='text-sm font-medium'>
                  Catatan review (opsional)
                </label>
                <Textarea
                  id='review-notes'
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder='Catatan approval atau alasan penolakan.'
                />
                <p className='text-xs text-muted-foreground'>
                  Persetujuan langsung diterapkan ke attendance. Jika tanggal
                  sudah final, sistem akan meminta finalisasi ulang. Pengaju
                  boleh menjadi reviewer bila memiliki izin approval.
                </p>
                <DialogFooter className='gap-2 sm:gap-0'>
                  <Button
                    variant='destructive'
                    onClick={() => submit('REJECTED')}
                    disabled={review.isPending}
                  >
                    <X /> Tolak
                  </Button>
                  <Button
                    onClick={() => submit('APPROVED')}
                    disabled={review.isPending}
                  >
                    {review.isPending ? (
                      <LoaderCircle className='animate-spin' />
                    ) : (
                      <Check />
                    )}
                    Setujui & terapkan
                  </Button>
                </DialogFooter>
              </div>
            )}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ApprovalBadge({
  value,
}: {
  value: AttendanceCorrection['approvalStatus']
}) {
  const labels = {
    PENDING: 'Menunggu',
    APPROVED: 'Disetujui',
    REJECTED: 'Ditolak',
    CANCELLED: 'Dibatalkan',
  }
  return (
    <Badge
      variant={
        value === 'APPROVED'
          ? 'default'
          : value === 'PENDING'
            ? 'secondary'
            : 'outline'
      }
    >
      {labels[value]}
    </Badge>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <div className='mt-1'>{value}</div>
    </div>
  )
}

function StateText({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex min-h-32 items-center justify-center gap-2 rounded-md border border-dashed p-6 text-sm text-muted-foreground'>
      {children}
    </div>
  )
}

function correctionTypeLabel(value: string) {
  return (
    {
      CLOCK_IN: 'Jam masuk',
      CLOCK_OUT: 'Jam pulang',
      BOTH: 'Jam masuk & pulang',
      STATUS: 'Status kehadiran',
    }[value] ?? value
  )
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function dateTimeLabel(value?: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function apiError(error: unknown, fallback: string) {
  return isAxiosError(error) &&
    typeof (error.response?.data as { message?: unknown })?.message === 'string'
    ? String((error.response?.data as { message: string }).message)
    : fallback
}
