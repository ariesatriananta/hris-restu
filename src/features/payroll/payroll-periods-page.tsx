import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
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
import { hasPermission } from '@/features/auth/permissions'
import {
  useCancelPayrollPeriod,
  useCreatePayrollPeriod,
  usePayrollPeriod,
  usePayrollPeriodMeta,
  usePayrollPeriods,
} from './data/queries'
import type {
  PayrollPeriodStatus,
  PayrollPeriodSummary,
  PayrollPeriodsResult,
  PayrollReadinessStatus,
} from './domain'
import { validatePayrollPeriodDraft } from './period-validation'

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
  const params = {
    page: typeof search.page === 'number' ? search.page : 1,
    pageSize: typeof search.pageSize === 'number' ? search.pageSize : 50,
    query: typeof search.filter === 'string' ? search.filter : undefined,
    site: Array.isArray(search.site) ? search.site : undefined,
    status: Array.isArray(search.status) ? search.status : undefined,
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
            <p className='text-sm font-medium text-primary'>Payroll Borongan</p>
            <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
              Periode Payroll
            </h1>
            <p className='max-w-3xl text-sm text-muted-foreground'>
              Siapkan periode per site dan periksa kesiapan Attendance serta
              Produksi sebelum dihitung.
            </p>
          </div>
          {canCalculate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Buat periode
            </Button>
          )}
        </header>

        <Alert className='border-sky-500/40 bg-sky-500/5'>
          <CircleDollarSign className='text-sky-700' />
          <AlertTitle>Belum menghitung gaji</AlertTitle>
          <AlertDescription>
            Periode Draft hanya memeriksa kesiapan data. Attendance dan Produksi
            belum dikunci sampai proses perhitungan dimulai.
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
        maxDays={meta.data?.maxPeriodDays ?? 31}
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
              {row.original.periodCode}
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
              {row.original.readiness.blockerCount} blocker
            </p>
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <div className='text-right'>Aksi</div>,
        cell: ({ row }) => (
          <div className='text-right'>
            <DataTableActionButton
              label={`Lihat detail ${row.original.periodName}`}
              onClick={() => onDetail(row.original.uid)}
            >
              <Eye className='size-4' />
            </DataTableActionButton>
          </div>
        ),
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
                      ? 'w-16'
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
                    {item.site.name} · {item.periodCode}
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
      variant={
        status === 'CANCELLED'
          ? 'destructive'
          : status === 'CLOSED'
            ? 'default'
            : 'secondary'
      }
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
  maxDays,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sites: Array<{ uid: string; name: string }>
  maxDays: number
}) {
  const mutation = useCreatePayrollPeriod()
  const [siteUid, setSiteUid] = useState('')
  const [start, setStart] = useState<Date>()
  const [end, setEnd] = useState<Date>()
  const [payment, setPayment] = useState<Date>()
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const days = start && end ? differenceInCalendarDays(end, start) + 1 : 0
  const validationError = validatePayrollPeriodDraft({
    siteUid,
    start,
    end,
    payment,
    maxDays,
  })
  const invalid = Boolean(validationError)

  const close = (next: boolean) => {
    if (mutation.isPending) return
    onOpenChange(next)
    if (!next) {
      setSiteUid('')
      setStart(undefined)
      setEnd(undefined)
      setPayment(undefined)
      setName('')
      setNotes('')
    }
  }
  const submit = async () => {
    if (invalid || !start || !end) return
    try {
      await mutation.mutateAsync({
        siteUid,
        periodStart: inputDate(start)!,
        periodEnd: inputDate(end)!,
        paymentDate: inputDate(payment) ?? null,
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
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Buat Periode Payroll</DialogTitle>
          <DialogDescription>
            Periode baru disimpan sebagai Draft dan belum mengunci data sumber.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2 sm:col-span-2'>
            <Label htmlFor='payroll-site'>Site</Label>
            <Select value={siteUid} onValueChange={setSiteUid}>
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
          <div className='space-y-2'>
            <Label>Tanggal mulai</Label>
            <DatePicker
              selected={start}
              onSelect={(date) => {
                setStart(date)
                if (end && date && end < date) setEnd(undefined)
              }}
            />
          </div>
          <div className='space-y-2'>
            <Label>Tanggal akhir</Label>
            <DatePicker
              selected={end}
              onSelect={setEnd}
              disabledDates={(date) =>
                Boolean(
                  start &&
                  (date < start ||
                    differenceInCalendarDays(date, start) >= maxDays)
                )
              }
            />
          </div>
          <div className='space-y-2'>
            <Label>Tanggal pembayaran (opsional)</Label>
            <DatePicker
              selected={payment}
              onSelect={setPayment}
              disabledDates={(date) => Boolean(end && date < end)}
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
        {start && end && (
          <p
            className={cn(
              'text-xs',
              days > maxDays ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {days} hari kalender · maksimal {maxDays} hari.
          </p>
        )}
        {validationError && siteUid && start && end && (
          <p className='text-xs text-destructive'>{validationError}</p>
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

function PeriodDetailSheet({
  uid,
  open,
  onOpenChange,
  canCalculate,
}: {
  uid?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  canCalculate: boolean
}) {
  const detail = usePayrollPeriod(uid)
  const [cancelOpen, setCancelOpen] = useState(false)
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
              </div>
              <div className='grid grid-cols-2 gap-2'>
                <Metric
                  label='Populasi'
                  value={detail.data.readiness.populationCount}
                  icon={Users}
                />
                <Metric
                  label='Dari Produksi'
                  value={detail.data.readiness.productionEmployeeCount}
                  icon={CircleDollarSign}
                />
              </div>
              <section className='space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                  <h3 className='font-semibold'>Kesiapan periode</h3>
                  <ReadinessBadge status={detail.data.readiness.status} />
                </div>
                <IssueGroup
                  title='Blocker'
                  items={detail.data.readiness.blockers}
                  tone='danger'
                  empty='Tidak ada blocker.'
                />
                <IssueGroup
                  title='Perlu perhatian'
                  items={detail.data.readiness.warnings}
                  tone='warning'
                  empty='Tidak ada peringatan.'
                />
              </section>
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
              {canCalculate && detail.data.status === 'DRAFT' && (
                <Button
                  variant='destructive'
                  className='w-full'
                  onClick={() => setCancelOpen(true)}
                >
                  <Ban /> Batalkan periode
                </Button>
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
    </>
  )
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
function Fact({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='font-semibold'>{value.toLocaleString('id-ID')}</dd>
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
      <DialogContent>
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
