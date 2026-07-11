import { useNavigate, useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function ForbiddenError() {
  const navigate = useNavigate()
  const { history } = useRouter()
  return (
    <div className='flex min-h-svh items-center justify-center p-6 text-center'>
      <div>
        <p className='text-7xl font-bold text-primary'>403</p>
        <h1 className='mt-3 text-xl font-semibold'>Akses tidak diizinkan</h1>
        <p className='mt-2 text-muted-foreground'>
          Akun ini tidak memiliki izin untuk membuka halaman tersebut.
        </p>
        <div className='mt-6 flex justify-center gap-3'>
          <Button variant='outline' onClick={() => history.go(-1)}>
            Kembali
          </Button>
          <Button onClick={() => navigate({ to: '/' })}>Ke Dashboard</Button>
        </div>
      </div>
    </div>
  )
}
