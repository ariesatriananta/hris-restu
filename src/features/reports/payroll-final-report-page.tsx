import { useEffect, useMemo, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  Banknote,
  CalendarCheck2,
  Download,
  Eye,
  Landmark,
  LoaderCircle,
  RefreshCcw,
  ReceiptText,
  ShieldCheck,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { currentListReturnTo } from '@/lib/list-return-to'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
  DataTableActionButton,
  DataTableColumnHeader,
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
import { formatDecimalString } from '@/features/payroll/money'
import {
  employeeBaseLabel,
  payrollSchemeName,
} from '@/features/payroll/payroll-presentation'
import {
  useExportPayrollFinalReport,
  usePayrollFinalReport,
  usePayrollFinalReportMeta,
} from './data'
import type {
  PayrollFinalReportItem,
  PayrollFinalReportParams,
  PayrollReportBasis,
  PayrollReportFrequency,
} from './domain'
import {
  dateLabel,
  defaultPayrollFinalPeriod,
  downloadBlob,
  numberLabel,
  payrollFinalRangeError,
} from './utils'

type Search = {
  dateFrom?: string
  dateTo?: string
  filter?: string
  site?: string[]
  employeeType?: string[]
  payrollBasis?: PayrollReportBasis[]
  payFrequency?: PayrollReportFrequency[]
  page?: number
  pageSize?: number
  detailUid?: string
}

export function PayrollFinalReportPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const defaults = defaultPayrollFinalPeriod()
  const dateFrom = search.dateFrom ?? defaults.dateFrom
  const dateTo = search.dateTo ?? defaults.dateTo
  const rangeError = payrollFinalRangeError(dateFrom, dateTo)
  const params: PayrollFinalReportParams = {
    dateFrom,
    dateTo,
    query: search.filter,
    site: search.site,
    employeeType: search.employeeType,
    payrollBasis: search.payrollBasis,
    payFrequency: search.payFrequency,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  }
  const result = usePayrollFinalReport(params, !rangeError)
  const meta = usePayrollFinalReportMeta(!rangeError)
  const exportReport = useExportPayrollFinalReport()
  const session = useAuthStore((state) => state.session)
  const canExport = hasPermission(session, 'payroll.export')
  const returnTo = currentListReturnTo()
  const showDetail = (detailUid?: string) =>
    navigate({
      search: (previous) => ({ ...previous, detailUid }),
    })
  const columns = useMemo(
    () => payrollColumns(returnTo, showDetail),
    // Navigate stabil dari TanStack Router; returnTo berubah mengikuti URL aktif.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, returnTo]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'employeeType', searchKey: 'employeeType', type: 'array' },
      { columnId: 'payrollBasis', searchKey: 'payrollBasis', type: 'array' },
      { columnId: 'payFrequency', searchKey: 'payFrequency', type: 'array' },
    ],
  })

  // TanStack Table mengembalikan fungsi stateful; ini pola resmi starter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: result.data?.items ?? [],
    columns,
    state: {
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
    },
    initialState: { columnVisibility: { payFrequency: false } },
    manualFiltering: true,
    manualPagination: true,
    pageCount: Math.max(
      1,
      Math.ceil((result.data?.total ?? 0) / (result.data?.pageSize ?? 50))
    ),
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.resultUid,
  })

  useEffect(() => {
    if (search.dateFrom && search.dateTo) return
    navigate({
      replace: true,
      search: (previous) => ({ ...previous, dateFrom, dateTo }),
    })
  }, [dateFrom, dateTo, navigate, search.dateFrom, search.dateTo])

  useEffect(() => {
    if (result.data) {
      url.ensurePageInRange(
        Math.max(1, Math.ceil(result.data.total / result.data.pageSize))
      )
    }
  }, [result.data, url])

  const selected = result.data?.items.find(
    (item) => item.resultUid === search.detailUid
  )
  const exportExcel = () => {
    if (rangeError || !canExport) return
    exportReport.mutate(
      {
        dateFrom,
        dateTo,
        query: params.query,
        site: params.site,
        employeeType: params.employeeType,
        payrollBasis: params.payrollBasis,
        payFrequency: params.payFrequency,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          downloadBlob(blob, fileName)
          toast.success('Laporan Payroll final berhasil diunduh.')
        },
        onError: () => toast.error('Ekspor laporan Payroll final gagal.'),
      }
    )
  }

  const summary = result.data?.summary
  return (
    <Main>
      <div className='mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Pusat Laporan</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Laporan Payroll Final
          </h1>
          <p className='text-sm text-muted-foreground'>
            Lihat hasil Payroll yang sudah ditutup dan disahkan.
          </p>
        </div>
        <div className='grid w-full gap-3 sm:grid-cols-3 xl:w-auto'>
          <DateField
            label='Periode selesai dari'
            value={dateFrom}
            onChange={(value) => updateDate(navigate, 'dateFrom', value)}
          />
          <DateField
            label='Periode selesai sampai'
            value={dateTo}
            onChange={(value) => updateDate(navigate, 'dateTo', value)}
          />
          {canExport && (
            <div className='grid gap-1.5'>
              <span className='hidden text-sm font-medium sm:block' aria-hidden>
                &nbsp;
              </span>
              <Button
                onClick={exportExcel}
                disabled={Boolean(rangeError) || exportReport.isPending}
                className='w-full'
              >
                {exportReport.isPending ? (
                  <LoaderCircle className='animate-spin' />
                ) : (
                  <Download />
                )}
                Ekspor Excel
              </Button>
            </div>
          )}
        </div>
      </div>

      <Alert className='mb-4 border-sky-200 bg-sky-50/70 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100'>
        <ShieldCheck />
        <AlertTitle>Hasil resmi Payroll</AlertTitle>
        <AlertDescription>
          Hanya perhitungan final dari periode yang sudah ditutup. Status
          ditutup tidak berarti dana sudah ditransfer kepada karyawan.
        </AlertDescription>
      </Alert>

      {rangeError && (
        <Alert variant='destructive' className='mb-4'>
          <AlertTriangle />
          <AlertTitle>Periode belum valid</AlertTitle>
          <AlertDescription>{rangeError}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <div className='mb-4 grid grid-cols-2 gap-2 xl:grid-cols-5'>
          <Kpi
            label='Periode final'
            value={numberLabel(summary.periodCount)}
            icon={CalendarCheck2}
          />
          <Kpi
            label='Karyawan'
            value={numberLabel(summary.employeeCount)}
            icon={Users}
          />
          <Kpi
            label='Pendapatan kotor'
            value={money(summary.totalGrossEarnings)}
            icon={Banknote}
          />
          <Kpi
            label='Total potongan'
            value={money(summary.totalDeductions)}
            icon={ReceiptText}
          />
          <Kpi
            label='Gaji bersih'
            value={money(summary.totalNetPay)}
            icon={WalletCards}
          />
        </div>
      )}

      <div className='space-y-4'>
        <div className='overflow-x-auto pb-1'>
          <div className='min-w-max sm:min-w-0'>
            <DataTableToolbar
              table={table}
              searchPlaceholder='Cari nama, nomor karyawan, atau kode periode...'
              searchDebounceMs={500}
              filters={[
                {
                  columnId: 'site',
                  title: 'Site',
                  options: (meta.data?.sites ?? []).map(optionByCode),
                },
                {
                  columnId: 'employeeType',
                  title: 'Jenis karyawan',
                  options: (meta.data?.employeeTypes ?? []).map(optionByCode),
                },
                {
                  columnId: 'payrollBasis',
                  title: 'Dasar upah',
                  options: (meta.data?.payrollBases ?? []).map(optionByCode),
                },
                {
                  columnId: 'payFrequency',
                  title: 'Frekuensi',
                  options: (meta.data?.payFrequencies ?? []).map(optionByCode),
                },
              ]}
            />
          </div>
        </div>

        {result.isFetching && !result.isPending && <Refreshing />}
        {result.isPending ? (
          <EmptyState text='Memuat laporan Payroll final...' loading />
        ) : result.isError ? (
          <EmptyState text='Laporan Payroll final gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EmptyState>
        ) : !result.data?.items.length ? (
          <EmptyState text='Tidak ada hasil Payroll final yang sesuai filter.' />
        ) : (
          <>
            <div className='hidden overflow-x-auto rounded-md border lg:block'>
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((group) => (
                    <TableRow key={group.id}>
                      {group.headers.map((header) => (
                        <TableHead key={header.id}>
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
                        <TableCell key={cell.id}>
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
            <div className='grid gap-3 lg:hidden'>
              {result.data.items.map((item) => (
                <PayrollCard
                  key={item.resultUid}
                  item={item}
                  returnTo={returnTo}
                  onDetail={() => showDetail(item.resultUid)}
                />
              ))}
            </div>
            <DataTablePagination
              table={table}
              summary={pageSummary(
                result.data.page,
                result.data.pageSize,
                result.data.total
              )}
            />
          </>
        )}
      </div>

      <PayrollDetailSheet
        item={selected}
        open={Boolean(search.detailUid && selected)}
        onOpenChange={(open) => {
          if (!open) showDetail(undefined)
        }}
        returnTo={returnTo}
      />
    </Main>
  )
}

function payrollColumns(
  returnTo: string | undefined,
  onDetail: (uid: string) => void
): ColumnDef<PayrollFinalReportItem>[] {
  return [
    {
      accessorKey: 'employeeName',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Karyawan' />
      ),
      cell: ({ row }) => <Employee item={row.original} returnTo={returnTo} />,
      meta: { label: 'Karyawan' },
    },
    {
      id: 'period',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Periode' />
      ),
      cell: ({ row }) => <Period item={row.original} />,
      meta: { label: 'Periode' },
    },
    {
      id: 'site',
      accessorFn: (item) => item.site.code,
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Site' />
      ),
      cell: ({ row }) => row.original.site.name,
      filterFn: arrayFilter,
      meta: { label: 'Site' },
    },
    {
      id: 'employeeType',
      accessorFn: (item) => item.period.employeeType,
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Jenis & skema' />
      ),
      cell: ({ row }) => <Scheme item={row.original} />,
      filterFn: arrayFilter,
      meta: { label: 'Jenis & skema' },
    },
    {
      id: 'payrollBasis',
      accessorFn: (item) => item.period.payrollBasis,
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Pendapatan kotor' />
      ),
      cell: ({ row }) => <Gross item={row.original} />,
      filterFn: arrayFilter,
      meta: { label: 'Pendapatan kotor' },
    },
    {
      id: 'payFrequency',
      accessorFn: (item) => item.period.payFrequency,
      enableHiding: true,
      filterFn: arrayFilter,
      meta: { label: 'Frekuensi Payroll' },
    },
    moneyColumn('totalDeductions', 'Potongan'),
    moneyColumn('netPay', 'Gaji bersih', true),
    {
      id: 'bank',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Rekening' />
      ),
      cell: ({ row }) => <Bank item={row.original} />,
      meta: { label: 'Rekening' },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      header: () => <span className='sr-only'>Aksi</span>,
      cell: ({ row }) => (
        <DataTableActionButton
          label={`Lihat rincian Payroll ${row.original.employeeName}`}
          onClick={() => onDetail(row.original.resultUid)}
        >
          <Eye />
        </DataTableActionButton>
      ),
      meta: { label: 'Aksi' },
    },
  ]
}

function moneyColumn(
  accessorKey: 'totalDeductions' | 'netPay',
  title: string,
  emphasized = false
): ColumnDef<PayrollFinalReportItem> {
  return {
    id: accessorKey,
    enableSorting: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={title} />
    ),
    cell: ({ row }) => (
      <span
        className={`whitespace-nowrap tabular-nums ${emphasized ? 'font-semibold' : ''}`}
      >
        {money(row.original.amounts[accessorKey])}
      </span>
    ),
    meta: { label: title },
  }
}

function Employee({
  item,
  returnTo,
}: {
  item: PayrollFinalReportItem
  returnTo?: string
}) {
  return (
    <div className='min-w-44'>
      <Link
        to='/karyawan/data-karyawan/$employeeUid'
        params={{ employeeUid: item.employeeUid }}
        search={{ returnTo }}
        className='font-medium hover:underline'
      >
        {item.employeeName}
      </Link>
      <p className='text-xs text-muted-foreground'>{item.employeeNumber}</p>
      <p className='text-xs text-muted-foreground'>
        {item.positionName ?? 'Tanpa jabatan'}
      </p>
    </div>
  )
}

function Period({ item }: { item: PayrollFinalReportItem }) {
  return (
    <div className='min-w-44'>
      <p className='font-medium'>{item.period.name}</p>
      <p className='text-xs text-muted-foreground'>{item.period.code}</p>
      <p className='text-xs whitespace-nowrap text-muted-foreground'>
        {dateLabel(item.period.start)}–{dateLabel(item.period.end)}
      </p>
    </div>
  )
}

function Scheme({ item }: { item: PayrollFinalReportItem }) {
  return (
    <div className='min-w-32'>
      <p>{employeeTypeName(item.employeeType)}</p>
      <p className='text-xs text-muted-foreground'>
        {payrollSchemeName({
          employeeType: item.period.employeeType as never,
          payrollBasis: item.period.payrollBasis,
          payFrequency: item.period.payFrequency,
        })}
      </p>
    </div>
  )
}

function Gross({ item }: { item: PayrollFinalReportItem }) {
  return (
    <div className='min-w-36'>
      <p className='font-medium tabular-nums'>
        {money(item.amounts.grossEarnings)}
      </p>
      <p className='text-xs text-muted-foreground'>
        Dasar {money(baseAmount(item))}
      </p>
      {item.amounts.additionalEarnings !== '0.00' && (
        <p className='text-xs text-muted-foreground'>
          Tambahan {money(item.amounts.additionalEarnings)}
        </p>
      )}
    </div>
  )
}

function Bank({ item }: { item: PayrollFinalReportItem }) {
  return (
    <div className='min-w-28'>
      <p>{item.bank.name ?? '-'}</p>
      <p className='text-xs text-muted-foreground'>
        {maskedAccount(item.bank.accountLast4)}
      </p>
    </div>
  )
}

function PayrollCard({
  item,
  returnTo,
  onDetail,
}: {
  item: PayrollFinalReportItem
  returnTo?: string
  onDetail: () => void
}) {
  return (
    <Card>
      <CardContent className='p-4'>
        <div className='flex items-start justify-between gap-3'>
          <Employee item={item} returnTo={returnTo} />
          <Badge variant='outline'>Final</Badge>
        </div>
        <div className='mt-3 text-sm'>
          <p className='font-medium'>{item.period.name}</p>
          <p className='text-xs text-muted-foreground'>
            {item.site.name} · {employeeTypeName(item.employeeType)}
          </p>
        </div>
        <div className='mt-3 grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-3'>
          <Amount label='Kotor' value={item.amounts.grossEarnings} />
          <Amount label='Potongan' value={item.amounts.totalDeductions} />
          <Amount label='Bersih' value={item.amounts.netPay} emphasized />
        </div>
        <div className='mt-3 flex items-center justify-between gap-3 text-sm'>
          <Bank item={item} />
          <Button variant='outline' size='sm' onClick={onDetail}>
            <Eye /> Lihat rincian
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PayrollDetailSheet({
  item,
  open,
  onOpenChange,
  returnTo,
}: {
  item?: PayrollFinalReportItem
  open: boolean
  onOpenChange: (open: boolean) => void
  returnTo?: string
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-2xl'>
        {item && (
          <>
            <SheetHeader className='border-b pr-12'>
              <SheetTitle>Rincian Payroll Final</SheetTitle>
              <SheetDescription>
                {item.period.name} · {item.site.name}
              </SheetDescription>
            </SheetHeader>
            <div className='space-y-5 px-4 pb-6'>
              <Alert className='border-emerald-200 bg-emerald-50/70 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100'>
                <ShieldCheck />
                <AlertTitle>Hasil final</AlertTitle>
                <AlertDescription>
                  Nominal ini berasal dari perhitungan resmi pada periode yang
                  sudah ditutup.
                </AlertDescription>
              </Alert>

              <section>
                <p className='mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase'>
                  Karyawan
                </p>
                <Link
                  to='/karyawan/data-karyawan/$employeeUid'
                  params={{ employeeUid: item.employeeUid }}
                  search={{ returnTo }}
                  className='font-semibold hover:underline'
                >
                  {item.employeeName}
                </Link>
                <p className='text-sm text-muted-foreground'>
                  {item.employeeNumber} · {employeeTypeName(item.employeeType)}
                </p>
                <p className='text-sm text-muted-foreground'>
                  {item.departmentName ?? 'Tanpa departemen'} ·{' '}
                  {item.positionName ?? 'Tanpa jabatan'}
                </p>
              </section>

              <div className='grid grid-cols-2 gap-2 sm:grid-cols-5'>
                <DetailAmount
                  label={employeeBaseLabel({
                    employeeType: item.period.employeeType as never,
                    payrollBasis: item.period.payrollBasis,
                    payFrequency: item.period.payFrequency,
                  })}
                  value={baseAmount(item)}
                />
                <DetailAmount
                  label='Tambahan'
                  value={item.amounts.additionalEarnings}
                />
                <DetailAmount
                  label='Pendapatan kotor'
                  value={item.amounts.grossEarnings}
                />
                <DetailAmount
                  label='Potongan'
                  value={item.amounts.totalDeductions}
                />
                <DetailAmount
                  label='Gaji bersih'
                  value={item.amounts.netPay}
                  strong
                />
              </div>

              <section className='rounded-lg border p-4'>
                <h3 className='font-semibold'>Periode dan perhitungan</h3>
                <dl className='mt-3 grid gap-3 text-sm sm:grid-cols-2'>
                  <Detail label='Kode periode' value={item.period.code} />
                  <Detail
                    label='Rentang periode'
                    value={`${dateLabel(item.period.start)}–${dateLabel(item.period.end)}`}
                  />
                  <Detail
                    label='Rencana tanggal pembayaran'
                    value={
                      item.period.paymentDate
                        ? dateLabel(item.period.paymentDate)
                        : 'Belum ditentukan'
                    }
                  />
                  <Detail
                    label='Skema'
                    value={payrollSchemeName({
                      employeeType: item.period.employeeType as never,
                      payrollBasis: item.period.payrollBasis,
                      payFrequency: item.period.payFrequency,
                    })}
                  />
                  <Detail
                    label='Hari attendance'
                    value={`${numberLabel(item.attendanceDays)} hari`}
                  />
                  <Detail
                    label='Transaksi produksi'
                    value={numberLabel(item.productionTransactionCount)}
                  />
                </dl>
              </section>

              <section className='rounded-lg border p-4'>
                <div className='flex items-center gap-2'>
                  <Landmark className='size-4 text-muted-foreground' />
                  <h3 className='font-semibold'>Rekening pembayaran</h3>
                </div>
                <p className='mt-3 text-sm'>{item.bank.name ?? '-'}</p>
                <p className='text-sm text-muted-foreground'>
                  {maskedAccount(item.bank.accountLast4)}
                </p>
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailAmount({
  label,
  value,
  strong,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <section className='rounded-lg border bg-card px-3 py-2.5'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p
        className={`mt-1 tabular-nums ${strong ? 'font-bold' : 'font-semibold'}`}
      >
        {money(value)}
      </p>
    </section>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='mt-0.5'>{value}</dd>
    </div>
  )
}

function Amount({
  label,
  value,
  emphasized,
}: {
  label: string
  value: string
  emphasized?: boolean
}) {
  return (
    <div className='min-w-0'>
      <p className='text-[11px] text-muted-foreground'>{label}</p>
      <p
        className={`truncate text-xs tabular-nums ${emphasized ? 'font-semibold' : ''}`}
      >
        {money(value)}
      </p>
    </div>
  )
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className='w-full sm:w-52'>
      <label className='mb-1.5 block text-sm font-medium'>{label}</label>
      <DatePicker
        selected={dateOnlyFromInput(value)}
        onSelect={(date) => onChange(dateOnlyToInput(date))}
      />
    </div>
  )
}

function updateDate(
  navigate: NavigateFn,
  key: 'dateFrom' | 'dateTo',
  value: string
) {
  navigate({
    search: (previous) => ({
      ...previous,
      [key]: value || undefined,
      page: undefined,
      detailUid: undefined,
    }),
  })
}

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon: LucideIcon
}) {
  return (
    <section className='min-h-17 rounded-lg border bg-card px-3 py-2.5'>
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0'>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='mt-1 truncate text-lg font-semibold tabular-nums sm:text-xl'>
            {value}
          </p>
        </div>
        <Icon className='size-4 shrink-0 text-muted-foreground' />
      </div>
    </section>
  )
}

function Refreshing() {
  return (
    <p
      role='status'
      className='flex items-center gap-2 text-xs text-muted-foreground'
    >
      <LoaderCircle className='size-3.5 animate-spin' /> Memperbarui laporan...
    </p>
  )
}

function EmptyState({
  text,
  loading,
  children,
}: {
  text: string
  loading?: boolean
  children?: ReactNode
}) {
  return (
    <div className='flex min-h-40 flex-col items-center justify-center gap-3 text-center text-muted-foreground'>
      {loading ? (
        <LoaderCircle className='size-5 animate-spin' />
      ) : (
        <WalletCards className='size-5' />
      )}
      <p>{text}</p>
      {children}
    </div>
  )
}

function money(value: string | number) {
  return formatDecimalString(value, {
    currency: true,
    maximumFractionDigits: 0,
  })
}

function baseAmount(item: PayrollFinalReportItem) {
  return item.period.payrollBasis === 'PIECE_RATE'
    ? item.amounts.pieceRate
    : item.amounts.basicSalary
}

function employeeTypeName(value: string) {
  return (
    {
      BORONGAN: 'Borongan',
      HARIAN: 'Harian',
      TRAINING: 'Training',
      BULANAN: 'Bulanan',
    }[value] ?? value
  )
}

function maskedAccount(last4: string | null) {
  return last4 ? `•••• ${last4}` : 'Rekening belum tersedia'
}

function optionByCode(item: { code: string; name: string }) {
  return { value: item.code, label: item.name }
}

function arrayFilter(
  row: { getValue: (id: string) => unknown },
  id: string,
  value: string[]
) {
  return value.includes(String(row.getValue(id)))
}

function pageSummary(page: number, pageSize: number, total: number) {
  return (
    <>
      Menampilkan {total ? (page - 1) * pageSize + 1 : 0}–
      {Math.min(page * pageSize, total)} dari {numberLabel(total)} data.
    </>
  )
}
