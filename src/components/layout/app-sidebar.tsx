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
import { sidebarData } from './data/sidebar-data'
import { NavGroup } from './nav-group'
import { NavUser } from './nav-user'
import type { NavItem } from './types'

function SidebarBrand() {
  const { state } = useSidebar()
  return <AppBrand compact={state === 'collapsed'} className='px-1 py-1.5' />
}

export function AppSidebar() {
  const { collapsible, variant } = useLayout()
  const isSuperAdmin = useAuthStore(
    (state) => state.session?.user.role === 'SUPER_ADMIN'
  )
  const navGroups = sidebarData.navGroups.map((group) => ({
    ...group,
    items: group.items
      .map((item): NavItem | null => {
        if (item.superAdminOnly && !isSuperAdmin) return null
        if (!item.items) return item
        return {
          ...item,
          items: item.items.filter(
            (child) => !child.superAdminOnly || isSuperAdmin
          ),
        }
      })
      .filter((item): item is NavItem => item !== null),
  }))
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
