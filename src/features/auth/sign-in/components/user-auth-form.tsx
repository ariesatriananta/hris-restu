import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { Loader2, LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import { InvalidCredentialsError } from '@/features/auth/domain'
import { mockCredentials } from '@/features/auth/mock-auth-repository'
import { safeRedirect } from '@/features/auth/safe-redirect'

const formSchema = z.object({
  email: z.email('Masukkan alamat email yang valid.'),
  password: z.string().min(1, 'Kata sandi wajib diisi.'),
})

type FormValues = z.infer<typeof formSchema>

interface UserAuthFormProps extends React.HTMLAttributes<HTMLFormElement> {
  redirectTo?: string
}

export function UserAuthForm({
  className,
  redirectTo,
  ...props
}: UserAuthFormProps) {
  const navigate = useNavigate()
  const signIn = useAuthStore((state) => state.signIn)
  const isSigningIn = useAuthStore((state) => state.isSigningIn)
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: mockCredentials,
  })

  async function onSubmit(values: FormValues) {
    try {
      await signIn(values)
      toast.success('Selamat datang, Administrator HRIS.')
      await navigate({ to: safeRedirect(redirectTo), replace: true })
    } catch (error) {
      const message =
        error instanceof InvalidCredentialsError
          ? error.message
          : 'Login belum berhasil. Silakan coba lagi.'
      form.setError('root', { message })
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-4', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input autoComplete='username' inputMode='email' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kata sandi</FormLabel>
              <FormControl>
                <PasswordInput autoComplete='current-password' {...field} />
              </FormControl>
              <FormDescription>
                Akun demo: {mockCredentials.email} / {mockCredentials.password}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root && (
          <p role='alert' className='text-sm text-destructive'>
            {form.formState.errors.root.message}
          </p>
        )}
        <Button className='mt-1' disabled={isSigningIn}>
          {isSigningIn ? <Loader2 className='animate-spin' /> : <LogIn />}
          {isSigningIn ? 'Memeriksa akun...' : 'Masuk ke HRIS'}
        </Button>
      </form>
    </Form>
  )
}
