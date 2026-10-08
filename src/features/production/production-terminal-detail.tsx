import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { useProductionTerminalDetail } from './data/queries'
import type { ActivatedProductionDevice } from './domain'
import { ProductionQcDetail } from './production-qc-detail'
import { isLintingJob } from './production-qc-form-policy'

export function ProductionTerminalDetail({
  session,
  uid,
  onClose,
}: {
  session: ActivatedProductionDevice
  uid?: string
  onClose: () => void
}) {
  const detail = useProductionTerminalDetail(
    session.device.uid,
    session.deviceToken,
    uid
  )
  const item = detail.data
  return (
    <Sheet
      open={Boolean(uid)}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className='w-full overflow-y-auto sm:max-w-md'>
        <SheetHeader>
          <SheetTitle>Detail Setoran</SheetTitle>
          <SheetDescription>
            Informasi setoran dari perangkat ini.
          </SheetDescription>
        </SheetHeader>
        <div className='space-y-3 px-4 pb-6 text-sm'>
          {detail.isPending ? (
            <p role='status' className='py-6 text-center text-muted-foreground'>
              Memuat detail setoran...
            </p>
          ) : detail.isError ? (
            <div role='alert' className='space-y-2 rounded-lg border p-3'>
              <p>
                Detail setoran tidak dapat dimuat atau sudah tidak tersedia pada
                perangkat ini.
              </p>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => void detail.refetch()}
              >
                Coba lagi
              </Button>
            </div>
          ) : (
            item && (
              <>
                <div className='rounded-lg border border-primary/20 bg-gradient-to-br from-primary/15 to-primary/5 p-3'>
                  <p className='font-semibold break-words'>
                    {item.employee.fullName}
                  </p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {item.employee.employeeNumber} · {item.siteName}
                  </p>
                </div>
                <div className='flex items-center justify-between gap-2 rounded-lg border p-3'>
                  <p className='text-lg font-bold tabular-nums'>
                    {Number(item.quantity).toLocaleString('id-ID', {
                      maximumFractionDigits: item.unit.decimalPrecision,
                    })}{' '}
                    {item.unit.code}
                  </p>
                  <Badge
                    variant={
                      item.status === 'POSTED' ? 'secondary' : 'destructive'
                    }
                  >
                    {item.status === 'POSTED' ? 'Tercatat' : 'Dibatalkan'}
                  </Badge>
                </div>
                <dl className='grid grid-cols-2 gap-3 rounded-lg border p-3'>
                  {[
                    ['Nomor setoran', item.transactionNumber],
                    ['Pekerjaan', item.job.name],
                    [
                      'Tanggal produksi',
                      new Date(
                        `${item.businessDate}T12:00:00+07:00`
                      ).toLocaleDateString('id-ID', {
                        dateStyle: 'medium',
                        timeZone: 'Asia/Jakarta',
                      }),
                    ],
                    [
                      'Waktu setor',
                      new Date(item.transactionAt).toLocaleString('id-ID', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: 'Asia/Jakarta',
                      }),
                    ],
                    ['Perangkat', `${item.device.name} (${item.device.code})`],
                    [
                      'Sumber',
                      item.entrySource === 'TERMINAL'
                        ? 'Scan setoran'
                        : item.entrySource === 'CORRECTION'
                          ? 'Koreksi setoran'
                          : 'Setoran susulan',
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className='min-w-0'>
                      <dt className='text-xs text-muted-foreground'>{label}</dt>
                      <dd className='mt-1 font-medium break-words'>{value}</dd>
                    </div>
                  ))}
                </dl>
                {item.qc ? (
                  <ProductionQcDetail
                    qc={item.qc}
                    linting={isLintingJob(item.job.code)}
                    showPayHint={false}
                  />
                ) : (
                  <p className='rounded-lg border p-3 text-muted-foreground'>
                    Brand{isLintingJob(item.job.code) ? ' dan QC' : ''} belum
                    dicatat pada setoran ini.
                  </p>
                )}
              </>
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
