import {
  ArrowRight,
  CalendarClock,
  FileSignature,
  UserRoundCheck,
} from 'lucide-react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  EmployeeOnboardingReadiness,
  EmployeeOnboardingReadinessItem,
  EmployeeOnboardingStage,
} from '../domain'
import { formatDate, statusLabel } from '../utils'

const stagePresentation: Record<
  EmployeeOnboardingStage,
  { label: string; nextStep: string; className: string }
> = {
  NEEDS_CONTRACT: {
    label: 'Belum ada kontrak',
    nextStep: 'Buat kontrak',
    className:
      'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300',
  },
  NEEDS_ACTIVATION: {
    label: 'Kontrak masih draft',
    nextStep: 'Aktivasi kontrak',
    className:
      'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300',
  },
  NEEDS_SHIFT: {
    label: 'Belum ada shift',
    nextStep: 'Siapkan Attendance',
    className:
      'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300',
  },
  WAITING_START: {
    label: 'Menunggu tanggal mulai',
    nextStep: 'Tidak perlu tindakan',
    className:
      'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
  },
}

export function EmployeeOnboardingBanner({
  data,
  onOpen,
}: {
  data: EmployeeOnboardingReadiness
  onOpen: () => void
}) {
  if (!data.total) return null
  const actionable = data.items.filter((item) => item.canContinue).length

  return (
    <section className='flex flex-col gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
      <div className='flex min-w-0 items-start gap-3'>
        <UserRoundCheck className='mt-0.5 size-5 shrink-0 text-primary' />
        <div>
          <p className='font-medium'>
            {data.total} karyawan belum siap digunakan
          </p>
          <p className='text-sm text-muted-foreground'>
            {actionable
              ? `${actionable} karyawan dapat dilanjutkan ke kontrak atau penugasan shift.`
              : 'Kontrak sudah dijadwalkan dan akan siap sesuai tanggal mulainya.'}
          </p>
        </div>
      </div>
      <Button type='button' size='sm' onClick={onOpen} className='shrink-0'>
        Lanjutkan onboarding <ArrowRight />
      </Button>
    </section>
  )
}

export function EmployeeOnboardingDialog({
  open,
  onOpenChange,
  data,
  onContinue,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: EmployeeOnboardingReadiness
  onContinue: (items: EmployeeOnboardingReadinessItem[]) => void
}) {
  const actionableGroups = (
    ['NEEDS_CONTRACT', 'NEEDS_ACTIVATION', 'NEEDS_SHIFT'] as const
  )
    .map((stage) => ({
      stage,
      items: data.items.filter(
        (item) => item.stage === stage && item.canContinue
      ),
    }))
    .filter((group) => group.items.length)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='grid max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl'>
        <DialogHeader className='border-b px-6 py-5'>
          <DialogTitle>Lanjutkan onboarding karyawan</DialogTitle>
          <DialogDescription>
            Sistem sudah menentukan langkah berikutnya. Pilih satu karyawan atau
            lanjutkan beberapa karyawan pada tahap yang sama.
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 overflow-y-auto px-6 py-4'>
          <div className='rounded-md border'>
            <Table>
              <TableHeader className='sticky top-0 z-10 bg-background'>
                <TableRow>
                  <TableHead>Karyawan</TableHead>
                  <TableHead className='hidden sm:table-cell'>Site</TableHead>
                  <TableHead>Kondisi</TableHead>
                  <TableHead className='hidden md:table-cell'>
                    Langkah berikutnya
                  </TableHead>
                  <TableHead className='text-right'>Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((item) => {
                  const presentation = stagePresentation[item.stage]
                  return (
                    <TableRow key={item.employeeUid}>
                      <TableCell>
                        <p className='font-medium'>{item.fullName}</p>
                        <p className='text-[11px] leading-3 text-muted-foreground'>
                          {item.employeeNumber} ·{' '}
                          {statusLabel(item.employeeType)}
                        </p>
                      </TableCell>
                      <TableCell className='hidden sm:table-cell'>
                        {statusLabel(item.site)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant='outline'
                          className={presentation.className}
                        >
                          {presentation.label}
                        </Badge>
                        {item.stage === 'WAITING_START' &&
                          item.contractStartDate && (
                            <p className='mt-1 text-[11px] text-muted-foreground'>
                              Mulai {formatDate(item.contractStartDate)}
                            </p>
                          )}
                      </TableCell>
                      <TableCell className='hidden md:table-cell'>
                        {presentation.nextStep}
                      </TableCell>
                      <TableCell className='text-right'>
                        {item.canContinue ? (
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            onClick={() => onContinue([item])}
                          >
                            Lanjutkan <ArrowRight />
                          </Button>
                        ) : (
                          <span className='text-xs text-muted-foreground'>
                            Terjadwal
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className='flex-col gap-2 border-t bg-muted/20 px-6 py-4 sm:flex-row sm:justify-between'>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
          >
            Tutup
          </Button>
          <div className='flex flex-col gap-2 sm:flex-row'>
            {actionableGroups.map((group) => (
              <Button
                type='button'
                key={group.stage}
                onClick={() => onContinue(group.items)}
              >
                {group.stage === 'NEEDS_CONTRACT' ? (
                  <FileSignature />
                ) : group.stage === 'NEEDS_SHIFT' ? (
                  <CalendarClock />
                ) : (
                  <UserRoundCheck />
                )}
                Lanjutkan {group.items.length}{' '}
                {stagePresentation[group.stage].nextStep.toLowerCase()}
              </Button>
            ))}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
