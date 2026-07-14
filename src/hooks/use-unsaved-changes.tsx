import { useBlocker } from '@tanstack/react-router'
import { ConfirmDialog } from '@/components/confirm-dialog'

export function useUnsavedChanges(isDirty: boolean) {
  const blocker = useBlocker({
    shouldBlockFn: () => isDirty,
    enableBeforeUnload: () => isDirty,
    withResolver: true,
  })

  const confirmation =
    blocker.status === 'blocked' ? (
      <ConfirmDialog
        open
        onOpenChange={(open) => {
          if (!open) blocker.reset?.()
        }}
        title='Buang perubahan?'
        desc='Perubahan yang belum disimpan akan hilang.'
        cancelBtnText='Tetap di halaman'
        confirmText='Buang perubahan'
        destructive
        handleConfirm={() => blocker.proceed?.()}
      />
    ) : null

  return { confirmation }
}
