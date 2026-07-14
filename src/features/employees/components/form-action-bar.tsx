import { Button } from '@/components/ui/button'

export function FormActionBar({
  formId,
  isPending,
  submitLabel,
  onCancel,
}: {
  formId: string
  isPending?: boolean
  submitLabel: string
  onCancel: () => void
}) {
  return (
    <div className='sticky bottom-3 z-20 flex justify-end gap-2 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80'>
      <Button
        type='button'
        variant='outline'
        onClick={onCancel}
        disabled={isPending}
      >
        Batal
      </Button>
      <Button type='submit' form={formId} disabled={isPending}>
        {isPending ? 'Menyimpan...' : submitLabel}
      </Button>
    </div>
  )
}
