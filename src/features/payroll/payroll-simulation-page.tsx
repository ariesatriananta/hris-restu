import { useState } from 'react'
import { isAxiosError } from 'axios'
import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'
import {
  AlertTriangle,
  CalendarCheck2,
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  Users,
  WalletCards,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { type NavigateFn } from '@/hooks/use-table-url-state'
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
import { Textarea } from '@/components/ui/textarea'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import { formatIdAmountInput, normalizeIdAmount } from './amount-input'
import {
  useCalculatePayroll,
  useCancelPayrollManualComponent,
  useCreatePayrollManualComponent,
  usePayrollEmployeeResult,
  usePayrollManualComponents,
  usePayrollManualComponentRevisions,
  usePayrollPeriod,
  usePayrollPeriods,
  usePayrollRun,
  usePayrollRunEmployees,
  usePayrollRuns,
  usePayrollSimulationMeta,
  useRecoverStalePayrollRun,
  useUpdatePayrollManualComponent,
} from './data/queries'
import type {
  PayrollEmployeeType,
  PayrollEmployeeResultSummary,
  PayrollMonthlyDetail,
  PayrollMonthlyDailySnapshot,
  PayrollPayFrequency,
  PayrollReadinessStatus,
  PayrollRunSummary,
  PayrollTimeSnapshot,
  PayrollTrainingProductionSnapshot,
  PayrollWageBasis,
} from './domain'
import {
  isPositivePayrollAmount,
  isValidPayrollAuditReason,
} from './manual-component-validation'
import { formatDecimalString } from './money'

type SearchState = Record<string, unknown>

function amount(value: string | number) {
  return formatDecimalString(value, {
    currency: true,
    maximumFractionDigits: 2,
  })
}
function date(value: string) {
  return format(parseISO(value), 'd MMM yyyy', { locale: id })
}
function formatDateTime(value: string) {
  return format(parseISO(value), 'd MMM yyyy, HH.mm', { locale: id })
}
function errorMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}

export function PayrollSimulationPage({
  search,
  navigate,
}: {
  search: SearchState
  navigate: NavigateFn
}) {
  const session = useAuthStore((state) => state.session)
  const canCalculate = hasPermission(session, 'payroll.calculate')
  const periodUid = typeof search.periodUid === 'string' ? search.periodUid : ''
  const selectedRunUid = typeof search.runUid === 'string' ? search.runUid : ''
  const employeeUid =
    typeof search.employeeUid === 'string' ? search.employeeUid : undefined
  const issue = typeof search.issue === 'string' ? search.issue : undefined
  const filter = typeof search.filter === 'string' ? search.filter : ''
  const page = typeof search.page === 'number' ? search.page : 1
  const pageSize = typeof search.pageSize === 'number' ? search.pageSize : 50
  const periods = usePayrollPeriods({
    status: ['DRAFT', 'CALCULATED'],
    pageSize: 500,
  })
  const period = usePayrollPeriod(periodUid || undefined)
  const runs = usePayrollRuns(periodUid || undefined)
  const runUid =
    selectedRunUid || runs.data?.find((item) => item.isCurrent)?.uid || ''
  const run = usePayrollRun(runUid || undefined)
  const employees = usePayrollRunEmployees(
    runUid || undefined,
    {
      page,
      pageSize,
      query: filter || undefined,
      issue,
    },
    run.data?.status === 'COMPLETED'
  )
  const calculate = useCalculatePayroll()
  const recover = useRecoverStalePayrollRun()
  const [componentOpen, setComponentOpen] = useState(false)
  const payrollBasis = period.data?.payrollBasis ?? 'PIECE_RATE'
  const employeeType = period.data?.employeeType
  const payFrequency = period.data?.payFrequency
  const timeBased = payrollBasis === 'TIME_BASED'
  const monthly = timeBased && payFrequency === 'MONTHLY'

  const patch = (value: SearchState) =>
    navigate({ search: (previous) => ({ ...previous, ...value }) })
  const startCalculate = async () => {
    if (!periodUid || period.data?.readiness.status === 'BLOCKED') return
    try {
      const result = await calculate.mutateAsync({
        periodUid,
        idempotencyKey: crypto.randomUUID(),
      })
      patch({ runUid: result.uid, employeeUid: undefined })
      toast.success('Perhitungan Payroll dimulai.')
    } catch (error) {
      toast.error(errorMessage(error, 'Perhitungan Payroll gagal dimulai.'))
    }
  }

  return (
    <Main>
      <div className='space-y-4'>
        <header className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
          <div>
            <div className='flex items-center gap-2'>
              <p className='text-sm font-medium text-primary'>
                {timeBased ? 'Payroll Berbasis Waktu' : 'Payroll Borongan'}
              </p>
              <Badge
                variant='outline'
                className='border-primary/30 bg-primary/5'
              >
                SIMULASI
              </Badge>
            </div>
            <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
              Simulasi Payroll
            </h1>
            <p className='text-sm text-muted-foreground'>
              {timeBased
                ? monthly
                  ? 'Simulasikan gaji bulanan, prorata kalender, serta potongan Alpha dan Izin.'
                  : 'Simulasikan upah dari kehadiran dan tarif harian tanpa menerbitkan slip resmi.'
                : 'Hitung snapshot hasil Produksi dan komponen tanpa menerbitkan slip resmi.'}
            </p>
          </div>
          <div className='flex flex-col gap-2 sm:flex-row'>
            <Select
              value={periodUid}
              onValueChange={(value) =>
                patch({
                  periodUid: value,
                  runUid: undefined,
                  employeeUid: undefined,
                  page: undefined,
                })
              }
            >
              <SelectTrigger className='w-full sm:w-80'>
                <SelectValue placeholder='Pilih periode Draft/Calculated' />
              </SelectTrigger>
              <SelectContent>
                {(periods.data?.data ?? []).map((item) => (
                  <SelectItem key={item.uid} value={item.uid}>
                    {item.site.name} · {item.periodName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canCalculate && periodUid && (
              <Button variant='outline' onClick={() => setComponentOpen(true)}>
                <Plus /> Komponen manual
              </Button>
            )}
            {canCalculate && periodUid && (
              <Button
                onClick={() => void startCalculate()}
                disabled={
                  calculate.isPending ||
                  period.data?.readiness.status === 'BLOCKED' ||
                  run.data?.status === 'PROCESSING'
                }
              >
                {calculate.isPending || run.data?.status === 'PROCESSING' ? (
                  <LoaderCircle className='animate-spin' />
                ) : (
                  <Calculator />
                )}
                {run.data?.status === 'COMPLETED' ? 'Hitung ulang' : 'Hitung'}
              </Button>
            )}
          </div>
        </header>

        {!periodUid ? (
          <EmptySelection />
        ) : period.isPending ? (
          <Skeleton className='h-24 w-full' />
        ) : period.isError || !period.data ? (
          <ErrorPanel onRetry={() => void period.refetch()} />
        ) : (
          <>
            <ReadinessBanner
              status={period.data.readiness.status}
              blockers={period.data.readiness.blockers.length}
              warnings={period.data.readiness.warnings.length}
            />
            {monthly && (
              <Alert className='border-indigo-200 bg-indigo-50/60 dark:bg-indigo-950/20'>
                <ShieldAlert />
                <AlertTitle>Hasil masih berupa simulasi</AlertTitle>
                <AlertDescription>
                  Periksa prorata dan potongan per karyawan sebelum diajukan.
                  Slip resmi baru tersedia setelah periode ditutup dengan run
                  FINAL.
                </AlertDescription>
              </Alert>
            )}
            {runs.data?.length ? (
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-xs font-medium text-muted-foreground'>
                  Versi simulasi
                </span>
                {runs.data.map((item) => (
                  <Button
                    key={item.uid}
                    size='sm'
                    variant={runUid === item.uid ? 'secondary' : 'outline'}
                    onClick={() => patch({ runUid: item.uid, page: undefined })}
                  >
                    Run #{item.runNumber}
                    {item.isCurrent && (
                      <span className='text-positive'>• Aktif</span>
                    )}
                  </Button>
                ))}
              </div>
            ) : null}
            {!runUid ? (
              <div className='rounded-lg border border-dashed p-10 text-center'>
                <Calculator className='mx-auto size-8 text-muted-foreground' />
                <p className='mt-2 font-semibold'>Belum ada hasil simulasi</p>
                <p className='text-sm text-muted-foreground'>
                  Periksa readiness lalu pilih Hitung untuk membuat snapshot.
                </p>
              </div>
            ) : run.isError ? (
              <ErrorPanel onRetry={() => void run.refetch()} />
            ) : run.data?.status === 'PROCESSING' ? (
              <ProcessingPanel
                startedAt={run.data.startedAt}
                canRecover={canCalculate}
                recovering={recover.isPending}
                onRecover={async () => {
                  try {
                    await recover.mutateAsync(run.data!.uid)
                    toast.success(
                      'Run macet ditandai gagal. Perhitungan dapat diulang.'
                    )
                  } catch (error) {
                    toast.error(
                      errorMessage(error, 'Run belum dapat dipulihkan.')
                    )
                  }
                }}
              />
            ) : run.data?.status === 'FAILED' ? (
              <Alert variant='destructive'>
                <ShieldAlert />
                <AlertTitle>Simulasi gagal</AlertTitle>
                <AlertDescription>
                  {run.data.errorMessage ||
                    'Tidak ada snapshot yang digunakan.'}
                </AlertDescription>
              </Alert>
            ) : run.data?.status === 'CANCELLED' ? (
              <Alert>
                <AlertTriangle />
                <AlertTitle>Simulasi dibatalkan</AlertTitle>
                <AlertDescription>
                  Run ini tidak memiliki hasil aktif. Jalankan Hitung untuk
                  membuat simulasi baru.
                </AlertDescription>
              </Alert>
            ) : run.data?.status === 'COMPLETED' ? (
              <>
                <SimulationKpis
                  run={run.data}
                  payrollBasis={payrollBasis}
                  payFrequency={payFrequency}
                />
                <EmployeeResults
                  data={employees.data?.data ?? []}
                  total={employees.data?.meta.total ?? 0}
                  pending={employees.isPending}
                  filter={filter}
                  issue={issue}
                  page={page}
                  pageSize={pageSize}
                  payrollBasis={payrollBasis}
                  payFrequency={payFrequency}
                  onPatch={patch}
                />
              </>
            ) : null}
          </>
        )}
      </div>
      <EmployeeResultSheet
        runUid={runUid || undefined}
        employeeUid={employeeUid}
        open={Boolean(employeeUid) && run.data?.status === 'COMPLETED'}
        enabled={run.data?.status === 'COMPLETED'}
        payrollBasis={payrollBasis}
        payFrequency={payFrequency}
        employeeType={employeeType}
        onOpenChange={(open) => !open && patch({ employeeUid: undefined })}
      />
      <ManualComponentDialog
        periodUid={periodUid}
        open={componentOpen}
        onOpenChange={setComponentOpen}
      />
    </Main>
  )
}

function ReadinessBanner({
  status,
  blockers,
  warnings,
}: {
  status: PayrollReadinessStatus
  blockers: number
  warnings: number
}) {
  const blocked = status === 'BLOCKED'
  const Icon = status === 'READY' ? CheckCircle2 : AlertTriangle
  return (
    <Alert
      variant={blocked ? 'destructive' : 'default'}
      className={
        status === 'ATTENTION'
          ? 'border-amber-300 bg-amber-50/60 dark:bg-amber-950/20'
          : status === 'READY'
            ? 'border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/20'
            : undefined
      }
    >
      <Icon />
      <AlertTitle>
        {status === 'READY'
          ? 'Data siap dihitung'
          : status === 'ATTENTION'
            ? 'Data dapat dihitung dengan perhatian'
            : 'Perhitungan masih diblokir'}
      </AlertTitle>
      <AlertDescription>
        {blockers} blocker · {warnings} peringatan. Detail dapat diperiksa pada
        menu Periode Payroll.
      </AlertDescription>
    </Alert>
  )
}

function SimulationKpis({
  run,
  payrollBasis,
  payFrequency,
}: {
  run: PayrollRunSummary
  payrollBasis: PayrollWageBasis
  payFrequency?: PayrollPayFrequency
}) {
  const timeBased = payrollBasis === 'TIME_BASED'
  const monthly = timeBased && payFrequency === 'MONTHLY'
  const cards = monthly
    ? [
        {
          label: 'Karyawan',
          value: run.employeeCount,
          Icon: Users,
          tone: 'border-sky-200 bg-sky-50/70',
        },
        {
          label: 'Gaji prorata',
          value: amount(
            run.totalProratedBasicSalary ?? run.totalBasicSalaryAmount ?? '0'
          ),
          Icon: CalendarCheck2,
          tone: 'border-indigo-200 bg-indigo-50/70',
        },
        {
          label: 'Potongan Alpha',
          value: amount(run.totalAlphaDeduction ?? '0'),
          Icon: ShieldAlert,
          tone: 'border-red-200 bg-red-50/70',
        },
        {
          label: 'Potongan Izin',
          value: amount(run.totalPermissionDeduction ?? '0'),
          Icon: WalletCards,
          tone: 'border-orange-200 bg-orange-50/70',
        },
        {
          label: 'Bruto',
          value: amount(run.totalGrossEarnings ?? '0'),
          Icon: CircleDollarSign,
          tone: 'border-emerald-200 bg-emerald-50/70',
        },
        {
          label: 'Neto simulasi',
          value: amount(run.totalNetPay),
          Icon: Calculator,
          tone: 'border-amber-200 bg-amber-50/70',
        },
      ]
    : [
        {
          label: 'Karyawan',
          value: run.employeeCount,
          Icon: Users,
          tone: 'border-sky-200 bg-sky-50/70',
        },
        {
          label: timeBased ? 'Upah dasar' : 'Bruto Produksi',
          value: amount(
            timeBased
              ? (run.totalBasicSalaryAmount ?? '0')
              : run.totalPieceRateAmount
          ),
          Icon: CircleDollarSign,
          tone: 'border-indigo-200 bg-indigo-50/70',
        },
        ...(timeBased
          ? [
              {
                label: 'Hari dibayar',
                value: run.totalPayablePresentDays ?? 0,
                hint:
                  (run.totalOffdayPresentDays ?? 0) > 0
                    ? `${(run.totalOffdayPresentDays ?? 0).toLocaleString('id-ID')} hari nonkerja`
                    : undefined,
                Icon: CalendarCheck2,
                tone: 'border-cyan-200 bg-cyan-50/70',
              },
            ]
          : []),
        {
          label: 'Tambahan',
          value: amount(run.totalEarnings),
          Icon: Plus,
          tone: 'border-emerald-200 bg-emerald-50/70',
        },
        {
          label: 'Potongan',
          value: amount(run.totalDeductions),
          Icon: WalletCards,
          tone: 'border-red-200 bg-red-50/70',
        },
        {
          label: 'Neto simulasi',
          value: amount(run.totalNetPay),
          Icon: Calculator,
          tone: 'border-amber-200 bg-amber-50/70',
        },
      ]
  return (
    <section
      aria-label='Ringkasan simulasi'
      className={cn(
        'grid gap-2 sm:grid-cols-2',
        timeBased ? 'xl:grid-cols-6' : 'xl:grid-cols-5'
      )}
    >
      {cards.map(({ label, value, hint, Icon, tone }) => (
        <div
          key={label}
          className={cn(
            'min-h-[68px] rounded-lg border px-3 py-2.5 dark:bg-card',
            tone
          )}
        >
          <div className='flex justify-between text-xs text-muted-foreground'>
            <span>{label}</span>
            <Icon className='size-4' />
          </div>
          <div className='mt-1 flex min-w-0 items-baseline gap-1.5'>
            <p className='truncate text-lg font-bold' title={String(value)}>
              {typeof value === 'number'
                ? value.toLocaleString('id-ID')
                : value}
            </p>
            {hint && (
              <span className='shrink-0 text-[10px] font-medium text-amber-700 dark:text-amber-400'>
                {hint}
              </span>
            )}
          </div>
        </div>
      ))}
    </section>
  )
}

function EmployeeResults({
  data,
  total,
  pending,
  filter,
  issue,
  page,
  pageSize,
  payrollBasis,
  payFrequency,
  onPatch,
}: {
  data: PayrollEmployeeResultSummary[]
  total: number
  pending: boolean
  filter: string
  issue?: string
  page: number
  pageSize: number
  payrollBasis: PayrollWageBasis
  payFrequency?: PayrollPayFrequency
  onPatch: (value: SearchState) => void
}) {
  const monthly = payrollBasis === 'TIME_BASED' && payFrequency === 'MONTHLY'
  return (
    <section className='space-y-3'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <div className='relative flex-1 sm:max-w-sm'>
          <Search className='absolute top-2.5 left-3 size-4 text-muted-foreground' />
          <Input
            className='pl-9'
            value={filter}
            onChange={(event) =>
              onPatch({
                filter: event.target.value || undefined,
                page: undefined,
              })
            }
            placeholder='Cari nama atau nomor karyawan...'
          />
        </div>
        <Select
          value={issue ?? 'ALL'}
          onValueChange={(value) =>
            onPatch({
              issue: value === 'ALL' ? undefined : value,
              page: undefined,
            })
          }
        >
          <SelectTrigger className='w-full sm:w-48'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>Semua kondisi</SelectItem>
            <SelectItem value='MISSING_BANK'>Rekening belum lengkap</SelectItem>
            <SelectItem value='NEGATIVE_NET'>Neto negatif</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className='overflow-hidden rounded-lg border'>
        <div className='hidden grid-cols-[minmax(170px,1.4fr)_minmax(130px,1.05fr)_repeat(3,minmax(88px,.8fr))_40px] gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-semibold md:grid'>
          <span>Karyawan</span>
          <span>
            {monthly
              ? 'Gaji & Prorata'
              : payrollBasis === 'TIME_BASED'
                ? 'Hari & Upah Dasar'
                : 'Produksi'}
          </span>
          <span>Tambahan</span>
          <span>Potongan</span>
          <span>Neto</span>
          <span className='sr-only'>Aksi</span>
        </div>
        {pending ? (
          Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className='m-3 h-14' />
          ))
        ) : data.length ? (
          data.map((item) => (
            <EmployeeResultRow
              key={item.uid}
              item={item}
              payrollBasis={payrollBasis}
              payFrequency={payFrequency}
              onOpen={() => onPatch({ employeeUid: item.uid })}
            />
          ))
        ) : (
          <div className='p-10 text-center text-sm text-muted-foreground'>
            Tidak ada hasil karyawan sesuai filter.
          </div>
        )}
      </div>
      <div className='flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between'>
        <span>{total.toLocaleString('id-ID')} karyawan</span>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            disabled={page <= 1}
            onClick={() => onPatch({ page: page - 1 })}
          >
            Sebelumnya
          </Button>
          <span>Halaman {page}</span>
          <Button
            variant='outline'
            size='sm'
            disabled={page * pageSize >= total}
            onClick={() => onPatch({ page: page + 1 })}
          >
            Berikutnya
          </Button>
        </div>
      </div>
    </section>
  )
}

function EmployeeResultRow({
  item,
  payrollBasis,
  payFrequency,
  onOpen,
}: {
  item: PayrollEmployeeResultSummary
  payrollBasis: PayrollWageBasis
  payFrequency?: PayrollPayFrequency
  onOpen: () => void
}) {
  const monthly = payrollBasis === 'TIME_BASED' && payFrequency === 'MONTHLY'
  return (
    <div className='grid gap-2 border-b p-3 last:border-b-0 md:grid-cols-[minmax(170px,1.4fr)_minmax(130px,1.05fr)_repeat(3,minmax(88px,.8fr))_40px] md:items-center'>
      <div>
        <p className='font-semibold'>{item.fullName}</p>
        <p className='text-xs text-muted-foreground'>
          {item.employeeNumber} · {item.employeeType}
        </p>
        <div className='mt-1 flex flex-wrap gap-1'>
          {item.issues.map((issue) => (
            <Badge key={issue} variant='destructive' className='text-[10px]'>
              {issue === 'MISSING_BANK'
                ? 'Rekening belum lengkap'
                : 'Neto negatif'}
            </Badge>
          ))}
        </div>
      </div>
      {monthly && item.monthly ? (
        <div className='flex justify-between gap-3 md:block'>
          <span className='text-xs text-muted-foreground md:hidden'>
            Gaji & Prorata
          </span>
          <div>
            <p className='font-medium'>{amount(item.basicSalaryAmount)}</p>
            <p className='text-xs text-muted-foreground'>
              {item.monthly.eligibleCalendarDays}/
              {item.monthly.periodCalendarDays} hari kalender
            </p>
            <p className='text-[11px] text-muted-foreground'>
              Alpha {item.monthly.alphaDays} / Izin{' '}
              {item.monthly.permissionDays}
            </p>
          </div>
        </div>
      ) : payrollBasis === 'TIME_BASED' ? (
        <div className='flex justify-between gap-3 md:block'>
          <span className='text-xs text-muted-foreground md:hidden'>
            Hari & Upah Dasar
          </span>
          <div>
            <p className='font-medium'>{amount(item.basicSalaryAmount)}</p>
            <p className='text-xs text-muted-foreground'>
              {item.payablePresentDays.toLocaleString('id-ID')} hari dibayar
              {item.offdayPresentDays > 0
                ? ` · ${item.offdayPresentDays} hari nonkerja`
                : ''}
            </p>
          </div>
        </div>
      ) : (
        <ResultAmount mobile='Produksi' value={item.pieceRateAmount} />
      )}
      <ResultAmount mobile='Tambahan' value={item.additionalEarnings} />
      <ResultAmount mobile='Potongan' value={item.totalDeductions} />
      <ResultAmount mobile='Neto' value={item.netPay} strong />
      <Button
        variant='ghost'
        size='icon'
        aria-label={`Lihat detail ${item.fullName}`}
        onClick={onOpen}
      >
        <Eye />
      </Button>
    </div>
  )
}
function ResultAmount({
  mobile,
  value,
  strong,
}: {
  mobile: string
  value: string
  strong?: boolean
}) {
  return (
    <div className='flex justify-between gap-3 md:block'>
      <span className='text-xs text-muted-foreground md:hidden'>{mobile}</span>
      <span className={strong ? 'font-bold' : 'font-medium'}>
        {amount(value)}
      </span>
    </div>
  )
}

function EmployeeResultSheet({
  runUid,
  employeeUid,
  open,
  enabled,
  payrollBasis,
  payFrequency,
  employeeType,
  onOpenChange,
}: {
  runUid?: string
  employeeUid?: string
  open: boolean
  enabled: boolean
  payrollBasis: PayrollWageBasis
  payFrequency?: PayrollPayFrequency
  employeeType?: PayrollEmployeeType
  onOpenChange: (open: boolean) => void
}) {
  const detail = usePayrollEmployeeResult(runUid, employeeUid, enabled)
  const timeBased = payrollBasis === 'TIME_BASED'
  const monthly = timeBased && payFrequency === 'MONTHLY'
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto p-0 sm:max-w-2xl'>
        <SheetHeader className='border-b p-5 pe-12'>
          <div className='flex items-center gap-2'>
            <SheetTitle>Detail Simulasi Karyawan</SheetTitle>
            <Badge variant='outline'>SIMULASI</Badge>
          </div>
          <SheetDescription>
            Snapshot perhitungan pada run terpilih, bukan slip gaji resmi.
          </SheetDescription>
        </SheetHeader>
        {detail.isPending ? (
          <div className='space-y-3 p-5'>
            <Skeleton className='h-28' />
            <Skeleton className='h-48' />
          </div>
        ) : detail.isError || !detail.data ? (
          <div className='p-5'>
            <ErrorPanel onRetry={() => void detail.refetch()} />
          </div>
        ) : (
          <div className='space-y-4 p-5'>
            <section className='rounded-lg border p-4'>
              <div className='flex items-start justify-between gap-2'>
                <div>
                  <p className='font-semibold'>
                    {detail.data.employee.fullName}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {detail.data.employee.employeeNumber} ·{' '}
                    {detail.data.employee.employeeType}
                  </p>
                </div>
                <Badge variant='secondary'>CALCULATED</Badge>
              </div>
              <div className='mt-3 grid grid-cols-2 gap-2 text-sm'>
                <ResultFact
                  label={
                    monthly
                      ? 'Gaji pokok prorata'
                      : timeBased
                        ? 'Upah dasar waktu'
                        : 'Bruto Produksi'
                  }
                  value={amount(
                    timeBased
                      ? detail.data.totals.basicSalaryAmount
                      : detail.data.totals.pieceRateAmount
                  )}
                />
                <ResultFact
                  label='Tambahan'
                  value={amount(detail.data.totals.additionalEarnings)}
                />
                <ResultFact
                  label='Potongan'
                  value={amount(detail.data.totals.totalDeductions)}
                />
                <ResultFact
                  label='Neto'
                  value={amount(detail.data.totals.netPay)}
                  strong
                />
              </div>
            </section>
            {monthly && detail.data.monthlyDetail && (
              <MonthlyFormulaEvidence snapshot={detail.data.monthlyDetail} />
            )}
            {monthly && !detail.data.monthlyDetail && (
              <Alert variant='destructive'>
                <AlertTriangle />
                <AlertTitle>Snapshot Bulanan tidak tersedia</AlertTitle>
                <AlertDescription>
                  Run ini tidak memiliki dasar prorata dan potongan yang dapat
                  diaudit. Jalankan ulang simulasi setelah memeriksa readiness.
                </AlertDescription>
              </Alert>
            )}
            <section className='rounded-lg border p-4'>
              <h3 className='font-semibold'>Status rekening</h3>
              <p className='mt-1 text-sm'>
                {detail.data.bank.complete
                  ? detail.data.bank.accountNumber
                    ? `${detail.data.bank.bankName ?? 'Bank'} · ${detail.data.bank.accountNumber}`
                    : `${detail.data.bank.bankName ?? 'Bank'} · •••• ${detail.data.bank.accountLast4 ?? '----'}`
                  : 'Belum lengkap'}
              </p>
              {detail.data.bank.accountName && (
                <p className='text-sm'>{detail.data.bank.accountName}</p>
              )}
              <p className='text-xs text-muted-foreground'>
                {detail.data.bank.accountNumber
                  ? 'Snapshot rekening yang digunakan pada simulasi ini.'
                  : 'Nomor rekening disamarkan untuk melindungi data karyawan.'}
              </p>
            </section>
            <section className='rounded-lg border p-4'>
              <h3 className='font-semibold'>Ringkasan Attendance</h3>
              {detail.data.attendance ? (
                <div className='mt-2 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4'>
                  <ResultFact
                    label='Terjadwal'
                    value={detail.data.attendance.scheduledDays}
                  />
                  <ResultFact
                    label='Hadir'
                    value={detail.data.attendance.presentDays}
                  />
                  <ResultFact
                    label='Alpha'
                    value={detail.data.attendance.absentDays}
                  />
                  <ResultFact
                    label='Sakit/Izin/Cuti'
                    value={
                      detail.data.attendance.sickDays +
                      detail.data.attendance.permissionDays +
                      detail.data.attendance.leaveDays
                    }
                  />
                </div>
              ) : (
                <p className='mt-2 text-sm text-muted-foreground'>
                  Snapshot Attendance tidak tersedia.
                </p>
              )}
              <p className='mt-2 text-xs text-muted-foreground'>
                {timeBased
                  ? monthly
                    ? 'Gaji pokok diprorata dari hari kalender eligible. Hanya Alpha dan Izin pada hari kerja terjadwal yang menjadi potongan otomatis.'
                    : 'Hanya status PRESENT yang dibayar. Kehadiran pada hari nonkerja tetap dibayar dan ditandai sebagai perhatian.'
                  : 'Attendance merupakan informasi dan tidak otomatis memotong upah borongan.'}
              </p>
            </section>
            {timeBased &&
              (monthly ? (
                <MonthlyAttendanceLedger
                  details={detail.data.monthlyDailyDetails ?? []}
                />
              ) : (
                <TimeLedger details={detail.data.timeDetails} />
              ))}
            {!timeBased && (
              <section className='space-y-2'>
                <h3 className='font-semibold'>
                  Transaksi Produksi ({detail.data.production.length})
                </h3>
                {detail.data.production.length ? (
                  detail.data.production.map((item) => (
                    <div
                      key={`${item.transactionNumber}-${item.businessDate}`}
                      className='rounded-lg border p-3 text-sm'
                    >
                      <div className='flex justify-between gap-3'>
                        <div>
                          <p className='font-medium'>{item.jobName}</p>
                          <p className='text-xs text-muted-foreground'>
                            {date(item.businessDate)} · {item.transactionNumber}
                          </p>
                        </div>
                        <p className='font-semibold'>{amount(item.amount)}</p>
                      </div>
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {item.quantity} {item.unitName} × {amount(item.rate)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    Tidak ada transaksi Produksi.
                  </p>
                )}
              </section>
            )}
            {timeBased && employeeType === 'TRAINING' && (
              <TrainingProductionSnapshots
                items={detail.data.trainingProduction}
              />
            )}
            <section className='space-y-2'>
              <h3 className='font-semibold'>
                Komponen Payroll ({detail.data.components.length})
              </h3>
              {detail.data.components.length ? (
                detail.data.components.map((item) => (
                  <div
                    key={`${item.code}-${item.sourceType}-${item.amount}`}
                    className='rounded-lg border p-3 text-sm'
                  >
                    <div className='flex justify-between gap-3'>
                      <div>
                        <p className='font-medium'>{item.name}</p>
                        <p className='text-xs text-muted-foreground'>
                          {item.sourceType} ·{' '}
                          {item.category === 'EARNING'
                            ? 'Tambahan'
                            : 'Potongan'}
                        </p>
                      </div>
                      <p className='font-semibold'>{amount(item.amount)}</p>
                    </div>
                    {item.notes && (
                      <p className='mt-1 text-xs text-muted-foreground'>
                        {item.notes}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className='text-sm text-muted-foreground'>
                  Tidak ada komponen tambahan atau potongan.
                </p>
              )}
            </section>
            <section className='rounded-lg border p-4'>
              <h3 className='font-semibold'>Jejak Perhitungan</h3>
              <dl className='mt-2 space-y-2 text-sm'>
                <ResultFact
                  label={
                    monthly
                      ? 'Gaji bulanan'
                      : timeBased
                        ? 'Upah dasar waktu'
                        : 'Produksi'
                  }
                  value={
                    monthly
                      ? (detail.data.formulaTrace.monthly ??
                        detail.data.formulaTrace.timeBased)
                      : timeBased
                        ? detail.data.formulaTrace.timeBased
                        : detail.data.formulaTrace.pieceRate
                  }
                />
                <ResultFact
                  label='Komponen berulang'
                  value={detail.data.formulaTrace.recurring}
                />
                <ResultFact
                  label='Komponen manual'
                  value={detail.data.formulaTrace.manual}
                />
                <ResultFact
                  label='Neto'
                  value={detail.data.formulaTrace.net}
                  strong
                />
              </dl>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function TimeLedger({ details }: { details: PayrollTimeSnapshot[] }) {
  return (
    <section className='space-y-2' aria-labelledby='time-ledger-title'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h3 id='time-ledger-title' className='font-semibold'>
            Rincian Upah Harian
          </h3>
          <p className='text-xs text-muted-foreground'>
            Jejak Attendance, tarif, dan nominal yang dihitung per tanggal.
          </p>
        </div>
        <Badge variant='outline'>{details.length} tanggal</Badge>
      </div>
      {details.length ? (
        <div className='overflow-hidden rounded-lg border'>
          <div className='hidden grid-cols-[1fr_1fr_1fr_1fr] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold sm:grid'>
            <span>Tanggal</span>
            <span>Attendance</span>
            <span>Tarif</span>
            <span className='text-end'>Dibayar</span>
          </div>
          {details.map((item) => (
            <div
              key={item.businessDate}
              className='grid gap-2 border-b p-3 text-sm last:border-b-0 sm:grid-cols-[1fr_1fr_1fr_1fr] sm:items-center sm:gap-3'
            >
              <div>
                <p className='font-medium'>{date(item.businessDate)}</p>
                <p className='text-xs text-muted-foreground'>
                  {item.calendarDayType === 'WORKDAY'
                    ? 'Hari kerja'
                    : 'Hari nonkerja'}
                </p>
              </div>
              <div className='flex items-center justify-between gap-2 sm:block'>
                <span className='text-xs text-muted-foreground sm:hidden'>
                  Attendance
                </span>
                <Badge variant={item.isPayable ? 'default' : 'secondary'}>
                  {item.attendanceStatus}
                </Badge>
              </div>
              <ResultAmount mobile='Tarif harian' value={item.dailyRate} />
              <div className='flex items-center justify-between gap-2 sm:block sm:text-end'>
                <span className='text-xs text-muted-foreground sm:hidden'>
                  Nominal
                </span>
                <p
                  className={
                    item.isPayable ? 'font-bold' : 'text-muted-foreground'
                  }
                >
                  {amount(item.amount)}
                </p>
                {item.warningCode === 'OFFDAY_PRESENT' && (
                  <p className='text-xs font-medium text-amber-700 dark:text-amber-400'>
                    Hadir hari nonkerja
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className='rounded-lg border border-dashed p-5 text-center'>
          <CalendarCheck2 className='mx-auto size-6 text-muted-foreground' />
          <p className='mt-2 text-sm text-muted-foreground'>
            Rincian upah harian belum tersedia pada snapshot ini.
          </p>
        </div>
      )}
    </section>
  )
}

function MonthlyFormulaEvidence({
  snapshot,
}: {
  snapshot: PayrollMonthlyDetail
}) {
  return (
    <section
      className='space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4 dark:bg-indigo-950/10'
      aria-labelledby='monthly-formula-title'
    >
      <div>
        <h3 id='monthly-formula-title' className='font-semibold'>
          Dasar Perhitungan Bulanan
        </h3>
        <p className='text-xs text-muted-foreground'>
          Snapshot formula pada run ini tetap sama walaupun master berubah.
        </p>
      </div>
      <div className='grid grid-cols-2 gap-3 text-sm sm:grid-cols-3'>
        <ResultFact
          label='Gaji pokok penuh'
          value={amount(snapshot.fullBasicSalary)}
        />
        <ResultFact
          label='Kalender eligible'
          value={`${snapshot.eligibleCalendarDays} dari ${snapshot.periodCalendarDays} hari`}
        />
        <ResultFact
          label='Gaji prorata'
          value={amount(snapshot.proratedBasicSalary)}
          strong
        />
        <ResultFact
          label='Pembagi hari kerja'
          value={`${snapshot.scheduledWorkDays} hari`}
        />
        <ResultFact
          label={`Alpha (${snapshot.alphaDays} hari)`}
          value={amount(snapshot.alphaDeduction)}
        />
        <ResultFact
          label={`Izin (${snapshot.permissionDays} hari)`}
          value={amount(snapshot.permissionDeduction)}
        />
      </div>
      <p className='text-xs text-muted-foreground'>
        Gaji berlaku sejak {date(snapshot.salaryEffectiveFrom)} /{' '}
        {snapshot.currency}.
      </p>
      <div className='rounded-md bg-background/80 px-3 py-2 text-xs text-muted-foreground'>
        Prorata = gaji pokok x hari kalender eligible / hari kalender periode.
        Potongan Alpha dan Izin dihitung terpisah dari gaji pokok penuh / hari
        kerja terjadwal.
      </div>
    </section>
  )
}

function MonthlyAttendanceLedger({
  details,
}: {
  details: PayrollMonthlyDailySnapshot[]
}) {
  return (
    <section className='space-y-2' aria-labelledby='monthly-ledger-title'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h3 id='monthly-ledger-title' className='font-semibold'>
            Ledger Attendance Bulanan
          </h3>
          <p className='text-xs text-muted-foreground'>
            Status harian dan dampaknya pada potongan Alpha atau Izin.
          </p>
        </div>
        <Badge variant='outline'>{details.length} tanggal</Badge>
      </div>
      {details.length ? (
        <div className='overflow-hidden rounded-lg border'>
          <div className='hidden grid-cols-[1.05fr_1fr_.8fr_1fr] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold sm:grid'>
            <span>Tanggal</span>
            <span>Attendance</span>
            <span>Jadwal</span>
            <span className='text-end'>Dampak</span>
          </div>
          {details.map((item) => (
            <div
              key={item.businessDate}
              className='grid gap-2 border-b p-3 text-sm last:border-b-0 sm:grid-cols-[1.05fr_1fr_.8fr_1fr] sm:items-center sm:gap-3'
            >
              <div>
                <p className='font-medium'>{date(item.businessDate)}</p>
                <p className='text-xs text-muted-foreground'>
                  {item.calendarDayType === 'WORKDAY'
                    ? 'Hari kerja'
                    : 'Hari nonkerja'}
                </p>
              </div>
              <div className='flex items-center justify-between gap-2 sm:block'>
                <span className='text-xs text-muted-foreground sm:hidden'>
                  Attendance
                </span>
                <Badge
                  variant={
                    item.deductionType !== 'NONE' ? 'destructive' : 'secondary'
                  }
                >
                  {item.attendanceStatus}
                </Badge>
              </div>
              <div className='flex justify-between gap-2 sm:block'>
                <span className='text-xs text-muted-foreground sm:hidden'>
                  Jadwal
                </span>
                <span>{item.isScheduled ? 'Terjadwal' : 'Tidak'}</span>
              </div>
              <div className='flex items-center justify-between gap-2 sm:block sm:text-end'>
                <span className='text-xs text-muted-foreground sm:hidden'>
                  Dampak
                </span>
                {item.deductionType !== 'NONE' ? (
                  <div>
                    <p className='font-medium text-destructive'>
                      Potongan{' '}
                      {item.deductionType === 'ALPHA' ? 'Alpha' : 'Izin'}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      Nominal total ada pada dasar perhitungan.
                    </p>
                  </div>
                ) : (
                  <span className='text-muted-foreground'>Tidak dipotong</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className='rounded-lg border border-dashed p-5 text-center'>
          <CalendarCheck2 className='mx-auto size-6 text-muted-foreground' />
          <p className='mt-2 text-sm text-muted-foreground'>
            Ledger Attendance bulanan belum tersedia pada snapshot ini.
          </p>
        </div>
      )}
    </section>
  )
}

function TrainingProductionSnapshots({
  items,
}: {
  items: PayrollTrainingProductionSnapshot[]
}) {
  return (
    <section className='space-y-2' aria-labelledby='training-production-title'>
      <div>
        <h3 id='training-production-title' className='font-semibold'>
          Monitoring Produksi Training ({items.length})
        </h3>
        <p className='text-xs text-muted-foreground'>
          Hanya informasi hasil latihan. Kuantitas ini tidak menambah upah
          Payroll.
        </p>
      </div>
      {items.length ? (
        items.map((item) => (
          <div
            key={`${item.transactionNumber}-${item.businessDate}`}
            className='rounded-lg border p-3 text-sm'
          >
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='font-medium'>{item.jobName}</p>
                <p className='text-xs text-muted-foreground'>
                  {date(item.businessDate)} · {item.transactionNumber}
                </p>
              </div>
              <Badge variant='secondary'>Monitoring</Badge>
            </div>
            <p className='mt-2 font-semibold'>
              {item.quantity} {item.unitName}
            </p>
          </div>
        ))
      ) : (
        <div className='rounded-lg border border-dashed p-5 text-center'>
          <p className='text-sm text-muted-foreground'>
            Tidak ada hasil Produksi Training pada periode ini.
          </p>
        </div>
      )}
    </section>
  )
}

function ResultFact({
  label,
  value,
  strong,
}: {
  label: string
  value: React.ReactNode
  strong?: boolean
}) {
  return (
    <div>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className={strong ? 'font-bold' : 'font-medium'}>{value}</p>
    </div>
  )
}

function ManualComponentDialog({
  periodUid,
  open,
  onOpenChange,
}: {
  periodUid: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const meta = usePayrollSimulationMeta(open ? periodUid : undefined)
  const existing = usePayrollManualComponents(open ? periodUid : undefined)
  const mutation = useCreatePayrollManualComponent()
  const updateMutation = useUpdatePayrollManualComponent()
  const cancelMutation = useCancelPayrollManualComponent()
  const [employeeUid, setEmployeeUid] = useState('')
  const [componentTypeUid, setComponentTypeUid] = useState('')
  const [displayAmount, setDisplayAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [editUid, setEditUid] = useState('')
  const [editReason, setEditReason] = useState('')
  const [cancelUid, setCancelUid] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const revisions = usePayrollManualComponentRevisions(
    open ? periodUid : undefined,
    editUid || undefined
  )
  const selectedType = meta.data?.componentTypes.find(
    (item) => item.uid === componentTypeUid
  )
  const normalizedAmount = normalizeIdAmount(displayAmount)
  const hasPositiveAmount = isPositivePayrollAmount(normalizedAmount)
  const resetForm = () => {
    setEmployeeUid('')
    setComponentTypeUid('')
    setDisplayAmount('')
    setNotes('')
    setEditUid('')
    setEditReason('')
    setCancelUid('')
    setCancelReason('')
  }
  const close = (next: boolean) => {
    if (
      mutation.isPending ||
      updateMutation.isPending ||
      cancelMutation.isPending
    )
      return
    onOpenChange(next)
    if (!next) resetForm()
  }
  const submit = async () => {
    if (!hasPositiveAmount) return
    try {
      if (editUid) {
        if (!isValidPayrollAuditReason(editReason)) return
        await updateMutation.mutateAsync({
          periodUid,
          componentUid: editUid,
          amount: normalizedAmount,
          notes: notes.trim() || null,
          reason: editReason.trim(),
          idempotencyKey: crypto.randomUUID(),
        })
        toast.success(
          'Komponen manual berhasil dikoreksi. Hitung ulang untuk menerapkan perubahan.'
        )
        resetForm()
        onOpenChange(false)
        return
      }
      if (!employeeUid || !componentTypeUid || notes.trim().length < 5) return
      await mutation.mutateAsync({
        periodUid,
        employeeUid,
        componentTypeUid,
        amount: normalizedAmount,
        notes: notes.trim(),
        idempotencyKey: crypto.randomUUID(),
      })
      toast.success(
        'Komponen manual berhasil ditambahkan. Hitung ulang untuk menerapkannya.'
      )
      resetForm()
      onOpenChange(false)
    } catch (error) {
      toast.error(
        errorMessage(
          error,
          editUid
            ? 'Komponen manual gagal dikoreksi.'
            : 'Komponen manual gagal ditambahkan.'
        )
      )
    }
  }
  const startCorrection = (componentUid: string) => {
    const component = existing.data?.find((item) => item.uid === componentUid)
    if (!component) return
    setCancelUid('')
    setCancelReason('')
    setEditUid(component.uid)
    setEditReason('')
    setEmployeeUid(component.employee.uid)
    setComponentTypeUid(component.componentType.uid)
    setDisplayAmount(formatIdAmountInput(component.amount.replace('.', ',')))
    setNotes(component.notes ?? '')
  }
  const cancelComponent = async () => {
    if (!cancelUid || !isValidPayrollAuditReason(cancelReason)) return
    try {
      await cancelMutation.mutateAsync({
        periodUid,
        componentUid: cancelUid,
        reason: cancelReason.trim(),
        idempotencyKey: crypto.randomUUID(),
      })
      toast.success(
        'Komponen manual dibatalkan. Hitung ulang untuk menerapkan perubahan.'
      )
      setCancelUid('')
      setCancelReason('')
    } catch (error) {
      toast.error(errorMessage(error, 'Komponen manual gagal dibatalkan.'))
    }
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {editUid ? 'Koreksi Komponen Manual' : 'Tambah Komponen Manual'}
          </DialogTitle>
          <DialogDescription>
            {editUid
              ? 'Perubahan dicatat dalam histori audit dan baru masuk hasil setelah Hitung Ulang.'
              : 'Komponen diterapkan pada periode ini dan baru masuk hasil setelah Hitung/Hitung Ulang.'}
          </DialogDescription>
        </DialogHeader>
        {meta.isPending ? (
          <Skeleton className='h-44' />
        ) : meta.isError ? (
          <ErrorPanel onRetry={() => void meta.refetch()} />
        ) : (
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label>Karyawan</Label>
              <Select
                value={employeeUid}
                onValueChange={setEmployeeUid}
                disabled={Boolean(editUid)}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='Pilih karyawan' />
                </SelectTrigger>
                <SelectContent>
                  {meta.data?.employees.map((item) => (
                    <SelectItem key={item.uid} value={item.uid}>
                      {item.fullName} · {item.employeeNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label>Jenis komponen</Label>
              <Select
                value={componentTypeUid}
                onValueChange={setComponentTypeUid}
                disabled={Boolean(editUid)}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='Pilih tambahan atau potongan' />
                </SelectTrigger>
                <SelectContent>
                  {meta.data?.componentTypes.map((item) => (
                    <SelectItem key={item.uid} value={item.uid}>
                      {item.name} ·{' '}
                      {item.category === 'EARNING' ? 'Tambahan' : 'Potongan'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='manual-amount'>Nominal</Label>
              <Input
                id='manual-amount'
                inputMode='decimal'
                value={displayAmount}
                onChange={(event) =>
                  setDisplayAmount(formatIdAmountInput(event.target.value))
                }
                placeholder='Contoh: 150.000 atau 150.000,50'
              />
              <p className='text-xs text-muted-foreground'>
                Preview: {amount(normalizedAmount || '0')}{' '}
                {selectedType
                  ? `sebagai ${selectedType.category === 'EARNING' ? 'tambahan' : 'potongan'}`
                  : ''}
              </p>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='manual-reason'>
                {editUid ? 'Catatan komponen' : 'Alasan'}
              </Label>
              <Textarea
                id='manual-reason'
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder='Jelaskan dasar komponen (minimal 5 karakter)'
                maxLength={500}
              />
            </div>
            {editUid && (
              <div className='space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900 dark:bg-amber-950/20'>
                <Label htmlFor='manual-correction-reason'>Alasan koreksi</Label>
                <Textarea
                  id='manual-correction-reason'
                  value={editReason}
                  onChange={(event) => setEditReason(event.target.value)}
                  placeholder='Jelaskan mengapa komponen perlu dikoreksi (minimal 5 karakter)'
                  maxLength={500}
                />
                <Button
                  type='button'
                  size='sm'
                  variant='ghost'
                  onClick={resetForm}
                >
                  Batalkan mode koreksi
                </Button>
                {revisions.isPending ? (
                  <Skeleton className='h-12' />
                ) : revisions.data?.length ? (
                  <div className='space-y-1 border-t pt-2'>
                    <p className='text-xs font-semibold'>Histori perubahan</p>
                    {revisions.data.slice(0, 3).map((revision) => (
                      <div
                        key={revision.uid}
                        className='text-xs text-muted-foreground'
                      >
                        <span className='font-medium text-foreground'>
                          {revision.revisionType === 'CORRECTION'
                            ? 'Dikoreksi'
                            : revision.revisionType === 'CANCELLATION'
                              ? 'Dibatalkan'
                              : 'Dibuat'}
                        </span>{' '}
                        oleh {revision.revisedBy.name} pada{' '}
                        {formatDateTime(revision.revisedAt)}
                        {revision.reason ? `: ${revision.reason}` : ''}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
            {existing.data?.some((item) => item.status === 'ACTIVE') && (
              <div className='space-y-2 border-t pt-3'>
                <p className='text-sm font-semibold'>Komponen manual aktif</p>
                <p className='text-xs text-muted-foreground'>
                  Koreksi dan pembatalan selalu menyimpan alasan serta histori
                  perubahan.
                </p>
                {existing.data
                  .filter((item) => item.status === 'ACTIVE')
                  .map((item) => (
                    <div
                      key={item.uid}
                      className='flex items-center justify-between gap-3 rounded-lg border p-2 text-sm'
                    >
                      <div>
                        <p className='font-medium'>
                          {item.employee.fullName} · {item.componentType.name}
                        </p>
                        <p className='text-xs text-muted-foreground'>
                          {amount(item.amount)}
                        </p>
                      </div>
                      <div className='flex shrink-0 gap-1'>
                        <Button
                          size='sm'
                          variant='ghost'
                          onClick={() => startCorrection(item.uid)}
                        >
                          Koreksi
                        </Button>
                        <Button
                          size='sm'
                          variant='ghost'
                          className='text-destructive'
                          onClick={() => {
                            setEditUid('')
                            setEditReason('')
                            setCancelUid(item.uid)
                          }}
                        >
                          Batalkan
                        </Button>
                      </div>
                    </div>
                  ))}
                {cancelUid && (
                  <div className='space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3'>
                    <Label htmlFor='cancel-component-reason'>
                      Alasan pembatalan
                    </Label>
                    <Textarea
                      id='cancel-component-reason'
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                      placeholder='Minimal 5 karakter'
                    />
                    <div className='flex justify-end gap-2'>
                      <Button
                        size='sm'
                        variant='outline'
                        onClick={() => {
                          setCancelUid('')
                          setCancelReason('')
                        }}
                      >
                        Kembali
                      </Button>
                      <Button
                        size='sm'
                        variant='destructive'
                        disabled={
                          !isValidPayrollAuditReason(cancelReason) ||
                          cancelMutation.isPending
                        }
                        onClick={() => void cancelComponent()}
                      >
                        {cancelMutation.isPending && (
                          <LoaderCircle className='animate-spin' />
                        )}
                        Konfirmasi
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => close(false)}
            disabled={mutation.isPending || updateMutation.isPending}
          >
            Batal
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={
              !hasPositiveAmount ||
              (editUid
                ? !isValidPayrollAuditReason(editReason)
                : !employeeUid ||
                  !componentTypeUid ||
                  notes.trim().length < 5) ||
              mutation.isPending ||
              updateMutation.isPending
            }
          >
            {(mutation.isPending || updateMutation.isPending) && (
              <LoaderCircle className='animate-spin' />
            )}{' '}
            {editUid ? 'Simpan koreksi' : 'Tambahkan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmptySelection() {
  return (
    <div className='rounded-lg border border-dashed p-12 text-center'>
      <Calculator className='mx-auto size-9 text-muted-foreground' />
      <p className='mt-3 font-semibold'>Pilih periode Payroll</p>
      <p className='text-sm text-muted-foreground'>
        Hanya periode Draft atau yang sudah pernah dihitung yang tersedia.
      </p>
    </div>
  )
}
function ProcessingPanel({
  startedAt,
  canRecover,
  recovering,
  onRecover,
}: {
  startedAt: string
  canRecover: boolean
  recovering: boolean
  onRecover: () => Promise<void>
}) {
  const [openedAt] = useState(() => Date.now())
  const stale = openedAt - new Date(startedAt).getTime() > 30 * 60 * 1000
  return (
    <div
      className='rounded-lg border border-primary/20 bg-primary/5 p-10 text-center'
      role='status'
    >
      <LoaderCircle className='mx-auto size-9 animate-spin text-primary' />
      <p className='mt-3 font-semibold'>Simulasi sedang dihitung</p>
      <p className='text-sm text-muted-foreground'>
        Halaman memperbarui status otomatis setiap 2 detik. Jangan mengirim
        hitung ulang.
      </p>
      {stale && canRecover && (
        <Button
          className='mt-4'
          variant='outline'
          disabled={recovering}
          onClick={() => void onRecover()}
        >
          {recovering ? (
            <LoaderCircle className='animate-spin' />
          ) : (
            <RefreshCcw />
          )}
          Pulihkan run macet
        </Button>
      )}
    </div>
  )
}
function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div className='rounded-lg border border-dashed p-8 text-center'>
      <AlertTriangle className='mx-auto size-7 text-destructive' />
      <p className='mt-2 font-medium'>Data simulasi gagal dimuat.</p>
      <Button className='mt-3' variant='outline' onClick={onRetry}>
        <RefreshCcw /> Coba lagi
      </Button>
    </div>
  )
}
