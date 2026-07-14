import { APP_NAME, COMPANY_NAME } from '@/lib/app-branding'
import { AppBrand } from '@/components/app-brand'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className='grid min-h-svh bg-muted/40 lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.7fr)]'>
      <section className='hidden bg-primary p-10 text-primary-foreground lg:flex lg:flex-col lg:justify-between'>
        <AppBrand className='[&_p]:text-primary-foreground' />
        <div className='max-w-xl space-y-4'>
          <p className='text-sm font-semibold tracking-[0.2em] text-primary-foreground/70 uppercase'>
            {APP_NAME}
          </p>
          <h1 className='text-4xl leading-tight font-bold'>
            Operasional SDM tiga site dalam satu ruang kerja.
          </h1>
          <p className='text-primary-foreground/75'>
            {COMPANY_NAME} &mdash; fondasi pengelolaan karyawan, attendance,
            produksi borongan, dan payroll yang dapat ditelusuri.
          </p>
        </div>
        <p className='text-xs text-primary-foreground/60'>
          Jepara · Semarang · Klaten
        </p>
      </section>
      <section className='flex min-h-svh items-center justify-center p-5 sm:p-10'>
        <div className='w-full max-w-md space-y-6'>
          <AppBrand className='justify-center lg:hidden' />
          {children}
        </div>
      </section>
    </main>
  )
}
