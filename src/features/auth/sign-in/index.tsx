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
      <div className='w-full max-w-md space-y-4'>
        <Card className='shadow-lg'>
          <CardHeader className='items-center text-center'>
            <div className='mb-2 flex w-full justify-center'>
              <img
                src={APP_LOGO_SRC}
                alt={`Logo ${APP_NAME}`}
                className='h-24 w-auto object-contain'
              />
            </div>
            <CardTitle>Masuk ke HRIS</CardTitle>
            <CardDescription>
              Gunakan akun Administrator HRIS untuk mengakses dashboard internal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UserAuthForm redirectTo={redirect} />
          </CardContent>
        </Card>
        <p className='text-center text-xs text-muted-foreground'>
          © {year} {COMPANY_NAME}. Seluruh hak cipta dilindungi.
        </p>
      </div>
    </AuthLayout>
  )
}
