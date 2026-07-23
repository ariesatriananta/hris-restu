import { useState } from 'react'
import {
  CalendarClock,
  CircleCheck,
  CircleOff,
  UserRoundX,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableActionButton } from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import { useScheduleStatusChange, useTransitionContract } from '../data/queries'
import type { ContractLifecycleAction, EmployeeContract } from '../domain'

type Action = Exclude<ContractLifecycleAction, 'schedule'> | 'schedule'

export function ContractLifecycleActionButtons({
  contract,
  onlyScheduled = false,
  compact = false,
  showLabels = false,
}: {
  contract: EmployeeContract
  onlyScheduled?: boolean
  compact?: boolean
  showLabels?: boolean
}) {
  const transition = useTransitionContract()
  const statusSchedule = useScheduleStatusChange()
  const [action, setAction] = useState<Action>()
  const [reason, setReason] = useState('')
  const today = businessToday()
  const [effectiveDate, setEffectiveDate] = useState(today)
  const [scheduledAction, setScheduledAction] = useState<
    'TERMINATE' | 'RESIGN'
  >()
  const [scheduledReason, setScheduledReason] = useState('')
  const [scheduledDate, setScheduledDate] = useState(tomorrow())
  const requiresReason = isReasonRequired(action)
  const isExpiredStatusClosure = isExpiredClosure(action)
  const minimumEffectiveDate = isExpiredStatusClosure
    ? contract.endDate
    : contract.startDate
  const canSchedule =
    (contract.status === 'ACTIVE' &&
      Boolean(contract.isLatestForEmployee) &&
      contract.employeeStatus === 'ACTIVE') ||
    (contract.status === 'EXPIRED' &&
      Boolean(contract.isLatestForEmployee) &&
      contract.employeeStatus === 'ACTIVE')
  const canCloseExpired =
    contract.status === 'EXPIRED' &&
    Boolean(contract.isLatestForEmployee) &&
    contract.employeeStatus === 'ACTIVE'
  const close = () => {
    if (!transition.isPending) {
      setAction(undefined)
      setReason('')
      setEffectiveDate(today)
    }
  }
  return (
    <>
      {compact && (contract.status === 'ACTIVE' || canCloseExpired) && (
        <StatusActionMenu
          canTerminateNow={!onlyScheduled && contract.status === 'ACTIVE'}
          canCloseExpired={!onlyScheduled && canCloseExpired}
          canSchedule={canSchedule}
          onTerminate={() => setAction('terminate')}
          onResign={() => setAction('resign')}
          onCloseExpiredTerminate={() => setAction('close_expired_terminate')}
          onCloseExpiredResign={() => setAction('close_expired_resign')}
          onScheduleTerminate={() => setScheduledAction('TERMINATE')}
          onScheduleResign={() => setScheduledAction('RESIGN')}
        />
      )}
      {!compact && !onlyScheduled && contract.status === 'DRAFT' && (
        <ActionButton
          label={
            contract.startDate > today
              ? 'Jadwalkan kontrak'
              : 'Aktifkan kontrak'
          }
          icon={
            contract.startDate > today ? <CalendarClock /> : <CircleCheck />
          }
          onClick={() =>
            setAction(contract.startDate > today ? 'schedule' : 'activate')
          }
        />
      )}
      {!compact &&
        !onlyScheduled &&
        contract.status === 'SCHEDULED' &&
        contract.startDate <= today && (
          <ActionButton
            label='Aktifkan kontrak'
            icon={<CircleCheck />}
            onClick={() => setAction('activate')}
          />
        )}
      {!compact &&
        !onlyScheduled &&
        ['DRAFT', 'SCHEDULED'].includes(contract.status) && (
          <ActionButton
            label='Batalkan kontrak'
            icon={<CircleOff />}
            destructive
            onClick={() => setAction('cancel')}
          />
        )}
      {!compact && !onlyScheduled && contract.status === 'ACTIVE' && (
        <>
          <ActionButton
            label='Terminasi kontrak'
            icon={<XCircle />}
            destructive
            onClick={() => setAction('terminate')}
          />
          <ActionButton
            label='Catat resign'
            icon={<UserRoundX />}
            destructive
            onClick={() => setAction('resign')}
          />
        </>
      )}
      {!compact && canSchedule && (
        <>
          {showLabels ? (
            <>
              <Button
                size='sm'
                variant='outline'
                onClick={() => setScheduledAction('TERMINATE')}
              >
                <CalendarClock /> Jadwalkan terminasi
              </Button>
              <Button
                size='sm'
                variant='outline'
                onClick={() => setScheduledAction('RESIGN')}
              >
                <CalendarClock /> Jadwalkan resign
              </Button>
            </>
          ) : (
            <>
              <ActionButton
                label='Jadwalkan terminasi karyawan'
                icon={<CalendarClock />}
                destructive
                onClick={() => setScheduledAction('TERMINATE')}
              />
              <ActionButton
                label='Jadwalkan resign karyawan'
                icon={<CalendarClock />}
                destructive
                onClick={() => setScheduledAction('RESIGN')}
              />
            </>
          )}
        </>
      )}
      {!compact && !onlyScheduled && canCloseExpired && (
        <>
          <ActionButton
            label='Terminasi karyawan setelah kontrak berakhir'
            icon={<XCircle />}
            destructive
            onClick={() => setAction('close_expired_terminate')}
          />
          <ActionButton
            label='Catat resign setelah kontrak berakhir'
            icon={<UserRoundX />}
            destructive
            onClick={() => setAction('close_expired_resign')}
          />
        </>
      )}
      <ConfirmDialog
        open={Boolean(action)}
        onOpenChange={(open) => !open && close()}
        title={
          isExpiredStatusClosure
            ? 'Konfirmasi perubahan status karyawan'
            : 'Konfirmasi lifecycle kontrak'
        }
        desc={<p>{description(action)}</p>}
        confirmText='Lanjutkan'
        destructive={action === 'cancel' || requiresReason}
        disabled={requiresReason && !reason.trim()}
        isLoading={transition.isPending}
        handleConfirm={() => {
          if (action) {
            transition.mutate(
              {
                uid: contract.uid,
                action,
                input: requiresReason
                  ? { reason: reason.trim(), effectiveDate }
                  : {},
              },
              { onSuccess: close }
            )
          }
        }}
      >
        {requiresReason && (
          <div className='grid gap-4'>
            <label className='grid gap-2 text-sm font-medium'>
              Tanggal efektif
              <DatePicker
                selected={dateFromInput(effectiveDate)}
                onSelect={(date) => date && setEffectiveDate(dateToInput(date))}
                fromYear={new Date(
                  minimumEffectiveDate ?? contract.startDate
                ).getFullYear()}
                toYear={new Date().getFullYear()}
                disabledDates={(date) => {
                  const value = dateToInput(date)
                  return (
                    value < (minimumEffectiveDate ?? contract.startDate) ||
                    value > today
                  )
                }}
              />
            </label>
            <label className='grid gap-2 text-sm font-medium'>
              Alasan {isResignAction(action) ? 'resign' : 'terminasi'}
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder='Wajib diisi'
              />
            </label>
          </div>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(scheduledAction)}
        onOpenChange={(open) => {
          if (!open && !statusSchedule.isPending) {
            setScheduledAction(undefined)
            setScheduledReason('')
            setScheduledDate(tomorrow())
          }
        }}
        title='Jadwalkan perubahan status kerja'
        desc={
          <p>
            Kontrak aktif akan dihentikan bila masih ada pada tanggal efektif.
            Kontrak Expired tetap Expired.
          </p>
        }
        confirmText='Jadwalkan'
        destructive
        disabled={!scheduledAction || !scheduledReason.trim()}
        isLoading={statusSchedule.isPending}
        handleConfirm={() => {
          if (!scheduledAction) return
          statusSchedule.mutate(
            {
              contractUid: contract.uid,
              input: {
                action: scheduledAction,
                effectiveDate: scheduledDate,
                reason: scheduledReason.trim(),
              },
            },
            {
              onSuccess: () => {
                setScheduledAction(undefined)
                setScheduledReason('')
                setScheduledDate(tomorrow())
              },
            }
          )
        }}
      >
        <div className='grid gap-4'>
          <label className='grid gap-2 text-sm font-medium'>
            Tanggal efektif
            <DatePicker
              selected={dateFromInput(scheduledDate)}
              onSelect={(date) => date && setScheduledDate(dateToInput(date))}
              fromYear={new Date().getFullYear()}
              toYear={new Date().getFullYear() + 10}
              disabledDates={(date) => dateToInput(date) <= today}
            />
          </label>
          <label className='grid gap-2 text-sm font-medium'>
            Alasan {scheduledAction === 'RESIGN' ? 'resign' : 'terminasi'}
            <Textarea
              value={scheduledReason}
              onChange={(event) => setScheduledReason(event.target.value)}
              placeholder='Wajib diisi'
            />
          </label>
        </div>
      </ConfirmDialog>
    </>
  )
}

function StatusActionMenu({
  canTerminateNow,
  canCloseExpired,
  canSchedule,
  onTerminate,
  onResign,
  onCloseExpiredTerminate,
  onCloseExpiredResign,
  onScheduleTerminate,
  onScheduleResign,
}: {
  canTerminateNow: boolean
  canCloseExpired: boolean
  canSchedule: boolean
  onTerminate: () => void
  onResign: () => void
  onCloseExpiredTerminate: () => void
  onCloseExpiredResign: () => void
  onScheduleTerminate: () => void
  onScheduleResign: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <DataTableActionButton label='Terminasi atau resign karyawan'>
          <UserRoundX />
        </DataTableActionButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='min-w-52'>
        <DropdownMenuLabel>Terminasi / resign</DropdownMenuLabel>
        {canTerminateNow && (
          <>
            <DropdownMenuItem onClick={onTerminate}>
              <XCircle className='text-destructive' /> Terminasi sekarang
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onResign}>
              <UserRoundX className='text-destructive' /> Catat resign sekarang
            </DropdownMenuItem>
          </>
        )}
        {canCloseExpired && (
          <>
            <DropdownMenuItem onClick={onCloseExpiredTerminate}>
              <XCircle className='text-destructive' /> Terminasi karyawan
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCloseExpiredResign}>
              <UserRoundX className='text-destructive' /> Catat resign karyawan
            </DropdownMenuItem>
          </>
        )}
        {canSchedule && (canTerminateNow || canCloseExpired) && (
          <DropdownMenuSeparator />
        )}
        {canSchedule && (
          <>
            <DropdownMenuItem onClick={onScheduleTerminate}>
              <CalendarClock /> Jadwalkan terminasi
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onScheduleResign}>
              <CalendarClock /> Jadwalkan resign
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function dateFromInput(value: string) {
  return new Date(`${value}T00:00:00`)
}

function dateToInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
function tomorrow() {
  const date = dateFromInput(businessToday())
  date.setDate(date.getDate() + 1)
  return dateToInput(date)
}

function businessToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

function ActionButton({
  label,
  icon,
  destructive = false,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  destructive?: boolean
  onClick: () => void
}) {
  return (
    <DataTableActionButton
      className={
        destructive ? 'text-destructive hover:text-destructive' : undefined
      }
      label={label}
      onClick={onClick}
    >
      {icon}
    </DataTableActionButton>
  )
}

function description(action?: Action) {
  if (action === 'schedule')
    return 'Kontrak akan dijadwalkan sesuai tanggal mulai.'
  if (action === 'activate')
    return 'Kontrak akan diaktifkan dan status karyawan menjadi Aktif.'
  if (action === 'terminate')
    return 'Kontrak akan diterminasi dan status karyawan menjadi Nonaktif.'
  if (action === 'resign')
    return 'Kontrak akan diterminasi dan status karyawan menjadi Resign.'
  if (action === 'close_expired_terminate')
    return 'Kontrak tetap Expired. Status karyawan akan diubah menjadi Nonaktif.'
  if (action === 'close_expired_resign')
    return 'Kontrak tetap Expired. Status karyawan akan diubah menjadi Resign.'
  return 'Kontrak akan dibatalkan tanpa mengubah status karyawan.'
}

function isExpiredClosure(action?: Action) {
  return (
    action === 'close_expired_terminate' || action === 'close_expired_resign'
  )
}

function isReasonRequired(action?: Action) {
  return (
    action === 'terminate' || action === 'resign' || isExpiredClosure(action)
  )
}

function isResignAction(action?: Action) {
  return action === 'resign' || action === 'close_expired_resign'
}
