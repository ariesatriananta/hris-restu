import { useState, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import {
  BriefcaseBusiness,
  CalendarClock,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { DataTableActionButton } from '@/components/data-table'
import {
  useAttendanceFoundation,
  useDeleteShiftAssignment,
  useShiftAssignments,
  useShifts,
} from '@/features/attendance/data/queries'
import type { ShiftAssignment } from '@/features/attendance/domain'
import { ShiftAssignmentHistoryDialog } from '@/features/attendance/shift-assignment-history-dialog'
import { ShiftAssignmentDialog } from '@/features/attendance/shift-dialogs'
import { hasPermission } from '@/features/auth/permissions'
import {
  useProductionAssignments,
  useProductionJobs,
} from '@/features/production/data/queries'
import type { ProductionAssignment } from '@/features/production/domain'
import {
  AssignmentCorrectionDialog,
  AssignmentDialog,
  CloseAssignmentDialog,
  DeleteAssignmentDialog,
} from '@/features/production/production-rate-pages'
import type { Employee } from '../domain'
import { formatDate } from '../utils'

export function EmployeeShiftAssignments({ employee }: { employee: Employee }) {
  const session = useAuthStore((state) => state.session)
  const canManage = hasPermission(session, 'attendance.manage_shift')
  const assignments = useShiftAssignments({
    query: employee.employeeNumber,
    page: 1,
    pageSize: 500,
  })
  const shifts = useShifts({ page: 1, pageSize: 500 })
  const foundation = useAttendanceFoundation()
  const [assignOpen, setAssignOpen] = useState(false)
  const [correctionTarget, setCorrectionTarget] = useState<ShiftAssignment>()
  const [deleteTarget, setDeleteTarget] = useState<ShiftAssignment>()
  const rows = (assignments.data?.items ?? []).filter(
    (item) => item.employeeUid === employee.uid
  )
  const siteOptions =
    foundation.data?.sites.map((site) => ({
      value: site.code as ShiftAssignment['site'],
      label: site.name,
    })) ?? []

  return (
    <>
      <AssignmentCard
        title='Penugasan Shift'
        description='Histori Shift, jam kerja, dan hari kerja karyawan.'
        action={
          canManage ? (
            <Button size='sm' onClick={() => setAssignOpen(true)}>
              <Plus /> Atur / Ganti Shift
            </Button>
          ) : undefined
        }
      >
        {assignments.isPending ? (
          <AssignmentSkeleton />
        ) : assignments.isError ? (
          <AssignmentRetry onRetry={() => assignments.refetch()} />
        ) : rows.length ? (
          <div className='space-y-3'>
            {rows.map((assignment) => (
              <div
                key={assignment.uid}
                className='flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between'
              >
                <div className='min-w-0 space-y-1'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <p className='font-medium'>{assignment.shiftName}</p>
                    <AssignmentStatusBadge status={assignment.status} />
                  </div>
                  <p className='text-sm text-muted-foreground'>
                    {assignment.shiftCode} · {shortTime(assignment.startTime)}–
                    {shortTime(assignment.endTime)}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {formatDate(assignment.effectiveFrom)} —{' '}
                    {assignment.effectiveTo
                      ? formatDate(assignment.effectiveTo)
                      : 'Seterusnya'}{' '}
                    · {workDaysLabel(assignment.workDays)}
                  </p>
                </div>
                {canManage && (
                  <div className='flex shrink-0 items-center justify-end gap-1'>
                    {assignment.status !== 'UPCOMING' && (
                      <DataTableActionButton
                        label={`Koreksi penugasan Shift ${assignment.shiftName}`}
                        onClick={() => setCorrectionTarget(assignment)}
                      >
                        <Pencil />
                      </DataTableActionButton>
                    )}
                    <DataTableActionButton
                      label={`Hapus penugasan Shift ${assignment.shiftName}`}
                      className='text-destructive hover:text-destructive'
                      onClick={() => setDeleteTarget(assignment)}
                    >
                      <Trash2 />
                    </DataTableActionButton>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <AssignmentEmpty
            icon={<CalendarClock className='size-8 opacity-50' />}
            text='Belum ada histori penugasan Shift.'
          />
        )}
      </AssignmentCard>

      {assignOpen && (
        <ShiftAssignmentDialog
          open
          onOpenChange={setAssignOpen}
          backdateGoLiveDate={foundation.data?.configuration.goLiveDate}
          shifts={shifts.data?.items ?? []}
          siteOptions={siteOptions}
          productionModules={foundation.data?.lookups.productionModules ?? []}
          productionSections={foundation.data?.lookups.productionSections ?? []}
          initialEmployeeUids={[employee.uid]}
        />
      )}
      {correctionTarget && (
        <ShiftAssignmentHistoryDialog
          key={correctionTarget.uid}
          assignment={correctionTarget}
          shifts={shifts.data?.items ?? []}
          goLiveDate={
            foundation.data?.configuration.goLiveDate ?? todayJakarta()
          }
          open
          onOpenChange={(open) => !open && setCorrectionTarget(undefined)}
        />
      )}
      <DeleteShiftAssignmentDialog
        assignment={deleteTarget}
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
      />
    </>
  )
}

export function EmployeeProductionAssignments({
  employee,
}: {
  employee: Employee
}) {
  const session = useAuthStore((state) => state.session)
  const canManage = hasPermission(session, 'production.manage_master')
  const assignments = useProductionAssignments({
    query: employee.employeeNumber,
    page: 1,
    pageSize: 500,
  })
  const jobs = useProductionJobs({ pageSize: 500, isActive: undefined })
  const [assignOpen, setAssignOpen] = useState(false)
  const rows = (assignments.data?.items ?? []).filter(
    (item) => item.employee.uid === employee.uid
  )

  return (
    <>
      <AssignmentCard
        title='Penugasan Pekerjaan'
        description='Histori pekerjaan Produksi utama dan tambahan karyawan.'
        action={
          canManage ? (
            <Button size='sm' onClick={() => setAssignOpen(true)}>
              <Plus /> Atur Pekerjaan
            </Button>
          ) : undefined
        }
      >
        {assignments.isPending ? (
          <AssignmentSkeleton />
        ) : assignments.isError ? (
          <AssignmentRetry onRetry={() => assignments.refetch()} />
        ) : rows.length ? (
          <div className='space-y-3'>
            {rows.map((assignment) => (
              <ProductionAssignmentRow
                key={assignment.uid}
                assignment={assignment}
                jobs={jobs.data?.items ?? []}
                canManage={canManage}
              />
            ))}
          </div>
        ) : (
          <AssignmentEmpty
            icon={<BriefcaseBusiness className='size-8 opacity-50' />}
            text='Belum ada histori penugasan pekerjaan Produksi.'
          />
        )}
      </AssignmentCard>
      {assignOpen && (
        <AssignmentDialog
          jobs={(jobs.data?.items ?? []).filter((job) => job.isActive)}
          open
          onOpenChange={setAssignOpen}
          preset={{
            employeeUid: employee.uid,
            employeeNumber: employee.employeeNumber,
            fullName: employee.fullName,
            site: employee.site,
            effectiveFrom: todayJakarta(),
          }}
        />
      )}
    </>
  )
}

function ProductionAssignmentRow({
  assignment,
  jobs,
  canManage,
}: {
  assignment: ProductionAssignment
  jobs: Parameters<typeof AssignmentCorrectionDialog>[0]['jobs']
  canManage: boolean
}) {
  return (
    <div className='flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between'>
      <div className='min-w-0 space-y-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <p className='font-medium'>{assignment.job.name}</p>
          {assignment.isPrimary && <Badge variant='outline'>Utama</Badge>}
          <ProductionStatusBadge status={assignment.status} />
        </div>
        <p className='text-sm text-muted-foreground'>
          {assignment.job.code} · Site {titleCase(assignment.site)}
        </p>
        <p className='text-xs text-muted-foreground'>
          {formatDate(assignment.effectiveFrom)} —{' '}
          {assignment.effectiveTo
            ? formatDate(assignment.effectiveTo)
            : 'Seterusnya'}
        </p>
      </div>
      {canManage && (
        <div className='flex shrink-0 flex-wrap items-center justify-end gap-1'>
          {assignment.status !== 'CANCELLED' && (
            <AssignmentCorrectionDialog assignment={assignment} jobs={jobs} />
          )}
          {assignment.status !== 'ENDED' &&
            assignment.status !== 'CANCELLED' && (
              <CloseAssignmentDialog
                assignment={{
                  uid: assignment.uid,
                  effectiveFrom: assignment.effectiveFrom,
                  employeeName: assignment.employee.fullName,
                }}
              />
            )}
          <DeleteAssignmentDialog assignment={assignment} />
        </div>
      )}
    </div>
  )
}

function DeleteShiftAssignmentDialog({
  assignment,
  open,
  onOpenChange,
}: {
  assignment?: ShiftAssignment
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const remove = useDeleteShiftAssignment()
  const ready =
    reason.trim().length >= 10 && confirmation.trim().toUpperCase() === 'HAPUS'

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) {
          setReason('')
          setConfirmation('')
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hapus Penugasan Shift?</DialogTitle>
          <DialogDescription>
            Penugasan Shift {assignment?.shiftName ?? ''} akan dihapus permanen.
            Data yang sudah dipakai Attendance tetap dilindungi oleh sistem.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-2'>
          <label className='text-sm font-medium' htmlFor='shift-delete-reason'>
            Alasan penghapusan
          </label>
          <Textarea
            id='shift-delete-reason'
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder='Jelaskan alasan penugasan ini dihapus.'
          />
        </div>
        <div className='space-y-2'>
          <label
            className='text-sm font-medium'
            htmlFor='shift-delete-confirmation'
          >
            Ketik HAPUS untuk konfirmasi
          </label>
          <Input
            id='shift-delete-confirmation'
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder='HAPUS'
          />
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            variant='destructive'
            disabled={!ready || remove.isPending}
            onClick={() => {
              if (!assignment) return
              remove.mutate(
                {
                  uid: assignment.uid,
                  reason: reason.trim(),
                  confirmation: 'HAPUS',
                },
                {
                  onSuccess: () => {
                    toast.success('Penugasan Shift berhasil dihapus.')
                    onOpenChange(false)
                  },
                  onError: (error) =>
                    toast.error(
                      apiMessage(error, 'Penugasan Shift gagal dihapus.')
                    ),
                }
              )
            }}
          >
            Hapus Penugasan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AssignmentCard({
  title,
  description,
  action,
  children,
}: {
  title: string
  description: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
          <div>
            <CardTitle>{title}</CardTitle>
            <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function AssignmentSkeleton() {
  return (
    <div className='space-y-3'>
      {[1, 2, 3].map((item) => (
        <Skeleton key={item} className='h-20 w-full' />
      ))}
    </div>
  )
}

function AssignmentRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className='py-6 text-sm'>
      <p>Data penugasan gagal dimuat.</p>
      <Button variant='outline' size='sm' className='mt-3' onClick={onRetry}>
        <RefreshCcw /> Coba lagi
      </Button>
    </div>
  )
}

function AssignmentEmpty({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className='flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground'>
      {icon}
      <p>{text}</p>
    </div>
  )
}

function AssignmentStatusBadge({
  status,
}: {
  status: ShiftAssignment['status']
}) {
  const labels = {
    CURRENT: 'Aktif',
    UPCOMING: 'Akan datang',
    ENDED: 'Berakhir',
  }
  return (
    <Badge variant={status === 'CURRENT' ? 'default' : 'secondary'}>
      {labels[status]}
    </Badge>
  )
}

function ProductionStatusBadge({
  status,
}: {
  status: ProductionAssignment['status']
}) {
  const labels = {
    ACTIVE: 'Aktif',
    UPCOMING: 'Akan datang',
    ENDED: 'Berakhir',
    CANCELLED: 'Dibatalkan',
  }
  return (
    <Badge variant={status === 'ACTIVE' ? 'default' : 'secondary'}>
      {labels[status]}
    </Badge>
  )
}

function workDaysLabel(days: number[]) {
  const labels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((day) => labels[day] ?? String(day))
    .join(', ')
}

function shortTime(value: string) {
  return value.slice(0, 5)
}

function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase()
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
