import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import { Badge } from '@/components/ui/badge'
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
  buildAttendanceValidationWorkbook,
  attendanceImportHeaders,
  parseAttendanceWorkbook,
} from './attendance-import-workbook'
import {
  fetchAttendanceImportTemplateEmployees,
  useImportAttendance,
  usePreviewAttendanceImport,
} from './data/queries'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'
import type { AttendanceImportPreview, AttendanceImportRow } from './domain'

export function AttendanceImportDialog({
  open,
  onOpenChange,
  initialDate,
  goLiveDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate: string
  goLiveDate: string
}) {
  const [rows, setRows] = useState<AttendanceImportRow[]>([])
  const [preview, setPreview] = useState<AttendanceImportPreview>()
  const [reason, setReason] = useState('')
  const [batchKey, setBatchKey] = useState(crypto.randomUUID())
  const [templateDate, setTemplateDate] = useState(initialDate)
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const [templateLoading, setTemplateLoading] = useState(false)
  const previewMutation = usePreviewAttendanceImport()
  const importMutation = useImportAttendance()
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
    setBatchKey(crypto.randomUUID())
    setTemplateDate(initialDate)
    setTemplatePickerOpen(false)
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
      const result = await fetchAttendanceImportTemplateEmployees(templateDate)
      if (!result.data.length) {
        toast.error('Karyawan eligible Attendance tidak ditemukan.')
        return
      }
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.aoa_to_sheet([
        [...attendanceImportHeaders],
        ...result.data.map((employee) => [
          displayDate(templateDate),
          employee.employeeNumber,
          employee.employeeName,
          '',
          '',
          '',
          '',
        ]),
      ])
      sheet['!cols'] = [
        { wch: 16 },
        { wch: 24 },
        { wch: 36 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 45 },
      ]
      sheet['!autofilter'] = { ref: `A1:G${result.data.length + 1}` }
      XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance')
      const guide = XLSX.utils.aoa_to_sheet([
        ['Panduan Import Attendance'],
        [
          '1. Isi STATUS dengan HADIR, ALPHA, CUTI, SAKIT, atau IZIN. Penulisan IJIN juga diterima sebagai IZIN.',
        ],
        [
          '2. Status HADIR wajib memiliki minimal JAM_MASUK atau JAM_PULANG. Gunakan format HH:mm, misalnya 07:00.',
        ],
        [
          '3. Status ALPHA, CUTI, SAKIT, dan IZIN tidak boleh memiliki jam masuk/pulang.',
        ],
        [
          '4. KETERANGAN wajib diisi untuk CUTI, SAKIT, dan IZIN; untuk status lain bersifat opsional.',
        ],
        [
          '5. TANGGAL mendukung DD/MM/YYYY. Gandakan baris untuk mengimpor karyawan pada beberapa tanggal.',
        ],
        [
          '6. Site dan Shift ditentukan otomatis dari histori karyawan pada tanggal setiap baris.',
        ],
        [
          '7. Klasifikasi dan jam hasil import langsung disetujui. Data abnormal tetap ditandai agar mudah ditindaklanjuti.',
        ],
        ['8. Maksimal 2.000 baris berisi data dalam satu file.'],
        ['9. Seluruh baris harus valid sebelum import dapat dijalankan.'],
      ])
      guide['!cols'] = [{ wch: 115 }]
      XLSX.utils.book_append_sheet(workbook, guide, 'Panduan')
      XLSX.writeFile(workbook, 'template-import-attendance.xlsx')
      setTemplatePickerOpen(false)
      if (result.meta.total > result.meta.limit) {
        toast.warning(
          `Template memuat ${result.meta.limit} dari ${result.meta.total} karyawan. Baris lain dapat ditambahkan manual.`
        )
      }
    } catch (error) {
      toast.error(apiMessage(error, 'Template Attendance gagal dibuat.'))
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
      const parsed = await parseAttendanceWorkbook(file)
      setRows(parsed)
      setPreview(undefined)
      setBatchKey(crypto.randomUUID())
      previewMutation.mutate(parsed, {
        onSuccess: setPreview,
        onError: (error) => {
          setPreview(undefined)
          toast.error(apiMessage(error, 'Preview import Attendance gagal.'))
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
              ? `${result.replayed} baris import sebelumnya ditemukan; tidak ada data ganda.`
              : `${result.imported} baris Attendance berhasil diimpor.`
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
        className='grid max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-6xl'
        showCloseButton={!isBusy}
      >
        <DialogHeader className='border-b px-6 py-5'>
          <DialogTitle>Import Attendance</DialogTitle>
          <DialogDescription>
            Satu file dapat memuat banyak tanggal dan site. Site serta Shift
            mengikuti histori karyawan pada setiap tanggal.
          </DialogDescription>
        </DialogHeader>

        <div className='grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-4 overflow-hidden px-6 py-4'>
          <section className='flex flex-col gap-3 rounded-lg border bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-start gap-3'>
              <FileSpreadsheet className='mt-0.5 size-5 shrink-0 text-primary' />
              <div>
                <p className='font-medium'>Mulai dari template karyawan</p>
                <p className='text-sm text-muted-foreground'>
                  Pilih tanggal untuk memuat karyawan yang eligible Attendance.
                  Tanggal pada setiap baris tetap boleh diubah setelah diunduh.
                </p>
              </div>
            </div>
            {templatePickerOpen ? (
              <div className='grid w-full gap-2 sm:max-w-sm'>
                <DatePicker
                  selected={dateOnlyFromInput(templateDate)}
                  onSelect={(date) => setTemplateDate(dateOnlyToInput(date))}
                  disabled={isBusy}
                  disabledDates={(date) =>
                    date > new Date() ||
                    date < (dateOnlyFromInput(goLiveDate) ?? new Date(0))
                  }
                  placeholder='Tanggal referensi'
                />
                <div className='flex gap-2'>
                  <Button
                    type='button'
                    disabled={isBusy || !templateDate}
                    onClick={() => void downloadTemplate()}
                  >
                    {templateLoading ? (
                      <Loader2 className='animate-spin' />
                    ) : (
                      <Download />
                    )}
                    Unduh template
                  </Button>
                  <Button
                    type='button'
                    variant='ghost'
                    disabled={isBusy}
                    onClick={() => setTemplatePickerOpen(false)}
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
                onClick={() => setTemplatePickerOpen(true)}
              >
                <Download /> Pilih tanggal & unduh template
              </Button>
            )}
          </section>

          <div className='grid gap-1.5'>
            <label
              className='text-sm font-medium'
              htmlFor='attendance-import-file'
            >
              File Excel (.xlsx)
            </label>
            <Input
              id='attendance-import-file'
              type='file'
              accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              disabled={isBusy}
              onChange={(event) => {
                void selectFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <p className='text-xs text-muted-foreground'>
              Format tanggal DD/MM/YYYY, jam HH:mm, maksimal 2.000 baris.
            </p>
          </div>

          <div className='min-h-0'>
            {previewMutation.isPending ? (
              <div className='grid h-full min-h-36 place-items-center rounded-lg border text-sm text-muted-foreground'>
                <span className='flex items-center gap-2'>
                  <Loader2 className='size-4 animate-spin' /> Memeriksa histori,
                  Shift, kalender, Produksi, dan Payroll...
                </span>
              </div>
            ) : preview ? (
              <AttendanceImportPreviewTable preview={preview} />
            ) : (
              <div className='grid h-full min-h-28 place-items-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground'>
                Upload file untuk melihat hasil validasi sebelum import.
              </div>
            )}
          </div>

          <label className='grid gap-1.5 text-sm'>
            <span className='font-medium'>Alasan import</span>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder='Contoh: Import Attendance dari rekap darurat HR.'
              rows={2}
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
              <Loader2 className='animate-spin' />
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

function AttendanceImportPreviewTable({
  preview,
}: {
  preview: AttendanceImportPreview
}) {
  const summary = useMemo(
    () =>
      `${preview.valid} valid · ${preview.invalid} perlu diperbaiki${preview.warnings ? ` · ${preview.warnings} peringatan` : ''}`,
    [preview]
  )

  function downloadValidation() {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    XLSX.writeFile(
      buildAttendanceValidationWorkbook(preview),
      `hasil-validasi-import-attendance-${stamp}.xlsx`
    )
  }

  return (
    <section className='grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <div
          className={
            preview.invalid
              ? 'flex-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm'
              : 'flex-1 rounded-lg border border-emerald-300/60 bg-emerald-50/60 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950/20'
          }
        >
          <strong>{preview.total} baris.</strong> {summary}.
        </div>
        <Button type='button' variant='outline' onClick={downloadValidation}>
          <Download /> Download hasil validasi
        </Button>
      </div>
      <div className='min-h-0 overflow-auto rounded-lg border'>
        <Table className='text-xs'>
          <TableHeader className='sticky top-0 z-10 bg-background'>
            <TableRow>
              <TableHead className='w-14 text-center'>Baris</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Karyawan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Jam</TableHead>
              <TableHead>Site & Shift</TableHead>
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
                <TableCell>{row.status || '—'}</TableCell>
                <TableCell className='whitespace-nowrap'>
                  {row.clockIn || '—'} / {row.clockOut || '—'}
                </TableCell>
                <TableCell>
                  <p>{row.siteName ?? row.site ?? '—'}</p>
                  <p className='text-muted-foreground'>
                    {row.shiftName ?? '—'}
                  </p>
                </TableCell>
                <TableCell className='min-w-64'>
                  <div className='flex items-start gap-2'>
                    {row.valid ? (
                      row.warning ? (
                        <AlertTriangle className='mt-0.5 size-4 shrink-0 text-amber-600' />
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

function displayDate(value: string) {
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
