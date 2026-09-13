import { MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export function SiteScopeFilter({
  siteLabel,
  title = 'Site',
  className,
}: {
  siteLabel: string
  title?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-md border border-dashed px-3 text-sm',
        className
      )}
      aria-label={`${title} terkunci: ${siteLabel}`}
    >
      <MapPin className='size-4 text-muted-foreground' />
      <span>{title}</span>
      <Badge variant='secondary' className='rounded-sm px-1 font-normal'>
        {siteLabel}
      </Badge>
    </div>
  )
}
