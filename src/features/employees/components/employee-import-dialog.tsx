import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { employeeKeys, useEmployeeLookups } from '../data/queries'
import {
  importEmployees,
  previewEmployeeImport,
  type EmployeeImportPreview,
} from '../data/http-employee-repository'

const columns = [
  ['FULL_NAME', 'fullName'],
  ['NICKNAME', 'nickname'],
  ['EMPLOYEE_TYPE', 'employeeType'],
  ['SITE_CODE', 'site'],
  ['DEPARTMENT_CODE', 'departmentCode'],
  ['POSITION_CODE', 'positionCode'],
  ['WORK_GROUP_CODE', 'workGroupCode'],
  ['PRODUCTION_MODULE_CODE', 'productionModuleCode'],
  ['PRODUCTION_SECTION_CODE', 'productionSectionCode'],
  ['JOIN_DATE', 'joinDate'],
  ['PERMANENT_DATE', 'permanentDate'],
  ['GENDER', 'gender'],
  ['BIRTH_PLACE', 'birthPlace'],
  ['BIRTH_DATE', 'birthDate'],
  ['MARITAL_STATUS', 'maritalStatus'],
  ['RELIGION', 'religion'],
  ['NATIONAL_ID_NUMBER', 'nationalIdNumber'],
  ['FAMILY_CARD_NUMBER', 'familyCardNumber'],
  ['ADDRESS', 'address'],
  ['RTRW', 'rtrw'],
  ['KELURAHAN', 'kelurahan'],
  ['KECAMATAN', 'kecamatan'],
  ['CITY', 'city'],
  ['PROVINCE', 'province'],
  ['POSTAL_CODE', 'postalCode'],
  ['PHONE', 'phone'],
  ['EMAIL', 'email'],
  ['EMERGENCY_CONTACT_NAME', 'emergencyContactName'],
  ['EMERGENCY_CONTACT_PHONE', 'emergencyContactPhone'],
  ['EMERGENCY_CONTACT_RELATION', 'emergencyContactRelation'],
  ['BANK_NAME', 'bankName'],
  ['BANK_ACCOUNT_NUMBER', 'bankAccountNumber'],
  ['BANK_ACCOUNT_NAME', 'bankAccountName'],
  ['TAX_NUMBER', 'taxNumber'],
  ['BPJS_HEALTH_NUMBER', 'bpjsHealthNumber'],
  ['BPJS_EMPLOYMENT_NUMBER', 'bpjsEmploymentNumber'],
  ['NOTES', 'notes'],
] as const

const headers = columns.map(([header]) => header)

type ImportItem = Record<string, string>

export function EmployeeImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const lookups = useEmployeeLookups(open)
  const queryClient = useQueryClient()
  const [items, setItems] = useState<ImportItem[]>([])
  const [preview, setPreview] = useState<EmployeeImportPreview>()
  const previewMutation = useMutation({ mutationFn: previewEmployeeImport })
  const importMutation = useMutation({
    mutationFn: importEmployees,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: employeeKeys.all })
      toast.success(`${result.created.length} karyawan berhasil diimport.`)
      reset()
      onOpenChange(false)
    },
    onError: () => toast.error('Import gagal. Muat ulang preview lalu periksa kembali.'),
  })
  const isBusy = previewMutation.isPending || importMutation.isPending
  const canExecute = Boolean(preview && preview.invalid === 0 && items.length)

  function reset() {
    setItems([])
    setPreview(undefined)
    previewMutation.reset()
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
      const parsed = await parseWorkbook(file)
      setItems(parsed)
      setPreview(undefined)
      previewMutation.mutate(parsed, {
        onSuccess: setPreview,
        onError: () => toast.error('Preview import gagal dibuat.'),
      })
    } catch (error) {
      setItems([])
      setPreview(undefined)
      toast.error(error instanceof Error ? error.message : 'File Excel tidak dapat dibaca.')
    }
  }

  function downloadTemplate() {
    if (!lookups.data) {
      toast.error('Referensi master masih dimuat. Coba beberapa saat lagi.')
      return
    }
    const workbook = XLSX.utils.book_new()
    const data = XLSX.utils.aoa_to_sheet([headers])
    data['!cols'] = headers.map((header) => ({ wch: Math.max(15, header.length + 2) }))
    XLSX.utils.book_append_sheet(workbook, data, 'Karyawan')
    const referenceRows = [
      ['Jenis Referensi', 'SITE_CODE', 'CODE', 'Nama', 'Keterangan'],
      ...lookups.data.sites.map((item) => ['Site', item.code, item.code, item.name, 'Gunakan pada SITE_CODE']),
      ...lookups.data.departments.map((item) => ['Departemen', item.siteCode ?? '', item.code, item.name, 'Gunakan pada DEPARTMENT_CODE']),
      ...lookups.data.positions.map((item) => ['Jabatan', '', item.code, item.name, 'Gunakan pada POSITION_CODE']),
      ...lookups.data.workGroups.map((item) => ['Kelompok kerja', item.siteCode ?? '', item.code, item.name, 'Gunakan pada WORK_GROUP_CODE']),
      ...lookups.data.productionModules.map((item) => ['Modul produksi', item.siteCode, item.code, item.name, 'Gunakan bersama SECTION_CODE']),
      ...lookups.data.productionModuleSections.map((item) => ['Bagian produksi', item.siteCode, item.sectionCode, item.sectionName, `Modul: ${lookups.data.productionModules.find((module) => module.uid === item.moduleUid)?.code ?? '-'}`]),
    ]
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(referenceRows), 'Referensi')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['Panduan Import Karyawan'],
      ['Isi hanya sheet Karyawan. Jangan mengubah nama header.'],
      ['FULL_NAME, EMPLOYEE_TYPE, SITE_CODE, JOIN_DATE, dan GENDER wajib diisi.'],
      ['EMPLOYEE_TYPE hanya BORONGAN atau TRAINING.'],
      ['BORONGAN dan TRAINING wajib mengisi PRODUCTION_MODULE_CODE dan PRODUCTION_SECTION_CODE.'],
      ['Tanggal memakai format YYYY-MM-DD. GENDER: LAKI-LAKI atau PEREMPUAN.'],
      ['Status selalu dibuat Nonaktif; nomor karyawan dan barcode dibuat otomatis oleh sistem.'],
      ['Maksimal 200 baris. Semua baris harus valid sebelum import dapat dieksekusi.'],
    ]), 'Panduan')
    XLSX.writeFile(workbook, 'template-import-karyawan.xlsx')
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className='max-h-[calc(100svh-2rem)] max-w-6xl gap-0 overflow-hidden p-0' showCloseButton={!isBusy}>
        <DialogHeader className='border-b px-6 py-5'>
          <DialogTitle>Import Excel Karyawan</DialogTitle>
          <DialogDescription>
            Unggah, periksa seluruh validasi, lalu simpan sekaligus. Maksimal 200 karyawan per file.
          </DialogDescription>
        </DialogHeader>
        <div className='max-h-[calc(100svh-13rem)] space-y-5 overflow-y-auto px-6 py-5'>
          <div className='flex flex-col gap-3 rounded-lg border bg-muted/25 p-4 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex items-start gap-3'>
              <FileSpreadsheet className='mt-0.5 size-5 text-primary' />
              <div>
                <p className='font-medium'>Mulai dari template resmi</p>
                <p className='text-sm text-muted-foreground'>Template memuat kode master yang aktif sesuai akses site Anda.</p>
              </div>
            </div>
            <Button type='button' variant='outline' onClick={downloadTemplate} disabled={!lookups.data || isBusy}>
              <Download /> Download template
            </Button>
          </div>
          <div className='grid gap-2'>
            <label className='text-sm font-medium' htmlFor='employee-import-file'>File Excel (.xlsx)</label>
            <Input id='employee-import-file' type='file' accept='.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' disabled={isBusy} onChange={(event) => void selectFile(event.target.files?.[0])} />
            <p className='text-xs text-muted-foreground'>Foto, scan KTP/KK, serta kontrak tetap diunggah setelah karyawan dibuat.</p>
          </div>
          {previewMutation.isPending ? (
            <div className='flex items-center justify-center gap-2 rounded-lg border py-12 text-sm text-muted-foreground'><LoaderCircle className='size-4 animate-spin' /> Memvalidasi file dan referensi master...</div>
          ) : preview ? <ImportPreview preview={preview} /> : null}
        </div>
        <DialogFooter className='border-t bg-muted/20 px-6 py-4'>
          <Button type='button' variant='outline' disabled={isBusy} onClick={() => close(false)}>Batal</Button>
          <Button type='button' disabled={!canExecute || isBusy} onClick={() => importMutation.mutate(items)}>
            {importMutation.isPending ? <LoaderCircle className='animate-spin' /> : <Upload />}
            Eksekusi import {preview ? `(${preview.valid})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ImportPreview({ preview }: { preview: EmployeeImportPreview }) {
  const summary = useMemo(() => `${preview.valid} valid · ${preview.invalid} perlu diperbaiki`, [preview])
  return (
    <section className='space-y-3'>
      <div className={`rounded-lg border px-4 py-3 text-sm ${preview.invalid ? 'border-destructive/30 bg-destructive/5' : 'border-primary/25 bg-primary/5'}`}>
        <strong>{preview.total} baris terdeteksi.</strong> {summary}. {preview.invalid ? 'Tombol eksekusi dikunci sampai seluruh baris valid.' : 'Seluruh data siap diimport.'}
      </div>
      <div className='overflow-x-auto rounded-lg border'>
        <Table>
          <TableHeader><TableRow><TableHead className='w-16'>Baris</TableHead><TableHead>Karyawan</TableHead><TableHead>Jenis</TableHead><TableHead>Site</TableHead><TableHead>Hasil validasi</TableHead></TableRow></TableHeader>
          <TableBody>
            {preview.rows.map((row) => <TableRow key={row.rowNumber} className={row.valid ? undefined : 'bg-destructive/5'}>
              <TableCell>{row.rowNumber}</TableCell><TableCell className='font-medium'>{row.fullName || '-'}</TableCell><TableCell>{row.employeeType || '-'}</TableCell><TableCell>{row.site || '-'}</TableCell>
              <TableCell className={row.valid ? 'text-primary' : 'text-destructive'}>{row.valid ? 'Valid' : row.issues.join(' ')}</TableCell>
            </TableRow>)}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

async function parseWorkbook(file: File): Promise<ImportItem[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const sheet = workbook.Sheets.Karyawan
  if (!sheet) throw new Error('Sheet Karyawan tidak ditemukan.')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' })
  const importedHeaders = (rows[0] ?? []).map((value) => String(value).trim().toUpperCase())
  const missing = headers.filter((header) => !importedHeaders.includes(header))
  if (missing.length) throw new Error(`Header template tidak lengkap: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', ...' : ''}`)
  const dataRows = rows.slice(1).filter((row) => row.some((value) => String(value ?? '').trim()))
  if (!dataRows.length) throw new Error('File tidak memiliki baris data.')
  if (dataRows.length > 200) throw new Error('Satu file maksimal 200 karyawan.')
  return dataRows.map((row) =>
    Object.fromEntries(
      columns
        .map(([header, field]) => [field, cleanCell(row[importedHeaders.indexOf(header)])] as const)
        .filter(([, value]) => value)
    )
  )
}

function cleanCell(value: unknown) {
  return String(value ?? '').trim()
}
