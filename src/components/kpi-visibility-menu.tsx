import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'

type KpiVisibilityProps = {
  showKpi: boolean
  onCheckedChange: (visible: boolean) => void
}

export function KpiVisibilityMenuItem({
  showKpi,
  onCheckedChange,
}: KpiVisibilityProps) {
  return (
    <DropdownMenuItem
      role='menuitemcheckbox'
      aria-checked={showKpi}
      className='justify-between'
      onSelect={(event) => {
        event.preventDefault()
        onCheckedChange(!showKpi)
      }}
    >
      <span>Tampilkan KPI</span>
      <Switch
        checked={showKpi}
        tabIndex={-1}
        aria-hidden='true'
        className='pointer-events-none'
      />
    </DropdownMenuItem>
  )
}

export function KpiVisibilityMenu(props: KpiVisibilityProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          size='icon'
          variant='outline'
          aria-label='Opsi tampilan'
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        <KpiVisibilityMenuItem {...props} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
