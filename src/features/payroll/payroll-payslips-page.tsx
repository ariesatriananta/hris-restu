import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Eye,
  FileText,
  LoaderCircle,
  Printer,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { type NavigateFn } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Main } from '@/components/layout/main'
import {
  useIssuePayrollPayslips,
  usePayrollHistory,
  usePayrollPayslips,
  usePayrollRuns,
} from './data/queries'
import type { PayrollPayslipBundle } from './domain'
import { formatDecimalString } from './money'
import { employeeBaseLabel, payrollSchemeName } from './payroll-presentation'

type SearchState = Record<string, unknown>
type PayslipEmployee = PayrollPayslipBundle['employees'][number]

function money(value: string | number) {
  return formatDecimalString(value, {
    currency: true,
    maximumFractionDigits: 2,
  })
}
function number(value: string | number) {
  return formatDecimalString(value, { maximumFractionDigits: 2 })
}
function localDate(value: string) {
  return format(parseISO(value), 'd MMMM yyyy', { locale: id })
}
function apiError(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}

export function PayrollPayslipsPage({
  search,
  navigate,
}: {
  search: SearchState
  navigate: NavigateFn
}) {
  const periodUid = typeof search.periodUid === 'string' ? search.periodUid : ''
  const selectedRunUid = typeof search.runUid === 'string' ? search.runUid : ''
  const query = typeof search.query === 'string' ? search.query : ''
  const detailUid =
    typeof search.employeeResultUid === 'string'
      ? search.employeeResultUid
      : undefined
  const history = usePayrollHistory({
    pageSize: 500,
  })
  const runs = usePayrollRuns(periodUid || undefined)
  const runUid =
    selectedRunUid || runs.data?.find((item) => item.isCurrent)?.uid || ''
  const bundle = usePayrollPayslips(runUid || undefined)
  const issue = useIssuePayrollPayslips()
  const [selection, setSelection] = useState<{
    runUid: string
    employeeResultUids: string[]
  }>({ runUid: '', employeeResultUids: [] })
  const selected =
    selection.runUid === runUid ? selection.employeeResultUids : []
  const setSelected = (value: string[] | ((current: string[]) => string[])) =>
    setSelection((current) => {
      const active = current.runUid === runUid ? current.employeeResultUids : []
      return {
        runUid,
        employeeResultUids: typeof value === 'function' ? value(active) : value,
      }
    })
  const [printBundle, setPrintBundle] = useState<PayrollPayslipBundle | null>(
    null
  )
  const patch = (value: SearchState) =>
    navigate({ search: (previous) => ({ ...previous, ...value }) })

  useEffect(() => {
    if (!printBundle) return
    const timeout = window.setTimeout(() => {
      window.print()
      setPrintBundle(null)
    }, 180)
    return () => window.clearTimeout(timeout)
  }, [printBundle])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('id-ID')
    if (!normalized) return bundle.data?.employees ?? []
    return (bundle.data?.employees ?? []).filter((employee) =>
      `${employee.fullName} ${employee.employeeNumber}`
        .toLocaleLowerCase('id-ID')
        .includes(normalized)
    )
  }, [bundle.data, query])
  const selectedPeriod = history.data?.data.find(
    (item) => item.uid === periodUid
  )
  const selectedRun = runs.data?.find((item) => item.uid === runUid)
  const canPrint = history.data?.meta.capabilities.canPrint === true

  const print = async (employeeResultUids?: string[]) => {
    if (!runUid || !canPrint) return
    try {
      const result = await issue.mutateAsync({
        runUid,
        employeeResultUids,
        idempotencyKey: crypto.randomUUID(),
      })
      setPrintBundle(result.data)
      toast.success(
        result.data.document.official
          ? 'Slip resmi siap dicetak.'
          : 'Slip simulasi siap dicetak dengan watermark.'
      )
    } catch (error) {
      toast.error(apiError(error, 'Slip Payroll gagal disiapkan.'))
    }
  }

  const toggleAll = () => {
    const visible = filtered.map((employee) => employee.employeeResultUid)
    const allSelected =
      visible.length > 0 && visible.every((uid) => selected.includes(uid))
    setSelected(
      allSelected
        ? selected.filter((uid) => !visible.includes(uid))
        : Array.from(new Set([...selected, ...visible])).slice(0, 500)
    )
  }

  return (
    <Main>
      <div className='space-y-4'>
        <header className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
          <div>
            <p className='text-sm font-medium text-primary'>Payroll</p>
            <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
              Slip Gaji
            </h1>
            <p className='text-sm text-muted-foreground'>
              Preview hasil simulasi atau cetak slip resmi dari snapshot Payroll
              yang telah ditutup.
            </p>
          </div>
          {canPrint && bundle.data?.employees.length ? (
            <div className='flex flex-wrap gap-2'>
              <Button
                variant='outline'
                disabled={!selected.length || issue.isPending}
                onClick={() => print(selected)}
              >
                <Printer className='mr-2 size-4' />
                Cetak dipilih ({selected.length})
              </Button>
              <Button disabled={issue.isPending} onClick={() => print()}>
                {issue.isPending ? (
                  <LoaderCircle className='mr-2 size-4 animate-spin' />
                ) : (
                  <Printer className='mr-2 size-4' />
                )}
                Cetak massal
              </Button>
            </div>
          ) : null}
        </header>

        <Alert className='border-sky-200 bg-sky-50/70 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100'>
          <AlertCircle className='size-4' />
          <AlertDescription>
            Slip resmi hanya tersedia untuk Payroll berstatus Ditutup dan run
            FINAL. Ditutup bukan berarti sudah dibayar.
          </AlertDescription>
        </Alert>

        <section className='grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_220px_minmax(220px,1fr)]'>
          <Select
            value={periodUid || 'NONE'}
            onValueChange={(value) =>
              patch({
                periodUid: value === 'NONE' ? undefined : value,
                runUid: undefined,
                employeeResultUid: undefined,
              })
            }
          >
            <SelectTrigger
              className='w-full'
              aria-label='Pilih periode Payroll'
            >
              <SelectValue placeholder='Pilih periode Payroll' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='NONE'>Pilih periode</SelectItem>
              {history.data?.data
                .filter((period) =>
                  ['CALCULATED', 'APPROVED', 'CLOSED'].includes(period.status)
                )
                .map((period) => (
                  <SelectItem key={period.uid} value={period.uid}>
                    {period.periodName} · {period.site.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Select
            value={runUid || 'NONE'}
            disabled={!periodUid || runs.isPending}
            onValueChange={(value) =>
              patch({
                runUid: value === 'NONE' ? undefined : value,
                employeeResultUid: undefined,
              })
            }
          >
            <SelectTrigger className='w-full' aria-label='Pilih run Payroll'>
              <SelectValue placeholder='Pilih run' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='NONE'>Pilih run</SelectItem>
              {runs.data
                ?.filter((run) => run.status === 'COMPLETED')
                .map((run) => (
                  <SelectItem key={run.uid} value={run.uid}>
                    Run #{run.runNumber} ·{' '}
                    {run.runType === 'FINAL' ? 'FINAL' : 'Simulasi'}
                    {run.isCurrent ? ' · terbaru' : ''}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <div className='relative'>
            <Search className='absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              value={query}
              disabled={!runUid}
              onChange={(event) =>
                patch({ query: event.target.value || undefined })
              }
              placeholder='Cari nama atau nomor karyawan...'
              className='pl-9'
              aria-label='Cari slip karyawan'
            />
          </div>
        </section>

        {selectedPeriod && selectedRun && (
          <section
            className='grid grid-cols-2 gap-2 lg:grid-cols-4'
            aria-label='Ringkasan slip Payroll'
          >
            <CompactKpi
              icon={Users}
              label='Karyawan'
              value={selectedRun.employeeCount.toLocaleString('id-ID')}
              tone='blue'
            />
            <CompactKpi
              icon={Banknote}
              label='Total neto'
              value={money(selectedRun.totalNetPay)}
              tone='green'
            />
            <CompactKpi
              icon={selectedRun.runType === 'FINAL' ? ShieldCheck : FileText}
              label='Jenis dokumen'
              value={selectedRun.runType === 'FINAL' ? 'Resmi' : 'Simulasi'}
              tone='violet'
            />
            <CompactKpi
              icon={CheckCircle2}
              label='Status periode'
              value={
                selectedPeriod.status === 'CLOSED' ? 'Ditutup' : 'Belum ditutup'
              }
              tone='amber'
            />
          </section>
        )}

        {!periodUid ? (
          <Empty
            icon={FileText}
            title='Pilih periode Payroll'
            text='Pilih periode dan run untuk menampilkan slip berdasarkan snapshot.'
          />
        ) : bundle.isPending ? (
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <Skeleton key={item} className='h-48 rounded-lg' />
            ))}
          </div>
        ) : bundle.isError ? (
          <ErrorState retry={() => bundle.refetch()} />
        ) : filtered.length ? (
          <>
            <div className='flex items-center justify-between gap-3'>
              <label className='flex items-center gap-2 text-sm font-medium'>
                <Checkbox
                  checked={filtered.every((employee) =>
                    selected.includes(employee.employeeResultUid)
                  )}
                  onCheckedChange={toggleAll}
                />
                Pilih semua hasil filter
              </label>
              <span className='text-xs text-muted-foreground'>
                {filtered.length.toLocaleString('id-ID')} slip ditampilkan
              </span>
            </div>
            <div className='grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3'>
              {filtered.map((employee) => (
                <SlipGalleryCard
                  key={employee.employeeResultUid}
                  employee={employee}
                  document={bundle.data!.document}
                  checked={selected.includes(employee.employeeResultUid)}
                  onCheck={() =>
                    setSelected((current) =>
                      current.includes(employee.employeeResultUid)
                        ? current.filter(
                            (uid) => uid !== employee.employeeResultUid
                          )
                        : current.length < 500
                          ? [...current, employee.employeeResultUid]
                          : current
                    )
                  }
                  onPreview={() =>
                    patch({ employeeResultUid: employee.employeeResultUid })
                  }
                  onPrint={
                    canPrint
                      ? () => print([employee.employeeResultUid])
                      : undefined
                  }
                />
              ))}
            </div>
          </>
        ) : (
          <Empty
            icon={Search}
            title='Slip tidak ditemukan'
            text='Ubah kata pencarian atau pilih run lain.'
          />
        )}
      </div>

      <PayslipDrawer
        bundle={bundle.data}
        employeeResultUid={detailUid}
        onClose={() => patch({ employeeResultUid: undefined })}
      />
      {printBundle && <PayrollPrintDocument bundle={printBundle} />}
    </Main>
  )
}

function CompactKpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users
  label: string
  value: string
  tone: 'blue' | 'green' | 'violet' | 'amber'
}) {
  const styles = {
    blue: 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20',
    green:
      'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20',
    violet:
      'border-violet-200 bg-violet-50/50 dark:border-violet-900 dark:bg-violet-950/20',
    amber:
      'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20',
  }
  return (
    <div
      className={cn(
        'flex min-h-[68px] items-center justify-between rounded-lg border px-3 py-2.5',
        styles[tone]
      )}
    >
      <div className='min-w-0'>
        <p className='text-xs text-muted-foreground'>{label}</p>
        <p className='truncate text-lg font-bold'>{value}</p>
      </div>
      <Icon className='size-4 text-muted-foreground' />
    </div>
  )
}

function SlipGalleryCard({
  employee,
  document,
  checked,
  onCheck,
  onPreview,
  onPrint,
}: {
  employee: PayslipEmployee
  document: PayrollPayslipBundle['document']
  checked: boolean
  onCheck: () => void
  onPreview: () => void
  onPrint?: () => void
}) {
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-lg border bg-card p-3',
        checked && 'border-primary ring-1 ring-primary/20'
      )}
    >
      <div className='flex items-start gap-3'>
        <Checkbox
          checked={checked}
          onCheckedChange={onCheck}
          aria-label={`Pilih slip ${employee.fullName}`}
          className='mt-1'
        />
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-2'>
            <p className='truncate font-semibold'>{employee.fullName}</p>
            <Badge
              variant={document.official ? 'default' : 'outline'}
              className={
                document.official
                  ? 'bg-emerald-700'
                  : 'border-amber-300 bg-amber-50 text-amber-900'
              }
            >
              {document.official ? 'RESMI' : 'SIMULASI'}
            </Badge>
          </div>
          <p className='text-xs text-muted-foreground'>
            {employee.employeeNumber} · {employee.employeeType}
          </p>
        </div>
      </div>
      <div className='mt-3 rounded-md bg-muted/50 p-3'>
        <p className='text-xs text-muted-foreground'>Neto Payroll</p>
        <p className='text-xl font-bold'>{money(employee.totals.netPay)}</p>
        <p className='mt-1 text-xs text-muted-foreground'>
          {employee.bank.bankName ?? 'Bank belum lengkap'} ·{' '}
          {employee.bank.accountLast4
            ? `•••• ${employee.bank.accountLast4}`
            : 'rekening tersamarkan'}
        </p>
      </div>
      <div className='mt-3 flex gap-2'>
        <Button
          variant='outline'
          size='sm'
          className='flex-1'
          onClick={onPreview}
        >
          <Eye className='mr-2 size-4' />
          Preview
        </Button>
        {onPrint && (
          <Button
            variant='outline'
            size='sm'
            onClick={onPrint}
            aria-label={`Cetak slip ${employee.fullName}`}
          >
            <Printer className='size-4' />
          </Button>
        )}
      </div>
      {document.watermark && (
        <span className='pointer-events-none absolute top-8 -right-5 rotate-12 text-2xl font-black tracking-widest text-amber-600/10'>
          {document.watermark}
        </span>
      )}
    </article>
  )
}

function PayslipDrawer({
  bundle,
  employeeResultUid,
  onClose,
}: {
  bundle?: PayrollPayslipBundle
  employeeResultUid?: string
  onClose: () => void
}) {
  const employee = bundle?.employees.find(
    (item) => item.employeeResultUid === employeeResultUid
  )
  return (
    <Sheet
      open={Boolean(employeeResultUid)}
      onOpenChange={(open) => !open && onClose()}
    >
      <SheetContent className='w-full overflow-y-auto sm:max-w-2xl'>
        <SheetHeader>
          <SheetTitle>Preview Slip Payroll</SheetTitle>
          <SheetDescription>
            {bundle
              ? `${bundle.period.periodName} · ${bundle.period.site.name}`
              : 'Memuat slip...'}
          </SheetDescription>
        </SheetHeader>
        <div className='p-4 pt-2'>
          {bundle && employee ? (
            <Payslip employee={employee} bundle={bundle} preview />
          ) : (
            <Skeleton className='h-[620px] w-full' />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function Payslip({
  employee,
  bundle,
  preview = false,
}: {
  employee: PayslipEmployee
  bundle: PayrollPayslipBundle
  preview?: boolean
}) {
  const earnings = employee.components.filter(
    (item) => item.category === 'EARNING'
  )
  const deductions = employee.components.filter(
    (item) => item.category === 'DEDUCTION'
  )
  const scheme = bundle.period
  const baseAmount =
    scheme.payrollBasis === 'TIME_BASED'
      ? scheme.payFrequency === 'MONTHLY' || scheme.employeeType === 'BULANAN'
        ? (employee.monthly?.proratedBasicSalary ??
          employee.totals.basicSalaryAmount ??
          '0')
        : (employee.weeklyTime?.baseAmount ??
          employee.totals.basicSalaryAmount ??
          '0')
      : employee.totals.pieceRateAmount
  return (
    <article
      className={cn(
        'relative overflow-hidden border-2 border-slate-900 bg-white p-5 text-slate-950',
        preview && 'rounded-lg shadow-sm'
      )}
    >
      <div className='flex items-start justify-between gap-4 border-b border-slate-400 pb-3'>
        {bundle.document.company.logoUrl ? (
          <img
            src={bundle.document.company.logoUrl}
            alt=''
            className='h-12 w-12 object-contain'
          />
        ) : null}
        <div className='flex-1'>
          <p className='text-base font-black uppercase'>
            {bundle.document.company.companyName}
          </p>
          <p className='max-w-xl text-[10px] leading-tight text-slate-600'>
            {bundle.document.company.legalAddress}
          </p>
        </div>
        <div className='text-right'>
          <p className='text-sm font-bold'>SLIP PAYROLL</p>
          <p className='text-[10px]'>{bundle.period.periodCode}</p>
          <p className='text-[9px] font-semibold text-slate-600'>
            {payrollSchemeName(scheme)}
          </p>
        </div>
      </div>
      <div className='grid grid-cols-2 gap-x-6 gap-y-1 py-3 text-xs'>
        <Info label='Karyawan' value={employee.fullName} />
        <Info label='Nomor' value={employee.employeeNumber} />
        <Info
          label='Periode'
          value={`${localDate(bundle.period.periodStart)}–${localDate(bundle.period.periodEnd)}`}
        />
        <Info label='Site' value={bundle.period.site.name} />
        <Info
          label='Jenis / Jabatan'
          value={`${employee.employeeType}${employee.positionName ? ` · ${employee.positionName}` : ''}`}
        />
        <Info
          label='Rekening'
          value={`${employee.bank.bankName ?? '—'} · ${employee.bank.accountLast4 ? `•••• ${employee.bank.accountLast4}` : '—'}`}
        />
      </div>
      <div className='grid grid-cols-2 gap-3 border-y border-slate-300 py-3 text-xs'>
        <AmountSection
          title='Pendapatan'
          rows={[
            { name: employeeBaseLabel(scheme), amount: baseAmount },
            ...earnings.map((item) => ({
              name: item.name,
              amount: item.amount,
            })),
          ]}
        />
        <AmountSection
          title='Potongan'
          rows={deductions.map((item) => ({
            name: item.name,
            amount: item.amount,
          }))}
          empty='Tidak ada potongan'
        />
      </div>
      {scheme.payrollBasis !== 'TIME_BASED' &&
        employee.productionSummary.length > 0 && (
          <div className='mt-3 text-[10px]'>
            <p className='mb-1 font-bold'>Ringkasan hasil produksi</p>
            <div className='flex flex-wrap gap-x-4 gap-y-1'>
              {employee.productionSummary.map((item, index) => (
                <span key={`${item.jobName}-${item.unitName}-${index}`}>
                  {item.jobName}:{' '}
                  <b>
                    {number(item.quantity)} {item.unitName}
                  </b>
                </span>
              ))}
            </div>
          </div>
        )}
      {employee.attendance && (
        <AttendanceSummary employee={employee} scheme={scheme} />
      )}
      <div className='mt-3 flex items-end justify-between border-t-2 border-slate-900 pt-3'>
        <div className='max-w-[60%] text-[9px] text-slate-600'>
          {bundle.document.official
            ? 'Dokumen resmi dari hasil Payroll yang telah ditutup.'
            : 'Preview hasil simulasi. Belum merupakan slip resmi.'}
          <br />
          Status ditutup tidak menyatakan dana sudah dibayar.
        </div>
        <div className='text-right'>
          <p className='text-[10px] font-semibold'>Neto Payroll</p>
          <p className='text-xl font-black'>{money(employee.totals.netPay)}</p>
        </div>
      </div>
      {bundle.document.watermark && (
        <div className='pointer-events-none absolute inset-0 flex rotate-[-25deg] items-center justify-center text-7xl font-black tracking-[0.18em] text-red-600/10'>
          {bundle.document.watermark}
        </div>
      )}
    </article>
  )
}

function AttendanceSummary({
  employee,
  scheme,
}: {
  employee: PayslipEmployee
  scheme: PayrollPayslipBundle['period']
}) {
  if (!employee.attendance) return null
  if (scheme.payrollBasis !== 'TIME_BASED') {
    return (
      <div className='mt-3 rounded border border-slate-300 px-2 py-1.5 text-[9px] text-slate-700'>
        <b>Informasi Attendance:</b> {employee.attendance.presentDays} hadir ·{' '}
        {employee.attendance.absentDays} alpha ·{' '}
        {employee.attendance.leaveDays +
          employee.attendance.sickDays +
          employee.attendance.permissionDays}{' '}
        izin/cuti/sakit. Informasi ini bukan pengali otomatis upah borongan.
      </div>
    )
  }
  if (scheme.payFrequency === 'MONTHLY' || scheme.employeeType === 'BULANAN') {
    const monthly = employee.monthly
    return (
      <div className='mt-3 rounded border border-slate-300 px-2 py-1.5 text-[9px] text-slate-700'>
        <b>Ringkasan bulanan:</b>{' '}
        {monthly
          ? `${monthly.eligibleCalendarDays}/${monthly.periodCalendarDays} hari kalender eligible · ${monthly.alphaDays} alpha · ${monthly.permissionDays} izin`
          : `${employee.attendance.presentDays} hadir · ${employee.attendance.absentDays} alpha · ${employee.attendance.permissionDays} izin`}
        .
      </div>
    )
  }
  return (
    <div className='mt-3 rounded border border-slate-300 px-2 py-1.5 text-[9px] text-slate-700'>
      <b>Ringkasan upah harian:</b>{' '}
      {employee.weeklyTime?.payableDays ?? employee.attendance.presentDays} hari
      hadir dibayar
      {employee.weeklyTime?.rateBreakdown.length
        ? ` · ${employee.weeklyTime.rateBreakdown
            .map(
              (item) =>
                `${money(item.dailyRate)} × ${item.payableDays} hari = ${money(item.amount)}`
            )
            .join(' · ')}`
        : ''}
      {employee.weeklyTime?.offdayPresentDays
        ? ` · ${employee.weeklyTime.offdayPresentDays} hadir hari nonkerja tidak dibayar`
        : ''}
      .
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className='text-slate-500'>{label}: </span>
      <b>{value}</b>
    </div>
  )
}
function AmountSection({
  title,
  rows,
  empty,
}: {
  title: string
  rows: Array<{ name: string; amount: string }>
  empty?: string
}) {
  return (
    <div>
      <p className='mb-1 font-bold'>{title}</p>
      {rows.length ? (
        rows.map((row, index) => (
          <div
            key={`${row.name}-${index}`}
            className='flex justify-between gap-2'
          >
            <span>{row.name}</span>
            <b>{money(row.amount)}</b>
          </div>
        ))
      ) : (
        <p className='text-slate-500'>{empty}</p>
      )}
    </div>
  )
}

export function PayrollPrintDocument({
  bundle,
}: {
  bundle: PayrollPayslipBundle
}) {
  const sheets: PayslipEmployee[][] = []
  for (let index = 0; index < bundle.employees.length; index += 2)
    sheets.push(bundle.employees.slice(index, index + 2))
  return (
    <div
      id='payroll-print-root'
      className='fixed inset-0 z-[9999] hidden bg-white print:block'
    >
      <style>{`@page{size:A4 portrait;margin:8mm}@media print{body *{visibility:hidden!important}#payroll-print-root,#payroll-print-root *{visibility:visible!important}#payroll-print-root{position:absolute!important;inset:0!important;display:block!important}.payroll-print-sheet{break-after:page;display:grid;height:281mm;grid-template-rows:1fr 1fr;gap:5mm}.payroll-print-sheet:last-child{break-after:auto}.payroll-print-slip{height:138mm;overflow:hidden}}`}</style>
      {sheets.map((sheet, sheetIndex) => (
        <div key={sheetIndex} className='payroll-print-sheet'>
          {sheet.map((employee) => (
            <div
              key={employee.employeeResultUid}
              className='payroll-print-slip'
            >
              <Payslip employee={employee} bundle={bundle} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function Empty({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof FileText
  title: string
  text: string
}) {
  return (
    <div className='rounded-lg border border-dashed px-4 py-12 text-center'>
      <Icon className='mx-auto size-8 text-muted-foreground' />
      <p className='mt-3 font-medium'>{title}</p>
      <p className='text-sm text-muted-foreground'>{text}</p>
    </div>
  )
}
function ErrorState({ retry }: { retry: () => void }) {
  return (
    <div className='rounded-lg border border-dashed px-4 py-12 text-center'>
      <AlertCircle className='mx-auto size-8 text-destructive' />
      <p className='mt-3 font-medium'>Slip Payroll gagal dimuat</p>
      <Button variant='outline' size='sm' className='mt-3' onClick={retry}>
        Coba lagi
      </Button>
    </div>
  )
}
