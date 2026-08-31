import { useEffect, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  BriefcaseBusiness,
  Download,
  LoaderCircle,
  RefreshCcw,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { currentListReturnTo } from '@/lib/list-return-to'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
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
  useEmployeeReport,
  useEmployeeReportMeta,
  useExportEmployeeReport,
} from './data'
import type { EmployeeReportItem, EmployeeReportParams } from './domain'
import { dateLabel, downloadBlob, localDate, numberLabel } from './utils'

type Search = {
  asOf?: string
  filter?: string
  site?: string[]
  employeeType?: string[]
  employeeStatus?: string[]
  productionSection?: string[]
  page?: number
  pageSize?: number
}

export function EmployeeReportPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const asOf = search.asOf ?? localDate(new Date())
  const params: EmployeeReportParams = {
    asOf,
    query: search.filter,
    site: search.site,
    employeeType: search.employeeType,
    employeeStatus: search.employeeStatus,
    productionSection: search.productionSection,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  }
  const result = useEmployeeReport(params)
  const meta = useEmployeeReportMeta(asOf)
  const exportReport = useExportEmployeeReport()
  const returnTo = currentListReturnTo()
  const columns = useMemo(() => employeeColumns(returnTo), [returnTo])
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'employeeType', searchKey: 'employeeType', type: 'array' },
      {
        columnId: 'employeeStatus',
        searchKey: 'employeeStatus',
        type: 'array',
      },
      {
        columnId: 'productionSection',
        searchKey: 'productionSection',
        type: 'array',
      },
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
    getRowId: (row) => row.employeeUid,
  })

  useEffect(() => {
    if (!search.asOf) {
      navigate({
        replace: true,
        search: (previous) => ({ ...previous, asOf }),
      })
    }
  }, [asOf, navigate, search.asOf])

  useEffect(() => {
    if (result.data) {
      url.ensurePageInRange(
        Math.max(1, Math.ceil(result.data.total / result.data.pageSize))
      )
    }
  }, [result.data, url])

  const summary = result.data?.summary
  const exportExcel = () => {
    exportReport.mutate(
      {
        asOf,
        query: params.query,
        site: params.site,
        employeeType: params.employeeType,
        employeeStatus: params.employeeStatus,
        productionSection: params.productionSection,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          downloadBlob(blob, fileName)
          toast.success('Laporan karyawan berhasil diunduh.')
        },
        onError: () => toast.error('Ekspor laporan karyawan gagal.'),
      }
    )
  }

  return (
    <Main>
      <div className='mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Pusat Laporan</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Laporan Karyawan
          </h1>
          <p className='text-sm text-muted-foreground'>
            Posisi karyawan sesuai histori kerja pada tanggal yang dipilih.
          </p>
        </div>
        <div className='flex w-full flex-col gap-3 sm:flex-row sm:items-end lg:w-auto'>
          <div className='w-full sm:w-64'>
            <label className='mb-1.5 block text-sm font-medium'>
              Posisi per tanggal
            </label>
            <DatePicker
              selected={dateOnlyFromInput(asOf)}
              onSelect={(value) =>
                navigate({
                  search: (previous) => ({
                    ...previous,
                    asOf: dateOnlyToInput(value) || undefined,
                    page: undefined,
                  }),
                })
              }
              toYear={new Date().getFullYear() + 1}
            />
          </div>
          <Button
            onClick={exportExcel}
            disabled={exportReport.isPending || result.isPending}
            className='w-full sm:w-auto'
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

      {summary && (
        <div className='mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6'>
          <Kpi label='Total karyawan' value={summary.total} icon={Users} />
          <Kpi label='Aktif' value={summary.active} icon={BriefcaseBusiness} />
          <Kpi label='Nonaktif' value={summary.inactive} icon={Users} />
          <Kpi label='Resign' value={summary.resigned} icon={Users} />
          <Kpi label='Cuti panjang' value={summary.leave} icon={Users} />
          <Kpi
            label='Perlu diperiksa'
            value={summary.ambiguousHistory}
            icon={BriefcaseBusiness}
          />
        </div>
      )}

      <div className='space-y-4'>
        <DataTableToolbar
          table={table}
          searchPlaceholder='Cari nama atau nomor karyawan...'
          searchDebounceMs={500}
          filters={[
            {
              columnId: 'site',
              title: 'Site',
              options: (meta.data?.sites ?? []).map(option),
            },
            {
              columnId: 'employeeType',
              title: 'Jenis karyawan',
              options: (meta.data?.employeeTypes ?? []).map(option),
            },
            {
              columnId: 'employeeStatus',
              title: 'Status',
              options: (meta.data?.employeeStatuses ?? []).map(option),
            },
            {
              columnId: 'productionSection',
              title: 'Bagian produksi',
              options: (meta.data?.productionSections ?? []).map((item) => ({
                value: item.uid,
                label: `${item.moduleName} - ${item.name}`,
              })),
            },
          ]}
        />
        {result.isFetching && !result.isPending && <Refreshing />}
        {result.isPending ? (
          <EmptyState text='Memuat laporan karyawan...' loading />
        ) : result.isError ? (
          <EmptyState text='Laporan karyawan gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EmptyState>
        ) : !result.data?.items.length ? (
          <EmptyState text='Tidak ada karyawan yang sesuai filter.' />
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
                <EmployeeCard
                  key={item.employeeUid}
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

function employeeColumns(returnTo?: string): ColumnDef<EmployeeReportItem>[] {
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
          {row.original.historyStatus === 'AMBIGUOUS' && (
            <Badge variant='destructive' className='mt-1'>
              Riwayat kerja perlu diperiksa
            </Badge>
          )}
        </div>
      ),
      meta: { label: 'Karyawan' },
    },
    filterColumn(
      'site',
      'Site',
      (item) => item.site.code,
      (item) => item.site.name
    ),
    filterColumn(
      'employeeType',
      'Jenis & Jabatan',
      (item) => item.employeeType.code,
      (item) => `${item.employeeType.name}\n${item.position?.name ?? '-'}`
    ),
    {
      id: 'productionSection',
      enableSorting: false,
      accessorFn: (item) => item.productionSection?.uid ?? '',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Bagian Produksi' />
      ),
      cell: ({ row }) => (
        <div>
          <p>{row.original.productionModule?.name ?? '-'}</p>
          <p className='text-xs text-muted-foreground'>
            {row.original.productionSection?.name ?? '-'}
          </p>
        </div>
      ),
      meta: { label: 'Bagian Produksi' },
    },
    filterColumn(
      'employeeStatus',
      'Status',
      (item) => item.employeeStatus.code,
      (item) => item.employeeStatus.name,
      true
    ),
    {
      id: 'period',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Masa Berlaku' />
      ),
      cell: ({ row }) => (
        <span className='text-sm whitespace-nowrap'>
          {dateLabel(row.original.effectiveFrom)} -{' '}
          {row.original.effectiveTo
            ? dateLabel(row.original.effectiveTo)
            : 'seterusnya'}
        </span>
      ),
      meta: { label: 'Masa Berlaku' },
    },
  ]
}

function filterColumn(
  id: string,
  title: string,
  accessor: (item: EmployeeReportItem) => string,
  display: (item: EmployeeReportItem) => string,
  badge = false
): ColumnDef<EmployeeReportItem> {
  return {
    id,
    accessorFn: accessor,
    enableSorting: false,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={title} />
    ),
    cell: ({ row }) => {
      const lines = display(row.original).split('\n')
      return badge ? (
        <Badge variant='outline'>{lines[0]}</Badge>
      ) : (
        <div>
          <p>{lines[0]}</p>
          {lines[1] && (
            <p className='text-xs text-muted-foreground'>{lines[1]}</p>
          )}
        </div>
      )
    },
    filterFn: (row, columnId, value: string[]) =>
      value.includes(row.getValue(columnId)),
    meta: { label: title },
  }
}

function EmployeeCard({
  item,
  returnTo,
}: {
  item: EmployeeReportItem
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
              {item.employeeNumber} · {item.site.name}
            </p>
          </div>
          <Badge variant='outline'>{item.employeeStatus.name}</Badge>
        </div>
        {item.historyStatus === 'AMBIGUOUS' && (
          <Badge variant='destructive' className='mt-3'>
            Riwayat kerja perlu diperiksa
          </Badge>
        )}
        <div className='mt-3 grid grid-cols-2 gap-3 text-sm'>
          <Info label='Jenis' value={item.employeeType.name} />
          <Info label='Jabatan' value={item.position?.name ?? '-'} />
          <Info
            label='Bagian produksi'
            value={item.productionSection?.name ?? '-'}
          />
          <Info label='Berlaku sejak' value={dateLabel(item.effectiveFrom)} />
        </div>
      </CardContent>
    </Card>
  )
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
  icon: typeof Users
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
        <Users className='size-5' />
      )}
      <p>{text}</p>
      {children}
    </div>
  )
}

function option(item: { code: string; name: string }) {
  return { value: item.code, label: item.name }
}

function pageSummary(page: number, pageSize: number, total: number) {
  return (
    <>
      Menampilkan {total ? (page - 1) * pageSize + 1 : 0}–
      {Math.min(page * pageSize, total)} dari {numberLabel(total)} data.
    </>
  )
}
