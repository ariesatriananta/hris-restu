import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import {
  CalendarDays,
  LoaderCircle,
  Pencil,
  RefreshCcw,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
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
  DataTableActionButton,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import type {
  PaginatedAttendanceResult,
  Shift,
  ShiftAssignment,
} from './domain'

const fallbackSites = ['JEPARA', 'SEMARANG', 'KLATEN'].map((value) => ({
  value,
  label: value[0] + value.slice(1).toLowerCase(),
}))
const employeeTypes = ['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING'].map(
  (value) => ({ value, label: titleCase(value) })
)
const shiftStatuses = [
  { value: 'CURRENT', label: 'Berjalan' },
  { value: 'UPCOMING', label: 'Akan datang' },
  { value: 'ENDED', label: 'Berakhir' },
]

type QueryResult<T> = {
  data?: PaginatedAttendanceResult<T>
  isPending: boolean
  isFetching: boolean
  isError: boolean
  refetch: () => unknown
}

export function ShiftTable({
  result,
  search,
  navigate,
  onEdit,
  onDelete,
  siteOptions = fallbackSites,
}: {
  result: QueryResult<Shift>
  search: Record<string, unknown>
  navigate: NavigateFn
  onEdit: (shift: Shift) => void
  onDelete: (shift: Shift) => void
  siteOptions?: { value: string; label: string }[]
}) {
  const columns = useMemo<ColumnDef<Shift>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Shift' />
        ),
        cell: ({ row }) => (
          <div>
            <p className='font-medium'>{row.original.name}</p>
            <p className='text-[11px] text-muted-foreground'>
              {row.original.code} · {row.original.siteName}
            </p>
          </div>
        ),
        meta: { label: 'Shift' },
      },
      {
        accessorKey: 'site',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Site' />
        ),
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
        meta: { label: 'Site' },
      },
      {
        id: 'schedule',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Jadwal' />
        ),
        cell: ({ row }) => (
          <div>
            <p className='font-medium tabular-nums'>
              {shortTime(row.original.startTime)}–
              {shortTime(row.original.endTime)}
            </p>
            <p className='text-[11px] text-muted-foreground'>
              {row.original.crossesMidnight ? 'Lintas hari' : 'Hari yang sama'}
            </p>
          </div>
        ),
        meta: { label: 'Jadwal' },
      },
      {
        id: 'tolerance',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Toleransi' />
        ),
        cell: ({ row }) => (
          <span className='text-sm'>
            Terlambat {row.original.lateToleranceMinutes} mnt · Pulang awal{' '}
            {row.original.earlyLeaveToleranceMinutes} mnt
          </span>
        ),
        meta: { label: 'Toleransi' },
      },
      {
        accessorKey: 'assignmentCount',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Penugasan' />
        ),
        cell: ({ row }) => `${row.original.assignmentCount} karyawan`,
        meta: { label: 'Penugasan' },
      },
      {
        accessorKey: 'isActive',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Status' />
        ),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
            {row.original.isActive ? 'Aktif' : 'Nonaktif'}
          </Badge>
        ),
        filterFn: (row, id, value: string[]) =>
          value.includes(String(row.getValue(id))),
        meta: { label: 'Status' },
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className='flex justify-end gap-1'>
            <DataTableActionButton
              label={`Ubah shift ${row.original.name}`}
              onClick={() => onEdit(row.original)}
            >
              <Pencil />
            </DataTableActionButton>
            {!row.original.hasAttendance && (
              <DataTableActionButton
                className='text-destructive hover:text-destructive'
                label={`Hapus shift ${row.original.name}`}
                onClick={() => onDelete(row.original)}
              >
                <Trash2 />
              </DataTableActionButton>
            )}
          </div>
        ),
      },
    ],
    [onDelete, onEdit]
  )
  return (
    <AttendanceTable
      result={result}
      columns={columns}
      search={search}
      navigate={navigate}
      searchPlaceholder='Cari kode atau nama shift...'
      filters={[
        { columnId: 'site', title: 'Site', options: siteOptions },
        {
          columnId: 'isActive',
          title: 'Status',
          options: [
            { value: 'true', label: 'Aktif' },
            { value: 'false', label: 'Nonaktif' },
          ],
        },
      ]}
      columnFilters={[
        { columnId: 'site', searchKey: 'site', type: 'array' },
        { columnId: 'isActive', searchKey: 'isActive', type: 'array' },
      ]}
      empty='Tidak ada shift yang sesuai filter.'
      mobile={(shift) => (
        <Card key={shift.uid}>
          <CardContent className='space-y-3 p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='font-semibold'>{shift.name}</p>
                <p className='text-xs text-muted-foreground'>
                  {shift.code} · {shift.siteName}
                </p>
              </div>
              <Badge variant={shift.isActive ? 'default' : 'secondary'}>
                {shift.isActive ? 'Aktif' : 'Nonaktif'}
              </Badge>
            </div>
            <p className='text-sm tabular-nums'>
              {shortTime(shift.startTime)}–{shortTime(shift.endTime)}
              {shift.crossesMidnight ? ' · lintas hari' : ''}
            </p>
            <div className='flex items-center justify-between'>
              <span className='text-xs text-muted-foreground'>
                {shift.assignmentCount} penugasan
              </span>
              <div className='flex gap-2'>
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => onEdit(shift)}
                >
                  <Pencil /> Ubah
                </Button>
                {!shift.hasAttendance && (
                  <Button
                    size='sm'
                    variant='outline'
                    className='text-destructive'
                    onClick={() => onDelete(shift)}
                  >
                    <Trash2 /> Hapus
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    />
  )
}

export function ShiftAssignmentTable({
  result,
  shifts,
  search,
  navigate,
  onDelete,
  onCorrect,
  siteOptions = fallbackSites,
  productionModuleOptions = [],
  productionSectionOptions = [],
}: {
  result: QueryResult<ShiftAssignment>
  shifts: Shift[]
  search: Record<string, unknown>
  navigate: NavigateFn
  onDelete: (assignment: ShiftAssignment) => void
  onCorrect: (assignment: ShiftAssignment) => void
  siteOptions?: { value: string; label: string }[]
  productionModuleOptions?: { value: string; label: string }[]
  productionSectionOptions?: { value: string; label: string }[]
}) {
  const returnTo = currentListReturnTo()
  const columns = useMemo<ColumnDef<ShiftAssignment>[]>(
    () => [
      {
        accessorKey: 'employeeName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Karyawan' />
        ),
        cell: ({ row }) => (
          <div className='min-w-0'>
            <Link
              className='block truncate font-medium hover:underline'
              title={row.original.employeeName}
              to='/karyawan/data-karyawan/$employeeUid'
              params={{ employeeUid: row.original.employeeUid }}
              search={{ returnTo }}
            >
              {row.original.employeeName}
            </Link>
            <p className='text-[11px] text-muted-foreground'>
              {row.original.employeeNumber}
            </p>
          </div>
        ),
        meta: {
          label: 'Karyawan',
          className: 'w-[15%] px-2',
          tdClassName: 'whitespace-normal',
        },
      },
      {
        accessorKey: 'site',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Penempatan' />
        ),
        cell: ({ row }) => <span>{titleCase(row.original.site)}</span>,
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
        meta: { label: 'Penempatan', className: 'w-[8%] px-2' },
      },
      {
        accessorKey: 'employeeType',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Jenis & Jabatan' />
        ),
        cell: ({ row }) => (
          <div className='min-w-0'>
            <p className='font-medium'>
              {titleCase(row.original.employeeType)}
            </p>
            <p
              className='truncate text-[11px] leading-3 text-muted-foreground'
              title={row.original.position || '-'}
            >
              {row.original.position || '-'}
            </p>
          </div>
        ),
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
        meta: {
          label: 'Jenis & Jabatan',
          className: 'w-[13%] px-2',
          tdClassName: 'whitespace-normal',
        },
      },
      {
        id: 'productionArea',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Bagian Produksi' />
        ),
        cell: ({ row }) => (
          <div className='min-w-0'>
            <p
              className='truncate font-medium'
              title={row.original.productionModule || '-'}
            >
              {row.original.productionModule || '-'}
            </p>
            <p
              className='truncate text-[11px] leading-3 text-muted-foreground'
              title={row.original.productionSection || '-'}
            >
              {row.original.productionSection || '-'}
            </p>
          </div>
        ),
        meta: {
          label: 'Bagian Produksi',
          className: 'w-[14%] px-2',
          tdClassName: 'whitespace-normal',
        },
      },
      {
        accessorKey: 'productionModule',
        enableHiding: false,
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
      },
      {
        accessorKey: 'productionSection',
        enableHiding: false,
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
      },
      {
        accessorKey: 'shiftUid',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Shift' />
        ),
        cell: ({ row }) => (
          <div className='min-w-0'>
            <p className='truncate font-medium' title={row.original.shiftName}>
              {row.original.shiftName}
            </p>
            <p className='text-[11px] text-muted-foreground tabular-nums'>
              {row.original.shiftCode} · {shortTime(row.original.startTime)}–
              {shortTime(row.original.endTime)}
            </p>
          </div>
        ),
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
        meta: {
          label: 'Shift',
          className: 'w-[14%] px-2',
          tdClassName: 'whitespace-normal',
        },
      },
      {
        id: 'period',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Periode & Hari' />
        ),
        cell: ({ row }) => (
          <div>
            <p>
              {formatDate(row.original.effectiveFrom)} –{' '}
              {row.original.effectiveTo
                ? formatDate(row.original.effectiveTo)
                : 'seterusnya'}
            </p>
            <p className='text-[11px] text-muted-foreground'>
              {workDaysLabel(row.original.workDays)}
            </p>
          </div>
        ),
        meta: {
          label: 'Periode & Hari',
          className: 'w-[19%] px-2',
          tdClassName: 'whitespace-normal leading-4',
        },
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Status' />
        ),
        cell: ({ row }) => <AssignmentStatus value={row.original.status} />,
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
        meta: { label: 'Status', className: 'w-[9%] px-2' },
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className='flex justify-end gap-1'>
            {row.original.status !== 'UPCOMING' && (
              <DataTableActionButton
                label={`Koreksi penugasan ${row.original.employeeName}`}
                onClick={() => onCorrect(row.original)}
              >
                <Pencil />
              </DataTableActionButton>
            )}
            {row.original.status === 'UPCOMING' && (
              <DataTableActionButton
                className='text-destructive hover:text-destructive'
                label={`Hapus penugasan mendatang ${row.original.employeeName}`}
                onClick={() => onDelete(row.original)}
              >
                <Trash2 />
              </DataTableActionButton>
            )}
          </div>
        ),
        meta: { className: 'w-[5%] px-1' },
      },
    ],
    [onCorrect, onDelete, returnTo]
  )
  return (
    <AttendanceTable
      result={result}
      columns={columns}
      search={search}
      navigate={navigate}
      searchPlaceholder='Cari nama atau nomor karyawan...'
      filters={[
        { columnId: 'site', title: 'Site', options: siteOptions },
        { columnId: 'employeeType', title: 'Jenis', options: employeeTypes },
        {
          columnId: 'productionModule',
          title: 'Modul',
          options: productionModuleOptions,
        },
        {
          columnId: 'productionSection',
          title: 'Bagian',
          options: productionSectionOptions,
        },
        {
          columnId: 'shiftUid',
          title: 'Shift',
          options: shifts.map((shift) => ({
            value: shift.uid,
            label: shift.name,
          })),
        },
        { columnId: 'status', title: 'Status', options: shiftStatuses },
      ]}
      columnFilters={[
        { columnId: 'site', searchKey: 'site', type: 'array' },
        { columnId: 'employeeType', searchKey: 'employeeType', type: 'array' },
        {
          columnId: 'productionModule',
          searchKey: 'productionModule',
          type: 'array',
        },
        {
          columnId: 'productionSection',
          searchKey: 'productionSection',
          type: 'array',
        },
        { columnId: 'shiftUid', searchKey: 'shiftUid', type: 'array' },
        { columnId: 'status', searchKey: 'status', type: 'array' },
      ]}
      hiddenColumnIds={['productionModule', 'productionSection']}
      compactDesktop
      empty='Tidak ada penugasan shift yang sesuai filter.'
      mobile={(assignment) => (
        <Card key={assignment.uid}>
          <CardContent className='space-y-3 p-4'>
            <div className='flex items-start justify-between gap-3'>
              <div>
                <Link
                  className='font-semibold hover:underline'
                  to='/karyawan/data-karyawan/$employeeUid'
                  params={{ employeeUid: assignment.employeeUid }}
                  search={{ returnTo }}
                >
                  {assignment.employeeName}
                </Link>
                <p className='text-xs text-muted-foreground'>
                  {assignment.employeeNumber} · {titleCase(assignment.site)}
                </p>
              </div>
              <AssignmentStatus value={assignment.status} />
            </div>
            <div className='text-sm'>
              <div className='mb-2 grid grid-cols-2 gap-3 text-xs'>
                <div>
                  <p className='text-muted-foreground'>Jenis & Jabatan</p>
                  <p>
                    {titleCase(assignment.employeeType)} ·{' '}
                    {assignment.position || '-'}
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground'>Bagian Produksi</p>
                  <p>
                    {assignment.productionModule || '-'} ·{' '}
                    {assignment.productionSection || '-'}
                  </p>
                </div>
              </div>
              <p className='font-medium'>{assignment.shiftName}</p>
              <p className='text-xs text-muted-foreground'>
                {formatDate(assignment.effectiveFrom)} –{' '}
                {assignment.effectiveTo
                  ? formatDate(assignment.effectiveTo)
                  : 'seterusnya'}
              </p>
            </div>
            {assignment.status !== 'UPCOMING' && (
              <Button
                size='sm'
                variant='outline'
                className='w-full'
                onClick={() => onCorrect(assignment)}
              >
                <Pencil /> Koreksi penugasan
              </Button>
            )}
            {assignment.status === 'UPCOMING' && (
              <Button
                size='sm'
                variant='outline'
                className='w-full text-destructive'
                onClick={() => onDelete(assignment)}
              >
                <Trash2 /> Hapus penugasan
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    />
  )
}

function AttendanceTable<T extends { uid: string }>({
  result,
  columns,
  search,
  navigate,
  searchPlaceholder,
  filters,
  columnFilters,
  hiddenColumnIds = [],
  compactDesktop = false,
  empty,
  mobile,
}: {
  result: QueryResult<T>
  columns: ColumnDef<T>[]
  search: Record<string, unknown>
  navigate: NavigateFn
  searchPlaceholder: string
  filters: {
    columnId: string
    title: string
    options: { value: string; label: string }[]
  }[]
  columnFilters: { columnId: string; searchKey: string; type: 'array' }[]
  hiddenColumnIds?: string[]
  compactDesktop?: boolean
  empty: string
  mobile: (item: T) => React.ReactNode
}) {
  const [sorting, setSorting] = useState<SortingState>([])
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters,
  })
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: result.data?.items ?? [],
    columns,
    state: {
      sorting,
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
      columnVisibility: Object.fromEntries(
        hiddenColumnIds.map((columnId) => [columnId, false])
      ),
    },
    pageCount: Math.max(
      1,
      Math.ceil((result.data?.total ?? 0) / (result.data?.pageSize ?? 50))
    ),
    manualPagination: true,
    manualFiltering: true,
    onSortingChange: setSorting,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const data = result.data
  return (
    <div className='space-y-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder={searchPlaceholder}
        searchDebounceMs={500}
        filters={filters}
      />
      {result.isFetching && !result.isPending && (
        <p
          role='status'
          className='flex items-center gap-2 text-xs text-muted-foreground'
        >
          <LoaderCircle className='size-3 animate-spin' /> Memperbarui data...
        </p>
      )}
      {result.isPending ? (
        <p role='status' className='py-10 text-center text-muted-foreground'>
          Memuat data...
        </p>
      ) : result.isError ? (
        <div className='py-10 text-center'>
          <p>Data gagal dimuat.</p>
          <Button
            variant='outline'
            className='mt-3'
            onClick={() => void result.refetch()}
          >
            <RefreshCcw /> Coba lagi
          </Button>
        </div>
      ) : !data?.items.length ? (
        <div className='py-10 text-center text-muted-foreground'>
          <CalendarDays className='mx-auto mb-2' /> {empty}
        </div>
      ) : (
        <>
          <div
            className={cn(
              'hidden rounded-md border',
              compactDesktop ? 'xl:block' : 'md:block'
            )}
          >
            <Table className={compactDesktop ? 'table-fixed' : undefined}>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={cn(
                          header.column.columnDef.meta?.className,
                          header.column.columnDef.meta?.thClassName
                        )}
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
                      <TableCell
                        key={cell.id}
                        className={cn(
                          cell.column.columnDef.meta?.className,
                          cell.column.columnDef.meta?.tdClassName
                        )}
                      >
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
          <div
            className={cn(
              'grid gap-3',
              compactDesktop ? 'xl:hidden' : 'md:hidden'
            )}
          >
            {data.items.map(mobile)}
          </div>
          <DataTablePagination
            table={table}
            summary={`Menampilkan ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)} dari ${data.total} data.`}
          />
        </>
      )}
    </div>
  )
}

function AssignmentStatus({ value }: { value: ShiftAssignment['status'] }) {
  const copy =
    value === 'CURRENT'
      ? 'Berjalan'
      : value === 'UPCOMING'
        ? 'Akan datang'
        : 'Berakhir'
  return (
    <Badge
      variant={
        value === 'CURRENT'
          ? 'default'
          : value === 'UPCOMING'
            ? 'outline'
            : 'secondary'
      }
    >
      {copy}
    </Badge>
  )
}

function shortTime(value: string) {
  return value.slice(0, 5)
}
function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase()
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}
function workDaysLabel(days: number[]) {
  const labels = ['', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
  return days.map((day) => labels[day]).join(', ')
}
