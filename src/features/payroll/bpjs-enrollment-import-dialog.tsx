import { useMemo, useState } from 'react'
import {
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
import {
  fetchAllPayrollBpjsEnrollments,
  useImportPayrollBpjsEnrollments,
  usePreviewPayrollBpjsEnrollmentImport,
} from './data/queries'
import type {
  PayrollBpjsEnrollmentImportPreview,
  PayrollBpjsEnrollmentImportRow,
} from './domain'

const sheetName = 'Kepesertaan BPJS'
const columns = [
  ['EMPLOYEE_ID', 'employeeNumber'],
  ['NAMA', 'fullName'],
  ['SITE', 'site'],
  ['BPJS_KESEHATAN', 'healthEnabled'],
  ['JHT', 'jhtEnabled'],
  ['JKK', 'jkkEnabled'],
  ['JKM', 'jkmEnabled'],
  ['JP', 'jpEnabled'],
  ['ALASAN', 'reason'],
] as const
const headers = columns.map(([header]) => header)
const programHeaders = ['BPJS_KESEHATAN', 'JHT', 'JKK', 'JKM', 'JP'] as const

interface LocalRow {
  employeeNumber: string
  fullName: string
  site: string
  healthEnabled: string
  jhtEnabled: string
  jkkEnabled: string
  jkmEnabled: string
  jpEnabled: string
  reason: string
}

export function BpjsEnrollmentImportDialog({
  open,
  onOpenChange,
  templateFilters,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateFilters: Record<string, unknown>
}) {
  const [rows, setRows] = useState<PayrollBpjsEnrollmentImportRow[]>([])
  const [preview, setPreview] = useState<PayrollBpjsEnrollmentImportPreview>()
  const [batchKey, setBatchKey] = useState(() => createBatchKey())
  const [templateLoading, setTemplateLoading] = useState(false)
  const previewMutation = usePreviewPayrollBpjsEnrollmentImport()
  const importMutation = useImportPayrollBpjsEnrollments()
  const isBusy =
    templateLoading || previewMutation.isPending || importMutation.isPending
  const canExecute = Boolean(preview && preview.invalid === 0 && rows.length)

  function reset() {
    setRows([])
    setPreview(undefined)
    setBatchKey(createBatchKey())
    previewMutation.reset()
    importMutation.reset()
  }

  function close(nextOpen: boolean) {
    if (!nextOpen && !isBusy) reset()
    onOpenChange(nextOpen)
  }

  async function downloadTemplate() {
    setTemplateLoading(true)
    try {
      const enrollments = await fetchAllPayrollBpjsEnrollments(templateFilters)
      if (!enrollments.length) {
        toast.error('Tidak ada karyawan Borongan pada filter saat ini.')
        return
      }
      const dataRows = enrollments.map((item) => [
        item.employee.employeeNumber,
        item.employee.fullName,
        item.site.name,
        yesNo(item.healthEnabled),
        yesNo(item.jhtEnabled),
        yesNo(item.jkkEnabled),
        yesNo(item.jkmEnabled),
        yesNo(item.jpEnabled),
        'Pembaruan kepesertaan melalui import Excel.',
      ])
      const workbook = XLSX.utils.book_new()
      const sheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
      sheet['!cols'] = [
        { wch: 22 },
        { wch: 32 },
        { wch: 20 },
        { wch: 20 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 10 },
        { wch: 48 },
      ]
      sheet['!autofilter'] = { ref: `A1:I${dataRows.length + 1}` }
      XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
      const guide = XLSX.utils.aoa_to_sheet([
        ['Panduan Import Kepesertaan BPJS Borongan'],
        ['1. Ubah hanya kolom program dan ALASAN.'],
        ['2. Isi kolom program dengan YA atau TIDAK.'],
        ['3. Perubahan otomatis berlaku pada tanggal file diunggah.'],
        ['4. Jangan mengubah EMPLOYEE_ID, NAMA, SITE, atau nama header.'],
        ['5. Maksimal 2.000 karyawan dan seluruh baris harus valid.'],
        [
          '6. Nomor peserta BPJS tetap diperbarui melalui Master Karyawan, bukan file ini.',
        ],
      ])
      guide['!cols'] = [{ wch: 88 }]
      XLSX.utils.book_append_sheet(workbook, guide, 'Panduan')
      XLSX.writeFile(workbook, 'template-kepesertaan-bpjs-borongan.xlsx')
    } catch {
      toast.error('Template gagal dibuat. Coba beberapa saat lagi.')
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
      const parsed = await parseWorkbook(file)
      setBatchKey(createBatchKey())
      setRows(parsed.rows)
      setPreview(parsed.localPreview)
      if (parsed.localPreview) return
      previewMutation.mutate(parsed.rows, {
        onSuccess: setPreview,
        onError: () => {
          setPreview(undefined)
          toast.error('Preview gagal dibuat. Periksa isi file lalu coba lagi.')
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
    importMutation.mutate(
      {
        rows,
        idempotencyKey: batchKey,
      },
      {
        onSuccess: (result) => {
          toast.success(
            `${result.changed} karyawan berhasil diperbarui${result.replayed ? `, ${result.replayed} sudah pernah diproses` : ''}.`
          )
          reset()
          onOpenChange(false)
        },
        onError: () =>
          toast.error(
            'Import dibatalkan. Muat ulang file agar data divalidasi kembali.'
          ),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className='max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0 sm:max-w-6xl'
        showCloseButton={!isBusy}
      >
        <DialogHeader className='border-b px-6 py-5'>
          <DialogTitle>Import kepesertaan BPJS Borongan</DialogTitle>
          <DialogDescription>
            Unduh template, ubah pilihan program, lalu periksa preview sebelum
            menyimpan.
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[calc(100svh-13rem)] space-y-5 overflow-y-auto px-6 py-5'>
          <div className='flex flex-col gap-3 rounded-lg border bg-muted/25 p-4 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-start gap-3'>
              <FileSpreadsheet className='mt-0.5 size-5 text-primary' />
              <div>
                <p className='font-medium'>Mulai dari template terisi</p>
                <p className='text-sm text-muted-foreground'>
                  Daftar karyawan mengikuti site dan pencarian pada tabel.
                </p>
              </div>
            </div>
            <Button
              type='button'
              variant='outline'
              disabled={isBusy}
              onClick={() => void downloadTemplate()}
            >
              {templateLoading ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Download />
              )}
              Unduh template
            </Button>
          </div>

          <div className='grid gap-2'>
            <label className='text-sm font-medium' htmlFor='bpjs-import-file'>
              File Excel (.xlsx)
            </label>
            <Input
              id='bpjs-import-file'
              type='file'
              accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
              disabled={isBusy}
              onChange={(event) => {
                void selectFile(event.target.files?.[0])
                event.target.value = ''
              }}
            />
            <p className='text-xs text-muted-foreground'>
              Kolom program hanya menerima YA atau TIDAK. Maksimal 2.000
              karyawan.
            </p>
          </div>

          {previewMutation.isPending ? (
            <div className='flex items-center justify-center gap-2 rounded-lg border py-12 text-sm text-muted-foreground'>
              <LoaderCircle className='size-4 animate-spin' /> Memvalidasi file
              dan akses site...
            </div>
          ) : preview ? (
            <ImportPreview preview={preview} />
          ) : null}
        </div>
        <DialogFooter className='border-t bg-muted/20 px-6 py-4'>
          <Button
            type='button'
            variant='outline'
            disabled={isBusy}
            onClick={() => close(false)}
          >
            Batal
          </Button>
          <Button
            type='button'
            disabled={!canExecute || isBusy}
            onClick={executeImport}
          >
            {importMutation.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <Upload />
            )}
            Simpan {preview?.valid ? `${preview.valid} karyawan` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportPreview({
  preview,
}: {
  preview: PayrollBpjsEnrollmentImportPreview
}) {
  const summary = useMemo(
    () => `${preview.valid} valid · ${preview.invalid} perlu diperbaiki`,
    [preview]
  )
  return (
    <section className='space-y-3'>
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          preview.invalid
            ? 'border-destructive/30 bg-destructive/5'
            : 'border-emerald-300/60 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20'
        }`}
      >
        <strong>{preview.total} baris terdeteksi.</strong> {summary}.{' '}
        {preview.invalid
          ? 'Perbaiki seluruh baris merah sebelum menyimpan.'
          : 'Seluruh data siap disimpan.'}
      </div>
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className='w-16'>Baris</TableHead>
              <TableHead>Karyawan</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Hasil validasi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.map((row) => (
              <TableRow
                key={`${row.rowNumber}-${row.employeeNumber}`}
                className={row.valid ? undefined : 'bg-destructive/5'}
              >
                <TableCell>{row.rowNumber}</TableCell>
                <TableCell>
                  <p className='font-medium'>{row.fullName || '-'}</p>
                  <p className='text-xs text-muted-foreground'>
                    {row.employeeNumber || '-'}
                  </p>
                </TableCell>
                <TableCell>{row.site || '-'}</TableCell>
                <TableCell>
                  {row.valid ? (
                    <Badge
                      variant='outline'
                      className='border-emerald-300 text-emerald-700 dark:text-emerald-300'
                    >
                      <CheckCircle2 /> Valid
                    </Badge>
                  ) : (
                    <div className='flex items-start gap-2 text-sm text-destructive'>
                      <XCircle className='mt-0.5 size-4 shrink-0' />
                      <span>{row.issues.join(' ')}</span>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

async function parseWorkbook(file: File): Promise<{
  rows: PayrollBpjsEnrollmentImportRow[]
  localPreview?: PayrollBpjsEnrollmentImportPreview
}> {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: true,
  })
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`Sheet ${sheetName} tidak ditemukan.`)
  const sheetRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
  })
  const importedHeaders = (sheetRows[0] ?? []).map((value) =>
    cleanCell(value).toUpperCase()
  )
  const missing = headers.filter((header) => !importedHeaders.includes(header))
  if (missing.length)
    throw new Error(`Header template tidak lengkap: ${missing.join(', ')}.`)
  const dataRows = sheetRows
    .slice(1)
    .filter((row) => row.some((value) => cleanCell(value)))
  if (!dataRows.length) throw new Error('File tidak memiliki baris data.')
  if (dataRows.length > 2000)
    throw new Error('Satu file maksimal 2.000 karyawan.')

  const parsedRows = dataRows.map(
    (row) =>
      Object.fromEntries(
        columns.map(([header, field]) => [
          field,
          cleanCell(row[importedHeaders.indexOf(header)]),
        ])
      ) as unknown as LocalRow
  )
  const previewRows: PayrollBpjsEnrollmentImportPreview['rows'] = []
  const validRows: PayrollBpjsEnrollmentImportRow[] = []
  parsedRows.forEach((row, index) => {
    const issues: string[] = []
    if (!row.employeeNumber) issues.push('EMPLOYEE_ID wajib diisi.')
    const programs = [
      row.healthEnabled,
      row.jhtEnabled,
      row.jkkEnabled,
      row.jkmEnabled,
      row.jpEnabled,
    ]
    programs.forEach((value, programIndex) => {
      if (parseYesNo(value) === undefined)
        issues.push(`${programHeaders[programIndex]} harus YA atau TIDAK.`)
    })
    if (row.reason.length < 5) issues.push('ALASAN minimal 5 karakter.')
    previewRows.push({
      rowNumber: index + 2,
      employeeNumber: row.employeeNumber,
      fullName: row.fullName || null,
      site: row.site || null,
      valid: issues.length === 0,
      issues,
    })
    if (!issues.length)
      validRows.push({
        employeeNumber: row.employeeNumber,
        healthEnabled: parseYesNo(row.healthEnabled) === true,
        jhtEnabled: parseYesNo(row.jhtEnabled) === true,
        jkkEnabled: parseYesNo(row.jkkEnabled) === true,
        jkmEnabled: parseYesNo(row.jkmEnabled) === true,
        jpEnabled: parseYesNo(row.jpEnabled) === true,
        reason: row.reason,
      })
  })
  const invalid = previewRows.filter((row) => !row.valid).length
  return {
    rows: invalid ? [] : validRows,
    localPreview: invalid
      ? {
          total: previewRows.length,
          valid: previewRows.length - invalid,
          invalid,
          rows: previewRows,
        }
      : undefined,
  }
}

function parseYesNo(value: string) {
  const normalized = value.trim().toUpperCase()
  if (normalized === 'YA') return true
  if (normalized === 'TIDAK') return false
  return undefined
}

function yesNo(value: boolean) {
  return value ? 'YA' : 'TIDAK'
}

function cleanCell(value: unknown) {
  return String(value ?? '').trim()
}

function createBatchKey() {
  return `bpjs-import-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
}
