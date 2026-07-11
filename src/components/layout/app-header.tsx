import { Link, useLocation } from '@tanstack/react-router'
import { ChevronRight, MapPinned } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { routeLabels } from '@/features/placeholders/module-pages'
import { ProfileDropdown } from '../profile-dropdown'
import { ThemeSwitch } from '../theme-switch'
import { Header } from './header'

export function AppHeader() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const label = routeLabels[pathname] ?? 'Halaman'
  const group = pathname === '/' ? null : pathname.split('/')[1]

  return (
    <Header fixed className='border-b bg-background/90'>
      <nav aria-label='Breadcrumb' className='me-auto min-w-0'>
        <ol className='flex min-w-0 items-center gap-1.5 text-sm'>
          <li>
            <Link
              to='/'
              className='text-muted-foreground hover:text-foreground'
            >
              HRIS
            </Link>
          </li>
          {group && (
            <>
              <ChevronRight className='size-3.5 text-muted-foreground' />
              <li className='hidden text-muted-foreground capitalize sm:block'>
                {group}
              </li>
            </>
          )}
          <ChevronRight className='size-3.5 text-muted-foreground' />
          <li className='truncate font-medium'>{label}</li>
        </ol>
      </nav>
      <Badge variant='outline' className='hidden gap-1.5 md:flex'>
        <MapPinned className='size-3.5 text-positive' /> Seluruh Site
      </Badge>
      <ThemeSwitch />
      <ProfileDropdown />
    </Header>
  )
}
