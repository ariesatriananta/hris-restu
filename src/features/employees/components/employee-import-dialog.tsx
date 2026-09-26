import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
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
  importEmployees,
  previewEmployeeImport,
  type EmployeeImportPreview,
} from '../data/http-employee-repository'
import { employeeKeys, useEmployeeLookups } from '../data/queries'
import { educationLevelOptions } from '../education-level'
import {
  buildEmployeeImportValidationWorkbook,
  employeeImportTemplateHeaders,
  type EmployeeImportItem,
  parseEmployeeImportWorkbook,
} from './employee-import-workbook'
import { OnboardingSteps } from './onboarding-steps'

export function EmployeeImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const lookups = useEmployeeLookups(open)
  const queryClient = useQueryClient()
  const [items, setItems] = useState<EmployeeImportItem[]>([])
  const [preview, setPreview] = useState<EmployeeImportPreview>()
  const [createdEmployees, setCreatedEmployees] = useState<
    { uid: string; employeeNumber: string }[]
  >([])
  const previewMutation = useMutation({ mutationFn: previewEmployeeImport })
  const importMutation = useMutation({
    mutationFn: importEmployees,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: employeeKeys.all })
      toast.success(`${result.created.length} karyawan berhasil diimport.`)
      setCreatedEmployees(result.created)
    },
    onError: (error) =>
      toast.error(
        apiMessage(
          error,
          'Import dibatalkan. Muat ulang file untuk memvalidasi data terbaru.'
        )
      ),
  })
  const isBusy = previewMutation.isPending || importMutation.isPending
  const canExecute = Boolean(
    preview && preview.total > 0 && preview.invalid === 0 && items.length
  )

  function reset() {
    setItems([])
    setPreview(undefined)
    setCreatedEmployees([])
    previewMutation.reset()
    importMutation.reset()
  }

  function close(nextOpen: boolean) {
    if (!nextOpen && !isBusy) reset()
    onOpenChange(nextOpen)
  }

  async function selectFile(file?: File) {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      toast.error('Gunakan file Excel dengan format .xlsx.')
      return
    }
    try {
      const parsed = await parseEmployeeImportWorkbook(file)
      setItems(parsed)
      setPreview(undefined)
      previewMutation.mutate(parsed, {
        onSuccess: setPreview,
        onError: (error) => {
          setPreview(undefined)
          toast.error(apiMessage(error, 'Preview import Karyawan gagal.'))
        },
      })
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

  function downloadTemplate() {
    if (!lookups.data) {
      toast.error('Referensi master masih dimuat. Coba beberapa saat lagi.')
      return
    }
    const workbook = XLSX.utils.book_new()
    const data = XLSX.utils.aoa_to_sheet([employeeImportTemplateHeaders])
    data['!cols'] = employeeImportTemplateHeaders.map((header) => ({
      wch: Math.max(15, header.length + 2),
    }))
    data['!autofilter'] = { ref: 'A1:AL1' }
    XLSX.utils.book_append_sheet(workbook, data, 'Karyawan')

    const referenceRows = [
      ['Jenis Referensi', 'SITE_CODE', 'CODE', 'Nama', 'Keterangan'],
      ...lookups.data.sites.map((item) => [
        'Site',
        item.code,
        item.code,
        item.name,
        'Gunakan pada SITE_CODE',
      ]),
      ...lookups.data.departments.map((item) => [
        'Departemen',
        item.siteCode ?? '',
        item.code,
        item.name,
        'Gunakan pada DEPARTMENT_CODE',
      ]),
      ...lookups.data.positions.map((item) => [
        'Jabatan',
        '',
        item.code,
        item.name,
        'Gunakan pada POSITION_CODE',
      ]),
      ...lookups.data.productionModules.map((item) => [
        'Modul produksi',
        item.siteCode,
        item.code,
        item.name,
        'Gunakan bersama PRODUCTION_SECTION_CODE',
      ]),
      ...lookups.data.productionModuleSections.map((item) => [
        'Bagian produksi',
        item.siteCode,
        item.sectionCode,
        item.sectionName,
        `Modul: ${lookups.data.productionModules.find((module) => module.uid === item.moduleUid)?.code ?? '-'}`,
      ]),
      ...educationLevelOptions.map((item) => [
        'Pendidikan terakhir',
        '',
        item.value,
        item.label,
        'Gunakan pada EDUCATION_LEVEL',
      ]),
    ]
    const references = XLSX.utils.aoa_to_sheet(referenceRows)
    references['!cols'] = [
      { wch: 24 },
      { wch: 18 },
      { wch: 28 },
      { wch: 36 },
      { wch: 48 },
    ]
    references['!autofilter'] = { ref: `A1:E${referenceRows.length}` }
    XLSX.utils.book_append_sheet(workbook, references, 'Referensi')

    const guide = XLSX.utils.aoa_to_sheet([
      ['Panduan Import Karyawan'],
      ['1. Isi hanya sheet Karyawan. Jangan mengubah nama header.'],
      ['2. Header bertanda * wajib diisi. Header tanpa * bersifat opsional.'],
      ['3. EMPLOYEE_TYPE: BORONGAN, HARIAN, BULANAN, atau TRAINING.'],
      [
        '4. DEPARTMENT_CODE, POSITION_CODE, PRODUCTION_MODULE_CODE, dan PRODUCTION_SECTION_CODE wajib sesuai kode pada sheet Referensi.',
      ],
      [
        '5. Tanggal menerima format DD/MM/YYYY atau YYYY-MM-DD. GENDER: LAKI-LAKI atau PEREMPUAN.',
      ],
      [
        '6. EDUCATION_LEVEL diisi memakai kode pendidikan pada sheet Referensi.',
      ],
      [
        '7. Status awal selalu Nonaktif; nomor karyawan dan barcode dibuat otomatis oleh sistem.',
      ],
      [
        '8. Maksimal 200 baris. Seluruh baris harus valid sebelum import dapat dijalankan.',
      ],
      [
        '9. Foto, scan KTP/KK, dan kontrak dapat dilengkapi setelah karyawan berhasil dibuat.',
      ],
    ])
    guide['!cols'] = [{ wch: 115 }]
    XLSX.utils.book_append_sheet(workbook, guide, 'Panduan')
    XLSX.writeFile(workbook, 'template-import-karyawan.xlsx')
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className='grid max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-6xl'
        showCloseButton={!isBusy}
      >
        <DialogHeader className='border-b px-6 py-5'>
          <DialogTitle>Import Data Karyawan</DialogTitle>
          <DialogDescription>
            Unduh template, isi data karyawan, lalu periksa hasil validasi
            sebelum menyimpan. Maksimal 200 karyawan per file.
          </DialogDescription>
        </DialogHeader>

        {createdEmployees.length ? (
          <ImportSuccess
            createdEmployees={createdEmployees}
            onContinue={() => {
              const employeeUids = createdEmployees
                .map((employee) => employee.uid)
                .join(',')
              reset()
              onOpenChange(false)
              navigate({
                to: '/karyawan/pkwt/tambah-multiple',
                search: {
                  returnTo: '/karyawan/data-karyawan',
                  employeeUids,
                  onboarding: true,
                },
              })
            }}
          />
        ) : (
          <div className='grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-4 overflow-hidden px-6 py-4'>
            <section className='flex flex-col gap-3 rounded-lg border bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex items-start gap-3'>
                <FileSpreadsheet className='mt-0.5 size-5 shrink-0 text-primary' />
                <div>
                  <p className='font-medium'>Mulai dari template resmi</p>
                  <p className='text-sm text-muted-foreground'>
                    Template berisi kode master aktif sesuai akses site Anda.
                    Kolom bertanda <strong>*</strong> wajib diisi.
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

            <div className='grid gap-1.5'>
              <label
                className='text-sm font-medium'
                htmlFor='employee-import-file'
              >
                File Excel (.xlsx) <span className='text-destructive'>*</span>
              </label>
              <Input
                id='employee-import-file'
                type='file'
                accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                disabled={isBusy}
                onChange={(event) => {
                  void selectFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
              <p className='text-xs text-muted-foreground'>
                Maksimal 200 baris. Seluruh baris harus valid sebelum import
                dapat dijalankan.
              </p>
            </div>

            <div className='min-h-0'>
              {previewMutation.isPending ? (
                <div className='grid h-full min-h-36 place-items-center rounded-lg border text-sm text-muted-foreground'>
                  <span className='flex items-center gap-2'>
                    <LoaderCircle className='size-4 animate-spin' /> Memeriksa
                    data dan referensi master...
                  </span>
                </div>
              ) : preview ? (
                <ImportPreview preview={preview} items={items} />
              ) : (
                <div className='grid h-full min-h-28 place-items-center rounded-lg border border-dashed px-4 text-center text-sm text-muted-foreground'>
                  Upload file untuk melihat hasil validasi sebelum import.
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className='border-t bg-muted/20 px-6 py-4'>
          {createdEmployees.length ? (
            <>
              <Button
                type='button'
                variant='outline'
                onClick={() => close(false)}
              >
                Selesai di sini
              </Button>
              <Button
                type='button'
                onClick={() => {
                  const employeeUids = createdEmployees
                    .map((employee) => employee.uid)
                    .join(',')
                  reset()
                  onOpenChange(false)
                  navigate({
                    to: '/karyawan/pkwt/tambah-multiple',
                    search: {
                      returnTo: '/karyawan/data-karyawan',
                      employeeUids,
                      onboarding: true,
                    },
                  })
                }}
              >
                Lanjut buat kontrak <ArrowRight />
              </Button>
            </>
          ) : (
            <>
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
                onClick={() => importMutation.mutate(items)}
              >
                {importMutation.isPending ? (
                  <LoaderCircle className='animate-spin' />
                ) : (
                  <Upload />
                )}
                Import {preview?.valid ? `${preview.valid} karyawan` : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportSuccess({
  createdEmployees,
  onContinue,
}: {
  createdEmployees: { uid: string; employeeNumber: string }[]
  onContinue: () => void
}) {
  return (
    <div className='min-h-0 overflow-y-auto px-6 py-6'>
      <div className='mx-auto grid max-w-2xl gap-5'>
        <div className='rounded-xl border border-emerald-300/60 bg-emerald-50/70 p-5 dark:border-emerald-900 dark:bg-emerald-950/20'>
          <div className='flex items-start gap-3'>
            <CheckCircle2 className='mt-0.5 size-6 shrink-0 text-emerald-600' />
            <div>
              <h3 className='font-semibold'>Import karyawan berhasil</h3>
              <p className='mt-1 text-sm text-muted-foreground'>
                {createdEmployees.length} karyawan sudah dibuat sebagai
                Nonaktif. Lanjutkan untuk membuat kontrak sekaligus dan
                mengaktifkan karyawan setelah diperiksa.
              </p>
            </div>
          </div>
        </div>

        <OnboardingSteps activeStep={1} />

        <div className='rounded-lg border p-4'>
          <p className='text-sm font-medium'>Nomor karyawan yang dibuat</p>
          <div className='mt-3 flex max-h-40 flex-wrap gap-2 overflow-y-auto'>
            {createdEmployees.map((employee) => (
              <Badge key={employee.uid} variant='secondary'>
                {employee.employeeNumber}
              </Badge>
            ))}
          </div>
        </div>

        <Button className='sm:hidden' onClick={onContinue}>
          Lanjut buat kontrak <ArrowRight />
        </Button>
      </div>
    </div>
  )
}

function ImportPreview({
  preview,
  items,
}: {
  preview: EmployeeImportPreview
  items: EmployeeImportItem[]
}) {
  const summary = useMemo(
    () => `${preview.valid} valid · ${preview.invalid} perlu diperbaiki`,
    [preview]
  )

  function downloadValidation() {
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    XLSX.writeFile(
      buildEmployeeImportValidationWorkbook(items, preview),
      `hasil-validasi-import-karyawan-${stamp}.xlsx`
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
              <TableHead>Jenis</TableHead>
              <TableHead>Site</TableHead>
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
                <TableCell className='min-w-52 font-medium'>
                  {row.fullName || '—'}
                </TableCell>
                <TableCell>{row.employeeType || '—'}</TableCell>
                <TableCell>{row.site || '—'}</TableCell>
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
                          ? 'Data siap diimport.'
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

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
