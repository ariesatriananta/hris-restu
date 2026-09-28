import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
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
import {
  useEmployeeLookups,
  useImportMutations,
  usePreviewMutationImport,
} from '../data/queries'
import type { MutationImportItem, MutationImportPreview } from '../domain'
import {
  buildMutationValidationWorkbook,
  mutationImportTemplateHeaders,
  parseMutationImportWorkbook,
} from './mutation-import-workbook'

const mutationType = 'SITE_MUTATION' as const

export function MutationImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const lookups = useEmployeeLookups(open)
  const previewMutation = usePreviewMutationImport()
  const importMutation = useImportMutations()
  const [reason, setReason] = useState('')
  const [items, setItems] = useState<MutationImportItem[]>([])
  const [preview, setPreview] = useState<MutationImportPreview>()
  const isBusy = previewMutation.isPending || importMutation.isPending
  const canExecute = Boolean(
    preview &&
    preview.total > 0 &&
    preview.invalid === 0 &&
    reason.trim().length >= 3
  )

  function reset() {
    setReason('')
    setItems([])
    setPreview(undefined)
    previewMutation.reset()
    importMutation.reset()
  }

  function changeOpen(next: boolean) {
    if (!next && !isBusy) reset()
    onOpenChange(next)
  }

  function downloadTemplate() {
    if (!lookups.data) {
      toast.error('Referensi master masih dimuat. Coba beberapa saat lagi.')
      return
    }
    const workbook = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([mutationImportTemplateHeaders])
    sheet['!cols'] = [
      { wch: 24 },
      { wch: 34 },
      { wch: 22 },
      { wch: 28 },
      { wch: 35 },
      { wch: 36 },
      { wch: 18 },
    ]
    sheet['!autofilter'] = { ref: 'A1:G1' }
    XLSX.utils.book_append_sheet(workbook, sheet, 'Mutasi')

    const referenceRows = [
      ['Jenis Referensi', 'SITE_CODE', 'CODE', 'Nama', 'Keterangan'],
      ...lookups.data.sites.map((item) => [
        'Site tujuan',
        item.code,
        item.code,
        item.name,
        'TARGET_SITE_CODE',
      ]),
      ...lookups.data.departments.map((item) => [
        'Departemen',
        item.siteCode ?? '',
        item.code,
        item.name,
        'TARGET_DEPARTMENT_CODE (opsional)',
      ]),
      ...lookups.data.productionModules.map((item) => [
        'Modul produksi',
        item.siteCode,
        item.code,
        item.name,
        'TARGET_PRODUCTION_MODULE_CODE',
      ]),
      ...lookups.data.productionModuleSections.map((item) => [
        'Bagian produksi',
        item.siteCode,
        item.sectionCode,
        item.sectionName,
        `Modul ${lookups.data.productionModules.find((module) => module.uid === item.moduleUid)?.code ?? '-'}`,
      ]),
    ]
    const references = XLSX.utils.aoa_to_sheet(referenceRows)
    references['!cols'] = [
      { wch: 24 },
      { wch: 18 },
      { wch: 30 },
      { wch: 38 },
      { wch: 42 },
    ]
    references['!autofilter'] = { ref: `A1:E${referenceRows.length}` }
    XLSX.utils.book_append_sheet(workbook, references, 'Referensi')

    const guide = XLSX.utils.aoa_to_sheet([
      ['Panduan Import Mutasi Site'],
      ['1. Isi sheet Mutasi. Kolom bertanda * wajib diisi.'],
      [
        '2. EMPLOYEE_NAME hanya untuk membantu pemeriksaan dan boleh dikosongkan.',
      ],
      [
        '3. Gunakan kode site, departemen, modul, dan bagian pada sheet Referensi.',
      ],
      [
        '4. TARGET_DEPARTMENT_CODE boleh kosong bila departemen tujuan tidak diperlukan.',
      ],
      ['5. EFFECTIVE_DATE menerima DD/MM/YYYY atau YYYY-MM-DD.'],
      [
        '6. Tanggal lampau atau hari ini diterapkan langsung; tanggal mendatang dijadwalkan. Tanggal lampau hanya dapat diproses bila belum memiliki transaksi terkait.',
      ],
      [
        '7. Maksimal 200 karyawan dan seluruh baris harus valid sebelum diproses.',
      ],
    ])
    guide['!cols'] = [{ wch: 110 }]
    XLSX.utils.book_append_sheet(workbook, guide, 'Panduan')
    XLSX.writeFile(workbook, 'template-import-mutasi-site.xlsx')
  }

  async function selectFile(file?: File) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Gunakan file Excel dengan format .xlsx.')
      return
    }
    try {
      const parsed = await parseMutationImportWorkbook(file)
      setItems(parsed)
      setPreview(undefined)
      previewMutation.mutate(
        {
          mutationType,
          reason: reason.trim() || 'Preview import mutasi site',
          items: parsed,
        },
        {
          onSuccess: setPreview,
          onError: (error) => {
            setPreview(undefined)
            toast.error(apiMessage(error, 'Validasi file mutasi gagal.'))
          },
        }
      )
    } catch (error) {
      setItems([])
      setPreview(undefined)
      toast.error(
        error instanceof Error
          ? error.message
          : 'File Excel tidak dapat dibaca.'
      )
    }
  }

  function executeImport() {
    if (!canExecute) return
    importMutation.mutate(
      { mutationType, reason: reason.trim(), items },
      {
        onSuccess: (result) => {
          toast.success(
            `${result.applied} mutasi diterapkan dan ${result.scheduled} mutasi dijadwalkan.`
          )
          reset()
          onOpenChange(false)
        },
        onError: (error) =>
          toast.error(
            apiMessage(
              error,
              'Import dibatalkan. Validasi ulang file lalu coba kembali.'
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
          <DialogTitle>Import Excel Mutasi</DialogTitle>
          <DialogDescription>
            Unduh template kosong, isi mutasi, lalu periksa hasil validasinya.
            Tanggal lampau hanya diproses jika belum memiliki transaksi terkait.
          </DialogDescription>
        </DialogHeader>

        <div className='grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-4 overflow-hidden px-6 py-4'>
          <section className='flex flex-col gap-3 rounded-lg border bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-start gap-3'>
              <FileSpreadsheet className='mt-0.5 size-5 shrink-0 text-primary' />
              <div>
                <p className='font-medium'>Template mutasi site</p>
                <p className='text-sm text-muted-foreground'>
                  Data karyawan tidak diisi otomatis. Kolom bertanda * wajib
                  diisi.
                </p>
              </div>
            </div>
            <Button
              type='button'
              variant='outline'
              onClick={downloadTemplate}
              disabled={!lookups.data || isBusy}
            >
              {lookups.isLoading ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Download />
              )}
              Unduh template
            </Button>
          </section>

          <div className='grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_minmax(18rem,1fr)]'>
            <div className='grid content-start gap-1.5'>
              <label className='text-sm font-medium'>Jenis mutasi</label>
              <Select value={mutationType} disabled={isBusy}>
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='SITE_MUTATION'>Mutasi Site</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='grid content-start gap-1.5'>
              <label
                className='text-sm font-medium'
                htmlFor='mutation-import-reason'
              >
                Alasan <span className='text-destructive'>*</span>
              </label>
              <Textarea
                id='mutation-import-reason'
                className='min-h-9 resize-none'
                rows={1}
                value={reason}
                maxLength={255}
                disabled={isBusy}
                placeholder='Contoh: Penyesuaian penempatan operasional.'
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div className='grid content-start gap-1.5'>
              <label
                className='text-sm font-medium'
                htmlFor='mutation-import-file'
              >
                File Excel (.xlsx) <span className='text-destructive'>*</span>
              </label>
              <Input
                id='mutation-import-file'
                type='file'
                accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                disabled={isBusy}
                onChange={(event) => {
                  void selectFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </div>
          </div>

          <div className='min-h-0'>
            {previewMutation.isPending ? (
              <div className='grid h-full min-h-32 place-items-center rounded-lg border text-sm text-muted-foreground'>
                <span className='flex items-center gap-2'>
                  <LoaderCircle className='size-4 animate-spin' /> Memeriksa
                  data mutasi...
                </span>
              </div>
            ) : preview ? (
              <MutationImportPreviewTable preview={preview} items={items} />
            ) : (
              <div className='grid h-full min-h-28 place-items-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground'>
                Upload file untuk melihat hasil validasi sebelum diproses.
              </div>
            )}
          </div>
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
            disabled={!canExecute || isBusy}
            onClick={executeImport}
          >
            {importMutation.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <Upload />
            )}
            Proses {preview?.valid ? `${preview.valid} mutasi` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MutationImportPreviewTable({
  preview,
  items,
}: {
  preview: MutationImportPreview
  items: MutationImportItem[]
}) {
  const summary = useMemo(
    () => `${preview.valid} valid · ${preview.invalid} perlu diperbaiki`,
    [preview]
  )

  function downloadValidation() {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    XLSX.writeFile(
      buildMutationValidationWorkbook(items, preview),
      `hasil-validasi-import-mutasi-${stamp}.xlsx`
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
              <TableHead>Karyawan</TableHead>
              <TableHead>Perpindahan site</TableHead>
              <TableHead>Tanggal efektif</TableHead>
              <TableHead>Validasi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.map((row) => (
              <TableRow
                key={row.rowNumber}
                className={row.valid ? undefined : 'bg-destructive/5'}
              >
                <TableCell className='text-center'>{row.rowNumber}</TableCell>
                <TableCell className='min-w-48'>
                  <div className='font-medium'>{row.employeeName || '—'}</div>
                  <div className='text-muted-foreground'>
                    {row.employeeNumber || '—'}
                  </div>
                </TableCell>
                <TableCell className='min-w-40'>
                  {row.sourceSite || '—'} → {row.targetSite || '—'}
                </TableCell>
                <TableCell className='whitespace-nowrap'>
                  {formatDate(row.effectiveFrom)}
                </TableCell>
                <TableCell className='min-w-72'>
                  <div className='flex items-start gap-2'>
                    {row.valid ? (
                      <CheckCircle2 className='mt-0.5 size-4 shrink-0 text-emerald-600' />
                    ) : (
                      <XCircle className='mt-0.5 size-4 shrink-0 text-destructive' />
                    )}
                    <div>
                      <Badge variant={row.valid ? 'outline' : 'destructive'}>
                        {row.valid ? 'Valid' : 'Perlu diperbaiki'}
                      </Badge>
                      <p className='mt-1 text-muted-foreground'>
                        {row.valid
                          ? 'Data siap diproses.'
                          : row.issues.join(' ')}
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

function formatDate(value?: string) {
  if (!value) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
