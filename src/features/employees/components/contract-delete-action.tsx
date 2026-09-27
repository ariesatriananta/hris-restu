import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableActionButton } from '@/components/data-table'
import { hasPermission } from '@/features/auth/permissions'
import { useDeleteContract } from '../data/queries'
import type { EmployeeContract } from '../domain'

export function ContractDeleteAction({
  contract,
  showLabel = false,
  onDeleted,
}: {
  contract: EmployeeContract
  showLabel?: boolean
  onDeleted?: () => void
}) {
  const session = useAuthStore((state) => state.session)
  const deletion = useDeleteContract()
  const [open, setOpen] = useState(false)

  if (
    !hasPermission(session, 'employees.manage') ||
    !['DRAFT', 'CANCELLED'].includes(contract.status)
  ) {
    return null
  }

  const trigger = showLabel ? (
    <Button
      type='button'
      size='sm'
      variant='destructive'
      onClick={() => setOpen(true)}
    >
      <Trash2 /> Hapus kontrak
    </Button>
  ) : (
    <DataTableActionButton
      className='text-destructive hover:text-destructive'
      label={`Hapus kontrak ${contract.contractNumber}`}
      onClick={() => setOpen(true)}
    >
      <Trash2 />
    </DataTableActionButton>
  )

  return (
    <>
      {trigger}
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => !deletion.isPending && setOpen(next)}
        title='Hapus kontrak?'
        desc={
          <p>
            Kontrak <strong>{contract.contractNumber}</strong> berstatus{' '}
            {contract.status === 'DRAFT' ? 'Draft' : 'Dibatalkan'} akan dihapus
            permanen. Data karyawan dan file lampiran tidak ikut dihapus.
          </p>
        }
        confirmText='Hapus kontrak'
        destructive
        isLoading={deletion.isPending}
        handleConfirm={() =>
          deletion.mutate(contract.uid, {
            onSuccess: () => {
              toast.success('Kontrak berhasil dihapus.')
              setOpen(false)
              onDeleted?.()
            },
            onError: () =>
              toast.error(
                'Kontrak gagal dihapus. Muat ulang data dan periksa statusnya.'
              ),
          })
        }
      />
    </>
  )
}
