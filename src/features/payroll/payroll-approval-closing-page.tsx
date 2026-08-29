import { useState } from 'react'
import { isAxiosError } from 'axios'
import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock3,
  Eye,
  FileCheck2,
  History,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  useApprovePayrollApproval,
  useClosePayrollPeriod,
  usePayrollApprovalQueue,
  usePayrollPeriod,
  usePayrollPeriodMeta,
  usePayrollPeriods,
  usePayrollWorkflow,
  useRejectPayrollApproval,
  useSubmitPayrollApproval,
  useWithdrawPayrollApproval,
} from './data/queries'
import type {
  PayrollApprovalQueueItem,
  PayrollPeriodDetail,
  PayrollPeriodSummary,
  PayrollWorkflow,
} from './domain'
import { formatDecimalString } from './money'
import {
  payrollBaseAmount,
  payrollBaseLabel,
  payrollGrossAmount,
  payrollSchemeName,
} from './payroll-presentation'
import {
  isRecalculationIssue,
  payrollApprovalStatusLabel,
  payrollPeriodStatusLabel,
  payrollWorkflowActionLabel,
  payrollWorkflowStageIndex,
  payrollWorkflowStages,
} from './payroll-workflow'

type SearchState = Record<string, unknown>
type ViewStatus = 'PENDING' | 'CALCULATED' | 'APPROVED' | 'CLOSED' | 'ALL'
type ActionKind = 'SUBMIT' | 'APPROVE' | 'REJECT' | 'WITHDRAW' | 'CLOSE'

const statusOptions: Array<{ value: ViewStatus; label: string }> = [
  { value: 'PENDING', label: 'Menunggu persetujuan' },
  { value: 'CALCULATED', label: 'Siap diajukan' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'CLOSED', label: 'Ditutup' },
  { value: 'ALL', label: 'Semua periode' },
]

function money(value: string | number) {
  return formatDecimalString(value, {
    currency: true,
    maximumFractionDigits: 2,
  })
}

function date(value: string) {
  return format(parseISO(value), 'd MMM yyyy', { locale: id })
}

function dateTime(value: string) {
  return format(parseISO(value), 'd MMM yyyy, HH.mm', { locale: id })
}

function apiError(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}

export function PayrollApprovalClosingPage({
  search,
  navigate,
}: {
  search: SearchState
  navigate: NavigateFn
}) {
  const session = useAuthStore((state) => state.session)
  const defaultStatus: ViewStatus =
    session?.user.role === 'DIRECTOR' ? 'PENDING' : 'CALCULATED'
  const status =
    typeof search.status === 'string'
      ? (search.status as ViewStatus)
      : defaultStatus
  const siteCode =
    typeof search.siteCode === 'string' ? search.siteCode : undefined
  const query = typeof search.query === 'string' ? search.query : ''
  const page = typeof search.page === 'number' ? search.page : 1
  const pageSize = typeof search.pageSize === 'number' ? search.pageSize : 20
  const periodUid =
    typeof search.periodUid === 'string' ? search.periodUid : undefined
  const patch = (value: SearchState) =>
    navigate({ search: (previous) => ({ ...previous, ...value }) })

  const meta = usePayrollPeriodMeta()
  const queue = usePayrollApprovalQueue(
    {
      status: 'PENDING',
      siteCode,
      query: query || undefined,
      page,
      pageSize,
    },
    status === 'PENDING'
  )
  const periods = usePayrollPeriods(
    {
      status: status === 'ALL' ? undefined : status,
      siteCode,
      query: query || undefined,
      page,
      pageSize,
    },
    status !== 'PENDING'
  )

  const activeQuery = status === 'PENDING' ? queue : periods
  const total =
    status === 'PENDING'
      ? (queue.data?.meta.total ?? 0)
      : (periods.data?.meta.total ?? 0)
  const shown =
    status === 'PENDING' ? queue.data?.data.length : periods.data?.data.length

  return (
    <Main>
      <div className='space-y-4'>
        <header>
          <p className='text-sm font-medium text-primary'>Payroll</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Approval & Closing
          </h1>
          <p className='max-w-3xl text-sm text-muted-foreground'>
            Periksa hasil simulasi, kelola persetujuan, lalu kunci periode
            secara permanen. Status ditutup tidak berarti gaji sudah dibayarkan.
          </p>
        </header>

        <WorkflowLegend />

        <section
          aria-label='Filter approval Payroll'
          className='grid gap-2 md:grid-cols-[minmax(220px,1fr)_220px_220px]'
        >
          <div className='relative'>
            <Search className='absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={query}
              onChange={(event) =>
                patch({
                  query: event.target.value || undefined,
                  page: undefined,
                })
              }
              className='ps-9'
              placeholder='Cari periode, site, atau pengaju...'
              aria-label='Cari approval Payroll'
            />
          </div>
          <Select
            value={siteCode ?? 'ALL'}
            onValueChange={(value) =>
              patch({
                siteCode: value === 'ALL' ? undefined : value,
                page: undefined,
              })
            }
          >
            <SelectTrigger className='w-full' aria-label='Filter site'>
              <SelectValue placeholder='Semua site' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>Semua site</SelectItem>
              {(meta.data?.sites ?? []).map((site) => (
                <SelectItem key={site.uid} value={site.code}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(value: ViewStatus) =>
              patch({ status: value, page: undefined, periodUid: undefined })
            }
          >
            <SelectTrigger className='w-full' aria-label='Filter status'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {activeQuery.isPending ? (
          <LoadingCards />
        ) : activeQuery.isError ? (
          <ErrorPanel onRetry={() => void activeQuery.refetch()} />
        ) : shown === 0 ? (
          <EmptyPanel status={status} />
        ) : status === 'PENDING' ? (
          <div className='grid gap-2 lg:grid-cols-2'>
            {(queue.data?.data ?? []).map((item) => (
              <PendingCard
                key={item.approvalUid}
                item={item}
                onOpen={() => patch({ periodUid: item.periodUid })}
              />
            ))}
          </div>
        ) : (
          <div className='grid gap-2 lg:grid-cols-2'>
            {(periods.data?.data ?? []).map((item) => (
              <PeriodCard
                key={item.uid}
                item={item}
                onOpen={() => patch({ periodUid: item.uid })}
              />
            ))}
          </div>
        )}

        {total > pageSize && (
          <div className='flex flex-col gap-2 border-t pt-3 text-sm sm:flex-row sm:items-center sm:justify-between'>
            <span className='text-muted-foreground'>
              Menampilkan {shown ?? 0} dari {total} data
            </span>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                disabled={page <= 1}
                onClick={() => patch({ page: page - 1 })}
              >
                Sebelumnya
              </Button>
              <Button
                variant='outline'
                size='sm'
                disabled={page * pageSize >= total}
                onClick={() => patch({ page: page + 1 })}
              >
                Berikutnya
              </Button>
            </div>
          </div>
        )}
      </div>

      <WorkflowSheet
        periodUid={periodUid}
        open={Boolean(periodUid)}
        onOpenChange={(open) => !open && patch({ periodUid: undefined })}
      />
    </Main>
  )
}

function WorkflowLegend() {
  return (
    <section className='rounded-lg border bg-muted/20 px-3 py-2.5'>
      <div
        className='flex min-w-0 items-center overflow-x-auto'
        aria-label='Tahapan Payroll'
      >
        {payrollWorkflowStages.map((stage, index) => (
          <div key={stage.key} className='flex shrink-0 items-center'>
            <span className='flex items-center gap-1.5 text-sm font-medium'>
              <span className='flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary'>
                {index + 1}
              </span>
              {stage.label}
            </span>
            {index < payrollWorkflowStages.length - 1 && (
              <ArrowRight className='mx-3 size-4 text-muted-foreground' />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function PendingCard({
  item,
  onOpen,
}: {
  item: PayrollApprovalQueueItem
  onOpen: () => void
}) {
  return (
    <article className='rounded-lg border border-warning/30 bg-warning/5 p-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h2 className='truncate font-semibold'>{item.periodName}</h2>
            <Badge
              variant='outline'
              className='border-warning/40 bg-background'
            >
              <Clock3 /> Menunggu
            </Badge>
            {item.superAdminOverride && (
              <Badge variant='outline'>Override Super Admin</Badge>
            )}
          </div>
          <p className='text-sm text-muted-foreground'>
            {item.siteName} / {item.periodCode} / Run #{item.runNumber}
          </p>
          <Badge variant='outline' className='mt-2'>
            {payrollSchemeName(item)}
          </Badge>
        </div>
        <Button size='sm' variant='outline' onClick={onOpen}>
          <Eye /> Periksa
        </Button>
      </div>
      <div className='mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3'>
        <Metric label='Karyawan' value={`${item.employeeCount}`} icon={Users} />
        <Metric label='Neto' value={money(item.totalNetPay)} icon={Banknote} />
        <Metric
          label='Diajukan'
          value={dateTime(item.requestedAt)}
          icon={Send}
          className='col-span-2 sm:col-span-1'
        />
      </div>
      <p className='mt-2 text-xs text-muted-foreground'>
        Oleh {item.requestedByName}
      </p>
    </article>
  )
}

function PeriodCard({
  item,
  onOpen,
}: {
  item: PayrollPeriodSummary
  onOpen: () => void
}) {
  return (
    <article className='rounded-lg border p-3 transition-colors hover:bg-muted/20'>
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='flex flex-wrap items-center gap-2'>
            <h2 className='truncate font-semibold'>{item.periodName}</h2>
            <PeriodBadge status={item.status} />
          </div>
          <p className='text-sm text-muted-foreground'>
            {item.site.name} / {item.periodCode}
          </p>
          <Badge variant='outline' className='mt-2'>
            {payrollSchemeName(item)}
          </Badge>
          <p className='mt-1 text-xs text-muted-foreground'>
            {date(item.periodStart)} – {date(item.periodEnd)}
          </p>
        </div>
        <Button size='sm' variant='outline' onClick={onOpen}>
          <Eye /> Detail
        </Button>
      </div>
      <div className='mt-3 flex flex-wrap items-center gap-2 text-xs'>
        <Badge variant='outline'>
          {item.readiness.populationCount} karyawan
        </Badge>
        {item.readiness.blockerCount > 0 && (
          <Badge variant='destructive'>
            {item.readiness.blockerCount} blocker
          </Badge>
        )}
        {item.readiness.warningCount > 0 && (
          <Badge variant='outline' className='border-warning/50'>
            {item.readiness.warningCount} perhatian
          </Badge>
        )}
      </div>
    </article>
  )
}

function WorkflowSheet({
  periodUid,
  open,
  onOpenChange,
}: {
  periodUid?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const period = usePayrollPeriod(periodUid)
  const workflow = usePayrollWorkflow(periodUid)
  const [action, setAction] = useState<ActionKind | null>(null)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-3xl'>
        <SheetHeader className='border-b'>
          <SheetTitle>Approval & Closing Payroll</SheetTitle>
          <SheetDescription>
            {period.data
              ? `${period.data.site.name} / ${period.data.periodName}`
              : 'Memuat periode Payroll...'}
          </SheetDescription>
        </SheetHeader>

        <div className='space-y-4 px-4 pb-6'>
          {workflow.isPending || period.isPending ? (
            <LoadingDetail />
          ) : workflow.isError ||
            period.isError ||
            !workflow.data ||
            !period.data ? (
            <ErrorPanel
              onRetry={() => {
                void workflow.refetch()
                void period.refetch()
              }}
            />
          ) : (
            <>
              <WorkflowTracker workflow={workflow.data} />
              <PeriodSummary period={period.data} workflow={workflow.data} />
              <IntegrityPanel workflow={workflow.data} />
              <WorkflowActions workflow={workflow.data} onAction={setAction} />
              <ApprovalHistory workflow={workflow.data} />
            </>
          )}
        </div>
      </SheetContent>

      {workflow.data && period.data && (
        <WorkflowActionDialog
          action={action}
          onOpenChange={(isOpen) => !isOpen && setAction(null)}
          workflow={workflow.data}
          period={period.data}
        />
      )}
    </Sheet>
  )
}

function WorkflowTracker({ workflow }: { workflow: PayrollWorkflow }) {
  const activeIndex = payrollWorkflowStageIndex(workflow)
  return (
    <div className='grid grid-cols-4 gap-1' aria-label='Progres Payroll'>
      {payrollWorkflowStages.map((stage, index) => {
        const done = index <= activeIndex
        return (
          <div key={stage.key} className='min-w-0'>
            <div
              className={cn(
                'h-1.5 rounded-full',
                done ? 'bg-primary' : 'bg-muted'
              )}
            />
            <p
              className={cn(
                'mt-1 truncate text-[11px]',
                done ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {stage.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function PeriodSummary({
  period,
  workflow,
}: {
  period: PayrollPeriodSummary | PayrollPeriodDetail
  workflow: PayrollWorkflow
}) {
  const run = workflow.currentRun
  const scheme = {
    payrollBasis: workflow.payrollBasis ?? period.payrollBasis,
    payFrequency: workflow.payFrequency ?? period.payFrequency,
    employeeType: workflow.employeeType ?? period.employeeType,
  }
  const gross = run ? payrollGrossAmount(run, scheme) : '0'
  return (
    <section className='rounded-lg border p-3'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div>
          <p className='font-semibold'>{period.periodName}</p>
          <p className='text-sm text-muted-foreground'>
            {period.site.name} / {period.periodCode} /{' '}
            {date(period.periodStart)} - {date(period.periodEnd)}
          </p>
        </div>
        <PeriodBadge status={workflow.periodStatus} />
        <Badge variant='outline'>{payrollSchemeName(scheme)}</Badge>
      </div>
      <div className='mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4'>
        <Metric
          label='Run aktif'
          value={
            workflow.currentRun
              ? `#${workflow.currentRun.runNumber}`
              : 'Belum ada'
          }
          icon={FileCheck2}
        />
        <Metric
          label='Karyawan'
          value={`${workflow.currentRun?.employeeCount ?? 0}`}
          icon={Users}
        />
        <Metric
          label={payrollBaseLabel(scheme)}
          value={money(run ? payrollBaseAmount(run, scheme) : '0')}
          icon={Banknote}
        />
        <Metric
          label='Tambahan'
          value={money(run?.totalEarnings ?? '0')}
          icon={Banknote}
        />
        <Metric label='Bruto' value={money(gross)} icon={Banknote} />
        <Metric
          label='Potongan'
          value={money(run?.totalDeductions ?? '0')}
          icon={Banknote}
        />
        <Metric
          label='Neto'
          value={money(workflow.currentRun?.totalNetPay ?? '0')}
          icon={Banknote}
          className='col-span-2 sm:col-span-1'
        />
      </div>
      {workflow.approval && (
        <div className='mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-sm'>
          <Badge variant='outline'>
            {payrollApprovalStatusLabel(workflow.approval.status)}
          </Badge>
          <span className='text-muted-foreground'>
            Diajukan {dateTime(workflow.approval.requestedAt)} oleh{' '}
            {workflow.approval.requestedByName}
          </span>
          {workflow.approval.superAdminOverride && (
            <Badge variant='outline'>Override Super Admin</Badge>
          )}
        </div>
      )}
    </section>
  )
}

function IntegrityPanel({ workflow }: { workflow: PayrollWorkflow }) {
  if (workflow.integrity.valid) {
    return (
      <Alert className='border-positive/30 bg-positive/5'>
        <CheckCircle2 className='text-positive' />
        <AlertTitle>Data siap diproses</AlertTitle>
        <AlertDescription>
          Run aktif dan snapshot sumber masih konsisten.
        </AlertDescription>
      </Alert>
    )
  }
  const requiresRecalculation = workflow.integrity.issues.some((issue) =>
    isRecalculationIssue(issue.code)
  )
  return (
    <Alert variant='destructive'>
      <AlertTriangle />
      <AlertTitle>
        {requiresRecalculation ? 'Perlu hitung ulang' : 'Belum dapat diproses'}
      </AlertTitle>
      <AlertDescription>
        <ul className='mt-1 list-disc space-y-1 ps-4'>
          {workflow.integrity.issues.map((issue) => (
            <li key={issue.code}>
              {issue.message}
              {issue.count > 0 ? ` (${issue.count})` : ''}
              {issue.code.includes('BANK') && (
                <span className='block text-xs'>
                  Lengkapi rekening karyawan, lalu hitung ulang Payroll.
                </span>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

function WorkflowActions({
  workflow,
  onAction,
}: {
  workflow: PayrollWorkflow
  onAction: (action: ActionKind) => void
}) {
  const capabilities = workflow.capabilities
  const hasAction = Object.values(capabilities).some(Boolean)
  if (!hasAction) {
    return (
      <div className='rounded-lg border border-dashed p-3 text-sm text-muted-foreground'>
        Tidak ada tindakan yang tersedia untuk status dan akses Anda saat ini.
      </div>
    )
  }
  return (
    <section
      aria-label='Tindakan workflow Payroll'
      className='flex flex-wrap gap-2'
    >
      {capabilities.canSubmit && (
        <Button
          disabled={!workflow.integrity.valid}
          onClick={() => onAction('SUBMIT')}
        >
          <Send /> Ajukan
        </Button>
      )}
      {capabilities.canApprove && (
        <Button
          disabled={!workflow.integrity.valid}
          onClick={() => onAction('APPROVE')}
        >
          <ShieldCheck /> Setujui
        </Button>
      )}
      {capabilities.canReject && (
        <Button variant='destructive' onClick={() => onAction('REJECT')}>
          <XCircle /> Tolak
        </Button>
      )}
      {capabilities.canWithdraw && (
        <Button variant='outline' onClick={() => onAction('WITHDRAW')}>
          <RotateCcw /> Tarik pengajuan
        </Button>
      )}
      {capabilities.canClose && (
        <Button
          disabled={!workflow.integrity.valid}
          onClick={() => onAction('CLOSE')}
        >
          <LockKeyhole /> Tutup periode
        </Button>
      )}
    </section>
  )
}

function ApprovalHistory({ workflow }: { workflow: PayrollWorkflow }) {
  return (
    <section>
      <div className='mb-2 flex items-center gap-2'>
        <History className='size-4 text-muted-foreground' />
        <h3 className='font-semibold'>Riwayat persetujuan</h3>
      </div>
      {workflow.history.length === 0 ? (
        <div className='rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground'>
          Belum ada aktivitas persetujuan.
        </div>
      ) : (
        <ol className='space-y-2'>
          {workflow.history.map((item) => (
            <li key={item.uid} className='rounded-lg border p-3 text-sm'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <span className='font-medium'>
                  {payrollWorkflowActionLabel(item.action)}
                </span>
                <span className='text-xs text-muted-foreground'>
                  {dateTime(item.performedAt)}
                </span>
              </div>
              <p className='text-muted-foreground'>
                Oleh {item.performedByName}
              </p>
              {item.reason && <p className='mt-1'>{item.reason}</p>}
              {item.superAdminOverride && (
                <Badge variant='outline' className='mt-2'>
                  Override Super Admin
                </Badge>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function WorkflowActionDialog({
  action,
  onOpenChange,
  workflow,
  period,
}: {
  action: ActionKind | null
  onOpenChange: (open: boolean) => void
  workflow: PayrollWorkflow
  period: PayrollPeriodSummary | PayrollPeriodDetail
}) {
  const submit = useSubmitPayrollApproval()
  const approve = useApprovePayrollApproval()
  const reject = useRejectPayrollApproval()
  const withdraw = useWithdrawPayrollApproval()
  const close = useClosePayrollPeriod()
  const [text, setText] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const mutation =
    action === 'SUBMIT'
      ? submit
      : action === 'APPROVE'
        ? approve
        : action === 'REJECT'
          ? reject
          : action === 'WITHDRAW'
            ? withdraw
            : close
  const requiresReason = action === 'REJECT' || action === 'WITHDRAW'
  const disabled =
    mutation.isPending ||
    (requiresReason && text.trim().length < 5) ||
    (action === 'CLOSE' && !acknowledged)

  const labels: Record<
    ActionKind,
    { title: string; description: string; button: string }
  > = {
    SUBMIT: {
      title: 'Ajukan Payroll',
      description:
        'Pastikan run, periode, dan nilai berikut sudah benar sebelum diteruskan ke penyetuju.',
      button: 'Ajukan Payroll',
    },
    APPROVE: {
      title: 'Setujui Payroll',
      description:
        'Persetujuan berlaku untuk run yang tampil. Periksa ringkasan sebelum melanjutkan.',
      button: 'Setujui',
    },
    REJECT: {
      title: 'Tolak Payroll',
      description:
        'Payroll yang ditolak wajib dihitung ulang sebelum dapat diajukan kembali.',
      button: 'Tolak Payroll',
    },
    WITHDRAW: {
      title: 'Tarik Pengajuan',
      description:
        'Pengajuan yang ditarik wajib dihitung ulang sebelum diajukan kembali.',
      button: 'Tarik Pengajuan',
    },
    CLOSE: {
      title: 'Tutup Periode Payroll',
      description:
        'Closing bersifat permanen dan tidak dapat dibuka kembali. Status ditutup bukan bukti pembayaran.',
      button: 'Tutup Permanen',
    },
  }
  if (!action) return null
  const label = labels[action]
  const run = workflow.currentRun
  const scheme = {
    payrollBasis: workflow.payrollBasis ?? period.payrollBasis,
    payFrequency: workflow.payFrequency ?? period.payFrequency,
    employeeType: workflow.employeeType ?? period.employeeType,
  }
  const gross = run ? payrollGrossAmount(run, scheme) : '0'

  const execute = async () => {
    const input = {
      periodUid: period.uid,
      approvalUid: workflow.approval?.uid,
      idempotencyKey: crypto.randomUUID(),
      reason: requiresReason ? text.trim() : undefined,
      notes:
        action === 'SUBMIT' || action === 'APPROVE'
          ? text.trim() || undefined
          : undefined,
    }
    try {
      await mutation.mutateAsync(input)
      toast.success(`${label.button} berhasil.`)
      setText('')
      setAcknowledged(false)
      onOpenChange(false)
    } catch (error) {
      toast.error(apiError(error, `${label.button} gagal diproses.`))
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setText('')
          setAcknowledged(false)
        }
        onOpenChange(open)
      }}
    >
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{label.title}</DialogTitle>
          <DialogDescription>{label.description}</DialogDescription>
        </DialogHeader>

        <div className='rounded-lg border bg-muted/20 p-3 text-sm'>
          <dl className='grid grid-cols-2 gap-x-4 gap-y-2'>
            <SummaryRow label='Site' value={period.site.name} />
            <SummaryRow label='Periode' value={period.periodName} />
            <SummaryRow
              label='Run'
              value={`#${workflow.currentRun?.runNumber ?? '-'}`}
            />
            <SummaryRow
              label='Karyawan'
              value={`${workflow.currentRun?.employeeCount ?? 0}`}
            />
            <SummaryRow
              label={payrollBaseLabel(scheme)}
              value={money(run ? payrollBaseAmount(run, scheme) : '0')}
            />
            <SummaryRow
              label='Tambahan'
              value={money(run?.totalEarnings ?? '0')}
            />
            <SummaryRow label='Bruto' value={money(gross)} />
            <SummaryRow
              label='Potongan'
              value={money(run?.totalDeductions ?? '0')}
            />
            <SummaryRow
              label='Neto'
              value={money(workflow.currentRun?.totalNetPay ?? '0')}
              strong
            />
          </dl>
        </div>

        {action !== 'CLOSE' && (
          <div className='space-y-2'>
            <Label htmlFor='workflow-note'>
              {requiresReason ? 'Alasan (wajib)' : 'Catatan (opsional)'}
            </Label>
            <Textarea
              id='workflow-note'
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={
                requiresReason
                  ? 'Jelaskan alasan minimal 5 karakter.'
                  : 'Tambahkan catatan untuk riwayat persetujuan.'
              }
            />
            {requiresReason && (
              <p className='text-xs text-muted-foreground'>
                Minimal 5 karakter agar histori audit cukup jelas.
              </p>
            )}
          </div>
        )}

        {action === 'CLOSE' && (
          <label className='flex cursor-pointer items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm'>
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
              aria-label='Konfirmasi closing permanen'
            />
            <span>
              Saya memahami periode akan terkunci permanen, tidak dapat dibuka
              kembali, dan belum berarti gaji sudah dibayarkan.
            </span>
          </label>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            variant={
              action === 'REJECT' || action === 'CLOSE'
                ? 'destructive'
                : 'default'
            }
            disabled={disabled}
            onClick={() => void execute()}
          >
            {mutation.isPending && <LoaderCircle className='animate-spin' />}
            {label.button}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className={cn('break-words', strong && 'font-semibold')}>{value}</dd>
    </div>
  )
}

function Metric({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string
  value: string
  icon: typeof Users
  className?: string
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-lg border bg-background px-3 py-2',
        className
      )}
    >
      <div className='flex items-center gap-1 text-xs text-muted-foreground'>
        <Icon className='size-3.5' /> {label}
      </div>
      <p className='mt-0.5 truncate text-sm font-semibold' title={value}>
        {value}
      </p>
    </div>
  )
}

function PeriodBadge({ status }: { status: PayrollPeriodSummary['status'] }) {
  return (
    <Badge
      variant={status === 'CANCELLED' ? 'destructive' : 'outline'}
      className={cn(
        status === 'CLOSED' && 'border-positive/40 bg-positive/5',
        status === 'APPROVED' && 'border-primary/40 bg-primary/5'
      )}
    >
      {status === 'CLOSED' && <LockKeyhole />}
      {status === 'APPROVED' && <Check />}
      {payrollPeriodStatusLabel(status)}
    </Badge>
  )
}

function LoadingCards() {
  return (
    <div className='grid gap-2 lg:grid-cols-2' aria-label='Memuat data Payroll'>
      {[1, 2, 3, 4].map((item) => (
        <Skeleton key={item} className='h-36 rounded-lg' />
      ))}
    </div>
  )
}

function LoadingDetail() {
  return (
    <div className='space-y-3' aria-label='Memuat detail Payroll'>
      <Skeleton className='h-10 w-full' />
      <Skeleton className='h-48 w-full' />
      <Skeleton className='h-24 w-full' />
    </div>
  )
}

function ErrorPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div className='rounded-lg border border-dashed p-8 text-center'>
      <AlertTriangle className='mx-auto size-7 text-destructive' />
      <p className='mt-2 font-semibold'>Data Payroll gagal dimuat</p>
      <p className='text-sm text-muted-foreground'>
        Periksa koneksi lalu coba kembali.
      </p>
      <Button className='mt-3' size='sm' variant='outline' onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  )
}

function EmptyPanel({ status }: { status: ViewStatus }) {
  return (
    <div className='rounded-lg border border-dashed p-10 text-center'>
      <CheckCircle2 className='mx-auto size-8 text-muted-foreground' />
      <p className='mt-2 font-semibold'>Tidak ada data pada filter ini</p>
      <p className='text-sm text-muted-foreground'>
        {status === 'PENDING'
          ? 'Antrean persetujuan saat ini sudah bersih.'
          : 'Ubah site, status, atau kata pencarian untuk melihat periode lain.'}
      </p>
    </div>
  )
}
