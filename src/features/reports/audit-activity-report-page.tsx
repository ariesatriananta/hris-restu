import { useEffect, useMemo, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  Activity,
  Download,
  Eye,
  FileOutput,
  Fingerprint,
  Gavel,
  Layers3,
  LoaderCircle,
  LogIn,
  RefreshCcw,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import {
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import { useAuditDetail } from '@/features/audit-trail/data'
import {
  useAuditActivityReport,
  useAuditActivityReportMeta,
  useExportAuditActivityReport,
} from './data'
import type {
  AuditActivityAction,
  AuditActivityReportItem,
  AuditActivityReportParams,
} from './domain'
import {
  auditActivityRangeError,
  defaultAuditActivityPeriod,
  downloadBlob,
  numberLabel,
} from './utils'

type Search = {
  dateFrom?: string
  dateTo?: string
  filter?: string
  site?: string[]
  module?: string[]
  action?: AuditActivityAction[]
  actorUid?: string[]
  detailUid?: string
  page?: number
  pageSize?: number
}

export function AuditActivityReportPage({
  search,
  navigate,
}: {
  search: Search
  navigate: NavigateFn
}) {
  const defaults = defaultAuditActivityPeriod()
  const dateFrom = search.dateFrom ?? defaults.dateFrom
  const dateTo = search.dateTo ?? defaults.dateTo
  const rangeError = auditActivityRangeError(dateFrom, dateTo)
  const params: AuditActivityReportParams = {
    dateFrom,
    dateTo,
    query: search.filter,
    site: search.site,
    module: search.module,
    action: search.action,
    actorUid: search.actorUid,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  }
  const result = useAuditActivityReport(params, !rangeError)
  const meta = useAuditActivityReportMeta(
    dateFrom,
    dateTo,
    search.site,
    !rangeError
  )
  const exportReport = useExportAuditActivityReport()
  const showDetail = (uid?: string) =>
    navigate({ search: (previous) => ({ ...previous, detailUid: uid }) })
  const columns = useMemo(
    () => auditColumns(showDetail),
    // navigate dari TanStack Router stabil selama halaman aktif.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'module', searchKey: 'module', type: 'array' },
      { columnId: 'action', searchKey: 'action', type: 'array' },
      { columnId: 'actorUid', searchKey: 'actorUid', type: 'array' },
    ],
  })
  // TanStack Table mengembalikan fungsi stateful; ini pola resmi starter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: result.data?.items ?? [],
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
      Math.ceil((result.data?.total ?? 0) / (result.data?.pageSize ?? 50))
    ),
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.activityUid,
  })

  useEffect(() => {
    if (!search.dateFrom || !search.dateTo) {
      navigate({
        replace: true,
        search: (previous) => ({ ...previous, dateFrom, dateTo }),
      })
    }
  }, [dateFrom, dateTo, navigate, search.dateFrom, search.dateTo])

  useEffect(() => {
    if (result.data) {
      url.ensurePageInRange(
        Math.max(1, Math.ceil(result.data.total / result.data.pageSize))
      )
    }
  }, [result.data, url])

  const exportExcel = () => {
    exportReport.mutate(
      {
        dateFrom,
        dateTo,
        query: params.query,
        site: params.site,
        module: params.module,
        action: params.action,
        actorUid: params.actorUid,
      },
      {
        onSuccess: ({ blob, fileName }) => {
          downloadBlob(blob, fileName)
          toast.success('Laporan aktivitas pengguna berhasil diunduh.')
        },
        onError: () => toast.error('Ekspor laporan aktivitas pengguna gagal.'),
      }
    )
  }
  const summary = result.data?.summary

  return (
    <Main>
      <div className='mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Pusat Laporan</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Laporan Audit Aktivitas Pengguna
          </h1>
          <p className='text-sm text-muted-foreground'>
            Telusuri aktivitas penting pengguna tanpa membuka data rahasia.
          </p>
        </div>
        <div className='flex w-full flex-col gap-3 sm:flex-row sm:items-end xl:w-auto'>
          <DateField
            label='Dari tanggal'
            value={dateFrom}
            onChange={(value) => updateDate(navigate, 'dateFrom', value)}
          />
          <DateField
            label='Sampai tanggal'
            value={dateTo}
            onChange={(value) => updateDate(navigate, 'dateTo', value)}
          />
          {meta.data?.canExport && (
            <Button
              className='w-full sm:w-auto'
              onClick={exportExcel}
              disabled={Boolean(rangeError) || exportReport.isPending}
            >
              {exportReport.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <Download />
              )}
              Ekspor Excel
            </Button>
          )}
        </div>
      </div>

      {rangeError && (
        <Alert variant='destructive' className='mb-4'>
          <ShieldCheck />
          <AlertTitle>Periode belum valid</AlertTitle>
          <AlertDescription>{rangeError}</AlertDescription>
        </Alert>
      )}

      {summary && (
        <div className='mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4 2xl:grid-cols-7'>
          <Kpi
            label='Aktivitas'
            value={summary.totalActivities}
            icon={Activity}
          />
          <Kpi label='Pengguna' value={summary.uniqueActors} icon={Users} />
          <Kpi label='Modul' value={summary.uniqueModules} icon={Layers3} />
          <Kpi
            label='Perubahan data'
            value={summary.dataChanges}
            icon={Fingerprint}
          />
          <Kpi
            label='Keputusan/proses'
            value={summary.decisions}
            icon={Gavel}
          />
          <Kpi label='Ekspor/cetak' value={summary.outputs} icon={FileOutput} />
          <Kpi
            label='Masuk/keluar akun'
            value={summary.accountActivities}
            icon={LogIn}
          />
        </div>
      )}

      <Alert className='mb-4'>
        <ShieldCheck />
        <AlertTitle>Informasi tetap aman</AlertTitle>
        <AlertDescription>
          Excel hanya memuat identitas aktivitas dan keterangannya. Alamat IP,
          informasi perangkat, serta isi perubahan sebelum dan sesudah tidak
          dimasukkan ke file.
        </AlertDescription>
      </Alert>

      <div className='space-y-4'>
        <div className='overflow-x-auto pb-1'>
          <div className='min-w-max sm:min-w-0'>
            <DataTableToolbar
              table={table}
              searchPlaceholder='Cari pengguna, keterangan, sumber, atau referensi...'
              searchDebounceMs={500}
              filters={[
                {
                  columnId: 'site',
                  title: 'Site',
                  options: (meta.data?.sites ?? []).map(option),
                },
                {
                  columnId: 'module',
                  title: 'Modul',
                  options: (meta.data?.modules ?? []).map(option),
                },
                {
                  columnId: 'action',
                  title: 'Aktivitas',
                  options: (meta.data?.actions ?? []).map(option),
                },
                {
                  columnId: 'actorUid',
                  title: 'Pengguna',
                  options: (meta.data?.actors ?? []).map((actor) => ({
                    value: actor.uid,
                    label: `${actor.name} (@${actor.username})`,
                  })),
                },
              ]}
            />
          </div>
        </div>
        {result.isFetching && !result.isPending && <Refreshing />}
        {result.isPending && !rangeError ? (
          <EmptyState text='Memuat aktivitas pengguna...' loading />
        ) : result.isError ? (
          <EmptyState text='Laporan aktivitas pengguna gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EmptyState>
        ) : !rangeError && !result.data?.items.length ? (
          <EmptyState text='Tidak ada aktivitas yang sesuai filter.' />
        ) : !rangeError ? (
          <>
            <div className='hidden overflow-x-auto rounded-md border lg:block'>
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
            <div className='grid gap-3 lg:hidden'>
              {result.data?.items.map((item) => (
                <ActivityCard
                  key={item.activityUid}
                  item={item}
                  onDetail={() => showDetail(item.activityUid)}
                />
              ))}
            </div>
            {result.data && (
              <DataTablePagination
                table={table}
                summary={pageSummary(
                  result.data.page,
                  result.data.pageSize,
                  result.data.total
                )}
              />
            )}
          </>
        ) : null}
      </div>

      <ActivityDetail
        uid={search.detailUid}
        open={Boolean(search.detailUid)}
        onOpenChange={(open) => !open && showDetail(undefined)}
      />
    </Main>
  )
}

function auditColumns(
  onDetail: (uid: string) => void
): ColumnDef<AuditActivityReportItem>[] {
  return [
    {
      accessorKey: 'occurredAt',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Waktu' />
      ),
      cell: ({ row }) => (
        <span className='whitespace-nowrap'>
          {dateTimeLabel(row.original.occurredAt)}
        </span>
      ),
      meta: { label: 'Waktu' },
    },
    {
      accessorKey: 'actorUid',
      accessorFn: (item) => item.actor?.uid ?? '',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Pengguna' />
      ),
      cell: ({ row }) => <Actor item={row.original} />,
      filterFn: arrayFilter,
      meta: { label: 'Pengguna' },
    },
    hiddenFilter('site', (item) => item.site?.code ?? ''),
    {
      accessorKey: 'module',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Modul' />
      ),
      cell: ({ row }) => <span>{moduleLabel(row.original.module)}</span>,
      filterFn: arrayFilter,
      meta: { label: 'Modul' },
    },
    {
      accessorKey: 'action',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Aktivitas' />
      ),
      cell: ({ row }) => (
        <Badge variant='outline'>{actionLabel(row.original.action)}</Badge>
      ),
      filterFn: arrayFilter,
      meta: { label: 'Aktivitas' },
    },
    {
      id: 'description',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Keterangan' />
      ),
      cell: ({ row }) => <Description item={row.original} />,
      meta: { label: 'Keterangan' },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      header: () => <span className='sr-only'>Aksi</span>,
      cell: ({ row }) => (
        <DataTableActionButton
          label='Lihat rincian aktivitas'
          onClick={() => onDetail(row.original.activityUid)}
        >
          <Eye />
        </DataTableActionButton>
      ),
      meta: { label: 'Aksi' },
    },
  ]
}

function Actor({ item }: { item: AuditActivityReportItem }) {
  return item.actor ? (
    <div className='min-w-40'>
      <p className='font-medium'>{item.actor.name}</p>
      <p className='text-xs text-muted-foreground'>
        @{item.actor.username} · {item.site?.name ?? 'Global'}
      </p>
    </div>
  ) : (
    <span className='text-muted-foreground'>
      Sistem · {item.site?.name ?? 'Global'}
    </span>
  )
}
function Description({ item }: { item: AuditActivityReportItem }) {
  return (
    <div className='max-w-xl min-w-56'>
      <p>{item.description ?? actionLabel(item.action)}</p>
      <p className='text-xs text-muted-foreground'>
        {sourceLabel(item.tableName)}
        {item.recordUid ? ` · ${item.recordUid}` : ''}
      </p>
      {item.reason && (
        <p className='text-xs text-muted-foreground'>Alasan: {item.reason}</p>
      )}
    </div>
  )
}
function ActivityCard({
  item,
  onDetail,
}: {
  item: AuditActivityReportItem
  onDetail: () => void
}) {
  return (
    <Card>
      <CardContent className='p-4'>
        <div className='flex items-start justify-between gap-3'>
          <Actor item={item} />
          <Badge variant='outline'>{actionLabel(item.action)}</Badge>
        </div>
        <div className='mt-3'>
          <Description item={item} />
        </div>
        <div className='mt-3 flex items-center justify-between text-xs text-muted-foreground'>
          <span>{moduleLabel(item.module)}</span>
          <span>{dateTimeLabel(item.occurredAt)}</span>
        </div>
        <Button
          variant='outline'
          size='sm'
          className='mt-3 w-full'
          onClick={onDetail}
        >
          <Eye /> Lihat rincian
        </Button>
      </CardContent>
    </Card>
  )
}

function ActivityDetail({
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
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
        <SheetHeader>
          <SheetTitle>Rincian Aktivitas Pengguna</SheetTitle>
          <SheetDescription>
            Informasi lengkap aktivitas yang tercatat pada Audit Trail.
          </SheetDescription>
        </SheetHeader>
        {result.isPending ? (
          <EmptyState text='Memuat rincian aktivitas...' loading />
        ) : result.isError || !detail ? (
          <EmptyState text='Rincian aktivitas gagal dimuat.' />
        ) : (
          <div className='space-y-5 px-4 pb-6'>
            <section className='rounded-lg border p-4'>
              <div className='flex flex-wrap gap-2'>
                <Badge>
                  {actionLabel(detail.action as AuditActivityAction)}
                </Badge>
                <Badge variant='outline'>{moduleLabel(detail.module)}</Badge>
              </div>
              <p className='mt-3 font-medium'>
                {detail.description ??
                  actionLabel(detail.action as AuditActivityAction)}
              </p>
              {detail.reason && (
                <p className='mt-1 text-sm text-muted-foreground'>
                  Alasan: {detail.reason}
                </p>
              )}
            </section>
            <DetailSection title='Informasi aktivitas'>
              <DetailRow
                label='Waktu'
                value={dateTimeLabel(detail.occurredAt)}
              />
              <DetailRow
                label='Pengguna'
                value={
                  detail.actor
                    ? `${detail.actor.name} (@${detail.actor.username})`
                    : 'Sistem'
                }
              />
              <DetailRow label='Site' value={detail.site?.name ?? 'Global'} />
              <DetailRow
                label='Sumber data'
                value={sourceLabel(detail.tableName)}
              />
              <DetailRow label='Referensi' value={detail.recordUid ?? '-'} />
              <DetailRow
                label='ID permintaan'
                value={detail.requestId ?? '-'}
              />
            </DetailSection>
            <Alert>
              <ShieldCheck />
              <AlertTitle>Rincian teknis dilindungi</AlertTitle>
              <AlertDescription>
                Alamat IP, perangkat, dan isi perubahan hanya tersedia pada
                halaman Audit Trail agar laporan tetap ringkas dan aman saat
                dibagikan.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function DetailSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section>
      <h3 className='mb-2 font-semibold'>{title}</h3>
      <div className='divide-y rounded-lg border px-4'>{children}</div>
    </section>
  )
}
function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className='grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3 py-3 text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='text-right font-medium break-words'>{value}</span>
    </div>
  )
}
function hiddenFilter(
  id: string,
  accessor: (item: AuditActivityReportItem) => string
): ColumnDef<AuditActivityReportItem> {
  return {
    id,
    accessorFn: accessor,
    enableHiding: true,
    filterFn: arrayFilter,
    meta: { label: id },
  }
}
function arrayFilter(
  row: { getValue: (id: string) => unknown },
  id: string,
  value: string[]
) {
  return value.includes(String(row.getValue(id)))
}
function DateField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className='w-full sm:w-52'>
      <label className='mb-1.5 block text-sm font-medium'>{label}</label>
      <DatePicker
        selected={dateOnlyFromInput(value)}
        onSelect={(date) => onChange(dateOnlyToInput(date))}
      />
    </div>
  )
}
function updateDate(
  navigate: NavigateFn,
  key: 'dateFrom' | 'dateTo',
  value: string
) {
  navigate({
    search: (previous) => ({
      ...previous,
      [key]: value || undefined,
      page: undefined,
      detailUid: undefined,
    }),
  })
}
function option(item: { code: string; name: string }) {
  return { value: item.code, label: item.name }
}
function actionLabel(value: AuditActivityAction) {
  return {
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
    CLOSE: 'Menutup proses',
    OTHER: 'Aktivitas lain',
  }[value]
}
function moduleLabel(value: string) {
  return (
    (
      {
        SYSTEM: 'Administrasi Sistem',
        AUTH: 'Akun',
        ATTENDANCE: 'Attendance',
        EMPLOYEES: 'Karyawan',
        PRODUCTION: 'Produksi Borongan',
        PAYROLL: 'Payroll',
        DOCUMENTS: 'Dokumen',
        REPORTS: 'Laporan',
      } as Record<string, string>
    )[value.toUpperCase()] ?? friendlyText(value)
  )
}
function sourceLabel(value: string) {
  return friendlyText(value)
}
function friendlyText(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}
function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
}
function Kpi({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: LucideIcon
}) {
  return (
    <section className='min-h-17 rounded-lg border bg-card px-3 py-2.5'>
      <div className='flex items-start justify-between gap-2'>
        <div>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='mt-1 text-xl font-semibold tabular-nums'>
            {numberLabel(value)}
          </p>
        </div>
        <Icon className='size-4 text-muted-foreground' />
      </div>
    </section>
  )
}
function Refreshing() {
  return (
    <p
      role='status'
      className='flex items-center gap-2 text-xs text-muted-foreground'
    >
      <LoaderCircle className='size-3.5 animate-spin' /> Memperbarui laporan...
    </p>
  )
}
function EmptyState({
  text,
  loading,
  children,
}: {
  text: string
  loading?: boolean
  children?: ReactNode
}) {
  return (
    <div className='flex min-h-40 flex-col items-center justify-center gap-3 text-center text-muted-foreground'>
      {loading ? (
        <LoaderCircle className='size-5 animate-spin' />
      ) : (
        <Fingerprint className='size-5' />
      )}
      <p>{text}</p>
      {children}
    </div>
  )
}
function pageSummary(page: number, pageSize: number, total: number) {
  return (
    <>
      Menampilkan {total ? (page - 1) * pageSize + 1 : 0}–
      {Math.min(page * pageSize, total)} dari {numberLabel(total)} aktivitas.
    </>
  )
}
