import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  CircleDollarSign,
  LoaderCircle,
  Plus,
  Ruler,
  UsersRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import {
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import { hasPermission } from '@/features/auth/permissions'
import { AssignmentReadinessTable } from './assignment-readiness-table'
import {
  useProductionAssignmentReadiness,
  useProductionAssignments,
  useProductionCommand,
  useProductionJobs,
  useProductionRates,
  useProductionReadiness,
  useProductionUnits,
} from './data/queries'
import type {
  PaginatedProductionResult,
  ProductionAssignmentReadinessIssue,
  ProductionAssignmentReadinessItem,
  ProductionJob,
  ProductionRate,
  ProductionSite,
  WorkUnit,
} from './domain'

const sites: ProductionSite[] = ['JEPARA', 'SEMARANG', 'KLATEN']
type PageProps = { search: Record<string, unknown>; navigate: NavigateFn }
type EmployeeOption = {
  uid: string
  employeeNumber: string
  fullName: string
  site: ProductionSite
  employeeType: string
}
type PositionOption = { uid: string; code: string; name: string }
type AssignmentPreset = {
  employeeUid: string
  employeeNumber: string
  fullName: string
  site: ProductionSite
  effectiveFrom: string
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='grid gap-2'>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 4,
  }).format(Number(value))
}

function DateField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <DatePicker
      selected={dateOnlyFromInput(value)}
      onSelect={(date) => onChange(dateOnlyToInput(date))}
      placeholder={placeholder}
      fromYear={2020}
      toYear={new Date().getFullYear() + 5}
    />
  )
}

function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className='flex flex-wrap items-start justify-between gap-3'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>{title}</h1>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </div>
      {action}
    </div>
  )
}

function EmptyRows({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell
        colSpan={colSpan}
        className='h-28 text-center text-muted-foreground'
      >
        {text}
      </TableCell>
    </TableRow>
  )
}

function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className='flex items-center justify-between gap-3 text-sm'>
      <span className='text-muted-foreground'>
        {total.toLocaleString('id-ID')} data
      </span>
      <div className='flex items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Sebelumnya
        </Button>
        <span>
          {page} / {totalPages}
        </span>
        <Button
          variant='outline'
          size='sm'
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  )
}

function ReadinessPanel({
  onOpenAssignments,
}: {
  onOpenAssignments: (
    site: ProductionSite,
    issue: ProductionAssignmentReadinessIssue,
    asOf: string
  ) => void
}) {
  const query = useProductionReadiness()
  if (query.isLoading)
    return <div className='h-24 animate-pulse rounded-lg bg-muted' />
  if (query.isError)
    return (
      <p className='rounded-lg border border-destructive/30 p-3 text-sm text-destructive'>
        Readiness Produksi belum dapat dimuat.
      </p>
    )

  const assignmentIssueByBlocker: Partial<
    Record<string, ProductionAssignmentReadinessIssue>
  > = {
    EMPLOYEE_ASSIGNMENT_MISSING: 'UNASSIGNED',
    PRIMARY_ASSIGNMENT_MISSING: 'MISSING_PRIMARY',
    PRIMARY_ASSIGNMENT_AMBIGUOUS: 'AMBIGUOUS_PRIMARY',
  }

  return (
    <div className='grid gap-2 lg:grid-cols-3'>
      {(query.data?.sites ?? []).map((item) => (
        <Card
          key={item.site}
          className={
            item.status === 'READY'
              ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-background dark:from-emerald-950/20'
              : 'border-amber-200 bg-gradient-to-br from-amber-50/70 to-background dark:from-amber-950/20'
          }
        >
          <CardContent className='space-y-2 p-3'>
            <div className='flex items-center justify-between gap-2'>
              <div className='font-semibold'>{item.siteName}</div>
              <Badge
                variant={item.status === 'READY' ? 'default' : 'secondary'}
              >
                {item.status === 'READY' ? <CheckCircle2 /> : <AlertTriangle />}
                {item.status === 'READY' ? 'Siap' : 'Perlu dilengkapi'}
              </Badge>
            </div>
            <p className='text-xs text-muted-foreground'>
              {item.metrics.eligibleEmployees} pekerja eligible ·{' '}
              {item.metrics.assignedJobs} pekerjaan dipakai
            </p>
            {item.blockers.length > 0 && (
              <div className='space-y-1'>
                {item.blockers.map((blocker) => {
                  const assignmentIssue = assignmentIssueByBlocker[blocker.code]
                  const content = (
                    <>
                      <span className='flex min-w-0 items-start gap-1.5 text-left'>
                        <AlertTriangle className='mt-0.5 size-3.5 shrink-0' />
                        <span>{blocker.message}</span>
                      </span>
                      <Badge
                        variant='outline'
                        className='shrink-0 border-amber-300 bg-background/70'
                      >
                        {blocker.count}
                      </Badge>
                    </>
                  )

                  if (assignmentIssue) {
                    return (
                      <Button
                        key={blocker.code}
                        type='button'
                        variant='ghost'
                        className='h-auto w-full justify-between gap-2 px-2 py-1.5 text-xs whitespace-normal text-amber-800 hover:bg-amber-100/70 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-200'
                        onClick={() =>
                          onOpenAssignments(
                            item.site,
                            assignmentIssue,
                            query.data?.asOf ?? ''
                          )
                        }
                      >
                        {content}
                      </Button>
                    )
                  }

                  if (
                    blocker.code === 'ACTIVE_RATE_MISSING' ||
                    blocker.code === 'ACTIVE_RATE_AMBIGUOUS'
                  ) {
                    return (
                      <Button
                        key={blocker.code}
                        asChild
                        variant='ghost'
                        className='h-auto w-full justify-between gap-2 px-2 py-1.5 text-xs whitespace-normal text-amber-800 hover:bg-amber-100/70 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-950/40 dark:hover:text-amber-200'
                      >
                        <Link
                          to='/produksi/tarif-site'
                          search={{ site: [item.site] }}
                        >
                          {content}
                        </Link>
                      </Button>
                    )
                  }

                  return (
                    <div
                      key={blocker.code}
                      className='flex items-start justify-between gap-2 px-2 py-1.5 text-xs text-amber-800 dark:text-amber-300'
                    >
                      {content}
                    </div>
                  )
                })}
              </div>
            )}
            <div className='pt-0.5'>
              <Button
                type='button'
                size='sm'
                variant='ghost'
                className='h-8 w-full'
                onClick={() =>
                  onOpenAssignments(item.site, 'ALL', query.data?.asOf ?? '')
                }
              >
                <UsersRound className='size-3.5' /> Lihat semua pekerja eligible
              </Button>
            </div>
            {item.metrics.activeProductionAdmins === 0 && (
              <p className='text-[11px] text-muted-foreground'>
                Pengelolaan Admin Produksi belum tersedia dari halaman ini.
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function useReferenceOptions() {
  const units = useProductionUnits()
  const jobs = useProductionJobs()
  const positions = useQuery({
    queryKey: ['production-foundation', 'positions'],
    queryFn: async () =>
      (
        await apiClient.get<PaginatedProductionResult<PositionOption>>(
          '/production-structure/positions?category=PRODUCTION&pageSize=500&isActive=true'
        )
      ).data,
  })
  return { units, jobs, positions }
}

function WorkUnitDialog() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    code: '',
    name: '',
    decimalPrecision: 0,
    isActive: true,
  })
  const command = useProductionCommand()
  const save = () =>
    command.mutate(
      { path: '/production-structure/work-units', body: form },
      {
        onSuccess: () => {
          toast.success('Satuan berhasil ditambahkan.')
          setOpen(false)
        },
        onError: () => toast.error('Satuan gagal disimpan.'),
      }
    )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Tambah Satuan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Satuan Produksi</DialogTitle>
          <DialogDescription>
            Presisi tidak dapat diubah setelah satuan dipakai oleh tarif.
          </DialogDescription>
        </DialogHeader>
        <Field label='Kode'>
          <Input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder='Contoh: PCS'
          />
        </Field>
        <Field label='Nama'>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder='Contoh: Pieces'
          />
        </Field>
        <Field label='Jumlah desimal'>
          <Input
            type='number'
            min={0}
            max={4}
            value={form.decimalPrecision}
            onChange={(e) =>
              setForm({ ...form, decimalPrecision: Number(e.target.value) })
            }
          />
        </Field>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={
              !form.code.trim() || !form.name.trim() || command.isPending
            }
            onClick={save}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function JobDialog({
  units,
  positions,
}: {
  units: WorkUnit[]
  positions: PositionOption[]
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    defaultUnitUid: '',
    positionUid: '',
    category: '',
    isActive: true,
  })
  const command = useProductionCommand()
  const save = () =>
    command.mutate(
      {
        path: '/production-structure/jobs',
        body: {
          ...form,
          positionUid: form.positionUid || null,
          description: form.description || null,
          category: form.category || null,
        },
      },
      {
        onSuccess: () => {
          toast.success('Pekerjaan berhasil ditambahkan.')
          setOpen(false)
        },
        onError: () => toast.error('Pekerjaan gagal disimpan.'),
      }
    )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Tambah Pekerjaan
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Tambah Pekerjaan Produksi</DialogTitle>
          <DialogDescription>
            Pekerjaan menjadi referensi penugasan pekerja dan tarif per site.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label='Kode'>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </Field>
          <Field label='Nama'>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label='Satuan default'>
            <Select
              value={form.defaultUnitUid}
              onValueChange={(value) =>
                setForm({ ...form, defaultUnitUid: value })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Pilih satuan' />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.uid} value={unit.uid}>
                    {unit.code} · {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='Jabatan produksi'>
            <Select
              value={form.positionUid || 'NONE'}
              onValueChange={(value) =>
                setForm({ ...form, positionUid: value === 'NONE' ? '' : value })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Pilih jabatan' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='NONE'>Tanpa jabatan khusus</SelectItem>
                {positions.map((position) => (
                  <SelectItem key={position.uid} value={position.uid}>
                    {position.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='Kategori'>
            <Input
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              placeholder='Opsional'
            />
          </Field>
          <Field label='Deskripsi'>
            <Input
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder='Opsional'
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={
              !form.code ||
              !form.name ||
              !form.defaultUnitUid ||
              command.isPending
            }
            onClick={save}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AssignmentDialog({
  jobs,
  open,
  onOpenChange,
  preset,
}: {
  jobs: ProductionJob[]
  open: boolean
  onOpenChange: (open: boolean) => void
  preset?: AssignmentPreset | null
}) {
  const [form, setForm] = useState({
    site: preset?.site ?? ('JEPARA' as ProductionSite),
    employeeUid: preset?.employeeUid ?? '',
    jobUid: '',
    effectiveFrom: preset?.effectiveFrom ?? '',
    effectiveTo: '',
    isPrimary: true,
    reason: 'Penugasan awal pekerjaan Produksi.',
  })
  const command = useProductionCommand()
  const employees = useQuery({
    queryKey: ['production-foundation', 'employees', form.site],
    queryFn: async () =>
      (
        await apiClient.get<PaginatedProductionResult<EmployeeOption>>(
          `/employees?pageSize=500&employeeStatus=ACTIVE&employeeType=BORONGAN&employeeType=TRAINING&site=${form.site}`
        )
      ).data,
    enabled: open,
  })
  const employeeOptions = useMemo(() => {
    const items = employees.data?.items ?? []
    if (
      !preset ||
      items.some((employee) => employee.uid === preset.employeeUid)
    )
      return items
    return [
      {
        uid: preset.employeeUid,
        employeeNumber: preset.employeeNumber,
        fullName: preset.fullName,
        site: preset.site,
        employeeType: '',
      },
      ...items,
    ]
  }, [employees.data?.items, preset])
  const save = () =>
    command.mutate(
      {
        path: '/production-structure/assignments',
        body: { ...form, effectiveTo: form.effectiveTo || null },
      },
      {
        onSuccess: () => {
          toast.success('Penugasan pekerjaan berhasil dibuat.')
          onOpenChange(false)
        },
        onError: () =>
          toast.error(
            'Penugasan gagal. Periksa periode, site, dan histori karyawan.'
          ),
      }
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Atur Pekerjaan Karyawan</DialogTitle>
          <DialogDescription>
            Penugasan disimpan sebagai histori. Periode aktif tidak boleh
            bertumpang-tindih.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label='Site'>
            <Select
              value={form.site}
              onValueChange={(value: ProductionSite) =>
                setForm({ ...form, site: value, employeeUid: '' })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site} value={site}>
                    {site}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='Karyawan'>
            <Select
              value={form.employeeUid}
              onValueChange={(value) =>
                setForm({ ...form, employeeUid: value })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Pilih karyawan' />
              </SelectTrigger>
              <SelectContent>
                {employeeOptions.map((employee) => (
                  <SelectItem key={employee.uid} value={employee.uid}>
                    {employee.fullName} · {employee.employeeNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='Pekerjaan'>
            <Select
              value={form.jobUid}
              onValueChange={(value) => setForm({ ...form, jobUid: value })}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Pilih pekerjaan' />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((job) => (
                  <SelectItem key={job.uid} value={job.uid}>
                    {job.code} · {job.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='Tanggal mulai'>
            <DateField
              value={form.effectiveFrom}
              onChange={(value) => setForm({ ...form, effectiveFrom: value })}
              placeholder='Pilih tanggal mulai'
            />
          </Field>
          <Field label='Tanggal selesai (opsional)'>
            <DateField
              value={form.effectiveTo}
              onChange={(value) => setForm({ ...form, effectiveTo: value })}
              placeholder='Tanpa tanggal selesai'
            />
          </Field>
          <Field label='Alasan'>
            <Textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={
              !form.employeeUid ||
              !form.jobUid ||
              !form.effectiveFrom ||
              form.reason.trim().length < 10 ||
              command.isPending
            }
            onClick={save}
          >
            Simpan Penugasan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CloseAssignmentDialog({
  assignment,
}: {
  assignment: { uid: string; effectiveFrom: string; employeeName: string }
}) {
  const [open, setOpen] = useState(false)
  const [effectiveTo, setEffectiveTo] = useState('')
  const [reason, setReason] = useState(
    'Penutupan histori penugasan pekerjaan Produksi.'
  )
  const command = useProductionCommand()
  const save = () =>
    command.mutate(
      {
        path: `/production-structure/assignments/${assignment.uid}/close`,
        body: { effectiveTo, reason },
      },
      {
        onSuccess: () => {
          toast.success('Penugasan berhasil ditutup.')
          setOpen(false)
        },
        onError: () =>
          toast.error(
            'Penugasan gagal ditutup. Periksa tanggal dan transaksi yang sudah tercatat.'
          ),
      }
    )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size='sm' variant='outline'>
          Akhiri
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Akhiri Penugasan</DialogTitle>
          <DialogDescription>
            Akhiri penugasan {assignment.employeeName} tanpa menghapus
            historinya.
          </DialogDescription>
        </DialogHeader>
        <Field label='Tanggal selesai'>
          <DateField
            value={effectiveTo}
            onChange={setEffectiveTo}
            placeholder='Pilih tanggal selesai'
          />
        </Field>
        <Field label='Alasan'>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={
              !effectiveTo ||
              effectiveTo < assignment.effectiveFrom ||
              reason.trim().length < 10 ||
              command.isPending
            }
            onClick={save}
          >
            Akhiri Penugasan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RateDialog({ jobs }: { jobs: ProductionJob[] }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    site: 'JEPARA' as ProductionSite,
    jobUid: '',
    effectiveFrom: '',
    effectiveTo: '',
    rateAmount: '',
    referenceNumber: '',
    notes: '',
  })
  const command = useProductionCommand()
  const selectedJob = jobs.find((job) => job.uid === form.jobUid)
  const save = () =>
    command.mutate(
      {
        path: '/production-structure/rates',
        body: {
          ...form,
          unitUid: selectedJob?.defaultUnitUid,
          effectiveTo: form.effectiveTo || null,
          referenceNumber: form.referenceNumber || null,
          notes: form.notes || null,
        },
      },
      {
        onSuccess: () => {
          toast.success(
            'Draft tarif berhasil dibuat. Aktifkan setelah diperiksa.'
          )
          setOpen(false)
        },
        onError: () => toast.error('Draft tarif gagal disimpan.'),
      }
    )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Buat Draft Tarif
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Buat Draft Tarif</DialogTitle>
          <DialogDescription>
            Draft belum digunakan transaksi sampai diaktifkan secara eksplisit.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label='Site'>
            <Select
              value={form.site}
              onValueChange={(value: ProductionSite) =>
                setForm({ ...form, site: value })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site} value={site}>
                    {site}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='Pekerjaan'>
            <Select
              value={form.jobUid}
              onValueChange={(value) => setForm({ ...form, jobUid: value })}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Pilih pekerjaan' />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((job) => (
                  <SelectItem key={job.uid} value={job.uid}>
                    {job.name} · {job.defaultUnitCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='Tanggal mulai'>
            <DateField
              value={form.effectiveFrom}
              onChange={(value) => setForm({ ...form, effectiveFrom: value })}
              placeholder='Pilih tanggal mulai'
            />
          </Field>
          <Field label='Tanggal selesai (opsional)'>
            <DateField
              value={form.effectiveTo}
              onChange={(value) => setForm({ ...form, effectiveTo: value })}
              placeholder='Tanpa tanggal selesai'
            />
          </Field>
          <Field label={`Tarif (${selectedJob?.defaultUnitCode ?? 'satuan'})`}>
            <Input
              inputMode='decimal'
              value={form.rateAmount}
              onChange={(e) => setForm({ ...form, rateAmount: e.target.value })}
              placeholder='Contoh: 1200'
            />
          </Field>
          <Field label='Nomor referensi'>
            <Input
              value={form.referenceNumber}
              onChange={(e) =>
                setForm({ ...form, referenceNumber: e.target.value })
              }
              placeholder='Opsional'
            />
          </Field>
        </div>
        <Field label='Catatan'>
          <Textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder='Opsional'
          />
        </Field>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={
              !form.jobUid ||
              !form.effectiveFrom ||
              !form.rateAmount ||
              command.isPending
            }
            onClick={save}
          >
            Simpan Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FilterBar({
  query,
  site,
  status,
  statuses,
  onChange,
}: {
  query: string
  site: string
  status: string
  statuses: string[]
  onChange: (patch: Record<string, unknown>) => void
}) {
  return (
    <div className='flex flex-wrap gap-2'>
      <Input
        className='w-full sm:w-64'
        value={query}
        onChange={(e) => onChange({ filter: e.target.value, page: 1 })}
        placeholder='Cari data...'
      />
      <Select
        value={site || 'ALL'}
        onValueChange={(value) =>
          onChange({ site: value === 'ALL' ? undefined : [value], page: 1 })
        }
      >
        <SelectTrigger className='w-full sm:w-40'>
          <SelectValue placeholder='Semua site' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='ALL'>Semua site</SelectItem>
          {sites.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={status || 'ALL'}
        onValueChange={(value) =>
          onChange({ status: value === 'ALL' ? undefined : [value], page: 1 })
        }
      >
        <SelectTrigger className='w-full sm:w-44'>
          <SelectValue placeholder='Semua status' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='ALL'>Semua status</SelectItem>
          {statuses.map((item) => (
            <SelectItem key={item} value={item}>
              {item}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function ProductionJobMasterPage({ search, navigate }: PageProps) {
  const session = useAuthStore((state) => state.session)
  const canManage = hasPermission(session, 'production.manage_master')
  const tab = String(search.tab ?? 'jobs')
  const assignmentView = String(search.assignmentView ?? 'readiness')
  const page = Number(search.page ?? 1)
  const pageSize = Number(search.pageSize ?? 50)
  const filter = String(search.filter ?? '')
  const asOf = typeof search.asOf === 'string' ? search.asOf : undefined
  const issue = (search.issue ?? 'ALL') as ProductionAssignmentReadinessIssue
  const site = Array.isArray(search.site)
    ? (search.site as ProductionSite[])
    : []
  const status = Array.isArray(search.status) ? (search.status as string[]) : []
  const employeeType = Array.isArray(search.employeeType)
    ? (search.employeeType as string[])
    : []
  const productionSectionUid = Array.isArray(search.productionSectionUid)
    ? (search.productionSectionUid as string[])
    : []
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [assignmentPreset, setAssignmentPreset] =
    useState<AssignmentPreset | null>(null)
  const refs = useReferenceOptions()
  const assignments = useProductionAssignments({
    page,
    pageSize,
    query: filter,
    site,
    status,
  })
  const assignmentReadiness = useProductionAssignmentReadiness(
    {
      page,
      pageSize,
      query: filter,
      site,
      asOf,
      issue,
      employeeType,
      productionSectionUid,
    },
    tab === 'assignments' && assignmentView === 'readiness'
  )
  const setSearch = (patch: Record<string, unknown>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch }) })
  const openAssignment = (row?: ProductionAssignmentReadinessItem) => {
    setAssignmentPreset(
      row
        ? {
            employeeUid: row.employee.uid,
            employeeNumber: row.employee.employeeNumber,
            fullName: row.employee.fullName,
            site: row.site.code,
            effectiveFrom: assignmentReadiness.data?.asOf ?? asOf ?? '',
          }
        : null
    )
    setAssignmentDialogOpen(true)
  }
  return (
    <Main className='space-y-5'>
      <PageHeader
        title='Master Pekerjaan Produksi'
        description='Kelola pekerjaan, satuan, penugasan pekerja, dan kesiapan operasional per site.'
      />
      <ReadinessPanel
        onOpenAssignments={(selectedSite, selectedIssue, selectedAsOf) =>
          setSearch({
            tab: 'assignments',
            assignmentView: 'readiness',
            site: [selectedSite],
            issue: selectedIssue === 'ALL' ? undefined : selectedIssue,
            asOf: selectedAsOf || undefined,
            filter: undefined,
            status: undefined,
            employeeType: undefined,
            productionSectionUid: undefined,
            page: 1,
          })
        }
      />
      <Tabs
        value={tab}
        onValueChange={(value) =>
          setSearch({
            tab: value,
            page: 1,
            filter: undefined,
            status: undefined,
            issue: undefined,
            employeeType: undefined,
            productionSectionUid: undefined,
          })
        }
      >
        <TabsList className='h-10 max-w-full justify-start overflow-x-auto'>
          <TabsTrigger value='jobs' className='h-9 px-4'>
            <BriefcaseBusiness /> Pekerjaan
          </TabsTrigger>
          <TabsTrigger value='units' className='h-9 px-4'>
            <Ruler /> Satuan
          </TabsTrigger>
          <TabsTrigger value='assignments' className='h-9 px-4'>
            <UsersRound /> Penugasan
          </TabsTrigger>
        </TabsList>
        <TabsContent value='jobs' className='space-y-3'>
          <div className='flex justify-end'>
            {canManage && (
              <JobDialog
                units={refs.units.data?.items ?? []}
                positions={refs.positions.data?.items ?? []}
              />
            )}
          </div>
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode & Pekerjaan</TableHead>
                  <TableHead>Satuan</TableHead>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(refs.jobs.data?.items ?? []).map((job) => (
                  <TableRow key={job.uid}>
                    <TableCell>
                      <div className='font-medium'>{job.name}</div>
                      <div className='text-xs text-muted-foreground'>
                        {job.code}
                      </div>
                    </TableCell>
                    <TableCell>
                      {job.defaultUnitName} ({job.defaultUnitCode})
                    </TableCell>
                    <TableCell>
                      {job.positionName ?? 'Semua jabatan produksi'}
                    </TableCell>
                    <TableCell>{job.category ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={job.isActive ? 'default' : 'secondary'}>
                        {job.isActive ? 'Aktif' : 'Tidak aktif'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!refs.jobs.isLoading && !refs.jobs.data?.items.length && (
                  <EmptyRows colSpan={5} text='Belum ada pekerjaan Produksi.' />
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value='units' className='space-y-3'>
          <div className='flex justify-end'>
            {canManage && <WorkUnitDialog />}
          </div>
          <div className='rounded-md border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama Satuan</TableHead>
                  <TableHead>Presisi</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(refs.units.data?.items ?? []).map((unit) => (
                  <TableRow key={unit.uid}>
                    <TableCell className='font-medium'>{unit.code}</TableCell>
                    <TableCell>{unit.name}</TableCell>
                    <TableCell>{unit.decimalPrecision} desimal</TableCell>
                    <TableCell>
                      <Badge variant={unit.isActive ? 'default' : 'secondary'}>
                        {unit.isActive ? 'Aktif' : 'Tidak aktif'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {!refs.units.isLoading && !refs.units.data?.items.length && (
                  <EmptyRows colSpan={4} text='Belum ada satuan Produksi.' />
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value='assignments' className='space-y-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='inline-flex rounded-lg border bg-muted/40 p-1'>
              <Button
                type='button'
                size='sm'
                variant={assignmentView === 'readiness' ? 'secondary' : 'ghost'}
                className='h-8'
                onClick={() =>
                  setSearch({
                    assignmentView: 'readiness',
                    status: undefined,
                    page: 1,
                  })
                }
              >
                Kesiapan Pekerja
              </Button>
              <Button
                type='button'
                size='sm'
                variant={assignmentView === 'history' ? 'secondary' : 'ghost'}
                className='h-8'
                onClick={() =>
                  setSearch({
                    assignmentView: 'history',
                    issue: undefined,
                    employeeType: undefined,
                    productionSectionUid: undefined,
                    asOf: undefined,
                    page: 1,
                  })
                }
              >
                Histori Penugasan
              </Button>
            </div>
            {canManage && (
              <Button type='button' onClick={() => openAssignment()}>
                <Plus /> Atur Pekerjaan
              </Button>
            )}
          </div>
          {assignmentView === 'readiness' ? (
            <AssignmentReadinessTable
              data={assignmentReadiness.data}
              search={search}
              navigate={navigate}
              isPending={assignmentReadiness.isPending}
              isFetching={assignmentReadiness.isFetching}
              isError={assignmentReadiness.isError}
              onRetry={() => assignmentReadiness.refetch()}
              canManage={canManage}
              onAssign={openAssignment}
              onInspectHistory={(row) =>
                setSearch({
                  assignmentView: 'history',
                  filter: row.employee.employeeNumber,
                  site: [row.site.code],
                  issue: undefined,
                  employeeType: undefined,
                  productionSectionUid: undefined,
                  asOf: undefined,
                  page: 1,
                })
              }
            />
          ) : (
            <>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <FilterBar
                  query={filter}
                  site={site[0] ?? ''}
                  status={status[0] ?? ''}
                  statuses={['ACTIVE', 'UPCOMING', 'ENDED']}
                  onChange={setSearch}
                />
              </div>
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead>Pekerjaan</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead>Status</TableHead>
                      {canManage && (
                        <TableHead className='text-right'>Aksi</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(assignments.data?.items ?? []).map((row) => (
                      <TableRow key={row.uid}>
                        <TableCell>
                          <div className='font-medium'>
                            {row.employee.fullName}
                          </div>
                          <div className='text-xs text-muted-foreground'>
                            {row.site} · {row.employee.employeeNumber}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>{row.job.name}</div>
                          <div className='text-xs text-muted-foreground'>
                            {row.job.code}
                            {row.isPrimary ? ' · Utama' : ''}
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.effectiveFrom} —{' '}
                          {row.effectiveTo ?? 'seterusnya'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.status === 'ACTIVE' ? 'default' : 'secondary'
                            }
                          >
                            {row.status}
                          </Badge>
                        </TableCell>
                        {canManage && (
                          <TableCell className='text-right'>
                            {row.status !== 'ENDED' && (
                              <CloseAssignmentDialog
                                assignment={{
                                  uid: row.uid,
                                  effectiveFrom: row.effectiveFrom,
                                  employeeName: row.employee.fullName,
                                }}
                              />
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {!assignments.isLoading &&
                      !assignments.data?.items.length && (
                        <EmptyRows
                          colSpan={canManage ? 5 : 4}
                          text='Belum ada penugasan sesuai filter.'
                        />
                      )}
                  </TableBody>
                </Table>
              </div>
              {assignments.data && (
                <Pagination
                  page={assignments.data.page}
                  pageSize={assignments.data.pageSize}
                  total={assignments.data.total}
                  onPage={(value) => setSearch({ page: value })}
                />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
      {assignmentDialogOpen && (
        <AssignmentDialog
          jobs={refs.jobs.data?.items ?? []}
          open={assignmentDialogOpen}
          onOpenChange={setAssignmentDialogOpen}
          preset={assignmentPreset}
        />
      )}
    </Main>
  )
}

export function ProductionRatePage({ search, navigate }: PageProps) {
  const session = useAuthStore((state) => state.session)
  const canManage = hasPermission(session, 'production.manage_master')
  const page = Number(search.page ?? 1)
  const pageSize = Number(search.pageSize ?? 50)
  const filter = String(search.filter ?? '')
  const site = Array.isArray(search.site)
    ? (search.site as ProductionSite[])
    : []
  const status = Array.isArray(search.status) ? (search.status as string[]) : []
  const jobs = useProductionJobs()
  const rates = useProductionRates({
    page,
    pageSize,
    query: filter,
    site,
    status,
  })
  const command = useProductionCommand()
  const setSearch = (patch: Record<string, unknown>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch }) })
  const visibleRates = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return needle
      ? (rates.data?.items ?? []).filter((rate) =>
          `${rate.site} ${rate.jobCode} ${rate.jobName}`
            .toLowerCase()
            .includes(needle)
        )
      : (rates.data?.items ?? [])
  }, [filter, rates.data?.items])
  const activate = async (rate: ProductionRate) => {
    const searchParams = new URLSearchParams({
      pageSize: '500',
      site: rate.site,
      jobUid: rate.jobUid,
      status: 'ACTIVE',
    })
    const activeRates = (
      await apiClient.get<PaginatedProductionResult<ProductionRate>>(
        `/production-structure/rates?${searchParams}`
      )
    ).data.items
    const replaced = activeRates.find(
      (candidate) =>
        candidate.effectiveFrom <= (rate.effectiveTo ?? '9999-12-31') &&
        (candidate.effectiveTo ?? '9999-12-31') >= rate.effectiveFrom
    )
    command.mutate(
      {
        path: `/production-structure/rates/${rate.uid}/activate`,
        body: {
          replaceActiveRateUid: replaced?.uid ?? null,
          reason: 'Aktivasi tarif Produksi setelah verifikasi master.',
        },
      },
      {
        onSuccess: () => toast.success('Tarif berhasil diaktifkan.'),
        onError: () =>
          toast.error('Tarif gagal diaktifkan. Periksa periode tarif aktif.'),
      }
    )
  }
  return (
    <Main className='space-y-5'>
      <PageHeader
        title='Tarif Produksi per Site'
        description='Tarif baru disimpan sebagai Draft. Aktifkan setelah nilai dan periode selesai diverifikasi.'
        action={
          canManage ? <RateDialog jobs={jobs.data?.items ?? []} /> : undefined
        }
      />
      <div className='flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50/70 p-3 text-sm text-sky-900 dark:bg-sky-950/20 dark:text-sky-200'>
        <CircleDollarSign className='size-4' /> Tarif aktif menjadi sumber nilai
        transaksi Produksi sesuai tanggal setoran.
      </div>
      <FilterBar
        query={filter}
        site={site[0] ?? ''}
        status={status[0] ?? ''}
        statuses={['DRAFT', 'ACTIVE', 'INACTIVE']}
        onChange={setSearch}
      />
      {rates.isFetching && (
        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
          <LoaderCircle className='size-3 animate-spin' /> Memperbarui tarif...
        </div>
      )}
      <div className='rounded-md border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Site & Pekerjaan</TableHead>
              <TableHead>Satuan</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead>Tarif</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className='text-right'>Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRates.map((rate) => (
              <TableRow key={rate.uid}>
                <TableCell>
                  <div className='font-medium'>{rate.jobName}</div>
                  <div className='text-xs text-muted-foreground'>
                    {rate.site} · {rate.jobCode}
                  </div>
                </TableCell>
                <TableCell>{rate.unitName}</TableCell>
                <TableCell>
                  {rate.effectiveFrom} — {rate.effectiveTo ?? 'seterusnya'}
                </TableCell>
                <TableCell className='font-medium'>
                  {formatCurrency(rate.rateAmount)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={rate.status === 'ACTIVE' ? 'default' : 'secondary'}
                  >
                    {rate.status}
                  </Badge>
                </TableCell>
                {canManage && (
                  <TableCell className='text-right'>
                    {rate.status === 'DRAFT' && (
                      <Button
                        size='sm'
                        variant='outline'
                        disabled={command.isPending}
                        onClick={() => activate(rate)}
                      >
                        Aktifkan
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
            {!rates.isLoading && !visibleRates.length && (
              <EmptyRows
                colSpan={canManage ? 6 : 5}
                text='Belum ada tarif sesuai filter.'
              />
            )}
          </TableBody>
        </Table>
      </div>
      {rates.data && (
        <Pagination
          page={rates.data.page}
          pageSize={rates.data.pageSize}
          total={rates.data.total}
          onPage={(value) => setSearch({ page: value })}
        />
      )}
    </Main>
  )
}
