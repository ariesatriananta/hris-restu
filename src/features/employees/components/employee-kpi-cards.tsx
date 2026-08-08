import {
  BadgeCheck,
  CircleOff,
  GraduationCap,
  MapPinCheckInside,
  UserRoundX,
  UsersRound,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import type { EmployeeKpiSummary } from '../domain'

export function EmployeeKpiCards({
  data,
  isPending,
  isError,
}: {
  data?: EmployeeKpiSummary
  isPending: boolean
  isError: boolean
}) {
  const cards = [
    {
      label: 'Total karyawan',
      value: data?.totalEmployees,
      icon: UsersRound,
      description:
        'Seluruh karyawan yang tercatat sesuai akses site dan filter jenis karyawan yang dipilih.',
      className: 'border-muted-foreground/20 bg-muted/40 text-foreground',
      iconClassName: 'text-muted-foreground',
    },
    {
      label: 'Aktif bekerja',
      value: data?.activeEmployees,
      icon: BadgeCheck,
      description:
        'Karyawan berstatus Aktif sesuai akses site dan filter jenis karyawan yang dipilih.',
      className:
        'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
      iconClassName: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      label: 'Tidak aktif',
      value: data?.inactiveEmployees,
      icon: CircleOff,
      description:
        'Karyawan berstatus Tidak Aktif, termasuk data onboarding yang belum diaktifkan.',
      className:
        'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400',
      iconClassName: 'text-amber-600 dark:text-amber-400',
    },
    {
      label: 'Resign',
      value: data?.resignedEmployees,
      icon: UserRoundX,
      description:
        'Karyawan yang sudah tercatat berstatus Resign dalam cakupan filter saat ini.',
      className: 'border-destructive/30 bg-destructive/5 text-destructive',
      iconClassName: 'text-destructive',
    },
    {
      label: 'Training aktif',
      value: data?.activeTrainingEmployees,
      icon: GraduationCap,
      description:
        'Karyawan jenis Training yang saat ini berstatus Aktif dalam cakupan filter.',
      className:
        'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-400',
      iconClassName: 'text-sky-600 dark:text-sky-400',
    },
    {
      label: 'Penempatan perlu dilengkapi',
      value: data?.incompletePlacementEmployees,
      icon: MapPinCheckInside,
      description:
        'Karyawan yang belum berstatus Resign dan belum memiliki jabatan atau penempatan bagian produksi yang lengkap.',
      className:
        'border-violet-500/30 bg-violet-500/5 text-violet-700 dark:text-violet-400',
      iconClassName: 'text-violet-600 dark:text-violet-400',
    },
  ]

  if (isPending) {
    return (
      <div className='mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'>
        {cards.map((card) => (
          <Skeleton key={card.label} className='h-[68px] rounded-lg' />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <p className='mb-4 text-sm text-muted-foreground'>
        Ringkasan KPI karyawan belum dapat dimuat. Tabel karyawan tetap
        tersedia.
      </p>
    )
  }

  return (
    <div className='mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'>
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <Tooltip key={card.label}>
            <TooltipTrigger asChild>
              <section
                tabIndex={0}
                className={`min-h-[68px] rounded-lg border px-3 py-2.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none ${card.className}`}
                aria-label={`${card.label}: ${card.value ?? 0}. ${card.description}`}
              >
                <div className='flex items-start justify-between gap-3'>
                  <div className='min-w-0'>
                    <p className='text-[11px] leading-3 font-medium'>
                      {card.label}
                    </p>
                    <p className='mt-1 text-xl leading-none font-semibold tabular-nums'>
                      {card.value ?? 0}
                    </p>
                  </div>
                  <Icon
                    className={`size-3.5 shrink-0 ${card.iconClassName}`}
                    aria-hidden='true'
                  />
                </div>
              </section>
            </TooltipTrigger>
            <TooltipContent className='max-w-72'>
              {card.description}
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
