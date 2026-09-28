import { useMemo, useState } from 'react'
import { BriefcaseBusiness, CheckCircle2 } from 'lucide-react'
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
import { DatePicker } from '@/components/date-picker'
import {
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import type { EmployeeOnboardingReadinessItem } from '@/features/employees/domain'
import { useCreateProductionAssignmentsBatch } from './data/queries'
import type { ProductionJob, ProductionSite } from './domain'

export function ProductionOnboardingAssignmentDialog({
  open,
  onOpenChange,
  employees,
  jobs,
  onAssigned,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employees: EmployeeOnboardingReadinessItem[]
  jobs: ProductionJob[]
  onAssigned: (employeeUids: string[]) => void
}) {
  const site = employees[0]?.site as ProductionSite | undefined
  const [jobByEmployee, setJobByEmployee] = useState<Record<string, string>>({})
  const [effectiveFromByEmployee, setEffectiveFromByEmployee] = useState<
    Record<string, string>
  >({})
  const createBatch = useCreateProductionAssignmentsBatch()

  const activeJobs = useMemo(() => jobs.filter((job) => job.isActive), [jobs])
  const suggestedJobByEmployee = useMemo(
    () =>
      Object.fromEntries(
        employees.map((employee) => {
          const sectionCode =
            employee.productionSectionCode?.trim().toUpperCase() ?? ''
          const expectedCode = `BORONGAN-${sectionCode}`
          const job = activeJobs.find(
            (candidate) => candidate.code.toUpperCase() === expectedCode
          )
          return [employee.employeeUid, job?.uid ?? '']
        })
      ),
    [activeJobs, employees]
  )
  const assignmentItems = useMemo(
    () =>
      employees.map((employee) => {
        const eligibility = productionAssignmentEligibility(employee)
        return {
          employeeUid: employee.employeeUid,
          jobUid:
            jobByEmployee[employee.employeeUid] ??
            suggestedJobByEmployee[employee.employeeUid] ??
            '',
          effectiveFrom:
            effectiveFromByEmployee[employee.employeeUid] ??
            eligibility.defaultDate,
          eligibleFrom: eligibility.eligibleFrom,
          eligibleTo: eligibility.eligibleTo,
        }
      }),
    [effectiveFromByEmployee, employees, jobByEmployee, suggestedJobByEmployee]
  )
  const canSubmit =
    Boolean(
      site &&
      assignmentItems.length &&
      assignmentItems.every(
        (item) =>
          item.jobUid &&
          item.effectiveFrom &&
          item.effectiveFrom >= item.eligibleFrom &&
          item.effectiveFrom <= item.eligibleTo
      )
    ) && !createBatch.isPending

  const submit = () => {
    if (!canSubmit || !site) return
    createBatch.mutate(
      {
        items: assignmentItems.map(
          ({ employeeUid, jobUid, effectiveFrom }) => ({
            employeeUid,
            jobUid,
            effectiveFrom,
          })
        ),
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='grid max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-6xl'>
        <DialogHeader className='border-b px-6 py-5'>
          <DialogTitle className='flex items-center gap-2'>
            <BriefcaseBusiness className='size-5' /> Atur pekerjaan Produksi
          </DialogTitle>
          <DialogDescription>
            Periksa pekerjaan dan tanggal mulai pada setiap baris karyawan.
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 space-y-3 overflow-y-auto px-6 py-4'>
          <div className='space-y-1 rounded-lg border bg-muted/20 px-3 py-2 text-xs leading-4 text-muted-foreground'>
            <p>
              Sistem memilih pekerjaan bertarif aktif yang sesuai dengan Bagian
              Produksi. Pilihan tetap dapat diperiksa atau diganti.
            </p>
            <p>
              Untuk kontrak yang terlambat diaktifkan, pilih tanggal saat
              penugasan seharusnya mulai. Sistem tetap memeriksa status kerja,
              site, tarif, dan benturan histori pada tanggal tersebut.
            </p>
          </div>

          <div className='rounded-md border'>
            <div className='border-b bg-muted/30 px-4 py-2.5 text-sm font-medium'>
              {employees.length} karyawan akan ditugaskan
            </div>
            <div className='max-h-[min(32rem,55svh)] overflow-auto'>
              <Table>
                <TableHeader className='sticky top-0 z-10 bg-background'>
                  <TableRow>
                    <TableHead className='min-w-52'>Karyawan</TableHead>
                    <TableHead className='min-w-36'>Bagian Produksi</TableHead>
                    <TableHead className='min-w-64'>Pekerjaan utama</TableHead>
                    <TableHead className='min-w-44'>Tanggal mulai</TableHead>
                    <TableHead className='w-28'>Site</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => {
                    const eligibility =
                      productionAssignmentEligibility(employee)
                    const selectedJobUid =
                      jobByEmployee[employee.employeeUid] ??
                      suggestedJobByEmployee[employee.employeeUid] ??
                      ''
                    const selectedJob = activeJobs.find(
                      (job) => job.uid === selectedJobUid
                    )
                    const effectiveFrom =
                      effectiveFromByEmployee[employee.employeeUid] ??
                      eligibility.defaultDate
                    return (
                      <TableRow key={employee.employeeUid}>
                        <TableCell>
                          <p className='font-medium'>{employee.fullName}</p>
                          <p className='text-xs text-muted-foreground'>
                            {employee.employeeNumber}
                          </p>
                        </TableCell>
                        <TableCell>
                          {employee.productionSectionName ?? 'Belum diisi'}
                        </TableCell>
                        <TableCell>
                          <div className='grid min-w-60 gap-1'>
                            <Select
                              value={selectedJobUid}
                              onValueChange={(value) =>
                                setJobByEmployee((current) => ({
                                  ...current,
                                  [employee.employeeUid]: value,
                                }))
                              }
                            >
                              <SelectTrigger className='w-full'>
                                <SelectValue placeholder='Pilih pekerjaan' />
                              </SelectTrigger>
                              <SelectContent>
                                {activeJobs.map((job) => (
                                  <SelectItem key={job.uid} value={job.uid}>
                                    {job.code} · {job.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!selectedJob && (
                              <span className='text-[11px] text-destructive'>
                                Default bagian belum ditemukan.
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DatePicker
                            selected={dateOnlyFromInput(effectiveFrom)}
                            onSelect={(date) =>
                              setEffectiveFromByEmployee((current) => ({
                                ...current,
                                [employee.employeeUid]: dateOnlyToInput(date),
                              }))
                            }
                            placeholder='Tanggal mulai'
                            fromYear={2020}
                            toYear={new Date().getFullYear()}
                            disabledDates={(date) => {
                              const value = dateOnlyToInput(date)
                              return (
                                value !== eligibility.defaultDate ||
                                value < eligibility.eligibleFrom ||
                                value > eligibility.eligibleTo
                              )
                            }}
                          />
                        </TableCell>
                        <TableCell>{employee.site}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        <DialogFooter className='border-t bg-muted/20 px-6 py-4'>
          <Button
            type='button'
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={createBatch.isPending}
          >
            Nanti saja
          </Button>
          <Button type='button' onClick={submit} disabled={!canSubmit}>
            <CheckCircle2 />
            {createBatch.isPending
              ? 'Menyimpan...'
              : `Simpan untuk ${employees.length} karyawan`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  const dates = values
    .filter((value): value is string => Boolean(value))
    .sort()
  return dates[dates.length - 1] ?? todayJakarta()
}

function earliestDateOnly(...values: Array<string | undefined>) {
  const dates = values
    .filter((value): value is string => Boolean(value))
    .sort()
  return dates[0] ?? todayJakarta()
}

function apiMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback
  const response = (error as { response?: { data?: { message?: unknown } } })
    .response
  return typeof response?.data?.message === 'string'
    ? response.data.message
    : fallback
}
