import { useEffect, useMemo, useState } from 'react'
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  CheckCheck,
  CreditCard,
  Eye,
  LoaderCircle,
  Printer,
  RefreshCcw,
  Tags,
  Users,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'
import { Main } from '@/components/layout/main'
import {
  useEmployee,
  useEmployeeIdCardPrintData,
  useEmployeeIdCards,
} from '../data/queries'
import type {
  Employee,
  EmployeeIdCardItem,
  EmployeeIdCardListParams,
  EmployeeStatusCode,
  EmployeeTypeCode,
  SiteCode,
} from '../domain'
import { statusLabel } from '../utils'
import { EmployeeIdCardFace } from './id-card'
import { IdCardPrintSheet } from './id-card-print-sheet'
import { ProductionLabelPage } from './production-label-page'

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
  {
    columnId: 'employeeStatus',
    title: 'Status',
    options: ['ACTIVE', 'LEAVE', 'RESIGNED', 'INACTIVE'].map((value) => ({
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
  {
    accessorKey: 'employeeStatus',
    header: 'Status',
    filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
  },
]

export function IdCardPage({
  employeeUid,
  tab = 'id-card',
  search,
  navigate,
}: {
  employeeUid?: string
  tab?: 'id-card' | 'production-label'
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  return (
    <Main>
      <div className='mb-4'>
        <p className='text-sm font-medium text-primary'>Karyawan</p>
        <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
          ID Card & Label Barcode
        </h1>
        <p className='text-sm text-muted-foreground'>
          Kelola cetak identitas karyawan dan label barcode untuk nampan setoran
          produksi.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({
            search: (previous) => ({
              ...previous,
              tab: value as 'id-card' | 'production-label',
              page: 1,
            }),
          })
        }
      >
        <TabsList className='h-auto max-w-full justify-start gap-1 overflow-x-auto p-1'>
          <TabsTrigger value='id-card' className='h-10 flex-none gap-2 px-4'>
            <CreditCard /> ID Card
          </TabsTrigger>
          <TabsTrigger
            value='production-label'
            className='h-10 flex-none gap-2 px-4'
          >
            <Tags /> Label Setoran Produksi
          </TabsTrigger>
        </TabsList>
        <TabsContent
          value='id-card'
          forceMount
          className='data-[state=inactive]:hidden'
        >
          <IdCardManager
            employeeUid={employeeUid}
            search={search}
            navigate={navigate}
          />
        </TabsContent>
        <TabsContent
          value='production-label'
          forceMount
          className='data-[state=inactive]:hidden'
        >
          <ProductionLabelPage search={search} navigate={navigate} />
        </TabsContent>
      </Tabs>
    </Main>
  )
}

function IdCardManager({
  employeeUid,
  search,
  navigate,
}: {
  employeeUid?: string
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const params: EmployeeIdCardListParams = {
    query: stringValue(search.filter),
    site: arrayValue<SiteCode>(search.site),
    employeeType: arrayValue<EmployeeTypeCode>(search.employeeType),
    employeeStatus: arrayValue<EmployeeStatusCode>(search.employeeStatus) ?? [
      'ACTIVE',
    ],
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  }
  const result = useEmployeeIdCards(params)
  const directEmployee = useEmployee(employeeUid ?? '')
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
    if (!employeeUid || !directEmployee.data) return
    const item = employeeToIdCard(directEmployee.data)
    if (item.employeeStatus === 'ACTIVE') {
      setSelected((current) => {
        if (current.has(item.uid)) return current
        const next = new Map(current)
        next.set(item.uid, item)
        return next
      })
    }
    setPreview((current) => current ?? item)
  }, [directEmployee.data, employeeUid])

  useEffect(() => {
    if (!printData) return
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.print())
    })
    return () => window.cancelAnimationFrame(firstFrame)
  }, [printData])

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
  const printablePageItems = pageItems.filter(
    (item) => item.employeeStatus === 'ACTIVE'
  )
  const pageSelectedCount = printablePageItems.filter((item) =>
    selected.has(item.uid)
  ).length
  const allPageSelected =
    printablePageItems.length > 0 &&
    pageSelectedCount === printablePageItems.length
  const selectedItems = useMemo(() => [...selected.values()], [selected])

  const toggle = (employee: EmployeeIdCardItem, checked: boolean) => {
    if (employee.employeeStatus !== 'ACTIVE') {
      toast.error('Karyawan tidak aktif tidak dapat dimasukkan ke data cetak.')
      return
    }
    setSelected((current) => {
      const next = new Map(current)
      if (!checked) {
        next.delete(employee.uid)
        return next
      }
      if (!next.has(employee.uid) && next.size >= maxSelection) {
        toast.error(`Maksimal ${maxSelection} kartu dalam satu batch.`)
        return current
      }
      next.set(employee.uid, employee)
      return next
    })
  }

  const togglePage = (checked: boolean) => {
    setSelected((current) => {
      const next = new Map(current)
      if (!checked) {
        printablePageItems.forEach((item) => next.delete(item.uid))
        return next
      }
      let added = 0
      for (const item of printablePageItems) {
        if (next.has(item.uid)) continue
        if (next.size >= maxSelection) break
        next.set(item.uid, item)
        added += 1
      }
      if (
        added <
        printablePageItems.filter((item) => !current.has(item.uid)).length
      ) {
        toast.warning(
          `Pilihan dibatasi ${maxSelection} kartu. Sebagian data halaman tidak ditambahkan.`
        )
      }
      return next
    })
  }

  const printSelected = async () => {
    if (!selected.size) return toast.error('Pilih minimal satu karyawan.')
    try {
      const data = await printMutation.mutateAsync([...selected.keys()])
      setPrintData(data)
    } catch {
      toast.error('Data cetak ID Card gagal disiapkan.')
    }
  }

  return (
    <div className='pt-4'>
      <div className='mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h2 className='text-lg font-semibold'>ID Card Karyawan</h2>
          <p className='text-sm text-muted-foreground'>
            Pilih hingga 100 karyawan. Setiap lembar A4 memuat satu baris berisi
            lima kartu portrait berukuran ringkas.
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
          Cetak {selected.size ? `${selected.size} kartu` : 'pilihan'}
        </Button>
      </div>

      <div className='mb-4 rounded-lg border bg-muted/20 p-3'>
        <div className='flex flex-wrap items-center gap-3'>
          <Checkbox
            id='select-id-card-page'
            checked={
              allPageSelected
                ? true
                : pageSelectedCount > 0
                  ? 'indeterminate'
                  : false
            }
            onCheckedChange={(value) => togglePage(value === true)}
            disabled={!printablePageItems.length}
          />
          <label htmlFor='select-id-card-page' className='text-sm font-medium'>
            Pilih semua pada halaman ini
          </label>
          <Badge variant='secondary' className='tabular-nums'>
            {selected.size}/{maxSelection} dipilih
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
          Pilihan tetap tersimpan saat berpindah halaman atau mengganti filter.
        </p>
      </div>

      <div className='space-y-4'>
        <DataTableToolbar
          table={table}
          searchPlaceholder='Cari nama atau nomor karyawan...'
          searchDebounceMs={500}
          filters={filters}
        />
        {result.isPending && !result.data ? (
          <PageState>
            <LoaderCircle className='size-4 animate-spin' /> Memuat gallery ID
            Card...
          </PageState>
        ) : result.isError ? (
          <PageState>
            Data ID Card gagal dimuat.
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
            <Users className='size-5' /> Tidak ada karyawan yang sesuai filter.
          </PageState>
        ) : (
          <>
            {result.isFetching && (
              <p
                role='status'
                className='flex items-center gap-2 text-xs text-muted-foreground'
              >
                <LoaderCircle className='size-3 animate-spin' /> Memperbarui
                gallery...
              </p>
            )}
            <div className='grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5'>
              {pageItems.map((employee) => {
                const checked = selected.has(employee.uid)
                const printable = employee.employeeStatus === 'ACTIVE'
                return (
                  <section
                    key={employee.uid}
                    className={`min-w-0 rounded-xl border p-3 transition-colors ${checked ? 'border-primary bg-primary/[0.04] ring-1 ring-primary/30' : 'bg-card'}`}
                  >
                    <div className='mb-3 flex items-start justify-between gap-2'>
                      <label className='flex min-w-0 cursor-pointer items-start gap-2'>
                        <Checkbox
                          checked={checked}
                          disabled={!printable}
                          onCheckedChange={(value) =>
                            toggle(employee, value === true)
                          }
                          aria-label={`Pilih ${employee.fullName}`}
                        />
                        <span className='min-w-0'>
                          <span className='block truncate text-sm font-semibold'>
                            {employee.fullName}
                          </span>
                          <span className='block text-xs text-muted-foreground'>
                            {employee.employeeNumber} · {employee.site}
                          </span>
                          {!printable && (
                            <Badge
                              variant='outline'
                              className='mt-1 border-warning/50 bg-warning/10 text-warning-foreground'
                            >
                              Tidak aktif · tidak dapat dicetak
                            </Badge>
                          )}
                        </span>
                      </label>
                      <Button
                        size='icon'
                        variant='ghost'
                        aria-label={`Preview ${employee.fullName}`}
                        onClick={() => setPreview(employee)}
                      >
                        <Eye />
                      </Button>
                    </div>
                    <button
                      type='button'
                      className='mx-auto block rounded-[3.2mm] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none'
                      aria-label={`${checked ? 'Batalkan pilihan' : 'Pilih'} ${employee.fullName}`}
                      disabled={!printable}
                      onClick={() => toggle(employee, !checked)}
                    >
                      <EmployeeIdCardFace
                        employee={employee}
                        className={`pointer-events-none shadow-sm ${printable ? '' : 'opacity-55 grayscale-[0.35]'}`}
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
      </div>

      {selectedItems.length > 0 && (
        <div className='sticky bottom-3 z-30 mx-auto mt-5 flex max-w-xl flex-wrap items-center justify-center gap-2 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur'>
          <CheckCheck className='size-4 text-primary' />
          <span className='text-sm font-medium'>
            {selectedItems.length} kartu siap dicetak
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
        <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-sm'>
          <DialogHeader>
            <DialogTitle>Preview ID Card</DialogTitle>
            <DialogDescription>
              {preview
                ? `${preview.fullName} · ${preview.employeeNumber}`
                : 'Preview kartu portrait.'}
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className='flex justify-center py-2'>
              <EmployeeIdCardFace employee={preview} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {printData && (
        <IdCardPrintSheet
          items={printData.items}
          generatedAt={printData.generatedAt}
        />
      )}
    </div>
  )
}

function employeeToIdCard(employee: Employee): EmployeeIdCardItem {
  const photoUrl = employee.photo?.url ?? employee.photo?.temporaryUrl
  return {
    uid: employee.uid,
    employeeNumber: employee.employeeNumber,
    fullName: employee.fullName,
    employeeType: employee.employeeType,
    employeeStatus: employee.employeeStatus,
    site: employee.site,
    position: employee.position,
    productionModule: employee.productionModule,
    productionSection: employee.productionSection,
    photo:
      employee.photo && photoUrl
        ? { uid: employee.photo.uid, url: photoUrl }
        : null,
    machineReadable: {
      version: 1,
      barcodePayload: employee.barcode,
      qrPayload: employee.barcode,
    },
  }
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
