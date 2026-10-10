import { useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  Download,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react'
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
import {
  useDeleteEmployeeBatch,
  usePreviewEmployeeBatchDelete,
} from '../data/queries'
import type {
  EmployeeBatchDeletionFilters,
  EmployeeBatchDeletionPreview,
} from '../domain'

const initialFilters: EmployeeBatchDeletionFilters = {
  site: 'ALL',
  employeeType: 'ALL',
  employeeStatus: 'ALL',
  search: '',
  page: 1,
  pageSize: 100,
}

export function EmployeeBatchDeleteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [filters, setFilters] = useState(initialFilters)
  const [summary, setSummary] = useState<EmployeeBatchDeletionPreview>()
  const [selected, setSelected] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const version = useRef(0)
  const submitting = useRef(false)
  const preview = usePreviewEmployeeBatchDelete()
  const remove = useDeleteEmployeeBatch()
  const invalidatePreview = () => {
    version.current += 1
    setSummary(undefined)
    setSelected([])
    setConfirmation('')
    setError('')
    setLoading(false)
  }
  const load = (input = filters) => {
    invalidatePreview()
    const request = version.current
    setLoading(true)
    preview.mutate(
      { ...input, search: input.search?.trim() || undefined },
      {
        onSuccess: (result) => {
          if (version.current === request) setSummary(result)
        },
        onError: (failure) => {
          if (version.current === request)
            setError(apiMessage(failure, 'Ringkasan karyawan gagal dimuat.'))
        },
        onSettled: () => {
          if (version.current === request) setLoading(false)
        },
      }
    )
  }
  useEffect(() => {
    if (open) {
      // Reset destructive confirmation when an externally controlled dialog opens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilters(initialFilters)
      setReason('')
      setConfirmation('')
      load(initialFilters)
    } else invalidatePreview()
    return () => {
      version.current += 1
    }
    // Each opening starts a fresh preview; request versions guard late responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  const change = (patch: Partial<EmployeeBatchDeletionFilters>) => {
    setFilters((current) => ({ ...current, ...patch, page: 1 }))
    invalidatePreview()
  }
  const changePage = (page: number) => {
    const next = { ...filters, page }
    setFilters(next)
    load(next)
  }
  const ready = summary?.rows.filter((row) => row.canDelete) ?? []
  const allSelected =
    ready.length > 0 &&
    ready.every((row) => selected.includes(row.employee.uid))
  const validReason = reason.trim().length >= 5 && reason.trim().length <= 500
  const valid =
    Boolean(summary) &&
    !loading &&
    selected.length > 0 &&
    selected.length <= 200 &&
    validReason &&
    confirmation.trim().toUpperCase() === 'HAPUS' &&
    !remove.isPending
  const submit = () => {
    if (!valid || submitting.current) return
    submitting.current = true
    setError('')
    remove.mutate(
      { employeeUids: selected, reason: reason.trim(), confirmation: 'HAPUS' },
      {
        onSuccess: (result) => {
          toast.success(
            `${result.deletedEmployees} karyawan berhasil dihapus permanen.`
          )
          onOpenChange(false)
        },
        onError: (failure) => {
          invalidatePreview()
          setError(
            apiMessage(
              failure,
              'Penghapusan batch gagal. Muat ulang ringkasan sebelum mencoba lagi.'
            )
          )
        },
        onSettled: () => {
          submitting.current = false
        },
      }
    )
  }
  const downloadValidation = async () => {
    if (!summary?.rows.length || loading || remove.isPending || downloading)
      return
    const snapshot = summary
    setDownloading(true)
    try {
      const XLSX = await import('xlsx')
      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.aoa_to_sheet([
        [
          'ID Karyawan',
          'Nama Karyawan',
          'Site',
          'Kesiapan',
          'Blocker',
          'Dampak Administratif',
          'Total Record Terdampak',
        ],
        ...snapshot.rows.map((row) => [
          row.employee.employeeNumber,
          row.employee.fullName,
          row.employee.site,
          row.canDelete ? 'Siap dihapus' : 'Terblokir',
          row.blockers.join('\n') || '-',
          row.dependencies
            .filter((item) => item.count > 0)
            .map(
              (item) =>
                `${item.label}: ${item.count} (${item.action === 'UNLINK' ? 'relasi dilepas' : 'dihapus'})`
            )
            .join('\n') || 'Tidak ada data tambahan',
          row.totalAffectedRecords,
        ]),
      ])
      worksheet['!cols'] = [20, 32, 14, 18, 60, 60, 24].map((wch) => ({ wch }))
      worksheet['!autofilter'] = { ref: worksheet['!ref']! }
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Hasil Pemeriksaan')
      const info = XLSX.utils.aoa_to_sheet([
        [
          'Cakupan',
          'Halaman preview yang sudah dimuat, termasuk siap dan terblokir',
        ],
        ['Site', filters.site],
        ['Jenis', filters.employeeType],
        ['Status', filters.employeeStatus],
        ['Pencarian', filters.search || '-'],
        ['Halaman', snapshot.page],
        ['Baris per halaman', snapshot.pageSize],
        ['Jumlah diekspor', snapshot.rows.length],
        ['Total hasil filter', snapshot.total],
        ['Waktu download', new Date().toLocaleString('id-ID')],
        [
          'Catatan',
          'Hasil preview; kesiapan diperiksa ulang saat penghapusan.',
        ],
      ])
      info['!cols'] = [{ wch: 24 }, { wch: 80 }]
      XLSX.utils.book_append_sheet(workbook, info, 'Informasi')
      XLSX.writeFile(
        workbook,
        `hasil-pemeriksaan-hapus-karyawan-halaman-${snapshot.page}.xlsx`
      )
    } catch {
      toast.error('Hasil pemeriksaan gagal diunduh. Coba lagi.')
    } finally {
      setDownloading(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !remove.isPending && onOpenChange(next)}
    >
      <DialogContent
        showCloseButton={!remove.isPending}
        className='grid h-[92dvh] max-h-[880px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-5xl'
      >
        <DialogHeader>
          <DialogTitle>Hapus Karyawan Batch</DialogTitle>
          <DialogDescription>
            Khusus Super Admin. Hapus permanen data salah input atau data uji
            yang belum memiliki fakta operasional.
          </DialogDescription>
        </DialogHeader>
        <div className='min-h-0 space-y-3 overflow-y-auto pr-1'>
          <fieldset
            disabled={remove.isPending}
            className='grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-3'
          >
            <FilterSelect
              label='Site'
              value={filters.site}
              onChange={(site) =>
                change({ site: site as EmployeeBatchDeletionFilters['site'] })
              }
              options={[
                ['ALL', 'Semua Site'],
                ['JEPARA', 'Jepara'],
                ['SEMARANG', 'Semarang'],
                ['KLATEN', 'Klaten'],
              ]}
            />
            <FilterSelect
              label='Jenis karyawan'
              value={filters.employeeType}
              onChange={(employeeType) =>
                change({
                  employeeType:
                    employeeType as EmployeeBatchDeletionFilters['employeeType'],
                })
              }
              options={[
                ['ALL', 'Semua jenis'],
                ['BORONGAN', 'Borongan'],
                ['HARIAN', 'Harian'],
                ['BULANAN', 'Bulanan'],
                ['TRAINING', 'Training'],
              ]}
            />
            <FilterSelect
              label='Status karyawan'
              value={filters.employeeStatus}
              onChange={(employeeStatus) =>
                change({
                  employeeStatus:
                    employeeStatus as EmployeeBatchDeletionFilters['employeeStatus'],
                })
              }
              options={[
                ['ALL', 'Semua status'],
                ['ACTIVE', 'Aktif'],
                ['LEAVE', 'Cuti'],
                ['RESIGNED', 'Resign'],
                ['INACTIVE', 'Tidak aktif'],
              ]}
            />
            <div className='grid gap-1 sm:col-span-2'>
              <Label htmlFor='employee-batch-search'>Cari karyawan</Label>
              <Input
                id='employee-batch-search'
                value={filters.search}
                onChange={(event) => change({ search: event.target.value })}
                placeholder='Nama atau ID karyawan'
                maxLength={100}
              />
            </div>
            <Button
              variant='outline'
              disabled={loading || remove.isPending}
              onClick={() => load()}
              className='self-end'
            >
              {loading ? <Loader2 className='animate-spin' /> : <RefreshCw />}{' '}
              Muat ringkasan
            </Button>
          </fieldset>
          {error && (
            <p
              role='alert'
              className='rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive'
            >
              {error}
            </p>
          )}
          <div className='max-h-[38dvh] overflow-auto rounded-lg border'>
            <Table className='min-w-[760px] table-fixed'>
              <TableHeader className='sticky top-0 z-10 bg-background'>
                <TableRow>
                  <TableHead className='w-10 text-center'>
                    <Checkbox
                      aria-label='Pilih semua karyawan siap di halaman ini'
                      disabled={!ready.length || remove.isPending || loading}
                      checked={allSelected}
                      onCheckedChange={(checked) =>
                        setSelected(
                          checked ? ready.map((row) => row.employee.uid) : []
                        )
                      }
                    />
                  </TableHead>
                  <TableHead className='w-48'>Karyawan</TableHead>
                  <TableHead className='w-24'>Site</TableHead>
                  <TableHead>Dampak administratif</TableHead>
                  <TableHead>Kesiapan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className='h-24 text-center'>
                      <Loader2
                        aria-label='Memuat ringkasan'
                        className='mx-auto size-5 animate-spin'
                      />
                    </TableCell>
                  </TableRow>
                ) : summary?.rows.length ? (
                  summary.rows.map((row) => (
                    <TableRow key={row.employee.uid}>
                      <TableCell className='text-center'>
                        <Checkbox
                          aria-label={`Pilih ${row.employee.fullName}`}
                          checked={selected.includes(row.employee.uid)}
                          disabled={!row.canDelete || remove.isPending}
                          onCheckedChange={(checked) =>
                            setSelected((current) =>
                              checked
                                ? [
                                    ...new Set([...current, row.employee.uid]),
                                  ].slice(0, 200)
                                : current.filter(
                                    (uid) => uid !== row.employee.uid
                                  )
                            )
                          }
                        />
                      </TableCell>
                      <TableCell className='align-top break-words whitespace-normal'>
                        <span className='font-medium'>
                          {row.employee.fullName}
                        </span>
                        <div className='text-[11px] text-muted-foreground'>
                          {row.employee.employeeNumber}
                        </div>
                      </TableCell>
                      <TableCell>{row.employee.site}</TableCell>
                      <TableCell className='align-top text-[11px] break-words whitespace-normal'>
                        {row.dependencies.some((item) => item.count > 0)
                          ? row.dependencies
                              .filter((item) => item.count > 0)
                              .map((item) => (
                                <div key={item.key}>
                                  {item.label}: {item.count} (
                                  {item.action === 'UNLINK'
                                    ? 'relasi dilepas'
                                    : 'dihapus'}
                                  )
                                </div>
                              ))
                          : 'Tidak ada data tambahan'}
                      </TableCell>
                      <TableCell className='align-top text-[11px] break-words whitespace-normal'>
                        {row.canDelete ? (
                          <span className='font-medium text-emerald-700 dark:text-emerald-400'>
                            Siap dihapus
                          </span>
                        ) : (
                          row.blockers.map((blocker, index) => (
                            <div key={index} className='text-destructive'>
                              {blocker}
                            </div>
                          ))
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className='h-24 text-center text-muted-foreground'
                    >
                      {summary
                        ? 'Tidak ada karyawan sesuai filter.'
                        : 'Muat ringkasan untuk memeriksa kesiapan karyawan.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {summary && (
            <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground'>
              <span>
                {selected.length} dipilih · {summary.total} karyawan · Halaman{' '}
                {summary.page} dari{' '}
                {Math.max(1, Math.ceil(summary.total / summary.pageSize))}
              </span>
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={
                    !summary.rows.length ||
                    loading ||
                    remove.isPending ||
                    downloading
                  }
                  onClick={() => void downloadValidation()}
                >
                  {downloading ? (
                    <Loader2 className='animate-spin' />
                  ) : (
                    <Download />
                  )}
                  Download halaman ini
                </Button>
                <FilterSelect
                  label='Baris per halaman'
                  value={String(filters.pageSize)}
                  onChange={(value) => change({ pageSize: Number(value) })}
                  options={[
                    ['50', '50'],
                    ['100', '100'],
                    ['200', '200'],
                  ]}
                />
                <Button
                  size='sm'
                  variant='outline'
                  disabled={summary.page <= 1 || loading || remove.isPending}
                  onClick={() => changePage(summary.page - 1)}
                >
                  Sebelumnya
                </Button>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={
                    summary.page * summary.pageSize >= summary.total ||
                    loading ||
                    remove.isPending
                  }
                  onClick={() => changePage(summary.page + 1)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          )}
          <div className='flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive'>
            <AlertTriangle className='size-4 shrink-0' />
            <p>
              {selected.length
                ? `${selected.length} karyawan akan dihapus permanen. `
                : ''}
              Kontrak, termasuk ACTIVE, dan histori administratif ikut dihapus.
              Arsip rekrutmen, dokumen hasil generate, dan audit dipertahankan;
              relasi karyawan dilepas. Attendance, Produksi, dan Payroll tidak
              otomatis dihapus. Satu target terblokir membatalkan seluruh batch.
              Maksimal 200 karyawan per batch.
            </p>
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='grid gap-1.5'>
              <Label htmlFor='employee-batch-reason'>Alasan penghapusan</Label>
              <Textarea
                id='employee-batch-reason'
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={remove.isPending}
                rows={2}
                maxLength={500}
                placeholder='Contoh: Data lama salah input dan akan diimpor ulang.'
              />
              <p className='text-xs text-muted-foreground'>
                Minimal 5 karakter, disimpan pada Audit Trail.
              </p>
            </div>
            <div className='grid content-start gap-1.5'>
              <Label htmlFor='employee-batch-confirmation'>
                Ketik HAPUS untuk konfirmasi
              </Label>
              <Input
                id='employee-batch-confirmation'
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                disabled={remove.isPending}
                autoComplete='off'
                placeholder='HAPUS'
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            disabled={remove.isPending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button variant='destructive' disabled={!valid} onClick={submit}>
            {remove.isPending ? (
              <Loader2 className='animate-spin' />
            ) : (
              <Trash2 />
            )}{' '}
            Hapus {selected.length || ''} karyawan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[][]
}) {
  return (
    <label className='grid gap-1 text-xs'>
      <span className='font-medium'>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([key, name]) => (
            <SelectItem key={key} value={key}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}
function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? error.response?.data?.message || fallback
    : fallback
}
