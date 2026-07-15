import { useState } from 'react'
import {
  CalendarClock,
  CircleCheck,
  CircleOff,
  UserRoundX,
  XCircle,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableActionButton } from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import { useTransitionContract } from '../data/queries'
import type { ContractLifecycleAction, EmployeeContract } from '../domain'

type Action = Exclude<ContractLifecycleAction, 'schedule'> | 'schedule'

export function ContractLifecycleActionButtons({
  contract,
}: {
  contract: EmployeeContract
}) {
  const transition = useTransitionContract()
  const [action, setAction] = useState<Action>()
  const [reason, setReason] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [effectiveDate, setEffectiveDate] = useState(today)
  const requiresReason = action === 'terminate' || action === 'resign'
  const close = () => {
    if (!transition.isPending) {
      setAction(undefined)
      setReason('')
      setEffectiveDate(today)
    }
  }
  return (
    <>
      {contract.status === 'DRAFT' && (
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
      {contract.status === 'SCHEDULED' && contract.startDate <= today && (
        <ActionButton
          label='Aktifkan kontrak'
          icon={<CircleCheck />}
          onClick={() => setAction('activate')}
        />
      )}
      {['DRAFT', 'SCHEDULED'].includes(contract.status) && (
        <ActionButton
          label='Batalkan kontrak'
          icon={<CircleOff />}
          destructive
          onClick={() => setAction('cancel')}
        />
      )}
      {contract.status === 'ACTIVE' && (
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
      <ConfirmDialog
        open={Boolean(action)}
        onOpenChange={(open) => !open && close()}
        title='Konfirmasi lifecycle kontrak'
        desc={<p>{description(action)}</p>}
        confirmText='Lanjutkan'
        destructive={
          action === 'cancel' || action === 'terminate' || action === 'resign'
        }
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
                fromYear={new Date(contract.startDate).getFullYear()}
                toYear={new Date().getFullYear()}
                disabledDates={(date) => {
                  const value = dateToInput(date)
                  return value < contract.startDate || value > today
                }}
              />
            </label>
            <label className='grid gap-2 text-sm font-medium'>
              Alasan {action === 'resign' ? 'resign' : 'terminasi'}
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder='Wajib diisi'
              />
            </label>
          </div>
        )}
      </ConfirmDialog>
    </>
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
  return 'Kontrak akan dibatalkan tanpa mengubah status karyawan.'
}
