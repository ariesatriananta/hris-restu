import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import { LoaderCircle, PencilLine, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { useSiteScopeFilter } from '@/hooks/use-site-scope-filter'
import { useTableUrlState, type NavigateFn } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
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
import type { ProductionSite } from './domain'
import {
  useQcMasterList,
  useSaveQcMaster,
  type QcMasterItem,
  type QcMasterKind,
} from './production-qc-master-queries'

const allSites: ProductionSite[] = ['JEPARA', 'SEMARANG', 'KLATEN']
const statusOptions = [
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'INACTIVE', label: 'Nonaktif' },
]

function MasterDialog({
  kind,
  item,
  sites,
  initialSite,
  onClose,
}: {
  kind: QcMasterKind
  item?: QcMasterItem
  sites: ProductionSite[]
  initialSite?: ProductionSite
  onClose: () => void
}) {
  const brand = kind === 'brands'
  const title = brand ? 'Brand' : 'Defect'
  const [name, setName] = useState(item?.name ?? '')
  const [site, setSite] = useState<ProductionSite | ''>(
    item?.site ?? initialSite ?? sites[0] ?? ''
  )
  const [order, setOrder] = useState(String(item?.sortOrder ?? 0))
  const [active, setActive] = useState(item?.isActive ?? true)
  const command = useSaveQcMaster(kind)
  const valid =
    name.trim().length > 0 &&
    name.trim().length <= 150 &&
    /^\d+$/.test(order) &&
    Number(order) <= 2147483647 &&
    (!brand || Boolean(site))
  const save = () => {
    if (!valid || command.isPending) return
    command.mutate(
      {
        uid: item?.uid,
        input: {
          name: name.trim(),
          sortOrder: Number(order),
          isActive: active,
          ...(brand && !item && site ? { site } : {}),
        },
      },
      {
        onSuccess: () => {
          toast.success(`${title} berhasil disimpan.`)
          onClose()
        },
        onError: () =>
          toast.error(
            `${title} gagal disimpan. Pastikan nama belum digunakan${brand ? ' di site ini' : ''}.`
          ),
      }
    )
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !command.isPending) onClose()
      }}
    >
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {item ? 'Ubah' : 'Tambah'} {title}
          </DialogTitle>
          <DialogDescription>
            {brand
              ? 'Brand tersedia untuk setoran Linting di site yang dipilih.'
              : 'Defect berlaku untuk semua site. Urutan mengatur posisi input pada form QC.'}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
          className='space-y-4'
        >
          {brand && (
            <div className='space-y-2'>
              <Label htmlFor='qc-master-site'>Site</Label>
              <Select
                value={site}
                disabled={
                  Boolean(item) || sites.length === 1 || command.isPending
                }
                onValueChange={(value) => setSite(value as ProductionSite)}
              >
                <SelectTrigger id='qc-master-site' className='w-full'>
                  <SelectValue placeholder='Pilih site' />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((value) => (
                    <SelectItem value={value} key={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className='space-y-2'>
            <Label htmlFor='qc-master-name'>Nama {title}</Label>
            <Input
              id='qc-master-name'
              autoFocus
              maxLength={150}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={command.isPending}
            />
          </div>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='qc-master-order'>Urutan tampil</Label>
              <Input
                id='qc-master-order'
                inputMode='numeric'
                value={order}
                onChange={(event) => setOrder(event.target.value)}
                disabled={command.isPending}
              />
              <p className='text-xs text-muted-foreground'>
                Angka kecil ditampilkan lebih dahulu.
              </p>
            </div>
            <div className='flex items-center justify-between gap-2 rounded-md border px-3 py-2'>
              <Label htmlFor='qc-master-active'>Aktif</Label>
              <Switch
                id='qc-master-active'
                checked={active}
                onCheckedChange={setActive}
                disabled={command.isPending}
              />
            </div>
          </div>
          <p className='text-xs text-muted-foreground'>
            Menonaktifkan master tidak mengubah data setoran yang sudah
            tersimpan.
          </p>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={onClose}
              disabled={command.isPending}
            >
              Batal
            </Button>
            <Button type='submit' disabled={!valid || command.isPending}>
              {command.isPending && <LoaderCircle className='animate-spin' />}{' '}
              Simpan {title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ProductionQcMasterPanel({
  kind,
  search,
  navigate,
  canManage,
}: {
  kind: QcMasterKind
  search: Record<string, unknown>
  navigate: NavigateFn
  canManage: boolean
}) {
  const brand = kind === 'brands'
  const session = useAuthStore((state) => state.session)
  const globalAccess = session?.user.roles.some(
    (role) => role === 'SUPER_ADMIN' || role === 'DIRECTOR'
  )
  const sites = globalAccess
    ? allSites
    : allSites.filter((site) => session?.user.siteAccess.includes(site))
  const requestedSites = Array.isArray(search.site)
    ? (search.site as ProductionSite[])
    : []
  const { effectiveSites, lockedSite } = useSiteScopeFilter(requestedSites)
  const selectedSite =
    lockedSite ??
    (sites.includes(search.qcSite as ProductionSite)
      ? (search.qcSite as ProductionSite)
      : effectiveSites?.length === 1
        ? effectiveSites[0]
        : undefined)
  const state = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'qcFilter' },
    pagination: { pageKey: 'qcPage', pageSizeKey: 'qcPageSize' },
    columnFilters: [
      { columnId: 'isActive', searchKey: 'qcStatus', type: 'array' },
    ],
  })
  const status = state.columnFilters.find((filter) => filter.id === 'isActive')
    ?.value as string[] | undefined
  const query = useQcMasterList(kind, {
    query: state.globalFilter ?? '',
    page: state.pagination.pageIndex + 1,
    pageSize: state.pagination.pageSize,
    ...(brand && selectedSite ? { site: selectedSite } : {}),
    ...(status?.length === 1 ? { isActive: status[0] === 'ACTIVE' } : {}),
  })
  const [dialog, setDialog] = useState<{ item?: QcMasterItem } | null>(null)
  const columns = useMemo<ColumnDef<QcMasterItem>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={brand ? 'Brand' : 'Defect'}
          />
        ),
        cell: ({ row }) => (
          <div className='min-w-0 font-medium break-words'>
            {row.original.name}
          </div>
        ),
      },
      ...(brand ? [{ accessorKey: 'site', header: 'Site' }] : []),
      {
        accessorKey: 'sortOrder',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Urutan' />
        ),
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
            {row.original.isActive ? 'Aktif' : 'Nonaktif'}
          </Badge>
        ),
      },
      ...(canManage
        ? [
            {
              id: 'actions',
              header: () => <div className='text-right'>Aksi</div>,
              enableHiding: false,
              cell: ({ row }: { row: { original: QcMasterItem } }) => (
                <div className='text-right'>
                  <DataTableActionButton
                    label={`Ubah ${brand ? 'brand' : 'defect'} ${row.original.name}`}
                    onClick={() => setDialog({ item: row.original })}
                  >
                    <PencilLine className='size-4' />
                  </DataTableActionButton>
                </div>
              ),
            },
          ]
        : []),
    ],
    [brand, canManage]
  )
  const table = useReactTable({
    data: query.data?.items ?? [],
    columns,
    state: {
      pagination: state.pagination,
      globalFilter: state.globalFilter,
      columnFilters: state.columnFilters,
    },
    onPaginationChange: state.onPaginationChange,
    onGlobalFilterChange: state.onGlobalFilterChange,
    onColumnFiltersChange: state.onColumnFiltersChange,
    manualPagination: true,
    manualFiltering: true,
    rowCount: query.data?.total ?? 0,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='font-semibold'>
            {brand ? 'Brand per Site' : 'Defect Global'}
          </h2>
          <p className='text-sm text-muted-foreground'>
            {brand
              ? 'Pilihan brand untuk setoran Linting. Setiap site memiliki daftar sendiri.'
              : 'Jenis defect dan urutannya dipakai bersama di semua site. Hanya informasi QC, tidak mengurangi hasil atau upah.'}
          </p>
        </div>
        {canManage && (
          <Button
            size='sm'
            onClick={() => setDialog({})}
            disabled={brand && sites.length === 0}
          >
            <Plus /> Tambah {brand ? 'Brand' : 'Defect'}
          </Button>
        )}
      </div>
      <DataTableToolbar
        table={table}
        searchPlaceholder={`Cari ${brand ? 'brand' : 'defect'}...`}
        searchDebounceMs={300}
        searchInputClassName='w-full sm:w-64'
        filters={[
          { columnId: 'isActive', title: 'Status', options: statusOptions },
        ]}
        additionalFilters={
          brand && (
            <Select
              value={selectedSite ?? 'ALL'}
              disabled={Boolean(lockedSite)}
              onValueChange={(value) =>
                navigate({
                  search: (prev) => ({
                    ...prev,
                    qcSite: value === 'ALL' ? undefined : value,
                    qcPage: 1,
                  }),
                })
              }
            >
              <SelectTrigger
                className='h-8 w-full sm:w-40'
                aria-label='Filter site brand'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>Semua site</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site} value={site}>
                    {site}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
        hasAdditionalFilters={brand && Boolean(search.qcSite) && !lockedSite}
        onResetAdditionalFilters={() =>
          navigate({
            search: (prev) => ({ ...prev, qcSite: undefined, qcPage: 1 }),
          })
        }
      />
      {query.isError ? (
        <div role='alert' className='rounded-md border p-4 text-sm'>
          Data gagal dimuat.{' '}
          <Button variant='link' onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : (
        <div className='overflow-hidden rounded-md border'>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((group) => (
                <TableRow key={group.id}>
                  {group.headers.map((header) => (
                    <TableHead key={header.id}>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {query.isPending ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className='h-24 text-center'
                  >
                    Memuat data...
                  </TableCell>
                </TableRow>
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
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
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className='h-24 text-center text-muted-foreground'
                  >
                    Belum ada {brand ? 'brand' : 'defect'} sesuai filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <DataTablePagination
        table={table}
        summary={`${query.data?.total ?? 0} ${brand ? 'brand' : 'defect'}${query.isFetching ? ' · memperbarui...' : ''}`}
      />
      {dialog && (
        <MasterDialog
          kind={kind}
          item={dialog.item}
          sites={sites}
          initialSite={selectedSite}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
