import { useEffect, useMemo, useRef, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table'
import {
  Boxes,
  CalendarDays,
  ChevronRight,
  Eye,
  PackageCheck,
  RefreshCw,
  Users,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useTableUrlState, type NavigateFn } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DataTableActionButton,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import { canViewProductionWages } from '@/features/auth/production-access'
import {
  useProductionDailyEmployees,
  useProductionDailyTabs,
  useProductionDailyTransactions,
  useProductionTransactionModuleOptions,
} from './data/queries'
import type { ProductionDailyEmployee, ProductionDailyParams } from './domain'
import { TransactionDetailSheet } from './production-transactions-page'

const sites = ['JEPARA', 'SEMARANG', 'KLATEN']
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
const number = (value: string | number, precision = 0) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: precision }).format(
    Number(value)
  )
const money = (value: string) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
const time = (value: string) =>
  new Date(value).toLocaleTimeString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit',
    minute: '2-digit',
  })
function useVisible() {
  const [visible, setVisible] = useState(
    () => document.visibilityState !== 'hidden'
  )
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}

export function ProductionDailySummaryPage(props: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const session = useAuthStore((state) => state.session)
  const accessKey = JSON.stringify(
    session
      ? [
          session.user.uid,
          session.user.role,
          session.user.roles,
          session.permissions,
          session.user.siteAccess,
          session.user.productionModuleAccess ?? [],
        ]
      : null
  )
  // Reset panels synchronously when the account or access changes, including cached same-job results.
  return <DailySummaryBody key={accessKey} {...props} />
}

function DailySummaryBody({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const session = useAuthStore((state) => state.session)
  const roleWages = canViewProductionWages(session)
  const visible = useVisible()
  const [selected, setSelected] = useState<ProductionDailyEmployee>()
  const [transactionUid, setTransactionUid] = useState<string>()
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    moduleUid: false,
  })
  const polling = visible && !selected && !transactionUid
  const filters: ProductionDailyParams = {
    date: roleWages ? text(search.date) : undefined,
    site: strings(search.site),
    moduleUid: strings(search.moduleUid),
  }
  const tabs = useProductionDailyTabs(filters, polling)
  const metadata = tabs.data
  const active =
    metadata?.tabs.find((tab) => tab.jobUid === search.jobUid) ??
    metadata?.tabs[0]
  const modules = useProductionTransactionModuleOptions(filters.site)
  const url = useTableUrlState({
    search,
    navigate,
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'moduleUid', searchKey: 'moduleUid', type: 'array' },
    ],
  })
  const employees = useProductionDailyEmployees(
    {
      ...filters,
      date: metadata?.effectiveDate,
      jobUid: active?.jobUid,
      query: text(search.filter),
      page: url.pagination.pageIndex + 1,
      pageSize: url.pagination.pageSize,
    },
    polling && Boolean(metadata)
  )
  const wages =
    roleWages &&
    metadata?.canViewWages === true &&
    employees.data?.canViewWages === true
  const patch = (value: Record<string, unknown>) =>
    navigate({
      search: (previous) => ({ ...previous, ...value, page: undefined }),
    })
  const scopeKey = JSON.stringify([
    filters.date,
    filters.site,
    filters.moduleUid,
    active?.jobUid,
  ])
  useEffect(() => {
    setSelected(undefined)
    setTransactionUid(undefined)
  }, [scopeKey])
  useEffect(() => {
    if (!metadata) return
    if (
      (!roleWages && search.date) ||
      (search.jobUid && search.jobUid !== active?.jobUid)
    ) {
      navigate({
        replace: true,
        search: (previous) => ({
          ...previous,
          date: roleWages ? previous.date : undefined,
          jobUid: active?.jobUid,
          page: undefined,
        }),
      })
    }
  }, [
    metadata,
    active?.jobUid,
    roleWages,
    search.date,
    search.jobUid,
    navigate,
  ])
  useEffect(() => {
    if (!modules.data) return
    const retained = strings(search.moduleUid).filter((uid) =>
      modules.data.items.some((module) => module.uid === uid)
    )
    if (retained.length !== strings(search.moduleUid).length)
      navigate({
        replace: true,
        search: (previous) => ({
          ...previous,
          moduleUid: retained.length ? retained : undefined,
          page: undefined,
        }),
      })
  }, [modules.data, search.moduleUid, navigate])
  // A server midnight rollover changes the effective day even when the URL has no date.
  const previousDate = useRef<string | undefined>(undefined)
  useEffect(() => {
    setSelected(undefined)
    setTransactionUid(undefined)
    if (
      previousDate.current &&
      previousDate.current !== metadata?.effectiveDate
    ) {
      navigate({
        replace: true,
        search: (previous) => ({
          ...previous,
          page: undefined,
          jobUid: undefined,
        }),
      })
    }
    previousDate.current = metadata?.effectiveDate
  }, [metadata?.effectiveDate, navigate])
  const pageCount = Math.ceil(
    (employees.data?.total ?? 0) / url.pagination.pageSize
  )
  useEffect(() => {
    if (
      employees.data &&
      !employees.isFetching &&
      url.pagination.pageIndex > 0 &&
      url.pagination.pageIndex >= Math.max(1, pageCount)
    )
      navigate({
        replace: true,
        search: (previous) => ({ ...previous, page: undefined }),
      })
  }, [
    employees.data,
    employees.isFetching,
    pageCount,
    url.pagination.pageIndex,
    navigate,
  ])
  const columns = useMemo<ColumnDef<ProductionDailyEmployee>[]>(
    () => [
      {
        id: 'employee',
        header: 'Karyawan',
        cell: ({ row }) => (
          <>
            <button
              className='text-left font-medium underline-offset-4 hover:underline'
              onClick={() => setSelected(row.original)}
            >
              {row.original.employee.fullName}
            </button>
            <div className='text-[11px] text-muted-foreground'>
              {row.original.employee.employeeNumber}
            </div>
          </>
        ),
      },
      {
        id: 'site',
        header: 'Site / Modul',
        cell: ({ row }) => (
          <>
            <span>{row.original.site.name}</span>
            <div className='max-w-56 text-[11px] whitespace-normal text-muted-foreground'>
              {row.original.modules.map((module) => module.name).join(', ') ||
                '\u2014'}
            </div>
          </>
        ),
        enableHiding: false,
      },
      {
        id: 'moduleUid',
        header: 'Modul',
        cell: () => null,
        enableHiding: false,
      },
      {
        id: 'quantity',
        header: 'Hasil Setoran',
        cell: ({ row }) => (
          <strong>
            {number(row.original.quantity, row.original.unit.decimalPrecision)}{' '}
            <span className='font-normal text-muted-foreground'>
              {row.original.unit.code}
            </span>
          </strong>
        ),
      },
      {
        id: 'payable',
        header: 'Hasil Dibayar',
        cell: ({ row }) => (
          <>
            {number(
              row.original.payableQuantity,
              row.original.unit.decimalPrecision
            )}{' '}
            {row.original.unit.code}
          </>
        ),
      },
      {
        id: 'count',
        header: 'Setoran',
        cell: ({ row }) => number(row.original.transactionCount),
      },
      {
        id: 'last',
        header: 'Terakhir',
        cell: ({ row }) => time(row.original.lastSubmittedAt),
      },
      ...(wages
        ? [
            {
              id: 'gross',
              header: 'Nilai Bruto',
              cell: ({ row }: { row: { original: ProductionDailyEmployee } }) =>
                money(row.original.grossAmount ?? '0'),
            },
          ]
        : []),
      {
        id: 'actions',
        header: '',
        enableHiding: false,
        cell: ({ row }) => (
          <DataTableActionButton
            label='Lihat setoran'
            onClick={() => setSelected(row.original)}
          >
            <Eye className='size-4' />
          </DataTableActionButton>
        ),
      },
    ],
    [wages]
  )
  const table = useReactTable({
    data: employees.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualFiltering: true,
    pageCount: Math.max(1, pageCount),
    state: {
      pagination: url.pagination,
      globalFilter: text(search.filter) ?? '',
      columnFilters: [
        { id: 'site', value: filters.site },
        { id: 'moduleUid', value: filters.moduleUid },
      ].filter((filter) => filter.value?.length),
      columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: url.onPaginationChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onGlobalFilterChange: url.onGlobalFilterChange,
  })
  const global =
    session?.user.roles?.some(
      (role) => role === 'SUPER_ADMIN' || role === 'DIRECTOR'
    ) ||
    session?.user.role === 'SUPER_ADMIN' ||
    session?.user.role === 'DIRECTOR'
  const allowedSites =
    global &&
    !session?.user.roles?.includes('QC') &&
    session?.user.role !== 'QC'
      ? sites
      : (session?.user.siteAccess ?? [])
  const updatedAt = Math.max(tabs.dataUpdatedAt, employees.dataUpdatedAt)
  return (
    <Main fluid className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h1 className='text-xl font-semibold tracking-tight'>
            Ringkasan Produksi
          </h1>
          <p className='text-xs text-muted-foreground'>
            Hasil setoran per pekerjaan dan karyawan.
          </p>
        </div>
        <div className='flex items-center gap-2'>
          {roleWages && metadata?.canChangeDate ? (
            <div>
              <Label className='sr-only' htmlFor='daily-production-date'>
                Tanggal produksi
              </Label>
              <DatePicker
                id='daily-production-date'
                selected={new Date(`${metadata.effectiveDate}T12:00:00`)}
                onSelect={(date) => {
                  if (date) {
                    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                    patch({
                      date: day === metadata.serverToday ? undefined : day,
                      jobUid: undefined,
                    })
                  }
                }}
                triggerClassName='h-9 w-auto'
              />
            </div>
          ) : (
            <span className='flex items-center gap-1.5 text-sm'>
              <CalendarDays className='size-4 text-muted-foreground' />
              {metadata
                ? new Date(
                    `${metadata.effectiveDate}T12:00:00`
                  ).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : 'Hari ini'}
            </span>
          )}
          <Button
            size='sm'
            variant='outline'
            disabled={tabs.isFetching || employees.isFetching}
            onClick={() => {
              void tabs.refetch()
              if (active) void employees.refetch()
            }}
          >
            <RefreshCw className='size-4' />
            Refresh
          </Button>
        </div>
      </div>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari nama / NIK...'
        searchDebounceMs={350}
        filters={[
          {
            columnId: 'site',
            title: 'Site',
            options: allowedSites.map((site) => ({
              value: site,
              label: site.charAt(0) + site.slice(1).toLowerCase(),
            })),
          },
          {
            columnId: 'moduleUid',
            title: 'Modul Produksi',
            options: (modules.data?.items ?? []).map((module) => ({
              value: module.uid,
              label: `${module.name} / ${module.siteName}`,
            })),
          },
        ]}
      />
      {modules.isError && (
        <p role='alert' className='text-xs text-destructive'>
          Pilihan modul belum termuat.{' '}
          <button className='underline' onClick={() => void modules.refetch()}>
            Coba lagi
          </button>
        </p>
      )}
      <div className='text-[11px] text-muted-foreground' aria-live='polite'>
        {updatedAt
          ? `Diperbarui ${time(new Date(updatedAt).toISOString())} WIB`
          : 'Memuat data...'}
        {!polling
          ? ' / Pembaruan otomatis dijeda'
          : ' / Otomatis setiap 60 detik'}
      </div>
      {tabs.isError ? (
        <ErrorState onRetry={() => void tabs.refetch()} />
      ) : tabs.isPending ? (
        <p
          role='status'
          className='py-10 text-center text-sm text-muted-foreground'
        >
          Memuat pekerjaan...
        </p>
      ) : !active ? (
        <p className='rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground'>
          Belum ada setoran pada tanggal dan filter ini.
        </p>
      ) : (
        <Tabs
          value={active.jobUid}
          onValueChange={(jobUid) => patch({ jobUid })}
        >
          <div className='max-w-full overflow-x-auto pb-1'>
            <TabsList className='h-auto w-max gap-1'>
              <>
                {metadata?.tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.jobUid}
                    value={tab.jobUid}
                    className='h-10 gap-2 px-4'
                  >
                    <Boxes className='size-4' />
                    {tab.jobName}
                    <Badge variant='secondary' className='text-[10px]'>
                      {number(tab.employeeCount)} orang
                    </Badge>
                  </TabsTrigger>
                ))}
              </>
            </TabsList>
          </div>
          <TabsContent value={active.jobUid} className='space-y-3'>
            <div className='grid grid-cols-2 gap-2 lg:grid-cols-3'>
              <Kpi
                icon={<Users className='size-4' />}
                label='Pekerja'
                value={`${number(active.employeeCount)} orang`}
              />
              <Kpi
                icon={<PackageCheck className='size-4' />}
                label='Hasil Setoran'
                value={active.units
                  .map(
                    (unit) =>
                      `${number(unit.quantity, unit.decimalPrecision)} ${unit.unitCode}`
                  )
                  .join(' / ')}
              />
              <Kpi
                icon={<Boxes className='size-4' />}
                label='Jumlah Setoran'
                value={number(active.transactionCount)}
              />
            </div>
            {employees.isError ? (
              <ErrorState onRetry={() => void employees.refetch()} />
            ) : employees.isPending ? (
              <p
                role='status'
                className='py-10 text-center text-sm text-muted-foreground'
              >
                Memuat hasil karyawan...
              </p>
            ) : !employees.data?.items.length ? (
              <p className='py-10 text-center text-sm text-muted-foreground'>
                Tidak ada karyawan yang sesuai pencarian.
              </p>
            ) : (
              <>
                <div className='hidden overflow-x-auto rounded-md border md:block'>
                  <Table>
                    <TableHeader>
                      {table.getHeaderGroups().map((group) => (
                        <TableRow key={group.id}>
                          {group.headers.map((header) => (
                            <TableHead key={header.id}>
                              {flexRender(
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
                <div className='divide-y rounded-md border md:hidden'>
                  {employees.data.items.map((item) => (
                    <button
                      key={`${item.employee.uid}:${item.site.uid}:${item.unit.uid}`}
                      className='flex min-h-16 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                      onClick={() => setSelected(item)}
                    >
                      <div className='min-w-0'>
                        <p className='truncate text-sm font-medium'>
                          {item.employee.fullName}
                        </p>
                        <p className='text-[11px] text-muted-foreground'>
                          {item.employee.employeeNumber} / {item.site.name}
                        </p>
                        <p className='text-[11px] text-muted-foreground'>
                          {item.transactionCount} setoran /{' '}
                          {time(item.lastSubmittedAt)} WIB
                        </p>
                      </div>
                      <div className='flex shrink-0 items-center gap-1'>
                        <span className='text-right text-base font-semibold'>
                          {number(item.quantity, item.unit.decimalPrecision)}
                          <small className='block text-[10px] font-normal text-muted-foreground'>
                            {item.unit.code}
                          </small>
                        </span>
                        <ChevronRight className='size-4 text-muted-foreground' />
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
            <DataTablePagination
              table={table}
              summary={`${number(employees.data?.total ?? 0)} kelompok karyawan / site / satuan`}
            />
          </TabsContent>
        </Tabs>
      )}
      {selected && active && (
        <EmployeeDeposits
          employee={selected}
          params={{
            ...filters,
            date: metadata?.effectiveDate,
            jobUid: active.jobUid,
            site: [selected.site.code],
            unitUid: selected.unit.uid,
          }}
          wages={wages}
          onClose={() => setSelected(undefined)}
          onTransaction={setTransactionUid}
        />
      )}
      <TransactionDetailSheet
        uid={transactionUid}
        open={Boolean(transactionUid)}
        onOpenChange={(open) => {
          if (!open) setTransactionUid(undefined)
        }}
        onOpenTransaction={setTransactionUid}
      />
    </Main>
  )
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className='flex min-h-[68px] items-center justify-between gap-2 rounded-lg border px-3 py-2.5'>
      <div>
        <p className='text-[11px] text-muted-foreground'>{label}</p>
        <p className='text-base font-semibold tabular-nums'>{value}</p>
      </div>
      <span className='text-muted-foreground'>{icon}</span>
    </div>
  )
}
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role='alert'
      className='rounded-md border border-destructive/30 p-4 text-sm'
    >
      <p>Data belum berhasil dimuat.</p>
      <Button variant='outline' size='sm' className='mt-2' onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  )
}
function EmployeeDeposits({
  employee,
  params,
  wages,
  onClose,
  onTransaction,
}: {
  employee: ProductionDailyEmployee
  params: ProductionDailyParams
  wages: boolean
  onClose: () => void
  onTransaction: (uid: string) => void
}) {
  const [page, setPage] = useState(0)
  const result = useProductionDailyTransactions(employee.employee.uid, {
    ...params,
    page: page + 1,
    pageSize: 50,
  })
  const table = useReactTable({
    data: result.data?.items ?? [],
    columns: [],
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil((result.data?.total ?? 0) / 50)),
    state: { pagination: { pageIndex: page, pageSize: 50 } },
    onPaginationChange: (updater) => {
      const next =
        typeof updater === 'function'
          ? updater({ pageIndex: page, pageSize: 50 })
          : updater
      setPage(next.pageIndex)
    },
  })
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className='w-full overflow-y-auto sm:max-w-lg'>
        <SheetHeader>
          <SheetTitle>{employee.employee.fullName}</SheetTitle>
          <SheetDescription>
            {employee.employee.employeeNumber} / {employee.site.name} /{' '}
            {employee.job.name}
            <br />
            {params.date} / {employee.unit.code}
          </SheetDescription>
        </SheetHeader>
        <div className='space-y-3 px-4 pb-6'>
          {result.isError ? (
            <ErrorState onRetry={() => void result.refetch()} />
          ) : result.isPending ? (
            <p role='status' className='py-6 text-sm text-muted-foreground'>
              Memuat rincian setoran...
            </p>
          ) : (
            result.data?.items.map((item) => (
              <div key={item.uid} className='space-y-2 rounded-lg border p-3'>
                <div className='flex items-start justify-between gap-2'>
                  <div>
                    <p className='text-xs font-medium'>
                      {time(item.transactionAt)} WIB / {item.transactionNumber}
                    </p>
                    <p className='text-[11px] text-muted-foreground'>
                      {item.module?.name ?? 'Modul tidak tercatat'}
                    </p>
                  </div>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => onTransaction(item.uid)}
                  >
                    <Eye className='size-4' />
                    Detail
                  </Button>
                </div>
                <div className='flex flex-wrap items-baseline gap-x-4 gap-y-1'>
                  <p className='font-semibold'>
                    {number(item.quantity, item.unit.decimalPrecision)}{' '}
                    <span className='text-xs font-normal'>
                      {item.unit.code}
                    </span>
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    Dibayar{' '}
                    {number(
                      item.payableQuantity ?? item.quantity,
                      item.unit.decimalPrecision
                    )}{' '}
                    {item.unit.code}
                  </p>
                  {wages &&
                    result.data?.canViewWages &&
                    item.grossAmount !== undefined && (
                      <p className='text-xs'>{money(item.grossAmount)}</p>
                    )}
                </div>
                {item.qc && (
                  <div className='space-y-1 border-t pt-2 text-xs'>
                    <p>
                      {item.qc.brand?.name ?? 'Tanpa brand'}
                      {(item.qc.weight1Grams !== null ||
                        item.qc.weight2Grams !== null) && (
                        <>
                          {' / '}
                          {item.qc.weight1Grams !== null
                            ? number(item.qc.weight1Grams, 2)
                            : '\u2014'}{' '}
                          gr /{' '}
                          {item.qc.weight2Grams !== null
                            ? number(item.qc.weight2Grams, 2)
                            : '\u2014'}{' '}
                          gr
                        </>
                      )}
                    </p>
                    <div className='flex flex-wrap gap-1'>
                      {item.qc.defects
                        .filter((defect) => defect.quantity > 0)
                        .map((defect) => (
                          <Badge
                            key={defect.uid}
                            variant='secondary'
                            className='text-[10px]'
                          >
                            {defect.name}: {number(defect.quantity)}
                          </Badge>
                        ))}
                    </div>
                    {(item.qc.weight1Grams !== null ||
                      item.qc.weight2Grams !== null ||
                      item.qc.defects.length > 0) && (
                      <p className='text-[10px] text-muted-foreground'>
                        {number(item.rejectOccurrences)} kejadian defect (bukan
                        batang rusak unik)
                      </p>
                    )}
                  </div>
                )}
                {item.payrollLockedAt && (
                  <Badge variant='outline'>Terkunci Payroll</Badge>
                )}
              </div>
            ))
          )}
          <DataTablePagination
            table={table}
            pageSizeOptions={[50]}
            summary={`${result.data?.total ?? 0} setoran`}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
