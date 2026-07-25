import { APP_LOGO_SRC, APP_NAME, COMPANY_NAME } from '@/lib/app-branding'

const LOGIN_HERO_BACKGROUND = '/brand/login-factory-workers.png'

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className='relative grid min-h-svh overflow-hidden bg-slate-950 text-white lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.72fr)]'>
      <img
        src={LOGIN_HERO_BACKGROUND}
        alt=''
        className='absolute inset-0 h-full w-full scale-105 object-cover blur-[3px]'
        aria-hidden='true'
      />
      <div className='absolute inset-0 bg-slate-950/55' aria-hidden='true' />
      <div
        className='absolute inset-0 bg-[radial-gradient(circle_at_28%_24%,rgba(14,36,89,0.45),transparent_34%),linear-gradient(90deg,rgba(2,6,23,0.86),rgba(2,6,23,0.38),rgba(2,6,23,0.72))]'
        aria-hidden='true'
      />

      <section className='relative hidden p-10 text-white lg:flex lg:flex-col lg:justify-between'>
        <div className='inline-flex w-fit items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 shadow-2xl backdrop-blur-md'>
          <img
            src={APP_LOGO_SRC}
            alt={`Logo ${APP_NAME}`}
            className='size-10 rounded-xl bg-white object-contain p-1'
          />
          <div className='leading-tight'>
            <p className='text-sm font-bold'>{APP_NAME}</p>
            <p className='text-xs text-white/65'>Sistem HR Terintegrasi</p>
          </div>
        </div>

        <div className='max-w-2xl space-y-5'>
          <p className='text-sm font-semibold tracking-[0.24em] text-white/65 uppercase'>
            {COMPANY_NAME}
          </p>
          <h1 className='text-5xl leading-tight font-bold tracking-tight'>
            Operasional SDM produksi dalam satu ruang kerja.
          </h1>
          <p className='max-w-xl text-base leading-7 text-white/75'>
            Kelola data karyawan, kontrak, mutasi, attendance, produksi
            borongan, dan payroll dengan alur yang rapi serta mudah ditelusuri.
          </p>
        </div>

        <p className='text-xs text-white/55'>Jepara · Semarang · Klaten</p>
      </section>

      <section className='relative flex min-h-svh items-center justify-center p-5 sm:p-10'>
        <div className='absolute inset-y-0 right-0 hidden w-full bg-background/92 shadow-2xl backdrop-blur-xl lg:block' />
        <div className='relative w-full max-w-md space-y-6'>{children}</div>
      </section>
    </main>
  )
}
