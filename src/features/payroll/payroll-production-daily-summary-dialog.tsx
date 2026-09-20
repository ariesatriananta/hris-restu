import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'
import { BarChart3, LoaderCircle, RefreshCw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { usePayrollProductionDailySummary } from './data/queries'
import { formatDecimalString } from './money'

function quantity(value: string) {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: 4,
  }).format(Number(value))
}

function money(value: string) {
  return formatDecimalString(value, {
    currency: true,
    maximumFractionDigits: 0,
  })
}

export function PayrollProductionDailySummaryDialog({
  runUid,
  onClose,
}: {
  runUid?: string
  onClose: () => void
}) {
  const [sectionUid, setSectionUid] = useState('ALL')
  const summary = usePayrollProductionDailySummary(
    runUid,
    sectionUid === 'ALL' ? undefined : sectionUid
  )

  return (
    <Dialog open={Boolean(runUid)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <BarChart3 className='size-5' />
            Ringkasan produksi per tanggal
          </DialogTitle>
          <DialogDescription>
            {summary.data
              ? `${summary.data.run.periodName} · Run #${summary.data.run.runNumber}`
              : 'Total hasil, upah, dan karyawan dari snapshot perhitungan Payroll.'}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='grid gap-1.5 sm:max-w-xs'>
            <label
              className='text-sm font-medium'
              htmlFor='production-summary-section'
            >
              Bagian Produksi
            </label>
            <Select value={sectionUid} onValueChange={setSectionUid}>
              <SelectTrigger id='production-summary-section' className='w-full'>
                <SelectValue placeholder='Semua Bagian Produksi' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>Semua Bagian Produksi</SelectItem>
                {summary.data?.sections.map((section) => (
                  <SelectItem key={section.uid} value={section.uid}>
                    {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {summary.isPending ? (
            <div className='flex min-h-48 items-center justify-center text-sm text-muted-foreground'>
              <LoaderCircle className='mr-2 size-4 animate-spin' />
              Memuat ringkasan produksi...
            </div>
          ) : summary.isError ? (
            <Alert variant='destructive'>
              <AlertDescription className='flex items-center justify-between gap-3'>
                Ringkasan produksi gagal dimuat.
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => summary.refetch()}
                >
                  <RefreshCw className='mr-2 size-4' />
                  Coba lagi
                </Button>
              </AlertDescription>
            </Alert>
          ) : summary.data?.rows.length ? (
            <div className='overflow-hidden rounded-md border'>
              <Table className='text-sm'>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className='text-right'>Total PCS</TableHead>
                    <TableHead className='text-right'>Total Upah</TableHead>
                    <TableHead className='text-right'>Total Karyawan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.data.rows.map((row) => (
                    <TableRow key={row.businessDate}>
                      <TableCell className='py-2 font-medium'>
                        {format(parseISO(row.businessDate), 'd MMM yyyy', {
                          locale: id,
                        })}
                      </TableCell>
                      <TableCell className='py-2 text-right tabular-nums'>
                        {quantity(row.totalQuantity)}
                      </TableCell>
                      <TableCell className='py-2 text-right tabular-nums'>
                        {money(row.totalAmount)}
                      </TableCell>
                      <TableCell className='py-2 text-right tabular-nums'>
                        {row.employeeCount.toLocaleString('id-ID')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className='font-semibold'>Grand Total</TableCell>
                    <TableCell className='text-right font-semibold tabular-nums'>
                      {quantity(summary.data.total.totalQuantity)}
                    </TableCell>
                    <TableCell className='text-right font-semibold tabular-nums'>
                      {money(summary.data.total.totalAmount)}
                    </TableCell>
                    <TableCell className='text-right font-semibold tabular-nums'>
                      {summary.data.total.employeeCount.toLocaleString('id-ID')}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          ) : (
            <div className='rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground'>
              Tidak ada hasil produksi pada Bagian Produksi ini.
            </div>
          )}

          {summary.data && !summary.data.run.isCurrent && (
            <p className='text-xs text-amber-700 dark:text-amber-300'>
              Ringkasan ini berasal dari run historis, bukan hasil aktif.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
