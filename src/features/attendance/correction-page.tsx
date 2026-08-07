import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { Check, Eye, RefreshCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import {
  useAttendanceCorrections,
  useAttendanceFoundation,
  useReviewAttendanceCorrection,
} from './data/queries'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'
import type { AttendanceCorrection } from './domain'

export function AttendanceCorrectionPage({
  search,
  navigate,
  embedded = false,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
  embedded?: boolean
}) {
  const session = useAuthStore((state) => state.session)
  const canApprove = hasPermission(session, 'attendance.approve')
  const foundation = useAttendanceFoundation(
    hasPermission(session, 'attendance.view')
  )
  const businessDate =
    typeof search.businessDate === 'string' ? search.businessDate : undefined
  const result = useAttendanceCorrections({
    businessDate,
    query: stringValue(search.filter),
    site: arrayValue(search.site),
    approvalStatus: arrayValue(search.approvalStatus),
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  })
  const [selected, setSelected] = useState<AttendanceCorrection>()
  const siteOptions = (foundation.data?.sites ?? []).map((site) => ({
    value: site.code,
    label: site.name,
  }))
  const scopedSiteOptions = siteOptions.length
    ? siteOptions
    : (session?.user.siteAccess ?? []).map((site) => ({
        value: site,
        label: site[0] + site.slice(1).toLowerCase(),
      }))

  const PageContainer = embedded ? 'div' : Main
  return (
    <PageContainer>
      <div
        className={
          embedded
            ? 'mb-4 flex justify-end'
            : 'mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'
        }
      >
        {!embedded && (
          <div>
            <p className='text-sm font-medium text-primary'>Attendance</p>
            <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
              Koreksi Attendance
            </h1>
            <p className='text-sm text-muted-foreground'>
              Tinjau pengajuan, approval, dan penerapan koreksi dalam satu
              histori.
            </p>
          </div>
        )}
        <label className='grid gap-1 text-sm sm:w-48'>
          <span className='font-medium'>Tanggal kerja</span>
          <DatePicker
            selected={dateOnlyFromInput(businessDate)}
            placeholder='Semua tanggal'
            onSelect={(date) =>
              navigate({
                search: (previous) => ({
                  ...previous,
                  businessDate: dateOnlyToInput(date) || undefined,
                  page: undefined,
                }),
              })
            }
          />
        </label>
      </div>
      <CorrectionTable
        result={result}
        search={search}
        navigate={navigate}
        siteOptions={scopedSiteOptions}
        canApprove={canApprove}
        onOpen={setSelected}
      />
      <ReviewDialog
        key={selected?.uid ?? 'closed'}
        correction={selected}
        canApprove={canApprove}
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelected(undefined)}
      />
    </PageContainer>
  )
}

function CorrectionTable({
  result,
  search,
  navigate,
  siteOptions,
  canApprove,
  onOpen,
}: {
  result: ReturnType<typeof useAttendanceCorrections>
  search: Record<string, unknown>
  navigate: NavigateFn
  siteOptions: { value: string; label: string }[]
  canApprove: boolean
  onOpen: (item: AttendanceCorrection) => void
}) {
  const columns = useMemo<ColumnDef<AttendanceCorrection>[]>(
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
      {
        accessorKey: 'businessDate',
        header: 'Tanggal',
        cell: ({ row }) => dateLabel(row.original.businessDate),
      },
      { accessorKey: 'site', header: 'Site' },
      {
        accessorKey: 'correctionType',
        header: 'Koreksi',
        cell: ({ row }) => correctionTypeLabel(row.original.correctionType),
      },
      {
        accessorKey: 'requestedByName',
        header: 'Pengaju',
        cell: ({ row }) => (
          <div>
            <p>{row.original.requestedByName}</p>
            <p className='text-xs text-muted-foreground'>
              {dateTimeLabel(row.original.requestedAt)}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'approvalStatus',
        header: 'Status',
        cell: ({ row }) => (
          <ApprovalBadge value={row.original.approvalStatus} />
        ),
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>Aksi</span>,
        cell: ({ row }) => (
          <DataTableActionButton
            label={
              canApprove && row.original.approvalStatus === 'PENDING'
                ? 'Review koreksi'
                : 'Lihat detail'
            }
            onClick={() => onOpen(row.original)}
          >
            <Eye />
          </DataTableActionButton>
        ),
      },
    ],
    [canApprove, onOpen]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      {
        columnId: 'approvalStatus',
        searchKey: 'approvalStatus',
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
  const data = result.data
  return (
    <div className='space-y-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari karyawan atau pengaju...'
        searchDebounceMs={500}
        filters={[
          { columnId: 'site', title: 'Site', options: siteOptions },
          {
            columnId: 'approvalStatus',
            title: 'Status approval',
            options: approvalOptions,
          },
        ]}
      />
      {result.isPending ? (
        <StateText>Memuat pengajuan koreksi...</StateText>
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
        <StateText>Belum ada pengajuan koreksi pada filter ini.</StateText>
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
              <button
                type='button'
                key={item.uid}
                className='space-y-2 rounded-lg border p-3 text-left'
                onClick={() => onOpen(item)}
              >
                <div className='flex items-start justify-between gap-2'>
                  <div>
                    <p className='font-medium'>{item.employeeName}</p>
                    <p className='text-xs text-muted-foreground'>
                      {item.employeeNumber} · {item.site}
                    </p>
                  </div>
                  <ApprovalBadge value={item.approvalStatus} />
                </div>
                <p className='text-sm'>
                  {correctionTypeLabel(item.correctionType)} ·{' '}
                  {dateLabel(item.businessDate)}
                </p>
                <p className='line-clamp-2 text-xs text-muted-foreground'>
                  {item.reason}
                </p>
              </button>
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

function ReviewDialog({
  correction,
  canApprove,
  open,
  onOpenChange,
}: {
  correction?: AttendanceCorrection
  canApprove: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const review = useReviewAttendanceCorrection()
  const [notes, setNotes] = useState('')
  if (!correction) return null
  const submit = (decision: 'APPROVED' | 'REJECTED') =>
    decision === 'REJECTED' && !notes.trim()
      ? toast.error('Catatan penolakan wajib diisi.')
      : review.mutate(
          {
            uid: correction.uid,
            input: { decision, reviewNotes: notes.trim() || undefined },
          },
          {
            onSuccess: () => {
              toast.success(
                decision === 'APPROVED'
                  ? 'Koreksi disetujui dan diterapkan.'
                  : 'Koreksi ditolak.'
              )
              onOpenChange(false)
            },
            onError: (error) =>
              toast.error(apiError(error, 'Review koreksi gagal diproses.')),
          }
        )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Detail Koreksi Attendance</DialogTitle>
          <DialogDescription>
            {correction.employeeName} · {correction.employeeNumber} ·{' '}
            {dateLabel(correction.businessDate)}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-3 text-sm sm:grid-cols-2'>
          <Detail
            label='Jenis'
            value={correctionTypeLabel(correction.correctionType)}
          />
          <Detail
            label='Status'
            value={<ApprovalBadge value={correction.approvalStatus} />}
          />
          <Detail
            label='Jam masuk lama'
            value={dateTimeLabel(correction.oldClockInAt)}
          />
          <Detail
            label='Jam masuk baru'
            value={dateTimeLabel(correction.newClockInAt)}
          />
          <Detail
            label='Jam pulang lama'
            value={dateTimeLabel(correction.oldClockOutAt)}
          />
          <Detail
            label='Jam pulang baru'
            value={dateTimeLabel(correction.newClockOutAt)}
          />
          <Detail label='Status lama' value={correction.oldStatus ?? '-'} />
          <Detail label='Status baru' value={correction.newStatus ?? '-'} />
        </div>
        <div className='rounded-lg border p-3 text-sm'>
          <p className='text-xs text-muted-foreground'>Alasan pengajuan</p>
          <p className='mt-1 whitespace-pre-wrap'>{correction.reason}</p>
          <p className='mt-2 text-xs text-muted-foreground'>
            Diajukan {correction.requestedByName} ·{' '}
            {dateTimeLabel(correction.requestedAt)}
          </p>
        </div>
        {correction.reviewedAt && (
          <div className='rounded-lg bg-muted p-3 text-sm'>
            <p className='font-medium'>
              Review {correction.reviewedByName ?? '-'}
            </p>
            <p className='text-xs text-muted-foreground'>
              {dateTimeLabel(correction.reviewedAt)}
              {correction.appliedAt
                ? ` · Diterapkan ${dateTimeLabel(correction.appliedAt)}`
                : ''}
            </p>
            {correction.reviewNotes && (
              <p className='mt-2'>{correction.reviewNotes}</p>
            )}
          </div>
        )}
        {canApprove && correction.approvalStatus === 'PENDING' && (
          <div className='grid gap-2'>
            <label htmlFor='review-notes' className='text-sm font-medium'>
              Catatan review (opsional)
            </label>
            <Textarea
              id='review-notes'
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder='Catatan approval atau alasan penolakan.'
            />
            <p className='text-xs text-muted-foreground'>
              Menyetujui koreksi akan langsung menerapkannya ke attendance.
              Pengaju boleh menjadi reviewer bila memiliki izin approval.
            </p>
            <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
              <Button
                variant='destructive'
                onClick={() => submit('REJECTED')}
                disabled={review.isPending}
              >
                <X /> Tolak
              </Button>
              <Button
                onClick={() => submit('APPROVED')}
                disabled={review.isPending}
              >
                <Check /> Setujui & terapkan
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ApprovalBadge({
  value,
}: {
  value: AttendanceCorrection['approvalStatus']
}) {
  const copy = {
    PENDING: 'Menunggu',
    APPROVED: 'Disetujui',
    REJECTED: 'Ditolak',
    CANCELLED: 'Dibatalkan',
  }[value]
  return (
    <Badge
      variant={
        value === 'APPROVED'
          ? 'default'
          : value === 'REJECTED'
            ? 'destructive'
            : value === 'PENDING'
              ? 'outline'
              : 'secondary'
      }
      className={
        value === 'PENDING'
          ? 'border-warning/60 bg-warning/10 text-warning-foreground'
          : undefined
      }
    >
      {copy}
    </Badge>
  )
}
function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className='rounded-lg bg-muted/50 p-3'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <div className='mt-1 font-medium'>{value}</div>
    </div>
  )
}
const approvalOptions = [
  { value: 'PENDING', label: 'Menunggu' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'REJECTED', label: 'Ditolak' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
]
function correctionTypeLabel(value: string) {
  return (
    {
      CLOCK_IN: 'Jam masuk',
      CLOCK_OUT: 'Jam pulang',
      BOTH: 'Jam masuk & pulang',
      STATUS: 'Status kehadiran',
    }[value] ?? value
  )
}
function StateText({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex min-h-40 items-center justify-center gap-2 text-center text-sm text-muted-foreground'>
      {children}
    </div>
  )
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`)
  )
}
function dateTimeLabel(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '-'
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
