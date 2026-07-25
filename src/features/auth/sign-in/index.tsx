import { useSearch } from '@tanstack/react-router'
import { APP_LOGO_SRC, APP_NAME, COMPANY_NAME } from '@/lib/app-branding'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AuthLayout } from '../auth-layout'
import { UserAuthForm } from './components/user-auth-form'

export function SignIn() {
  const { redirect } = useSearch({ from: '/(auth)/sign-in' })
  const year = new Date().getFullYear()

  return (
    <AuthLayout>
      <div className='w-full space-y-4'>
        <div className='flex justify-center'>
          <img
            src={APP_LOGO_SRC}
            alt={`Logo ${APP_NAME}`}
            className='h-40 w-auto drop-shadow-xl'
          />
        </div>
        <Card className='border-white/70 bg-background/88 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-background/82'>
          <CardHeader className='text-left'>
            <CardTitle>Masuk ke HRIS</CardTitle>
            <CardDescription>
              Gunakan akun Administrator HRIS untuk mengakses dashboard internal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UserAuthForm redirectTo={redirect} />
          </CardContent>
        </Card>
        <p className='text-center text-xs text-white/70 lg:text-muted-foreground'>
          © {year} {COMPANY_NAME}. Seluruh hak cipta dilindungi.
        </p>
      </div>
    </AuthLayout>
  )
}
