import { useState } from 'react'
import { LoaderCircle, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useProductionTerminalDailySummary } from './data/queries'
import type { ProductionTerminalSummaryCondition } from './domain'
import { ProductionTerminalSummaryDialog } from './production-terminal-summary-dialog'

export function ProductionTerminalSummary({
  deviceUid,
  deviceToken,
  onDialogClosed,
}: {
  deviceUid: string
  deviceToken: string
  onDialogClosed?: () => void
}) {
  const query = useProductionTerminalDailySummary(deviceUid, deviceToken)
  const [selection, setSelection] = useState<{
    sectionUid: string
    condition: ProductionTerminalSummaryCondition
    title: string
  } | null>(null)

  return (
    <section
      aria-label='Ringkasan setoran hari ini'
      className='mt-3 min-w-0 space-y-2'
    >
      <div className='flex flex-wrap items-center justify-between gap-1'>
        <h2 className='text-sm font-semibold'>Setoran hari ini</h2>
        {query.data && (
          <p className='text-[11px] text-muted-foreground'>
            {query.data.siteName} ·{' '}
            {new Intl.DateTimeFormat('id-ID', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              timeZone: 'Asia/Jakarta',
            }).format(new Date(`${query.data.businessDate}T00:00:00+07:00`))}
          </p>
        )}
      </div>
      {query.isPending ? (
        <p
          role='status'
          className='flex items-center justify-center gap-2 rounded-lg border py-4 text-xs text-muted-foreground'
        >
          <LoaderCircle className='size-4 animate-spin' />
          Memuat ringkasan hari ini...
        </p>
      ) : query.isError ? (
        <div
          role='alert'
          className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-xs'
        >
          <p>Ringkasan hari ini belum dapat dimuat.</p>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => void query.refetch()}
          >
            <RefreshCcw className='size-3.5' /> Muat ulang ringkasan
          </Button>
        </div>
      ) : !query.data?.sections.length ? (
        <p className='rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground'>
          Belum ada bagian produksi untuk ditampilkan.
        </p>
      ) : (
        query.data.sections.map((section) => (
          <div
            key={section.uid}
            aria-label={`Ringkasan ${section.name}`}
            className='grid min-w-0 grid-cols-3 gap-2'
          >
            {[
              {
                label: `Total Absen ${section.name} Hari Ini`,
                count: section.presentEmployees,
                color: 'text-primary',
                condition: 'PRESENT' as const,
              },
              {
                label: `Pekerja ${section.name} Sudah Input`,
                count: section.submittedEmployees,
                color: 'text-emerald-700 dark:text-emerald-400',
                condition: 'SUBMITTED' as const,
              },
              {
                label: `Pekerja ${section.name} Belum Input`,
                count: section.pendingEmployees,
                color: 'text-destructive',
                condition: 'PENDING' as const,
              },
            ].map((item) => (
              <button
                key={item.label}
                type='button'
                aria-label={item.label}
                aria-haspopup='dialog'
                onClick={() =>
                  setSelection({
                    sectionUid: section.uid,
                    condition: item.condition,
                    title: item.label,
                  })
                }
                className='flex min-h-[76px] min-w-0 flex-col justify-between gap-1 rounded-lg border border-primary/10 bg-gradient-to-br from-primary/5 via-primary/[0.025] to-background px-2 py-2.5 text-center transition-colors hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-3'
              >
                <span className='text-[11px] leading-snug text-primary sm:text-xs'>
                  {item.label}
                </span>
                <span
                  className={`text-base font-bold tabular-nums ${item.color}`}
                >
                  {item.count.toLocaleString('id-ID')}
                </span>
              </button>
            ))}
          </div>
        ))
      )}
      {selection && (
        <ProductionTerminalSummaryDialog
          deviceUid={deviceUid}
          deviceToken={deviceToken}
          selection={selection}
          onClose={() => setSelection(null)}
          onDialogClosed={onDialogClosed}
        />
      )}
    </section>
  )
}
