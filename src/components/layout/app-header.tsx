import { Link, useLocation } from '@tanstack/react-router'
import { ChevronRight, MapPinned } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/badge'
import { routeLabels } from '@/features/placeholders/module-pages'
import { ProfileDropdown } from '../profile-dropdown'
import { ThemeSwitch } from '../theme-switch'
import { Header } from './header'

export function AppHeader() {
  const session = useAuthStore((state) => state.session)
  const pathname = useLocation({ select: (location) => location.pathname })
  const label =
    routeLabels[pathname] ??
    (pathname.startsWith('/karyawan/data-karyawan/')
      ? 'Detail Karyawan'
      : 'Halaman')
  const group = pathname === '/' ? null : pathname.split('/')[1]
  const siteAccess = session?.user.siteAccess ?? []
  const siteLabel =
    session?.user.role === 'SUPER_ADMIN'
      ? 'Seluruh Site'
      : siteAccess.length === 1
        ? `Site ${siteNames[siteAccess[0]]}`
        : siteAccess.length > 1
          ? `${siteAccess.length} Site`
          : 'Tanpa Akses Site'
  const siteTitle = siteAccess.length
    ? siteAccess.map((site) => siteNames[site]).join(', ')
    : siteLabel

  return (
    <Header fixed className='bg-transparent'>
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
      <Badge
        variant='outline'
        className='hidden gap-1.5 md:flex'
        aria-label={`Akses site: ${siteTitle}`}
        title={`Akses site: ${siteTitle}`}
      >
        <MapPinned className='size-3.5 text-positive' /> {siteLabel}
      </Badge>
      <ThemeSwitch />
      <ProfileDropdown />
    </Header>
  )
}

const siteNames = {
  JEPARA: 'Jepara',
  SEMARANG: 'Semarang',
  KLATEN: 'Klaten',
} as const
