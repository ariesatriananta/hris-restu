import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import { AlertTriangle, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'
import {
  useDeleteProductionBatch,
  usePreviewProductionBatchDelete,
} from './data/queries'
import type { ProductionSite } from './domain'

type SiteFilter = 'ALL' | ProductionSite

export function ProductionBatchDeleteDialog({
  open,
  onOpenChange,
  initialDateFrom,
  initialDateTo,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDateFrom: string
  initialDateTo: string
}) {
  const [dateFrom, setDateFrom] = useState(initialDateFrom)
  const [dateTo, setDateTo] = useState(initialDateTo)
  const [site, setSite] = useState<SiteFilter>('ALL')
  const [selected, setSelected] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const preview = usePreviewProductionBatchDelete()
  const remove = useDeleteProductionBatch()

  const loadSummary = (from = dateFrom, to = dateTo) => {
    setSelected([])
    setConfirmation('')
    preview.mutate(
      { dateFrom: from, dateTo: to, site },
      {
        onError: (error) =>
          toast.error(apiMessage(error, 'Ringkasan transaksi gagal dimuat.')),
      }
    )
  }

  useEffect(() => {
    if (!open) return
    preview.mutate(
      { dateFrom: initialDateFrom, dateTo: initialDateTo, site: 'ALL' },
      {
        onError: (error) =>
          toast.error(apiMessage(error, 'Ringkasan transaksi gagal dimuat.')),
      }
    )
    // Mutation is stable for this mounted dialog lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const readyDates = useMemo(
    () => preview.data?.rows.filter((row) => row.canDelete) ?? [],
    [preview.data]
  )
  const allReadySelected =
    readyDates.length > 0 &&
    readyDates.every((row) => selected.includes(row.businessDate))
  const hasSelectedDate = selected.length > 0
  const hasValidReason = reason.trim().length >= 5
  const hasValidConfirmation = confirmation.trim().toUpperCase() === 'HAPUS'
  const canSubmit =
    hasSelectedDate &&
    hasValidReason &&
    hasValidConfirmation &&
    !remove.isPending
  const changeDate = (setter: (value: string) => void, value: string) => {
    setter(value)
    setSelected([])
    setConfirmation('')
    preview.reset()
  }

  const submit = () => {
    if (!canSubmit) return
    remove.mutate(
      {
        businessDates: selected,
        site,
        reason: reason.trim(),
        confirmation: 'HAPUS',
      },
      {
        onSuccess: (result) => {
          toast.success(
            `${formatNumber(result.deletedTransactions)} transaksi pada ${formatNumber(result.deletedDates)} tanggal berhasil dihapus.`
          )
          onOpenChange(false)
        },
        onError: (error) =>
          toast.error(apiMessage(error, 'Transaksi batch gagal dihapus.')),
      }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !remove.isPending && onOpenChange(next)}
    >
      <DialogContent className='flex max-h-[92vh] flex-col sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle>Hapus Transaksi Batch</DialogTitle>
          <DialogDescription>
            Khusus Super Admin. Pilih tanggal yang akan dikosongkan seluruh
            transaksi Produksinya.
          </DialogDescription>
        </DialogHeader>

        <div className='grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1'>
          <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end'>
            <label className='grid gap-1 text-sm'>
              <span className='font-medium'>Site</span>
              <Select
                value={site}
                onValueChange={(value) => {
                  setSite(value as SiteFilter)
                  setSelected([])
                  setConfirmation('')
                  preview.reset()
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>Semua Site</SelectItem>
                  <SelectItem value='JEPARA'>Site Jepara</SelectItem>
                  <SelectItem value='SEMARANG'>Site Semarang</SelectItem>
                  <SelectItem value='KLATEN'>Site Klaten</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <DateField
              label='Dari tanggal'
              value={dateFrom}
              onChange={(value) => changeDate(setDateFrom, value)}
            />
            <DateField
              label='Sampai tanggal'
              value={dateTo}
              onChange={(value) => changeDate(setDateTo, value)}
            />
            <Button
              type='button'
              variant='outline'
              disabled={preview.isPending || dateFrom > dateTo}
              onClick={() => loadSummary()}
            >
              {preview.isPending ? (
                <Loader2 className='animate-spin' />
              ) : (
                <RefreshCw />
              )}
              Muat ringkasan
            </Button>
          </div>

          <div className='overflow-hidden rounded-lg border'>
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-12 text-center'>
                      <Checkbox
                        aria-label='Pilih semua tanggal yang siap dihapus'
                        checked={allReadySelected}
                        disabled={!readyDates.length}
                        onCheckedChange={(checked) =>
                          setSelected(
                            checked
                              ? readyDates.map((row) => row.businessDate)
                              : []
                          )
                        }
                      />
                    </TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead className='text-right'>Karyawan</TableHead>
                    <TableHead className='text-right'>Kali setoran</TableHead>
                    <TableHead className='text-right'>Total PCS</TableHead>
                    <TableHead className='text-right'>Bruto Produksi</TableHead>
                    <TableHead>Kesiapan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.isPending ? (
                    <TableRow>
                      <TableCell colSpan={7} className='h-28 text-center'>
                        <Loader2 className='mx-auto size-5 animate-spin text-muted-foreground' />
                      </TableCell>
                    </TableRow>
                  ) : preview.data?.rows.length ? (
                    preview.data.rows.map((row) => (
                      <TableRow key={row.businessDate}>
                        <TableCell className='text-center'>
                          <Checkbox
                            aria-label={`Pilih ${formatDate(row.businessDate)}`}
                            checked={selected.includes(row.businessDate)}
                            disabled={!row.canDelete}
                            onCheckedChange={(checked) =>
                              setSelected((current) =>
                                checked
                                  ? [...current, row.businessDate]
                                  : current.filter(
                                      (date) => date !== row.businessDate
                                    )
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className='font-medium'>
                          {formatDate(row.businessDate)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatNumber(row.employeeCount)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatNumber(row.transactionCount)}
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {formatNumber(row.totalQuantityPcs)}
                        </TableCell>
                        <TableCell className='text-right font-medium tabular-nums'>
                          {formatCurrency(row.totalGrossAmount)}
                        </TableCell>
                        <TableCell className='min-w-56 text-xs'>
                          {row.canDelete ? (
                            <span className='font-medium text-emerald-700 dark:text-emerald-400'>
                              Siap dihapus
                            </span>
                          ) : (
                            <span className='text-destructive'>
                              {row.blockers.join(' ')}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className='h-28 text-center text-muted-foreground'
                      >
                        Tidak ada transaksi Produksi pada rentang ini.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className='grid gap-3 sm:grid-cols-2'>
            {selected.length > 0 && (
              <div className='flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive sm:col-span-2'>
                <AlertTriangle className='mt-0.5 size-4 shrink-0' />
                <p>
                  <span className='font-semibold'>
                    {selected.length} tanggal akan dikosongkan.
                  </span>{' '}
                  Menghapus seluruh transaksi{' '}
                  {site === 'ALL' ? 'semua site' : `Site ${siteLabel(site)}`}{' '}
                  pada tanggal terpilih. Attendance dan master Produksi tetap
                  dipertahankan.
                </p>
              </div>
            )}
            <div className='grid gap-1.5 sm:col-span-2'>
              <Label htmlFor='production-batch-delete-reason'>
                Alasan reset
              </Label>
              <Textarea
                id='production-batch-delete-reason'
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder='Contoh: Data setoran tanggal tersebut akan diimpor ulang.'
                rows={2}
                maxLength={500}
              />
              <p className='text-xs text-muted-foreground'>
                Minimal 5 karakter.
              </p>
            </div>
            <div className='grid gap-1.5 sm:col-span-2'>
              <Label htmlFor='production-batch-delete-confirmation'>
                Ketik HAPUS untuk konfirmasi
              </Label>
              <Input
                id='production-batch-delete-confirmation'
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete='off'
                placeholder='HAPUS'
              />
              <div className='grid gap-0.5 text-xs'>
                <Requirement ready={hasSelectedDate}>
                  Pilih minimal satu tanggal pada tabel.
                </Requirement>
                <Requirement ready={hasValidReason}>
                  Alasan reset minimal 5 karakter.
                </Requirement>
                <Requirement ready={hasValidConfirmation}>
                  Konfirmasi harus bertuliskan HAPUS.
                </Requirement>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={remove.isPending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type='button'
            variant='destructive'
            disabled={!canSubmit}
            onClick={submit}
          >
            {remove.isPending ? (
              <Loader2 className='animate-spin' />
            ) : (
              <Trash2 />
            )}
            Hapus {selected.length || ''} tanggal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className='grid gap-1 text-sm'>
      <span className='font-medium'>{label}</span>
      <DatePicker
        selected={dateFromInput(value)}
        onSelect={(date) => date && onChange(dateToInput(date))}
        toYear={new Date().getFullYear() + 1}
      />
    </label>
  )
}

function Requirement({
  ready,
  children,
}: {
  ready: boolean
  children: ReactNode
}) {
  return (
    <p className={ready ? 'text-emerald-700' : 'text-muted-foreground'}>
      {ready ? '✓' : '•'} {children}
    </p>
  )
}

function dateFromInput(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return year && month && day ? new Date(year, month - 1, day) : undefined
}

function dateToInput(value: Date) {
  const local = new Date(value)
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset())
  return local.toISOString().slice(0, 10)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`)
  )
}

function siteLabel(value: ProductionSite) {
  return value.charAt(0) + value.slice(1).toLowerCase()
}

function formatNumber(value: string | number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(
    Number(value)
  )
}

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
