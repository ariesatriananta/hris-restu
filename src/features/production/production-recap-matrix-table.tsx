import { useMemo, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { Banknote, Boxes, RefreshCcw, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTableUrlState, type NavigateFn } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'
import type {
  ProductionRecapMatrixCell,
  ProductionRecapMatrixItem,
  ProductionRecapMatrixResult,
  ProductionRecapQuantity,
} from './domain'
import {
  formatProductionRecapQuantity,
  productionRecapPayrollLabel,
} from './production-recap-policy'

export type ProductionRecapCellMode = 'quantity' | 'gross'

export function ProductionRecapMatrixTable({
  data,
  search,
  navigate,
  cellMode,
  onCellModeChange,
  isPending,
  isFetching,
  isError,
  onRetry,
  onDetail,
}: {
  data?: ProductionRecapMatrixResult
  search: Record<string, unknown>
  navigate: NavigateFn
  cellMode: ProductionRecapCellMode
  onCellModeChange: (mode: ProductionRecapCellMode) => void
  isPending: boolean
  isFetching: boolean
  isError: boolean
  onRetry: () => void
  onDetail: (item: ProductionRecapMatrixItem) => void
}) {
  const columns = useMemo<ColumnDef<ProductionRecapMatrixItem>[]>(
    () => matrixColumns(data?.dates ?? [], cellMode, onDetail),
    [cellMode, data?.dates, onDetail]
  )
  const url = useTableUrlState({
    search,
    navigate,
    pagination: {
      pageKey: 'matrixPage',
      pageSizeKey: 'matrixPageSize',
      defaultPageSize: 50,
    },
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'jobUid', searchKey: 'jobUid', type: 'array' },
      { columnId: 'employeeType', searchKey: 'employeeType', type: 'array' },
      {
        columnId: 'productionSectionUid',
        searchKey: 'productionSectionUid',
        type: 'array',
      },
      { columnId: 'workGroupUid', searchKey: 'workGroupUid', type: 'array' },
    ],
  })
  // TanStack Table mengembalikan callback stateful; ini pola tabel repo.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    state: {
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
    },
    initialState: {
      columnVisibility: {
        jobUid: false,
        productionSectionUid: false,
        workGroupUid: false,
      },
    },
    pageCount: Math.max(
      1,
      Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 50))
    ),
    manualFiltering: true,
    manualPagination: true,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => `${row.employee.uid}:${row.site.code}`,
  })

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between'>
        <div className='min-w-0 flex-1 overflow-x-auto pb-1'>
          <div className='min-w-max sm:min-w-0'>
            <DataTableToolbar
              table={table}
              searchPlaceholder='Cari nama atau nomor karyawan...'
              searchDebounceMs={500}
              showViewOptions={false}
              filters={[
                {
                  columnId: 'site',
                  title: 'Site',
                  options: data?.facets.sites ?? [],
                },
                {
                  columnId: 'jobUid',
                  title: 'Pekerjaan',
                  options: data?.facets.jobs ?? [],
                },
                {
                  columnId: 'employeeType',
                  title: 'Jenis',
                  options: data?.facets.employeeTypes ?? [],
                },
                {
                  columnId: 'productionSectionUid',
                  title: 'Bagian produksi',
                  options: data?.facets.productionSections ?? [],
                },
                {
                  columnId: 'workGroupUid',
                  title: 'Grup kerja',
                  options: data?.facets.workGroups ?? [],
                },
              ]}
            />
          </div>
        </div>
        <CellModeSwitch value={cellMode} onChange={onCellModeChange} />
      </div>

      <div className='flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground'>
        <span className='font-semibold text-foreground'>Isi sel:</span>
        <span>— Tidak ada setoran</span>
        <span>Hover untuk rincian pekerjaan dan transaksi</span>
        <span>Kuantitas dengan satuan berbeda tidak digabung</span>
      </div>

      {isFetching && !isPending ? (
        <p role='status' className='text-xs text-muted-foreground'>
          Memperbarui rincian per tanggal...
        </p>
      ) : null}

      {isPending ? (
        <MatrixState>Memuat rincian produksi...</MatrixState>
      ) : isError ? (
        <MatrixState>
          Rincian per tanggal gagal dimuat.
          <Button size='sm' variant='outline' onClick={onRetry}>
            <RefreshCcw /> Coba lagi
          </Button>
        </MatrixState>
      ) : !data?.items.length ? (
        <MatrixState>
          <Users className='size-4' /> Tidak ada data yang sesuai filter.
        </MatrixState>
      ) : (
        <>
          <p className='text-[10px] text-muted-foreground sm:hidden'>
            Geser tabel ke samping untuk melihat tanggal lainnya.
          </p>
          <div
            className='overflow-x-auto rounded-md border bg-card'
            role='region'
            aria-label='Rincian produksi per karyawan dan tanggal'
            tabIndex={0}
          >
            <table className='w-max min-w-full border-separate border-spacing-0 text-[10px] leading-tight'>
              <thead className='sticky top-0 z-30 bg-muted/95 shadow-sm backdrop-blur'>
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
                      <th
                        key={header.id}
                        scope='col'
                        className={cn(
                          'h-12 border-r border-b px-1.5 text-center font-semibold whitespace-nowrap last:border-r-0',
                          header.column.columnDef.meta?.thClassName
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className='group'>
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className={cn(
                          'h-12 border-r border-b bg-card px-1 text-center align-middle group-last:border-b-0 group-hover:bg-muted/35 last:border-r-0',
                          cell.column.columnDef.meta?.tdClassName
                        )}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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

function CellModeSwitch({
  value,
  onChange,
}: {
  value: ProductionRecapCellMode
  onChange: (value: ProductionRecapCellMode) => void
}) {
  return (
    <div
      className='inline-flex h-9 shrink-0 self-start rounded-md border bg-background p-0.5'
      role='group'
      aria-label='Mode isi sel'
    >
      <Button
        type='button'
        size='sm'
        variant={value === 'quantity' ? 'secondary' : 'ghost'}
        className='h-7 px-2.5 text-xs shadow-none'
        aria-pressed={value === 'quantity'}
        onClick={() => onChange('quantity')}
      >
        <Boxes className='size-3.5' /> Hasil satuan
      </Button>
      <Button
        type='button'
        size='sm'
        variant={value === 'gross' ? 'secondary' : 'ghost'}
        className='h-7 px-2.5 text-xs shadow-none'
        aria-pressed={value === 'gross'}
        onClick={() => onChange('gross')}
      >
        <Banknote className='size-3.5' /> Nilai bruto
      </Button>
    </div>
  )
}

function matrixColumns(
  dates: ProductionRecapMatrixResult['dates'],
  cellMode: ProductionRecapCellMode,
  onDetail: (item: ProductionRecapMatrixItem) => void
): ColumnDef<ProductionRecapMatrixItem>[] {
  return [
    {
      id: 'employee',
      enableHiding: false,
      header: 'Karyawan',
      meta: {
        thClassName:
          'sticky left-0 z-40 min-w-48 bg-muted text-left shadow-[2px_0_0_0_hsl(var(--border))]',
        tdClassName:
          'sticky left-0 z-20 min-w-48 bg-card px-2 text-left shadow-[2px_0_0_0_hsl(var(--border))] group-hover:bg-muted',
      },
      cell: ({ row }) => {
        const item = row.original
        return (
          <button
            type='button'
            className='max-w-44 text-left focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
            onClick={() => onDetail(item)}
            aria-label={`Lihat rincian ${item.employee.fullName}`}
          >
            <span className='block truncate text-[11px] font-semibold text-foreground hover:underline'>
              {item.employee.fullName}
            </span>
            <span className='block truncate text-[10px] text-muted-foreground'>
              {item.employee.employeeNumber}
            </span>
            <span className='block truncate text-[9px] text-muted-foreground'>
              {item.placement.position?.name ?? 'Tanpa jabatan'}
              {item.placementChanged ? ' · penempatan berubah' : ''}
            </span>
          </button>
        )
      },
    },
    {
      id: 'site',
      accessorFn: (item) => item.site.code,
      enableHiding: false,
      header: 'Site',
      meta: {
        thClassName: 'sticky left-48 z-40 min-w-24 bg-muted',
        tdClassName:
          'sticky left-48 z-20 min-w-24 bg-card group-hover:bg-muted',
      },
      cell: ({ row }) => (
        <span className='font-medium whitespace-nowrap'>
          {row.original.site.code}
        </span>
      ),
    },
    {
      id: 'employeeType',
      accessorFn: (item) => item.placement.employeeType.code,
      enableHiding: false,
      header: 'Jenis',
      meta: {
        thClassName:
          'sticky left-72 z-40 min-w-24 bg-muted shadow-[2px_0_0_0_hsl(var(--border))]',
        tdClassName:
          'sticky left-72 z-20 min-w-24 bg-card shadow-[2px_0_0_0_hsl(var(--border))] group-hover:bg-muted',
      },
      cell: ({ row }) => (
        <span className='whitespace-nowrap'>
          {row.original.placement.employeeType.name}
        </span>
      ),
    },
    hiddenFilterColumn('jobUid', (item) =>
      Object.values(item.days)
        .flatMap((day) => day?.jobs ?? [])
        .map((job) => job.uid)
    ),
    hiddenFilterColumn(
      'productionSectionUid',
      (item) => item.placement.productionSection?.uid
    ),
    hiddenFilterColumn('workGroupUid', (item) => item.placement.workGroup?.uid),
    ...dates.map<ColumnDef<ProductionRecapMatrixItem>>((date) => ({
      id: date.date,
      enableHiding: false,
      header: () => (
        <span className='grid leading-tight'>
          <span className='text-[10px] font-medium text-muted-foreground'>
            {shortDay(date.dayName)}
          </span>
          <span className='tabular-nums'>{dayNumber(date.date)}</span>
        </span>
      ),
      meta: {
        thClassName: isWeekend(date.date) ? 'min-w-20 bg-muted' : 'min-w-20',
        tdClassName: isWeekend(date.date) ? 'bg-muted/20' : undefined,
      },
      cell: ({ row }) => (
        <MatrixCell value={row.original.days[date.date]} mode={cellMode} />
      ),
    })),
  ]
}

function hiddenFilterColumn(
  id: string,
  accessorFn: (item: ProductionRecapMatrixItem) => unknown
): ColumnDef<ProductionRecapMatrixItem> {
  return {
    id,
    accessorFn,
    enableHiding: false,
    header: () => null,
    cell: () => null,
    meta: { thClassName: 'hidden', tdClassName: 'hidden' },
  }
}

function MatrixCell({
  value,
  mode,
}: {
  value?: ProductionRecapMatrixCell | null
  mode: ProductionRecapCellMode
}) {
  if (!value) {
    return (
      <span
        className='text-muted-foreground/60'
        title='Tidak ada setoran produksi'
        aria-label='Tidak ada setoran produksi'
      >
        —
      </span>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className='mx-auto flex min-h-8 max-w-28 min-w-16 cursor-help flex-col items-center justify-center rounded px-1 py-0.5 font-medium tabular-nums hover:bg-primary/[0.06] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
          aria-label={cellAriaLabel(value, mode)}
        >
          {mode === 'gross' ? (
            <span className='text-[10px] font-semibold whitespace-nowrap text-emerald-700 dark:text-emerald-400'>
              {formatCompactRupiah(value.grossAmount)}
            </span>
          ) : (
            <CompactQuantities items={value.quantityTotals} />
          )}
          <span className='text-[8px] font-normal text-muted-foreground'>
            {value.transactionCount} trx
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-80 space-y-2 p-3'>
        <div>
          <p className='font-semibold'>Rincian produksi</p>
          <p className='text-xs text-muted-foreground'>
            {value.transactionCount} transaksi ·{' '}
            {formatRupiah(value.grossAmount)}
          </p>
          <p className='text-[10px] text-muted-foreground'>
            Payroll: {productionRecapPayrollLabel(value.payrollStatus)}
          </p>
        </div>
        <div className='space-y-1 border-t pt-2'>
          {value.jobs.map((job) => (
            <div key={job.uid} className='text-xs'>
              <p className='font-medium'>{job.name}</p>
              <p className='text-muted-foreground'>
                {job.transactionCount} trx · {quantityText(job.quantityTotals)}{' '}
                · {formatRupiah(job.grossAmount)}
              </p>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function CompactQuantities({ items }: { items: ProductionRecapQuantity[] }) {
  const visible = items.slice(0, 2)
  return (
    <>
      {visible.map((item) => (
        <span
          key={item.unit.uid}
          className='max-w-24 truncate whitespace-nowrap'
        >
          {formatProductionRecapQuantity(
            item.quantity,
            item.unit.decimalPrecision
          )}{' '}
          <span className='text-[8px] text-muted-foreground'>
            {item.unit.code}
          </span>
        </span>
      ))}
      {items.length > visible.length ? (
        <span className='text-[8px] text-muted-foreground'>
          +{items.length - visible.length} satuan
        </span>
      ) : null}
    </>
  )
}

function MatrixState({ children }: { children: ReactNode }) {
  return (
    <div className='flex min-h-48 flex-wrap items-center justify-center gap-2 rounded-md border border-dashed text-center text-sm text-muted-foreground'>
      {children}
    </div>
  )
}

function quantityText(items: ProductionRecapQuantity[]) {
  return items.length
    ? items
        .map(
          (item) =>
            `${formatProductionRecapQuantity(item.quantity, item.unit.decimalPrecision)} ${item.unit.code}`
        )
        .join(' · ')
    : 'Tanpa kuantitas'
}

function cellAriaLabel(
  value: ProductionRecapMatrixCell,
  mode: ProductionRecapCellMode
) {
  const main =
    mode === 'gross'
      ? formatRupiah(value.grossAmount)
      : quantityText(value.quantityTotals)
  return `${main}, ${value.transactionCount} transaksi`
}

function formatRupiah(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function formatCompactRupiah(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(value))
}

function shortDay(value: string) {
  return value.slice(0, 3)
}

function dayNumber(value: string) {
  return new Intl.NumberFormat('id-ID', { minimumIntegerDigits: 2 }).format(
    Number(value.slice(-2))
  )
}

function isWeekend(value: string) {
  const day = new Date(`${value}T00:00:00`).getDay()
  return day === 0 || day === 6
}

function paginationSummary(page: number, pageSize: number, total: number) {
  return total
    ? `Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} dari ${total} karyawan.`
    : 'Tidak ada data.'
}
