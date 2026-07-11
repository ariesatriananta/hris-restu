import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function UnauthorisedError() {
  const navigate = useNavigate()
  return (
    <div className='flex min-h-svh items-center justify-center p-6 text-center'>
      <div>
        <p className='text-7xl font-bold text-primary'>401</p>
        <h1 className='mt-3 text-xl font-semibold'>Sesi diperlukan</h1>
        <p className='mt-2 text-muted-foreground'>
          Silakan masuk menggunakan akun yang memiliki akses.
        </p>
        <Button
          className='mt-6'
          onClick={() =>
            navigate({ to: '/sign-in', search: { redirect: '/' } })
          }
        >
          Masuk ke HRIS
        </Button>
      </div>
    </div>
  )
}
