import { useMemo, useState, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  Banknote,
  Ban,
  Boxes,
  CalendarPlus,
  Eye,
  FileClock,
  History,
  Loader2,
  LockKeyhole,
  PackageCheck,
  PencilLine,
  RefreshCcw,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DataTableActionButton,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import {
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import { hasPermission } from '@/features/auth/permissions'
import {
  useCreateHistoricalProduction,
  useCorrectProductionTransaction,
  usePreviewHistoricalProduction,
  usePreviewProductionCorrection,
  usePreviewProductionVoid,
  useProductionCorrectionContext,
  useProductionJobs,
  useProductionTransaction,
  useProductionTransactions,
  useVoidProductionTransaction,
} from './data/queries'
import {
  canOfferProductionRevision,
  productionEntrySourceLabel,
  type ProductionCorrectionPreview,
  type ProductionEligibleEmployee,
  type ProductionSite,
  type ProductionTransaction,
  type ProductionTransactionRevision,
  type ProductionTransactionResult,
} from './domain'
import { ProductionEmployeePicker } from './production-employee-picker'
import {
  formatProductionQuantityInput,
  normalizeProductionQuantity,
  validateProductionQuantity,
} from './production-terminal-policy'

const allProductionSites: ProductionSite[] = ['JEPARA', 'SEMARANG', 'KLATEN']

export function ProductionTransactionsPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const session = useAuthStore((state) => state.session)
  const dateFrom = stringValue(search.dateFrom) ?? today()
  const dateTo = stringValue(search.dateTo) ?? today()
  const result = useProductionTransactions({
    dateFrom,
    dateTo,
    query: stringValue(search.filter),
    site: arrayValue(search.site),
    jobUid: arrayValue(search.jobUid),
    status: arrayValue(search.status),
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  })
  const jobs = useProductionJobs()
  const [detailUid, setDetailUid] = useState<string>()
  const canCorrect = hasPermission(session, 'production.correct')
  const hasGlobalSiteAccess =
    session?.user.role === 'SUPER_ADMIN' || session?.user.role === 'DIRECTOR'
  const accessibleSites = hasGlobalSiteAccess
    ? allProductionSites
    : (session?.user.siteAccess ?? [])
  const siteOptions = accessibleSites.map((site) => ({
    value: site,
    label: siteLabel(site),
  }))

  const setDate = (key: 'dateFrom' | 'dateTo', value: string) => {
    const other = key === 'dateFrom' ? dateTo : dateFrom
    const patch: Record<string, unknown> = {
      [key]: value === today() ? undefined : value,
      page: undefined,
    }
    if (key === 'dateFrom' && value > other) patch.dateTo = value
    if (key === 'dateTo' && value < other) patch.dateFrom = value
    navigate({ search: (previous) => ({ ...previous, ...patch }) })
  }

  return (
    <Main>
      <div className='mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Produksi Borongan</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Transaksi Produksi
          </h1>
          <p className='text-sm text-muted-foreground'>
            Pantau setoran yang sudah tercatat beserta snapshot pekerjaan,
            tarif, dan nilai brutonya.
          </p>
        </div>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-end'>
          <div className='grid gap-2 sm:grid-cols-2'>
            <DateControl
              label='Dari tanggal'
              value={dateFrom}
              onChange={(value) => setDate('dateFrom', value)}
            />
            <DateControl
              label='Sampai tanggal'
              value={dateTo}
              onChange={(value) => setDate('dateTo', value)}
            />
          </div>
          {canCorrect && <HistoricalProductionDialog sites={accessibleSites} />}
        </div>
      </div>

      <TransactionSummary data={result.data} />

      <div className='mt-5'>
        <TransactionTable
          data={result.data}
          search={search}
          navigate={navigate}
          siteOptions={siteOptions}
          jobOptions={(jobs.data?.items ?? []).map((job) => ({
            value: job.uid,
            label: job.name,
          }))}
          isPending={result.isPending}
          isFetching={result.isFetching}
          isError={result.isError}
          onRetry={() => void result.refetch()}
          onOpenDetail={(item) => setDetailUid(item.uid)}
        />
      </div>

      <TransactionDetailSheet
        uid={detailUid}
        open={Boolean(detailUid)}
        onOpenChange={(open) => !open && setDetailUid(undefined)}
        onOpenTransaction={setDetailUid}
      />
    </Main>
  )
}

function HistoricalProductionDialog({ sites }: { sites: ProductionSite[] }) {
  const [open, setOpen] = useState(false)
  const [site, setSite] = useState<ProductionSite>(sites[0] ?? 'JEPARA')
  const [businessDate, setBusinessDate] = useState(today())
  const [employee, setEmployee] = useState<ProductionEligibleEmployee>()
  const [jobUid, setJobUid] = useState('')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey)
  const preview = usePreviewHistoricalProduction()
  const create = useCreateHistoricalProduction()
  const selectedAssignment = employee?.assignments.find(
    (assignment) => assignment.jobUid === jobUid
  )
  const quantityError = selectedAssignment
    ? validateProductionQuantity(
        quantity,
        selectedAssignment.unit.decimalPrecision
      )
    : 'Pilih pekerjaan terlebih dahulu.'
  const canPreview = Boolean(
    employee && jobUid && businessDate && quantity && !quantityError
  )
  const canSubmit = preview.data?.canApply === true && reason.trim().length >= 5

  const resetProposal = () => {
    preview.reset()
    setIdempotencyKey(createIdempotencyKey())
  }
  const resetEmployee = () => {
    setEmployee(undefined)
    setJobUid('')
    resetProposal()
  }
  const handleOpen = (next: boolean) => {
    setOpen(next)
    if (!next) return
    setSite(sites[0] ?? 'JEPARA')
    setBusinessDate(today())
    setEmployee(undefined)
    setJobUid('')
    setQuantity('')
    setReason('')
    setIdempotencyKey(createIdempotencyKey())
    preview.reset()
  }
  const proposal = {
    employeeUid: employee?.uid ?? '',
    site,
    businessDate,
    jobUid,
    quantity: normalizeProductionQuantity(quantity),
  }
  const submit = async () => {
    if (!canSubmit) return
    try {
      const output = await create.mutateAsync({
        ...proposal,
        reason: reason.trim(),
        idempotencyKey,
      })
      toast.success(output.message || 'Setoran susulan berhasil dicatat.')
      setOpen(false)
    } catch (error) {
      toast.error(apiMessage(error, 'Setoran susulan gagal dicatat.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button className='h-9 whitespace-nowrap'>
          <CalendarPlus /> Setoran Susulan
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Catat Setoran Susulan</DialogTitle>
          <DialogDescription>
            Gunakan hanya untuk hasil kerja yang terlewat dicatat. Sistem tetap
            memeriksa Attendance, penugasan, tarif, dan kunci Payroll pada
            tanggal tersebut.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 sm:grid-cols-2'>
          <label className='grid gap-1.5 text-sm'>
            <span className='font-medium'>Site</span>
            <Select
              value={site}
              onValueChange={(value: ProductionSite) => {
                setSite(value)
                resetEmployee()
              }}
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sites.map((item) => (
                  <SelectItem key={item} value={item}>
                    {siteLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className='grid gap-1.5 text-sm'>
            <span className='font-medium'>Tanggal hasil kerja</span>
            <DatePicker
              selected={dateOnlyFromInput(businessDate)}
              onSelect={(date) => {
                setBusinessDate(dateOnlyToInput(date))
                resetEmployee()
              }}
              placeholder='Pilih tanggal'
              fromYear={2020}
              toYear={new Date().getFullYear()}
              triggerClassName='w-full'
            />
          </label>
          <label className='grid gap-1.5 text-sm sm:col-span-2'>
            <span className='font-medium'>Karyawan</span>
            <ProductionEmployeePicker
              site={site}
              asOf={businessDate}
              value={employee?.uid ?? ''}
              selected={employee}
              onChange={(item) => {
                setEmployee(item)
                const primary = item.assignments.find(
                  (assignment) => assignment.isPrimary
                )
                setJobUid(primary?.jobUid ?? item.assignments[0]?.jobUid ?? '')
                resetProposal()
              }}
            />
          </label>
          <label className='grid gap-1.5 text-sm'>
            <span className='font-medium'>Pekerjaan</span>
            <Select
              value={jobUid}
              onValueChange={(value) => {
                setJobUid(value)
                resetProposal()
              }}
              disabled={!employee}
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Pilih pekerjaan' />
              </SelectTrigger>
              <SelectContent>
                {(employee?.assignments ?? []).map((assignment) => (
                  <SelectItem key={assignment.uid} value={assignment.jobUid}>
                    {assignment.jobName} ({assignment.jobCode})
                    {assignment.isPrimary ? ' · Utama' : ' · Tambahan'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className='grid gap-1.5 text-sm'>
            <span className='font-medium'>Kuantitas hasil</span>
            <Input
              inputMode='decimal'
              value={quantity}
              onChange={(event) => {
                setQuantity(event.target.value)
                resetProposal()
              }}
              placeholder='Contoh: 25'
              aria-invalid={Boolean(quantity && quantityError)}
            />
            {quantity && quantityError && (
              <span className='text-xs text-destructive'>{quantityError}</span>
            )}
          </label>
        </div>
        <Button
          type='button'
          variant='secondary'
          className='w-fit'
          disabled={!canPreview || preview.isPending}
          onClick={() =>
            preview.mutate(proposal, {
              onError: (error) =>
                toast.error(apiMessage(error, 'Preview setoran gagal dibuat.')),
            })
          }
        >
          {preview.isPending && <Loader2 className='animate-spin' />}
          Preview setoran
        </Button>
        {preview.data && (
          <section className='rounded-lg border bg-muted/30 p-3 text-sm'>
            <div className='mb-3 flex items-center justify-between gap-2'>
              <div>
                <p className='font-semibold'>Hasil verifikasi</p>
                <p className='text-xs text-muted-foreground'>
                  {preview.data.employee.fullName} ·{' '}
                  {formatLongDate(preview.data.businessDate)}
                </p>
              </div>
              <Badge
                variant={preview.data.canApply ? 'secondary' : 'destructive'}
              >
                {preview.data.canApply ? 'Siap dicatat' : 'Tidak dapat dicatat'}
              </Badge>
            </div>
            <div className='grid gap-2 sm:grid-cols-3'>
              <PreviewMetric
                label='Pekerjaan'
                value={preview.data.proposed.job.name}
              />
              <PreviewMetric
                label='Kuantitas'
                value={`${formatNumber(preview.data.proposed.quantity, preview.data.proposed.unit.decimalPrecision)} ${preview.data.proposed.unit.code}`}
              />
              <PreviewMetric
                label='Estimasi bruto'
                value={formatCurrency(preview.data.proposed.grossAmount)}
              />
            </div>
            {preview.data.payrollLock.locked && (
              <div className='mt-3'>
                <LockedPanel reasons={preview.data.payrollLock.reasons} />
              </div>
            )}
          </section>
        )}
        <label className='grid gap-1.5 text-sm'>
          <span className='font-medium'>Alasan setoran susulan</span>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder='Jelaskan mengapa setoran tidak tercatat melalui terminal.'
            maxLength={500}
            disabled={!preview.data?.canApply}
          />
          <span className='text-xs text-muted-foreground'>
            Minimal 5 karakter untuk histori audit.
          </span>
        </label>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            disabled={!canSubmit || create.isPending}
            onClick={() => void submit()}
          >
            {create.isPending && <Loader2 className='animate-spin' />}
            Catat Setoran
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TransactionSummary({ data }: { data?: ProductionTransactionResult }) {
  const quantityTotals = data?.summary.quantityTotals ?? []
  const items = [
    {
      label: 'Transaksi',
      value: formatNumber(data?.summary.transactionCount ?? 0),
      icon: FileClock,
      description: 'Jumlah transaksi pada tanggal dan filter yang dipilih.',
      tone: 'border-slate-500/20 bg-slate-500/[0.04]',
    },
    {
      label: 'Pekerja',
      value: formatNumber(data?.summary.employeeCount ?? 0),
      icon: Users,
      description: 'Jumlah pekerja unik yang memiliki transaksi terfilter.',
      tone: 'border-sky-500/20 bg-sky-500/[0.05]',
    },
    {
      label: 'Hasil per Satuan',
      value: quantityTotals.length
        ? quantityTotals
            .map(
              (item) =>
                `${formatNumber(item.quantity, item.unit.decimalPrecision)} ${item.unit.code}`
            )
            .join(' · ')
        : '-',
      icon: Boxes,
      description:
        'Akumulasi hasil dipisahkan per satuan agar PCS, KG, BOX, dan satuan lain tidak tercampur.',
      tone: 'border-emerald-500/20 bg-emerald-500/[0.05]',
    },
    {
      label: 'Nilai Bruto',
      value: formatCurrency(data?.summary.totalGrossAmount ?? 0),
      icon: Banknote,
      description:
        'Jumlah nilai bruto berdasarkan tarif yang disnapshot saat setoran dicatat.',
      tone: 'border-amber-500/20 bg-amber-500/[0.05]',
    },
  ]
  return (
    <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
      {items.map(({ label, value, icon: Icon, description, tone }) => (
        <Tooltip key={label}>
          <TooltipTrigger asChild>
            <section
              tabIndex={0}
              className={`min-h-[68px] rounded-lg border px-3 py-2.5 focus-visible:ring-2 focus-visible:ring-ring ${tone}`}
            >
              <div className='flex items-start justify-between gap-2'>
                <div className='min-w-0'>
                  <p className='text-xs text-muted-foreground'>{label}</p>
                  <p className='truncate text-lg font-bold'>{value}</p>
                </div>
                <Icon className='size-4 text-primary' />
              </div>
            </section>
          </TooltipTrigger>
          <TooltipContent className='max-w-72'>{description}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

function TransactionTable({
  data,
  search,
  navigate,
  siteOptions,
  jobOptions,
  isPending,
  isFetching,
  isError,
  onRetry,
  onOpenDetail,
}: {
  data?: ProductionTransactionResult
  search: Record<string, unknown>
  navigate: NavigateFn
  siteOptions: Array<{ value: string; label: string }>
  jobOptions: Array<{ value: string; label: string }>
  isPending: boolean
  isFetching: boolean
  isError: boolean
  onRetry: () => void
  onOpenDetail: (item: ProductionTransaction) => void
}) {
  const columns = useMemo<ColumnDef<ProductionTransaction>[]>(
    () => [
      {
        id: 'employee',
        header: 'Karyawan',
        cell: ({ row }) => (
          <div className='min-w-0'>
            <p
              className='truncate font-medium'
              title={row.original.employee.fullName}
            >
              {row.original.employee.fullName}
            </p>
            <p className='truncate text-xs text-muted-foreground'>
              {siteLabel(row.original.site)} ·{' '}
              {row.original.employee.employeeNumber}
            </p>
          </div>
        ),
        size: 220,
      },
      {
        id: 'site',
        accessorFn: (row) => row.site,
        header: 'Site',
        enableHiding: false,
      },
      {
        id: 'jobUid',
        accessorFn: (row) => row.job.uid,
        header: 'Pekerjaan',
        cell: ({ row }) => (
          <div className='min-w-0'>
            <p className='truncate font-medium'>{row.original.job.name}</p>
            <p className='truncate text-xs text-muted-foreground'>
              {row.original.job.code}
            </p>
          </div>
        ),
        size: 180,
      },
      {
        id: 'result',
        header: 'Hasil & Tarif',
        cell: ({ row }) => (
          <div className='min-w-0'>
            <p className='font-medium'>
              {formatNumber(
                row.original.quantity,
                row.original.unit.decimalPrecision
              )}{' '}
              {row.original.unit.code}
            </p>
            <p className='truncate text-xs text-muted-foreground'>
              {formatCurrency(row.original.rateSnapshot)} /{' '}
              {row.original.unit.code}
            </p>
          </div>
        ),
        size: 155,
      },
      {
        id: 'amount',
        header: 'Nilai Bruto',
        cell: ({ row }) => (
          <p className='truncate font-semibold'>
            {formatCurrency(row.original.grossAmount)}
          </p>
        ),
        size: 145,
      },
      {
        id: 'status',
        accessorFn: (row) => row.status,
        header: 'Status',
        cell: ({ row }) => <TransactionStatus value={row.original.status} />,
        size: 88,
      },
      {
        id: 'time',
        header: 'Waktu',
        cell: ({ row }) => (
          <div className='min-w-0 text-sm'>
            <p>{formatShortDate(row.original.businessDate)}</p>
            <p className='text-xs text-muted-foreground'>
              {formatTime(row.original.transactionAt)}
            </p>
            {row.original.entrySource &&
              row.original.entrySource !== 'TERMINAL' && (
                <p className='text-[11px] font-medium text-primary'>
                  {productionEntrySourceLabel(row.original.entrySource)}
                </p>
              )}
          </div>
        ),
        size: 105,
      },
      {
        id: 'actions',
        header: () => <div className='text-right'>Aksi</div>,
        cell: ({ row }) => (
          <div className='text-right'>
            <DataTableActionButton
              label={`Lihat detail ${row.original.transactionNumber}`}
              onClick={() => onOpenDetail(row.original)}
            >
              <Eye className='size-4' />
            </DataTableActionButton>
          </div>
        ),
        size: 56,
        enableHiding: false,
      },
    ],
    [onOpenDetail]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'jobUid', searchKey: 'jobUid', type: 'array' },
      { columnId: 'status', searchKey: 'status', type: 'array' },
    ],
  })
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    state: {
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
    },
    initialState: { columnVisibility: { site: false } },
    pageCount: Math.max(
      1,
      Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 50))
    ),
    manualPagination: true,
    manualFiltering: true,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className='space-y-3'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari nomor transaksi, nama, atau nomor karyawan...'
        searchDebounceMs={400}
        filters={[
          { columnId: 'site', title: 'Site', options: siteOptions },
          { columnId: 'jobUid', title: 'Pekerjaan', options: jobOptions },
          {
            columnId: 'status',
            title: 'Status',
            options: [
              { value: 'POSTED', label: 'Tercatat' },
              { value: 'VOID', label: 'Dibatalkan' },
            ],
          },
        ]}
      />
      {isFetching && !isPending && (
        <p className='text-xs text-muted-foreground'>
          Memperbarui transaksi...
        </p>
      )}
      {isPending ? (
        <div className='h-44 animate-pulse rounded-md bg-muted' />
      ) : isError ? (
        <div className='rounded-md border py-10 text-center'>
          <p>Transaksi Produksi gagal dimuat.</p>
          <Button variant='outline' className='mt-3' onClick={onRetry}>
            <RefreshCcw /> Coba lagi
          </Button>
        </div>
      ) : !data?.items.length ? (
        <div className='rounded-md border py-10 text-center text-muted-foreground'>
          <PackageCheck className='mx-auto mb-2' />
          Tidak ada transaksi pada tanggal dan filter yang dipilih.
        </div>
      ) : (
        <>
          <div className='hidden rounded-md border xl:block'>
            <Table className='table-fixed'>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className='whitespace-normal'>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className='grid gap-2 xl:hidden'>
            {data.items.map((item) => (
              <MobileTransaction
                key={item.uid}
                item={item}
                onOpen={() => onOpenDetail(item)}
              />
            ))}
          </div>
          <DataTablePagination
            table={table}
            summary={paginationSummary(data.page, data.pageSize, data.total)}
          />
        </>
      )}
    </div>
  )
}

function MobileTransaction({
  item,
  onOpen,
}: {
  item: ProductionTransaction
  onOpen: () => void
}) {
  return (
    <article className='space-y-3 rounded-lg border p-3'>
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0'>
          <p className='truncate font-medium'>{item.employee.fullName}</p>
          <p className='truncate text-xs text-muted-foreground'>
            {siteLabel(item.site)} · {item.employee.employeeNumber}
          </p>
        </div>
        <div className='flex flex-col items-end gap-1'>
          <TransactionStatus value={item.status} />
          {item.entrySource && item.entrySource !== 'TERMINAL' && (
            <span className='text-[11px] font-medium text-primary'>
              {productionEntrySourceLabel(item.entrySource)}
            </span>
          )}
        </div>
      </div>
      <div className='grid grid-cols-2 gap-3 text-sm'>
        <div className='min-w-0'>
          <p className='text-xs text-muted-foreground'>Pekerjaan</p>
          <p className='truncate'>{item.job.name}</p>
        </div>
        <div>
          <p className='text-xs text-muted-foreground'>Hasil</p>
          <p>
            {formatNumber(item.quantity, item.unit.decimalPrecision)}{' '}
            {item.unit.code}
          </p>
        </div>
        <div>
          <p className='text-xs text-muted-foreground'>Nilai bruto</p>
          <p className='font-semibold'>{formatCurrency(item.grossAmount)}</p>
        </div>
        <div>
          <p className='text-xs text-muted-foreground'>Waktu</p>
          <p>
            {formatShortDate(item.businessDate)} ·{' '}
            {formatTime(item.transactionAt)}
          </p>
        </div>
      </div>
      <Button variant='outline' className='w-full' onClick={onOpen}>
        <Eye /> Lihat detail
      </Button>
    </article>
  )
}

function TransactionDetailSheet({
  uid,
  open,
  onOpenChange,
  onOpenTransaction,
}: {
  uid?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenTransaction: (uid: string) => void
}) {
  const result = useProductionTransaction(uid)
  const session = useAuthStore((state) => state.session)
  const item = result.data
  const mayRevise = hasPermission(session, 'production.correct')
  const canCorrect = item
    ? canOfferProductionRevision(item, mayRevise, item.canCorrect !== false)
    : false
  const canVoid = item
    ? canOfferProductionRevision(item, mayRevise, item.canVoid !== false)
    : false
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>Detail Transaksi Produksi</SheetTitle>
          <SheetDescription>
            Snapshot transaksi saat setoran dicatat.
          </SheetDescription>
        </SheetHeader>
        <div className='px-4 pb-6'>
          {result.isPending ? (
            <div className='h-40 animate-pulse rounded-lg bg-muted' />
          ) : result.isError || !item ? (
            <div className='rounded-lg border py-8 text-center'>
              <p className='text-sm text-muted-foreground'>
                Detail transaksi gagal dimuat.
              </p>
              <Button
                size='sm'
                variant='outline'
                className='mt-3'
                onClick={() => void result.refetch()}
              >
                <RefreshCcw /> Coba lagi
              </Button>
            </div>
          ) : (
            <div className='space-y-4'>
              <div className='rounded-lg border bg-muted/30 p-4'>
                <div className='flex items-start justify-between gap-2'>
                  <div>
                    <p className='text-xs text-muted-foreground'>
                      Nomor transaksi
                    </p>
                    <p className='font-semibold'>{item.transactionNumber}</p>
                  </div>
                  <TransactionStatus value={item.status} />
                </div>
              </div>
              {item.payrollLocked && (
                <div className='flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm'>
                  <LockKeyhole className='mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400' />
                  <div>
                    <p className='font-semibold'>Terkunci oleh Payroll</p>
                    <p className='mt-0.5 text-muted-foreground'>
                      Transaksi tidak dapat dikoreksi atau dibatalkan sebelum
                      proses Payroll terkait dibatalkan.
                    </p>
                    {!!item.payrollLockReasons?.length && (
                      <ul className='mt-2 list-inside list-disc text-xs text-muted-foreground'>
                        {item.payrollLockReasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
              {item.status === 'VOID' && (
                <div className='rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm'>
                  <p className='font-semibold text-destructive'>
                    Transaksi telah dibatalkan
                  </p>
                  <p className='mt-1 text-muted-foreground'>
                    {item.voidReason || 'Alasan pembatalan tidak tersedia.'}
                  </p>
                  {item.voidedAt && (
                    <p className='mt-2 text-xs text-muted-foreground'>
                      {formatDateTime(item.voidedAt)}
                      {item.voidedBy?.name ? ` · ${item.voidedBy.name}` : ''}
                    </p>
                  )}
                </div>
              )}
              <DetailGroup
                title='Karyawan'
                rows={[
                  ['Nama', item.employee.fullName],
                  ['Nomor', item.employee.employeeNumber],
                  ['Site', siteLabel(item.site)],
                ]}
              />
              <DetailGroup
                title='Hasil Produksi'
                rows={[
                  ['Pekerjaan', `${item.job.name} (${item.job.code})`],
                  [
                    'Kuantitas',
                    `${formatNumber(item.quantity, item.unit.decimalPrecision)} ${item.unit.code}`,
                  ],
                  ['Tarif snapshot', formatCurrency(item.rateSnapshot)],
                  ['Nilai bruto', formatCurrency(item.grossAmount)],
                ]}
              />
              <DetailGroup
                title='Pencatatan'
                rows={[
                  ['Tanggal kerja', formatLongDate(item.businessDate)],
                  ['Waktu transaksi', formatDateTime(item.transactionAt)],
                  ['Sumber', productionEntrySourceLabel(item.entrySource)],
                  [
                    'Perangkat',
                    item.device
                      ? `${item.device.name} (${item.device.code})`
                      : item.entrySource === 'HISTORICAL' ||
                          item.entrySource === 'CORRECTION'
                        ? 'Tidak menggunakan terminal'
                        : 'Tidak tersedia',
                  ],
                ]}
              />
              {(item.replacedTransaction || item.replacementTransaction) && (
                <section>
                  <h3 className='mb-2 text-sm font-semibold'>
                    Hubungan Transaksi
                  </h3>
                  <div className='space-y-2 rounded-lg border p-3 text-sm'>
                    {item.replacedTransaction && (
                      <TransactionLink
                        label='Mengoreksi transaksi'
                        transaction={item.replacedTransaction}
                        onOpen={onOpenTransaction}
                      />
                    )}
                    {item.replacementTransaction && (
                      <TransactionLink
                        label='Digantikan oleh'
                        transaction={item.replacementTransaction}
                        onOpen={onOpenTransaction}
                      />
                    )}
                  </div>
                </section>
              )}
              <RevisionTimeline revisions={item.revisions ?? []} />
              {(canCorrect || canVoid) && (
                <div className='sticky bottom-0 grid gap-2 border-t bg-background/95 py-3 backdrop-blur sm:grid-cols-2'>
                  {canCorrect && (
                    <CorrectionDialog transaction={item}>
                      <Button variant='outline' className='w-full'>
                        <PencilLine /> Koreksi
                      </Button>
                    </CorrectionDialog>
                  )}
                  {canVoid && (
                    <VoidDialog transaction={item}>
                      <Button variant='destructive' className='w-full'>
                        <Ban /> Batalkan
                      </Button>
                    </VoidDialog>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function TransactionLink({
  label,
  transaction,
  onOpen,
}: {
  label: string
  transaction: { uid: string; transactionNumber: string; status?: string }
  onOpen: (uid: string) => void
}) {
  return (
    <div className='flex items-center justify-between gap-3'>
      <div className='min-w-0'>
        <p className='text-xs text-muted-foreground'>{label}</p>
        <p className='truncate font-medium'>{transaction.transactionNumber}</p>
      </div>
      <Button size='sm' variant='ghost' onClick={() => onOpen(transaction.uid)}>
        Lihat
      </Button>
    </div>
  )
}

function RevisionTimeline({
  revisions,
}: {
  revisions: ProductionTransactionRevision[]
}) {
  if (!revisions.length) return null
  return (
    <section>
      <h3 className='mb-2 flex items-center gap-2 text-sm font-semibold'>
        <History className='size-4' /> Histori Revisi
      </h3>
      <ol className='space-y-3 rounded-lg border p-3'>
        {revisions.map((revision) => (
          <li key={revision.uid} className='relative ps-5 text-sm'>
            <span className='absolute top-1.5 left-0 size-2 rounded-full bg-primary' />
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <p className='font-medium'>
                {revisionLabel(revision.type)}
                {revision.revisionNumber
                  ? ` · Revisi ${revision.revisionNumber}`
                  : ''}
              </p>
              {revision.revisedAt && (
                <time className='text-xs text-muted-foreground'>
                  {formatDateTime(revision.revisedAt)}
                </time>
              )}
            </div>
            <p className='mt-1 text-muted-foreground'>{revision.reason}</p>
            {revision.revisedBy?.name && (
              <p className='mt-1 text-xs text-muted-foreground'>
                Oleh {revision.revisedBy.name}
              </p>
            )}
            {revision.after && (
              <p className='mt-2 rounded bg-muted px-2 py-1.5 text-xs'>
                {revision.after.status ?? 'Perubahan tersimpan'}
                {revision.after.quantity
                  ? ` · ${formatNumber(revision.after.quantity, 4)} ${revision.after.unit?.code ?? 'hasil'}`
                  : ''}
                {revision.after.grossAmount
                  ? ` · ${formatCurrency(revision.after.grossAmount)}`
                  : ''}
              </p>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function CorrectionDialog({
  transaction,
  children,
}: {
  transaction: ProductionTransaction
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [employee, setEmployee] = useState<ProductionEligibleEmployee>()
  const [jobUid, setJobUid] = useState(transaction.job.uid)
  const [quantity, setQuantity] = useState(() =>
    formatProductionQuantityInput(
      transaction.quantity,
      transaction.unit.decimalPrecision
    )
  )
  const [reason, setReason] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey)
  const context = useProductionCorrectionContext(transaction.uid, open)
  const preview = usePreviewProductionCorrection(transaction.uid)
  const correction = useCorrectProductionTransaction(transaction.uid)

  const employeeChanged = Boolean(
    employee && employee.uid !== transaction.employee.uid
  )
  const targetAssignments = employeeChanged ? (employee?.assignments ?? []) : []
  const availableJobUids = employeeChanged
    ? targetAssignments.map((assignment) => assignment.jobUid)
    : (context.data?.jobs.map((job) => job.uid) ?? [])
  const effectiveJobUid = availableJobUids.includes(jobUid)
    ? jobUid
    : (availableJobUids[0] ?? jobUid)
  const selectedJob = context.data?.jobs.find(
    (job) => job.uid === effectiveJobUid
  )
  const selectedTargetAssignment = targetAssignments.find(
    (assignment) => assignment.jobUid === effectiveJobUid
  )
  const quantityPrecision =
    selectedJob?.unit.decimalPrecision ??
    selectedTargetAssignment?.unit.decimalPrecision
  const quantityError =
    effectiveJobUid && quantityPrecision !== undefined
      ? validateProductionQuantity(quantity, quantityPrecision)
      : 'Pilih pekerjaan terlebih dahulu.'
  const normalizedQuantity = normalizeProductionQuantity(quantity)

  const setDialogOpen = (next: boolean) => {
    setOpen(next)
    if (!next) return
    setJobUid(transaction.job.uid)
    setEmployee({
      uid: transaction.employee.uid,
      employeeNumber: transaction.employee.employeeNumber,
      fullName: transaction.employee.fullName,
      site: transaction.site,
      employeeType: '',
      assignments: [],
    })
    setQuantity(
      formatProductionQuantityInput(
        transaction.quantity,
        transaction.unit.decimalPrecision
      )
    )
    setReason('')
    setIdempotencyKey(createIdempotencyKey())
    preview.reset()
  }

  const resetPreview = () => preview.reset()
  const validInput = Boolean(effectiveJobUid) && !quantityError
  const canSubmit = preview.data?.canApply === true && reason.trim().length >= 5

  const submitCorrection = async () => {
    if (!canSubmit) return
    try {
      const output = await correction.mutateAsync({
        employeeUid: employee?.uid,
        jobUid: effectiveJobUid,
        quantity: normalizedQuantity,
        reason: reason.trim(),
        idempotencyKey,
      })
      toast.success(output.message || 'Koreksi transaksi berhasil diterapkan.')
      setOpen(false)
    } catch (error) {
      toast.error(apiMessage(error, 'Koreksi transaksi gagal diterapkan.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Koreksi Transaksi Produksi</DialogTitle>
          <DialogDescription>
            Transaksi asli akan dibatalkan dan digantikan transaksi baru. Waktu
            transaksi tetap mengikuti pencatatan awal.
          </DialogDescription>
        </DialogHeader>
        {context.isPending ? (
          <div className='h-44 animate-pulse rounded-lg bg-muted' />
        ) : context.isError || !context.data ? (
          <ErrorPanel
            message='Konteks koreksi gagal dimuat.'
            onRetry={() => void context.refetch()}
          />
        ) : (
          <div className='space-y-4'>
            {context.data.payrollLock.locked && (
              <LockedPanel reasons={context.data.payrollLock.reasons} />
            )}
            <label className='grid gap-1.5 text-sm'>
              <span className='font-medium'>Karyawan pengganti</span>
              <ProductionEmployeePicker
                site={transaction.site}
                asOf={transaction.businessDate}
                value={employee?.uid ?? transaction.employee.uid}
                selected={employee}
                onChange={(item) => {
                  setEmployee(item)
                  const primary = item.assignments.find(
                    (assignment) => assignment.isPrimary
                  )
                  setJobUid(
                    primary?.jobUid ?? item.assignments[0]?.jobUid ?? ''
                  )
                  setIdempotencyKey(createIdempotencyKey())
                  resetPreview()
                }}
              />
              <span className='text-xs text-muted-foreground'>
                Biarkan tetap sama jika kesalahan hanya pada pekerjaan atau
                kuantitas.
              </span>
            </label>
            <div className='grid gap-4 sm:grid-cols-2'>
              <label className='grid gap-1.5 text-sm'>
                <span className='font-medium'>Pekerjaan pengganti</span>
                <Select
                  value={effectiveJobUid}
                  onValueChange={(value) => {
                    setJobUid(value)
                    setIdempotencyKey(createIdempotencyKey())
                    resetPreview()
                  }}
                  disabled={!context.data.canCorrect}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='Pilih pekerjaan' />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeChanged
                      ? targetAssignments.map((assignment) => (
                          <SelectItem
                            key={assignment.uid}
                            value={assignment.jobUid}
                          >
                            {assignment.jobName} ({assignment.jobCode})
                            {assignment.isPrimary ? ' · Utama' : ' · Tambahan'}
                          </SelectItem>
                        ))
                      : context.data.jobs.map((job) => (
                          <SelectItem key={job.uid} value={job.uid}>
                            {job.name} ({job.code})
                            {job.isPrimary ? ' · Utama' : ' · Tambahan'}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </label>
              <label className='grid gap-1.5 text-sm'>
                <span className='font-medium'>Kuantitas hasil</span>
                <Input
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value)
                    setIdempotencyKey(createIdempotencyKey())
                    resetPreview()
                  }}
                  inputMode='decimal'
                  placeholder='Contoh: 25'
                  disabled={!context.data.canCorrect}
                  aria-invalid={Boolean(quantity && quantityError)}
                />
                {quantity && quantityError && (
                  <span className='text-xs text-destructive'>
                    {quantityError}
                  </span>
                )}
              </label>
            </div>
            <Button
              type='button'
              variant='secondary'
              disabled={
                !validInput || !context.data.canCorrect || preview.isPending
              }
              onClick={() =>
                preview.mutate(
                  {
                    employeeUid: employee?.uid,
                    jobUid: effectiveJobUid,
                    quantity: normalizedQuantity,
                  },
                  {
                    onError: (error) =>
                      toast.error(
                        apiMessage(error, 'Pratinjau koreksi gagal dibuat.')
                      ),
                  }
                )
              }
            >
              {preview.isPending && <Loader2 className='animate-spin' />}
              Preview perubahan
            </Button>
            {preview.data && <CorrectionPreviewPanel preview={preview.data} />}
            <label className='grid gap-1.5 text-sm'>
              <span className='font-medium'>Alasan koreksi</span>
              <Textarea
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  setIdempotencyKey(createIdempotencyKey())
                }}
                placeholder='Jelaskan kesalahan dan alasan koreksi.'
                maxLength={500}
                disabled={!preview.data?.canApply}
              />
              <span className='text-xs text-muted-foreground'>
                Minimal 5 karakter agar alasan audit cukup jelas.
              </span>
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            onClick={() => void submitCorrection()}
            disabled={!canSubmit || correction.isPending}
          >
            {correction.isPending && <Loader2 className='animate-spin' />}
            Terapkan koreksi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CorrectionPreviewPanel({
  preview,
}: {
  preview: ProductionCorrectionPreview
}) {
  const precision = preview.proposed.unit.decimalPrecision
  return (
    <section className='rounded-lg border bg-muted/30 p-3'>
      <div className='mb-3 flex items-center justify-between gap-2'>
        <h3 className='text-sm font-semibold'>Preview perubahan</h3>
        <Badge variant={preview.canApply ? 'secondary' : 'destructive'}>
          {preview.canApply ? 'Siap diterapkan' : 'Tidak dapat diterapkan'}
        </Badge>
      </div>
      <div className='grid gap-2 sm:grid-cols-2'>
        <PreviewColumn
          label='Sebelum'
          employee={preview.source.employee.fullName}
          job={preview.source.job.name}
          quantity={`${formatNumber(preview.source.quantity, preview.source.unit.decimalPrecision)} ${preview.source.unit.code}`}
          rate={formatCurrency(preview.source.rateSnapshot)}
          gross={formatCurrency(preview.source.grossAmount)}
        />
        <PreviewColumn
          label='Sesudah'
          employee={
            preview.targetEmployee?.fullName ?? preview.source.employee.fullName
          }
          job={preview.proposed.job.name}
          quantity={`${formatNumber(preview.proposed.quantity, precision)} ${preview.proposed.unit.code}`}
          rate={formatCurrency(preview.proposed.rateSnapshot)}
          gross={formatCurrency(preview.proposed.grossAmount)}
        />
      </div>
      <div className='mt-2 grid grid-cols-2 gap-2 rounded-md border bg-background p-2 text-sm'>
        <div>
          <p className='text-xs text-muted-foreground'>Selisih kuantitas</p>
          <p className='font-semibold'>
            {formatSignedNumber(preview.delta.quantity, precision)}
          </p>
        </div>
        <div>
          <p className='text-xs text-muted-foreground'>Selisih bruto</p>
          <p className='font-semibold'>
            {formatSignedCurrency(preview.delta.grossAmount)}
          </p>
        </div>
      </div>
      {preview.payrollLock.locked && (
        <div className='mt-3'>
          <LockedPanel reasons={preview.payrollLock.reasons} />
        </div>
      )}
    </section>
  )
}

function PreviewColumn({
  label,
  employee,
  job,
  quantity,
  rate,
  gross,
}: {
  label: string
  employee?: string
  job: string
  quantity: string
  rate: string
  gross: string
}) {
  return (
    <div className='rounded-md border bg-background p-3 text-sm'>
      <p className='mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
        {label}
      </p>
      {employee && (
        <p className='mb-1 text-xs text-muted-foreground'>{employee}</p>
      )}
      <p className='font-medium'>{job}</p>
      <p>{quantity}</p>
      <p className='text-xs text-muted-foreground'>{rate} / satuan</p>
      <p className='mt-1 font-semibold'>{gross}</p>
    </div>
  )
}

function VoidDialog({
  transaction,
  children,
}: {
  transaction: ProductionTransaction
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey)
  const preview = usePreviewProductionVoid(transaction.uid)
  const voidTransaction = useVoidProductionTransaction(transaction.uid)

  const setDialogOpen = (next: boolean) => {
    setOpen(next)
    if (!next) return
    setReason('')
    setIdempotencyKey(createIdempotencyKey())
    preview.reset()
    preview.mutate(
      {},
      {
        onError: (error) =>
          toast.error(apiMessage(error, 'Pratinjau pembatalan gagal dibuat.')),
      }
    )
  }

  const submitVoid = async () => {
    if (!preview.data?.canApply || reason.trim().length < 5) return
    try {
      const output = await voidTransaction.mutateAsync({
        reason: reason.trim(),
        idempotencyKey,
      })
      toast.success(output.message || 'Transaksi berhasil dibatalkan.')
      setOpen(false)
    } catch (error) {
      toast.error(apiMessage(error, 'Transaksi gagal dibatalkan.'))
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setDialogOpen}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Batalkan transaksi Produksi?</AlertDialogTitle>
          <AlertDialogDescription>
            {transaction.transactionNumber} akan menjadi VOID dan tidak lagi
            dihitung sebagai hasil Produksi. Tindakan ini tetap tersimpan dalam
            histori audit.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {preview.isPending ? (
          <div className='flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground'>
            <Loader2 className='size-4 animate-spin' /> Memeriksa transaksi...
          </div>
        ) : preview.isError || !preview.data ? (
          <ErrorPanel
            message='Pratinjau pembatalan gagal dimuat.'
            onRetry={() => preview.mutate({})}
          />
        ) : (
          <div className='space-y-3'>
            {preview.data.payrollLock.locked && (
              <LockedPanel reasons={preview.data.payrollLock.reasons} />
            )}
            <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
              <p className='font-medium'>{preview.data.source.job.name}</p>
              <p className='text-muted-foreground'>
                {formatNumber(
                  preview.data.source.quantity,
                  preview.data.source.unit.decimalPrecision
                )}{' '}
                {preview.data.source.unit.code} ·{' '}
                {formatCurrency(preview.data.source.grossAmount)}
              </p>
              <div className='mt-2 grid grid-cols-2 gap-2 border-t pt-2 text-xs'>
                <div>
                  <p className='text-muted-foreground'>Dampak kuantitas</p>
                  <p className='font-semibold text-destructive'>
                    {formatSignedNumber(
                      preview.data.impact.quantity,
                      preview.data.source.unit.decimalPrecision
                    )}
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground'>Dampak bruto</p>
                  <p className='font-semibold text-destructive'>
                    {formatSignedCurrency(preview.data.impact.grossAmount)}
                  </p>
                </div>
              </div>
            </div>
            <label className='grid gap-1.5 text-sm'>
              <span className='font-medium'>Alasan pembatalan</span>
              <Textarea
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  setIdempotencyKey(createIdempotencyKey())
                }}
                placeholder='Jelaskan alasan transaksi harus dibatalkan.'
                maxLength={500}
                disabled={!preview.data.canApply}
              />
              <span className='text-xs text-muted-foreground'>
                Minimal 5 karakter. Pembatalan tidak dapat dipulihkan langsung.
              </span>
            </label>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={voidTransaction.isPending}>
            Kembali
          </AlertDialogCancel>
          <Button
            variant='destructive'
            disabled={
              !preview.data?.canApply ||
              reason.trim().length < 5 ||
              voidTransaction.isPending
            }
            onClick={() => void submitVoid()}
          >
            {voidTransaction.isPending && <Loader2 className='animate-spin' />}
            Ya, batalkan transaksi
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function LockedPanel({ reasons }: { reasons: string[] }) {
  return (
    <div className='flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm'>
      <LockKeyhole className='mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400' />
      <div>
        <p className='font-medium'>Transaksi terkunci oleh Payroll.</p>
        {!!reasons.length && (
          <ul className='mt-1 list-inside list-disc text-xs text-muted-foreground'>
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ErrorPanel({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div className='rounded-lg border p-4 text-center text-sm'>
      <p className='text-muted-foreground'>{message}</p>
      <Button size='sm' variant='outline' className='mt-2' onClick={onRetry}>
        <RefreshCcw /> Coba lagi
      </Button>
    </div>
  )
}

function DetailGroup({
  title,
  rows,
}: {
  title: string
  rows: Array<[string, string]>
}) {
  return (
    <section>
      <h3 className='mb-2 text-sm font-semibold'>{title}</h3>
      <dl className='divide-y rounded-lg border'>
        {rows.map(([label, value]) => (
          <div
            key={label}
            className='grid grid-cols-[8rem_1fr] gap-3 px-3 py-2 text-sm'
          >
            <dt className='text-muted-foreground'>{label}</dt>
            <dd className='text-right font-medium break-words'>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className='rounded-md border bg-background px-3 py-2'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='mt-0.5 font-medium break-words'>{value}</p>
    </div>
  )
}

function DateControl({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className='grid gap-1 text-sm'>
      <span className='font-medium'>{label}</span>
      <DatePicker
        selected={dateOnlyFromInput(value)}
        onSelect={(date) => {
          const next = dateOnlyToInput(date)
          if (next) onChange(next)
        }}
        toYear={new Date().getFullYear() + 1}
        triggerClassName='w-full sm:w-44'
      />
    </label>
  )
}

function TransactionStatus({ value }: { value: 'POSTED' | 'VOID' }) {
  return value === 'POSTED' ? (
    <Badge className='border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400'>
      Tercatat
    </Badge>
  ) : (
    <Badge variant='outline' className='text-muted-foreground'>
      Dibatalkan
    </Badge>
  )
}

function today() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback
}

function arrayValue<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : undefined
}

function siteLabel(value: ProductionSite) {
  return value.charAt(0) + value.slice(1).toLowerCase()
}

function formatNumber(value: string | number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits }).format(
    Number(value)
  )
}

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function formatSignedNumber(value: string | number, maximumFractionDigits = 0) {
  const numeric = Number(value)
  const formatted = formatNumber(Math.abs(numeric), maximumFractionDigits)
  return numeric > 0
    ? `+${formatted}`
    : numeric < 0
      ? `-${formatted}`
      : formatted
}

function formatSignedCurrency(value: string | number) {
  const numeric = Number(value)
  const formatted = formatCurrency(Math.abs(numeric))
  return numeric > 0
    ? `+${formatted}`
    : numeric < 0
      ? `-${formatted}`
      : formatted
}

function revisionLabel(action: string) {
  if (action === 'CORRECTION') return 'Transaksi dikoreksi'
  if (action === 'VOID') return 'Transaksi dibatalkan'
  return action
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (value) => {
    const random = Math.floor(Math.random() * 16)
    const nibble = value === 'x' ? random : (random & 0x3) | 0x8
    return nibble.toString(16)
  })
}

function apiMessage(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === 'object' &&
    'response' in error &&
    error.response &&
    typeof error.response === 'object' &&
    'data' in error.response &&
    error.response.data &&
    typeof error.response.data === 'object' &&
    'message' in error.response.data &&
    typeof error.response.data.message === 'string'
  ) {
    return error.response.data.message
  }
  return fallback
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'medium',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T00:00:00`))
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(
    new Date(`${value}T00:00:00`)
  )
}

function paginationSummary(page: number, pageSize: number, total: number) {
  return total
    ? `Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} dari ${total} transaksi.`
    : 'Tidak ada transaksi.'
}
