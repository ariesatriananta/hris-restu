import { useEffect, useId, useMemo, useRef } from 'react'
import { Camera, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { validateImageFile } from './validation'

export function ImageUploadField({
  label,
  description,
  file,
  onChange,
  allowedTypes,
  maxBytes,
  error,
}: {
  label: string
  description: string
  file: File | null
  onChange: (file: File | null, error?: string) => void
  allowedTypes: string[]
  maxBytes: number
  error?: string
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  )
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    },
    [previewUrl]
  )

  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>
        {label} <span className='text-destructive'>*</span>
      </Label>
      <button
        type='button'
        onClick={() => inputRef.current?.click()}
        className={cn(
          'group relative flex min-h-44 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed bg-muted/30 text-left transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
          error && 'border-destructive'
        )}
        aria-describedby={`${id}-description ${error ? `${id}-error` : ''}`}
      >
        {previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt={`Pratinjau ${label}`}
              className='h-44 w-full object-contain'
            />
            <span className='absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-background/95 px-2 py-1 text-xs font-medium shadow'>
              <RefreshCw className='size-3.5' /> Ganti
            </span>
          </>
        ) : (
          <span className='flex flex-col items-center gap-2 px-5 py-7 text-center'>
            <span className='rounded-full bg-primary/10 p-3 text-primary'>
              <Camera className='size-5' />
            </span>
            <span className='text-sm font-medium'>Ambil atau pilih foto</span>
            <span className='text-xs text-muted-foreground'>{description}</span>
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        id={id}
        type='file'
        accept={allowedTypes.join(',')}
        capture='environment'
        className='sr-only'
        onChange={(event) => {
          const selected = event.target.files?.[0]
          if (!selected) return
          const validationError = validateImageFile(
            selected,
            allowedTypes,
            maxBytes
          )
          onChange(
            validationError ? null : selected,
            validationError ?? undefined
          )
          event.currentTarget.value = ''
        }}
      />
      <p id={`${id}-description`} className='text-xs text-muted-foreground'>
        JPG, PNG, atau WebP - maksimal 5 MB
      </p>
      {error && (
        <p id={`${id}-error`} className='text-xs text-destructive'>
          {error}
        </p>
      )}
      {file && (
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className='text-destructive'
          onClick={() => onChange(null)}
        >
          <Trash2 /> Hapus foto
        </Button>
      )}
    </div>
  )
}
