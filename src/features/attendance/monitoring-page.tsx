import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { AlertTriangle, Clock3, RefreshCcw, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  DataTableActionButton,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import {
  useAttendanceFoundation,
  useAttendanceMonitoring,
  useCreateAttendanceCorrection,
} from './data/queries'
import type {
  AttendanceCorrectionInput,
  AttendanceCorrectionType,
  AttendanceMonitoringRecord,
  AttendanceStatus,
} from './domain'

export function AttendanceMonitoringPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const session = useAuthStore((state) => state.session)
  const canCorrect = hasPermission(session, 'attendance.correct')
  const foundation = useAttendanceFoundation()
  const businessDate =
    typeof search.businessDate === 'string' ? search.businessDate : today()
  const result = useAttendanceMonitoring({
    businessDate,
    query: stringValue(search.filter),
    site: arrayValue(search.site),
    attendanceStatus: arrayValue(search.attendanceStatus),
    qualityStatus: arrayValue(search.qualityStatus),
    abnormalReason: arrayValue(search.abnormalReason),
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  })
  const [selected, setSelected] = useState<AttendanceMonitoringRecord>()
  const siteOptions = (foundation.data?.sites ?? []).map((site) => ({
    value: site.code,
    label: site.name,
  }))

  return (
    <Main>
      <div className='mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Attendance</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Monitoring Harian
          </h1>
          <p className='text-sm text-muted-foreground'>
            Pantau kehadiran dan rekaman jam yang perlu ditindaklanjuti HR.
          </p>
        </div>
        <label className='grid gap-1 text-sm'>
          <span className='font-medium'>Tanggal kerja</span>
          <Input
            type='date'
            className='w-full sm:w-44'
            value={businessDate}
            onChange={(event) =>
              navigate({
                search: (previous) => ({
                  ...previous,
                  businessDate:
                    event.target.value === today()
                      ? undefined
                      : event.target.value,
                  page: undefined,
                }),
              })
            }
          />
        </label>
      </div>

      <Summary data={result.data?.summary} />
      <div className='mt-5'>
        <MonitoringTable
          result={result}
          search={search}
          navigate={navigate}
          siteOptions={siteOptions}
          canCorrect={canCorrect}
          onCorrect={setSelected}
        />
      </div>
      <CorrectionRequestDialog
        key={selected?.uid ?? 'closed'}
        record={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(undefined)}
      />
    </Main>
  )
}

function Summary({
  data,
}: {
  data?: {
    total: number
    present: number
    abnormal: number
    missingClockIn: number
    missingClockOut: number
  }
}) {
  const items = [
    ['Total', data?.total ?? 0, Users, 'text-primary'],
    ['Hadir', data?.present ?? 0, Clock3, 'text-positive'],
    ['Abnormal', data?.abnormal ?? 0, AlertTriangle, 'text-warning-foreground'],
    [
      'Tanpa masuk',
      data?.missingClockIn ?? 0,
      AlertTriangle,
      'text-warning-foreground',
    ],
    [
      'Tanpa pulang',
      data?.missingClockOut ?? 0,
      AlertTriangle,
      'text-warning-foreground',
    ],
  ] as const
  return (
    <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-5'>
      {items.map(([label, value, Icon, color]) => (
        <Card key={label} className='min-h-[68px] rounded-lg'>
          <CardContent className='flex items-center justify-between px-3 py-2.5'>
            <div>
              <p className='text-xs text-muted-foreground'>{label}</p>
              <p className='text-xl font-bold'>{value}</p>
            </div>
            <Icon className={`size-4 ${color}`} aria-hidden='true' />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function MonitoringTable({
  result,
  search,
  navigate,
  siteOptions,
  canCorrect,
  onCorrect,
}: {
  result: ReturnType<typeof useAttendanceMonitoring>
  search: Record<string, unknown>
  navigate: NavigateFn
  siteOptions: { value: string; label: string }[]
  canCorrect: boolean
  onCorrect: (record: AttendanceMonitoringRecord) => void
}) {
  const columns = useMemo<ColumnDef<AttendanceMonitoringRecord>[]>(
    () => [
      {
        accessorKey: 'employeeName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Karyawan' />
        ),
        cell: ({ row }) => (
          <div>
            <p className='font-medium'>{row.original.employeeName}</p>
            <p className='text-xs text-muted-foreground'>
              {row.original.employeeNumber}
            </p>
          </div>
        ),
      },
      { accessorKey: 'site', header: 'Site' },
      {
        accessorKey: 'shiftName',
        header: 'Shift',
        cell: ({ row }) => row.original.shiftName ?? '-',
      },
      {
        accessorKey: 'attendanceStatus',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant='outline'>
            {statusLabel(row.original.attendanceStatus)}
          </Badge>
        ),
      },
      {
        id: 'clock',
        header: 'Masuk / Pulang',
        cell: ({ row }) => (
          <div className='text-sm whitespace-nowrap'>
            <span>{timeLabel(row.original.clockInAt)}</span>
            <span className='text-muted-foreground'> / </span>
            <span>{timeLabel(row.original.clockOutAt)}</span>
          </div>
        ),
      },
      {
        accessorKey: 'qualityStatus',
        header: 'Kualitas',
        cell: ({ row }) => <QualityBadge record={row.original} />,
      },
      {
        accessorKey: 'abnormalReasons',
        header: 'Penyebab abnormal',
        cell: ({ row }) =>
          row.original.abnormalReasons.map(abnormalLabel).join(', ') || '-',
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>Aksi</span>,
        cell: ({ row }) =>
          canCorrect ? (
            <DataTableActionButton
              label='Ajukan koreksi'
              onClick={() => onCorrect(row.original)}
            >
              <Clock3 />
            </DataTableActionButton>
          ) : null,
      },
    ],
    [canCorrect, onCorrect]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      {
        columnId: 'attendanceStatus',
        searchKey: 'attendanceStatus',
        type: 'array',
      },
      { columnId: 'qualityStatus', searchKey: 'qualityStatus', type: 'array' },
      {
        columnId: 'abnormalReasons',
        searchKey: 'abnormalReason',
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
    manualPagination: true,
    manualFiltering: true,
    initialState: { columnVisibility: { abnormalReasons: false } },
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
        searchPlaceholder='Cari nama atau nomor karyawan...'
        searchDebounceMs={500}
        filters={[
          { columnId: 'site', title: 'Site', options: siteOptions },
          {
            columnId: 'attendanceStatus',
            title: 'Status',
            options: attendanceStatusOptions,
          },
          {
            columnId: 'qualityStatus',
            title: 'Kualitas',
            options: qualityOptions,
          },
          {
            columnId: 'abnormalReasons',
            title: 'Penyebab',
            options: abnormalOptions,
          },
        ]}
      />
      {result.isPending ? (
        <StateText>Memuat monitoring attendance...</StateText>
      ) : result.isError ? (
        <StateText>
          Data gagal dimuat.{' '}
          <Button
            variant='outline'
            size='sm'
            onClick={() => void result.refetch()}
          >
            <RefreshCcw /> Coba lagi
          </Button>
        </StateText>
      ) : !data?.items.length ? (
        <StateText>
          Tidak ada data attendance pada tanggal dan filter ini.
        </StateText>
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
                  <TableRow
                    key={row.id}
                    className={
                      row.original.qualityStatus === 'ABNORMAL'
                        ? 'bg-warning/5'
                        : undefined
                    }
                  >
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
              <MobileRecord
                key={item.uid}
                item={item}
                canCorrect={canCorrect}
                onCorrect={onCorrect}
              />
            ))}
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

function MobileRecord({
  item,
  canCorrect,
  onCorrect,
}: {
  item: AttendanceMonitoringRecord
  canCorrect: boolean
  onCorrect: (item: AttendanceMonitoringRecord) => void
}) {
  return (
    <div className='space-y-3 rounded-lg border p-3'>
      <div className='flex items-start justify-between gap-2'>
        <div>
          <p className='font-medium'>{item.employeeName}</p>
          <p className='text-xs text-muted-foreground'>
            {item.employeeNumber} · {item.site}
          </p>
        </div>
        <QualityBadge record={item} />
      </div>
      <div className='grid grid-cols-2 gap-2 text-sm'>
        <div>
          <p className='text-xs text-muted-foreground'>Masuk</p>
          {timeLabel(item.clockInAt)}
        </div>
        <div>
          <p className='text-xs text-muted-foreground'>Pulang</p>
          {timeLabel(item.clockOutAt)}
        </div>
      </div>
      {canCorrect && (
        <Button
          variant='outline'
          className='w-full'
          onClick={() => onCorrect(item)}
        >
          <Clock3 /> Ajukan koreksi
        </Button>
      )}
    </div>
  )
}

function QualityBadge({ record }: { record: AttendanceMonitoringRecord }) {
  if (record.qualityStatus === 'NORMAL')
    return <Badge variant='secondary'>Normal</Badge>
  return (
    <Badge
      variant='outline'
      className='border-warning/60 bg-warning/15 text-warning-foreground'
    >
      {record.abnormalReasons.map(abnormalLabel).join(', ') || 'Abnormal'}
    </Badge>
  )
}

function CorrectionRequestDialog({
  record,
  open,
  onOpenChange,
}: {
  record?: AttendanceMonitoringRecord
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mutation = useCreateAttendanceCorrection()
  const defaultType = record?.abnormalReasons.includes('MISSING_CLOCK_IN')
    ? 'CLOCK_IN'
    : record?.abnormalReasons.includes('MISSING_CLOCK_OUT')
      ? 'CLOCK_OUT'
      : 'BOTH'
  const [type, setType] = useState<AttendanceCorrectionType>(defaultType)
  const [clockIn, setClockIn] = useState('')
  const [clockOut, setClockOut] = useState('')
  const [status, setStatus] = useState<AttendanceStatus>('PRESENT')
  const [reason, setReason] = useState('')
  if (!record) return null
  const submit = () => {
    if (reason.trim().length < 5)
      return toast.error('Alasan koreksi minimal 5 karakter.')
    if ((type === 'CLOCK_IN' || type === 'BOTH') && !clockIn)
      return toast.error('Jam masuk baru wajib diisi.')
    if ((type === 'CLOCK_OUT' || type === 'BOTH') && !clockOut)
      return toast.error('Jam pulang baru wajib diisi.')
    const input: AttendanceCorrectionInput = {
      attendanceUid: record.uid,
      correctionType: type,
      newClockInAt:
        type === 'CLOCK_IN' || type === 'BOTH' ? clockIn || null : undefined,
      newClockOutAt:
        type === 'CLOCK_OUT' || type === 'BOTH' ? clockOut || null : undefined,
      newStatus: type === 'STATUS' ? status : undefined,
      reason: reason.trim(),
    }
    mutation.mutate(input, {
      onSuccess: () => {
        toast.success('Koreksi berhasil diajukan.')
        onOpenChange(false)
      },
      onError: (error) =>
        toast.error(apiError(error, 'Koreksi gagal diajukan.')),
    })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Ajukan Koreksi Attendance</DialogTitle>
          <DialogDescription>
            {record.employeeName} · {record.employeeNumber} ·{' '}
            {dateLabel(record.businessDate)}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <label className='grid gap-1 text-sm'>
            <span>Jenis koreksi</span>
            <select
              className='h-9 rounded-md border bg-background px-3'
              value={type}
              onChange={(event) =>
                setType(event.target.value as AttendanceCorrectionType)
              }
            >
              <option value='CLOCK_IN'>Jam masuk</option>
              <option value='CLOCK_OUT'>Jam pulang</option>
              <option value='BOTH'>Jam masuk dan pulang</option>
              <option value='STATUS'>Status kehadiran</option>
            </select>
          </label>
          {(type === 'CLOCK_IN' || type === 'BOTH') && (
            <label className='grid gap-1 text-sm'>
              <span>Jam masuk baru</span>
              <Input
                type='datetime-local'
                value={clockIn}
                onChange={(event) => setClockIn(event.target.value)}
                required
              />
            </label>
          )}
          {(type === 'CLOCK_OUT' || type === 'BOTH') && (
            <label className='grid gap-1 text-sm'>
              <span>Jam pulang baru</span>
              <Input
                type='datetime-local'
                value={clockOut}
                onChange={(event) => setClockOut(event.target.value)}
                required
              />
            </label>
          )}
          {type === 'STATUS' && (
            <label className='grid gap-1 text-sm'>
              <span>Status baru</span>
              <select
                className='h-9 rounded-md border bg-background px-3'
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as AttendanceStatus)
                }
              >
                {attendanceStatusOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className='grid gap-1'>
            <Label htmlFor='correction-reason'>Alasan koreksi</Label>
            <Textarea
              id='correction-reason'
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder='Jelaskan penyebab dan bukti koreksi.'
            />
          </div>
          <div className='flex justify-end gap-2'>
            <Button variant='outline' onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button onClick={submit} disabled={mutation.isPending}>
              Ajukan koreksi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

const attendanceStatusOptions = [
  'PRESENT',
  'ABSENT',
  'LEAVE',
  'SICK',
  'PERMISSION',
  'HOLIDAY',
].map((value) => ({ value, label: statusLabel(value) }))
const qualityOptions = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'ABNORMAL', label: 'Abnormal' },
]
const abnormalOptions = [
  { value: 'MISSING_CLOCK_IN', label: 'Tanpa jam masuk' },
  { value: 'MISSING_CLOCK_OUT', label: 'Tanpa jam pulang' },
]
function StateText({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex min-h-40 items-center justify-center gap-2 text-center text-sm text-muted-foreground'>
      {children}
    </div>
  )
}
function today() {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 10)
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
function statusLabel(value: string) {
  return (
    {
      PRESENT: 'Hadir',
      ABSENT: 'Tidak hadir',
      LEAVE: 'Cuti',
      SICK: 'Sakit',
      PERMISSION: 'Izin',
      HOLIDAY: 'Libur',
    }[value] ?? value
  )
}
function abnormalLabel(value: string) {
  return value === 'MISSING_CLOCK_IN'
    ? 'Tanpa jam masuk'
    : value === 'MISSING_CLOCK_OUT'
      ? 'Tanpa jam pulang'
      : value
}
function timeLabel(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '-'
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(
    new Date(`${value}T00:00:00`)
  )
}
function paginationSummary(page: number, pageSize: number, total: number) {
  return total
    ? `Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} dari ${total} data.`
    : 'Tidak ada data.'
}
function apiError(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
