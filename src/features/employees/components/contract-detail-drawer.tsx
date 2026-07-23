import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { Download, ExternalLink, FileText, ImageIcon } from 'lucide-react'
import { currentListReturnTo } from '@/lib/list-return-to'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DatePicker } from '@/components/date-picker'
import { useTransitionContract } from '../data/queries'
import type { EmployeeContract } from '../domain'
import { formatDate, statusLabel } from '../utils'
import { ContractLifecycleActionButtons } from './contract-lifecycle-action-buttons'

type ContractDetailDrawerProps = {
  contract?: EmployeeContract
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: {
    uid: string
    fullName: string
    employeeNumber?: string
  }
}

export function ContractDetailDrawer({
  contract,
  open,
  onOpenChange,
  employee,
}: ContractDetailDrawerProps) {
  const returnTo = currentListReturnTo()
  const transition = useTransitionContract()
  const [action, setAction] = useState<
    | 'schedule'
    | 'activate'
    | 'terminate'
    | 'resign'
    | 'cancel'
    | 'close_expired_terminate'
    | 'close_expired_resign'
  >()
  const [reason, setReason] = useState('')
  const today = new Date().toISOString().slice(0, 10)
  const [effectiveDate, setEffectiveDate] = useState(today)
  const requiresReason = isReasonRequired(action)
  const isExpiredStatusClosure = isExpiredClosure(action)
  const minimumEffectiveDate = isExpiredStatusClosure
    ? contract?.endDate
    : contract?.startDate
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full sm:max-w-lg'>
        <SheetHeader className='pe-12'>
          <SheetTitle>Detail kontrak</SheetTitle>
          <SheetDescription>
            Rincian kontrak kerja dan lampiran yang diterbitkan.
          </SheetDescription>
        </SheetHeader>
        {contract && (
          <div className='min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4'>
            {employee && (
              <section className='rounded-md border bg-muted/30 p-3'>
                <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
                  Karyawan
                </p>
                <p className='mt-1 font-semibold'>{employee.fullName}</p>
                {employee.employeeNumber && (
                  <p className='text-sm text-muted-foreground'>
                    {employee.employeeNumber}
                  </p>
                )}
                <Button
                  variant='link'
                  size='sm'
                  className='mt-1 h-auto px-0'
                  asChild
                >
                  <Link
                    to='/karyawan/data-karyawan/$employeeUid'
                    params={{ employeeUid: employee.uid }}
                    search={{ returnTo }}
                    onClick={() => onOpenChange(false)}
                  >
                    Buka detail karyawan <ExternalLink />
                  </Link>
                </Button>
              </section>
            )}

            <DetailSection title='Kontrak'>
              {contract.isLegacyTypeMismatch && (
                <div className='mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
                  Kontrak legacy tidak sesuai dengan jenis karyawan saat ini.
                  Data lama tetap dapat dibaca, tetapi tidak dapat diproses
                  lifecycle sebelum diperbaiki HR.
                </div>
              )}
              <DetailRow label='Nomor kontrak'>
                {contract.contractNumber}
              </DetailRow>
              <DetailRow label='Jenis kontrak'>
                {contract.contractType}
              </DetailRow>
              <DetailRow label='Status'>
                <Badge variant='secondary'>
                  {statusLabel(contract.status)}
                </Badge>
              </DetailRow>
              <DetailRow label='Urutan kontrak'>
                {contract.sequenceNumber}
              </DetailRow>
            </DetailSection>
            {['DRAFT', 'SCHEDULED'].includes(contract.status) && (
              <section className='space-y-2 border-t pt-4'>
                <h3 className='text-sm font-semibold'>Aksi lifecycle</h3>
                <div className='flex flex-wrap gap-2'>
                  {contract.status === 'DRAFT' && (
                    <Button
                      size='sm'
                      onClick={() =>
                        setAction(
                          contract.startDate >
                            new Date().toISOString().slice(0, 10)
                            ? 'schedule'
                            : 'activate'
                        )
                      }
                    >
                      {contract.startDate >
                      new Date().toISOString().slice(0, 10)
                        ? 'Jadwalkan'
                        : 'Aktifkan'}
                    </Button>
                  )}
                  {contract.status === 'SCHEDULED' &&
                    contract.startDate <=
                      new Date().toISOString().slice(0, 10) && (
                      <Button size='sm' onClick={() => setAction('activate')}>
                        Aktifkan
                      </Button>
                    )}
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setAction('cancel')}
                  >
                    Batalkan
                  </Button>
                </div>
              </section>
            )}
            {contract.status === 'ACTIVE' && (
              <section className='space-y-2 border-t pt-4'>
                <h3 className='text-sm font-semibold'>Aksi lifecycle</h3>
                <p className='text-sm text-muted-foreground'>
                  Status kerja karyawan hanya diubah melalui aksi kontrak.
                </p>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => setAction('terminate')}
                  >
                    Terminasi
                  </Button>
                  <Button
                    size='sm'
                    variant='destructive'
                    onClick={() => setAction('resign')}
                  >
                    Catat resign
                  </Button>
                  <ContractLifecycleActionButtons
                    contract={contract}
                    onlyScheduled
                    showLabels
                  />
                </div>
              </section>
            )}
            {contract.status === 'EXPIRED' &&
              contract.isLatestForEmployee &&
              contract.employeeStatus === 'ACTIVE' && (
                <section className='space-y-2 border-t pt-4'>
                  <h3 className='text-sm font-semibold'>Status karyawan</h3>
                  <p className='text-sm text-muted-foreground'>
                    Kontrak tetap Expired; pilih status akhir karyawan.
                  </p>
                  <div className='flex flex-wrap gap-2'>
                    <Button
                      size='sm'
                      variant='outline'
                      onClick={() => setAction('close_expired_terminate')}
                    >
                      Terminasi karyawan
                    </Button>
                    <Button
                      size='sm'
                      variant='destructive'
                      onClick={() => setAction('close_expired_resign')}
                    >
                      Catat resign
                    </Button>
                    <ContractLifecycleActionButtons
                      contract={contract}
                      onlyScheduled
                      showLabels
                    />
                  </div>
                </section>
              )}

            <DetailSection title='Masa berlaku'>
              <DetailRow label='Tanggal mulai'>
                {formatDate(contract.startDate)}
              </DetailRow>
              <DetailRow label='Tanggal berakhir'>
                {formatDate(contract.endDate)}
              </DetailRow>
              <DetailRow label='Tanggal ditandatangani'>
                {formatDate(contract.signedDate)}
              </DetailRow>
            </DetailSection>

            <DetailSection title='Snapshot penempatan'>
              <DetailRow label='Site'>{contract.siteNameSnapshot}</DetailRow>
              <DetailRow label='Jabatan'>
                {contract.positionNameSnapshot}
              </DetailRow>
              <DetailRow label='Gaji atau tarif' multiline>
                {contract.salaryOrRateNotes}
              </DetailRow>
              <DetailRow label='Catatan' multiline>
                {contract.notes}
              </DetailRow>
            </DetailSection>

            <DetailSection title='Lampiran kontrak'>
              {contract.issuedFile?.url ? (
                <div className='rounded-md border p-3'>
                  <p className='mb-3 text-sm font-medium'>
                    {contract.issuedFile.originalName}
                  </p>
                  <AttachmentPreview
                    url={contract.issuedFile.url}
                    mimeType={contract.issuedFile.mimeType}
                    originalName={contract.issuedFile.originalName}
                  />
                  <div className='flex flex-wrap gap-2'>
                    <Button size='sm' variant='outline' asChild>
                      <a
                        href={contract.issuedFile.url}
                        target='_blank'
                        rel='noreferrer'
                      >
                        <ExternalLink /> Buka file
                      </a>
                    </Button>
                    <Button size='sm' variant='outline' asChild>
                      <a href={contract.issuedFile.url} download>
                        <Download /> Download
                      </a>
                    </Button>
                  </div>
                </div>
              ) : (
                <p className='text-sm text-muted-foreground'>
                  Belum ada lampiran PKWT.
                </p>
              )}
            </DetailSection>
          </div>
        )}
      </SheetContent>
      <ConfirmDialog
        open={Boolean(action)}
        onOpenChange={(open) => {
          if (!open && !transition.isPending) {
            setAction(undefined)
            setReason('')
            setEffectiveDate(today)
          }
        }}
        title={
          isExpiredStatusClosure
            ? 'Konfirmasi perubahan status karyawan'
            : 'Konfirmasi lifecycle kontrak'
        }
        desc={
          <p>
            {!contract?.issuedFile && 'Lampiran belum tersedia. '}
            {lifecycleDescription(action)}
          </p>
        }
        confirmText='Lanjutkan'
        destructive={action === 'cancel' || requiresReason}
        disabled={requiresReason && !reason.trim()}
        isLoading={transition.isPending}
        handleConfirm={() => {
          if (contract && action) {
            transition.mutate(
              {
                uid: contract.uid,
                action,
                input: requiresReason
                  ? { reason: reason.trim(), effectiveDate }
                  : {},
              },
              {
                onSuccess: () => {
                  setAction(undefined)
                  setReason('')
                  setEffectiveDate(today)
                },
              }
            )
          }
        }}
      >
        {requiresReason ? (
          <div className='grid gap-4'>
            <label className='grid gap-2 text-sm font-medium'>
              Tanggal efektif
              <DatePicker
                selected={dateFromInput(effectiveDate)}
                onSelect={(date) => date && setEffectiveDate(dateToInput(date))}
                fromYear={new Date(minimumEffectiveDate ?? today).getFullYear()}
                toYear={new Date().getFullYear()}
                disabledDates={(date) => {
                  const value = dateToInput(date)
                  return (
                    value < (minimumEffectiveDate ?? today) || value > today
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
        ) : null}
      </ConfirmDialog>
    </Sheet>
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

function lifecycleDescription(
  action?:
    | 'schedule'
    | 'activate'
    | 'terminate'
    | 'resign'
    | 'cancel'
    | 'close_expired_terminate'
    | 'close_expired_resign'
) {
  if (action === 'schedule') return 'Kontrak akan dijadwalkan.'
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
  return 'Kontrak akan dibatalkan.'
}

function isExpiredClosure(
  action?: 'close_expired_terminate' | 'close_expired_resign' | string
) {
  return (
    action === 'close_expired_terminate' || action === 'close_expired_resign'
  )
}

function isReasonRequired(
  action?:
    | 'terminate'
    | 'resign'
    | 'close_expired_terminate'
    | 'close_expired_resign'
    | string
) {
  return (
    action === 'terminate' || action === 'resign' || isExpiredClosure(action)
  )
}

function isResignAction(action?: 'resign' | 'close_expired_resign' | string) {
  return action === 'resign' || action === 'close_expired_resign'
}

function AttachmentPreview({
  url,
  mimeType,
  originalName,
}: {
  url: string
  mimeType: string
  originalName: string
}) {
  if (mimeType.startsWith('image/')) {
    return (
      <div className='mb-3 overflow-hidden rounded-md border bg-muted'>
        <img
          src={url}
          alt={`Pratinjau ${originalName}`}
          className='max-h-80 w-full object-contain'
        />
      </div>
    )
  }

  if (mimeType === 'application/pdf') {
    return (
      <div className='mb-3 overflow-hidden rounded-md border bg-muted'>
        <iframe
          title={`Pratinjau ${originalName}`}
          src={url}
          className='h-80 w-full bg-background'
        />
      </div>
    )
  }

  return (
    <div className='mb-3 flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground'>
      {mimeType.startsWith('image/') ? <ImageIcon /> : <FileText />}
      Pratinjau tidak tersedia untuk tipe file ini.
    </div>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <h3 className='mb-3 text-sm font-semibold'>{title}</h3>
      <dl className='space-y-3'>{children}</dl>
    </section>
  )
}

function DetailRow({
  label,
  children,
  multiline = false,
}: {
  label: string
  children?: ReactNode
  multiline?: boolean
}) {
  return (
    <div
      className={multiline ? 'space-y-1' : 'grid grid-cols-[170px_1fr] gap-3'}
    >
      <dt className='text-sm text-muted-foreground'>{label}</dt>
      <dd className='text-sm font-medium whitespace-pre-wrap'>
        {children || '—'}
      </dd>
    </div>
  )
}
