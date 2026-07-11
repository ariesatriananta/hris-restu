import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

export function MaintenanceError() {
  const navigate = useNavigate()
  return (
    <div className='flex min-h-svh items-center justify-center p-6 text-center'>
      <div>
        <p className='text-7xl font-bold text-primary'>503</p>
        <h1 className='mt-3 text-xl font-semibold'>
          Sistem sedang dalam pemeliharaan
        </h1>
        <p className='mt-2 text-muted-foreground'>
          Layanan belum tersedia untuk sementara. Silakan coba kembali beberapa
          saat lagi.
        </p>
        <Button
          className='mt-6'
          variant='outline'
          onClick={() => navigate({ to: '/' })}
        >
          Coba kembali
        </Button>
      </div>
    </div>
  )
}
