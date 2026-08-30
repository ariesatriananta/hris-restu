import { useEffect, useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { Eye, Fingerprint, LoaderCircle, RefreshCcw } from 'lucide-react'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  DataTableActionButton,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { Main } from '@/components/layout/main'
import { useAuditDetail, useAuditEntries, useAuditMeta } from './data'
import type { AuditEntry, AuditListResult } from './domain'

type Search = {
  filter?: string
  module?: string[]
  action?: string[]
  site?: string[]
  userUid?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}

export function AuditTrailPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const meta = useAuditMeta()
  const result = useAuditEntries({
    search: search.filter,
    module: search.module,
    action: search.action,
    site: search.site,
    userUid: search.userUid,
    dateFrom: search.dateFrom,
    dateTo: search.dateTo,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  })
  const [detailUid, setDetailUid] = useState<string>()
  const columns = useMemo<ColumnDef<AuditEntry>[]>(
    () => [
      {
        accessorKey: 'occurredAt',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Waktu' />
        ),
        cell: ({ row }) => formatDateTime(row.original.occurredAt),
        meta: { label: 'Waktu' },
      },
      {
        accessorKey: 'description',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Aktivitas' />
        ),
        cell: ({ row }) => (
          <div className='max-w-xl'>
            <p className='font-medium'>
              {row.original.description || actionLabel(row.original.action)}
            </p>
            {row.original.reason && (
              <p className='text-xs text-muted-foreground'>
                {row.original.reason}
              </p>
            )}
          </div>
        ),
        meta: { label: 'Aktivitas' },
      },
      {
        accessorKey: 'module',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Modul' />
        ),
        cell: ({ row }) => moduleLabel(row.original.module),
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
        meta: { label: 'Modul' },
      },
      {
        accessorKey: 'action',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Aksi' />
        ),
        cell: ({ row }) => (
          <Badge variant='outline'>{actionLabel(row.original.action)}</Badge>
        ),
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
        meta: { label: 'Aksi' },
      },
      {
        id: 'actor',
        enableSorting: false,
        accessorFn: (row) => row.actor?.name ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Pelaku' />
        ),
        cell: ({ row }) => (
          <div>
            <p>{row.original.actor?.name || 'Sistem'}</p>
            {row.original.actor?.username && (
              <p className='text-xs text-muted-foreground'>
                @{row.original.actor.username}
              </p>
            )}
          </div>
        ),
        meta: { label: 'Pelaku' },
      },
      {
        id: 'site',
        enableSorting: false,
        accessorFn: (row) => row.site?.code ?? '',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Site' />
        ),
        cell: ({ row }) => row.original.site?.name || 'Global',
        meta: { label: 'Site' },
      },
      {
        id: 'actions',
        enableHiding: false,
        cell: ({ row }) => (
          <div className='flex justify-end'>
            <DataTableActionButton
              label='Lihat rincian aktivitas'
              onClick={() => setDetailUid(row.original.uid)}
            >
              <Eye />
            </DataTableActionButton>
          </div>
        ),
      },
    ],
    []
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'module', searchKey: 'module', type: 'array' },
      { columnId: 'action', searchKey: 'action', type: 'array' },
      { columnId: 'site', searchKey: 'site', type: 'array' },
    ],
  })
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: result.data?.data ?? [],
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
      Math.ceil(
        (result.data?.meta.total ?? 0) / (result.data?.meta.pageSize ?? 50)
      )
    ),
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
  })
  const additionalFiltered = Boolean(
    search.userUid || search.dateFrom || search.dateTo
  )
  useEffect(() => {
    if (result.data) {
      url.ensurePageInRange(
        Math.max(
          1,
          Math.ceil(result.data.meta.total / result.data.meta.pageSize)
        )
      )
    }
  }, [result.data, url])
  return (
    <Main>
      <div className='mb-6'>
        <p className='text-sm font-medium text-primary'>Administrasi Sistem</p>
        <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
          Audit Trail
        </h1>
        <p className='text-muted-foreground'>
          Telusuri aktivitas penting dan perubahan data dalam sistem.
        </p>
      </div>
      <div className='space-y-4'>
        <DataTableToolbar
          table={table}
          searchPlaceholder='Cari aktivitas, pelaku, atau referensi...'
          searchDebounceMs={500}
          filters={[
            {
              columnId: 'module',
              title: 'Modul',
              options: (meta.data?.modules ?? []).map((value) => ({
                value,
                label: moduleLabel(value),
              })),
            },
            {
              columnId: 'action',
              title: 'Aksi',
              options: (meta.data?.actions ?? []).map((value) => ({
                value,
                label: actionLabel(value),
              })),
            },
            {
              columnId: 'site',
              title: 'Site',
              options: (meta.data?.sites ?? []).map((site) => ({
                value: site.code ?? site.uid,
                label: site.name,
              })),
            },
          ]}
          additionalFilters={
            <>
              <Select
                value={search.userUid ?? 'ALL'}
                onValueChange={(value) =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      userUid: value === 'ALL' ? undefined : value,
                      page: undefined,
                    }),
                  })
                }
              >
                <SelectTrigger className='h-8 w-40'>
                  <SelectValue placeholder='Pelaku' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>Semua pelaku</SelectItem>
                  {meta.data?.users.map((user) => (
                    <SelectItem key={user.uid} value={user.uid}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className='flex h-8 items-center gap-2 rounded-md border px-2 text-xs font-medium'>
                Dari
                <Input
                  aria-label='Tanggal awal'
                  type='date'
                  className='h-7 w-31 border-0 p-0 shadow-none'
                  value={search.dateFrom ?? ''}
                  max={search.dateTo}
                  onChange={(e) =>
                    navigate({
                      search: (prev) => ({
                        ...prev,
                        dateFrom: e.target.value || undefined,
                        page: undefined,
                      }),
                    })
                  }
                />
              </label>
              <label className='flex h-8 items-center gap-2 rounded-md border px-2 text-xs font-medium'>
                Sampai
                <Input
                  aria-label='Tanggal akhir'
                  type='date'
                  className='h-7 w-31 border-0 p-0 shadow-none'
                  value={search.dateTo ?? ''}
                  min={search.dateFrom}
                  onChange={(e) =>
                    navigate({
                      search: (prev) => ({
                        ...prev,
                        dateTo: e.target.value || undefined,
                        page: undefined,
                      }),
                    })
                  }
                />
              </label>
            </>
          }
          hasAdditionalFilters={additionalFiltered}
          onResetAdditionalFilters={() =>
            navigate({
              search: (prev) => ({
                ...prev,
                userUid: undefined,
                dateFrom: undefined,
                dateTo: undefined,
                page: undefined,
              }),
            })
          }
        />
        {result.isPending ? (
          <State text='Memuat Audit Trail...' />
        ) : result.isError ? (
          <div className='py-12 text-center'>
            <p>Audit Trail gagal dimuat.</p>
            <Button
              variant='outline'
              className='mt-3'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </div>
        ) : !result.data?.data.length ? (
          <State text='Belum ada aktivitas yang sesuai filter.' icon />
        ) : (
          <>
            {result.isFetching && (
              <p className='flex gap-2 text-xs text-muted-foreground'>
                <LoaderCircle className='size-3 animate-spin' /> Memperbarui
                data...
              </p>
            )}
            <div className='hidden overflow-x-auto rounded-md border md:block'>
              <AuditTable table={table} />
            </div>
            <div className='grid gap-3 md:hidden'>
              {result.data.data.map((entry) => (
                <button
                  key={entry.uid}
                  className='rounded-md border p-4 text-left'
                  onClick={() => setDetailUid(entry.uid)}
                >
                  <div className='flex justify-between gap-2'>
                    <Badge variant='outline'>{actionLabel(entry.action)}</Badge>
                    <time className='text-xs text-muted-foreground'>
                      {formatDateTime(entry.occurredAt)}
                    </time>
                  </div>
                  <p className='mt-3 font-medium'>
                    {entry.description || actionLabel(entry.action)}
                  </p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {moduleLabel(entry.module)} ·{' '}
                    {entry.actor?.name || 'Sistem'} ·{' '}
                    {entry.site?.name || 'Global'}
                  </p>
                </button>
              ))}
            </div>
            <DataTablePagination table={table} summary={summary(result.data)} />
          </>
        )}
      </div>
      <AuditDetailSheet
        uid={detailUid}
        open={Boolean(detailUid)}
        onOpenChange={(open) => !open && setDetailUid(undefined)}
      />
    </Main>
  )
}

function AuditTable({
  table,
}: {
  table: ReturnType<typeof useReactTable<AuditEntry>>
}) {
  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((g) => (
          <TableRow key={g.id}>
            {g.headers.map((h) => (
              <TableHead key={h.id}>
                {h.isPlaceholder
                  ? null
                  : flexRender(h.column.columnDef.header, h.getContext())}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((r) => (
          <TableRow key={r.id}>
            {r.getVisibleCells().map((c) => (
              <TableCell key={c.id}>
                {flexRender(c.column.columnDef.cell, c.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
function State({ text, icon }: { text: string; icon?: boolean }) {
  return (
    <p role='status' className='py-12 text-center text-muted-foreground'>
      {icon && <Fingerprint className='mx-auto mb-2' />}
      {text}
    </p>
  )
}

function AuditDetailSheet({
  uid,
  open,
  onOpenChange,
}: {
  uid?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const result = useAuditDetail(uid)
  const detail = result.data
  const changes = useMemo(
    () => (detail ? friendlyChanges(detail.beforeData, detail.afterData) : []),
    [detail]
  )
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
        <SheetHeader className='border-b'>
          <SheetTitle>Rincian Aktivitas</SheetTitle>
          <SheetDescription>
            Informasi aktivitas dan perubahan yang tercatat.
          </SheetDescription>
        </SheetHeader>
        {result.isPending ? (
          <State text='Memuat rincian...' />
        ) : result.isError || !detail ? (
          <p className='p-5 text-destructive'>
            Rincian aktivitas gagal dimuat.
          </p>
        ) : (
          <div className='space-y-6 p-5'>
            <div>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge>{actionLabel(detail.action)}</Badge>
                <Badge variant='outline'>{moduleLabel(detail.module)}</Badge>
              </div>
              <h3 className='mt-3 font-semibold'>
                {detail.description || actionLabel(detail.action)}
              </h3>
              {detail.reason && (
                <p className='mt-1 text-sm text-muted-foreground'>
                  Alasan: {detail.reason}
                </p>
              )}
            </div>
            <section className='space-y-2'>
              <h4 className='font-medium'>Informasi aktivitas</h4>
              <dl className='grid gap-2 rounded-md border p-4 text-sm'>
                <Line label='Waktu' value={formatDateTime(detail.occurredAt)} />
                <Line
                  label='Pelaku'
                  value={
                    detail.actor
                      ? `${detail.actor.name} (@${detail.actor.username})`
                      : 'Sistem'
                  }
                />
                <Line label='Site' value={detail.site?.name || 'Global'} />
                <Line label='Referensi' value={detail.recordUid || '-'} />
              </dl>
            </section>
            <section className='space-y-2'>
              <h4 className='font-medium'>Perubahan data</h4>
              {changes.length ? (
                <div className='divide-y rounded-md border'>
                  {changes.map((change) => (
                    <div
                      key={change.key}
                      className='grid gap-1 p-3 text-sm sm:grid-cols-[130px_1fr]'
                    >
                      <p className='font-medium'>{change.label}</p>
                      <p className='text-muted-foreground'>
                        {change.before} <span aria-hidden='true'>→</span>{' '}
                        <span className='font-medium text-foreground'>
                          {change.after}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className='rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
                  Aktivitas ini tidak mengubah nilai data, atau rinciannya tidak
                  disimpan.
                </p>
              )}
            </section>
            <section className='space-y-2'>
              <h4 className='font-medium'>Informasi teknis</h4>
              <dl className='grid gap-2 rounded-md border p-4 text-sm'>
                <Line label='Request' value={detail.requestId || '-'} />
                <Line label='Alamat IP' value={detail.ipAddress || '-'} />
                <Line
                  label='Perangkat'
                  value={friendlyAgent(detail.userAgent)}
                />
              </dl>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex justify-between gap-4'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='text-right font-medium break-all'>{value}</dd>
    </div>
  )
}
function friendlyChanges(before: unknown, after: unknown) {
  const oldData = record(before),
    newData = record(after)
  return [
    ...new Set([...Object.keys(oldData), ...Object.keys(newData)]),
  ].flatMap((key) => {
    const oldValue = displayValue(oldData[key]),
      newValue = displayValue(newData[key])
    return oldValue === newValue
      ? []
      : [{ key, label: fieldLabel(key), before: oldValue, after: newValue }]
  })
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function displayValue(value: unknown): string {
  if (value == null || value === '') return 'Kosong'
  if (value === '[DISEMBUNYIKAN]') return 'Informasi rahasia'
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak'
  if (Array.isArray(value))
    return value.length ? value.map(displayValue).join(', ') : 'Kosong'
  if (typeof value === 'object')
    return Object.entries(record(value))
      .map(([key, child]) => `${fieldLabel(key)}: ${displayValue(child)}`)
      .join('; ')
  return String(value)
}
function fieldLabel(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase())
}
function friendlyAgent(value: string | null) {
  if (!value) return '-'
  if (/mobile|android|iphone/i.test(value)) return 'Perangkat seluler'
  if (/windows/i.test(value)) return 'Komputer Windows'
  if (/macintosh|mac os/i.test(value)) return 'Komputer Mac'
  return 'Peramban web'
}
function moduleLabel(value: string) {
  const labels: Record<string, string> = {
    SYSTEM: 'Administrasi Sistem',
    AUTH: 'Akun',
    ATTENDANCE: 'Attendance',
    EMPLOYEES: 'Karyawan',
    PRODUCTION: 'Produksi Borongan',
    PAYROLL: 'Payroll',
    DOCUMENTS: 'Dokumen',
    REPORTS: 'Laporan',
  }
  return labels[value.toUpperCase()] ?? fieldLabel(value.toLowerCase())
}
function actionLabel(value: string) {
  const labels: Record<string, string> = {
    CREATE: 'Membuat',
    UPDATE: 'Mengubah',
    DELETE: 'Menghapus',
    VOID: 'Membatalkan',
    APPROVE: 'Menyetujui',
    REJECT: 'Menolak',
    LOGIN: 'Masuk',
    LOGOUT: 'Keluar',
    EXPORT: 'Ekspor',
    PRINT: 'Mencetak',
    CLOSE: 'Menutup periode/proses',
    OTHER: 'Aktivitas lain',
  }
  return labels[value] ?? fieldLabel(value.toLowerCase())
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value))
}
function summary(result: AuditListResult) {
  const start = (result.meta.page - 1) * result.meta.pageSize + 1
  const end = Math.min(
    result.meta.page * result.meta.pageSize,
    result.meta.total
  )
  return `Menampilkan ${start}–${end} dari ${result.meta.total} aktivitas.`
}
