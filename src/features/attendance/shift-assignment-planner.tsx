import { useCallback, useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  Search,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DatePicker } from '@/components/date-picker'
import {
  useApplyShiftAssignmentPlan,
  usePreviewShiftAssignmentPlan,
} from './data/queries'
import type {
  ShiftAssignmentPlanEdit,
  ShiftAssignmentPlanItem,
  ShiftAssignmentPlanPreview,
  ShiftAssignmentPlanSource,
} from './domain'

const workdayOptions = [
  { value: 1, short: 'Sen' },
  { value: 2, short: 'Sel' },
  { value: 3, short: 'Rab' },
  { value: 4, short: 'Kam' },
  { value: 5, short: 'Jum' },
  { value: 6, short: 'Sab' },
  { value: 7, short: 'Min' },
]

const sourceLabels: Record<ShiftAssignmentPlanSource, string> = {
  NEW_HIRE: 'Karyawan baru',
  TRANSFER: 'Mutasi',
  RENEWAL: 'Perpanjangan',
  MANUAL: 'Manual',
}

export function ShiftAssignmentPlanner({
  employeeUids,
  onApplied,
  onCancel,
}: {
  employeeUids: string[]
  onApplied: (employeeUids: string[]) => void | Promise<void>
  onCancel: () => void
}) {
  const preview = usePreviewShiftAssignmentPlan()
  const apply = useApplyShiftAssignmentPlan()
  const [result, setResult] = useState<ShiftAssignmentPlanPreview>()
  const [rows, setRows] = useState<ShiftAssignmentPlanItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [bulkShiftUid, setBulkShiftUid] = useState('')
  const [bulkDate, setBulkDate] = useState('')
  const [bulkWorkDays, setBulkWorkDays] = useState<number[]>([])
  const [reviewed, setReviewed] = useState(false)

  const loadPreview = useCallback(
    (items?: ShiftAssignmentPlanEdit[]) => {
      if (employeeUids.length > 100) return
      preview.mutate(
        { employeeUids, items },
        {
          onSuccess: (data) => {
            setResult(data)
            setRows(data.items)
            setSelected(new Set(data.items.map((item) => item.employeeUid)))
            setReviewed(Boolean(items))
          },
          onError: (error) =>
            toast.error(apiMessage(error, 'Rencana Shift gagal disiapkan.')),
        }
      )
    },
    [employeeUids, preview]
  )

  useEffect(() => {
    loadPreview()
    // Initial preview follows the employee selection in the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeUids.join(',')])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('id-ID')
    return rows.filter((row) => {
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'VALID' ? row.valid : !row.valid) ||
        row.source === statusFilter
      const matchesQuery =
        !needle ||
        [
          row.fullName,
          row.employeeNumber,
          row.productionModule,
          row.productionSection,
          row.shiftName,
        ].some((value) => value?.toLocaleLowerCase('id-ID').includes(needle))
      return matchesStatus && matchesQuery
    })
  }, [query, rows, statusFilter])

  const shiftsBySite = useCallback(
    (site: string) =>
      result?.shifts.filter((shift) => shift.site === site) ?? [],
    [result?.shifts]
  )
  const allVisibleSelected =
    filteredRows.length > 0 &&
    filteredRows.every((row) => selected.has(row.employeeUid))

  const updateRow = (
    employeeUid: string,
    patch: Partial<ShiftAssignmentPlanItem>
  ) => {
    setRows((current) =>
      current.map((row) =>
        row.employeeUid === employeeUid
          ? {
              ...row,
              ...patch,
              valid: false,
              issues: ['Perubahan belum divalidasi.'],
            }
          : row
      )
    )
    setReviewed(false)
  }

  const selectedCount = selected.size
  const hasBulkChange = Boolean(bulkShiftUid || bulkDate || bulkWorkDays.length)
  const applyBulk = () => {
    if (!selectedCount || !hasBulkChange) return
    const selectedShift = result?.shifts.find(
      (candidate) => candidate.uid === bulkShiftUid
    )
    const incompatibleShiftCount = selectedShift
      ? rows.filter(
          (row) =>
            selected.has(row.employeeUid) && row.site !== selectedShift.site
        ).length
      : 0
    setRows((current) =>
      current.map((row) => {
        if (!selected.has(row.employeeUid)) return row
        const shift = selectedShift
        const canUseShift = shift?.site === row.site
        return {
          ...row,
          ...(bulkShiftUid && canUseShift
            ? {
                shiftUid: bulkShiftUid,
                shiftCode: shift.code,
                shiftName: shift.name,
              }
            : {}),
          ...(bulkDate ? { effectiveFrom: bulkDate } : {}),
          ...(bulkWorkDays.length ? { workDays: bulkWorkDays } : {}),
          valid: false,
          issues: ['Perubahan belum divalidasi.'],
        }
      })
    )
    setReviewed(false)
    if (incompatibleShiftCount) {
      toast.warning(
        `Pengaturan lain diterapkan. Shift dilewati pada ${incompatibleShiftCount} karyawan dari site berbeda.`
      )
    } else {
      toast.success(`Pengaturan diterapkan ke ${selectedCount} baris terpilih.`)
    }
  }

  const requestReview = () => {
    const invalidByEmployee = new Map(
      rows
        .map((row) => [row.employeeUid, localIssues(row)] as const)
        .filter((entry) => entry[1].length > 0)
    )
    if (invalidByEmployee.size) {
      setRows((current) =>
        current.map((row) => {
          const issues = invalidByEmployee.get(row.employeeUid)
          return issues ? { ...row, valid: false, issues } : row
        })
      )
      setReviewed(false)
      toast.warning(
        `${invalidByEmployee.size} baris belum lengkap. Periksa Shift, tanggal, dan hari kerja.`
      )
      return
    }
    loadPreview(rows.map(toEdit))
  }
  const canApply =
    reviewed &&
    Boolean(result?.items.length) &&
    result?.invalidCount === 0 &&
    !preview.isPending &&
    !apply.isPending

  if (employeeUids.length > 100) {
    return (
      <PlannerState
        icon={<AlertTriangle className='size-6 text-amber-600' />}
        title='Pilihan melebihi batas satu proses'
        description={`Anda memilih ${employeeUids.length} karyawan. Maksimal 100 karyawan agar validasi dan penyimpanan tetap aman. Kembali dan bagi menjadi beberapa kelompok.`}
        action={<Button onClick={onCancel}>Kembali pilih karyawan</Button>}
      />
    )
  }

  if (preview.isPending && !result) return <PlannerSkeleton />

  if (preview.isError && !result) {
    return (
      <PlannerState
        icon={<AlertTriangle className='size-6 text-destructive' />}
        title='Rencana Shift belum dapat dimuat'
        description='Data tidak diubah. Coba muat ulang setelah koneksi dan endpoint siap.'
        action={<Button onClick={() => loadPreview()}>Muat ulang</Button>}
      />
    )
  }

  if (!rows.length) {
    return (
      <PlannerState
        icon={<UsersRound className='size-6 text-muted-foreground' />}
        title='Tidak ada karyawan yang perlu disiapkan'
        description='Pilihan karyawan tidak menghasilkan rencana penugasan Shift.'
        action={<Button onClick={onCancel}>Kembali</Button>}
      />
    )
  }

  return (
    <div className='space-y-4'>
      <section className='overflow-hidden rounded-xl border bg-card shadow-sm'>
        <div className='border-b bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 sm:p-5'>
          <div className='flex flex-col justify-between gap-4 lg:flex-row lg:items-start'>
            <div className='max-w-2xl'>
              <div className='mb-2 flex items-center gap-2 text-sm font-medium text-primary'>
                <Sparkles className='size-4' /> Rekomendasi otomatis
              </div>
              <h2 className='text-xl font-semibold tracking-tight'>
                Penugasan Shift Massal
              </h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                Periksa rekomendasi dari kontrak, mutasi, atau Shift sebelumnya.
                Setiap karyawan boleh memiliki Shift dan tanggal mulai berbeda.
              </p>
            </div>
            <div className='grid grid-cols-3 gap-2 sm:min-w-80'>
              <Summary label='Karyawan' value={rows.length} />
              <Summary
                label='Valid'
                value={result?.validCount ?? 0}
                tone='good'
              />
              <Summary
                label='Perlu dicek'
                value={result?.invalidCount ?? 0}
                tone='warning'
              />
            </div>
          </div>
        </div>

        <div className='space-y-3 p-4 sm:p-5'>
          <div className='grid gap-3 xl:grid-cols-[minmax(12rem,1fr)_minmax(11rem,.7fr)_minmax(12rem,1fr)_auto]'>
            <label className='grid gap-1.5 text-xs font-medium'>
              Shift untuk baris terpilih
              <Select value={bulkShiftUid} onValueChange={setBulkShiftUid}>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='Tidak diubah' />
                </SelectTrigger>
                <SelectContent>
                  {result?.shifts.map((shift) => (
                    <SelectItem key={shift.uid} value={shift.uid}>
                      {shift.code} · {shift.name} ({shift.site})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className='grid gap-1.5 text-xs font-medium'>
              Tanggal mulai
              <DatePicker
                selected={dateFromInput(bulkDate)}
                onSelect={(date) => setBulkDate(dateToInput(date))}
                triggerClassName='w-full'
              />
            </label>
            <div className='grid gap-1.5 text-xs font-medium'>
              Hari kerja (opsional)
              <WorkdayPicker value={bulkWorkDays} onChange={setBulkWorkDays} />
              {!bulkWorkDays.length && (
                <span className='font-normal text-muted-foreground'>
                  Tidak diubah
                </span>
              )}
            </div>
            <Button
              className='self-end'
              onClick={applyBulk}
              disabled={!selectedCount || !hasBulkChange}
            >
              Terapkan ke {selectedCount} baris
            </Button>
          </div>
        </div>
      </section>

      <section className='rounded-xl border bg-card shadow-sm'>
        <div className='flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex flex-1 flex-col gap-2 sm:flex-row'>
            <div className='relative max-w-md flex-1'>
              <Search className='absolute top-2.5 left-3 size-4 text-muted-foreground' />
              <Input
                className='pl-9'
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Cari nama, NIK, bagian, atau Shift...'
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className='w-full sm:w-52'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>Semua kondisi</SelectItem>
                <SelectItem value='VALID'>Siap diproses</SelectItem>
                <SelectItem value='INVALID'>Perlu diperbaiki</SelectItem>
                <SelectItem value='NEW_HIRE'>Karyawan baru</SelectItem>
                <SelectItem value='TRANSFER'>Mutasi</SelectItem>
                <SelectItem value='RENEWAL'>Perpanjangan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className='text-xs text-muted-foreground tabular-nums'>
            {filteredRows.length} ditampilkan · {selectedCount} dipilih
          </p>
        </div>

        <div className='hidden grid-cols-[2.1rem_minmax(0,1.15fr)_minmax(0,1.1fr)_minmax(9.5rem,.65fr)_minmax(13.5rem,1fr)_minmax(8rem,.6fr)] gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground xl:grid'>
          <Checkbox
            checked={allVisibleSelected}
            aria-label='Pilih semua baris yang tampil'
            onCheckedChange={(checked) =>
              setSelected((current) => {
                const next = new Set(current)
                filteredRows.forEach((row) =>
                  checked
                    ? next.add(row.employeeUid)
                    : next.delete(row.employeeUid)
                )
                return next
              })
            }
          />
          <span>Karyawan</span>
          <span>Shift</span>
          <span>Tanggal mulai</span>
          <span>Hari kerja</span>
          <span>Validasi</span>
        </div>

        <div className='max-h-[58vh] divide-y overflow-y-auto'>
          {filteredRows.map((row) => (
            <div
              key={row.employeeUid}
              className={`grid gap-3 p-3 xl:grid-cols-[2.1rem_minmax(0,1.15fr)_minmax(0,1.1fr)_minmax(9.5rem,.65fr)_minmax(13.5rem,1fr)_minmax(8rem,.6fr)] xl:items-start ${!row.valid ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}
            >
              <div className='flex items-center justify-between xl:block'>
                <Checkbox
                  checked={selected.has(row.employeeUid)}
                  aria-label={`Pilih ${row.fullName}`}
                  onCheckedChange={(checked) =>
                    setSelected((current) => {
                      const next = new Set(current)
                      if (checked) next.add(row.employeeUid)
                      else next.delete(row.employeeUid)
                      return next
                    })
                  }
                />
                <span className='text-xs font-medium text-muted-foreground xl:hidden'>
                  Pilih untuk perubahan massal
                </span>
              </div>

              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-1.5'>
                  <p className='truncate text-sm font-medium'>{row.fullName}</p>
                  <Badge variant='outline' className='h-5 px-1.5 text-[10px]'>
                    {sourceLabels[row.source]}
                  </Badge>
                </div>
                <p className='truncate text-xs text-muted-foreground'>
                  {row.employeeNumber} · {row.employeeType} · {row.site}
                </p>
                {(row.productionModule || row.productionSection) && (
                  <p className='mt-0.5 truncate text-xs text-muted-foreground'>
                    {[row.productionModule, row.productionSection]
                      .filter(Boolean)
                      .join(' / ')}
                  </p>
                )}
                <p className='mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground'>
                  {row.recommendationReason}
                </p>
              </div>

              <label className='grid min-w-0 gap-1 text-xs font-medium xl:block'>
                <span className='xl:sr-only'>Shift</span>
                <select
                  aria-label={`Shift ${row.fullName}`}
                  className='h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm'
                  value={row.shiftUid ?? ''}
                  onChange={(event) => {
                    const shift = result?.shifts.find(
                      (item) => item.uid === event.target.value
                    )
                    updateRow(row.employeeUid, {
                      shiftUid: event.target.value,
                      shiftCode: shift?.code,
                      shiftName: shift?.name,
                    })
                  }}
                >
                  <option value=''>Pilih Shift</option>
                  {shiftsBySite(row.site).map((shift) => (
                    <option key={shift.uid} value={shift.uid}>
                      {shift.code} · {shift.name} ({shift.startTime.slice(0, 5)}
                      –{shift.endTime.slice(0, 5)})
                    </option>
                  ))}
                </select>
                {row.recommendedShiftUid &&
                  row.shiftUid !== row.recommendedShiftUid && (
                    <Button
                      type='button'
                      variant='link'
                      size='sm'
                      className='h-auto justify-start px-0 py-1 text-xs'
                      onClick={() =>
                        updateRow(row.employeeUid, {
                          shiftUid: row.recommendedShiftUid,
                          shiftCode: row.recommendedShiftCode,
                          shiftName: row.recommendedShiftName,
                        })
                      }
                    >
                      Gunakan rekomendasi
                    </Button>
                  )}
              </label>

              <label className='grid gap-1 text-xs font-medium xl:block'>
                <span className='xl:sr-only'>Tanggal mulai</span>
                <DatePicker
                  selected={dateFromInput(row.effectiveFrom)}
                  onSelect={(date) =>
                    updateRow(row.employeeUid, {
                      effectiveFrom: dateToInput(date),
                    })
                  }
                  triggerClassName='w-full'
                />
                {row.effectiveFrom !== row.recommendedEffectiveFrom && (
                  <p className='mt-1 text-[11px] text-muted-foreground'>
                    Saran: {formatDate(row.recommendedEffectiveFrom)}
                  </p>
                )}
              </label>

              <div className='min-w-0'>
                <p className='mb-1 text-xs font-medium xl:sr-only'>
                  Hari kerja
                </p>
                <WorkdayPicker
                  value={row.workDays}
                  onChange={(workDays) =>
                    updateRow(row.employeeUid, { workDays })
                  }
                  compact
                />
              </div>

              <div className='min-w-0'>
                {row.valid ? (
                  <Badge className='gap-1 bg-emerald-600 hover:bg-emerald-600'>
                    <CheckCircle2 className='size-3' /> Siap
                  </Badge>
                ) : (
                  <div className='space-y-1'>
                    <Badge
                      variant='outline'
                      className='gap-1 border-amber-400 text-amber-700'
                    >
                      <AlertTriangle className='size-3' /> Perlu diperbaiki
                    </Badge>
                    {row.issues.map((issue) => (
                      <p
                        key={issue}
                        className='text-xs text-amber-700 dark:text-amber-400'
                      >
                        {issue}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {!filteredRows.length && (
            <div className='grid min-h-36 place-items-center p-6 text-center text-sm text-muted-foreground'>
              Tidak ada karyawan sesuai pencarian atau filter.
            </div>
          )}
        </div>
      </section>

      <div className='sticky bottom-3 z-20 flex flex-col-reverse gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between'>
        <Button variant='outline' onClick={onCancel} disabled={apply.isPending}>
          <ArrowLeft /> Kembali
        </Button>
        <div className='flex flex-col gap-2 sm:flex-row'>
          <Button
            variant='secondary'
            onClick={requestReview}
            disabled={preview.isPending || apply.isPending}
          >
            {preview.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <ClipboardCheck />
            )}
            Preview & validasi
          </Button>
          <Button
            disabled={!canApply}
            onClick={() =>
              apply.mutate(
                { items: rows.map(toEdit) },
                {
                  onSuccess: async (data) => {
                    toast.success(
                      `${data.createdCount} penugasan Shift berhasil disimpan.`
                    )
                    await onApplied(data.employeeUids)
                  },
                  onError: (error) =>
                    toast.error(
                      apiMessage(error, 'Penugasan Shift gagal disimpan.')
                    ),
                }
              )
            }
          >
            {apply.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <CheckCircle2 />
            )}
            Simpan {rows.length} penugasan
          </Button>
        </div>
      </div>
      {!reviewed && (
        <p className='text-center text-xs text-muted-foreground'>
          Perubahan belum divalidasi. Klik Preview & validasi sebelum menyimpan.
        </p>
      )}
    </div>
  )
}

function WorkdayPicker({
  value,
  onChange,
  compact = false,
}: {
  value: number[]
  onChange: (value: number[]) => void
  compact?: boolean
}) {
  return (
    <div className='flex flex-wrap gap-1'>
      {workdayOptions.map((day) => {
        const active = value.includes(day.value)
        return (
          <button
            key={day.value}
            type='button'
            aria-pressed={active}
            onClick={() =>
              onChange(
                active
                  ? value.filter((item) => item !== day.value)
                  : [...value, day.value].sort()
              )
            }
            className={`${compact ? 'h-7 min-w-7 px-1 text-[11px]' : 'h-8 min-w-9 px-1.5 text-xs'} rounded-md border font-medium transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'}`}
          >
            {day.short}
          </button>
        )
      })}
    </div>
  )
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'good' | 'warning'
}) {
  return (
    <div className='min-h-[68px] rounded-lg border bg-background/80 px-3 py-2.5'>
      <p className='text-[11px] text-muted-foreground'>{label}</p>
      <p
        className={`text-xl font-semibold tabular-nums ${tone === 'good' ? 'text-emerald-600' : tone === 'warning' && value ? 'text-amber-600' : ''}`}
      >
        {value}
      </p>
    </div>
  )
}

function PlannerSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-44 rounded-xl' />
      <Skeleton className='h-[420px] rounded-xl' />
    </div>
  )
}

function PlannerState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className='grid min-h-72 place-items-center rounded-xl border border-dashed p-8 text-center'>
      <div className='grid max-w-md justify-items-center gap-3'>
        <div className='grid size-12 place-items-center rounded-full bg-muted'>
          {icon}
        </div>
        <div>
          <h2 className='font-semibold'>{title}</h2>
          <p className='mt-1 text-sm text-muted-foreground'>{description}</p>
        </div>
        {action}
      </div>
    </div>
  )
}

function toEdit(row: ShiftAssignmentPlanItem): ShiftAssignmentPlanEdit {
  return {
    employeeUid: row.employeeUid,
    shiftUid: row.shiftUid ?? '',
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo || undefined,
    workDays: row.workDays,
  }
}

function localIssues(row: ShiftAssignmentPlanItem) {
  const issues: string[] = []
  if (!row.shiftUid) issues.push('Shift wajib dipilih.')
  if (!row.effectiveFrom) issues.push('Tanggal mulai wajib diisi.')
  if (!row.workDays.length) issues.push('Pilih minimal satu hari kerja.')
  if (row.effectiveTo && row.effectiveTo < row.effectiveFrom) {
    issues.push('Tanggal selesai tidak boleh sebelum tanggal mulai.')
  }
  return issues
}

function dateFromInput(value?: string) {
  if (!value) return undefined
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function dateToInput(value?: Date) {
  if (!value) return ''
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data.message ?? fallback)
    : fallback
}
