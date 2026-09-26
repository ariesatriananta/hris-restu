import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardPlus,
  FileSpreadsheet,
  Loader2,
  MoreHorizontal,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DatePicker } from '@/components/date-picker'
import { AttendanceImportDialog } from './attendance-import-dialog'
import {
  useDeleteAttendanceBatch,
  usePreviewAttendanceBatchDelete,
  usePreviewAttendanceBatchInput,
  useRunAttendanceBatchInput,
} from './data/queries'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'
import type {
  AttendanceBatchMode,
  AttendanceBatchSite,
  AttendanceSite,
} from './domain'

export function AttendanceBatchActions({
  businessDate,
  goLiveDate,
  sites,
  initialSite,
}: {
  businessDate: string
  goLiveDate: string
  sites: AttendanceSite[]
  initialSite?: AttendanceBatchSite
}) {
  const [inputOpen, setInputOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                size='icon'
                variant='outline'
                aria-label='Aksi batch Attendance'
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Aksi batch Attendance</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align='end' className='w-56'>
          <DropdownMenuItem onSelect={() => setImportOpen(true)}>
            <FileSpreadsheet /> Import Excel
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setInputOpen(true)}>
            <ClipboardPlus /> Input Attendance Batch
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDeleteOpen(true)}>
            <Trash2 /> Hapus Attendance Batch
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {importOpen && (
        <AttendanceImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          initialDate={businessDate}
          goLiveDate={goLiveDate}
        />
      )}

      {inputOpen && (
        <AttendanceBatchInputDialog
          open={inputOpen}
          onOpenChange={setInputOpen}
          initialDate={businessDate}
          initialSite={initialSite ?? 'ALL'}
          goLiveDate={goLiveDate}
          sites={sites}
        />
      )}
      {deleteOpen && (
        <AttendanceBatchDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          initialDate={businessDate}
          initialSite={initialSite ?? 'ALL'}
          goLiveDate={goLiveDate}
          sites={sites}
        />
      )}
    </>
  )
}

function AttendanceBatchInputDialog({
  open,
  onOpenChange,
  initialDate,
  initialSite,
  goLiveDate,
  sites,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate: string
  initialSite: AttendanceBatchSite
  goLiveDate: string
  sites: AttendanceSite[]
}) {
  const [businessDate, setBusinessDate] = useState(initialDate)
  const [site, setSite] = useState<AttendanceBatchSite>(initialSite)
  const [mode, setMode] = useState<AttendanceBatchMode>('RANDOM')
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const preview = usePreviewAttendanceBatchInput()
  const run = useRunAttendanceBatchInput()

  const loadPreview = (
    nextDate = businessDate,
    nextSite = site,
    nextMode = mode
  ) =>
    preview.mutate(
      { businessDate: nextDate, site: nextSite, mode: nextMode },
      {
        onError: (error) =>
          toast.error(
            apiMessage(error, 'Kesiapan input Attendance gagal diperiksa.')
          ),
      }
    )

  useEffect(() => {
    if (!open) return
    loadPreview(initialDate, initialSite, 'RANDOM')
    // Mutation is stable for this dialog lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const resetPreview = () => {
    setConfirmation('')
    preview.reset()
  }
  const previewMatches =
    preview.data?.businessDate === businessDate &&
    preview.data.site === site &&
    preview.data.mode === mode
  const canSubmit =
    previewMatches &&
    preview.data?.canCreate === true &&
    reason.trim().length >= 5 &&
    confirmation.trim().toUpperCase() === 'PROSES' &&
    !run.isPending

  const submit = () => {
    if (!canSubmit) return
    run.mutate(
      {
        businessDate,
        site,
        mode,
        reason: reason.trim(),
        confirmation: 'PROSES',
      },
      {
        onSuccess: (result) => {
          toast.success(
            `${formatNumber(result.attendanceRecords)} record Attendance berhasil dibuat.`
          )
          onOpenChange(false)
        },
        onError: (error) =>
          toast.error(
            apiMessage(error, 'Input Attendance batch gagal diproses.')
          ),
      }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !run.isPending && onOpenChange(next)}
    >
      <DialogContent className='flex max-h-[92vh] flex-col sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>Input Attendance Batch</DialogTitle>
          <DialogDescription>
            Khusus data demo. Periksa kesiapan sebelum membuat Attendance untuk
            satu tanggal.
          </DialogDescription>
        </DialogHeader>

        <div className='grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1'>
          <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_1.2fr_auto] sm:items-end'>
            <SiteField
              value={site}
              sites={sites}
              onChange={(value) => {
                setSite(value)
                resetPreview()
              }}
            />
            <DateField
              label='Tanggal Attendance'
              value={businessDate}
              goLiveDate={goLiveDate}
              onChange={(value) => {
                setBusinessDate(value)
                resetPreview()
              }}
            />
            <label className='grid gap-1 text-sm'>
              <span className='font-medium'>Mode input</span>
              <Select
                value={mode}
                onValueChange={(value) => {
                  setMode(value as AttendanceBatchMode)
                  resetPreview()
                }}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='RANDOM'>Random untuk demo</SelectItem>
                  <SelectItem value='FULL_PRESENT'>
                    Semua hadir lengkap
                  </SelectItem>
                </SelectContent>
              </Select>
            </label>
            <Button
              type='button'
              variant='outline'
              disabled={preview.isPending}
              onClick={() => loadPreview()}
            >
              {preview.isPending ? (
                <Loader2 className='animate-spin' />
              ) : (
                <RefreshCw />
              )}
              Periksa
            </Button>
          </div>

          <p className='text-xs text-muted-foreground'>
            {mode === 'RANDOM'
              ? 'Membuat variasi hadir, terlambat, pulang awal, abnormal, klasifikasi, dan Alpha secara stabil untuk data demo.'
              : 'Semua karyawan eligible dibuat hadir dengan jam masuk dan pulang lengkap yang mendekati shift aktif.'}
          </p>

          <div className='overflow-hidden rounded-lg border'>
            {preview.isPending ? (
              <div className='grid h-32 place-items-center'>
                <Loader2 className='size-5 animate-spin text-muted-foreground' />
              </div>
            ) : previewMatches && preview.data ? (
              <>
                <div className='grid gap-2 border-b bg-muted/20 p-3 sm:grid-cols-3'>
                  <SummaryValue
                    label='Karyawan eligible'
                    value={formatNumber(preview.data.eligibleEmployeeCount)}
                  />
                  <SummaryValue
                    label='Site tercakup'
                    value={formatNumber(preview.data.siteCount)}
                  />
                  <SummaryValue
                    label='Kesiapan'
                    value={
                      preview.data.canCreate ? 'Siap diproses' : 'Belum siap'
                    }
                    ready={preview.data.canCreate}
                  />
                </div>
                {preview.data.blockers.length ? (
                  <div className='grid gap-1 p-3 text-sm text-destructive'>
                    {preview.data.blockers.map((blocker) => (
                      <p key={blocker} className='flex items-start gap-2'>
                        <AlertTriangle className='mt-0.5 size-4 shrink-0' />
                        {blocker}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className='flex items-center gap-2 p-3 text-sm text-emerald-700 dark:text-emerald-400'>
                    <CheckCircle2 className='size-4' />
                    Tanggal bersih dan seluruh kebutuhan site tersedia.
                  </div>
                )}
              </>
            ) : (
              <div className='grid h-28 place-items-center px-4 text-center text-sm text-muted-foreground'>
                Klik Periksa untuk melihat kesiapan data terbaru.
              </div>
            )}
          </div>

          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='grid gap-1.5 sm:col-span-2'>
              <Label htmlFor='attendance-batch-input-reason'>
                Alasan input
              </Label>
              <Textarea
                id='attendance-batch-input-reason'
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder='Contoh: Menyiapkan data demo Attendance untuk pengujian.'
                rows={2}
                maxLength={500}
              />
              <p className='text-xs text-muted-foreground'>
                Minimal 5 karakter.
              </p>
            </div>
            <div className='grid gap-1.5 sm:col-span-2'>
              <Label htmlFor='attendance-batch-input-confirmation'>
                Ketik PROSES untuk konfirmasi
              </Label>
              <Input
                id='attendance-batch-input-confirmation'
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete='off'
                placeholder='PROSES'
              />
              <div className='grid gap-0.5 text-xs'>
                <Requirement
                  ready={previewMatches && preview.data?.canCreate === true}
                >
                  Hasil pemeriksaan menyatakan data siap diproses.
                </Requirement>
                <Requirement ready={reason.trim().length >= 5}>
                  Alasan input minimal 5 karakter.
                </Requirement>
                <Requirement
                  ready={confirmation.trim().toUpperCase() === 'PROSES'}
                >
                  Konfirmasi harus bertuliskan PROSES.
                </Requirement>
              </div>
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
            )}
            Proses Attendance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AttendanceBatchDeleteDialog({
  open,
  onOpenChange,
  initialDate,
  initialSite,
  goLiveDate,
  sites,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialDate: string
  initialSite: AttendanceBatchSite
  goLiveDate: string
  sites: AttendanceSite[]
}) {
  const [dateFrom, setDateFrom] = useState(initialDate)
  const [dateTo, setDateTo] = useState(initialDate)
  const [site, setSite] = useState<AttendanceBatchSite>(initialSite)
  const [selected, setSelected] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const preview = usePreviewAttendanceBatchDelete()
  const remove = useDeleteAttendanceBatch()

  const loadPreview = (
    nextFrom = dateFrom,
    nextTo = dateTo,
    nextSite = site
  ) => {
    setSelected([])
    setConfirmation('')
    preview.mutate(
      { dateFrom: nextFrom, dateTo: nextTo, site: nextSite },
      {
        onError: (error) =>
          toast.error(apiMessage(error, 'Ringkasan Attendance gagal dimuat.')),
      }
    )
  }

  useEffect(() => {
    if (!open) return
    preview.mutate(
      { dateFrom: initialDate, dateTo: initialDate, site: initialSite },
      {
        onError: (error) =>
          toast.error(apiMessage(error, 'Ringkasan Attendance gagal dimuat.')),
      }
    )
    // Mutation is stable for this dialog lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const readyRows = useMemo(
    () => preview.data?.rows.filter((row) => row.canDelete) ?? [],
    [preview.data]
  )
  const allReadySelected =
    readyRows.length > 0 &&
    readyRows.every((row) => selected.includes(row.businessDate))
  const canSubmit =
    selected.length > 0 &&
    reason.trim().length >= 5 &&
    confirmation.trim().toUpperCase() === 'HAPUS' &&
    !remove.isPending

  const resetPreview = () => {
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
            `${formatNumber(result.deletedRecords)} record pada ${formatNumber(result.deletedDates)} tanggal berhasil dihapus.`
          )
          onOpenChange(false)
        },
        onError: (error) =>
          toast.error(apiMessage(error, 'Attendance batch gagal dihapus.')),
      }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !remove.isPending && onOpenChange(next)}
    >
      <DialogContent className='grid h-[92dvh] max-h-[880px] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-6xl'>
        <DialogHeader>
          <DialogTitle>Hapus Attendance Batch</DialogTitle>
          <DialogDescription>
            Khusus Super Admin. Pilih tanggal yang akan dikosongkan data
            Attendancenya.
          </DialogDescription>
        </DialogHeader>

        <div className='grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden'>
          <div className='grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end'>
            <SiteField
              value={site}
              sites={sites}
              onChange={(value) => {
                setSite(value)
                resetPreview()
              }}
            />
            <DateField
              label='Dari tanggal'
              value={dateFrom}
              goLiveDate={goLiveDate}
              onChange={(value) => {
                setDateFrom(value)
                resetPreview()
              }}
            />
            <DateField
              label='Sampai tanggal'
              value={dateTo}
              goLiveDate={goLiveDate}
              onChange={(value) => {
                setDateTo(value)
                resetPreview()
              }}
            />
            <Button
              type='button'
              variant='outline'
              disabled={preview.isPending || dateFrom > dateTo}
              onClick={() => loadPreview()}
            >
              {preview.isPending ? (
                <Loader2 className='animate-spin' />
              ) : (
                <RefreshCw />
              )}
              Muat ringkasan
            </Button>
          </div>

          <div className='min-h-0 overflow-x-auto overflow-y-scroll overscroll-contain rounded-lg border [scrollbar-gutter:stable]'>
            <table className='w-full min-w-[920px] caption-bottom text-xs'>
              <thead className='sticky top-0 z-10 bg-background shadow-sm'>
                <tr className='border-b'>
                  <th className='h-9 w-12 px-4 text-center align-middle font-medium whitespace-nowrap text-foreground'>
                    <Checkbox
                      aria-label='Pilih semua tanggal yang siap dihapus'
                      checked={allReadySelected}
                      disabled={!readyRows.length}
                      onCheckedChange={(checked) =>
                        setSelected(
                          checked
                            ? readyRows.map((row) => row.businessDate)
                            : []
                        )
                      }
                    />
                  </th>
                  <NativeHead>Tanggal</NativeHead>
                  <NativeHead align='right'>Site</NativeHead>
                  <NativeHead align='right'>Karyawan</NativeHead>
                  <NativeHead align='right'>Record</NativeHead>
                  <NativeHead align='right'>Scan</NativeHead>
                  <NativeHead align='right'>Koreksi</NativeHead>
                  <NativeHead align='right'>Klasifikasi</NativeHead>
                  <NativeHead align='right'>Finalisasi</NativeHead>
                  <NativeHead>Kesiapan</NativeHead>
                </tr>
              </thead>
              <tbody>
                {preview.isPending ? (
                  <tr>
                    <td colSpan={10} className='h-28 text-center'>
                      <Loader2 className='mx-auto size-5 animate-spin text-muted-foreground' />
                    </td>
                  </tr>
                ) : preview.data?.rows.length ? (
                  preview.data.rows.map((row) => (
                    <tr
                      key={row.businessDate}
                      className='border-b transition-colors hover:bg-muted/50'
                    >
                      <td className='px-4 py-1 text-center align-middle whitespace-nowrap'>
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
                      </td>
                      <td className='px-4 py-1 align-middle font-medium whitespace-nowrap'>
                        {formatDate(row.businessDate)}
                      </td>
                      <NumberCell value={row.siteCount} />
                      <NumberCell value={row.employeeCount} />
                      <NumberCell value={row.recordCount} />
                      <NumberCell value={row.scanEventCount} />
                      <NumberCell value={row.correctionCount} />
                      <NumberCell value={row.classificationCount} />
                      <NumberCell value={row.finalizationCount} />
                      <td className='min-w-56 px-4 py-1 align-middle whitespace-nowrap'>
                        {row.canDelete ? (
                          <span className='font-medium text-emerald-700 dark:text-emerald-400'>
                            Siap dihapus
                          </span>
                        ) : (
                          <span className='text-destructive'>
                            {row.blockers.join(' ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={10}
                      className='h-28 text-center text-muted-foreground'
                    >
                      Tidak ada data Attendance pada rentang ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className='grid gap-3 sm:grid-cols-2'>
            {selected.length > 0 && (
              <div className='flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive sm:col-span-2'>
                <AlertTriangle className='mt-0.5 size-4 shrink-0' />
                <p>
                  <span className='font-semibold'>
                    {selected.length} tanggal akan dikosongkan.
                  </span>{' '}
                  Record, scan, koreksi, klasifikasi, dan histori finalisasi
                  Attendance pada cakupan terpilih akan dihapus permanen.
                </p>
              </div>
            )}
            <div className='grid gap-1.5 sm:col-span-2'>
              <Label htmlFor='attendance-batch-delete-reason'>
                Alasan reset
              </Label>
              <Textarea
                id='attendance-batch-delete-reason'
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder='Contoh: Data Attendance tanggal tersebut akan dibuat ulang.'
                rows={2}
                maxLength={500}
              />
              <p className='text-xs text-muted-foreground'>
                Minimal 5 karakter.
              </p>
            </div>
            <div className='grid gap-1.5 sm:col-span-2'>
              <Label htmlFor='attendance-batch-delete-confirmation'>
                Ketik HAPUS untuk konfirmasi
              </Label>
              <Input
                id='attendance-batch-delete-confirmation'
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete='off'
                placeholder='HAPUS'
              />
              <div className='grid gap-0.5 text-xs'>
                <Requirement ready={selected.length > 0}>
                  Pilih minimal satu tanggal yang siap dihapus.
                </Requirement>
                <Requirement ready={reason.trim().length >= 5}>
                  Alasan reset minimal 5 karakter.
                </Requirement>
                <Requirement
                  ready={confirmation.trim().toUpperCase() === 'HAPUS'}
                >
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

function SiteField({
  value,
  sites,
  onChange,
}: {
  value: AttendanceBatchSite
  sites: AttendanceSite[]
  onChange: (value: AttendanceBatchSite) => void
}) {
  return (
    <label className='grid gap-1 text-sm'>
      <span className='font-medium'>Site</span>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as AttendanceBatchSite)}
      >
        <SelectTrigger className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='ALL'>Semua Site</SelectItem>
          {sites.map((site) => (
            <SelectItem key={site.uid} value={site.code}>
              {site.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}

function DateField({
  label,
  value,
  goLiveDate,
  onChange,
}: {
  label: string
  value: string
  goLiveDate: string
  onChange: (value: string) => void
}) {
  const today = dateOnlyToInput(new Date())
  return (
    <label className='grid gap-1 text-sm'>
      <span className='font-medium'>{label}</span>
      <DatePicker
        selected={dateOnlyFromInput(value)}
        onSelect={(date) => {
          const next = dateOnlyToInput(date)
          if (next) onChange(next)
        }}
        disabledDates={(date) => {
          const next = dateOnlyToInput(date)
          return next < goLiveDate || next > today
        }}
      />
    </label>
  )
}

function SummaryValue({
  label,
  value,
  ready,
}: {
  label: string
  value: string
  ready?: boolean
}) {
  return (
    <div>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p
        className={
          ready === undefined
            ? 'font-semibold'
            : ready
              ? 'font-semibold text-emerald-700 dark:text-emerald-400'
              : 'font-semibold text-destructive'
        }
      >
        {value}
      </p>
    </div>
  )
}

function NumberCell({ value }: { value: number }) {
  return (
    <td className='px-4 py-1 text-right align-middle whitespace-nowrap tabular-nums'>
      {formatNumber(value)}
    </td>
  )
}

function NativeHead({
  children,
  align = 'left',
}: {
  children: ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      className={
        align === 'right'
          ? 'h-9 px-4 text-right align-middle font-medium whitespace-nowrap text-foreground'
          : 'h-9 px-4 text-left align-middle font-medium whitespace-nowrap text-foreground'
      }
    >
      {children}
    </th>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`)
  )
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('id-ID').format(value)
}

function apiMessage(error: unknown, fallback: string) {
  if (!isAxiosError(error)) return fallback
  const message = (error.response?.data as { message?: unknown } | undefined)
    ?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}
