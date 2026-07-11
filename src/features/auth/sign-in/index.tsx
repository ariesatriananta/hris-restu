import { useSearch } from '@tanstack/react-router'
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
  return (
    <AuthLayout>
      <Card className='w-full max-w-md shadow-lg'>
        <CardHeader>
          <CardTitle>Masuk ke HRIS</CardTitle>
          <CardDescription>
            Gunakan akun Administrator HRIS untuk mengakses dashboard internal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UserAuthForm redirectTo={redirect} />
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
