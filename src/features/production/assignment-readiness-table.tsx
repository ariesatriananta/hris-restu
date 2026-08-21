import { useMemo } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  RefreshCcw,
  TableProperties,
} from 'lucide-react'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import {
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import type {
  ProductionAssignmentReadinessIssue,
  ProductionAssignmentReadinessItem,
  ProductionAssignmentReadinessResult,
} from './domain'

const issueOptions: Array<{
  value: ProductionAssignmentReadinessIssue
  label: string
}> = [
  { value: 'ALL', label: 'Semua pekerja eligible' },
  { value: 'UNASSIGNED', label: 'Belum ditugaskan' },
  { value: 'MISSING_PRIMARY', label: 'Tanpa pekerjaan utama' },
  { value: 'AMBIGUOUS_PRIMARY', label: 'Pekerjaan utama ganda' },
  { value: 'READY', label: 'Siap digunakan' },
]

const issueLabels = {
  UNASSIGNED: 'Belum ditugaskan',
  MISSING_PRIMARY: 'Tanpa pekerjaan utama',
  AMBIGUOUS_PRIMARY: 'Pekerjaan utama ganda',
} as const

function ReadinessBadges({ row }: { row: ProductionAssignmentReadinessItem }) {
  if (row.issueCodes.length === 0) {
    return (
      <Badge className='border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300'>
        <CheckCircle2 className='size-3' /> Siap
      </Badge>
    )
  }
  return (
    <div className='flex flex-wrap gap-1'>
      {row.issueCodes.map((issue) => (
        <Badge
          key={issue}
          variant='outline'
          className='border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
        >
          <AlertTriangle className='size-3' /> {issueLabels[issue]}
        </Badge>
      ))}
    </div>
  )
}

function PrimaryJob({ row }: { row: ProductionAssignmentReadinessItem }) {
  if (row.primaryAssignmentCount > 1) {
    return (
      <>
        <div className='font-medium text-amber-700 dark:text-amber-300'>
          {row.primaryAssignmentCount} pekerjaan utama
        </div>
        <div className='text-xs text-muted-foreground'>Perlu dirapikan</div>
      </>
    )
  }
  if (!row.currentPrimaryJob) {
    return <span className='text-muted-foreground'>Belum ada</span>
  }
  return (
    <>
      <div className='font-medium'>{row.currentPrimaryJob.name}</div>
      <div className='text-xs text-muted-foreground'>
        {row.currentPrimaryJob.code}
      </div>
    </>
  )
}

type AssignmentReadinessTableProps = {
  data?: ProductionAssignmentReadinessResult
  search: Record<string, unknown>
  navigate: NavigateFn
  isPending: boolean
  isFetching: boolean
  isError: boolean
  onRetry: () => void
  canManage: boolean
  onAssign: (row: ProductionAssignmentReadinessItem) => void
  onInspectHistory: (row: ProductionAssignmentReadinessItem) => void
}

export function AssignmentReadinessTable({
  data,
  search,
  navigate,
  isPending,
  isFetching,
  isError,
  onRetry,
  canManage,
  onAssign,
  onInspectHistory,
}: AssignmentReadinessTableProps) {
  const facets = data?.facets
  const columns = useMemo<ColumnDef<ProductionAssignmentReadinessItem>[]>(
    () => [
      {
        id: 'employee',
        header: 'Karyawan',
        cell: ({ row }) => (
          <div className='min-w-0'>
            <div
              className='truncate font-medium'
              title={row.original.employee.fullName}
            >
              {row.original.employee.fullName}
            </div>
            <div className='truncate text-xs text-muted-foreground'>
              {row.original.site.name} · {row.original.employee.employeeNumber}
            </div>
          </div>
        ),
        size: 250,
      },
      {
        id: 'site',
        accessorFn: (row) => row.site.code,
        header: 'Site',
        enableHiding: false,
      },
      {
        id: 'employeeType',
        accessorFn: (row) => row.employee.employeeType,
        header: 'Jenis',
        enableHiding: false,
      },
      {
        id: 'productionSectionUid',
        accessorFn: (row) => row.productionSection?.uid ?? '',
        header: 'Bagian Produksi',
        cell: ({ row }) => (
          <div className='min-w-0'>
            <div className='truncate'>
              {row.original.productionSection?.name ?? 'Belum diatur'}
            </div>
            <div className='text-xs text-muted-foreground'>
              {row.original.employee.employeeType}
            </div>
          </div>
        ),
        size: 180,
      },
      {
        id: 'primaryJob',
        header: 'Pekerjaan Utama',
        cell: ({ row }) => <PrimaryJob row={row.original} />,
        size: 200,
      },
      {
        id: 'readiness',
        header: 'Kesiapan',
        cell: ({ row }) => (
          <div className='space-y-1'>
            <ReadinessBadges row={row.original} />
            <div className='text-xs text-muted-foreground'>
              {row.original.assignmentCount} penugasan aktif
            </div>
          </div>
        ),
        size: 230,
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: () => <div className='text-right'>Aksi</div>,
              cell: ({ row }) => (
                <div className='text-right'>
                  {row.original.issueCodes.includes('AMBIGUOUS_PRIMARY') ? (
                    <DataTableActionButton
                      label={`Periksa histori ${row.original.employee.fullName}`}
                      onClick={() => onInspectHistory(row.original)}
                    >
                      <TableProperties className='size-4' />
                    </DataTableActionButton>
                  ) : (
                    <DataTableActionButton
                      label={`Atur pekerjaan ${row.original.employee.fullName}`}
                      onClick={() => onAssign(row.original)}
                    >
                      <BriefcaseBusiness className='size-4' />
                    </DataTableActionButton>
                  )}
                </div>
              ),
              size: 64,
              enableHiding: false,
            } satisfies ColumnDef<ProductionAssignmentReadinessItem>,
          ]
        : []),
    ],
    [canManage, onAssign, onInspectHistory]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      {
        columnId: 'employeeType',
        searchKey: 'employeeType',
        type: 'array',
      },
      {
        columnId: 'productionSectionUid',
        searchKey: 'productionSectionUid',
        type: 'array',
      },
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
    initialState: { columnVisibility: { site: false, employeeType: false } },
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
  const issue = (search.issue ?? 'ALL') as ProductionAssignmentReadinessIssue
  const asOf = typeof search.asOf === 'string' ? search.asOf : data?.asOf
  const setSearch = (patch: Record<string, unknown>) =>
    navigate({ search: (previous) => ({ ...previous, ...patch }) })
  const filters = [
    {
      columnId: 'site',
      title: 'Site',
      options: ['JEPARA', 'SEMARANG', 'KLATEN'].map((value) => ({
        value,
        label: value[0] + value.slice(1).toLowerCase(),
      })),
    },
    {
      columnId: 'employeeType',
      title: 'Jenis',
      options: (facets?.employeeTypes ?? ['BORONGAN', 'TRAINING']).map(
        (value) => ({ value, label: value })
      ),
    },
    ...(facets?.productionSections.length
      ? [
          {
            columnId: 'productionSectionUid',
            title: 'Bagian Produksi',
            options: facets.productionSections.map((section) => ({
              value: section.uid,
              label: section.name,
            })),
          },
        ]
      : []),
  ]

  return (
    <div className='space-y-3'>
      <div className='flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between'>
        <DataTableToolbar
          table={table}
          searchPlaceholder='Cari nama, nomor, atau bagian...'
          searchDebounceMs={400}
          filters={filters}
        />
        <div className='grid gap-2 sm:grid-cols-2 lg:flex lg:shrink-0'>
          <Select
            value={issue}
            onValueChange={(value: ProductionAssignmentReadinessIssue) =>
              setSearch({ issue: value === 'ALL' ? undefined : value, page: 1 })
            }
          >
            <SelectTrigger className='h-8 w-full sm:w-56'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {issueOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DatePicker
            selected={dateOnlyFromInput(asOf)}
            onSelect={(date) => {
              const value = dateOnlyToInput(date)
              setSearch({ asOf: value || undefined, page: 1 })
            }}
            placeholder='Tanggal kesiapan'
            fromYear={2020}
            toYear={new Date().getFullYear() + 5}
            triggerClassName='h-8 w-full sm:w-44 text-xs'
          />
        </div>
      </div>
      {isFetching && !isPending && (
        <p className='text-xs text-muted-foreground'>Memperbarui kesiapan...</p>
      )}
      {isPending ? (
        <div className='h-40 animate-pulse rounded-md bg-muted' />
      ) : isError ? (
        <div className='rounded-md border py-10 text-center'>
          <p>Data kesiapan penugasan gagal dimuat.</p>
          <Button variant='outline' className='mt-3' onClick={onRetry}>
            <RefreshCcw /> Coba lagi
          </Button>
        </div>
      ) : !data?.items.length ? (
        <div className='rounded-md border py-10 text-center text-muted-foreground'>
          <TableProperties className='mx-auto mb-2' />
          Tidak ada pekerja sesuai filter kesiapan.
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
            {data.items.map((row) => (
              <div
                key={row.employee.uid}
                className='space-y-3 rounded-lg border p-3'
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <div className='font-medium'>{row.employee.fullName}</div>
                    <div className='text-xs text-muted-foreground'>
                      {row.site.name} · {row.employee.employeeNumber}
                    </div>
                  </div>
                  <ReadinessBadges row={row} />
                </div>
                <div className='grid grid-cols-2 gap-3 text-sm'>
                  <div>
                    <div className='text-xs text-muted-foreground'>
                      Bagian Produksi
                    </div>
                    <div>{row.productionSection?.name ?? 'Belum diatur'}</div>
                  </div>
                  <div>
                    <div className='text-xs text-muted-foreground'>
                      Pekerjaan utama
                    </div>
                    <PrimaryJob row={row} />
                  </div>
                </div>
                {canManage &&
                  (row.issueCodes.includes('AMBIGUOUS_PRIMARY') ? (
                    <Button
                      size='sm'
                      variant='outline'
                      className='w-full'
                      onClick={() => onInspectHistory(row)}
                    >
                      <TableProperties /> Periksa Histori
                    </Button>
                  ) : (
                    <Button
                      size='sm'
                      variant='outline'
                      className='w-full'
                      onClick={() => onAssign(row)}
                    >
                      <BriefcaseBusiness /> Atur Pekerjaan
                    </Button>
                  ))}
              </div>
            ))}
          </div>
          <DataTablePagination
            table={table}
            summary={
              <>
                Menampilkan {(data.page - 1) * data.pageSize + 1}–
                {Math.min(data.page * data.pageSize, data.total)} dari{' '}
                {data.total} pekerja.
              </>
            }
          />
        </>
      )}
    </div>
  )
}
