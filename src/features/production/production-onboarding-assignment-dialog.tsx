import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  AlertTriangle,
  ArrowLeft,
  BriefcaseBusiness,
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
import { DatePicker } from '@/components/date-picker'
import {
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import type { EmployeeOnboardingReadinessItem } from '@/features/employees/domain'
import { useCreateProductionAssignmentsBatch } from './data/queries'
import type { ProductionJob, ProductionSite } from './domain'

type PlannerRow = {
  employee: EmployeeOnboardingReadinessItem
  jobUid: string
  recommendedJobUid: string
  effectiveFrom: string
  recommendedEffectiveFrom: string
}

export function ProductionOnboardingAssignmentPlanner({
  employees,
  jobs,
  onAssigned,
  onCancel,
}: {
  employees: EmployeeOnboardingReadinessItem[]
  jobs: ProductionJob[]
  onAssigned: (employeeUids: string[]) => void
  onCancel: () => void
}) {
  const site = employees[0]?.site as ProductionSite | undefined
  const activeJobs = useMemo(() => jobs.filter((job) => job.isActive), [jobs])
  const [rows, setRows] = useState<PlannerRow[]>(() =>
    employees.map((employee) => createPlannerRow(employee, activeJobs))
  )
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(employees.map((employee) => employee.employeeUid))
  )
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [bulkJobUid, setBulkJobUid] = useState('')
  const [reviewed, setReviewed] = useState(false)
  const createBatch = useCreateProductionAssignmentsBatch()

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('id-ID')
    return rows.filter((row) => {
      const issues = rowIssues(row)
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'READY' ? !issues.length : issues.length > 0)
      const selectedJob = activeJobs.find((job) => job.uid === row.jobUid)
      const matchesQuery =
        !needle ||
        [
          row.employee.fullName,
          row.employee.employeeNumber,
          row.employee.site,
          row.employee.productionSectionName,
          row.employee.productionSectionCode,
          selectedJob?.code,
          selectedJob?.name,
        ].some((value) => value?.toLocaleLowerCase('id-ID').includes(needle))
      return matchesStatus && matchesQuery
    })
  }, [activeJobs, query, rows, statusFilter])

  const readyCount = rows.filter((row) => !rowIssues(row).length).length
  const selectedCount = selected.size
  const allVisibleSelected =
    filteredRows.length > 0 &&
    filteredRows.every((row) => selected.has(row.employee.employeeUid))

  const updateRow = (employeeUid: string, patch: Partial<PlannerRow>) => {
    setRows((current) =>
      current.map((row) =>
        row.employee.employeeUid === employeeUid ? { ...row, ...patch } : row
      )
    )
    setReviewed(false)
  }

  const applyBulk = () => {
    if (!selectedCount || !bulkJobUid) return
    setRows((current) =>
      current.map((row) =>
        selected.has(row.employee.employeeUid)
          ? {
              ...row,
              ...(bulkJobUid ? { jobUid: bulkJobUid } : {}),
            }
          : row
      )
    )
    setReviewed(false)
    toast.success(`Pengaturan diterapkan ke ${selectedCount} baris terpilih.`)
  }

  const review = () => {
    const invalidCount = rows.filter((row) => rowIssues(row).length).length
    setReviewed(invalidCount === 0)
    if (invalidCount) {
      toast.warning(
        `${invalidCount} baris belum siap. Periksa pekerjaan dan tanggal mulai.`
      )
      return
    }
    toast.success(
      `${rows.length} penugasan siap disimpan dan akan divalidasi kembali oleh sistem.`
    )
  }

  const submit = () => {
    if (!reviewed || !site || createBatch.isPending) return
    createBatch.mutate(
      {
        items: rows.map((row) => ({
          employeeUid: row.employee.employeeUid,
          jobUid: row.jobUid,
          effectiveFrom: row.effectiveFrom,
        })),
        site,
      },
      {
        onSuccess: (result) => {
          toast.success(
            `${result.created} karyawan berhasil diberi pekerjaan utama.`
          )
          onAssigned(result.items.map((item) => item.employeeUid))
        },
        onError: (error) =>
          toast.error(
            apiMessage(
              error,
              'Penugasan gagal. Periksa pekerjaan, tarif site, dan tanggal mulai.'
            )
          ),
      }
    )
  }

  if (!rows.length) {
    return (
      <PlannerState
        icon={<UsersRound className='size-6 text-muted-foreground' />}
        title='Tidak ada karyawan yang perlu ditugaskan'
        description='Pilihan onboarding tidak menghasilkan rencana pekerjaan Produksi.'
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
                Penugasan Pekerjaan Produksi
              </h2>
              <p className='mt-1 text-sm text-muted-foreground'>
                Pekerjaan disarankan dari Bagian Produksi dan tanggal mengikuti
                periode kerja setiap karyawan. Periksa sebelum menyimpan.
              </p>
            </div>
            <div className='grid grid-cols-3 gap-2 sm:min-w-80'>
              <Summary label='Karyawan' value={rows.length} />
              <Summary label='Siap' value={readyCount} tone='good' />
              <Summary
                label='Perlu dicek'
                value={rows.length - readyCount}
                tone='warning'
              />
            </div>
          </div>
        </div>

        <div className='grid gap-3 p-4 sm:p-5 lg:grid-cols-[minmax(12rem,1fr)_auto]'>
          <label className='grid gap-1.5 text-xs font-medium'>
            Pekerjaan untuk baris terpilih
            <Select value={bulkJobUid} onValueChange={setBulkJobUid}>
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Tidak diubah' />
              </SelectTrigger>
              <SelectContent>
                {activeJobs.map((job) => (
                  <SelectItem key={job.uid} value={job.uid}>
                    {job.code} · {job.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <Button
            className='self-end'
            onClick={applyBulk}
            disabled={!selectedCount || !bulkJobUid}
          >
            Terapkan ke {selectedCount} baris
          </Button>
        </div>
      </section>

      <section className='overflow-hidden rounded-xl border bg-card shadow-sm'>
        <div className='flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex flex-1 flex-col gap-2 sm:flex-row'>
            <div className='relative max-w-md flex-1'>
              <Search className='absolute top-2.5 left-3 size-4 text-muted-foreground' />
              <Input
                className='pl-9'
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Cari nama, NIK, bagian, atau pekerjaan...'
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className='w-full sm:w-48'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>Semua kondisi</SelectItem>
                <SelectItem value='READY'>Siap diproses</SelectItem>
                <SelectItem value='CHECK'>Perlu diperbaiki</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className='text-xs text-muted-foreground tabular-nums'>
            {filteredRows.length} ditampilkan · {selectedCount} dipilih
          </p>
        </div>

        <div className='hidden grid-cols-[2.1rem_minmax(0,1.3fr)_minmax(0,1.25fr)_minmax(9.5rem,.7fr)_minmax(8rem,.55fr)] gap-3 border-b bg-muted/30 px-3 py-2 text-xs font-medium text-muted-foreground lg:grid'>
          <Checkbox
            checked={allVisibleSelected}
            aria-label='Pilih semua baris yang tampil'
            onCheckedChange={(checked) =>
              setSelected((current) => {
                const next = new Set(current)
                filteredRows.forEach((row) =>
                  checked
                    ? next.add(row.employee.employeeUid)
                    : next.delete(row.employee.employeeUid)
                )
                return next
              })
            }
          />
          <span>Karyawan</span>
          <span>Pekerjaan utama</span>
          <span>Tanggal mulai</span>
          <span>Validasi</span>
        </div>

        <div className='max-h-[58vh] divide-y overflow-y-auto'>
          {filteredRows.map((row) => {
            const issues = rowIssues(row)
            const recommendedJob = activeJobs.find(
              (job) => job.uid === row.recommendedJobUid
            )
            return (
              <div
                key={row.employee.employeeUid}
                className={`grid gap-3 p-3 lg:grid-cols-[2.1rem_minmax(0,1.3fr)_minmax(0,1.25fr)_minmax(9.5rem,.7fr)_minmax(8rem,.55fr)] lg:items-start ${issues.length ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}
              >
                <div className='flex items-center justify-between lg:block'>
                  <Checkbox
                    checked={selected.has(row.employee.employeeUid)}
                    aria-label={`Pilih ${row.employee.fullName}`}
                    onCheckedChange={(checked) =>
                      setSelected((current) => {
                        const next = new Set(current)
                        if (checked) next.add(row.employee.employeeUid)
                        else next.delete(row.employee.employeeUid)
                        return next
                      })
                    }
                  />
                  <span className='text-xs font-medium text-muted-foreground lg:hidden'>
                    Pilih untuk perubahan massal
                  </span>
                </div>

                <div className='min-w-0'>
                  <p className='truncate text-sm font-medium'>
                    {row.employee.fullName}
                  </p>
                  <p className='truncate text-xs text-muted-foreground'>
                    {row.employee.employeeNumber} · {row.employee.site} ·{' '}
                    {row.employee.employeeType}
                  </p>
                  <p className='mt-0.5 truncate text-xs text-muted-foreground'>
                    {row.employee.productionSectionName ?? 'Bagian belum diisi'}
                  </p>
                </div>

                <label className='grid min-w-0 gap-1 text-xs font-medium lg:block'>
                  <span className='lg:sr-only'>Pekerjaan utama</span>
                  <select
                    aria-label={`Pekerjaan ${row.employee.fullName}`}
                    className='h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm'
                    value={row.jobUid}
                    onChange={(event) =>
                      updateRow(row.employee.employeeUid, {
                        jobUid: event.target.value,
                      })
                    }
                  >
                    <option value=''>Pilih pekerjaan</option>
                    {activeJobs.map((job) => (
                      <option key={job.uid} value={job.uid}>
                        {job.code} · {job.name}
                      </option>
                    ))}
                  </select>
                  {recommendedJob && row.jobUid !== row.recommendedJobUid && (
                    <Button
                      type='button'
                      variant='link'
                      size='sm'
                      className='h-auto justify-start px-0 py-1 text-xs'
                      onClick={() =>
                        updateRow(row.employee.employeeUid, {
                          jobUid: row.recommendedJobUid,
                        })
                      }
                    >
                      Gunakan rekomendasi {recommendedJob.code}
                    </Button>
                  )}
                  {!row.recommendedJobUid && (
                    <p className='mt-1 text-[11px] text-amber-700 dark:text-amber-400'>
                      Pekerjaan otomatis untuk bagian ini belum ditemukan.
                    </p>
                  )}
                </label>

                <label className='grid gap-1 text-xs font-medium lg:block'>
                  <span className='lg:sr-only'>Tanggal mulai</span>
                  <DatePicker
                    selected={dateOnlyFromInput(row.effectiveFrom)}
                    onSelect={(date) =>
                      updateRow(row.employee.employeeUid, {
                        effectiveFrom: dateOnlyToInput(date),
                      })
                    }
                    placeholder='Tanggal mulai'
                    triggerClassName='w-full'
                    fromYear={2020}
                    toYear={new Date().getFullYear() + 1}
                    disabledDates={(date) =>
                      dateOnlyToInput(date) !== row.recommendedEffectiveFrom
                    }
                  />
                  {row.effectiveFrom !== row.recommendedEffectiveFrom && (
                    <p className='mt-1 text-[11px] text-muted-foreground'>
                      Saran: {formatDate(row.recommendedEffectiveFrom)}
                    </p>
                  )}
                </label>

                <div className='min-w-0'>
                  {issues.length ? (
                    <div className='space-y-1'>
                      <Badge
                        variant='outline'
                        className='gap-1 border-amber-400 text-amber-700'
                      >
                        <AlertTriangle className='size-3' /> Perlu dicek
                      </Badge>
                      {issues.map((issue) => (
                        <p
                          key={issue}
                          className='text-xs text-amber-700 dark:text-amber-400'
                        >
                          {issue}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <Badge className='gap-1 bg-emerald-600 hover:bg-emerald-600'>
                      <CheckCircle2 className='size-3' /> Siap
                    </Badge>
                  )}
                </div>
              </div>
            )
          })}
          {!filteredRows.length && (
            <div className='grid min-h-36 place-items-center p-6 text-center text-sm text-muted-foreground'>
              Tidak ada karyawan sesuai pencarian atau filter.
            </div>
          )}
        </div>
      </section>

      {createBatch.isError && (
        <div className='flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0' />
          <div>
            <p className='font-medium'>Data belum disimpan</p>
            <p>
              {apiMessage(
                createBatch.error,
                'Sistem menolak batch agar tidak ada penugasan parsial. Periksa tarif, site, kontrak, dan periode yang ditampilkan.'
              )}
            </p>
          </div>
        </div>
      )}

      <div className='sticky bottom-3 z-20 flex flex-col-reverse gap-2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between'>
        <Button
          variant='outline'
          onClick={onCancel}
          disabled={createBatch.isPending}
        >
          <ArrowLeft /> Kembali
        </Button>
        <div className='flex flex-col gap-2 sm:flex-row'>
          <Button
            variant='secondary'
            onClick={review}
            disabled={createBatch.isPending}
          >
            <ClipboardCheck /> Periksa kesiapan
          </Button>
          <Button
            onClick={submit}
            disabled={
              !reviewed || readyCount !== rows.length || createBatch.isPending
            }
          >
            {createBatch.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <BriefcaseBusiness />
            )}
            Simpan {rows.length} penugasan
          </Button>
        </div>
      </div>
      {!reviewed && (
        <p className='text-center text-xs text-muted-foreground'>
          Klik Periksa kesiapan sebelum menyimpan. Server akan memvalidasi ulang
          seluruh batch secara atomik.
        </p>
      )}
    </div>
  )
}

function createPlannerRow(
  employee: EmployeeOnboardingReadinessItem,
  activeJobs: ProductionJob[]
): PlannerRow {
  const eligibility = productionAssignmentEligibility(employee)
  const expectedCode = `BORONGAN-${employee.productionSectionCode?.trim().toUpperCase() ?? ''}`
  const job = activeJobs.find(
    (candidate) => candidate.code.toUpperCase() === expectedCode
  )
  const recommendedEffectiveFrom = eligibility.defaultDate
  return {
    employee,
    jobUid: job?.uid ?? '',
    recommendedJobUid: job?.uid ?? '',
    effectiveFrom: recommendedEffectiveFrom,
    recommendedEffectiveFrom,
  }
}

function rowIssues(row: PlannerRow) {
  const issues: string[] = []
  if (!row.jobUid) issues.push('Pekerjaan wajib dipilih.')
  if (!row.effectiveFrom) issues.push('Tanggal mulai wajib diisi.')
  if (row.effectiveFrom && row.effectiveFrom !== row.recommendedEffectiveFrom) {
    issues.push(
      'Tanggal mulai harus mengikuti awal operasional terakhir antara kontrak dan histori site.'
    )
  }
  return issues
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

function todayJakarta() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function productionAssignmentEligibility(
  employee: EmployeeOnboardingReadinessItem
) {
  const today = todayJakarta()
  const dayAfterPreviousContract = employee.previousContractEndDate
    ? addDateOnlyDays(employee.previousContractEndDate, 1)
    : undefined
  const eligibleFrom = latestDateOnly(
    dayAfterPreviousContract,
    employee.productionAssignmentEligibleFrom,
    employee.contractStartDate
  )
  const eligibleTo = earliestDateOnly(
    today,
    employee.productionAssignmentEligibleTo
  )
  const preferredDate = employee.contractStartDate ?? eligibleFrom

  return {
    eligibleFrom,
    eligibleTo,
    defaultDate:
      preferredDate >= eligibleFrom && preferredDate <= eligibleTo
        ? preferredDate
        : eligibleFrom,
  }
}

function addDateOnlyDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

function latestDateOnly(...values: Array<string | undefined>) {
  const dates = values.filter((value): value is string => Boolean(value)).sort()
  return dates[dates.length - 1] ?? todayJakarta()
}

function earliestDateOnly(...values: Array<string | undefined>) {
  const dates = values.filter((value): value is string => Boolean(value)).sort()
  return dates[0] ?? todayJakarta()
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
