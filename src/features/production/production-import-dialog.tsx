import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/date-picker'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  fetchProductionImportTemplateEmployees,
  useImportProductionTransactions,
  usePreviewProductionImport,
} from './data/queries'
import type { ProductionImportPreview, ProductionImportRow } from './domain'
import {
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import {
  buildProductionValidationWorkbook,
  parseProductionWorkbook,
  productionImportHeaders,
} from './production-import-workbook'

export function ProductionImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [rows, setRows] = useState<ProductionImportRow[]>([])
  const [preview, setPreview] = useState<ProductionImportPreview>()
  const [reason, setReason] = useState('')
  const [batchKey, setBatchKey] = useState(createBatchKey)
  const [templateLoading, setTemplateLoading] = useState(false)
  const [templateDate, setTemplateDate] = useState(getTodayInput)
  const [templateDatePickerOpen, setTemplateDatePickerOpen] = useState(false)
  const previewMutation = usePreviewProductionImport()
  const importMutation = useImportProductionTransactions()
  const isBusy =
    templateLoading || previewMutation.isPending || importMutation.isPending
  const canImport = Boolean(
    preview &&
    preview.total > 0 &&
    preview.invalid === 0 &&
    reason.trim().length >= 5
  )

  function reset() {
    setRows([])
    setPreview(undefined)
    setReason('')
    setBatchKey(createBatchKey())
    setTemplateDate(getTodayInput())
    setTemplateDatePickerOpen(false)
    previewMutation.reset()
    importMutation.reset()
  }

  function changeOpen(next: boolean) {
    if (!next && !isBusy) reset()
    onOpenChange(next)
  }

  async function downloadTemplate() {
    if (!templateDate) return
    setTemplateLoading(true)
    try {
      const result = await fetchProductionImportTemplateEmployees(templateDate)
      if (!result.data.length) {
        toast.error('Karyawan Produksi aktif tidak ditemukan pada akses Anda.')
        return
      }
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.aoa_to_sheet([
        [...productionImportHeaders],
        ...result.data.map((employee) => [
          displayTemplateDate(templateDate),
          employee.employeeNumber,
          employee.employeeName,
          '',
        ]),
      ])
      sheet['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 36 }, { wch: 16 }]
      sheet['!autofilter'] = { ref: `A1:D${result.data.length + 1}` }
      XLSX.utils.book_append_sheet(workbook, sheet, 'Hasil Produksi')
      const guide = XLSX.utils.aoa_to_sheet([
        ['Panduan Import Hasil Produksi'],
        [
          '1. Isi TANGGAL dengan format DD/MM/YYYY (contoh: 21/09/2026). Tanggal Excel dan format YYYY-MM-DD juga didukung.',
        ],
        ['2. Isi KUANTITAS hanya pada karyawan yang akan diimpor.'],
        [
          '3. Gandakan baris jika satu karyawan memiliki hasil pada beberapa tanggal.',
        ],
        ['4. Jangan mengubah NOMOR_KARYAWAN. NAMA_KARYAWAN hanya informasi.'],
        [
          '5. Site dan pekerjaan utama ditentukan otomatis sesuai histori pada tanggal tersebut.',
        ],
        ['6. Maksimal 2.000 baris berisi data dalam satu file.'],
        ['7. Seluruh baris harus valid sebelum import dapat dijalankan.'],
      ])
      guide['!cols'] = [{ wch: 100 }]
      XLSX.utils.book_append_sheet(workbook, guide, 'Panduan')
      XLSX.writeFile(workbook, 'template-import-hasil-produksi.xlsx')
      setTemplateDatePickerOpen(false)
      if (result.meta.total > result.meta.limit) {
        toast.warning(
          `Template memuat ${result.meta.limit} dari ${result.meta.total} karyawan. Baris lain dapat ditambahkan manual.`
        )
      }
    } catch (error) {
      toast.error(apiMessage(error, 'Template gagal dibuat.'))
    } finally {
      setTemplateLoading(false)
    }
  }

  async function selectFile(file?: File) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Gunakan file Excel dengan format .xlsx.')
      return
    }
    try {
      const parsed = await parseProductionWorkbook(file)
      setRows(parsed)
      setPreview(undefined)
      setBatchKey(createBatchKey())
      previewMutation.mutate(parsed, {
        onSuccess: setPreview,
        onError: (error) => {
          setPreview(undefined)
          toast.error(apiMessage(error, 'Preview import gagal dibuat.'))
        },
      })
    } catch (error) {
      setRows([])
      setPreview(undefined)
      toast.error(
        error instanceof Error
          ? error.message
          : 'File Excel tidak dapat dibaca.'
      )
    }
  }

  function executeImport() {
    if (!canImport) return
    importMutation.mutate(
      { rows, reason: reason.trim(), idempotencyKey: batchKey },
      {
        onSuccess: (result) => {
          toast.success(
            result.replayed
              ? `${result.replayed} baris import sebelumnya ditemukan; tidak ada transaksi ganda.`
              : `${result.imported} transaksi Produksi berhasil diimpor.`
          )
          reset()
          onOpenChange(false)
        },
        onError: (error) =>
          toast.error(
            apiMessage(
              error,
              'Import dibatalkan. Muat ulang file untuk memvalidasi data terbaru.'
            )
          ),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        className='max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-6xl'
        showCloseButton={!isBusy}
      >
        <DialogHeader className='border-b px-6 py-5'>
          <DialogTitle>Import hasil Produksi</DialogTitle>
          <DialogDescription>
            Satu file dapat memuat banyak tanggal dan site. Sistem menentukan
            site serta pekerjaan utama dari histori karyawan.
          </DialogDescription>
        </DialogHeader>

        <div className='max-h-[calc(100svh-13rem)] space-y-5 overflow-y-auto px-6 py-5'>
          <section className='flex flex-col gap-3 rounded-lg border bg-muted/25 p-4 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-start gap-3'>
              <FileSpreadsheet className='mt-0.5 size-5 text-primary' />
              <div>
                <p className='font-medium'>Mulai dari template karyawan</p>
                <p className='text-sm text-muted-foreground'>
                  Pilih tanggal untuk melihat daftar karyawan yang tercatat aktif
                  sebagai tenaga borongan pada tanggal tersebut. Gandakan baris
                  untuk mengisi tanggal lain.
                </p>
              </div>
            </div>
            {templateDatePickerOpen ? (
              <div className='w-full space-y-2 sm:max-w-sm'>
                <label className='text-sm font-medium' htmlFor='production-template-date'>
                  Tanggal referensi daftar karyawan
                </label>
                <DatePicker
                  id='production-template-date'
                  selected={dateOnlyFromInput(templateDate)}
                  onSelect={(date) => setTemplateDate(dateOnlyToInput(date))}
                  disabled={isBusy}
                  disabledDates={isFutureDate}
                  placeholder='Pilih tanggal kerja'
                />
                <p className='text-xs text-muted-foreground'>
                  Daftar karyawan dan tanggal awal di template akan mengikuti
                  pilihan ini. Setelah diunduh, tanggal pada baris boleh diubah
                  untuk import beberapa tanggal.
                </p>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    disabled={isBusy || !templateDate}
                    onClick={() => void downloadTemplate()}
                  >
                    {templateLoading ? (
                      <LoaderCircle className='animate-spin' />
                    ) : (
                      <Download />
                    )}
                    Unduh template
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    disabled={isBusy}
                    onClick={() => setTemplateDatePickerOpen(false)}
                  >
                    Batal
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                type='button'
                variant='outline'
                disabled={isBusy}
                onClick={() => setTemplateDatePickerOpen(true)}
              >
                <Download />
                Pilih tanggal & unduh template
              </Button>
            )}
          </section>

          <div className='grid gap-2'>
            <label
              className='text-sm font-medium'
              htmlFor='production-import-file'
            >
              File Excel (.xlsx)
            </label>
            <Input
              id='production-import-file'
              type='file'
              accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              disabled={isBusy}
              onChange={(event) => {
                void selectFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <p className='text-xs text-muted-foreground'>
              Format tanggal: DD/MM/YYYY. Maksimal 2.000 baris berisi data.
              Baris tanpa tanggal dan kuantitas akan diabaikan.
            </p>
          </div>

          {previewMutation.isPending ? (
            <div className='flex items-center justify-center gap-2 rounded-lg border py-12 text-sm text-muted-foreground'>
              <LoaderCircle className='size-4 animate-spin' /> Memeriksa
              Attendance, pekerjaan, tarif, site, dan kunci Payroll...
            </div>
          ) : preview ? (
            <ProductionImportPreviewTable preview={preview} />
          ) : null}

          <label className='grid gap-1.5 text-sm'>
            <span className='font-medium'>Alasan import</span>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder='Contoh: Import hasil Produksi dari rekap darurat mandor.'
              maxLength={500}
              disabled={isBusy}
            />
            <span className='text-xs text-muted-foreground'>
              Wajib diisi minimal 5 karakter untuk Audit Trail.
            </span>
          </label>
        </div>

        <DialogFooter className='border-t bg-muted/20 px-6 py-4'>
          <Button
            type='button'
            variant='outline'
            disabled={isBusy}
            onClick={() => changeOpen(false)}
          >
            Batal
          </Button>
          <Button
            type='button'
            disabled={!canImport || isBusy}
            onClick={executeImport}
          >
            {importMutation.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <Upload />
            )}
            Import {preview?.valid ? `${preview.valid} baris` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProductionImportPreviewTable({
  preview,
}: {
  preview: ProductionImportPreview
}) {
  const summary = useMemo(
    () =>
      `${preview.valid} valid · ${preview.invalid} perlu diperbaiki${preview.warnings ? ` · ${preview.warnings} peringatan` : ''}`,
    [preview]
  )

  function downloadValidationResult() {
    const now = new Date()
    const timestamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      '-',
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('')
    XLSX.writeFile(
      buildProductionValidationWorkbook(preview),
      `hasil-validasi-import-produksi-${timestamp}.xlsx`
    )
  }

  return (
    <section className='space-y-3'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
        <div
          className={
            preview.invalid
              ? 'flex-1 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm'
              : 'flex-1 rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-4 py-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/20'
          }
        >
          <strong>{preview.total} baris terdeteksi.</strong> {summary}.{' '}
          {preview.invalid
            ? 'Perbaiki seluruh baris merah sebelum menjalankan import.'
            : 'Seluruh data siap diimpor.'}
        </div>
        <Button
          type='button'
          variant='outline'
          className='shrink-0'
          onClick={downloadValidationResult}
        >
          <Download />
          Download hasil validasi
        </Button>
      </div>
      <div className='max-h-96 overflow-auto rounded-lg border'>
        <Table className='text-xs'>
          <TableHeader className='sticky top-0 z-10 bg-background'>
            <TableRow>
              <TableHead className='w-14 text-center'>Baris</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Karyawan</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Pekerjaan utama</TableHead>
              <TableHead className='text-right'>Hasil</TableHead>
              <TableHead>Validasi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.map((row) => (
              <TableRow
                key={`${row.rowNumber}-${row.employeeNumber}-${row.businessDate}`}
                className={row.valid ? undefined : 'bg-destructive/5'}
              >
                <TableCell className='text-center'>{row.rowNumber}</TableCell>
                <TableCell className='whitespace-nowrap'>
                  {row.businessDate || '—'}
                </TableCell>
                <TableCell>
                  <p className='font-medium'>{row.employeeName || '—'}</p>
                  <p className='text-muted-foreground'>
                    {row.employeeNumber || '—'}
                  </p>
                </TableCell>
                <TableCell className='whitespace-nowrap'>
                  {row.siteName ?? row.site ?? '—'}
                </TableCell>
                <TableCell>
                  {row.job ? (
                    <>
                      <p className='font-medium'>{row.job.name}</p>
                      <p className='text-muted-foreground'>{row.job.code}</p>
                    </>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className='text-right whitespace-nowrap'>
                  {row.unit ? (
                    <>
                      <p>
                        {formatQuantity(row.quantity)} {row.unit.code}
                      </p>
                      <p className='font-medium'>
                        {formatCurrency(row.estimatedGrossAmount ?? '0')}
                      </p>
                    </>
                  ) : (
                    row.quantity || '—'
                  )}
                </TableCell>
                <TableCell className='min-w-56'>
                  <div className='flex items-start gap-2'>
                    {row.valid ? (
                      row.warning ? (
                        <AlertTriangle className='mt-0.5 size-4 shrink-0 text-warning' />
                      ) : (
                        <CheckCircle2 className='mt-0.5 size-4 shrink-0 text-emerald-600' />
                      )
                    ) : (
                      <XCircle className='mt-0.5 size-4 shrink-0 text-destructive' />
                    )}
                    <div>
                      <Badge variant={row.valid ? 'outline' : 'destructive'}>
                        {row.valid ? 'Valid' : 'Perlu diperbaiki'}
                      </Badge>
                      <p className='mt-1 text-muted-foreground'>
                        {row.warning ?? row.message}
                      </p>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function formatQuantity(value: string) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(
    Number(value)
  )
}

function formatCurrency(value: string) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function createBatchKey() {
  return crypto.randomUUID()
}

function getTodayInput() {
  const now = new Date()
  return dateOnlyToInput(now)
}

function displayTemplateDate(value: string) {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function isFutureDate(date: Date) {
  const today = dateOnlyFromInput(getTodayInput())
  return Boolean(today && date > today)
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
