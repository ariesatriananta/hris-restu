import { useState, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'
import {
  AlertTriangle,
  BadgeDollarSign,
  Banknote,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  CircleDollarSign,
  Eye,
  FileWarning,
  History,
  LoaderCircle,
  PencilLine,
  Plus,
  Search,
  Settings2,
  ShieldAlert,
  UserRoundCheck,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import {
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import {
  useCancelPayrollRate,
  useCorrectPayrollRate,
  useCreatePayrollPolicy,
  useCreatePayrollRate,
  usePayrollConfigurationMeta,
  usePayrollDailyRates,
  usePayrollPolicies,
  usePayrollSalaries,
  usePayrollTrainingPreflight,
  usePreviewPayrollPolicy,
  type PayrollPolicyInput,
} from './data/queries'
import type {
  PayrollEmployeeOption,
  PayrollEmployeeRate,
  PayrollEmployeeType,
  PayrollPolicyVersion,
} from './domain'
import { formatDecimalString } from './money'

type ConfigurationTab = 'policy' | 'daily-rate' | 'salary' | 'preflight'
type SearchState = Record<string, unknown>
type RateResource = 'daily-rates' | 'salaries'

const employeeTypeLabels: Record<PayrollEmployeeType, string> = {
  BORONGAN: 'Borongan',
  HARIAN: 'Harian',
  TRAINING: 'Training',
  BULANAN: 'Bulanan',
}

const tabValues: ConfigurationTab[] = [
  'policy',
  'daily-rate',
  'salary',
  'preflight',
]

function localDate(value: string | null) {
  return value
    ? format(parseISO(value), 'd MMM yyyy', { locale: id })
    : 'seterusnya'
}

function localDateTime(value: string) {
  return format(parseISO(value), 'd MMM yyyy, HH.mm', { locale: id })
}

function money(value: string | null) {
  return value === null
    ? 'Nominal disamarkan'
    : formatDecimalString(value, { currency: true, maximumFractionDigits: 2 })
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}

function createKey(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
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
      toYear={new Date().getFullYear() + 6}
    />
  )
}

export function PayrollConfigurationPage({
  search,
  navigate,
}: {
  search: SearchState
  navigate: NavigateFn
}) {
  const requestedTab = typeof search.tab === 'string' ? search.tab : 'policy'
  const tab = tabValues.includes(requestedTab as ConfigurationTab)
    ? (requestedTab as ConfigurationTab)
    : 'policy'
  const site = typeof search.site === 'string' ? search.site : ''
  const employeeType =
    typeof search.employeeType === 'string' ? search.employeeType : ''
  const status = typeof search.status === 'string' ? search.status : 'ACTIVE'
  const query = typeof search.query === 'string' ? search.query : ''
  const selectedUid =
    typeof search.detailUid === 'string' ? search.detailUid : ''
  const patch = (value: SearchState) =>
    navigate({ search: (previous) => ({ ...previous, ...value }) })

  const meta = usePayrollConfigurationMeta()
  const policies = usePayrollPolicies(
    {
      site: site || undefined,
      employeeType: employeeType || undefined,
      status: status || undefined,
    },
    tab === 'policy'
  )
  const rates = usePayrollDailyRates(
    {
      site: site || undefined,
      employeeType: employeeType || undefined,
      status: status || undefined,
      query: query || undefined,
    },
    tab === 'daily-rate'
  )
  const salaries = usePayrollSalaries(
    {
      site: site || undefined,
      status: status || undefined,
      query: query || undefined,
    },
    tab === 'salary'
  )
  const preflight = usePayrollTrainingPreflight(
    site || undefined,
    tab === 'preflight'
  )

  const policyItems = policies.data?.data ?? []
  const rateItems =
    tab === 'salary' ? (salaries.data?.data ?? []) : (rates.data?.data ?? [])
  const selectedPolicy = policyItems.find((item) => item.uid === selectedUid)
  const selectedRate = rateItems.find((item) => item.uid === selectedUid)
  const capabilities =
    meta.data?.capabilities ??
    policies.data?.meta.capabilities ??
    rates.data?.meta.capabilities

  return (
    <Main>
      <div className='space-y-4'>
        <header className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <p className='text-sm font-medium text-primary'>
              Payroll berbasis waktu
            </p>
            <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
              Skema Upah & Tarif
            </h1>
            <p className='max-w-3xl text-sm text-muted-foreground'>
              Kelola versi kebijakan, tarif harian, dan gaji pokok tanpa
              mengubah histori Payroll yang sudah disahkan.
            </p>
          </div>
          <Badge variant='outline' className='gap-1.5 bg-muted/50'>
            <History className='size-3.5' /> Effective-dated
          </Badge>
        </header>

        <Alert className='border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/30'>
          <ShieldAlert className='size-4' />
          <AlertDescription>
            Perubahan selalu membuat versi histori. Policy hanya dapat dikelola
            Super Admin; nominal mengikuti akses site dan kewenangan pengguna.
          </AlertDescription>
        </Alert>

        <Tabs
          value={tab}
          onValueChange={(value) =>
            patch({
              tab: value,
              detailUid: undefined,
              employeeType: undefined,
              query: undefined,
            })
          }
        >
          <TabsList className='h-auto w-full justify-start gap-1 overflow-x-auto p-1 sm:w-fit'>
            <TabsTrigger value='policy' className='h-10 gap-2 px-4'>
              <Settings2 className='size-4' />
              Kebijakan
            </TabsTrigger>
            <TabsTrigger value='daily-rate' className='h-10 gap-2 px-4'>
              <BadgeDollarSign className='size-4' />
              Tarif harian
            </TabsTrigger>
            <TabsTrigger value='salary' className='h-10 gap-2 px-4'>
              <Banknote className='size-4' />
              Gaji pokok
            </TabsTrigger>
            <TabsTrigger value='preflight' className='h-10 gap-2 px-4'>
              <FileWarning className='size-4' />
              Preflight Training
            </TabsTrigger>
          </TabsList>

          <TabsContent value='policy' className='mt-4 space-y-4'>
            <PolicySection
              query={policies}
              items={policyItems}
              sites={meta.data?.sites ?? []}
              site={site}
              employeeType={employeeType}
              status={status}
              canManage={capabilities?.canManagePolicy === true}
              onFilter={patch}
              onOpen={(uid: string) => patch({ detailUid: uid })}
            />
          </TabsContent>

          <TabsContent value='daily-rate' className='mt-4 space-y-4'>
            <RateSection
              title='Tarif Harian'
              description='Tarif per hari untuk karyawan Harian dan Training. Hanya hari Attendance berstatus Hadir yang dibayar.'
              resource='daily-rates'
              queryState={rates}
              items={rates.data?.data ?? []}
              employees={
                meta.data?.employees ?? rates.data?.meta.employees ?? []
              }
              sites={meta.data?.sites ?? rates.data?.meta.sites ?? []}
              site={site}
              employeeType={employeeType}
              status={status}
              searchQuery={query}
              canManage={capabilities?.canManageRates === true}
              onFilter={patch}
              onOpen={(uid: string) => patch({ detailUid: uid })}
            />
          </TabsContent>

          <TabsContent value='salary' className='mt-4 space-y-4'>
            <RateSection
              title='Gaji Pokok Bulanan'
              description='Riwayat gaji pokok karyawan Bulanan. Perubahan hanya boleh dimulai pada awal periode Payroll.'
              resource='salaries'
              queryState={salaries}
              items={salaries.data?.data ?? []}
              employees={
                meta.data?.employees ?? salaries.data?.meta.employees ?? []
              }
              sites={meta.data?.sites ?? salaries.data?.meta.sites ?? []}
              site={site}
              employeeType='BULANAN'
              status={status}
              searchQuery={query}
              canManage={capabilities?.canManageRates === true}
              onFilter={patch}
              onOpen={(uid: string) => patch({ detailUid: uid })}
            />
          </TabsContent>

          <TabsContent value='preflight' className='mt-4'>
            <PreflightSection
              query={preflight}
              sites={meta.data?.sites ?? []}
              site={site}
              onFilter={patch}
            />
          </TabsContent>
        </Tabs>
      </div>

      <PolicyDrawer
        policy={selectedPolicy}
        onClose={() => patch({ detailUid: undefined })}
      />
      <RateDrawer
        rate={selectedRate}
        onClose={() => patch({ detailUid: undefined })}
      />
    </Main>
  )
}

function Filters({
  sites,
  site,
  employeeType,
  status,
  query,
  showEmployeeType,
  onChange,
}: {
  sites: Array<{ uid: string; code: string; name: string }>
  site: string
  employeeType: string
  status: string
  query?: string
  showEmployeeType: boolean
  onChange: (value: SearchState) => void
}) {
  return (
    <div
      className={cn(
        'grid min-w-0 flex-1 gap-2 sm:grid-cols-2',
        query !== undefined && showEmployeeType
          ? 'lg:grid-cols-[minmax(240px,1fr)_repeat(3,minmax(150px,190px))]'
          : query !== undefined
            ? 'lg:grid-cols-[minmax(240px,1fr)_repeat(2,minmax(150px,190px))]'
            : 'lg:grid-cols-3'
      )}
    >
      {query !== undefined && (
        <div className='relative min-w-0'>
          <Search className='absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            value={query}
            onChange={(event) =>
              onChange({ query: event.target.value || undefined })
            }
            placeholder='Cari nama atau nomor karyawan...'
            className='pl-9'
          />
        </div>
      )}
      <Select
        value={site || 'ALL'}
        onValueChange={(value) =>
          onChange({ site: value === 'ALL' ? undefined : value })
        }
      >
        <SelectTrigger className='w-full' aria-label='Filter site'>
          <SelectValue placeholder='Semua site' />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='ALL'>Semua site</SelectItem>
          {sites.map((item) => (
            <SelectItem key={item.uid} value={item.code}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showEmployeeType && (
        <Select
          value={employeeType || 'ALL'}
          onValueChange={(value) =>
            onChange({ employeeType: value === 'ALL' ? undefined : value })
          }
        >
          <SelectTrigger className='w-full' aria-label='Filter jenis karyawan'>
            <SelectValue placeholder='Semua jenis' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>Semua jenis</SelectItem>
            {(['BORONGAN', 'HARIAN', 'TRAINING', 'BULANAN'] as const).map(
              (item) => (
                <SelectItem key={item} value={item}>
                  {employeeTypeLabels[item]}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      )}
      <Select
        value={status || 'ALL'}
        onValueChange={(value) =>
          onChange({ status: value === 'ALL' ? undefined : value })
        }
      >
        <SelectTrigger className='w-full' aria-label='Filter status'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='ALL'>Semua status</SelectItem>
          <SelectItem value='ACTIVE'>Aktif</SelectItem>
          <SelectItem value='CANCELLED'>Dibatalkan</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

function PolicySection({
  query,
  items,
  sites,
  site,
  employeeType,
  status,
  canManage,
  onFilter,
  onOpen,
}: {
  query: ReturnType<typeof usePayrollPolicies>
  items: PayrollPolicyVersion[]
  sites: Array<{ uid: string; code: string; name: string }>
  site: string
  employeeType: string
  status: string
  canManage: boolean
  onFilter: (value: SearchState) => void
  onOpen: (uid: string) => void
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  return (
    <>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <Filters
          sites={sites}
          site={site}
          employeeType={employeeType}
          status={status}
          showEmployeeType
          onChange={onFilter}
        />
        {canManage && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className='size-4' />
            Buat versi policy
          </Button>
        )}
      </div>
      {query.isPending ? (
        <CardsSkeleton />
      ) : query.isError ? (
        <ErrorState onRetry={() => query.refetch()} />
      ) : items.length ? (
        <div className='grid gap-3 lg:grid-cols-2 xl:grid-cols-3'>
          {items.map((policy: PayrollPolicyVersion) => (
            <PolicyCard
              key={policy.uid}
              policy={policy}
              onOpen={() => onOpen(policy.uid)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Settings2}
          title='Policy belum tersedia'
          description='Buat versi policy pertama untuk mengunci skema dan periode Payroll.'
        />
      )}
      <PolicyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        sites={sites}
      />
    </>
  )
}

export function PolicyCard({
  policy,
  onOpen,
}: {
  policy: PayrollPolicyVersion
  onOpen: () => void
}) {
  return (
    <article className='rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h2 className='font-semibold'>
              {employeeTypeLabels[policy.employeeType]}
            </h2>
            <Badge
              variant={policy.status === 'ACTIVE' ? 'default' : 'secondary'}
            >
              {policy.status === 'ACTIVE' ? 'Aktif' : 'Dibatalkan'}
            </Badge>
          </div>
          <p className='text-sm text-muted-foreground'>
            {policy.site.name} · Riwayat policy
          </p>
        </div>
        <Button
          variant='ghost'
          size='icon'
          onClick={onOpen}
          aria-label={`Lihat policy ${policy.employeeType}`}
        >
          <Eye className='size-4' />
        </Button>
      </div>
      <div className='mt-4 grid grid-cols-2 gap-2 text-sm'>
        <Fact
          label='Basis'
          value={
            policy.wageBasis === 'TIME_BASED' ? 'Satuan waktu' : 'Satuan hasil'
          }
        />
        <Fact
          label='Frekuensi'
          value={policy.payFrequency === 'WEEKLY' ? 'Mingguan' : 'Bulanan'}
        />
        <Fact
          label='Cutoff'
          value={
            policy.cutoffType === 'WEEK_END'
              ? 'Senin–Minggu'
              : policy.cutoffType === 'LAST_DAY'
                ? 'Akhir bulan'
                : `Tanggal ${policy.cutoffDay}`
          }
        />
        <Fact label='Efektif' value={localDate(policy.effectiveFrom)} />
      </div>
      <div className='mt-4 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground'>
        <CalendarClock className='size-3.5' />
        {localDate(policy.effectiveFrom)} — {localDate(policy.effectiveTo)}
      </div>
    </article>
  )
}

function PolicyDialog({
  open,
  onOpenChange,
  sites,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sites: Array<{ uid: string; code: string; name: string }>
}) {
  const [siteUid, setSiteUid] = useState('')
  const [employeeType, setEmployeeType] =
    useState<PayrollEmployeeType>('BULANAN')
  const [cutoffType, setCutoffType] = useState<'LAST_DAY' | 'DAY_OF_MONTH'>(
    'LAST_DAY'
  )
  const [cutoffDay, setCutoffDay] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [reason, setReason] = useState('')
  const [previewSignature, setPreviewSignature] = useState('')
  const preview = usePreviewPayrollPolicy()
  const create = useCreatePayrollPolicy()
  const matrix =
    employeeType === 'BORONGAN'
      ? { wageBasis: 'PIECE_RATE' as const, payFrequency: 'WEEKLY' as const }
      : employeeType === 'BULANAN'
        ? { wageBasis: 'TIME_BASED' as const, payFrequency: 'MONTHLY' as const }
        : { wageBasis: 'TIME_BASED' as const, payFrequency: 'WEEKLY' as const }
  const input: PayrollPolicyInput = {
    siteUid,
    employeeType,
    ...matrix,
    cutoffType: matrix.payFrequency === 'MONTHLY' ? cutoffType : 'WEEK_END',
    cutoffDay:
      matrix.payFrequency === 'MONTHLY' && cutoffType === 'DAY_OF_MONTH'
        ? Number(cutoffDay)
        : undefined,
    effectiveFrom,
  }
  const currentSignature = JSON.stringify(input)
  const cutoffValid =
    cutoffType !== 'DAY_OF_MONTH' ||
    matrix.payFrequency !== 'MONTHLY' ||
    (Number(cutoffDay) >= 1 && Number(cutoffDay) <= 31)
  const valid =
    siteUid && effectiveFrom && reason.trim().length >= 5 && cutoffValid
  const submit = async () => {
    try {
      await create.mutateAsync({
        ...input,
        reason: reason.trim(),
        idempotencyKey: createKey('payroll-policy'),
      })
      toast.success('Versi policy berhasil dibuat.')
      onOpenChange(false)
    } catch (error) {
      toast.error(apiMessage(error, 'Policy gagal disimpan.'))
    }
  }
  const runPreview = async () => {
    try {
      await preview.mutateAsync(input)
      setPreviewSignature(currentSignature)
    } catch (error) {
      setPreviewSignature('')
      toast.error(apiMessage(error, 'Preview periode gagal dibuat.'))
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Buat Versi Policy</DialogTitle>
          <DialogDescription>
            Policy baru hanya berlaku ke depan dan tidak mengubah periode yang
            sudah berjalan.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label='Site'>
            <Select value={siteUid} onValueChange={setSiteUid}>
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Pilih site' />
              </SelectTrigger>
              <SelectContent>
                {sites.map((item) => (
                  <SelectItem key={item.uid} value={item.uid}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='Jenis karyawan'>
            <Select
              value={employeeType}
              onValueChange={(value) =>
                setEmployeeType(value as PayrollEmployeeType)
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['BORONGAN', 'HARIAN', 'TRAINING', 'BULANAN'] as const).map(
                  (item) => (
                    <SelectItem key={item} value={item}>
                      {employeeTypeLabels[item]}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </Field>
          <FactBox
            label='Skema terkunci'
            value={`${matrix.wageBasis === 'TIME_BASED' ? 'Satuan waktu' : 'Satuan hasil'} · ${matrix.payFrequency === 'WEEKLY' ? 'Mingguan' : 'Bulanan'}`}
          />
          <Field label='Mulai berlaku'>
            <DateField
              value={effectiveFrom}
              onChange={setEffectiveFrom}
              placeholder='Pilih tanggal efektif'
            />
          </Field>
          {matrix.payFrequency === 'MONTHLY' && (
            <>
              <Field label='Aturan cutoff'>
                <Select
                  value={cutoffType}
                  onValueChange={(value) =>
                    setCutoffType(value as 'LAST_DAY' | 'DAY_OF_MONTH')
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='LAST_DAY'>Akhir bulan</SelectItem>
                    <SelectItem value='DAY_OF_MONTH'>
                      Tanggal tertentu
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {cutoffType === 'DAY_OF_MONTH' && (
                <Field label='Tanggal cutoff'>
                  <Input
                    type='number'
                    min={1}
                    max={31}
                    value={cutoffDay}
                    onChange={(event) => setCutoffDay(event.target.value)}
                  />
                </Field>
              )}
            </>
          )}
        </div>
        <Field label='Alasan perubahan'>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder='Minimal 5 karakter untuk audit...'
          />
        </Field>
        {preview.data && <PeriodPreview periods={preview.data.nextPeriods} />}
        <DialogFooter className='gap-2'>
          <Button
            variant='outline'
            disabled={
              !siteUid || !effectiveFrom || !cutoffValid || preview.isPending
            }
            onClick={runPreview}
          >
            {preview.isPending ? (
              <LoaderCircle className='size-4 animate-spin' />
            ) : (
              <CalendarClock className='size-4' />
            )}
            Preview 3 periode
          </Button>
          <Button
            disabled={
              !valid ||
              !preview.data ||
              previewSignature !== currentSignature ||
              create.isPending
            }
            onClick={submit}
          >
            Simpan versi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RateSection({
  title,
  description,
  resource,
  queryState,
  items,
  employees,
  sites,
  site,
  employeeType,
  status,
  searchQuery,
  canManage,
  onFilter,
  onOpen,
}: {
  title: string
  description: string
  resource: RateResource
  queryState: ReturnType<typeof usePayrollDailyRates>
  items: PayrollEmployeeRate[]
  employees: PayrollEmployeeOption[]
  sites: Array<{ uid: string; code: string; name: string }>
  site: string
  employeeType: string
  status: string
  searchQuery: string
  canManage: boolean
  onFilter: (value: SearchState) => void
  onOpen: (uid: string) => void
}) {
  const [dialog, setDialog] = useState<{
    mode: 'create' | 'correct' | 'cancel'
    item?: PayrollEmployeeRate
  } | null>(null)
  const filteredEmployees = (employees as PayrollEmployeeOption[]).filter(
    (item) =>
      resource === 'salaries'
        ? item.employeeType === 'BULANAN'
        : ['HARIAN', 'TRAINING'].includes(item.employeeType)
  )
  return (
    <>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>{title}</h2>
          <p className='text-sm text-muted-foreground'>{description}</p>
        </div>
        {canManage && (
          <Button onClick={() => setDialog({ mode: 'create' })}>
            <Plus className='size-4' />
            Tambah {resource === 'salaries' ? 'gaji' : 'tarif'}
          </Button>
        )}
      </div>
      <Filters
        sites={sites}
        site={site}
        employeeType={employeeType}
        status={status}
        query={searchQuery}
        showEmployeeType={resource === 'daily-rates'}
        onChange={onFilter}
      />
      {queryState.isPending ? (
        <TimelineSkeleton />
      ) : queryState.isError ? (
        <ErrorState onRetry={() => queryState.refetch()} />
      ) : items.length ? (
        <div className='divide-y rounded-xl border bg-card'>
          {items.map((item: PayrollEmployeeRate) => (
            <article
              key={item.uid}
              className='grid gap-3 p-3 sm:grid-cols-[minmax(190px,1.4fr)_minmax(140px,1fr)_minmax(175px,1fr)_auto] sm:items-center'
            >
              <div className='min-w-0'>
                <p className='truncate font-semibold'>
                  {item.employee.fullName}
                </p>
                <p className='truncate text-xs text-muted-foreground'>
                  {item.site.name} · {item.employee.employeeNumber} ·{' '}
                  {employeeTypeLabels[item.employee.employeeType]}
                </p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>
                  {resource === 'salaries' ? 'Gaji pokok' : 'Tarif per hari'}
                </p>
                <p
                  className={cn(
                    'font-semibold tabular-nums',
                    item.amountMasked && 'text-muted-foreground'
                  )}
                >
                  {money(item.amount)}
                </p>
              </div>
              <div>
                <p className='text-sm'>
                  {localDate(item.effectiveFrom)} —{' '}
                  {localDate(item.effectiveTo)}
                </p>
                <Badge
                  variant={item.status === 'ACTIVE' ? 'default' : 'secondary'}
                  className='mt-1'
                >
                  {item.status === 'ACTIVE' ? 'Aktif' : 'Dibatalkan'}
                </Badge>
              </div>
              <div className='flex justify-end gap-1'>
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={() => onOpen(item.uid)}
                  aria-label={`Lihat histori ${item.employee.fullName}`}
                >
                  <Eye className='size-4' />
                </Button>
                {canManage && item.status === 'ACTIVE' && (
                  <>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => setDialog({ mode: 'correct', item })}
                      aria-label={`Koreksi ${item.employee.fullName}`}
                    >
                      <PencilLine className='size-4' />
                    </Button>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='text-destructive'
                      onClick={() => setDialog({ mode: 'cancel', item })}
                      aria-label={`Batalkan ${item.employee.fullName}`}
                    >
                      <XCircle className='size-4' />
                    </Button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CircleDollarSign}
          title={`${title} belum tersedia`}
          description='Tambahkan histori nominal pertama untuk karyawan yang eligible.'
        />
      )}
      <RateDialog
        key={dialog ? `${dialog.mode}-${dialog.item?.uid ?? 'new'}` : 'closed'}
        state={dialog}
        onClose={() => setDialog(null)}
        resource={resource}
        employees={filteredEmployees}
        sites={sites}
      />
    </>
  )
}

function RateDialog({
  state,
  onClose,
  resource,
  employees,
  sites,
}: {
  state: {
    mode: 'create' | 'correct' | 'cancel'
    item?: PayrollEmployeeRate
  } | null
  onClose: () => void
  resource: RateResource
  employees: PayrollEmployeeOption[]
  sites: Array<{ uid: string; code: string; name: string }>
}) {
  const [employeeUid, setEmployeeUid] = useState('')
  const [siteUid, setSiteUid] = useState('')
  const [amount, setAmount] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [effectiveTo, setEffectiveTo] = useState('')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const create = useCreatePayrollRate()
  const correct = useCorrectPayrollRate()
  const cancel = useCancelPayrollRate()
  const mode = state?.mode
  const selected = state?.item
  const nominal = amount || selected?.amount || ''
  const start = effectiveFrom || selected?.effectiveFrom || ''
  const end = effectiveTo || selected?.effectiveTo || ''
  const valid =
    mode === 'cancel'
      ? reason.trim().length >= 5
      : Number(nominal) > 0 &&
        Boolean(start) &&
        reason.trim().length >= 5 &&
        (mode === 'create'
          ? Boolean(employeeUid && (resource === 'salaries' || siteUid))
          : true)
  const submit = async () => {
    if (!mode) return
    const payload: Record<string, unknown> =
      mode === 'cancel'
        ? { reason: reason.trim(), idempotencyKey: createKey('cancel-rate') }
        : mode === 'create'
          ? {
              employeeUid,
              ...(resource === 'daily-rates'
                ? { siteUid, dailyRate: nominal, notes: notes || undefined }
                : { basicSalary: nominal }),
              currency: 'IDR',
              effectiveFrom: start,
              effectiveTo: end || undefined,
              reason: reason.trim(),
              idempotencyKey: createKey('create-rate'),
            }
          : {
              amount: nominal,
              effectiveFrom: start,
              effectiveTo: end || undefined,
              notes: notes || selected?.notes || undefined,
              reason: reason.trim(),
              idempotencyKey: createKey('correct-rate'),
            }
    try {
      if (mode === 'create') await create.mutateAsync({ resource, payload })
      else if (mode === 'correct')
        await correct.mutateAsync({ resource, uid: selected?.uid, payload })
      else await cancel.mutateAsync({ resource, uid: selected?.uid, payload })
      toast.success(
        mode === 'cancel'
          ? 'Histori nominal dibatalkan.'
          : 'Histori nominal berhasil disimpan.'
      )
      onClose()
    } catch (error) {
      toast.error(apiMessage(error, 'Perubahan nominal gagal disimpan.'))
    }
  }
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? `Tambah ${resource === 'salaries' ? 'Gaji Pokok' : 'Tarif Harian'}`
              : mode === 'correct'
                ? 'Koreksi Histori Nominal'
                : 'Batalkan Histori Nominal'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'cancel'
              ? 'Data tidak dihapus dan tetap tercatat dalam histori audit.'
              : resource === 'salaries'
                ? 'Perubahan gaji harus dimulai pada awal periode Payroll.'
                : 'Tarif berlaku sesuai rentang tanggal efektif.'}
          </DialogDescription>
        </DialogHeader>
        {mode !== 'cancel' && (
          <div className='grid gap-4 sm:grid-cols-2'>
            {mode === 'create' && (
              <>
                <Field label='Karyawan'>
                  <EmployeeOptionPicker
                    value={employeeUid}
                    employees={employees}
                    onChange={(employee) => {
                      setEmployeeUid(employee.uid)
                      setSiteUid(employee.site.uid)
                    }}
                  />
                </Field>
                {resource === 'daily-rates' && (
                  <Field label='Site'>
                    <Select value={siteUid} onValueChange={setSiteUid}>
                      <SelectTrigger className='w-full'>
                        <SelectValue placeholder='Pilih site' />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map((item) => (
                          <SelectItem key={item.uid} value={item.uid}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              </>
            )}
            <Field
              label={
                resource === 'salaries'
                  ? 'Gaji pokok (Rp)'
                  : 'Tarif per hari (Rp)'
              }
            >
              <Input
                inputMode='decimal'
                value={nominal}
                onChange={(event) =>
                  setAmount(
                    event.target.value
                      .replace(/[^0-9.,]/g, '')
                      .replace(',', '.')
                  )
                }
                placeholder='Contoh: 150000'
              />
            </Field>
            <Field label='Mulai berlaku'>
              <DateField
                value={start}
                onChange={setEffectiveFrom}
                placeholder='Pilih tanggal'
              />
            </Field>
            <Field label='Tanggal selesai (opsional)'>
              <DateField
                value={end}
                onChange={setEffectiveTo}
                placeholder='Seterusnya'
              />
            </Field>
            {(resource === 'daily-rates' || mode === 'correct') && (
              <Field label='Catatan (opsional)'>
                <Input
                  value={notes || selected?.notes || ''}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Field>
            )}
          </div>
        )}
        <Field
          label={
            mode === 'cancel'
              ? 'Alasan pembatalan'
              : mode === 'correct'
                ? 'Alasan koreksi'
                : 'Alasan penetapan'
          }
        >
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder='Minimal 5 karakter untuk audit...'
          />
        </Field>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            Batal
          </Button>
          <Button
            variant={mode === 'cancel' ? 'destructive' : 'default'}
            disabled={
              !valid ||
              create.isPending ||
              correct.isPending ||
              cancel.isPending
            }
            onClick={submit}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreflightSection({
  query,
  sites,
  site,
  onFilter,
}: {
  query: ReturnType<typeof usePayrollTrainingPreflight>
  sites: Array<{ uid: string; code: string; name: string }>
  site: string
  onFilter: (value: SearchState) => void
}) {
  if (query.isPending) return <CardsSkeleton />
  if (query.isError) return <ErrorState onRetry={() => query.refetch()} />
  const data = query.data
  if (!data) return null
  const tone =
    data.status === 'READY'
      ? 'border-positive/30 bg-positive/5'
      : data.status === 'BLOCKED'
        ? 'border-destructive/30 bg-destructive/5'
        : 'border-warning/40 bg-warning/10'
  return (
    <div className='space-y-4'>
      <div className='flex justify-end'>
        <Select
          value={site || 'ALL'}
          onValueChange={(value) =>
            onFilter({ site: value === 'ALL' ? undefined : value })
          }
        >
          <SelectTrigger
            className='w-full sm:w-52'
            aria-label='Filter site preflight'
          >
            <SelectValue placeholder='Semua site' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>Semua site</SelectItem>
            {sites.map((item) => (
              <SelectItem key={item.uid} value={item.code}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={cn('rounded-xl border p-4', tone)}>
        <div className='flex items-start gap-3'>
          {data.status === 'READY' ? (
            <CheckCircle2 className='size-5 text-positive' />
          ) : (
            <AlertTriangle className='size-5 text-warning-foreground' />
          )}
          <div>
            <h2 className='font-semibold'>
              Preflight migrasi Training:{' '}
              {data.status === 'READY'
                ? 'Siap'
                : data.status === 'BLOCKED'
                  ? 'Terblokir'
                  : 'Perlu perhatian'}
            </h2>
            <p className='text-sm text-muted-foreground'>
              Diperiksa {localDateTime(data.evaluatedAt)}. Pemeriksaan ini tidak
              mengubah histori atau transaksi Produksi.
            </p>
          </div>
        </div>
      </div>
      <div className='grid grid-cols-2 gap-2 lg:grid-cols-5'>
        <Kpi
          icon={UserRoundCheck}
          label='Karyawan Training'
          value={data.summary.trainingEmployees}
        />
        <Kpi
          icon={History}
          label='Histori employment'
          value={data.summary.employmentHistories}
        />
        <Kpi
          icon={BadgeDollarSign}
          label='Transaksi Produksi'
          value={data.summary.productionTransactions}
        />
        <Kpi
          icon={CalendarClock}
          label='Snapshot Payroll'
          value={data.summary.payrollSnapshots}
        />
        <Kpi
          icon={ShieldAlert}
          label='Snapshot immutable'
          value={data.summary.immutablePayrollSnapshots}
          tone={data.summary.immutablePayrollSnapshots ? 'danger' : 'default'}
        />
      </div>
      {data.issues.length ? (
        <div className='space-y-2'>
          {data.issues.map((issue) => (
            <div key={issue.code} className='rounded-lg border p-3'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <p className='font-medium'>{issue.title}</p>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    {issue.message}
                  </p>
                  {issue.actionHint && (
                    <p className='mt-2 text-xs font-medium text-primary'>
                      {issue.actionHint}
                    </p>
                  )}
                </div>
                <Badge
                  variant={
                    issue.severity === 'BLOCKER' ? 'destructive' : 'outline'
                  }
                >
                  {issue.count.toLocaleString('id-ID')}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title='Tidak ada masalah ditemukan'
          description='Histori Training siap mengikuti skema berbasis waktu tanpa menghapus fakta Produksi.'
        />
      )}
    </div>
  )
}

function PolicyDrawer({
  policy,
  onClose,
}: {
  policy?: PayrollPolicyVersion
  onClose: () => void
}) {
  return (
    <Sheet open={Boolean(policy)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>Detail Versi Policy</SheetTitle>
          <SheetDescription>
            {policy
              ? `${employeeTypeLabels[policy.employeeType]} · ${policy.site.name}`
              : ''}
          </SheetDescription>
        </SheetHeader>
        {policy && (
          <div className='space-y-5 p-4'>
            <div className='grid grid-cols-2 gap-2'>
              <FactBox
                label='Basis upah'
                value={
                  policy.wageBasis === 'TIME_BASED'
                    ? 'Satuan waktu'
                    : 'Satuan hasil'
                }
              />
              <FactBox
                label='Frekuensi'
                value={
                  policy.payFrequency === 'WEEKLY' ? 'Mingguan' : 'Bulanan'
                }
              />
              <FactBox label='Pembulatan' value='HALF_UP ke Rp1' />
              <FactBox
                label='Status'
                value={policy.status === 'ACTIVE' ? 'Aktif' : 'Dibatalkan'}
              />
            </div>
            <section>
              <h3 className='font-semibold'>Masa berlaku</h3>
              <p className='mt-2 rounded-lg border bg-muted/30 p-3 text-sm'>
                {localDate(policy.effectiveFrom)} —{' '}
                {localDate(policy.effectiveTo)}
              </p>
            </section>
            <PeriodPreview periods={policy.nextPeriods} />
            <section>
              <h3 className='font-semibold'>Catatan versi</h3>
              <p className='mt-2 text-sm text-muted-foreground'>
                {policy.reason || 'Tidak ada catatan.'}
              </p>
              {policy.createdAt && (
                <p className='mt-2 text-xs text-muted-foreground'>
                  Dibuat {localDateTime(policy.createdAt)}
                  {policy.createdByName ? ` oleh ${policy.createdByName}` : ''}
                </p>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function RateDrawer({
  rate,
  onClose,
}: {
  rate?: PayrollEmployeeRate
  onClose: () => void
}) {
  return (
    <Sheet open={Boolean(rate)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>Detail Histori Nominal</SheetTitle>
          <SheetDescription>
            {rate
              ? `${rate.employee.fullName} · ${rate.employee.employeeNumber}`
              : ''}
          </SheetDescription>
        </SheetHeader>
        {rate && (
          <div className='space-y-4 p-4'>
            <div className='rounded-xl border bg-muted/30 p-4'>
              <p className='text-sm text-muted-foreground'>Nominal</p>
              <p className='mt-1 text-2xl font-bold tabular-nums'>
                {money(rate.amount)}
              </p>
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <FactBox label='Site' value={rate.site.name} />
              <FactBox
                label='Jenis'
                value={employeeTypeLabels[rate.employee.employeeType]}
              />
              <FactBox label='Mulai' value={localDate(rate.effectiveFrom)} />
              <FactBox label='Selesai' value={localDate(rate.effectiveTo)} />
            </div>
            <div>
              <p className='text-sm font-medium'>Catatan</p>
              <p className='mt-1 text-sm text-muted-foreground'>
                {rate.notes || 'Tidak ada catatan.'}
              </p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function PeriodPreview({
  periods,
}: {
  periods: Array<{ periodStart: string; periodEnd: string; label?: string }>
}) {
  return (
    <section>
      <h3 className='mb-2 text-sm font-semibold'>Preview periode berikutnya</h3>
      <div className='space-y-2'>
        {periods.map((period, index) => (
          <div
            key={`${period.periodStart}-${period.periodEnd}`}
            className='flex items-center gap-3 rounded-lg border px-3 py-2 text-sm'
          >
            <span className='flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary'>
              {index + 1}
            </span>
            <span>
              {localDate(period.periodStart)} — {localDate(period.periodEnd)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='grid gap-2'>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function EmployeeOptionPicker({
  value,
  employees,
  onChange,
}: {
  value: string
  employees: PayrollEmployeeOption[]
  onChange: (employee: PayrollEmployeeOption) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = employees.find((employee) => employee.uid === value)
  const normalizedQuery = query.trim().toLocaleLowerCase('id-ID')
  const options = normalizedQuery
    ? employees.filter((employee) =>
        `${employee.fullName} ${employee.employeeNumber}`
          .toLocaleLowerCase('id-ID')
          .includes(normalizedQuery)
      )
    : employees

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={open}
          className='w-full justify-between font-normal'
        >
          <span className='truncate'>
            {selected
              ? `${selected.fullName} · ${selected.employeeNumber}`
              : 'Pilih karyawan eligible'}
          </span>
          <ChevronsUpDown className='size-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-[min(32rem,calc(100vw-2rem))] p-0'
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder='Cari nama atau nomor karyawan...'
          />
          <CommandList>
            <CommandEmpty>Karyawan eligible tidak ditemukan.</CommandEmpty>
            <CommandGroup>
              {options.slice(0, 50).map((employee) => (
                <CommandItem
                  key={employee.uid}
                  value={employee.uid}
                  onSelect={() => {
                    onChange(employee)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      employee.uid === value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className='min-w-0'>
                    <p className='truncate font-medium'>{employee.fullName}</p>
                    <p className='truncate text-xs text-muted-foreground'>
                      {employee.site.name} · {employee.employeeNumber} ·{' '}
                      {employeeTypeLabels[employee.employeeType]}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='mt-0.5 font-medium'>{value}</p>
    </div>
  )
}
function FactBox({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-lg border bg-muted/25 px-3 py-2'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='mt-0.5 text-sm font-semibold'>{value}</p>
    </div>
  )
}
function Kpi({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: number
  tone?: 'default' | 'danger'
}) {
  return (
    <div
      className={cn(
        'flex min-h-[68px] items-center gap-3 rounded-lg border px-3 py-2.5',
        tone === 'danger' && 'border-destructive/30 bg-destructive/5'
      )}
    >
      <div className='rounded-lg bg-primary/10 p-2 text-primary'>
        <Icon className='size-4' />
      </div>
      <div>
        <p className='text-xs text-muted-foreground'>{label}</p>
        <p className='text-lg font-bold'>{value.toLocaleString('id-ID')}</p>
      </div>
    </div>
  )
}
function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className='rounded-xl border border-dashed px-4 py-12 text-center'>
      <Icon className='mx-auto size-8 text-muted-foreground' />
      <p className='mt-3 font-medium'>{title}</p>
      <p className='mx-auto mt-1 max-w-xl text-sm text-muted-foreground'>
        {description}
      </p>
    </div>
  )
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Alert variant='destructive'>
      <AlertTriangle className='size-4' />
      <AlertTitle>Data gagal dimuat</AlertTitle>
      <AlertDescription className='flex items-center justify-between gap-3'>
        Terjadi gangguan pada layanan Payroll.
        <Button variant='outline' size='sm' onClick={onRetry}>
          Coba lagi
        </Button>
      </AlertDescription>
    </Alert>
  )
}
function CardsSkeleton() {
  return (
    <div className='grid gap-3 lg:grid-cols-3'>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className='h-48 rounded-xl' />
      ))}
    </div>
  )
}
function TimelineSkeleton() {
  return (
    <div className='space-y-2'>
      {Array.from({ length: 5 }).map((_, index) => (
        <Skeleton key={index} className='h-20 rounded-lg' />
      ))}
    </div>
  )
}
