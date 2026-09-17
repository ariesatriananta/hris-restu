import { useMemo, useState, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import { format, parseISO } from 'date-fns'
import type { ColumnDef } from '@tanstack/react-table'
import { id } from 'date-fns/locale'
import {
  BadgeDollarSign,
  Banknote,
  CalendarClock,
  Check,
  ChevronsUpDown,
  Eye,
  History,
  HeartPulse,
  LoaderCircle,
  Landmark,
  PencilLine,
  Plus,
  Settings2,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  siteScopeLabel,
  useSiteScopeFilter,
} from '@/hooks/use-site-scope-filter'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  DataTableActionButton,
  DataTableColumnHeader,
} from '@/components/data-table'
import { Main } from '@/components/layout/main'
import { SiteScopeFilter } from '@/components/site-scope-filter'
import { BpjsPolicySection } from './bpjs-policy-section'
import { ConfigurationDataTable } from './configuration-data-table'
import {
  useCancelPayrollRate,
  useCorrectPayrollRate,
  useCreatePayrollPolicy,
  useCreatePayrollRate,
  usePayrollConfigurationMeta,
  usePayrollDailyRates,
  usePayrollPolicies,
  usePayrollMinimumWages,
  usePayrollSalaries,
  usePreviewPayrollPolicy,
  type PayrollPolicyInput,
} from './data/queries'
import type {
  PayrollEmployeeOption,
  PayrollEmployeeRate,
  PayrollEmployeeType,
  PayrollPolicyVersion,
} from './domain'
import { MinimumWageSection } from './minimum-wage-section'
import { formatDecimalString } from './money'

type ConfigurationTab =
  | 'policy'
  | 'daily-rate'
  | 'salary'
  | 'minimum-wage'
  | 'bpjs'
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
  'minimum-wage',
  'bpjs',
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
  const requestedSite = typeof search.site === 'string' ? search.site : ''
  const { effectiveSite } = useSiteScopeFilter(
    requestedSite ? [requestedSite] : undefined
  )
  const site = effectiveSite ?? ''
  const employeeType =
    typeof search.employeeType === 'string' ? search.employeeType : ''
  const status = typeof search.status === 'string' ? search.status : ''
  const query = typeof search.query === 'string' ? search.query : ''
  const year = typeof search.year === 'number' ? search.year : undefined
  const page = typeof search.page === 'number' ? search.page : 1
  const pageSize = typeof search.pageSize === 'number' ? search.pageSize : 50
  const sortBy = typeof search.sortBy === 'string' ? search.sortBy : ''
  const sortDirection = search.sortDirection === 'asc' ? 'asc' : 'desc'
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
      query: query || undefined,
      sortBy: sortBy || undefined,
      sortDirection,
      page,
      pageSize,
    },
    tab === 'policy'
  )
  const rates = usePayrollDailyRates(
    {
      site: site || undefined,
      employeeType: employeeType || undefined,
      status: status || undefined,
      query: query || undefined,
      sortBy: sortBy || undefined,
      sortDirection,
      page,
      pageSize,
    },
    tab === 'daily-rate'
  )
  const salaries = usePayrollSalaries(
    {
      site: site || undefined,
      status: status || undefined,
      query: query || undefined,
      sortBy: sortBy || undefined,
      sortDirection,
      page,
      pageSize,
    },
    tab === 'salary'
  )
  const minimumWages = usePayrollMinimumWages(
    {
      site: site || undefined,
      year,
      status: status || undefined,
      page,
      pageSize,
      query: query || undefined,
      sortBy: sortBy || undefined,
      sortDirection,
    },
    tab === 'minimum-wage'
  )
  const policyItems = policies.data?.data ?? []
  const rateItems =
    tab === 'salary' ? (salaries.data?.data ?? []) : (rates.data?.data ?? [])
  const selectedPolicy = policyItems.find((item) => item.uid === selectedUid)
  const selectedRate = rateItems.find((item) => item.uid === selectedUid)
  const capabilities = meta.data?.capabilities

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
              Kelola kebijakan, tarif harian, gaji pokok, dan UMK site tanpa
              mengubah histori Payroll yang sudah disahkan.
            </p>
          </div>
          <Badge variant='outline' className='gap-1.5 bg-muted/50'>
            <History className='size-3.5' /> Histori terlacak
          </Badge>
        </header>

        <Alert className='border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/30'>
          <ShieldAlert className='size-4' />
          <AlertDescription>
            Perubahan aturan tetap tercatat pada histori dan audit. Aturan
            Payroll hanya dapat dikelola Super Admin; nominal mengikuti akses
            site dan kewenangan pengguna.
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
              year: undefined,
              page: undefined,
              bpjsNumberStatus: undefined,
              bpjsParticipationStatus: undefined,
              bpjsSortBy: undefined,
              bpjsSortDirection: undefined,
              sortBy: undefined,
              sortDirection: undefined,
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
            <TabsTrigger value='minimum-wage' className='h-10 gap-2 px-4'>
              <Landmark className='size-4' />
              UMK Site
            </TabsTrigger>
            <TabsTrigger value='bpjs' className='h-10 gap-2 px-4'>
              <HeartPulse className='size-4' />
              Kebijakan BPJS
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
              search={search}
              navigate={navigate}
            />
          </TabsContent>

          <TabsContent value='daily-rate' className='mt-4 space-y-4'>
            <RateSection
              title='Tarif Harian'
              description='Tarif per hari untuk karyawan Harian dan Training. Hanya hari Attendance berstatus Hadir yang dibayar.'
              resource='daily-rates'
              queryState={rates}
              items={rates.data?.data ?? []}
              employees={meta.data?.employees ?? []}
              sites={meta.data?.sites ?? []}
              site={site}
              employeeType={employeeType}
              status={status}
              canManage={capabilities?.canManageRates === true}
              onFilter={patch}
              onOpen={(uid: string) => patch({ detailUid: uid })}
              search={search}
              navigate={navigate}
            />
          </TabsContent>

          <TabsContent value='salary' className='mt-4 space-y-4'>
            <RateSection
              title='Gaji Pokok Bulanan'
              description='Riwayat gaji pokok karyawan Bulanan. Perubahan hanya boleh dimulai pada awal periode Payroll.'
              resource='salaries'
              queryState={salaries}
              items={salaries.data?.data ?? []}
              employees={meta.data?.employees ?? []}
              sites={meta.data?.sites ?? []}
              site={site}
              employeeType='BULANAN'
              status={status}
              canManage={capabilities?.canManageRates === true}
              onFilter={patch}
              onOpen={(uid: string) => patch({ detailUid: uid })}
              search={search}
              navigate={navigate}
            />
          </TabsContent>

          <TabsContent value='minimum-wage' className='mt-4 space-y-4'>
            <MinimumWageSection
              queryState={minimumWages}
              sites={meta.data?.sites ?? []}
              site={site}
              year={year}
              status={status}
              page={page}
              pageSize={pageSize}
              canManage={capabilities?.canManageRates === true}
              onFilter={patch}
              search={search}
              navigate={navigate}
            />
          </TabsContent>
          <TabsContent value='bpjs' className='mt-4 space-y-4'>
            <BpjsPolicySection
              sites={meta.data?.sites ?? []}
              site={site}
              year={year}
              canManagePolicy={capabilities?.canManagePolicy === true}
              canManageEnrollment={capabilities?.canManageRates === true}
              onFilter={patch}
              search={search}
              navigate={navigate}
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
  showEmployeeType,
  onChange,
}: {
  sites: Array<{ uid: string; code: string; name: string }>
  site: string
  employeeType: string
  status: string
  showEmployeeType: boolean
  onChange: (value: SearchState) => void
}) {
  const { lockedSite } = useSiteScopeFilter(site ? [site] : undefined)
  return (
    <div className='flex max-w-full flex-wrap gap-2'>
      {lockedSite ? (
        <SiteScopeFilter
          siteLabel={siteScopeLabel(
            lockedSite,
            sites.map((item) => ({ value: item.code, label: item.name }))
          )}
          className='h-8 w-full sm:w-auto'
        />
      ) : (
        <Select
          value={site || 'ALL'}
          onValueChange={(value) =>
            onChange({ site: value === 'ALL' ? undefined : value })
          }
        >
          <SelectTrigger
            className='h-8 w-full sm:w-44'
            aria-label='Filter site'
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
      )}
      {showEmployeeType && (
        <Select
          value={employeeType || 'ALL'}
          onValueChange={(value) =>
            onChange({ employeeType: value === 'ALL' ? undefined : value })
          }
        >
          <SelectTrigger
            className='h-8 w-full sm:w-40'
            aria-label='Filter jenis karyawan'
          >
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
        <SelectTrigger
          className='h-8 w-full sm:w-36'
          aria-label='Filter status'
        >
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
  search,
  navigate,
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
  search: SearchState
  navigate: NavigateFn
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const sortBy =
    search.sortBy === 'site' ||
    search.sortBy === 'employeeType' ||
    search.sortBy === 'status'
      ? search.sortBy
      : 'site'
  const sortDirection = search.sortDirection === 'asc' ? 'asc' : 'desc'
  const columns = useMemo<ColumnDef<PayrollPolicyVersion>[]>(
    () => [
      {
        id: 'site',
        accessorFn: (item) => item.site.name,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Site' />
        ),
        cell: ({ row }) => (
          <div>
            <p className='font-medium'>{row.original.site.name}</p>
            <p className='text-xs text-muted-foreground'>
              {row.original.site.code}
            </p>
          </div>
        ),
      },
      {
        id: 'employeeType',
        accessorFn: (item) => item.employeeType,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Jenis karyawan' />
        ),
        cell: ({ row }) => employeeTypeLabels[row.original.employeeType],
      },
      {
        id: 'scheme',
        header: 'Skema',
        cell: ({ row }) => (
          <div>
            <p>
              {row.original.wageBasis === 'TIME_BASED'
                ? 'Satuan waktu'
                : 'Satuan hasil'}
            </p>
            <p className='text-xs text-muted-foreground'>
              {row.original.payFrequency === 'WEEKLY' ? 'Mingguan' : 'Bulanan'}
            </p>
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        accessorFn: (item) => item.status,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Status' />
        ),
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === 'ACTIVE' ? 'default' : 'secondary'}
          >
            {row.original.status === 'ACTIVE' ? 'Aktif' : 'Dibatalkan'}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>Aksi</span>,
        cell: ({ row }) => (
          <DataTableActionButton
            label={`Lihat aturan ${row.original.employeeType}`}
            onClick={() => onOpen(row.original.uid)}
          >
            <Eye />
          </DataTableActionButton>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [onOpen]
  )
  return (
    <>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>Kebijakan Payroll</h2>
          <p className='text-sm text-muted-foreground'>
            Skema dan periode Payroll yang berlaku saat ini per site.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className='size-4' />
            Atur aturan
          </Button>
        )}
      </div>
      <ConfigurationDataTable
        data={items}
        columns={columns}
        search={search}
        navigate={navigate}
        total={query.data?.meta.total ?? 0}
        totalPages={query.data?.meta.totalPages ?? 1}
        isPending={query.isPending}
        isError={query.isError}
        onRetry={() => query.refetch()}
        sortBy={sortBy}
        sortDirection={sortDirection}
        searchPlaceholder='Cari site atau jenis karyawan...'
        emptyMessage='Belum ada kebijakan yang sesuai filter.'
        additionalFilters={
          <Filters
            sites={sites}
            site={site}
            employeeType={employeeType}
            status={status}
            showEmployeeType
            onChange={(value) => onFilter({ ...value, page: undefined })}
          />
        }
        hasAdditionalFilters={Boolean(site || employeeType || status)}
        onResetAdditionalFilters={() =>
          onFilter({
            site: undefined,
            employeeType: undefined,
            status: undefined,
            page: undefined,
          })
        }
        getRowId={(item) => item.uid}
        mobileCard={(policy) => (
          <PolicyCard
            key={policy.uid}
            policy={policy}
            onOpen={() => onOpen(policy.uid)}
          />
        )}
      />
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
            {policy.site.name} · Konfigurasi saat ini
          </p>
        </div>
        <Button
          variant='ghost'
          size='icon'
          onClick={onOpen}
          aria-label={`Lihat aturan ${policy.employeeType}`}
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
        <Fact
          label='Status'
          value={policy.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
        />
      </div>
      <p className='mt-4 border-t pt-3 text-xs text-muted-foreground'>
        Perubahan berlaku langsung untuk proses Payroll berikutnya.
      </p>
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
  }
  const currentSignature = JSON.stringify(input)
  const cutoffValid =
    cutoffType !== 'DAY_OF_MONTH' ||
    matrix.payFrequency !== 'MONTHLY' ||
    (Number(cutoffDay) >= 1 && Number(cutoffDay) <= 31)
  const valid = siteUid && reason.trim().length >= 5 && cutoffValid
  const submit = async () => {
    try {
      await create.mutateAsync({
        ...input,
        reason: reason.trim(),
        idempotencyKey: createKey('payroll-policy'),
      })
      toast.success('Aturan Payroll berhasil disimpan.')
      onOpenChange(false)
    } catch (error) {
      toast.error(apiMessage(error, 'Aturan Payroll gagal disimpan.'))
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
          <DialogTitle>Pengaturan Payroll</DialogTitle>
          <DialogDescription>
            Konfigurasi ini langsung menjadi aturan aktif untuk proses Payroll
            berikutnya.
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
            disabled={!siteUid || !cutoffValid || preview.isPending}
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
  canManage,
  onFilter,
  onOpen,
  search,
  navigate,
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
  canManage: boolean
  onFilter: (value: SearchState) => void
  onOpen: (uid: string) => void
  search: SearchState
  navigate: NavigateFn
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
  const sortBy =
    search.sortBy === 'site' ||
    search.sortBy === 'employeeType' ||
    search.sortBy === 'amount' ||
    search.sortBy === 'status'
      ? search.sortBy
      : 'employee'
  const sortDirection = search.sortDirection === 'desc' ? 'desc' : 'asc'
  const columns = useMemo<ColumnDef<PayrollEmployeeRate>[]>(
    () => [
      {
        id: 'employee',
        accessorFn: (item) => item.employee.fullName,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Karyawan' />
        ),
        cell: ({ row }) => (
          <div className='min-w-44'>
            <p className='font-medium'>{row.original.employee.fullName}</p>
            <p className='text-xs text-muted-foreground'>
              {row.original.employee.employeeNumber}
            </p>
          </div>
        ),
      },
      {
        id: 'site',
        accessorFn: (item) => item.site.name,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Site' />
        ),
      },
      {
        id: 'employeeType',
        accessorFn: (item) => item.employee.employeeType,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Jenis' />
        ),
        cell: ({ row }) =>
          employeeTypeLabels[row.original.employee.employeeType],
      },
      {
        id: 'amount',
        accessorFn: (item) => item.amount,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={resource === 'salaries' ? 'Gaji pokok' : 'Tarif per hari'}
          />
        ),
        cell: ({ row }) => (
          <span
            className={cn(
              'font-semibold whitespace-nowrap tabular-nums',
              row.original.amountMasked && 'text-muted-foreground'
            )}
          >
            {money(row.original.amount)}
          </span>
        ),
      },
      {
        id: 'status',
        accessorFn: (item) => item.status,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Status' />
        ),
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === 'ACTIVE' ? 'default' : 'secondary'}
          >
            {row.original.status === 'ACTIVE' ? 'Aktif' : 'Dibatalkan'}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>Aksi</span>,
        cell: ({ row }) => (
          <div className='flex justify-end gap-1'>
            <DataTableActionButton
              label={`Lihat histori ${row.original.employee.fullName}`}
              onClick={() => onOpen(row.original.uid)}
            >
              <Eye />
            </DataTableActionButton>
            {canManage && row.original.status === 'ACTIVE' && (
              <>
                <DataTableActionButton
                  label={`Koreksi ${row.original.employee.fullName}`}
                  onClick={() =>
                    setDialog({ mode: 'correct', item: row.original })
                  }
                >
                  <PencilLine />
                </DataTableActionButton>
                <DataTableActionButton
                  label={`Batalkan ${row.original.employee.fullName}`}
                  className='text-destructive'
                  onClick={() =>
                    setDialog({ mode: 'cancel', item: row.original })
                  }
                >
                  <XCircle />
                </DataTableActionButton>
              </>
            )}
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [canManage, onOpen, resource]
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
      <ConfigurationDataTable
        data={items}
        columns={columns}
        search={search}
        navigate={navigate}
        total={queryState.data?.meta.total ?? 0}
        totalPages={queryState.data?.meta.totalPages ?? 1}
        isPending={queryState.isPending}
        isError={queryState.isError}
        onRetry={() => queryState.refetch()}
        sortBy={sortBy}
        sortDirection={sortDirection}
        searchPlaceholder='Cari nama, nomor karyawan, atau site...'
        emptyMessage={`${title} belum tersedia untuk filter ini.`}
        additionalFilters={
          <Filters
            sites={sites}
            site={site}
            employeeType={employeeType}
            status={status}
            showEmployeeType={resource === 'daily-rates'}
            onChange={(value) => onFilter({ ...value, page: undefined })}
          />
        }
        hasAdditionalFilters={Boolean(
          site || status || (resource === 'daily-rates' && employeeType)
        )}
        onResetAdditionalFilters={() =>
          onFilter({
            site: undefined,
            employeeType: undefined,
            status: undefined,
            page: undefined,
          })
        }
        getRowId={(item) => item.uid}
        mobileCard={(item) => (
          <article key={item.uid} className='rounded-md border p-3'>
            <div className='flex items-start justify-between gap-2'>
              <div className='min-w-0'>
                <p className='truncate font-medium'>{item.employee.fullName}</p>
                <p className='truncate text-xs text-muted-foreground'>
                  {item.employee.employeeNumber} · {item.site.name}
                </p>
              </div>
              <Badge
                variant={item.status === 'ACTIVE' ? 'default' : 'secondary'}
              >
                {item.status === 'ACTIVE' ? 'Aktif' : 'Dibatalkan'}
              </Badge>
            </div>
            <div className='mt-3 flex items-end justify-between gap-2'>
              <div>
                <p className='font-semibold tabular-nums'>
                  {money(item.amount)}
                </p>
                <p className='text-xs text-muted-foreground'>
                  Berlaku saat ini
                </p>
              </div>
              <div className='flex gap-1'>
                <DataTableActionButton
                  label='Lihat detail'
                  onClick={() => onOpen(item.uid)}
                >
                  <Eye />
                </DataTableActionButton>
                {canManage && item.status === 'ACTIVE' && (
                  <>
                    <DataTableActionButton
                      label='Koreksi'
                      onClick={() => setDialog({ mode: 'correct', item })}
                    >
                      <PencilLine />
                    </DataTableActionButton>
                    <DataTableActionButton
                      label='Batalkan'
                      className='text-destructive'
                      onClick={() => setDialog({ mode: 'cancel', item })}
                    >
                      <XCircle />
                    </DataTableActionButton>
                  </>
                )}
              </div>
            </div>
          </article>
        )}
      />
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
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const create = useCreatePayrollRate()
  const correct = useCorrectPayrollRate()
  const cancel = useCancelPayrollRate()
  const mode = state?.mode
  const selected = state?.item
  const nominal = amount || selected?.amount || ''
  const valid =
    mode === 'cancel'
      ? reason.trim().length >= 5
      : Number(nominal) > 0 &&
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
              reason: reason.trim(),
              idempotencyKey: createKey('create-rate'),
            }
          : {
              amount: nominal,
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
          ? 'Master nominal dinonaktifkan.'
          : 'Master nominal saat ini berhasil disimpan.'
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
                ? 'Ubah Master Nominal'
                : 'Nonaktifkan Master Nominal'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'cancel'
              ? 'Data tidak dihapus dan tetap tercatat dalam histori audit.'
              : resource === 'salaries'
                ? 'Gaji pokok ini langsung berlaku untuk proses Payroll berikutnya.'
                : 'Tarif ini langsung berlaku untuk proses Payroll berikutnya.'}
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
          <SheetTitle>Detail Aturan Payroll</SheetTitle>
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
              <h3 className='font-semibold'>Penerapan</h3>
              <p className='mt-2 rounded-lg border bg-muted/30 p-3 text-sm'>
                Berlaku saat ini untuk proses Payroll berikutnya.
              </p>
            </section>
            <PeriodPreview periods={policy.nextPeriods} />
            <section>
              <h3 className='font-semibold'>Catatan</h3>
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
          <SheetTitle>Detail Master Nominal</SheetTitle>
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
              <FactBox label='Berlaku' value='Saat ini' />
              <FactBox
                label='Status'
                value={rate.status === 'ACTIVE' ? 'Aktif' : 'Nonaktif'}
              />
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
