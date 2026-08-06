import { useCallback, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import {
  ClipboardCopy,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCw,
  Smartphone,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DataTableActionButton,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { Main } from '@/components/layout/main'
import {
  useAttendanceDevices,
  useAttendanceFoundation,
  useDeleteAttendanceDevice,
  useRegenerateDeviceActivation,
  useSaveAttendanceDevice,
} from './data/queries'
import type {
  AttendanceDevice,
  AttendanceDeviceActivation,
  AttendanceDeviceInput,
  AttendanceDeviceType,
  AttendanceSiteCode,
} from './domain'

export function DevicePage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const foundation = useAttendanceFoundation()
  const result = useAttendanceDevices({
    query: stringValue(search.filter),
    site: arrayValue(search.site),
    deviceType: arrayValue(search.deviceType),
    isActive: arrayValue(search.isActive),
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AttendanceDevice>()
  const [deleteTarget, setDeleteTarget] = useState<AttendanceDevice>()
  const [regenerateTarget, setRegenerateTarget] = useState<AttendanceDevice>()
  const [activation, setActivation] = useState<AttendanceDeviceActivation>()
  const remove = useDeleteAttendanceDevice()
  const regenerate = useRegenerateDeviceActivation()
  const siteOptions =
    foundation.data?.sites.map((site) => ({
      value: site.code,
      label: site.name,
    })) ?? []
  const deviceTypeOptions = useMemo(
    () => foundation.data?.lookups.deviceTypes ?? [],
    [foundation.data?.lookups.deviceTypes]
  )
  const edit = useCallback((device: AttendanceDevice) => {
    setEditing(device)
    setDialogOpen(true)
  }, [])
  const requestDelete = useCallback(
    (device: AttendanceDevice) => setDeleteTarget(device),
    []
  )
  const requestRegenerate = useCallback(
    (device: AttendanceDevice) => setRegenerateTarget(device),
    []
  )
  const columns = useMemo<ColumnDef<AttendanceDevice>[]>(
    () => [
      {
        accessorKey: 'code',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Perangkat' />
        ),
        cell: ({ row }) => (
          <div>
            <p className='font-medium'>{row.original.name}</p>
            <p className='text-[11px] text-muted-foreground'>
              {row.original.code} ·{' '}
              {row.original.locationDescription || 'Tanpa keterangan lokasi'}
            </p>
          </div>
        ),
        meta: { label: 'Perangkat' },
      },
      {
        accessorKey: 'site',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Site' />
        ),
        cell: ({ row }) => row.original.siteName,
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
        meta: { label: 'Site' },
      },
      {
        accessorKey: 'deviceType',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Tipe' />
        ),
        cell: ({ row }) =>
          deviceTypeLabel(row.original.deviceType, deviceTypeOptions),
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
        meta: { label: 'Tipe' },
      },
      {
        id: 'activation',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Aktivasi' />
        ),
        cell: ({ row }) => <ActivationStatus device={row.original} />,
        meta: { label: 'Aktivasi' },
      },
      {
        accessorKey: 'lastSeenAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Terakhir aktif' />
        ),
        cell: ({ row }) =>
          row.original.lastSeenAt
            ? formatDateTime(row.original.lastSeenAt)
            : 'Belum pernah',
        meta: { label: 'Terakhir aktif' },
      },
      {
        accessorKey: 'scanCount',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Scan' />
        ),
        cell: ({ row }) => `${row.original.scanCount} scan`,
        meta: { label: 'Scan' },
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
              label={`Ubah perangkat ${row.original.name}`}
              onClick={() => edit(row.original)}
            >
              <Pencil />
            </DataTableActionButton>
            <DataTableActionButton
              label={`${row.original.isActivated ? 'Buat ulang' : 'Buat'} kode aktivasi ${row.original.name}`}
              onClick={() => requestRegenerate(row.original)}
            >
              <RotateCw />
            </DataTableActionButton>
            {row.original.scanCount === 0 && (
              <DataTableActionButton
                className='text-destructive hover:text-destructive'
                label={`Hapus perangkat ${row.original.name}`}
                onClick={() => requestDelete(row.original)}
              >
                <Trash2 />
              </DataTableActionButton>
            )}
          </div>
        ),
      },
    ],
    [deviceTypeOptions, edit, requestDelete, requestRegenerate]
  )
  const [sorting, setSorting] = useState<SortingState>([])
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'deviceType', searchKey: 'deviceType', type: 'array' },
      { columnId: 'isActive', searchKey: 'isActive', type: 'array' },
    ],
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
    },
    pageCount: Math.max(
      1,
      Math.ceil((result.data?.total ?? 0) / (result.data?.pageSize ?? 50))
    ),
    manualFiltering: true,
    manualPagination: true,
    onSortingChange: setSorting,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  return (
    <Main>
      <div className='mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end'>
        <div>
          <p className='text-sm font-medium text-primary'>Attendance</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Master Perangkat
          </h1>
          <p className='text-muted-foreground'>
            Kelola terminal scan dan aktivasi perangkat per site.
          </p>
        </div>
        <Button
          disabled={!siteOptions.length}
          onClick={() => {
            setEditing(undefined)
            setDialogOpen(true)
          }}
        >
          <Plus /> Tambah Perangkat
        </Button>
      </div>
      <div className='space-y-4'>
        <DataTableToolbar
          table={table}
          searchPlaceholder='Cari kode atau nama perangkat...'
          searchDebounceMs={500}
          filters={[
            { columnId: 'site', title: 'Site', options: siteOptions },
            {
              columnId: 'deviceType',
              title: 'Tipe',
              options: deviceTypeOptions,
            },
            {
              columnId: 'isActive',
              title: 'Status',
              options: [
                { value: 'true', label: 'Aktif' },
                { value: 'false', label: 'Nonaktif' },
              ],
            },
          ]}
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
            Memuat perangkat...
          </p>
        ) : result.isError ? (
          <div className='py-10 text-center'>
            <p>Data perangkat gagal dimuat.</p>
            <Button
              variant='outline'
              className='mt-3'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </div>
        ) : !result.data?.items.length ? (
          <div className='py-10 text-center text-muted-foreground'>
            <Smartphone className='mx-auto mb-2' />
            Tidak ada perangkat yang sesuai filter.
          </div>
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
              {result.data.items.map((device) => (
                <DeviceCard
                  key={device.uid}
                  device={device}
                  onEdit={edit}
                  onRegenerate={requestRegenerate}
                  onDelete={requestDelete}
                />
              ))}
            </div>
            <DataTablePagination
              table={table}
              summary={`Menampilkan ${(result.data.page - 1) * result.data.pageSize + 1}–${Math.min(result.data.page * result.data.pageSize, result.data.total)} dari ${result.data.total} data.`}
            />
          </>
        )}
      </div>
      {dialogOpen && (
        <DeviceDialog
          value={editing}
          siteOptions={
            siteOptions as { value: AttendanceSiteCode; label: string }[]
          }
          deviceTypeOptions={deviceTypeOptions}
          onClose={() => setDialogOpen(false)}
          onActivation={setActivation}
        />
      )}
      {activation && (
        <ActivationCodeDialog
          activation={activation}
          onClose={() => setActivation(undefined)}
        />
      )}
      <ConfirmDialog
        open={Boolean(regenerateTarget)}
        onOpenChange={(open) => !open && setRegenerateTarget(undefined)}
        title='Buat ulang kode aktivasi?'
        desc={`Token lama perangkat ${regenerateTarget?.name ?? ''} akan langsung tidak berlaku. Terminal harus diaktivasi ulang dengan kode baru.`}
        confirmText='Buat ulang kode'
        isLoading={regenerate.isPending}
        handleConfirm={() => {
          if (!regenerateTarget) return
          regenerate.mutate(regenerateTarget.uid, {
            onSuccess: (data) => {
              setRegenerateTarget(undefined)
              setActivation(data)
            },
            onError: (error) => {
              setRegenerateTarget(undefined)
              toast.error(apiMessage(error, 'Kode aktivasi gagal dibuat.'))
            },
          })
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
        title='Hapus perangkat?'
        desc={`Perangkat ${deleteTarget?.name ?? ''} akan dihapus permanen. Server akan menolak jika perangkat pernah digunakan untuk scan.`}
        confirmText='Hapus perangkat'
        destructive
        isLoading={remove.isPending}
        handleConfirm={() => {
          if (!deleteTarget) return
          remove.mutate(deleteTarget.uid, {
            onSuccess: () => {
              toast.success('Perangkat berhasil dihapus.')
              setDeleteTarget(undefined)
            },
            onError: (error) => {
              toast.error(apiMessage(error, 'Perangkat gagal dihapus.'))
              setDeleteTarget(undefined)
            },
          })
        }}
      />
    </Main>
  )
}

function DeviceDialog({
  value,
  siteOptions,
  deviceTypeOptions,
  onClose,
  onActivation,
}: {
  value?: AttendanceDevice
  siteOptions: { value: AttendanceSiteCode; label: string }[]
  deviceTypeOptions: { value: AttendanceDeviceType; label: string }[]
  onClose: () => void
  onActivation: (value: AttendanceDeviceActivation) => void
}) {
  const [form, setForm] = useState<AttendanceDeviceInput>(() =>
    value
      ? {
          siteCode: value.site,
          code: value.code,
          name: value.name,
          deviceType: value.deviceType,
          locationDescription: value.locationDescription,
          isActive: value.isActive,
        }
      : {
          siteCode: siteOptions[0]?.value ?? 'JEPARA',
          code: '',
          name: '',
          deviceType: 'TERMINAL',
          locationDescription: '',
          isActive: true,
        }
  )
  const save = useSaveAttendanceDevice()
  const valid = form.code.trim() && form.name.trim()
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {value ? 'Ubah Perangkat' : 'Tambah Perangkat'}
          </DialogTitle>
          <DialogDescription>
            {value
              ? 'Site tidak dapat diubah setelah perangkat dibuat.'
              : 'Kode aktivasi akan ditampilkan satu kali setelah data disimpan.'}
          </DialogDescription>
        </DialogHeader>
        <form
          id='device-form'
          className='grid gap-4 sm:grid-cols-2'
          onSubmit={(event) => {
            event.preventDefault()
            if (!valid) return
            save.mutate(
              {
                uid: value?.uid,
                input: {
                  ...form,
                  code: form.code.trim().toUpperCase(),
                  name: form.name.trim(),
                  locationDescription: form.locationDescription?.trim() || null,
                },
              },
              {
                onSuccess: (activation) => {
                  toast.success('Perangkat berhasil disimpan.')
                  onClose()
                  if (activation) onActivation(activation)
                },
                onError: (error) =>
                  toast.error(apiMessage(error, 'Perangkat gagal disimpan.')),
              }
            )
          }}
        >
          <Field label='Site'>
            <Select
              disabled={Boolean(value)}
              value={form.siteCode}
              onValueChange={(siteCode: AttendanceSiteCode) =>
                setForm({ ...form, siteCode })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {siteOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='Tipe perangkat'>
            <Select
              value={form.deviceType}
              onValueChange={(deviceType: AttendanceDeviceType) =>
                setForm({ ...form, deviceType })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {deviceTypeOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='Kode perangkat'>
            <Input
              value={form.code}
              maxLength={50}
              onChange={(event) =>
                setForm({ ...form, code: event.target.value.toUpperCase() })
              }
              required
            />
          </Field>
          <Field label='Nama perangkat'>
            <Input
              value={form.name}
              maxLength={150}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
            />
          </Field>
          <Field label='Keterangan lokasi' className='sm:col-span-2'>
            <Input
              value={form.locationDescription ?? ''}
              maxLength={255}
              placeholder='Contoh: Pos masuk produksi'
              onChange={(event) =>
                setForm({ ...form, locationDescription: event.target.value })
              }
            />
          </Field>
          <div className='flex items-center justify-between rounded-lg border p-3 sm:col-span-2'>
            <div>
              <Label htmlFor='device-active'>Perangkat aktif</Label>
              <p className='text-xs text-muted-foreground'>
                Perangkat nonaktif tidak dapat melakukan scan.
              </p>
            </div>
            <Switch
              id='device-active'
              checked={form.isActive}
              onCheckedChange={(isActive) => setForm({ ...form, isActive })}
            />
          </div>
        </form>
        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={save.isPending}>
            Batal
          </Button>
          <Button
            type='submit'
            form='device-form'
            disabled={!valid || save.isPending}
          >
            {save.isPending && <LoaderCircle className='animate-spin' />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ActivationCodeDialog({
  activation,
  onClose,
}: {
  activation: AttendanceDeviceActivation
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <KeyRound /> Kode Aktivasi Perangkat
          </DialogTitle>
          <DialogDescription>
            Kode ini hanya ditampilkan sekarang dan berlaku sampai{' '}
            {formatDateTime(activation.activationCodeExpiresAt)}.
          </DialogDescription>
        </DialogHeader>
        <div className='rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm'>
          <strong>Simpan sekarang.</strong> Setelah dialog ditutup, kode tidak
          dapat dilihat lagi. Membuat ulang kode akan memutus token terminal
          lama.
        </div>
        <div className='flex items-center gap-2'>
          <code className='min-w-0 flex-1 rounded-lg bg-muted p-4 text-center text-xl font-bold tracking-widest select-all'>
            {activation.activationCode}
          </code>
          <Button
            size='icon'
            variant='outline'
            aria-label='Salin kode aktivasi'
            onClick={async () => {
              try {
                if (!navigator.clipboard)
                  throw new Error('Clipboard API tidak tersedia.')
                await navigator.clipboard.writeText(activation.activationCode)
                setCopied(true)
                toast.success('Kode aktivasi disalin.')
              } catch {
                setCopied(false)
                toast.info(
                  'Salin otomatis tidak tersedia. Salin kode dari dialog browser.'
                )
                window.prompt(
                  'Salin kode aktivasi berikut:',
                  activation.activationCode
                )
              }
            }}
          >
            <ClipboardCopy />
          </Button>
        </div>
        {copied && (
          <p role='status' className='text-sm text-positive'>
            Kode berhasil disalin.
          </p>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Saya sudah menyimpan kode</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeviceCard({
  device,
  onEdit,
  onRegenerate,
  onDelete,
}: {
  device: AttendanceDevice
  onEdit: (value: AttendanceDevice) => void
  onRegenerate: (value: AttendanceDevice) => void
  onDelete: (value: AttendanceDevice) => void
}) {
  return (
    <Card>
      <CardContent className='space-y-3 p-4'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <p className='font-semibold'>{device.name}</p>
            <p className='text-xs text-muted-foreground'>
              {device.code} · {device.siteName}
            </p>
          </div>
          <Badge variant={device.isActive ? 'default' : 'secondary'}>
            {device.isActive ? 'Aktif' : 'Nonaktif'}
          </Badge>
        </div>
        <ActivationStatus device={device} />
        <p className='text-xs text-muted-foreground'>
          {device.lastSeenAt
            ? `Terakhir aktif ${formatDateTime(device.lastSeenAt)}`
            : 'Belum pernah aktif'}{' '}
          · {device.scanCount} scan
        </p>
        <div className='flex flex-wrap gap-2'>
          <Button size='sm' variant='outline' onClick={() => onEdit(device)}>
            <Pencil /> Ubah
          </Button>
          <Button
            size='sm'
            variant='outline'
            onClick={() => onRegenerate(device)}
          >
            <RotateCw /> Aktivasi
          </Button>
          {device.scanCount === 0 && (
            <Button
              size='sm'
              variant='outline'
              className='text-destructive'
              onClick={() => onDelete(device)}
            >
              <Trash2 /> Hapus
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
function ActivationStatus({ device }: { device: AttendanceDevice }) {
  return device.isActivated ? (
    <Badge variant='outline'>Teraktivasi</Badge>
  ) : device.activationPending ? (
    <Badge variant='outline'>Menunggu aktivasi</Badge>
  ) : (
    <Badge variant='secondary'>Belum diaktivasi</Badge>
  )
}
function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}
function deviceTypeLabel(
  value: AttendanceDeviceType,
  options: { value: AttendanceDeviceType; label: string }[]
) {
  return options.find((option) => option.value === value)?.label ?? value
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
}
function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback
}
function arrayValue<T extends string>(value: unknown): T[] | undefined {
  return Array.isArray(value) && value.length ? (value as T[]) : undefined
}
function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data.message ?? fallback)
    : fallback
}
