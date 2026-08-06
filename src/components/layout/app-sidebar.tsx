import { useAuthStore } from '@/stores/auth-store'
import { useLayout } from '@/context/layout-provider'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { AppBrand } from '@/components/app-brand'
import { hasAnyPermission } from '@/features/auth/permissions'
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import type { NavGroup as NavGroupType, NavItem } from './types'

function SidebarBrand() {
  const { state } = useSidebar()
  return <AppBrand compact={state === 'collapsed'} className='px-1 py-1.5' />
}

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const session = useAuthStore((state) => state.session)
  const navGroups = filterNavGroups(sidebarData.navGroups, session)
  return (
    <Sidebar collapsible={collapsible} variant={variant}>
      <SidebarHeader>
        <SidebarBrand />
      </SidebarHeader>
      <SidebarContent>
        {navGroups.map((group) => (
          <NavGroup key={group.title} {...group} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function canSeeItem(
  item: Pick<NavItem, 'superAdminOnly' | 'anyOfPermissions'>,
  session: ReturnType<typeof useAuthStore.getState>['session']
) {
  if (item.superAdminOnly && session?.user.role !== 'SUPER_ADMIN') return false
  if (item.anyOfPermissions?.length) {
    return hasAnyPermission(session, item.anyOfPermissions)
  }
  return true
}

function filterNavGroups(
  groups: NavGroupType[],
  session: ReturnType<typeof useAuthStore.getState>['session']
) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item): NavItem | null => {
          if (!canSeeItem(item, session)) return null
          if (!item.items) return item
          const items = item.items.filter((child) => canSeeItem(child, session))
          return items.length ? { ...item, items } : null
        })
        .filter((item): item is NavItem => item !== null),
    }))
    .filter((group) => group.items.length > 0)
}
