import { useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { ClipboardPlus, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
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
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import {
  usePreviewProductionBatchInput,
  useRunProductionBatchInput,
  type ProductionBatchInputParams,
} from './data/production-batch-input-queries'

export function ProductionBatchInputDialog({
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
  const [site, setSite] = useState<ProductionBatchInputParams['site']>('ALL')
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const idempotencyKey = useRef<string | undefined>(undefined)
  const submitting = useRef(false)
  const preview = usePreviewProductionBatchInput()
  const run = useRunProductionBatchInput()
  const days =
    (Date.parse(`${dateTo}T00:00:00Z`) - Date.parse(`${dateFrom}T00:00:00Z`)) /
      86_400_000 +
    1
  const validRange = Number.isFinite(days) && days >= 1 && days <= 7
  const data = preview.data
  const previewMatches =
    data?.dateFrom === dateFrom &&
    data?.dateTo === dateTo &&
    data?.site === site
  const ready =
    previewMatches && data?.canCreate && !preview.isPending && !run.isPending
  const canSubmit =
    ready &&
    reason.trim().length >= 10 &&
    confirmation.trim().toUpperCase() === 'PROSES'

  const loadPreview = () => {
    if (!validRange || run.isPending) return
    preview.mutate(
      { dateFrom, dateTo, site },
      {
        onSuccess: () => {
          setConfirmation('')
          idempotencyKey.current = crypto.randomUUID()
        },
        onError: (error) =>
          toast.error(
            apiMessage(error, 'Kesiapan batch Produksi gagal diperiksa.')
          ),
      }
    )
  }
  useEffect(() => {
    if (open) loadPreview()
    // The dialog is mounted fresh each time it opens, matching the other batch forms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const reset = () => {
    preview.reset()
    setConfirmation('')
    idempotencyKey.current = undefined
  }
  const submit = () => {
    if (!canSubmit || !data || !idempotencyKey.current || submitting.current)
      return
    submitting.current = true
    run.mutate(
      {
        dateFrom,
        dateTo,
        site,
        previewToken: data.previewToken,
        idempotencyKey: idempotencyKey.current,
        reason: reason.trim(),
        confirmation: 'PROSES',
      },
      {
        onSuccess: (result) => {
          toast.success(
            `${result.created} setoran dibuat, ${result.pairs} pasangan Linting–Batil.`
          )
          onOpenChange(false)
        },
        onError: (error) => {
          toast.error(apiMessage(error, 'Batch Produksi gagal diproses.'))
          if (isAxiosError(error) && error.response?.status === 409) reset()
        },
        onSettled: () => {
          submitting.current = false
        },
      }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!run.isPending) onOpenChange(next)
      }}
    >
      <DialogContent className='flex max-h-[92dvh] flex-col overflow-hidden sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle>Input Setoran Produksi Batch</DialogTitle>
          <DialogDescription>
            Data acak untuk demo, disimpan sebagai transaksi sungguhan. Hanya
            karyawan yang lolos validasi pada tanggal setoran yang diproses.
            Maksimal 7 hari / 1.000 target karyawan-hari per proses.
          </DialogDescription>
        </DialogHeader>
        <div className='min-h-0 flex-1 space-y-3 overflow-y-auto'>
          <fieldset
            disabled={run.isPending}
            className='grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end'
          >
            <div className='grid gap-1'>
              <Label htmlFor='production-batch-input-site'>Site</Label>
              <Select
                value={site}
                disabled={run.isPending}
                onValueChange={(value) => {
                  setSite(value as ProductionBatchInputParams['site'])
                  reset()
                }}
              >
                <SelectTrigger
                  id='production-batch-input-site'
                  className='w-full'
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>Semua Site</SelectItem>
                  <SelectItem value='JEPARA'>Site Jepara</SelectItem>
                  <SelectItem value='SEMARANG'>Site Semarang</SelectItem>
                  <SelectItem value='KLATEN'>Site Klaten</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='grid gap-1'>
              <Label htmlFor='production-batch-input-from'>Dari tanggal</Label>
              <DatePicker
                id='production-batch-input-from'
                selected={dateOnlyFromInput(dateFrom)}
                disabled={run.isPending}
                onSelect={(date) => {
                  if (date) {
                    setDateFrom(dateOnlyToInput(date))
                    reset()
                  }
                }}
              />
            </div>
            <div className='grid gap-1'>
              <Label htmlFor='production-batch-input-to'>Sampai tanggal</Label>
              <DatePicker
                id='production-batch-input-to'
                selected={dateOnlyFromInput(dateTo)}
                disabled={run.isPending}
                onSelect={(date) => {
                  if (date) {
                    setDateTo(dateOnlyToInput(date))
                    reset()
                  }
                }}
              />
            </div>
            <Button
              type='button'
              variant='outline'
              disabled={!validRange || preview.isPending || run.isPending}
              onClick={loadPreview}
            >
              {preview.isPending ? (
                <Loader2 className='animate-spin' />
              ) : (
                <RefreshCw />
              )}{' '}
              Periksa
            </Button>
          </fieldset>
          {!validRange && (
            <p role='alert' className='text-xs text-destructive'>
              Pilih rentang 1–7 hari, dengan tanggal akhir setelah atau sama
              dengan tanggal awal.
            </p>
          )}
          {preview.isError && (
            <p
              role='alert'
              className='rounded-md bg-destructive/10 p-2 text-sm text-destructive'
            >
              {apiMessage(
                preview.error,
                'Pemeriksaan gagal. Silakan periksa kembali.'
              )}
            </p>
          )}
          {preview.isPending ? (
            <div role='status' className='grid min-h-32 place-items-center'>
              <Loader2
                className='animate-spin'
                aria-label='Memeriksa kesiapan'
              />
            </div>
          ) : previewMatches && data ? (
            <>
              <div
                className='grid grid-cols-2 gap-2 sm:grid-cols-4'
                aria-label='Ringkasan batch Produksi'
              >
                {(
                  [
                    ['Target karyawan / hari', data.summary.employees],
                    ['Rencana setoran', data.summary.planned],
                    ['Pasangan Klaten', data.summary.pairs],
                    ['Dilewati', data.summary.blocked],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className='rounded-lg border px-3 py-2'>
                    <p className='text-xs text-muted-foreground'>{label}</p>
                    <p className='text-lg font-semibold tabular-nums'>
                      {value.toLocaleString('id-ID')}
                    </p>
                  </div>
                ))}
              </div>
              <div className='max-h-[35dvh] overflow-auto rounded-lg border'>
                <Table>
                  <TableHeader className='sticky top-0 bg-background'>
                    <TableRow>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead className='text-right'>Eligible</TableHead>
                      <TableHead className='text-right'>Setoran</TableHead>
                      <TableHead className='text-right'>Pasangan</TableHead>
                      <TableHead>Kesiapan / Alasan dilewati</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.length ? (
                      data.items.map((item) => (
                        <TableRow key={`${item.businessDate}-${item.site}`}>
                          <TableCell className='whitespace-nowrap'>
                            {item.businessDate.split('-').reverse().join('/')}
                          </TableCell>
                          <TableCell>{item.site}</TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {item.eligible}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {item.planned}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>
                            {item.pairs}
                          </TableCell>
                          <TableCell className='min-w-56 break-words whitespace-normal'>
                            {item.blockers.length ? (
                              item.blockers.map((blocker) => (
                                <p key={blocker.reason}>
                                  {blocker.reason} ({blocker.count})
                                </p>
                              ))
                            ) : item.planned ? (
                              <span className='text-positive'>
                                Siap diproses
                              </span>
                            ) : (
                              'Tidak ada karyawan eligible.'
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className='py-6 text-center text-muted-foreground'
                        >
                          Tidak ada kandidat pada rentang dan site ini.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {!data.canCreate && (
                <p role='alert' className='text-xs text-destructive'>
                  Tidak ada setoran yang siap diproses. Perbaiki kesiapan
                  Attendance, penugasan, tarif, atau penguncian yang tercantum
                  lalu Periksa kembali.
                </p>
              )}
            </>
          ) : (
            !preview.isError &&
            !preview.isPending && (
              <p className='py-6 text-center text-sm text-muted-foreground'>
                Klik Periksa untuk menyiapkan rencana setoran.
              </p>
            )
          )}
          <p className='text-xs text-muted-foreground'>
            Jumlah dan QC dibuat acak; tarif mengikuti master yang berlaku.
            Pasangan Klaten memakai PCS yang sama. Setoran yang sudah ada tidak
            ditambahkan ulang oleh batch demo.
          </p>
          <div className='grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_1fr]'>
            <div className='grid gap-1'>
              <Label htmlFor='production-batch-input-reason'>
                Alasan input batch
              </Label>
              <Textarea
                id='production-batch-input-reason'
                value={reason}
                maxLength={400}
                disabled={run.isPending}
                onChange={(event) => setReason(event.target.value)}
                placeholder='Minimal 10 karakter, misalnya: Data demonstrasi produksi'
                className='min-h-16'
              />
            </div>
            <div className='grid content-start gap-1'>
              <Label htmlFor='production-batch-input-confirmation'>
                Ketik PROSES
              </Label>
              <Input
                id='production-batch-input-confirmation'
                value={confirmation}
                disabled={run.isPending}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete='off'
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={run.isPending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button type='button' disabled={!canSubmit} onClick={submit}>
            {run.isPending ? (
              <Loader2 className='animate-spin' />
            ) : (
              <ClipboardPlus />
            )}{' '}
            Proses {previewMatches ? (data?.summary.planned ?? '') : ''} setoran
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data.message ?? fallback)
    : fallback
}
