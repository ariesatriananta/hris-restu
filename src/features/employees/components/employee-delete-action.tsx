import { useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  CheckCircle2,
  EllipsisVertical,
  LoaderCircle,
  RefreshCcw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  useDeleteEmployeePermanently,
  useEmployeeDeletionPreview,
} from '../data/queries'
import type { Employee } from '../domain'

export function EmployeeDeleteAction({
  employee,
  returnTo,
}: {
  employee: Employee
  returnTo: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            type='button'
            variant='outline'
            size='icon'
            aria-label='Aksi lainnya'
          >
            <EllipsisVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='min-w-56'>
          <DropdownMenuItem
            variant='destructive'
            onSelect={() => setOpen(true)}
          >
            <Trash2 /> Hapus permanen data karyawan
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EmployeeDeleteDialog
        employee={employee}
        returnTo={returnTo}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

function EmployeeDeleteDialog({
  employee,
  returnTo,
  open,
  onOpenChange,
}: {
  employee: Employee
  returnTo: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const preview = useEmployeeDeletionPreview(employee.uid, open)
  const deletion = useDeleteEmployeePermanently()
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')

  const handleOpenChange = (next: boolean) => {
    if (deletion.isPending) return
    if (!next) {
      setReason('')
      setConfirmation('')
    }
    onOpenChange(next)
  }

  const expectedConfirmation = employee.employeeNumber
  const valid =
    preview.data?.canDelete === true &&
    reason.trim().length >= 5 &&
    confirmation.trim() === expectedConfirmation
  const affectedDependencies =
    preview.data?.dependencies.filter((dependency) => dependency.count > 0) ??
    []

  const submit = () => {
    if (!valid) return
    deletion.mutate(
      {
        employeeUid: employee.uid,
        confirmation: confirmation.trim(),
        reason: reason.trim(),
      },
      {
        onSuccess: (result) => {
          toast.success(
            `Data ${result.employeeNumber} berhasil dihapus permanen.`
          )
          window.location.assign(returnTo)
        },
        onError: (error) =>
          toast.error(
            apiMessage(error, 'Data karyawan gagal dihapus permanen.')
          ),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className='grid max-h-[calc(100svh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl'
        showCloseButton={!deletion.isPending}
      >
        <DialogHeader className='border-b px-6 py-5'>
          <DialogTitle>Hapus permanen data karyawan?</DialogTitle>
          <DialogDescription>
            Khusus data salah input atau data uji. Aksi ini bukan pengganti
            proses resign maupun penonaktifan karyawan.
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 space-y-4 overflow-y-auto px-6 py-5'>
          <div className='rounded-lg border bg-muted/30 px-4 py-3'>
            <p className='font-semibold'>{employee.fullName}</p>
            <p className='text-sm text-muted-foreground'>
              {employee.employeeNumber} · Site {employee.site}
            </p>
          </div>

          {preview.isPending ? (
            <div className='flex min-h-32 items-center justify-center gap-2 text-sm text-muted-foreground'>
              <LoaderCircle className='size-4 animate-spin' /> Memeriksa seluruh
              relasi karyawan...
            </div>
          ) : preview.isError ? (
            <Alert variant='destructive'>
              <AlertTriangle />
              <AlertTitle>Pemeriksaan gagal</AlertTitle>
              <AlertDescription className='space-y-3'>
                <p>
                  {apiMessage(
                    preview.error,
                    'Kesiapan penghapusan belum dapat diperiksa.'
                  )}
                </p>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => void preview.refetch()}
                >
                  <RefreshCcw /> Coba lagi
                </Button>
              </AlertDescription>
            </Alert>
          ) : preview.data ? (
            <>
              {preview.data.canDelete ? (
                <Alert className='border-emerald-500/40 bg-emerald-500/5 text-emerald-950 dark:text-emerald-100'>
                  <CheckCircle2 className='text-emerald-600' />
                  <AlertTitle>Siap dihapus</AlertTitle>
                  <AlertDescription>
                    Tidak ditemukan Attendance, setoran Produksi, atau data
                    Payroll yang menghalangi penghapusan.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant='destructive'>
                  <AlertTriangle />
                  <AlertTitle>Data tidak dapat dihapus</AlertTitle>
                  <AlertDescription>
                    <ul className='list-disc space-y-1 pl-4'>
                      {preview.data.blockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              <section className='space-y-2'>
                <div className='flex items-center justify-between gap-3'>
                  <h3 className='text-sm font-semibold'>Dampak penghapusan</h3>
                  <Badge variant='outline'>
                    {preview.data.totalAffectedRecords} data terkait
                  </Badge>
                </div>
                <div className='divide-y rounded-lg border'>
                  {affectedDependencies.length ? (
                    affectedDependencies.map((dependency) => (
                      <div
                        key={dependency.key}
                        className='flex items-center justify-between gap-3 px-3 py-2 text-sm'
                      >
                        <span>{dependency.label}</span>
                        <div className='flex items-center gap-2'>
                          <Badge
                            variant={
                              dependency.action === 'UNLINK'
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {dependency.action === 'UNLINK'
                              ? 'Relasi dilepas'
                              : 'Dihapus'}
                          </Badge>
                          <span className='min-w-8 text-right font-medium tabular-nums'>
                            {dependency.count}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className='px-3 py-4 text-sm text-muted-foreground'>
                      Tidak ada data administratif tambahan.
                    </p>
                  )}
                </div>
              </section>

              {preview.data.canDelete && (
                <div className='space-y-4 border-t pt-4'>
                  <div className='space-y-1.5'>
                    <Label htmlFor='employee-delete-reason'>
                      Alasan penghapusan
                    </Label>
                    <Textarea
                      id='employee-delete-reason'
                      value={reason}
                      maxLength={500}
                      placeholder='Contoh: Data karyawan salah input dan belum pernah digunakan.'
                      disabled={deletion.isPending}
                      onChange={(event) => setReason(event.target.value)}
                    />
                    <p className='text-xs text-muted-foreground'>
                      Minimal 5 karakter dan akan disimpan pada Audit Trail.
                    </p>
                  </div>
                  <div className='space-y-1.5'>
                    <Label htmlFor='employee-delete-confirmation'>
                      Ketik {expectedConfirmation} untuk konfirmasi
                    </Label>
                    <Input
                      id='employee-delete-confirmation'
                      value={confirmation}
                      autoComplete='off'
                      disabled={deletion.isPending}
                      onChange={(event) => setConfirmation(event.target.value)}
                    />
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        <DialogFooter className='border-t bg-muted/20 px-6 py-4'>
          <Button
            type='button'
            variant='outline'
            disabled={deletion.isPending}
            onClick={() => handleOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type='button'
            variant='destructive'
            disabled={!valid || deletion.isPending}
            onClick={submit}
          >
            {deletion.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <Trash2 />
            )}
            Hapus permanen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function apiMessage(error: unknown, fallback: string) {
  if (!isAxiosError(error)) return fallback
  const message = error.response?.data?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}
