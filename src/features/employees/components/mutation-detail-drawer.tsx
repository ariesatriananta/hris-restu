import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { EmploymentHistory } from '../domain'
import { formatDate, statusLabel } from '../utils'

type MutationDetailDrawerProps = {
  history?: EmploymentHistory
  open: boolean
  onOpenChange: (open: boolean) => void
  employee?: {
    uid: string
    fullName: string
    employeeNumber: string
  }
}

export function MutationDetailDrawer({
  history,
  open,
  onOpenChange,
  employee,
}: MutationDetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full sm:max-w-lg'>
        <SheetHeader className='pe-12'>
          <SheetTitle>Detail mutasi</SheetTitle>
          <SheetDescription>
            Rincian penempatan dan perubahan status yang tercatat.
          </SheetDescription>
        </SheetHeader>
        {history && (
          <div className='min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-4'>
            {employee && (
              <section className='rounded-md border bg-muted/30 p-3'>
                <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
                  Karyawan
                </p>
                <p className='mt-1 font-semibold'>{employee.fullName}</p>
                <p className='text-sm text-muted-foreground'>
                  {employee.employeeNumber}
                </p>
                <Button
                  variant='link'
                  size='sm'
                  className='mt-1 h-auto px-0'
                  asChild
                >
                  <Link
                    to='/karyawan/data-karyawan/$employeeUid'
                    params={{ employeeUid: employee.uid }}
                    onClick={() => onOpenChange(false)}
                  >
                    Buka detail karyawan <ExternalLink />
                  </Link>
                </Button>
              </section>
            )}

            <DetailSection title='Perubahan'>
              <DetailRow label='Jenis perubahan'>
                <Badge variant='secondary'>
                  {statusLabel(history.changeType)}
                </Badge>
              </DetailRow>
              <DetailRow label='Tanggal efektif'>
                {formatDate(history.effectiveFrom)}
              </DetailRow>
              <DetailRow label='Berlaku sampai'>
                {formatDate(history.effectiveTo)}
              </DetailRow>
            </DetailSection>

            <DetailSection title='Penempatan setelah mutasi'>
              <DetailRow label='Site'>{statusLabel(history.site)}</DetailRow>
              <DetailRow label='Departemen'>{history.department}</DetailRow>
              <DetailRow label='Jabatan'>{history.position}</DetailRow>
              <DetailRow label='Modul produksi'>
                {history.employeeType === 'BORONGAN'
                  ? history.productionModule
                  : undefined}
              </DetailRow>
              <DetailRow label='Bagian produksi'>
                {history.employeeType === 'BORONGAN'
                  ? history.productionSection
                  : undefined}
              </DetailRow>
              <DetailRow label='Jenis karyawan'>
                {statusLabel(history.employeeType)}
              </DetailRow>
              <DetailRow label='Status karyawan'>
                {statusLabel(history.employeeStatus)}
              </DetailRow>
            </DetailSection>

            <DetailSection title='Administrasi'>
              <DetailRow label='Nomor referensi'>
                {history.referenceNumber}
              </DetailRow>
              <DetailRow label='Alasan'>{history.reason}</DetailRow>
              <DetailRow label='Catatan' multiline>
                {history.notes}
              </DetailRow>
            </DetailSection>
          </div>
        )}
      </SheetContent>
    </Sheet>
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
      className={multiline ? 'space-y-1' : 'grid grid-cols-[145px_1fr] gap-3'}
    >
      <dt className='text-sm text-muted-foreground'>{label}</dt>
      <dd className='text-sm font-medium whitespace-pre-wrap'>
        {children || '—'}
      </dd>
    </div>
  )
}
