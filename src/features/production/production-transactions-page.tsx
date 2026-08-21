import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  Banknote,
  Boxes,
  Eye,
  FileClock,
  PackageCheck,
  RefreshCcw,
  Users,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  useProductionJobs,
  useProductionTransaction,
  useProductionTransactions,
} from './data/queries'
import type {
  ProductionSite,
  ProductionTransaction,
  ProductionTransactionResult,
} from './domain'

const allProductionSites: ProductionSite[] = [
  'JEPARA',
  'SEMARANG',
  'KLATEN',
]

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
      />
    </Main>
  )
}

function TransactionSummary({ data }: { data?: ProductionTransactionResult }) {
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
      label: 'Total Kuantitas',
      value: formatNumber(data?.summary.totalQuantity ?? 0, 4),
      icon: Boxes,
      description:
        'Akumulasi kuantitas. Gunakan bersama filter pekerjaan karena satuannya dapat berbeda.',
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
        <TransactionStatus value={item.status} />
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
}: {
  uid?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const result = useProductionTransaction(uid)
  const item = result.data
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
                  [
                    'Perangkat',
                    item.device
                      ? `${item.device.name} (${item.device.code})`
                      : 'Tidak tersedia',
                  ],
                ]}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
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
