import { useEffect, useMemo } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import {
  Clock3,
  LoaderCircle,
  RefreshCcw,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { currentListReturnTo } from '@/lib/list-return-to'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DataTablePagination, DataTableToolbar } from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import { useRecruitmentCandidates, useRecruitmentMeta } from './data'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'
import type { RecruitmentSortBy, RecruitmentStatus } from './domain'
import { createRecruitmentColumns } from './recruitment-columns'
import {
  RecruitmentCandidateCard,
  RecruitmentDetailSheet,
} from './recruitment-detail'
import { RecruitmentPublicLinksDialog } from './recruitment-public-links-dialog'
import { buildRecruitmentListParams } from './utils'

export type RecruitmentSearch = {
  filter?: string
  site?: string[]
  status?: RecruitmentStatus[]
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
  sortBy?: RecruitmentSortBy
  sortDirection?: 'asc' | 'desc'
  detailUid?: string
}

export function RecruitmentPage({
  search,
  navigate,
}: {
  search: RecruitmentSearch
  navigate: NavigateFn
}) {
  const params = buildRecruitmentListParams(search)
  const result = useRecruitmentCandidates(params)
  const meta = useRecruitmentMeta()
  const returnTo = currentListReturnTo()
  const showDetail = (uid?: string) =>
    navigate({ search: (previous) => ({ ...previous, detailUid: uid }) })
  const columns = useMemo(
    () => createRecruitmentColumns(showDetail),
    // navigate stabil dari TanStack Router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'status', searchKey: 'status', type: 'array' },
    ],
  })
  const sorting: SortingState = search.sortBy
    ? [{ id: search.sortBy, desc: search.sortDirection !== 'asc' }]
    : []

  // TanStack Table mengembalikan fungsi stateful; ini pola resmi starter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: result.data?.data ?? [],
    columns,
    state: {
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
      sorting,
    },
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    initialState: { columnVisibility: { applicationNumber: false } },
    pageCount: Math.max(
      1,
      Math.ceil(
        (result.data?.meta.total ?? 0) / (result.data?.meta.pageSize ?? 50)
      )
    ),
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      const first = next[0]
      navigate({
        search: (previous) => ({
          ...previous,
          sortBy: first?.id as RecruitmentSortBy | undefined,
          sortDirection: first ? (first.desc ? 'desc' : 'asc') : undefined,
          page: undefined,
        }),
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.uid,
  })

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

  const hasDates = Boolean(search.dateFrom || search.dateTo)
  const summary = result.data?.summary
  return (
    <Main>
      <div className='mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Master Karyawan</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Rekrutmen
          </h1>
          <p className='text-muted-foreground'>
            Periksa data pelamar dan lanjutkan proses rekrutmen per site.
          </p>
        </div>
        <RecruitmentPublicLinksDialog />
      </div>

      <div className='mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3'>
        <SummaryCard label='Baru' value={summary?.new} icon={UserPlus} />
        <SummaryCard
          label='Diproses'
          value={summary?.inProgress}
          icon={Clock3}
        />
        <SummaryCard
          label='Lolos, belum menjadi karyawan'
          value={summary?.passedNotConverted}
          icon={UserCheck}
        />
      </div>

      <div className='space-y-4'>
        <div>
          <DataTableToolbar
            table={table}
            searchPlaceholder='Cari nama, NIK, nomor, atau HP...'
            searchDebounceMs={500}
            className='flex-col sm:flex-row'
            controlsClassName='w-full flex-col sm:flex-row'
            searchInputClassName='w-full sm:w-56 lg:w-64'
            filters={[
              {
                columnId: 'site',
                title: 'Site',
                options: (meta.data?.sites ?? []).map((site) => ({
                  value: site.code,
                  label: site.name,
                })),
              },
              {
                columnId: 'status',
                title: 'Status',
                options: meta.data?.statuses ?? [],
              },
            ]}
            additionalFilters={
              <>
                <div className='flex items-center gap-1.5'>
                  <Label
                    htmlFor='recruitment-date-from'
                    className='text-xs whitespace-nowrap'
                  >
                    Dari
                  </Label>
                  <DatePicker
                    id='recruitment-date-from'
                    selected={dateOnlyFromInput(search.dateFrom)}
                    onSelect={(date) =>
                      navigate({
                        search: (previous) => ({
                          ...previous,
                          dateFrom: dateOnlyToInput(date) || undefined,
                          page: undefined,
                        }),
                      })
                    }
                    placeholder='Tanggal awal'
                    toYear={new Date().getFullYear() + 1}
                    disabledDates={(date) => {
                      const maximum = dateOnlyFromInput(search.dateTo)
                      return maximum ? date > maximum : false
                    }}
                    triggerClassName='h-8 w-40 text-xs'
                  />
                </div>
                <div className='flex items-center gap-1.5'>
                  <Label
                    htmlFor='recruitment-date-to'
                    className='text-xs whitespace-nowrap'
                  >
                    Sampai
                  </Label>
                  <DatePicker
                    id='recruitment-date-to'
                    selected={dateOnlyFromInput(search.dateTo)}
                    onSelect={(date) =>
                      navigate({
                        search: (previous) => ({
                          ...previous,
                          dateTo: dateOnlyToInput(date) || undefined,
                          page: undefined,
                        }),
                      })
                    }
                    placeholder='Tanggal akhir'
                    toYear={new Date().getFullYear() + 1}
                    disabledDates={(date) => {
                      const minimum = dateOnlyFromInput(search.dateFrom)
                      return minimum ? date < minimum : false
                    }}
                    triggerClassName='h-8 w-40 text-xs'
                  />
                </div>
              </>
            }
            hasAdditionalFilters={hasDates}
            onResetAdditionalFilters={() =>
              navigate({
                search: (previous) => ({
                  ...previous,
                  dateFrom: undefined,
                  dateTo: undefined,
                  page: undefined,
                }),
              })
            }
          />
        </div>

        {result.isFetching && !result.isPending && (
          <p
            role='status'
            className='flex items-center gap-2 text-xs text-muted-foreground'
          >
            <LoaderCircle className='size-3 animate-spin' /> Memperbarui data...
          </p>
        )}
        {result.isPending ? (
          <State text='Memuat data pelamar...' loading />
        ) : result.isError ? (
          <State text='Data pelamar gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </State>
        ) : !result.data?.data.length ? (
          <State text='Belum ada pelamar yang sesuai filter.' />
        ) : (
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
              {result.data.data.map((candidate) => (
                <RecruitmentCandidateCard
                  key={candidate.uid}
                  candidate={candidate}
                  onDetail={() => showDetail(candidate.uid)}
                />
              ))}
            </div>
            <DataTablePagination
              table={table}
              summary={pageSummary(result.data.meta)}
            />
          </>
        )}
      </div>

      <RecruitmentDetailSheet
        uid={search.detailUid}
        returnTo={returnTo}
        open={Boolean(search.detailUid)}
        onOpenChange={(open) => !open && showDetail(undefined)}
      />
    </Main>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value?: number
  icon: typeof UserPlus
}) {
  return (
    <div className='flex min-h-17 items-center justify-between rounded-lg border px-3 py-2.5'>
      <div>
        <p className='text-xs text-muted-foreground'>{label}</p>
        <p className='text-xl font-semibold tabular-nums'>{value ?? '—'}</p>
      </div>
      <Icon className='size-5 text-primary' aria-hidden />
    </div>
  )
}

function State({
  text,
  loading,
  children,
}: {
  text: string
  loading?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      role='status'
      className='grid justify-items-center gap-3 py-12 text-center text-muted-foreground'
    >
      {loading && <LoaderCircle className='animate-spin' />}
      <p>{text}</p>
      {children}
    </div>
  )
}

function pageSummary(meta: { page: number; pageSize: number; total: number }) {
  const start = meta.total ? (meta.page - 1) * meta.pageSize + 1 : 0
  const end = Math.min(meta.page * meta.pageSize, meta.total)
  return `Menampilkan ${start}–${end} dari ${meta.total} pelamar.`
}
