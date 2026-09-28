import { useState } from 'react'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useDeleteEmploymentMutation } from '../data/queries'
import type { EmploymentHistory } from '../domain'

export function MutationDeleteDialog({
  history,
  employeeName,
  open,
  onOpenChange,
}: {
  history?: EmploymentHistory
  employeeName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const command = useDeleteEmploymentMutation()
  const close = () => {
    setReason('')
    setConfirmation('')
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (command.isPending) return
        if (next) onOpenChange(true)
        else close()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hapus Mutasi?</DialogTitle>
          <DialogDescription>
            Mutasi terakhir {employeeName ?? 'karyawan'} akan dihapus dan
            kondisi penempatan sebelumnya dipulihkan. Data operasional yang
            sudah bergantung pada mutasi tetap dilindungi sistem.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-2'>
          <label className='text-sm font-medium'>Alasan penghapusan</label>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder='Jelaskan alasan mutasi ini perlu dihapus.'
          />
          <p className='text-xs text-muted-foreground'>Minimal 10 karakter.</p>
        </div>
        <div className='space-y-2'>
          <label className='text-sm font-medium'>
            Ketik HAPUS untuk konfirmasi
          </label>
          <Input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder='HAPUS'
          />
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            disabled={command.isPending}
            onClick={close}
          >
            Batal
          </Button>
          <Button
            variant='destructive'
            disabled={
              !history ||
              reason.trim().length < 10 ||
              confirmation.trim().toUpperCase() !== 'HAPUS' ||
              command.isPending
            }
            onClick={() => {
              if (!history) return
              command.mutate(
                { historyUid: history.uid, reason: reason.trim() },
                {
                  onSuccess: (result) => {
                    const restored =
                      result.restoredShiftAssignments +
                      result.restoredJobAssignments
                    toast.success(
                      restored > 0
                        ? `Mutasi dihapus dan ${restored} penugasan sebelumnya dipulihkan.`
                        : 'Mutasi berhasil dihapus dan kondisi sebelumnya dipulihkan.'
                    )
                    close()
                  },
                  onError: (error) =>
                    toast.error(
                      apiMessage(error, 'Mutasi belum dapat dihapus.')
                    ),
                }
              )
            }}
          >
            Hapus Mutasi
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
