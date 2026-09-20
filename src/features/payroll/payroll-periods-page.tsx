import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { addDays, format, parseISO } from 'date-fns'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { id } from 'date-fns/locale'
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  ExternalLink,
  FileClock,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RefreshCcw,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
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
  DataTableActionButton,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import { MonthPicker } from '@/components/month-picker'
import { hasPermission } from '@/features/auth/permissions'
import {
  useCancelPayrollPeriod,
  useCreatePayrollPeriod,
  usePayrollPolicies,
  usePayrollPeriod,
  usePayrollPeriodEmployees,
  usePayrollPeriodMeta,
  usePayrollPeriodResetPreview,
  usePayrollPeriods,
  usePreviewPayrollPeriod,
  useResetPayrollPeriod,
} from './data/queries'
import type {
  PayrollEmployeeType,
  PayrollPeriodReadinessEmployee,
  PayrollPeriodStatus,
  PayrollPeriodSummary,
  PayrollPeriodsResult,
  PayrollReadinessStatus,
} from './domain'
import { periodForDate, pieceRatePeriodForDates } from './payroll-period-policy'
import { PayrollProcessNav } from './payroll-process-nav'
import {
  nextPayrollProcessStage,
  payrollProcessHref,
} from './payroll-process-navigation'

const statusLabels: Record<PayrollPeriodStatus, string> = {
  DRAFT: 'Draft',
  CALCULATED: 'Sudah dihitung',
  APPROVED: 'Disetujui',
  CLOSED: 'Ditutup',
  CANCELLED: 'Dibatalkan',
}
const readinessLabels: Record<PayrollReadinessStatus, string> = {
  READY: 'Siap',
  ATTENTION: 'Perlu perhatian',
  BLOCKED: 'Terblokir',
}
const employeeTypeLabels: Record<PayrollEmployeeType, string> = {
  BORONGAN: 'Borongan',
  HARIAN: 'Harian',
  TRAINING: 'Training',
  BULANAN: 'Bulanan',
}
function employeeTypeLabel(value?: PayrollEmployeeType) {
  return value ? employeeTypeLabels[value] : 'Borongan'
}

function monthFromInput(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  if (month < 1 || month > 12) return undefined
  return new Date(year, month - 1, 1)
}

function dateLabel(value: string | null) {
  return value ? format(parseISO(value), 'd MMM yyyy', { locale: id }) : '—'
}
function rupiah(value: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}
function inputDate(value: Date | undefined) {
  return value ? format(value, 'yyyy-MM-dd') : undefined
}

function parseInputDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? parseISO(value)
    : undefined
}
function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}

export function PayrollPeriodsPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const session = useAuthStore((state) => state.session)
  const canCalculate = hasPermission(session, 'payroll.calculate')
  const canReset =
    session?.user.role === 'SUPER_ADMIN' ||
    session?.user.roles.includes('SUPER_ADMIN') === true
  const params = {
    page: typeof search.page === 'number' ? search.page : 1,
    pageSize: typeof search.pageSize === 'number' ? search.pageSize : 50,
    query: typeof search.filter === 'string' ? search.filter : undefined,
    site: Array.isArray(search.site) ? search.site : undefined,
    status: Array.isArray(search.status) ? search.status : undefined,
    employeeType: Array.isArray(search.employeeType)
      ? search.employeeType
      : undefined,
    dateFrom: typeof search.dateFrom === 'string' ? search.dateFrom : undefined,
    dateTo: typeof search.dateTo === 'string' ? search.dateTo : undefined,
  }
  const periods = usePayrollPeriods(params)
  const meta = usePayrollPeriodMeta()
  const [createOpen, setCreateOpen] = useState(false)
  const detailUid =
    typeof search.detailUid === 'string' ? search.detailUid : undefined

  return (
    <Main>
      <div className='space-y-4'>
        <header className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <p className='text-sm font-medium text-primary'>Payroll</p>
            <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
              Proses Payroll
            </h1>
            <p className='max-w-3xl text-sm text-muted-foreground'>
              Selesaikan Payroll dari menyiapkan periode sampai menutup hasil
              melalui tiga tahap yang jelas.
            </p>
          </div>
          {canCalculate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Buat periode
            </Button>
          )}
        </header>

        <PayrollProcessNav active='PERIOD' periodUid={detailUid} />

        <Alert className='border-sky-500/40 bg-sky-500/5'>
          <CircleDollarSign className='text-sky-700' />
          <AlertTitle>Belum menghitung gaji</AlertTitle>
          <AlertDescription>
            Periode Draft hanya memeriksa kesiapan data. Belum ada hasil atau
            data finansial Payroll yang disimpan pada tahap ini.
          </AlertDescription>
        </Alert>

        <PayrollKpis data={periods.data} pending={periods.isPending} />
        {periods.isError ? (
          <ErrorState onRetry={() => void periods.refetch()} />
        ) : (
          <PayrollPeriodsTable
            items={periods.data?.data ?? []}
            total={periods.data?.meta.total ?? 0}
            totalPages={periods.data?.meta.totalPages ?? 1}
            search={search}
            navigate={navigate}
            sites={meta.data?.sites ?? []}
            pending={periods.isPending}
            fetching={periods.isFetching}
            onDetail={(uid) =>
              navigate({
                search: (previous) => ({ ...previous, detailUid: uid }),
              })
            }
          />
        )}
      </div>
      <CreatePeriodDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        sites={meta.data?.sites ?? []}
      />
      <PeriodDetailSheet
        uid={detailUid}
        open={Boolean(detailUid)}
        onOpenChange={(open) =>
          !open &&
          navigate({
            search: (previous) => ({ ...previous, detailUid: undefined }),
          })
        }
        canCalculate={canCalculate}
        canReset={canReset}
        onReset={() =>
          navigate({
            search: (previous) => ({ ...previous, detailUid: undefined }),
          })
        }
      />
    </Main>
  )
}

function PayrollKpis({
  data,
  pending,
}: {
  data?: PayrollPeriodsResult
  pending: boolean
}) {
  const summary = data?.meta.summary
  const current = data?.data ?? []
  const cards = [
    {
      label: 'Total periode',
      value: summary?.total ?? data?.meta.total ?? 0,
      icon: CalendarClock,
      tone: 'border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/30',
    },
    {
      label: 'Draft',
      value:
        summary?.draft ??
        current.filter((item) => item.status === 'DRAFT').length,
      icon: FileClock,
      tone: 'border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/30',
    },
    {
      label: 'Perlu tindak lanjut',
      value:
        summary?.needsAttention ??
        current.filter((item) => item.readiness.status !== 'READY').length,
      icon: AlertTriangle,
      tone: 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30',
    },
    {
      label: 'Closed',
      value:
        summary?.closed ??
        current.filter((item) => item.status === 'CLOSED').length,
      icon: LockKeyhole,
      tone: 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30',
    },
  ]
  return (
    <section
      aria-label='Ringkasan periode Payroll'
      className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'
    >
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn(
            'min-h-[68px] rounded-lg border px-3 py-2.5',
            card.tone
          )}
        >
          <div className='flex items-center justify-between gap-2'>
            <p className='text-xs font-medium text-muted-foreground'>
              {card.label}
            </p>
            <card.icon className='size-4 opacity-70' />
          </div>
          {pending ? (
            <Skeleton className='mt-2 h-6 w-16' />
          ) : (
            <p className='mt-1 text-xl font-bold'>
              {card.value.toLocaleString('id-ID')}
            </p>
          )}
        </div>
      ))}
    </section>
  )
}

function PayrollPeriodsTable({
  items,
  total,
  totalPages,
  search,
  navigate,
  sites,
  pending,
  fetching,
  onDetail,
}: {
  items: PayrollPeriodSummary[]
  total: number
  totalPages: number
  search: Record<string, unknown>
  navigate: NavigateFn
  sites: Array<{ code: string; name: string }>
  pending: boolean
  fetching: boolean
  onDetail: (uid: string) => void
}) {
  const columns = useMemo<ColumnDef<PayrollPeriodSummary>[]>(
    () => [
      {
        id: 'period',
        header: 'Periode',
        cell: ({ row }) => (
          <div className='min-w-0'>
            <p className='truncate font-semibold'>{row.original.periodName}</p>
            <p className='truncate text-xs text-muted-foreground'>
              {employeeTypeLabel(row.original.employeeType)} ·{' '}
              {row.original.payFrequency === 'WEEKLY' ? 'Mingguan' : 'Bulanan'}{' '}
              · {row.original.periodCode}
            </p>
          </div>
        ),
      },
      {
        id: 'site',
        accessorFn: (row) => row.site.code,
        header: 'Site',
        cell: ({ row }) => row.original.site.name,
      },
      {
        id: 'employeeType',
        accessorFn: (row) => row.employeeType,
        header: 'Jenis payroll',
      },
      {
        id: 'dates',
        header: 'Rentang & pembayaran',
        cell: ({ row }) => (
          <div>
            <p>
              {dateLabel(row.original.periodStart)} –{' '}
              {dateLabel(row.original.periodEnd)}
            </p>
            <p className='text-xs text-muted-foreground'>
              Bayar: {dateLabel(row.original.paymentDate)}
            </p>
          </div>
        ),
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'readiness',
        header: 'Kesiapan',
        cell: ({ row }) => (
          <div className='space-y-1'>
            <ReadinessBadge status={row.original.readiness.status} />
            <p className='text-xs text-muted-foreground'>
              {row.original.readiness.populationCount} karyawan ·{' '}
              {row.original.readiness.blockerCount} harus diperbaiki
            </p>
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <div className='text-right'>Aksi</div>,
        cell: ({ row }) => {
          const stage = nextPayrollProcessStage(row.original.status)
          const actionLabel =
            stage === 'APPROVAL'
              ? 'Buka persetujuan & penutupan'
              : 'Lanjut ke perhitungan'
          return (
            <div className='flex justify-end gap-1'>
              <DataTableActionButton
                label={`Lihat detail ${row.original.periodName}`}
                onClick={() => onDetail(row.original.uid)}
              >
                <Eye className='size-4' />
              </DataTableActionButton>
              {row.original.status !== 'CANCELLED' &&
                (row.original.readiness.status === 'BLOCKED' ? (
                  <DataTableActionButton
                    label='Perbaiki kesiapan terlebih dahulu'
                    disabled
                  >
                    <ExternalLink className='size-4' />
                  </DataTableActionButton>
                ) : (
                  <DataTableActionButton label={actionLabel} asChild>
                    <a href={payrollProcessHref(stage, row.original.uid)}>
                      <ExternalLink className='size-4' />
                    </a>
                  </DataTableActionButton>
                ))}
            </div>
          )
        },
        enableHiding: false,
      },
    ],
    [onDetail]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'status', searchKey: 'status', type: 'array' },
      {
        columnId: 'employeeType',
        searchKey: 'employeeType',
        type: 'array',
      },
    ],
  })
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: items,
    columns,
    state: {
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
    },
    manualPagination: true,
    manualFiltering: true,
    initialState: { columnVisibility: { employeeType: false } },
    pageCount: Math.max(1, totalPages),
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
  })
  const dateFrom = parseInputDate(search.dateFrom)
  const dateTo = parseInputDate(search.dateTo)
  const patch = (value: Record<string, unknown>) =>
    navigate({
      search: (previous) => ({ ...previous, ...value, page: undefined }),
    })

  return (
    <div className='space-y-3'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari kode atau nama periode...'
        searchDebounceMs={250}
        filters={[
          {
            columnId: 'site',
            title: 'Site',
            options: sites.map((site) => ({
              value: site.code,
              label: site.name,
            })),
          },
          {
            columnId: 'status',
            title: 'Status',
            options: Object.entries(statusLabels).map(([value, label]) => ({
              value,
              label,
            })),
          },
          {
            columnId: 'employeeType',
            title: 'Jenis payroll',
            options: Object.entries(employeeTypeLabels).map(
              ([value, label]) => ({ value, label })
            ),
          },
        ]}
        additionalFilters={
          <div className='grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto'>
            <DatePicker
              selected={dateFrom}
              onSelect={(date) => patch({ dateFrom: inputDate(date) })}
              placeholder='Dari tanggal'
              triggerClassName='h-8 sm:w-38'
            />
            <DatePicker
              selected={dateTo}
              onSelect={(date) => patch({ dateTo: inputDate(date) })}
              placeholder='Sampai tanggal'
              triggerClassName='h-8 sm:w-38'
            />
          </div>
        }
        hasAdditionalFilters={Boolean(dateFrom || dateTo)}
        onResetAdditionalFilters={() =>
          patch({ dateFrom: undefined, dateTo: undefined })
        }
      />
      {fetching && !pending && (
        <p className='text-xs text-muted-foreground' role='status'>
          Memperbarui data…
        </p>
      )}
      <div className='hidden overflow-hidden rounded-md border md:block'>
        <Table className='table-fixed'>
          <TableHeader>
            <TableRow>
              {table.getHeaderGroups()[0]?.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={
                    header.id === 'actions'
                      ? 'w-24'
                      : header.id === 'status'
                        ? 'w-32'
                        : header.id === 'site'
                          ? 'w-32'
                          : undefined
                  }
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending ? (
              <LoadingRows columns={columns.length} />
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.original.uid}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className='h-28 text-center text-muted-foreground'
                >
                  Belum ada periode yang sesuai filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className='space-y-2 md:hidden'>
        {pending ? (
          Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className='h-36 rounded-lg' />
          ))
        ) : items.length ? (
          items.map((item) => (
            <button
              key={item.uid}
              type='button'
              onClick={() => onDetail(item.uid)}
              className='w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring'
            >
              <div className='flex items-start justify-between gap-2'>
                <div>
                  <p className='font-semibold'>{item.periodName}</p>
                  <p className='text-xs text-muted-foreground'>
                    {item.site.name} · {employeeTypeLabel(item.employeeType)} ·{' '}
                    {item.periodCode}
                  </p>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <p className='mt-3 text-sm'>
                {dateLabel(item.periodStart)} – {dateLabel(item.periodEnd)}
              </p>
              <div className='mt-2 flex items-center justify-between gap-2'>
                <ReadinessBadge status={item.readiness.status} />
                <span className='text-xs text-muted-foreground'>
                  {item.readiness.populationCount} karyawan
                </span>
              </div>
            </button>
          ))
        ) : (
          <div className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
            Belum ada periode yang sesuai filter.
          </div>
        )}
      </div>
      <DataTablePagination
        table={table}
        summary={
          total
            ? `Menampilkan ${Math.min(url.pagination.pageIndex * url.pagination.pageSize + 1, total)}–${Math.min((url.pagination.pageIndex + 1) * url.pagination.pageSize, total)} dari ${total.toLocaleString('id-ID')} periode`
            : '0 periode'
        }
      />
    </div>
  )
}

function StatusBadge({ status }: { status: PayrollPeriodStatus }) {
  return (
    <Badge
      variant='outline'
      className={cn(
        'font-medium',
        status === 'DRAFT' &&
          'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200',
        status === 'CALCULATED' &&
          'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200',
        status === 'APPROVED' &&
          'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
        status === 'CLOSED' &&
          'border-teal-200 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200',
        status === 'CANCELLED' &&
          'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200'
      )}
    >
      {statusLabels[status]}
    </Badge>
  )
}
function ReadinessBadge({ status }: { status: PayrollReadinessStatus }) {
  const Icon = status === 'READY' ? CheckCircle2 : AlertTriangle
  return (
    <Badge
      variant='outline'
      className={cn(
        'gap-1',
        status === 'READY'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
          : status === 'BLOCKED'
            ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
            : 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
      )}
    >
      <Icon className='size-3' /> {readinessLabels[status]}
    </Badge>
  )
}
function LoadingRows({ columns }: { columns: number }) {
  return Array.from({ length: 5 }).map((_, index) => (
    <TableRow key={index}>
      <TableCell colSpan={columns}>
        <Skeleton className='h-8 w-full' />
      </TableCell>
    </TableRow>
  ))
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className='rounded-lg border border-dashed p-8 text-center'>
      <AlertTriangle className='mx-auto size-7 text-destructive' />
      <p className='mt-2 font-medium'>Daftar periode gagal dimuat.</p>
      <p className='text-sm text-muted-foreground'>
        Tidak ada data yang diubah. Periksa koneksi lalu coba lagi.
      </p>
      <Button className='mt-4' variant='outline' onClick={onRetry}>
        <RefreshCcw /> Coba lagi
      </Button>
    </div>
  )
}

function CreatePeriodDialog({
  open,
  onOpenChange,
  sites,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sites: Array<{ uid: string; code: string; name: string }>
}) {
  const mutation = useCreatePayrollPeriod()
  const preview = usePreviewPayrollPeriod()
  const [siteUid, setSiteUid] = useState('')
  const [employeeType, setEmployeeType] =
    useState<PayrollEmployeeType>('BORONGAN')
  const [periodAnchor, setPeriodAnchor] = useState<Date>(new Date())
  const [pieceRateStart, setPieceRateStart] = useState<Date>(new Date())
  const [pieceRateEnd, setPieceRateEnd] = useState<Date>(new Date())
  const [payment, setPayment] = useState<Date>()
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [deductBpjs, setDeductBpjs] = useState(false)
  const [bpjsContributionMonth, setBpjsContributionMonth] = useState(
    format(new Date(), 'yyyy-MM')
  )
  const selectedSite = sites.find((site) => site.uid === siteUid)
  const policies = usePayrollPolicies(
    {
      site: selectedSite?.code,
      employeeType,
      status: 'ACTIVE',
    },
    open && Boolean(selectedSite)
  )
  const pieceRatePeriod = pieceRatePeriodForDates(pieceRateStart, pieceRateEnd)
  const policy = policies.data?.data.find(
    (item) => item.employeeType === employeeType && item.status === 'ACTIVE'
  )
  const selectedPeriod = policy
    ? employeeType === 'BORONGAN'
      ? pieceRatePeriod
      : periodForDate(periodAnchor, policy)
    : undefined
  const previewMatches =
    preview.data?.site.uid === siteUid &&
    preview.data.policy.employeeType === employeeType &&
    preview.data.period.periodStart === selectedPeriod?.periodStart &&
    preview.data.period.periodEnd === selectedPeriod?.periodEnd
  const invalid =
    !siteUid ||
    !selectedPeriod ||
    !previewMatches ||
    (deductBpjs && !bpjsContributionMonth)

  const resetPreview = () => {
    preview.reset()
  }

  const close = (next: boolean) => {
    if (mutation.isPending) return
    onOpenChange(next)
    if (!next) {
      setSiteUid('')
      setEmployeeType('BORONGAN')
      setPeriodAnchor(new Date())
      setPieceRateStart(new Date())
      setPieceRateEnd(new Date())
      setPayment(undefined)
      setName('')
      setNotes('')
      setDeductBpjs(false)
      setBpjsContributionMonth(format(new Date(), 'yyyy-MM'))
      preview.reset()
    }
  }
  const submit = async () => {
    if (invalid || !selectedPeriod) return
    try {
      await mutation.mutateAsync({
        siteUid,
        employeeType,
        periodStart: selectedPeriod.periodStart,
        periodEnd: selectedPeriod.periodEnd,
        paymentDate: inputDate(payment) ?? null,
        deductBpjs,
        bpjsContributionMonth: deductBpjs ? bpjsContributionMonth : null,
        periodName: name.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      toast.success('Periode Payroll berhasil dibuat.')
      close(false)
    } catch (error) {
      toast.error(apiMessage(error, 'Periode Payroll gagal dibuat.'))
    }
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Buat Periode Payroll</DialogTitle>
          <DialogDescription>
            Periode Borongan dapat memakai rentang fleksibel maksimal 31 hari.
            Jenis Payroll lainnya mengikuti aturan Payroll aktif.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='payroll-site'>Site</Label>
            <Select
              value={siteUid}
              onValueChange={(value) => {
                setSiteUid(value)
                resetPreview()
              }}
            >
              <SelectTrigger id='payroll-site' className='w-full'>
                <SelectValue placeholder='Pilih site' />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.uid} value={site.uid}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='payroll-employee-type'>Jenis payroll</Label>
            <Select
              value={employeeType}
              onValueChange={(value: PayrollEmployeeType) => {
                setEmployeeType(value)
                resetPreview()
              }}
            >
              <SelectTrigger id='payroll-employee-type' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(employeeTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {employeeType === 'BORONGAN' ? (
            <div className='grid gap-3 sm:col-span-2 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label>Dari tanggal</Label>
                <DatePicker
                  selected={pieceRateStart}
                  onSelect={(date) => {
                    if (!date) return
                    const nextPeriod = pieceRatePeriodForDates(
                      date,
                      pieceRateEnd
                    )
                    setPieceRateStart(date)
                    setPieceRateEnd(parseISO(nextPeriod.periodEnd))
                    resetPreview()
                  }}
                />
              </div>
              <div className='space-y-2'>
                <Label>Sampai tanggal</Label>
                <DatePicker
                  selected={pieceRateEnd}
                  onSelect={(date) => {
                    if (!date) return
                    setPieceRateEnd(date)
                    resetPreview()
                  }}
                  disabledDates={(date) =>
                    date < pieceRateStart || date > addDays(pieceRateStart, 30)
                  }
                />
              </div>
              <p className='text-xs text-muted-foreground sm:col-span-2'>
                Pilih rentang fakta Produksi yang ingin dibayar, maksimal 31
                hari termasuk tanggal mulai dan akhir.
              </p>
            </div>
          ) : (
            <div className='space-y-2 sm:col-span-2'>
              <Label>Tanggal acuan periode</Label>
              <DatePicker
                selected={periodAnchor}
                onSelect={(date) => {
                  if (!date) return
                  setPeriodAnchor(date)
                  resetPreview()
                }}
              />
              <p className='text-xs text-muted-foreground'>
                Pilih satu tanggal di dalam periode yang ingin diproses. Sistem
                menentukan awal dan akhir periode dari aturan yang berlaku saat
                itu.
              </p>
            </div>
          )}
          <div className='space-y-2 sm:col-span-2'>
            <Label>Aturan Payroll yang digunakan</Label>
            {!siteUid ? (
              <div className='rounded-lg border border-dashed p-4 text-sm text-muted-foreground'>
                Pilih site untuk mencari aturan Payroll aktif.
              </div>
            ) : policies.isPending ? (
              <Skeleton className='h-20 w-full' />
            ) : policy ? (
              <div className='rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/20'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <p className='font-semibold'>
                    {employeeTypeLabels[policy.employeeType]}
                  </p>
                  <Badge variant='outline'>Konfigurasi aktif</Badge>
                </div>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {policy.wageBasis === 'PIECE_RATE'
                    ? 'Satuan hasil'
                    : 'Satuan waktu'}{' '}
                  · {policy.payFrequency === 'WEEKLY' ? 'Mingguan' : 'Bulanan'}
                </p>
              </div>
            ) : (
              <Alert variant='destructive'>
                <AlertTriangle />
                <AlertTitle>Aturan Payroll belum tersedia</AlertTitle>
                <AlertDescription>
                  Lengkapi aturan {employeeTypeLabels[employeeType]} untuk site
                  ini di menu Skema Upah & Tarif.
                </AlertDescription>
              </Alert>
            )}
          </div>
          {policy ? (
            <div className='space-y-2 sm:col-span-2'>
              <Label>
                {employeeType === 'BORONGAN'
                  ? 'Rentang pilihan'
                  : 'Rentang berdasarkan aturan'}
              </Label>
              <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
                <span className='font-semibold'>
                  {dateLabel(selectedPeriod!.periodStart)}–
                  {dateLabel(selectedPeriod!.periodEnd)}
                </span>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {employeeType === 'BORONGAN'
                    ? 'Periode Borongan fleksibel mengikuti fakta Produksi.'
                    : policy.payFrequency === 'WEEKLY'
                      ? 'Periode mingguan Senin–Minggu.'
                      : 'Periode bulanan mengikuti tanggal tutup buku pada aturan.'}
                </p>
              </div>
            </div>
          ) : null}
          {selectedPeriod ? (
            <div className='sm:col-span-2'>
              <Button
                type='button'
                variant='secondary'
                onClick={() =>
                  void preview
                    .mutateAsync({
                      siteUid,
                      employeeType,
                      periodStart: selectedPeriod.periodStart,
                      periodEnd: selectedPeriod.periodEnd,
                      deductBpjs,
                      bpjsContributionMonth: deductBpjs
                        ? bpjsContributionMonth
                        : null,
                    })
                    .catch((error) =>
                      toast.error(
                        apiMessage(error, 'Preview periode gagal dimuat.')
                      )
                    )
                }
                disabled={preview.isPending}
              >
                {preview.isPending ? (
                  <LoaderCircle className='animate-spin' />
                ) : (
                  <Eye />
                )}
                Periksa kesiapan
              </Button>
            </div>
          ) : null}
          {previewMatches && preview.data ? (
            <PreviewSummary preview={preview.data} />
          ) : null}
          {employeeType === 'BORONGAN' ? (
            <div className='space-y-3 rounded-lg border p-3 sm:col-span-2'>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <Label htmlFor='deduct-bpjs'>Potong BPJS</Label>
                  <p className='text-xs text-muted-foreground'>
                    Aktifkan hanya pada satu periode yang menanggung iuran bulan
                    terpilih.
                  </p>
                </div>
                <Switch
                  id='deduct-bpjs'
                  checked={deductBpjs}
                  onCheckedChange={(checked) => {
                    setDeductBpjs(checked)
                    resetPreview()
                  }}
                />
              </div>
              {deductBpjs ? (
                <div className='space-y-1'>
                  <Label htmlFor='bpjs-contribution-month'>Bulan iuran</Label>
                  <MonthPicker
                    id='bpjs-contribution-month'
                    selected={monthFromInput(bpjsContributionMonth)}
                    onSelect={(date) => {
                      setBpjsContributionMonth(
                        date ? format(date, 'yyyy-MM') : ''
                      )
                      resetPreview()
                    }}
                    placeholder='Pilih bulan iuran'
                  />
                  <p className='text-xs text-muted-foreground'>
                    UMK, policy, dan proteksi potongan ganda mengikuti bulan
                    ini.
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className='space-y-2'>
            <Label>Tanggal pembayaran (opsional)</Label>
            <DatePicker
              selected={payment}
              onSelect={setPayment}
              disabledDates={(date) =>
                Boolean(
                  selectedPeriod &&
                  format(date, 'yyyy-MM-dd') < selectedPeriod.periodEnd
                )
              }
              placeholder='Belum ditentukan'
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='payroll-name'>Nama periode (opsional)</Label>
            <Input
              id='payroll-name'
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder='Dibuat otomatis bila kosong'
              maxLength={150}
            />
          </div>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='payroll-notes'>Catatan (opsional)</Label>
            <Textarea
              id='payroll-notes'
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={500}
              placeholder='Catatan internal periode Payroll'
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => close(false)}
            disabled={mutation.isPending}
          >
            Batal
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={invalid || mutation.isPending}
          >
            {mutation.isPending && <LoaderCircle className='animate-spin' />}
            Simpan Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewSummary({
  preview,
}: {
  preview: import('./domain').PayrollPeriodPreview
}) {
  if (preview.policy.wageBasis === 'PIECE_RATE') {
    return (
      <Alert className='sm:col-span-2'>
        <CheckCircle2 />
        <AlertTitle>Aturan Borongan tersedia</AlertTitle>
        <AlertDescription>
          Populasi dan transaksi Produksi diperiksa kembali setelah periode
          Draft dibuat.
        </AlertDescription>
      </Alert>
    )
  }
  const blocked = preview.readiness.blockerCount
  return (
    <div className='space-y-2 rounded-lg border p-3 sm:col-span-2'>
      <div className='flex items-center justify-between gap-2'>
        <p className='font-semibold'>Preview kesiapan</p>
        <Badge variant={blocked ? 'destructive' : 'secondary'}>
          {blocked ? `${blocked} perlu diperbaiki` : 'Siap dibuat'}
        </Badge>
      </div>
      <div className='grid grid-cols-3 gap-2 text-sm'>
        <Fact label='Karyawan' value={preview.summary.populationCount} />
        <Fact
          label='PRESENT dibayar'
          value={preview.summary.payablePresentDays}
        />
        <Fact
          label='PRESENT nonkerja'
          value={preview.summary.offdayPresentDays}
        />
      </div>
      <div className='grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-2 text-sm'>
        <Fact
          label='Estimasi bruto'
          value={Number(preview.summary.estimatedGrossAmount)}
          money
        />
        <Fact
          label='Estimasi potongan'
          value={Number(preview.summary.estimatedDeductionAmount)}
          money
        />
        <Fact
          label='Estimasi neto'
          value={Number(preview.summary.estimatedNetAmount)}
          money
        />
      </div>
      {preview.summary.offdayPresentDays > 0 ? (
        <p className='rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
          PRESENT pada hari nonkerja tetap dibayar dan ditandai untuk review.
        </p>
      ) : null}
      {preview.readiness.blockers.length > 0 ? (
        <div className='space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs'>
          {preview.readiness.blockers.slice(0, 3).map((item) => (
            <p key={item.code} className='text-destructive'>
              {item.message}
              {item.count > 1 ? ` (${item.count})` : ''}
            </p>
          ))}
          {preview.readiness.blockers.length > 3 ? (
            <p className='text-muted-foreground'>
              +{preview.readiness.blockers.length - 3} pemeriksaan lain setelah
              Draft disimpan.
            </p>
          ) : null}
        </div>
      ) : null}
      <p className='text-xs text-muted-foreground'>
        Pemeriksaan ini belum membuat perhitungan atau hasil finansial permanen.
      </p>
    </div>
  )
}

function PeriodDetailSheet({
  uid,
  open,
  onOpenChange,
  canCalculate,
  canReset,
  onReset,
}: {
  uid?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  canCalculate: boolean
  canReset: boolean
  onReset: () => void
}) {
  const detail = usePayrollPeriod(uid)
  const employees = usePayrollPeriodEmployees(uid)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [employee, setEmployee] = useState<PayrollPeriodReadinessEmployee>()
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className='w-full overflow-y-auto p-0 sm:max-w-xl'>
          <SheetHeader className='border-b p-5 pe-12'>
            <SheetTitle>Detail Periode Payroll</SheetTitle>
            <SheetDescription>
              Kesiapan data dihitung langsung dari kondisi terbaru.
            </SheetDescription>
          </SheetHeader>
          {detail.isPending ? (
            <div className='space-y-3 p-5'>
              <Skeleton className='h-24 w-full' />
              <Skeleton className='h-40 w-full' />
            </div>
          ) : detail.isError || !detail.data ? (
            <div className='p-5'>
              <ErrorState onRetry={() => void detail.refetch()} />
            </div>
          ) : (
            <div className='space-y-4 p-5'>
              <div className='rounded-lg border p-4'>
                <div className='flex items-start justify-between gap-2'>
                  <div>
                    <p className='font-semibold'>{detail.data.periodName}</p>
                    <p className='text-xs text-muted-foreground'>
                      {detail.data.site.name} · {detail.data.periodCode}
                    </p>
                    <p className='mt-1 text-xs font-medium text-primary'>
                      {employeeTypeLabel(detail.data.employeeType)} ·{' '}
                      {detail.data.payFrequency === 'WEEKLY'
                        ? 'Mingguan'
                        : 'Bulanan'}
                    </p>
                  </div>
                  <StatusBadge status={detail.data.status} />
                </div>
                <p className='mt-3 text-sm'>
                  {dateLabel(detail.data.periodStart)} –{' '}
                  {dateLabel(detail.data.periodEnd)}
                </p>
                <p className='text-sm text-muted-foreground'>
                  Pembayaran: {dateLabel(detail.data.paymentDate)}
                </p>
                {detail.data.employeeType === 'BORONGAN' ? (
                  <p className='mt-1 text-sm text-muted-foreground'>
                    BPJS:{' '}
                    {detail.data.deductBpjs
                      ? `Dipotong untuk ${detail.data.bpjsContributionMonth}`
                      : 'Tidak dipotong pada periode ini'}
                  </p>
                ) : null}
              </div>
              <SchemeMetrics period={detail.data} />
              <section className='space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                  <h3 className='font-semibold'>Kesiapan periode</h3>
                  <ReadinessBadge status={detail.data.readiness.status} />
                </div>
                <IssueGroup
                  title='Harus diperbaiki'
                  items={detail.data.readiness.blockers}
                  tone='danger'
                  empty='Tidak ada masalah yang harus diperbaiki.'
                />
                <IssueGroup
                  title='Perlu perhatian'
                  items={detail.data.readiness.warnings}
                  tone='warning'
                  empty='Tidak ada peringatan.'
                />
              </section>
              {employees.data?.data.length ? (
                <section className='space-y-2'>
                  <div>
                    <h3 className='font-semibold'>Kesiapan per karyawan</h3>
                    <p className='text-xs text-muted-foreground'>
                      Pilih karyawan untuk melihat tanggal eligible, alasan, dan
                      tindak lanjut yang diperlukan.
                    </p>
                  </div>
                  <div className='max-h-72 space-y-1 overflow-y-auto rounded-lg border p-1'>
                    {employees.data.data.map((item) => (
                      <button
                        key={item.employeeUid}
                        type='button'
                        onClick={() => setEmployee(item)}
                        className='flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring'
                      >
                        <span className='min-w-0'>
                          <span className='block truncate text-sm font-medium'>
                            {item.fullName}
                          </span>
                          <span className='block text-xs text-muted-foreground'>
                            {item.employeeNumber} ·{' '}
                            {dateLabel(item.eligibleFrom)}–
                            {dateLabel(item.eligibleTo)}
                          </span>
                        </span>
                        <Badge
                          variant={
                            item.baseCoverage === 'COVERED' &&
                            item.contractCoverage === 'VALID'
                              ? 'secondary'
                              : 'destructive'
                          }
                        >
                          {item.baseCoverage === 'COVERED' &&
                          item.contractCoverage === 'VALID'
                            ? 'Siap'
                            : 'Periksa'}
                        </Badge>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
              <section className='rounded-lg border p-4'>
                <h3 className='font-semibold'>Fakta Produksi & Komponen</h3>
                <dl className='mt-2 grid grid-cols-2 gap-2 text-sm'>
                  <Fact
                    label='Transaksi POSTED'
                    value={detail.data.readiness.facts.postedTransactionCount}
                  />
                  <Fact
                    label='Komponen aktif'
                    value={detail.data.readiness.facts.activeComponentCount}
                  />
                  <div className='col-span-2 rounded-md bg-muted/50 p-2'>
                    <dt className='text-xs text-muted-foreground'>
                      Estimasi bruto Produksi
                    </dt>
                    <dd className='font-semibold'>
                      {rupiah(
                        detail.data.readiness.facts.productionGrossAmount
                      )}
                    </dd>
                  </div>
                </dl>
                <p className='mt-3 text-xs text-muted-foreground'>
                  Nilai bruto Produksi belum merupakan gaji bersih dan belum
                  memasukkan komponen Payroll.
                </p>
              </section>
              <section className='rounded-lg border p-4'>
                <h3 className='font-semibold'>Fakta Attendance</h3>
                <dl className='mt-2 grid grid-cols-2 gap-2 text-sm'>
                  <Fact
                    label='Hari diharapkan'
                    value={detail.data.readiness.facts.expectedAttendanceDays}
                  />
                  <Fact
                    label='Sudah final'
                    value={detail.data.readiness.facts.finalizedAttendanceDays}
                  />
                  <Fact
                    label='Alpha'
                    value={detail.data.readiness.facts.attendance.absent}
                  />
                  <Fact
                    label='Terlambat'
                    value={detail.data.readiness.facts.attendance.late}
                  />
                  <Fact
                    label='Pulang awal'
                    value={detail.data.readiness.facts.attendance.earlyLeave}
                  />
                  <Fact
                    label='Rekening belum lengkap'
                    value={detail.data.readiness.facts.missingBankAccounts}
                  />
                </dl>
                <p className='mt-3 text-xs text-muted-foreground'>
                  Informasi Attendance tidak otomatis menjadi potongan upah.
                </p>
              </section>
              {detail.data.status === 'CANCELLED' &&
                detail.data.cancellationReason && (
                  <Alert variant='destructive'>
                    <Ban />
                    <AlertTitle>Periode dibatalkan</AlertTitle>
                    <AlertDescription>
                      {detail.data.cancellationReason}
                    </AlertDescription>
                  </Alert>
                )}
              {detail.data.status !== 'CANCELLED' && (
                <div className='rounded-lg border border-primary/30 bg-primary/5 p-3'>
                  <p className='text-sm font-semibold'>Tindakan selanjutnya</p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {detail.data.readiness.status === 'BLOCKED'
                      ? 'Perbaiki masalah kesiapan di atas. Setelah siap, lanjutkan ke perhitungan.'
                      : detail.data.status === 'DRAFT'
                        ? 'Data siap diperiksa dan dihitung pada tahap Perhitungan.'
                        : detail.data.status === 'CALCULATED'
                          ? 'Hasil perhitungan siap diperiksa sebelum diajukan.'
                          : 'Buka tahap Persetujuan & penutupan untuk melihat status proses ini.'}
                  </p>
                  {detail.data.readiness.status === 'BLOCKED' ? (
                    <Button className='mt-3 w-full' disabled>
                      Perbaiki kesiapan terlebih dahulu
                    </Button>
                  ) : (
                    <Button asChild className='mt-3 w-full'>
                      <a
                        href={payrollProcessHref(
                          nextPayrollProcessStage(detail.data.status),
                          detail.data.uid
                        )}
                      >
                        {nextPayrollProcessStage(detail.data.status) ===
                        'APPROVAL'
                          ? 'Buka persetujuan & penutupan'
                          : 'Lanjut ke perhitungan'}{' '}
                        <ExternalLink />
                      </a>
                    </Button>
                  )}
                </div>
              )}
              {canCalculate && detail.data.status === 'DRAFT' && (
                <Button
                  variant='destructive'
                  className='w-full'
                  onClick={() => setCancelOpen(true)}
                >
                  <Ban /> Batalkan periode
                </Button>
              )}
              {canReset && (
                <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-3'>
                  <p className='text-sm font-medium text-destructive'>
                    Reset untuk proses ulang
                  </p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    Menghapus periode beserta seluruh hasil Payroll turunannya.
                    Attendance, Produksi, dan master karyawan tetap
                    dipertahankan.
                  </p>
                  <Button
                    variant='destructive'
                    className='mt-3 w-full'
                    onClick={() => setResetOpen(true)}
                  >
                    <Trash2 /> Reset & hapus periode
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
      <CancelPeriodDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        uid={uid}
        onCancelled={() => onOpenChange(false)}
      />
      <ResetPeriodDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        uid={uid}
        onReset={onReset}
      />
      <EmployeeReadinessSheet
        employee={employee}
        open={Boolean(employee)}
        onOpenChange={(next) => !next && setEmployee(undefined)}
      />
    </>
  )
}

function SchemeMetrics({
  period,
}: {
  period: import('./domain').PayrollPeriodDetail
}) {
  const timeBased = period.payrollBasis === 'TIME_BASED'
  const facts = period.readiness.facts
  return (
    <div className='grid grid-cols-2 gap-2'>
      <Metric
        label='Populasi'
        value={period.readiness.populationCount}
        icon={Users}
      />
      <Metric
        label={timeBased ? 'Hari PRESENT dibayar' : 'Dari Produksi'}
        value={
          timeBased
            ? (facts.payablePresentDays ?? 0)
            : period.readiness.productionEmployeeCount
        }
        icon={timeBased ? CheckCircle2 : CircleDollarSign}
      />
      {timeBased && (facts.offdayPresentDays ?? 0) > 0 ? (
        <div className='col-span-2 rounded-lg border border-amber-300 bg-amber-50/70 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
          <strong>{facts.offdayPresentDays}</strong> kehadiran tercatat pada
          hari nonkerja. Kehadiran aktual tetap dibayar, tetapi perlu ditinjau.
        </div>
      ) : null}
    </div>
  )
}

function EmployeeReadinessSheet({
  employee,
  open,
  onOpenChange,
}: {
  employee?: PayrollPeriodReadinessEmployee
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const blockers = (employee?.issues ?? [])
    .filter((issue) => issue.severity === 'BLOCKER')
    .map((issue) => ({ ...issue, group: employeeIssueGroup(issue.code) }))
  const warnings = (employee?.issues ?? [])
    .filter((issue) => issue.severity === 'WARNING')
    .map((issue) => ({ ...issue, group: employeeIssueGroup(issue.code) }))

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-md'>
        <SheetHeader>
          <SheetTitle>Detail Kesiapan Karyawan</SheetTitle>
          <SheetDescription>
            Tanggal dan alasan di bawah berasal dari sumber Payroll terbaru.
          </SheetDescription>
        </SheetHeader>
        {employee ? (
          <div className='mt-5 space-y-4'>
            <div className='rounded-lg border p-4'>
              <p className='font-semibold'>{employee.fullName}</p>
              <p className='text-sm text-muted-foreground'>
                {employee.employeeNumber} ·{' '}
                {employeeTypeLabels[employee.employeeType]}
              </p>
              <p className='mt-3 text-sm'>
                Eligible {dateLabel(employee.eligibleFrom)}–
                {dateLabel(employee.eligibleTo)}
              </p>
            </div>
            <div className='grid grid-cols-2 gap-2'>
              <Metric
                label='PRESENT dibayar'
                value={employee.payablePresentDays}
                icon={CheckCircle2}
              />
              <Metric
                label='PRESENT nonkerja'
                value={employee.offdayPresentDays}
                icon={AlertTriangle}
              />
              <Metric label='Alpha' value={employee.alphaDays} icon={Ban} />
              <Metric
                label='Izin'
                value={employee.permissionDays}
                icon={FileClock}
              />
            </div>
            <section className='grid grid-cols-3 gap-2 rounded-lg border p-3 text-sm'>
              <Fact
                label='Estimasi bruto'
                value={Number(employee.estimatedGrossAmount)}
                money
              />
              <Fact
                label='Potongan'
                value={Number(employee.estimatedDeductionAmount)}
                money
              />
              <Fact
                label='Estimasi neto'
                value={Number(employee.estimatedNetAmount)}
                money
              />
            </section>
            <section className='rounded-lg border p-4 text-sm'>
              <h3 className='font-semibold'>Coverage sumber</h3>
              <dl className='mt-2 space-y-2'>
                <div className='flex justify-between gap-3'>
                  <dt className='text-muted-foreground'>Tarif / gaji</dt>
                  <dd className='font-medium'>{employee.baseCoverage}</dd>
                </div>
                <div className='flex justify-between gap-3'>
                  <dt className='text-muted-foreground'>Kontrak</dt>
                  <dd className='font-medium'>{employee.contractCoverage}</dd>
                </div>
              </dl>
            </section>
            {blockers.length ? (
              <IssueGroup
                title='Harus diperbaiki'
                items={blockers}
                tone='danger'
                empty=''
              />
            ) : null}
            {warnings.length ? (
              <IssueGroup
                title='Perlu ditinjau'
                items={warnings}
                tone='warning'
                empty=''
              />
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function employeeIssueGroup(code: string) {
  if (code.includes('ATTENDANCE') || code.includes('OFFDAY'))
    return 'ATTENDANCE'
  if (code.includes('CONTRACT')) return 'EMPLOYMENT'
  return 'RATE'
}

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof Users
}) {
  return (
    <div className='rounded-lg border px-3 py-2.5'>
      <div className='flex justify-between text-xs text-muted-foreground'>
        <span>{label}</span>
        <Icon className='size-4' />
      </div>
      <p className='text-xl font-bold'>{value.toLocaleString('id-ID')}</p>
    </div>
  )
}
function Fact({
  label,
  value,
  money = false,
}: {
  label: string
  value: number
  money?: boolean
}) {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='font-semibold'>
        {money ? rupiah(value) : value.toLocaleString('id-ID')}
      </dd>
    </div>
  )
}
function IssueGroup({
  title,
  items,
  tone,
  empty,
}: {
  title: string
  items: Array<{
    code: string
    message: string
    count: number
    group: string
    actionUrl: string | null
  }>
  tone: 'danger' | 'warning'
  empty: string
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-3',
        tone === 'danger'
          ? 'border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20'
          : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20'
      )}
    >
      <p className='text-sm font-semibold'>{title}</p>
      {items.length ? (
        <ul className='mt-2 space-y-2'>
          {items.map((item) => (
            <li key={item.code} className='rounded-md bg-background/70 p-2'>
              <div className='flex gap-2 text-sm'>
                <span className='font-semibold'>{item.count}</span>
                <span>{item.message}</span>
              </div>
              <div className='mt-1 flex items-center justify-between gap-2'>
                <span className='text-[11px] font-medium text-muted-foreground'>
                  {issueGroupLabel(item.group)}
                </span>
                {item.actionUrl && (
                  <Button variant='link' size='sm' className='h-6 px-0' asChild>
                    <a href={item.actionUrl}>
                      Tindak lanjuti <ExternalLink className='size-3' />
                    </a>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className='mt-1 text-sm text-muted-foreground'>{empty}</p>
      )}
    </div>
  )
}

function issueGroupLabel(group: string) {
  return (
    {
      PERIOD: 'Periode',
      ATTENDANCE: 'Attendance',
      EMPLOYMENT: 'Karyawan',
      PRODUCTION: 'Produksi',
      COMPONENT: 'Komponen',
      PAYMENT: 'Pembayaran',
    }[group] ?? group
  )
}

function CancelPeriodDialog({
  open,
  onOpenChange,
  uid,
  onCancelled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  uid?: string
  onCancelled: () => void
}) {
  const mutation = useCancelPayrollPeriod()
  const [reason, setReason] = useState('')
  const close = (next: boolean) => {
    if (!mutation.isPending) {
      onOpenChange(next)
      if (!next) setReason('')
    }
  }
  const submit = async () => {
    if (!uid || reason.trim().length < 5) return
    try {
      await mutation.mutateAsync({ uid, reason: reason.trim() })
      toast.success('Periode Payroll dibatalkan.')
      close(false)
      onCancelled()
    } catch (error) {
      toast.error(apiMessage(error, 'Periode Payroll gagal dibatalkan.'))
    }
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Batalkan Periode Payroll?</DialogTitle>
          <DialogDescription>
            Periode tidak dihapus. Status dan alasan pembatalan tetap tersimpan
            untuk audit.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-2'>
          <Label htmlFor='cancel-payroll-reason'>Alasan pembatalan</Label>
          <Textarea
            id='cancel-payroll-reason'
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder='Jelaskan alasan pembatalan (minimal 5 karakter)'
            maxLength={500}
          />
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => close(false)}
            disabled={mutation.isPending}
          >
            Kembali
          </Button>
          <Button
            variant='destructive'
            onClick={() => void submit()}
            disabled={reason.trim().length < 5 || mutation.isPending}
          >
            {mutation.isPending && <LoaderCircle className='animate-spin' />}
            Ya, batalkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ResetPeriodDialog({
  open,
  onOpenChange,
  uid,
  onReset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  uid?: string
  onReset: () => void
}) {
  const preview = usePayrollPeriodResetPreview(uid, open)
  const mutation = useResetPayrollPeriod()
  const [confirmation, setConfirmation] = useState('')
  const [reason, setReason] = useState('')
  const expectedCode = preview.data?.periodCode ?? ''
  const valid =
    Boolean(uid) &&
    preview.data?.canReset === true &&
    confirmation.trim() === expectedCode &&
    reason.trim().length >= 5

  const close = (next: boolean) => {
    if (mutation.isPending) return
    onOpenChange(next)
    if (!next) {
      setConfirmation('')
      setReason('')
    }
  }
  const submit = async () => {
    if (!uid || !valid) return
    try {
      await mutation.mutateAsync({
        uid,
        confirmation: confirmation.trim(),
        reason: reason.trim(),
      })
      toast.success('Periode Payroll berhasil di-reset dan dapat dibuat ulang.')
      close(false)
      onReset()
    } catch (error) {
      toast.error(apiMessage(error, 'Periode Payroll gagal di-reset.'))
    }
  }
  const impact = preview.data
    ? [
        ['Perhitungan Payroll', preview.data.runs],
        ['Hasil karyawan', preview.data.employeeResults],
        ['Komponen manual', preview.data.manualComponents],
        ['Approval', preview.data.approvals],
        ['Riwayat workflow', preview.data.workflowActions],
        ['Riwayat output', preview.data.outputAudits],
        ['Settlement BPJS', preview.data.bpjsSettlements],
        ['Transaksi Produksi dilepas', preview.data.productionTransactions],
      ]
    : []

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Reset & hapus periode Payroll?</DialogTitle>
          <DialogDescription>
            Periode dan seluruh hasil prosesnya akan dihapus agar Payroll dapat
            dibuat ulang dari awal. Tindakan ini tetap dicatat di Audit Trail.
          </DialogDescription>
        </DialogHeader>

        {preview.isPending ? (
          <div className='space-y-2'>
            <Skeleton className='h-20 w-full' />
            <Skeleton className='h-28 w-full' />
          </div>
        ) : preview.isError || !preview.data ? (
          <Alert variant='destructive'>
            <AlertTriangle />
            <AlertTitle>Preview reset gagal dimuat</AlertTitle>
            <AlertDescription>
              Tidak ada data yang diubah. Tutup dialog lalu coba kembali.
            </AlertDescription>
          </Alert>
        ) : (
          <div className='space-y-4'>
            <Alert variant='destructive'>
              <Trash2 />
              <AlertTitle>{preview.data.periodCode}</AlertTitle>
              <AlertDescription>
                {preview.data.site.name} · {preview.data.periodName} · status{' '}
                {statusLabels[preview.data.status]}
              </AlertDescription>
            </Alert>

            {preview.data.blockerMessage ? (
              <Alert variant='destructive'>
                <AlertTriangle />
                <AlertTitle>Reset belum dapat dijalankan</AlertTitle>
                <AlertDescription>
                  {preview.data.blockerMessage}
                </AlertDescription>
              </Alert>
            ) : null}

            <section>
              <p className='mb-2 text-sm font-medium'>Dampak reset</p>
              <dl className='grid grid-cols-2 gap-2'>
                {impact.map(([label, value]) => (
                  <div key={String(label)} className='rounded-md border p-2.5'>
                    <dt className='text-xs text-muted-foreground'>{label}</dt>
                    <dd className='mt-0.5 font-semibold'>
                      {Number(value).toLocaleString('id-ID')}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className='space-y-2'>
              <Label htmlFor='reset-payroll-confirmation'>
                Ketik nomor periode untuk konfirmasi
              </Label>
              <Input
                id='reset-payroll-confirmation'
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={preview.data.periodCode}
                autoComplete='off'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='reset-payroll-reason'>Alasan reset</Label>
              <Textarea
                id='reset-payroll-reason'
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder='Contoh: Mengulang demo Payroll setelah perubahan konfigurasi.'
                maxLength={500}
              />
              <p className='text-xs text-muted-foreground'>
                Minimal 5 karakter dan akan disimpan di Audit Trail.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => close(false)}
            disabled={mutation.isPending}
          >
            Batal
          </Button>
          <Button
            variant='destructive'
            onClick={() => void submit()}
            disabled={!valid || preview.isPending || mutation.isPending}
          >
            {mutation.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              <Trash2 />
            )}
            Reset & hapus periode
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
