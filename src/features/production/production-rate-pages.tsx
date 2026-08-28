import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  LoaderCircle,
  PencilLine,
  Ban,
  Plus,
  Ruler,
  UsersRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { apiClient } from '@/lib/api-client'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
  useCorrectProductionAssignment,
  useCorrectProductionRate,
  useCancelProductionRate,
  useProductionCommand,
  useProductionJobs,
  useProductionRates,
  useProductionReadiness,
  useProductionUnits,
  usePreviewProductionAssignmentCorrection,
  usePreviewProductionRateCancellation,
  usePreviewProductionRateCorrection,
} from './data/queries'
import type {
  PaginatedProductionResult,
  ProductionAssignment,
  ProductionAssignmentReadinessIssue,
  ProductionAssignmentReadinessItem,
  ProductionEligibleEmployee,
  ProductionJob,
  ProductionRate,
  ProductionSite,
  WorkUnit,
} from './domain'
import { ProductionEmployeePicker } from './production-employee-picker'
import {
  formatProductionDecimalInput,
  normalizeProductionDecimalInput,
} from './production-terminal-policy'

const sites: ProductionSite[] = ['JEPARA', 'SEMARANG', 'KLATEN']
type PageProps = { search: Record<string, unknown>; navigate: NavigateFn }
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

function createIdempotencyKey() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `production-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

function apiMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback
  const response = (error as { response?: { data?: { message?: unknown } } })
    .response
  return typeof response?.data?.message === 'string'
    ? response.data.message
    : fallback
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
  const [open, setOpen] = useState(false)
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

  const readinessSites = query.data?.sites ?? []
  const blockedSites = readinessSites.filter(
    (item) => item.status !== 'READY'
  ).length

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className='rounded-lg border bg-card'
    >
      <div className='flex flex-wrap items-center gap-3 p-3'>
        <div className='flex min-w-0 items-start gap-2'>
          {blockedSites === 0 ? (
            <CheckCircle2 className='mt-0.5 size-4 shrink-0 text-positive' />
          ) : (
            <AlertTriangle className='mt-0.5 size-4 shrink-0 text-warning-foreground' />
          )}
          <div className='min-w-0'>
            <h2 className='text-sm font-semibold'>
              Kesiapan Produksi per Site
            </h2>
            <p className='text-xs text-muted-foreground'>
              {blockedSites === 0
                ? `${readinessSites.length} site siap digunakan.`
                : `${blockedSites} dari ${readinessSites.length} site perlu dilengkapi.`}
            </p>
          </div>
        </div>
        <Badge
          variant={blockedSites === 0 ? 'default' : 'outline'}
          className='max-sm:order-3'
        >
          {blockedSites === 0
            ? 'Semua siap'
            : `${blockedSites} perlu perhatian`}
        </Badge>
        <CollapsibleTrigger asChild>
          <Button size='sm' variant='ghost' className='group ml-auto'>
            {open ? 'Ringkas' : 'Lihat detail'}
            <ChevronDown className='transition-transform group-data-[state=open]:rotate-180' />
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className='border-t p-3'>
        <div className='grid gap-2 lg:grid-cols-3'>
          {readinessSites.map((item) => (
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
                    {item.status === 'READY' ? (
                      <CheckCircle2 />
                    ) : (
                      <AlertTriangle />
                    )}
                    {item.status === 'READY' ? 'Siap' : 'Perlu dilengkapi'}
                  </Badge>
                </div>
                <p className='text-xs text-muted-foreground'>
                  {item.metrics.eligibleEmployees} pekerja eligible ·{' '}
                  {item.metrics.assignedJobs} pekerjaan dipakai ·{' '}
                  {item.metrics.readyProductionDevices ?? 0} terminal siap
                </p>
                {item.blockers.length > 0 && (
                  <div className='space-y-1'>
                    {item.blockers.map((blocker) => {
                      const assignmentIssue =
                        assignmentIssueByBlocker[blocker.code]
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
                      onOpenAssignments(
                        item.site,
                        'ALL',
                        query.data?.asOf ?? ''
                      )
                    }
                  >
                    <UsersRound className='size-3.5' /> Lihat semua pekerja
                    eligible
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
      </CollapsibleContent>
    </Collapsible>
  )
}

function useReferenceOptions() {
  const units = useProductionUnits({ pageSize: 500, isActive: undefined })
  const jobs = useProductionJobs({ pageSize: 500, isActive: undefined })
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
  const [selectedEmployee, setSelectedEmployee] = useState<
    | Pick<
        ProductionEligibleEmployee,
        'uid' | 'fullName' | 'employeeNumber' | 'employeeType' | 'site'
      >
    | undefined
  >(
    preset
      ? {
          uid: preset.employeeUid,
          employeeNumber: preset.employeeNumber,
          fullName: preset.fullName,
          employeeType: '',
          site: preset.site,
        }
      : undefined
  )
  const command = useProductionCommand()
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
              onValueChange={(value: ProductionSite) => {
                setForm({ ...form, site: value, employeeUid: '' })
                setSelectedEmployee(undefined)
              }}
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
          <Field label='Tanggal mulai'>
            <DateField
              value={form.effectiveFrom}
              onChange={(value) => {
                setForm({ ...form, effectiveFrom: value, employeeUid: '' })
                setSelectedEmployee(undefined)
              }}
              placeholder='Pilih tanggal mulai'
            />
          </Field>
          <Field label='Karyawan'>
            <ProductionEmployeePicker
              site={form.site}
              asOf={form.effectiveFrom}
              value={form.employeeUid}
              selected={selectedEmployee}
              onChange={(employee) => {
                setSelectedEmployee(employee)
                setForm({ ...form, employeeUid: employee.uid })
              }}
            />
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
          <div className='sm:col-span-2'>
            <Field label='Jenis penugasan'>
              <RadioGroup
                value={form.isPrimary ? 'PRIMARY' : 'ADDITIONAL'}
                onValueChange={(value) =>
                  setForm({ ...form, isPrimary: value === 'PRIMARY' })
                }
                className='grid gap-2 sm:grid-cols-2'
              >
                <Label
                  htmlFor='production-assignment-primary'
                  className='flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/[0.04]'
                >
                  <RadioGroupItem
                    id='production-assignment-primary'
                    value='PRIMARY'
                    className='mt-0.5'
                  />
                  <span>
                    <span className='block font-medium'>Pekerjaan utama</span>
                    <span className='mt-0.5 block text-xs font-normal text-muted-foreground'>
                      Menjadi pilihan bawaan terminal. Tepat satu pekerjaan
                      utama wajib aktif pada tanggal yang sama.
                    </span>
                  </span>
                </Label>
                <Label
                  htmlFor='production-assignment-additional'
                  className='flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/[0.04]'
                >
                  <RadioGroupItem
                    id='production-assignment-additional'
                    value='ADDITIONAL'
                    className='mt-0.5'
                  />
                  <span>
                    <span className='block font-medium'>
                      Pekerjaan tambahan
                    </span>
                    <span className='mt-0.5 block text-xs font-normal text-muted-foreground'>
                      Tersedia sebagai pilihan lain di terminal tanpa mengganti
                      pekerjaan utama.
                    </span>
                  </span>
                </Label>
              </RadioGroup>
            </Field>
          </div>
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

function AssignmentCorrectionDialog({
  assignment,
  jobs,
}: {
  assignment: ProductionAssignment
  jobs: ProductionJob[]
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    jobUid: assignment.job.uid,
    effectiveFrom: assignment.effectiveFrom,
    effectiveTo: assignment.effectiveTo ?? '',
    isPrimary: assignment.isPrimary,
  })
  const [reason, setReason] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey)
  const preview = usePreviewProductionAssignmentCorrection(assignment.uid)
  const correction = useCorrectProductionAssignment(assignment.uid)
  const resetPreview = () => {
    preview.reset()
    setIdempotencyKey(createIdempotencyKey())
  }
  const proposal = {
    jobUid: form.jobUid,
    effectiveFrom: form.effectiveFrom,
    effectiveTo: form.effectiveTo || null,
    isPrimary: form.isPrimary,
  }
  const valid = Boolean(
    form.jobUid &&
    form.effectiveFrom &&
    (!form.effectiveTo || form.effectiveTo >= form.effectiveFrom)
  )
  const apply = async () => {
    if (!preview.data?.canApply || reason.trim().length < 5) return
    try {
      await correction.mutateAsync({
        ...proposal,
        reason: reason.trim(),
        idempotencyKey,
      })
      toast.success('Histori penugasan berhasil dikoreksi.')
      setOpen(false)
    } catch (error) {
      toast.error(apiMessage(error, 'Koreksi penugasan gagal diterapkan.'))
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) return
        setForm({
          jobUid: assignment.job.uid,
          effectiveFrom: assignment.effectiveFrom,
          effectiveTo: assignment.effectiveTo ?? '',
          isPrimary: assignment.isPrimary,
        })
        setReason('')
        resetPreview()
      }}
    >
      <DialogTrigger asChild>
        <Button
          size='sm'
          variant='ghost'
          aria-label='Koreksi histori penugasan'
        >
          <PencilLine className='size-4' />
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Koreksi Histori Penugasan</DialogTitle>
          <DialogDescription>
            Periksa preview sebelum menerapkan. Transaksi Produksi yang sudah
            tercatat tidak ikut diubah.
          </DialogDescription>
        </DialogHeader>
        <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
          <p className='font-medium'>{assignment.employee.fullName}</p>
          <p className='text-xs text-muted-foreground'>
            {assignment.site} · {assignment.employee.employeeNumber}
          </p>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label='Pekerjaan yang benar'>
            <Select
              value={form.jobUid}
              onValueChange={(value) => {
                setForm({ ...form, jobUid: value })
                resetPreview()
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {jobs
                  .filter(
                    (job) => job.isActive || job.uid === assignment.job.uid
                  )
                  .map((job) => (
                    <SelectItem key={job.uid} value={job.uid}>
                      {job.name} · {job.code}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='Jenis penugasan'>
            <Select
              value={form.isPrimary ? 'PRIMARY' : 'ADDITIONAL'}
              onValueChange={(value) => {
                setForm({ ...form, isPrimary: value === 'PRIMARY' })
                resetPreview()
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='PRIMARY'>Pekerjaan utama</SelectItem>
                <SelectItem value='ADDITIONAL'>Pekerjaan tambahan</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label='Tanggal mulai yang benar'>
            <DateField
              value={form.effectiveFrom}
              onChange={(value) => {
                setForm({ ...form, effectiveFrom: value })
                resetPreview()
              }}
              placeholder='Tanggal mulai'
            />
          </Field>
          <Field label='Tanggal selesai (opsional)'>
            <DateField
              value={form.effectiveTo}
              onChange={(value) => {
                setForm({ ...form, effectiveTo: value })
                resetPreview()
              }}
              placeholder='Tanpa tanggal selesai'
            />
          </Field>
        </div>
        <Button
          type='button'
          variant='secondary'
          className='w-fit'
          disabled={!valid || preview.isPending}
          onClick={() =>
            preview.mutate(proposal, {
              onError: (error) =>
                toast.error(apiMessage(error, 'Preview koreksi gagal dibuat.')),
            })
          }
        >
          {preview.isPending && <LoaderCircle className='animate-spin' />}
          Preview perubahan
        </Button>
        {preview.data && (
          <div className='grid gap-2 sm:grid-cols-2'>
            <div className='rounded-lg border p-3 text-sm'>
              <p className='mb-2 text-xs font-semibold text-muted-foreground uppercase'>
                Sebelum
              </p>
              <p className='font-medium'>{preview.data.source.jobName}</p>
              <p>{preview.data.source.isPrimary ? 'Utama' : 'Tambahan'}</p>
              <p>
                {preview.data.source.effectiveFrom} —{' '}
                {preview.data.source.effectiveTo ?? 'seterusnya'}
              </p>
            </div>
            <div className='rounded-lg border border-primary/30 bg-primary/[0.03] p-3 text-sm'>
              <p className='mb-2 text-xs font-semibold text-muted-foreground uppercase'>
                Sesudah
              </p>
              <p className='font-medium'>{preview.data.proposed.job.name}</p>
              <p>{preview.data.proposed.isPrimary ? 'Utama' : 'Tambahan'}</p>
              <p>
                {preview.data.proposed.effectiveFrom} —{' '}
                {preview.data.proposed.effectiveTo ?? 'seterusnya'}
              </p>
            </div>
          </div>
        )}
        <Field label='Alasan koreksi'>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder='Jelaskan kesalahan histori yang diperbaiki.'
            disabled={!preview.data?.canApply}
          />
        </Field>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={
              !preview.data?.canApply ||
              reason.trim().length < 5 ||
              correction.isPending
            }
            onClick={() => void apply()}
          >
            {correction.isPending && <LoaderCircle className='animate-spin' />}
            Terapkan Koreksi
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
          rateAmount: normalizeProductionDecimalInput(form.rateAmount),
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
              onBlur={() =>
                setForm({
                  ...form,
                  rateAmount: formatProductionDecimalInput(form.rateAmount),
                })
              }
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

function ActiveRateCorrectionDialog({ rate }: { rate: ProductionRate }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    rateAmount: formatProductionDecimalInput(rate.rateAmount),
    effectiveTo: rate.effectiveTo ?? '',
    referenceNumber: rate.referenceNumber ?? '',
    notes: rate.notes ?? '',
  })
  const [reason, setReason] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey)
  const preview = usePreviewProductionRateCorrection(rate.uid)
  const correction = useCorrectProductionRate(rate.uid)
  const proposal = {
    rateAmount: normalizeProductionDecimalInput(form.rateAmount),
    effectiveTo: form.effectiveTo || null,
    referenceNumber: form.referenceNumber || null,
    notes: form.notes || null,
  }
  const resetPreview = () => {
    preview.reset()
    setIdempotencyKey(createIdempotencyKey())
  }
  const apply = async () => {
    if (!preview.data?.canApply || reason.trim().length < 5) return
    try {
      await correction.mutateAsync({
        ...proposal,
        reason: reason.trim(),
        idempotencyKey,
      })
      toast.success('Tarif aktif berhasil dikoreksi.')
      setOpen(false)
    } catch (error) {
      toast.error(apiMessage(error, 'Tarif tidak dapat dikoreksi.'))
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) return
        setForm({
          rateAmount: formatProductionDecimalInput(rate.rateAmount),
          effectiveTo: rate.effectiveTo ?? '',
          referenceNumber: rate.referenceNumber ?? '',
          notes: rate.notes ?? '',
        })
        setReason('')
        resetPreview()
      }}
    >
      <DialogTrigger asChild>
        <Button size='sm' variant='ghost' aria-label='Koreksi tarif aktif'>
          <PencilLine className='size-4' />
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Koreksi Tarif Aktif</DialogTitle>
          <DialogDescription>
            Hanya tarif yang belum pernah dipakai transaksi yang dapat
            dikoreksi.
          </DialogDescription>
        </DialogHeader>
        <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
          <p className='font-medium'>{rate.jobName}</p>
          <p className='text-xs text-muted-foreground'>
            {rate.site} · berlaku sejak {rate.effectiveFrom}
          </p>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label={`Tarif (${rate.unitCode})`}>
            <Input
              value={form.rateAmount}
              inputMode='decimal'
              onChange={(event) => {
                setForm({ ...form, rateAmount: event.target.value })
                resetPreview()
              }}
              onBlur={() =>
                setForm({
                  ...form,
                  rateAmount: formatProductionDecimalInput(form.rateAmount),
                })
              }
            />
          </Field>
          <Field label='Tanggal selesai (opsional)'>
            <DateField
              value={form.effectiveTo}
              onChange={(value) => {
                setForm({ ...form, effectiveTo: value })
                resetPreview()
              }}
              placeholder='Tanpa tanggal selesai'
            />
          </Field>
          <Field label='Nomor referensi'>
            <Input
              value={form.referenceNumber}
              onChange={(event) => {
                setForm({ ...form, referenceNumber: event.target.value })
                resetPreview()
              }}
              placeholder='Opsional'
            />
          </Field>
          <Field label='Catatan'>
            <Input
              value={form.notes}
              onChange={(event) => {
                setForm({ ...form, notes: event.target.value })
                resetPreview()
              }}
              placeholder='Opsional'
            />
          </Field>
        </div>
        <Button
          type='button'
          variant='secondary'
          className='w-fit'
          disabled={!form.rateAmount || preview.isPending}
          onClick={() =>
            preview.mutate(proposal, {
              onError: (error) =>
                toast.error(
                  apiMessage(error, 'Preview koreksi tarif gagal dibuat.')
                ),
            })
          }
        >
          {preview.isPending && <LoaderCircle className='animate-spin' />}
          Preview perubahan
        </Button>
        {preview.data && (
          <div className='grid gap-2 sm:grid-cols-2'>
            <div className='rounded-lg border p-3 text-sm'>
              <p className='text-xs text-muted-foreground'>Tarif sebelum</p>
              <p className='text-lg font-semibold'>
                {formatCurrency(preview.data.source.rateAmount)}
              </p>
            </div>
            <div className='rounded-lg border border-primary/30 bg-primary/[0.03] p-3 text-sm'>
              <p className='text-xs text-muted-foreground'>Tarif sesudah</p>
              <p className='text-lg font-semibold'>
                {formatCurrency(preview.data.proposed.rateAmount)}
              </p>
            </div>
          </div>
        )}
        <Field label='Alasan koreksi'>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder='Jelaskan mengapa tarif aktif perlu diperbaiki.'
            disabled={!preview.data?.canApply}
          />
        </Field>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={
              !preview.data?.canApply ||
              reason.trim().length < 5 ||
              correction.isPending
            }
            onClick={() => void apply()}
          >
            {correction.isPending && <LoaderCircle className='animate-spin' />}
            Terapkan Koreksi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActiveRateCancellationDialog({ rate }: { rate: ProductionRate }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey)
  const preview = usePreviewProductionRateCancellation(rate.uid)
  const cancel = useCancelProductionRate(rate.uid)
  const apply = async () => {
    if (!preview.data?.canApply || reason.trim().length < 5) return
    try {
      await cancel.mutateAsync({ reason: reason.trim(), idempotencyKey })
      toast.success('Tarif aktif berhasil dibatalkan.')
      setOpen(false)
    } catch (error) {
      toast.error(apiMessage(error, 'Tarif tidak dapat dibatalkan.'))
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) return
        setReason('')
        setIdempotencyKey(createIdempotencyKey())
        preview.reset()
        preview.mutate(
          {},
          {
            onError: (error) =>
              toast.error(
                apiMessage(error, 'Preview pembatalan tarif gagal dibuat.')
              ),
          }
        )
      }}
    >
      <DialogTrigger asChild>
        <Button
          size='sm'
          variant='ghost'
          className='text-destructive'
          aria-label='Batalkan tarif aktif'
        >
          <Ban className='size-4' />
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Batalkan Tarif Aktif?</DialogTitle>
          <DialogDescription>
            Pembatalan hanya tersedia bila tarif belum pernah digunakan
            transaksi.
          </DialogDescription>
        </DialogHeader>
        {preview.isPending ? (
          <div className='h-24 animate-pulse rounded-lg bg-muted' />
        ) : preview.data ? (
          <div className='rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 dark:bg-amber-950/20 dark:text-amber-200'>
            <p className='font-medium'>
              {preview.data.source.jobName} · {preview.data.source.site}
            </p>
            <p>
              {formatCurrency(preview.data.source.rateAmount)} per satuan hasil
            </p>
          </div>
        ) : null}
        <Field label='Alasan pembatalan'>
          <Textarea
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              setIdempotencyKey(createIdempotencyKey())
            }}
            placeholder='Jelaskan alasan pembatalan tarif.'
            disabled={!preview.data?.canApply}
          />
        </Field>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Kembali
          </Button>
          <Button
            variant='destructive'
            disabled={
              !preview.data?.canApply ||
              reason.trim().length < 5 ||
              cancel.isPending
            }
            onClick={() => void apply()}
          >
            {cancel.isPending && <LoaderCircle className='animate-spin' />}
            Batalkan Tarif
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
  searchPlaceholder = 'Cari data...',
  showSite = true,
  showStatus = true,
  onChange,
}: {
  query: string
  site: string
  status: string
  statuses: string[]
  searchPlaceholder?: string
  showSite?: boolean
  showStatus?: boolean
  onChange: (patch: Record<string, unknown>) => void
}) {
  const hasFilters = Boolean(
    query || (showSite && site) || (showStatus && status)
  )
  return (
    <div className='flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap lg:w-auto'>
      <Input
        className='w-full sm:w-64'
        value={query}
        onChange={(e) => onChange({ filter: e.target.value, page: 1 })}
        placeholder={searchPlaceholder}
      />
      {showSite && (
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
      )}
      {showStatus && (
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
      )}
      {hasFilters && (
        <Button
          type='button'
          variant='ghost'
          className='w-full sm:w-auto'
          onClick={() =>
            onChange({
              filter: undefined,
              site: undefined,
              status: undefined,
              page: 1,
            })
          }
        >
          Reset <X />
        </Button>
      )}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function filterProductionJobs(jobs: ProductionJob[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return jobs
  return jobs.filter((job) =>
    [
      job.code,
      job.name,
      job.defaultUnitCode,
      job.defaultUnitName,
      job.positionName,
      job.category,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle))
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function filterProductionUnits(units: WorkUnit[], query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return units
  return units.filter((unit) =>
    [unit.code, unit.name].some((value) => value.toLowerCase().includes(needle))
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
  const visibleJobs = filterProductionJobs(refs.jobs.data?.items ?? [], filter)
  const visibleUnits = filterProductionUnits(
    refs.units.data?.items ?? [],
    filter
  )
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
        <TabsList className='h-auto max-w-full justify-start gap-1 overflow-x-auto p-1'>
          <TabsTrigger value='jobs' className='h-10 flex-none px-4'>
            <BriefcaseBusiness /> Pekerjaan
          </TabsTrigger>
          <TabsTrigger value='units' className='h-10 flex-none px-4'>
            <Ruler /> Satuan
          </TabsTrigger>
          <TabsTrigger value='assignments' className='h-10 flex-none px-4'>
            <UsersRound /> Penugasan
          </TabsTrigger>
        </TabsList>
        <TabsContent value='jobs' className='space-y-3'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
            <FilterBar
              query={filter}
              site=''
              status=''
              statuses={[]}
              searchPlaceholder='Cari kode atau pekerjaan...'
              showSite={false}
              showStatus={false}
              onChange={setSearch}
            />
            <div className='flex justify-end'>
              {canManage && (
                <JobDialog
                  units={(refs.units.data?.items ?? []).filter(
                    (unit) => unit.isActive
                  )}
                  positions={refs.positions.data?.items ?? []}
                />
              )}
            </div>
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
                {visibleJobs.map((job) => (
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
                {!refs.jobs.isLoading && !visibleJobs.length && (
                  <EmptyRows
                    colSpan={5}
                    text={
                      filter
                        ? 'Belum ada pekerjaan sesuai pencarian.'
                        : 'Belum ada pekerjaan Produksi.'
                    }
                  />
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        <TabsContent value='units' className='space-y-3'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
            <FilterBar
              query={filter}
              site=''
              status=''
              statuses={[]}
              searchPlaceholder='Cari kode atau satuan...'
              showSite={false}
              showStatus={false}
              onChange={setSearch}
            />
            <div className='flex justify-end'>
              {canManage && <WorkUnitDialog />}
            </div>
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
                {visibleUnits.map((unit) => (
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
                {!refs.units.isLoading && !visibleUnits.length && (
                  <EmptyRows
                    colSpan={4}
                    text={
                      filter
                        ? 'Belum ada satuan sesuai pencarian.'
                        : 'Belum ada satuan Produksi.'
                    }
                  />
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
                  statuses={['ACTIVE', 'UPCOMING', 'ENDED', 'CANCELLED']}
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
                            {row.status !== 'CANCELLED' && (
                              <AssignmentCorrectionDialog
                                assignment={row}
                                jobs={refs.jobs.data?.items ?? []}
                              />
                            )}
                            {row.status !== 'ENDED' &&
                              row.status !== 'CANCELLED' && (
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
          jobs={(refs.jobs.data?.items ?? []).filter((job) => job.isActive)}
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
                    {rate.status === 'ACTIVE' && (
                      <>
                        <ActiveRateCorrectionDialog rate={rate} />
                        <ActiveRateCancellationDialog rate={rate} />
                      </>
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
