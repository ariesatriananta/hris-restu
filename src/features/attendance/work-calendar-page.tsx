import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  Ban,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  ExternalLink,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  Settings2,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DataTableActionButton,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import { useAttendanceFoundation } from './data/queries'
import { useWorkCalendar } from './data/work-calendar-queries'
import {
  CancelWorkCalendarDialog,
  CollectiveLeaveSitesDialog,
  WorkCalendarRuleDialog,
} from './work-calendar-dialogs'
import type {
  WorkCalendarEntry,
  WorkCalendarListParams,
  WorkCalendarType,
} from './work-calendar-domain'
import {
  dateLabel,
  effectiveStatusLabel,
  monthBounds,
  workCalendarTypeLabel,
  workCalendarTypeOptions,
} from './work-calendar-utils'

const monthNames = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

export function WorkCalendarPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const today = new Date()
  const year = numberValue(search.year, today.getFullYear())
  const month = numberValue(search.month, today.getMonth() + 1)
  const tab = search.tab === 'list' ? 'list' : 'calendar'
  const bounds = monthBounds(year, month)
  const params: WorkCalendarListParams = {
    query: stringValue(search.filter),
    site: arrayValue(search.site),
    type: arrayValue(search.type),
    dateFrom: bounds.start,
    dateTo: bounds.end,
    page: tab === 'list' ? numberValue(search.page, 1) : 1,
    pageSize: tab === 'list' ? numberValue(search.pageSize, 50) : 500,
  }
  const result = useWorkCalendar(params)
  const foundation = useAttendanceFoundation()
  const session = useAuthStore((state) => state.session)
  const canManage =
    hasPermission(session, 'attendance.manage_calendar') &&
    (session?.user.role === 'HR_OFFICER' ||
      session?.user.role === 'SUPER_ADMIN')
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [collectiveDialogOpen, setCollectiveDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [selected, setSelected] = useState<WorkCalendarEntry>()
  const sites = foundation.data?.sites ?? []

  const edit = (item: WorkCalendarEntry) => {
    setSelected(item)
    setRuleDialogOpen(true)
  }
  const assignSites = (item: WorkCalendarEntry) => {
    setSelected(item)
    setCollectiveDialogOpen(true)
  }
  const cancel = (item: WorkCalendarEntry) => {
    setSelected(item)
    setCancelDialogOpen(true)
  }

  return (
    <Main>
      <div className='mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Attendance</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Kalender Kerja & Libur
          </h1>
          <p className='text-sm text-muted-foreground'>
            Kelola kalender resmi, Cuti Bersama, dan aturan khusus per site.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setSelected(undefined)
              setRuleDialogOpen(true)
            }}
          >
            <Plus /> Tambah aturan site
          </Button>
        )}
      </div>

      <Alert className='mb-4 border-sky-500/40 bg-sky-500/5'>
        <CalendarRange className='text-sky-700' />
        <AlertTitle>Scan hari libur tetap diterima</AlertTitle>
        <AlertDescription>
          Kalender menentukan status hari kerja/libur. Scan yang benar-benar
          terjadi tetap dicatat sebagai PRESENT dan tidak dihapus atau diubah.
        </AlertDescription>
      </Alert>

      <div className='mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
        <MonthSelect
          value={month}
          onChange={(next) =>
            updateSearch(navigate, { month: next, page: undefined })
          }
        />
        <YearSelect
          value={year}
          onChange={(next) =>
            updateSearch(navigate, { year: next, page: undefined })
          }
        />
        <FilterSelect
          label='Semua site'
          value={arrayValue<string>(search.site)?.[0] ?? 'ALL'}
          options={sites.map((site) => ({
            value: site.code,
            label: site.name,
          }))}
          onChange={(next) =>
            updateSearch(navigate, {
              site: next === 'ALL' ? undefined : [next],
              page: undefined,
            })
          }
        />
        <FilterSelect
          label='Semua jenis'
          value={arrayValue<string>(search.type)?.[0] ?? 'ALL'}
          options={workCalendarTypeOptions}
          onChange={(next) =>
            updateSearch(navigate, {
              type: next === 'ALL' ? undefined : [next],
              page: undefined,
            })
          }
        />
      </div>

      <Tabs
        value={tab}
        onValueChange={(next) =>
          updateSearch(navigate, {
            tab: next === 'calendar' ? undefined : next,
            page: undefined,
          })
        }
        className='space-y-4'
      >
        <TabsList className='h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1 sm:w-fit'>
          <TabsTrigger value='calendar' className='h-10 flex-none gap-2 px-4'>
            <CalendarDays /> Kalender
          </TabsTrigger>
          <TabsTrigger value='list' className='h-10 flex-none gap-2 px-4'>
            <ClipboardList /> Daftar Tanggal
          </TabsTrigger>
        </TabsList>
        <TabsContent value='calendar'>
          <CalendarView
            year={year}
            month={month}
            items={result.data?.items ?? []}
            pending={result.isPending}
            error={result.isError}
            onRetry={() => void result.refetch()}
          />
        </TabsContent>
        <TabsContent value='list'>
          <CalendarTable
            result={result}
            search={search}
            navigate={navigate}
            sites={sites.map((site) => ({
              value: site.code,
              label: site.name,
            }))}
            canManage={canManage}
            onEdit={edit}
            onAssignSites={assignSites}
            onCancel={cancel}
          />
        </TabsContent>
      </Tabs>

      {ruleDialogOpen && (
        <WorkCalendarRuleDialog
          open
          onOpenChange={setRuleDialogOpen}
          sites={sites}
          value={selected}
        />
      )}
      {collectiveDialogOpen && (
        <CollectiveLeaveSitesDialog
          open
          onOpenChange={setCollectiveDialogOpen}
          sites={sites}
          value={selected}
        />
      )}
      {cancelDialogOpen && (
        <CancelWorkCalendarDialog
          open
          onOpenChange={setCancelDialogOpen}
          value={selected}
        />
      )}
    </Main>
  )
}

function CalendarView({
  year,
  month,
  items,
  pending,
  error,
  onRetry,
}: {
  year: number
  month: number
  items: WorkCalendarEntry[]
  pending: boolean
  error: boolean
  onRetry: () => void
}) {
  if (pending) return <StateText loading>Memuat kalender...</StateText>
  if (error) {
    return (
      <StateText>
        Kalender gagal dimuat.
        <Button size='sm' variant='outline' onClick={onRetry}>
          <RefreshCcw /> Coba lagi
        </Button>
      </StateText>
    )
  }
  if (!items.length) {
    return (
      <StateText>
        Belum ada tanggal kalender untuk {monthNames[month - 1]} {year}.
      </StateText>
    )
  }
  const byDate = new Map<string, WorkCalendarEntry[]>()
  items.forEach((item) => {
    const list = byDate.get(item.businessDate) ?? []
    list.push(item)
    byDate.set(item.businessDate, list)
  })
  const days = new Date(year, month, 0).getDate()
  const leading = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const cells: Array<number | null> = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: days }, (_, index) => index + 1),
  ]
  while (cells.length % 7) cells.push(null)

  return (
    <>
      <div className='mx-auto hidden w-full max-w-6xl overflow-hidden rounded-md border md:block'>
        <div className='grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground'>
          {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((day) => (
            <div key={day} className='px-2 py-1.5'>
              {day}
            </div>
          ))}
        </div>
        <div className='grid grid-cols-7'>
          {cells.map((day, index) => {
            const date = day
              ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              : ''
            const events = day ? (byDate.get(date) ?? []) : []
            return (
              <div
                key={`${index}-${day ?? 'empty'}`}
                className='min-h-20 border-r border-b p-1.5 last:border-r-0'
              >
                {day && (
                  <>
                    <p className='mb-1 text-[11px] leading-none font-semibold tabular-nums'>
                      {day}
                    </p>
                    <div className='space-y-1'>
                      {events.slice(0, 2).map((item) => (
                        <CalendarEvent key={item.uid} item={item} />
                      ))}
                      {events.length > 2 && (
                        <p className='text-[10px] leading-none text-muted-foreground'>
                          +{events.length - 2} lainnya
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <div className='grid gap-3 md:hidden'>
        {[...byDate.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([date, events]) => (
            <Card key={date}>
              <CardContent className='space-y-3 p-4'>
                <p className='font-semibold'>
                  {dateLabel(date, 'EEEE, dd MMM')}
                </p>
                <div className='space-y-2'>
                  {events.map((item) => (
                    <CalendarEvent key={item.uid} item={item} mobile />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
      </div>
    </>
  )
}

function CalendarEvent({
  item,
  mobile = false,
}: {
  item: WorkCalendarEntry
  mobile?: boolean
}) {
  return (
    <div
      className={`rounded border px-1.5 py-1 ${eventTone(item.calendarType)}`}
      title={`${item.name} · ${effectiveStatusLabel(item.effectiveStatus)}`}
    >
      <p
        className={
          mobile ? 'text-sm font-medium' : 'truncate text-[11px] font-medium'
        }
      >
        {item.name}
      </p>
      <p className='truncate text-[10px] opacity-80'>
        {workCalendarTypeLabel(item.calendarType)}
        {item.sites.length ? ` · ${item.sites.join(', ')}` : ''}
      </p>
    </div>
  )
}

function CalendarTable({
  result,
  search,
  navigate,
  sites,
  canManage,
  onEdit,
  onAssignSites,
  onCancel,
}: {
  result: ReturnType<typeof useWorkCalendar>
  search: Record<string, unknown>
  navigate: NavigateFn
  sites: { value: string; label: string }[]
  canManage: boolean
  onEdit: (item: WorkCalendarEntry) => void
  onAssignSites: (item: WorkCalendarEntry) => void
  onCancel: (item: WorkCalendarEntry) => void
}) {
  const columns = useMemo<ColumnDef<WorkCalendarEntry>[]>(
    () => [
      {
        accessorKey: 'businessDate',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Tanggal' />
        ),
        cell: ({ row }) => dateLabel(row.original.businessDate),
        meta: { label: 'Tanggal' },
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Keterangan' />
        ),
        cell: ({ row }) => (
          <div className='max-w-80'>
            <p className='font-medium'>{row.original.name}</p>
            {row.original.sourceDocument && (
              <p className='text-[11px] text-muted-foreground'>
                {row.original.sourceDocument}
              </p>
            )}
          </div>
        ),
        meta: { label: 'Keterangan' },
      },
      {
        accessorKey: 'calendarType',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Jenis' />
        ),
        cell: ({ row }) => <TypeBadge value={row.original.calendarType} />,
        filterFn: (row, id, values: string[]) =>
          values.includes(row.getValue(id)),
        meta: { label: 'Jenis' },
      },
      {
        id: 'site',
        accessorFn: (row) => row.sites,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Cakupan' />
        ),
        cell: ({ row }) =>
          row.original.scope === 'GLOBAL'
            ? 'Semua site'
            : row.original.sites.join(', ') || 'Belum dipilih',
        filterFn: (row, _id, values: string[]) =>
          values.some((value) => row.original.sites.includes(value as never)),
        meta: { label: 'Cakupan' },
      },
      {
        accessorKey: 'effectiveStatus',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Status efektif' />
        ),
        cell: ({ row }) => <EffectiveBadge item={row.original} />,
        meta: { label: 'Status efektif' },
      },
      {
        id: 'source',
        header: 'Sumber',
        cell: ({ row }) =>
          row.original.isReadOnly ? (
            row.original.sourceUrl ? (
              <Button asChild variant='link' className='h-auto p-0 text-xs'>
                <a
                  href={row.original.sourceUrl}
                  target='_blank'
                  rel='noreferrer'
                >
                  Kalender resmi <ExternalLink />
                </a>
              </Button>
            ) : (
              <Badge variant='outline'>Kalender resmi</Badge>
            )
          ) : (
            <Badge variant='secondary'>Aturan site</Badge>
          ),
        meta: { label: 'Sumber' },
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>Aksi</span>,
        cell: ({ row }) => (
          <RowActions
            item={row.original}
            canManage={canManage}
            onEdit={onEdit}
            onAssignSites={onAssignSites}
            onCancel={onCancel}
          />
        ),
        enableHiding: false,
        meta: { label: 'Aksi' },
      },
    ],
    [canManage, onAssignSites, onCancel, onEdit]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'calendarType', searchKey: 'type', type: 'array' },
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
    manualPagination: true,
    manualFiltering: true,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
  })
  const data = result.data

  return (
    <div className='space-y-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari nama tanggal kalender...'
        searchDebounceMs={500}
        filters={[
          { columnId: 'site', title: 'Site', options: sites },
          {
            columnId: 'calendarType',
            title: 'Jenis',
            options: workCalendarTypeOptions,
          },
        ]}
      />
      {result.isFetching && !result.isPending && (
        <p
          className='flex items-center gap-2 text-xs text-muted-foreground'
          role='status'
        >
          <LoaderCircle className='size-3 animate-spin' /> Memperbarui data...
        </p>
      )}
      {result.isPending ? (
        <StateText loading>Memuat daftar kalender...</StateText>
      ) : result.isError ? (
        <StateText>
          Daftar kalender gagal dimuat.
          <Button
            variant='outline'
            size='sm'
            onClick={() => void result.refetch()}
          >
            <RefreshCcw /> Coba lagi
          </Button>
        </StateText>
      ) : !data?.items.length ? (
        <StateText>Tidak ada tanggal kalender yang sesuai filter.</StateText>
      ) : (
        <>
          <div className='hidden rounded-md border md:block'>
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
          <div className='grid gap-3 md:hidden'>
            {data.items.map((item) => (
              <Card key={item.uid}>
                <CardContent className='space-y-3 p-4'>
                  <div className='flex items-start justify-between gap-3'>
                    <div>
                      <p className='font-semibold'>{item.name}</p>
                      <p className='text-xs text-muted-foreground'>
                        {dateLabel(item.businessDate)}
                      </p>
                    </div>
                    <TypeBadge value={item.calendarType} />
                  </div>
                  <div className='flex flex-wrap items-center gap-2 text-xs'>
                    <EffectiveBadge item={item} />
                    <span className='text-muted-foreground'>
                      {item.scope === 'GLOBAL'
                        ? 'Semua site'
                        : item.sites.join(', ') || 'Belum ada site'}
                    </span>
                  </div>
                  {item.attendanceCount > 0 && (
                    <p className='text-xs text-muted-foreground'>
                      {item.attendanceCount} attendance PRESENT tetap tersimpan.
                    </p>
                  )}
                  <RowActions
                    item={item}
                    canManage={canManage}
                    onEdit={onEdit}
                    onAssignSites={onAssignSites}
                    onCancel={onCancel}
                    mobile
                  />
                </CardContent>
              </Card>
            ))}
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

function RowActions({
  item,
  canManage,
  onEdit,
  onAssignSites,
  onCancel,
  mobile = false,
}: {
  item: WorkCalendarEntry
  canManage: boolean
  onEdit: (item: WorkCalendarEntry) => void
  onAssignSites: (item: WorkCalendarEntry) => void
  onCancel: (item: WorkCalendarEntry) => void
  mobile?: boolean
}) {
  if (!canManage || item.status === 'CANCELLED') return null
  if (mobile) {
    return (
      <div className='flex flex-wrap justify-end gap-2 border-t pt-3'>
        {item.calendarType === 'COLLECTIVE_LEAVE' && (
          <Button
            size='sm'
            variant='outline'
            onClick={() => onAssignSites(item)}
          >
            <Settings2 /> Atur site
          </Button>
        )}
        {!item.isReadOnly && item.scope === 'SITE' && (
          <>
            <Button size='sm' variant='outline' onClick={() => onEdit(item)}>
              <Pencil /> Ubah
            </Button>
            <Button
              size='sm'
              variant='outline'
              className='text-destructive'
              onClick={() => onCancel(item)}
            >
              <Ban /> Batalkan
            </Button>
          </>
        )}
      </div>
    )
  }
  return (
    <div className='flex justify-end gap-1'>
      {item.calendarType === 'COLLECTIVE_LEAVE' && (
        <DataTableActionButton
          label='Atur site'
          onClick={() => onAssignSites(item)}
        >
          <Settings2 />
        </DataTableActionButton>
      )}
      {!item.isReadOnly && item.scope === 'SITE' && (
        <>
          <DataTableActionButton label='Ubah' onClick={() => onEdit(item)}>
            <Pencil />
          </DataTableActionButton>
          <DataTableActionButton
            label='Batalkan'
            className='text-destructive'
            onClick={() => onCancel(item)}
          >
            <Ban />
          </DataTableActionButton>
        </>
      )}
    </div>
  )
}

function TypeBadge({ value }: { value: WorkCalendarType }) {
  return (
    <Badge variant={value === 'WORKDAY_OVERRIDE' ? 'default' : 'secondary'}>
      {workCalendarTypeLabel(value)}
    </Badge>
  )
}

function EffectiveBadge({ item }: { item: WorkCalendarEntry }) {
  return (
    <Badge variant={item.status === 'CANCELLED' ? 'outline' : 'secondary'}>
      {effectiveStatusLabel(item.effectiveStatus)}
    </Badge>
  )
}

function StateText({
  children,
  loading = false,
}: {
  children: React.ReactNode
  loading?: boolean
}) {
  return (
    <div
      className='flex min-h-40 flex-col items-center justify-center gap-3 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'
      role={loading ? 'status' : undefined}
    >
      {loading && <LoaderCircle className='animate-spin' />}
      {children}
    </div>
  )
}

function MonthSelect({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(next) => onChange(Number(next))}
    >
      <SelectTrigger className='w-full' aria-label='Bulan kalender'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {monthNames.map((label, index) => (
          <SelectItem key={label} value={String(index + 1)}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function YearSelect({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  const years = Array.from({ length: 8 }, (_, index) => value - 3 + index)
  return (
    <Select
      value={String(value)}
      onValueChange={(next) => onChange(Number(next))}
    >
      <SelectTrigger className='w-full' aria-label='Tahun kalender'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {years.map((year) => (
          <SelectItem key={year} value={String(year)}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className='w-full' aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='ALL'>{label}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function eventTone(type: WorkCalendarType) {
  if (type === 'WORKDAY_OVERRIDE')
    return 'border-primary/30 bg-primary/10 text-primary'
  if (type === 'COLLECTIVE_LEAVE') return 'border-amber-500/30 bg-amber-500/10'
  if (type === 'SITE_HOLIDAY') return 'border-destructive/25 bg-destructive/5'
  return 'border-muted-foreground/20 bg-muted'
}

function updateSearch(navigate: NavigateFn, patch: Record<string, unknown>) {
  navigate({ search: (previous) => ({ ...previous, ...patch }) })
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function arrayValue<T extends string>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : undefined
}
