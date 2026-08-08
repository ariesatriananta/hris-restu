import { useEffect, useMemo, useState } from 'react'
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  CheckCheck,
  Eye,
  LoaderCircle,
  Printer,
  RefreshCcw,
  Tags,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTableUrlState, type NavigateFn } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'
import { useEmployeeIdCardPrintData, useEmployeeIdCards } from '../data/queries'
import type {
  EmployeeIdCardItem,
  EmployeeIdCardListParams,
  EmployeeTypeCode,
  SiteCode,
} from '../domain'
import { statusLabel } from '../utils'
import {
  isProductionLabelEligible,
  ProductionLabelFace,
} from './production-label'
import { ProductionLabelPrintSheet } from './production-label-print-sheet'

const maxSelection = 100
const filters = [
  {
    columnId: 'site',
    title: 'Site',
    options: ['JEPARA', 'SEMARANG', 'KLATEN'].map((value) => ({
      value,
      label: statusLabel(value),
    })),
  },
  {
    columnId: 'employeeType',
    title: 'Jenis',
    options: ['BORONGAN', 'HARIAN', 'TRAINING', 'BULANAN'].map((value) => ({
      value,
      label: statusLabel(value),
    })),
  },
]
const columns: ColumnDef<EmployeeIdCardItem>[] = [
  { accessorKey: 'fullName', header: 'Karyawan' },
  {
    accessorKey: 'site',
    header: 'Site',
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
  {
    accessorKey: 'employeeType',
    header: 'Jenis',
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
]

export function ProductionLabelPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const params: EmployeeIdCardListParams = {
    query: stringValue(search.filter),
    site: arrayValue<SiteCode>(search.site),
    employeeType: arrayValue<EmployeeTypeCode>(search.employeeType),
    employeeStatus: ['ACTIVE'],
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  }
  const result = useEmployeeIdCards(params)
  const printMutation = useEmployeeIdCardPrintData()
  const [selected, setSelected] = useState(
    () => new Map<string, EmployeeIdCardItem>()
  )
  const [preview, setPreview] = useState<EmployeeIdCardItem>()
  const [printData, setPrintData] = useState<{
    generatedAt: string
    items: EmployeeIdCardItem[]
  }>()

  useEffect(() => {
    if (!printData) return
    const frame = window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => window.print())
    )
    return () => window.cancelAnimationFrame(frame)
  }, [printData])

  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'employeeType', searchKey: 'employeeType', type: 'array' },
    ],
  })
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: result.data?.items ?? [],
    columns,
    state: {
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
    },
    pageCount: Math.max(
      1,
      Math.ceil((result.data?.total ?? 0) / (result.data?.pageSize ?? 50))
    ),
    manualFiltering: true,
    manualPagination: true,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
  })

  const pageItems = result.data?.items ?? []
  const eligibleItems = pageItems.filter(isProductionLabelEligible)
  const selectedItems = useMemo(() => [...selected.values()], [selected])
  const selectedOnPage = eligibleItems.filter((item) =>
    selected.has(item.uid)
  ).length
  const allSelected =
    eligibleItems.length > 0 && selectedOnPage === eligibleItems.length

  const toggle = (employee: EmployeeIdCardItem, checked: boolean) => {
    if (!isProductionLabelEligible(employee)) {
      toast.error(
        'Label hanya tersedia untuk karyawan aktif yang memiliki Bagian Produksi.'
      )
      return
    }
    setSelected((current) => {
      const next = new Map(current)
      if (!checked) next.delete(employee.uid)
      else if (next.has(employee.uid) || next.size < maxSelection)
        next.set(employee.uid, employee)
      else toast.error(`Maksimal ${maxSelection} karyawan dalam satu batch.`)
      return next
    })
  }

  const togglePage = (checked: boolean) =>
    setSelected((current) => {
      const next = new Map(current)
      if (!checked) eligibleItems.forEach((item) => next.delete(item.uid))
      else
        for (const item of eligibleItems) {
          if (next.size >= maxSelection) break
          next.set(item.uid, item)
        }
      return next
    })

  const printSelected = async () => {
    if (!selected.size) return toast.error('Pilih minimal satu karyawan.')
    try {
      const data = await printMutation.mutateAsync([...selected.keys()])
      const validItems = data.items.filter(isProductionLabelEligible)
      if (!validItems.length)
        return toast.error(
          'Tidak ada label yang memenuhi syarat untuk dicetak.'
        )
      if (validItems.length !== data.items.length)
        toast.warning(
          'Sebagian karyawan dilewati karena tidak lagi memenuhi syarat cetak label.'
        )
      setPrintData({ ...data, items: validItems })
    } catch {
      toast.error('Data cetak Label Setoran Produksi gagal disiapkan.')
    }
  }

  return (
    <div className='space-y-4 pt-4'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h2 className='text-lg font-semibold'>Label Setoran Produksi</h2>
          <p className='text-sm text-muted-foreground'>
            Setiap karyawan memperoleh satu baris berisi lima label identik
            untuk lima nampan besi.
          </p>
        </div>
        <Button
          onClick={() => void printSelected()}
          disabled={!selected.size || printMutation.isPending}
        >
          {printMutation.isPending ? (
            <LoaderCircle className='animate-spin' />
          ) : (
            <Printer />
          )}
          Cetak {selected.size ? `${selected.size * 5} label` : 'pilihan'}
        </Button>
      </div>

      <div className='rounded-lg border bg-muted/20 p-3'>
        <div className='flex flex-wrap items-center gap-3'>
          <Checkbox
            id='select-production-label-page'
            checked={
              allSelected ? true : selectedOnPage ? 'indeterminate' : false
            }
            onCheckedChange={(value) => togglePage(value === true)}
            disabled={!eligibleItems.length}
          />
          <label
            htmlFor='select-production-label-page'
            className='text-sm font-medium'
          >
            Pilih semua yang memenuhi syarat pada halaman ini
          </label>
          <Badge variant='secondary' className='tabular-nums'>
            {selected.size} karyawan · {selected.size * 5} label
          </Badge>
          {selected.size > 0 && (
            <Button
              size='sm'
              variant='ghost'
              className='ms-auto'
              onClick={() => setSelected(new Map())}
            >
              Hapus pilihan
            </Button>
          )}
        </div>
        <p className='mt-1 text-xs text-muted-foreground'>
          Hanya karyawan aktif dengan Bagian Produksi yang dapat dipilih.
          Pilihan tab ini terpisah dari ID Card.
        </p>
      </div>

      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari nama atau nomor karyawan...'
        searchDebounceMs={500}
        filters={filters}
      />
      {result.isPending && !result.data ? (
        <PageState>
          <LoaderCircle className='size-4 animate-spin' /> Memuat label...
        </PageState>
      ) : result.isError ? (
        <PageState>
          Data label gagal dimuat.{' '}
          <Button
            size='sm'
            variant='outline'
            onClick={() => void result.refetch()}
          >
            <RefreshCcw /> Coba lagi
          </Button>
        </PageState>
      ) : !pageItems.length ? (
        <PageState>
          <Tags className='size-5' /> Tidak ada karyawan yang sesuai filter.
        </PageState>
      ) : (
        <>
          <div className='grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5'>
            {pageItems.map((employee) => {
              const checked = selected.has(employee.uid)
              const eligible = isProductionLabelEligible(employee)
              return (
                <section
                  key={employee.uid}
                  className={`min-w-0 rounded-xl border p-3 ${checked ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/30' : 'bg-card'}`}
                >
                  <div className='mb-2 flex items-start justify-between gap-2'>
                    <label className='flex min-w-0 cursor-pointer items-start gap-2'>
                      <Checkbox
                        checked={checked}
                        disabled={!eligible}
                        onCheckedChange={(value) =>
                          toggle(employee, value === true)
                        }
                        aria-label={`Pilih label ${employee.fullName}`}
                      />
                      <span className='min-w-0'>
                        <span className='block truncate text-sm font-semibold'>
                          {employee.fullName}
                        </span>
                        <span className='block truncate text-xs text-muted-foreground'>
                          {employee.employeeNumber} ·{' '}
                          {employee.productionSection ??
                            'Bagian Produksi belum diatur'}
                        </span>
                        {!eligible && (
                          <Badge variant='outline' className='mt-1'>
                            Tidak dapat dicetak
                          </Badge>
                        )}
                      </span>
                    </label>
                    <Button
                      size='icon'
                      variant='ghost'
                      aria-label={`Preview label ${employee.fullName}`}
                      onClick={() => setPreview(employee)}
                    >
                      <Eye />
                    </Button>
                  </div>
                  <button
                    type='button'
                    className='mx-auto block focus-visible:ring-2 focus-visible:ring-ring'
                    disabled={!eligible}
                    onClick={() => toggle(employee, !checked)}
                  >
                    <ProductionLabelFace
                      employee={employee}
                      className={
                        eligible ? 'shadow-sm' : 'opacity-50 grayscale'
                      }
                    />
                  </button>
                </section>
              )
            })}
          </div>
          <DataTablePagination
            table={table}
            summary={paginationSummary(result.data)}
          />
        </>
      )}

      {selectedItems.length > 0 && (
        <div className='sticky bottom-3 z-30 mx-auto flex max-w-xl flex-wrap items-center justify-center gap-2 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur'>
          <CheckCheck className='size-4 text-primary' />
          <span className='text-sm font-medium'>
            {selectedItems.length * 5} label siap dicetak
          </span>
          <Button
            size='sm'
            onClick={() => void printSelected()}
            disabled={printMutation.isPending}
          >
            <Printer /> Cetak
          </Button>
        </div>
      )}

      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => !open && setPreview(undefined)}
      >
        <DialogContent className='sm:max-w-sm'>
          <DialogHeader>
            <DialogTitle>Preview Label Setoran Produksi</DialogTitle>
            <DialogDescription>
              {preview
                ? `${preview.fullName} · dicetak lima lembar identik.`
                : 'Preview label.'}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className='flex justify-center py-4'>
              <ProductionLabelFace employee={preview} />
            </div>
          )}
        </DialogContent>
      </Dialog>
      {printData && (
        <ProductionLabelPrintSheet
          items={printData.items}
          generatedAt={printData.generatedAt}
        />
      )}
    </div>
  )
}

function PageState({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex min-h-56 flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed text-center text-sm text-muted-foreground'>
      {children}
    </div>
  )
}
function paginationSummary(data: {
  page: number
  pageSize: number
  total: number
}) {
  return data.total
    ? `Menampilkan ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} dari ${data.total} karyawan.`
    : 'Tidak ada karyawan.'
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
