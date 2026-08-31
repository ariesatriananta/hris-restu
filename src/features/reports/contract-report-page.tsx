import { useEffect, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  CalendarClock,
  CalendarX2,
  Download,
  FileClock,
  LoaderCircle,
  RefreshCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import { currentListReturnTo } from '@/lib/list-return-to'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
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
import {
  contractStatusBadgeClassName,
  contractStatusBadgeVariant,
  statusLabel,
} from '@/features/employees/utils'
import {
  useContractReport,
  useContractReportMeta,
  useExportContractReport,
} from './data'
import type {
  ContractExpiryState,
  ContractReportItem,
  ContractReportParams,
  ContractReportStatus,
} from './domain'
import {
  contractRangeError,
  dateLabel,
  defaultContractPeriod,
  downloadBlob,
  numberLabel,
} from './utils'

type Search = {
  referenceDate?: string
  dateFrom?: string
  dateTo?: string
  filter?: string
  site?: string[]
  employeeType?: string[]
  contractType?: string[]
  contractStatus?: ContractReportStatus[]
  expiryState?: ContractExpiryState[]
  page?: number
  pageSize?: number
}

export function ContractReportPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const defaults = defaultContractPeriod()
  const referenceDate = search.referenceDate ?? defaults.referenceDate
  const dateFrom = search.dateFrom ?? defaults.dateFrom
  const dateTo = search.dateTo ?? defaults.dateTo
  const rangeError = contractRangeError(dateFrom, dateTo)
  const params: ContractReportParams = {
    referenceDate,
    dateFrom,
    dateTo,
    query: search.filter,
    site: search.site,
    employeeType: search.employeeType,
    contractType: search.contractType,
    contractStatus: search.contractStatus,
    expiryState: search.expiryState,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  }
  const result = useContractReport(params, !rangeError)
  const meta = useContractReportMeta(
    referenceDate,
    dateFrom,
    dateTo,
    !rangeError
  )
  const exportReport = useExportContractReport()
  const returnTo = currentListReturnTo()
  const columns = useMemo(() => contractColumns(returnTo), [returnTo])
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'employeeType', searchKey: 'employeeType', type: 'array' },
      { columnId: 'contractType', searchKey: 'contractType', type: 'array' },
      {
        columnId: 'contractStatus',
        searchKey: 'contractStatus',
        type: 'array',
      },
      { columnId: 'expiryState', searchKey: 'expiryState', type: 'array' },
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
    getRowId: (row) => row.contractUid,
  })

  useEffect(() => {
    if (search.referenceDate && search.dateFrom && search.dateTo) return
    navigate({
      replace: true,
      search: (previous) => ({
        ...previous,
        referenceDate,
        dateFrom,
        dateTo,
      }),
    })
  }, [
    dateFrom,
    dateTo,
    navigate,
    referenceDate,
    search.dateFrom,
    search.dateTo,
    search.referenceDate,
  ])

  useEffect(() => {
    if (result.data) {
      url.ensurePageInRange(
        Math.max(1, Math.ceil(result.data.total / result.data.pageSize))
      )
    }
  }, [result.data, url])

  const exportExcel = () => {
    if (rangeError) return
    exportReport.mutate(
      {
        referenceDate,
        dateFrom,
        dateTo,
        query: params.query,
        site: params.site,
        employeeType: params.employeeType,
        contractType: params.contractType,
        contractStatus: params.contractStatus,
        expiryState: params.expiryState,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          downloadBlob(blob, fileName)
          toast.success('Laporan kontrak berhasil diunduh.')
        },
        onError: () => toast.error('Ekspor laporan kontrak gagal.'),
      }
    )
  }

  const summary = result.data?.summary
  return (
    <Main>
      <div className='mb-5 flex flex-col gap-4 2xl:flex-row 2xl:items-end 2xl:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Pusat Laporan</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Laporan Kontrak
          </h1>
          <p className='text-sm text-muted-foreground'>
            Pantau kontrak yang akan berakhir dan yang sudah melewati tanggal
            akhir.
          </p>
        </div>
        <div className='grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:w-auto'>
          <DateField
            label='Status per tanggal'
            value={referenceDate}
            onChange={(value) => updateDate(navigate, 'referenceDate', value)}
          />
          <DateField
            label='Berakhir dari'
            value={dateFrom}
            onChange={(value) => updateDate(navigate, 'dateFrom', value)}
          />
          <DateField
            label='Berakhir sampai'
            value={dateTo}
            onChange={(value) => updateDate(navigate, 'dateTo', value)}
          />
          <div className='grid gap-1.5'>
            <span className='hidden text-sm font-medium xl:block' aria-hidden>
              &nbsp;
            </span>
            <Button
              onClick={exportExcel}
              disabled={Boolean(rangeError) || exportReport.isPending}
              title={rangeError}
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
        </div>
      </div>

      {rangeError && (
        <Alert variant='destructive' className='mb-4'>
          <AlertTriangle />
          <AlertTitle>Periode belum valid</AlertTitle>
          <AlertDescription>{rangeError}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <div className='mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6'>
          <Kpi label='Total kontrak' value={summary.total} icon={FileClock} />
          <Kpi
            label='Akan berakhir'
            value={summary.upcoming}
            icon={CalendarClock}
          />
          <Kpi
            label='Sudah berakhir'
            value={summary.expired}
            icon={CalendarX2}
          />
          <Kpi label='Aktif' value={summary.active} icon={FileClock} />
          <Kpi
            label='Dijadwalkan'
            value={summary.scheduled}
            icon={CalendarClock}
          />
          <Kpi
            label='Temuan data'
            value={
              summary.ambiguousHistory +
              summary.missingHistory +
              summary.unresolvedSite +
              summary.unresolvedStatus
            }
            icon={AlertTriangle}
          />
        </div>
      )}

      <div className='space-y-4'>
        <div className='overflow-x-auto pb-1'>
          <div className='min-w-max sm:min-w-0'>
            <DataTableToolbar
              table={table}
              searchPlaceholder='Cari nama, nomor karyawan, atau nomor kontrak...'
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
                  columnId: 'contractType',
                  title: 'Jenis kontrak',
                  options: (meta.data?.contractTypes ?? []).map((item) => ({
                    value: item.uid,
                    label: item.name,
                  })),
                },
                {
                  columnId: 'contractStatus',
                  title: 'Status kontrak',
                  options: (meta.data?.contractStatuses ?? []).map(
                    optionByCode
                  ),
                },
                {
                  columnId: 'expiryState',
                  title: 'Kondisi akhir',
                  options: (meta.data?.expiryStates ?? []).map(optionByCode),
                },
              ]}
            />
          </div>
        </div>
        {result.isFetching && !result.isPending && <Refreshing />}
        {result.isPending ? (
          <EmptyState text='Memuat laporan kontrak...' loading />
        ) : result.isError ? (
          <EmptyState text='Laporan kontrak gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EmptyState>
        ) : !result.data?.items.length ? (
          <EmptyState text='Tidak ada kontrak yang sesuai filter dan periode.' />
        ) : (
          <>
            <div className='hidden overflow-x-auto rounded-md border xl:block'>
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
            <div className='grid gap-3 xl:hidden'>
              {result.data.items.map((item) => (
                <ContractCard
                  key={item.contractUid}
                  item={item}
                  returnTo={returnTo}
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
    </Main>
  )
}

function contractColumns(returnTo?: string): ColumnDef<ContractReportItem>[] {
  return [
    {
      accessorKey: 'employeeName',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Karyawan' />
      ),
      cell: ({ row }) => (
        <div>
          <Link
            to='/karyawan/data-karyawan/$employeeUid'
            params={{ employeeUid: row.original.employeeUid }}
            search={{ returnTo }}
            className='font-medium hover:underline'
          >
            {row.original.employeeName}
          </Link>
          <p className='text-xs text-muted-foreground'>
            {row.original.employeeNumber}
          </p>
          {contractNeedsReview(row.original) && (
            <Badge variant='destructive' className='mt-1'>
              Riwayat kerja perlu diperiksa
            </Badge>
          )}
        </div>
      ),
      meta: { label: 'Karyawan' },
    },
    {
      accessorKey: 'contractNumber',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Nomor Kontrak' />
      ),
      cell: ({ row }) => (
        <span className='font-medium whitespace-nowrap'>
          {row.original.contractNumber}
        </span>
      ),
      meta: { label: 'Nomor Kontrak' },
    },
    {
      id: 'site',
      accessorFn: (item) => item.site?.code ?? '',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Site' />
      ),
      cell: ({ row }) => row.original.site?.name ?? 'Belum diketahui',
      filterFn: arrayFilter,
      meta: { label: 'Site' },
    },
    {
      id: 'employeeType',
      accessorFn: (item) => item.employeeType?.code ?? '',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Jenis Karyawan' />
      ),
      cell: ({ row }) => row.original.employeeType?.name ?? '-',
      filterFn: arrayFilter,
      meta: { label: 'Jenis Karyawan' },
    },
    {
      id: 'contractType',
      accessorFn: (item) => item.contractType.uid,
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Jenis Kontrak' />
      ),
      cell: ({ row }) => row.original.contractType.name,
      filterFn: arrayFilter,
      meta: { label: 'Jenis Kontrak' },
    },
    {
      id: 'period',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Masa Kontrak' />
      ),
      cell: ({ row }) => (
        <span className='whitespace-nowrap'>
          {dateLabel(row.original.startDate)} –{' '}
          {dateLabel(row.original.endDate)}
        </span>
      ),
      meta: { label: 'Masa Kontrak' },
    },
    {
      accessorKey: 'expiryState',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Kondisi Akhir' />
      ),
      cell: ({ row }) => (
        <Badge
          variant={
            row.original.expiryState === 'EXPIRED' ? 'destructive' : 'outline'
          }
        >
          {row.original.expiryState === 'EXPIRED'
            ? 'Sudah berakhir'
            : 'Akan berakhir'}
        </Badge>
      ),
      filterFn: arrayFilter,
      meta: { label: 'Kondisi Akhir' },
    },
    {
      accessorKey: 'contractStatus',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => (
        <Badge
          variant={contractStatusBadgeVariant(row.original.contractStatus)}
          className={contractStatusBadgeClassName(row.original.contractStatus)}
        >
          {contractStatusLabel(row.original.contractStatus)}
        </Badge>
      ),
      filterFn: arrayFilter,
      meta: { label: 'Status' },
    },
  ]
}

function ContractCard({
  item,
  returnTo,
}: {
  item: ContractReportItem
  returnTo?: string
}) {
  return (
    <Card>
      <CardContent className='p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <Link
              to='/karyawan/data-karyawan/$employeeUid'
              params={{ employeeUid: item.employeeUid }}
              search={{ returnTo }}
              className='font-semibold hover:underline'
            >
              {item.employeeName}
            </Link>
            <p className='text-xs text-muted-foreground'>
              {item.employeeNumber} ·{' '}
              {item.site?.name ?? 'Site belum diketahui'}
            </p>
          </div>
          <Badge
            variant={item.expiryState === 'EXPIRED' ? 'destructive' : 'outline'}
          >
            {item.expiryState === 'EXPIRED'
              ? 'Sudah berakhir'
              : 'Akan berakhir'}
          </Badge>
        </div>
        {contractNeedsReview(item) && (
          <Badge variant='destructive' className='mt-3'>
            Riwayat kerja perlu diperiksa
          </Badge>
        )}
        <div className='mt-3 grid grid-cols-2 gap-3 text-sm'>
          <Info label='Nomor kontrak' value={item.contractNumber} />
          <Info label='Jenis kontrak' value={item.contractType.name} />
          <Info label='Mulai' value={dateLabel(item.startDate)} />
          <Info label='Berakhir' value={dateLabel(item.endDate)} />
          <Info
            label='Status kontrak'
            value={contractStatusLabel(item.contractStatus)}
          />
          <Info label='Jenis karyawan' value={item.employeeType?.name ?? '-'} />
        </div>
      </CardContent>
    </Card>
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
    <div className='w-full xl:w-52'>
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
  key: 'referenceDate' | 'dateFrom' | 'dateTo',
  value: string
) {
  navigate({
    search: (previous) => ({
      ...previous,
      [key]: value || undefined,
      page: undefined,
    }),
  })
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p>{value}</p>
    </div>
  )
}

function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof FileClock
}) {
  return (
    <section className='min-h-17 rounded-lg border bg-card px-3 py-2.5'>
      <div className='flex items-start justify-between gap-2'>
        <div>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='mt-1 text-xl font-semibold tabular-nums'>
            {numberLabel(value)}
          </p>
        </div>
        <Icon className='size-4 text-muted-foreground' />
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
  children?: React.ReactNode
}) {
  return (
    <div className='flex min-h-40 flex-col items-center justify-center gap-3 text-center text-muted-foreground'>
      {loading ? (
        <LoaderCircle className='size-5 animate-spin' />
      ) : (
        <FileClock className='size-5' />
      )}
      <p>{text}</p>
      {children}
    </div>
  )
}

function arrayFilter(
  row: { getValue: (id: string) => unknown },
  id: string,
  value: string[]
) {
  return value.includes(String(row.getValue(id)))
}

function optionByCode(item: { code: string; name: string }) {
  return { value: item.code, label: item.name }
}

function contractNeedsReview(item: ContractReportItem) {
  return (
    item.historyStatus !== 'VALID' ||
    item.siteResolution === 'UNRESOLVED' ||
    item.statusResolution === 'UNRESOLVED'
  )
}

function contractStatusLabel(status: ContractReportStatus) {
  return status === 'UNKNOWN' ? 'Perlu diperiksa' : statusLabel(status)
}

function pageSummary(page: number, pageSize: number, total: number) {
  return (
    <>
      Menampilkan {total ? (page - 1) * pageSize + 1 : 0}–
      {Math.min(page * pageSize, total)} dari {numberLabel(total)} data.
    </>
  )
}
