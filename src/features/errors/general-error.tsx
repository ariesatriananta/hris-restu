import { useNavigate } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export function GeneralError({
  className,
  minimal = false,
}: React.HTMLAttributes<HTMLDivElement> & { minimal?: boolean }) {
  const navigate = useNavigate()
  return (
    <div
      className={cn(
        'flex min-h-svh w-full items-center justify-center p-6 text-center',
        className
      )}
    >
      <div>
        {!minimal && <p className='text-7xl font-bold text-destructive'>500</p>}
        <h1 className='mt-3 text-xl font-semibold'>Terjadi gangguan</h1>
        <p className='mt-2 text-muted-foreground'>
          Aplikasi belum dapat memproses permintaan. Silakan coba kembali.
        </p>
        {!minimal && (
          <Button className='mt-6' onClick={() => navigate({ to: '/' })}>
            Ke Dashboard
          </Button>
        )}
      </div>
    </div>
  )
}
