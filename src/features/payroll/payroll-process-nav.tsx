import { Calculator, CalendarCheck2, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  payrollProcessHref,
  type PayrollProcessStage,
} from './payroll-process-navigation'

const stages = [
  {
    id: 'PERIOD' as const,
    number: 1,
    label: 'Periode & kesiapan',
    description: 'Siapkan data',
    icon: CalendarCheck2,
  },
  {
    id: 'CALCULATION' as const,
    number: 2,
    label: 'Perhitungan',
    description: 'Hitung dan periksa',
    icon: Calculator,
  },
  {
    id: 'APPROVAL' as const,
    number: 3,
    label: 'Persetujuan & penutupan',
    description: 'Sahkan hasil',
    icon: CheckCircle2,
  },
]

export function PayrollProcessNav({
  active,
  periodUid,
}: {
  active: PayrollProcessStage
  periodUid?: string
}) {
  return (
    <nav aria-label='Tahapan proses Payroll'>
      <ol className='grid gap-2 md:grid-cols-3'>
        {stages.map((stage) => {
          const current = stage.id === active
          const Icon = stage.icon
          return (
            <li key={stage.id}>
              <a
                href={payrollProcessHref(stage.id, periodUid)}
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'flex min-h-16 items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                  'hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  current && 'border-primary/50 bg-primary/8 shadow-sm'
                )}
              >
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold',
                    current
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {current ? <Icon className='size-4' /> : stage.number}
                </span>
                <span className='min-w-0'>
                  <span className='block truncate text-sm font-semibold'>
                    {stage.label}
                  </span>
                  <span className='block truncate text-xs text-muted-foreground'>
                    {stage.description}
                  </span>
                </span>
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
