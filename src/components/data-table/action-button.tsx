import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type DataTableActionButtonProps = ComponentProps<typeof Button> & {
  label: string
  children: ReactNode
}

/** Icon-only action with the standard shadcn tooltip for operational tables. */
export function DataTableActionButton({
  label,
  children,
  asChild,
  ...props
}: DataTableActionButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size='icon'
          variant='ghost'
          aria-label={label}
          asChild={asChild}
          {...props}
        >
          {asChild ? (
            children
          ) : (
            <>
              {children}
              <span className='sr-only'>{label}</span>
            </>
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side='top' sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
