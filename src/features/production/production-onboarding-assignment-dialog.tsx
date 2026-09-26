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
import type { EmployeeOnboardingReadinessItem } from '@/features/employees/domain'
import {
  useCreateProductionAssignmentsBatch,
  useProductionRates,
} from './data/queries'
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
  const [jobUid, setJobUid] = useState('')
  const effectiveFrom = todayJakarta()
  const createBatch = useCreateProductionAssignmentsBatch()
  const activeRates = useProductionRates({
    page: 1,
    pageSize: 500,
    site: site ? [site] : [],
    activeOn: effectiveFrom,
  })
  const availableJobUids = useMemo(
    () => new Set((activeRates.data?.items ?? []).map((rate) => rate.jobUid)),
    [activeRates.data?.items]
  )
  const activeJobs = useMemo(
    () => jobs.filter((job) => job.isActive && availableJobUids.has(job.uid)),
    [availableJobUids, jobs]
  )
  const canSubmit =
    Boolean(site && jobUid && effectiveFrom && employees.length) &&
    !createBatch.isPending

  const submit = () => {
    if (!canSubmit || !site) return
    createBatch.mutate(
      {
        employeeUids: employees.map((employee) => employee.employeeUid),
        jobUid,
        site,
        effectiveFrom,
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
      <DialogContent className='grid max-h-[calc(100svh-2rem)] w-[calc(100vw-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl'>
        <DialogHeader className='border-b px-6 py-5'>
          <DialogTitle className='flex items-center gap-2'>
            <BriefcaseBusiness className='size-5' /> Atur pekerjaan Produksi
          </DialogTitle>
          <DialogDescription>
            Pilih satu pekerjaan utama untuk karyawan {site ?? 'site ini'}.
            Pekerjaan tambahan dapat diatur nanti.
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 space-y-4 overflow-y-auto px-6 py-4'>
          <div className='grid gap-2'>
            <div className='grid gap-2'>
              <Label htmlFor='onboarding-production-job'>Pekerjaan utama</Label>
              <Select
                value={jobUid}
                onValueChange={setJobUid}
                disabled={activeRates.isPending}
              >
                <SelectTrigger
                  id='onboarding-production-job'
                  className='w-full'
                >
                  <SelectValue
                    placeholder={
                      activeRates.isPending
                        ? 'Memuat pekerjaan...'
                        : 'Pilih pekerjaan'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {activeJobs.map((job) => (
                    <SelectItem key={job.uid} value={job.uid}>
                      {job.code} · {job.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!activeRates.isPending && activeJobs.length === 0 ? (
                <p className='text-xs text-destructive'>
                  Belum ada pekerjaan dengan tarif aktif di {site} pada tanggal
                  ini.
                </p>
              ) : (
                <p className='text-xs text-muted-foreground'>
                  Hanya pekerjaan dengan tarif aktif di {site} yang ditampilkan.
                </p>
              )}
            </div>
          </div>

          <div className='rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-300'>
            Berlaku mulai hari ini dan menjadi pekerjaan utama karyawan.
          </div>

          <div className='rounded-md border'>
            <div className='border-b bg-muted/30 px-4 py-2.5 text-sm font-medium'>
              {employees.length} karyawan akan ditugaskan
            </div>
            <div className='max-h-64 overflow-auto'>
              <Table>
                <TableHeader className='sticky top-0 z-10 bg-background'>
                  <TableRow>
                    <TableHead>Karyawan</TableHead>
                    <TableHead>Bagian Produksi</TableHead>
                    <TableHead className='w-28'>Site</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
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
                      <TableCell>{employee.site}</TableCell>
                    </TableRow>
                  ))}
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

function apiMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback
  const response = (error as { response?: { data?: { message?: unknown } } })
    .response
  return typeof response?.data?.message === 'string'
    ? response.data.message
    : fallback
}
