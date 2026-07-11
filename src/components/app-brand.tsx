import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

interface AppBrandProps {
  compact?: boolean
  className?: string
}

export function AppBrand({ compact = false, className }: AppBrandProps) {
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <Link
      to='/'
      aria-label='HRIS PT Restu'
      className={cn('flex min-w-0 items-center gap-3', className)}
    >
      <div className='flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary text-[10px] font-black tracking-wider text-primary-foreground'>
        {!imageFailed ? (
          <img
            src='/brand/restu-logo.jpeg'
            alt='Logo PT Restu'
            className='h-full w-full object-contain'
            onError={() => setImageFailed(true)}
          />
        ) : (
          'RESTU'
        )}
      </div>
      {!compact && (
        <div className='min-w-0 leading-tight'>
          <p className='truncate text-sm font-bold'>HRIS PT Restu</p>
          <p className='truncate text-xs text-muted-foreground'>
            Sistem Internal
          </p>
        </div>
      )}
    </Link>
  )
}
