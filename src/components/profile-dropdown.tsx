import { Link } from '@tanstack/react-router'
import {
  BookOpenText,
  LogOut,
  MapPin,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import useDialogState from '@/hooks/use-dialog-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { getSiteName, getUserInitials } from '@/features/profile/profile-utils'

export function ProfileDropdown() {
  const [open, setOpen] = useDialogState()
  const user = useAuthStore((state) => state.session?.user)
  if (!user) return null

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='size-9 rounded-full'
            aria-label={`Menu akun ${user.name}`}
          >
            <Avatar className='size-8'>
              <AvatarFallback className='bg-primary text-primary-foreground'>
                {getUserInitials(user.name)}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-72' align='end'>
          <DropdownMenuLabel className='space-y-1 font-normal'>
            <p className='font-semibold'>{user.name}</p>
            <p className='text-xs text-muted-foreground'>{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <ShieldCheck /> {user.roleLabel}
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <MapPin />
            {user.role === 'SUPER_ADMIN'
              ? 'Seluruh site'
              : user.siteAccess.length > 0
                ? user.siteAccess.map(getSiteName).join(', ')
                : 'Tanpa akses site'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to='/profil-saya'>
              <UserRound /> Profil Saya
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to='/panduan'>
              <BookOpenText /> Knowledge Base
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
            <LogOut /> Keluar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
