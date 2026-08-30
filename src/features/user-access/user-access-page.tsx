import { useCallback, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import {
  Eye,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DataTableActionButton,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { Main } from '@/components/layout/main'
import {
  useAccessMeta,
  useCreateManagedUser,
  useManagedRole,
  useManagedRoles,
  useManagedUser,
  useManagedUsers,
  useResetManagedUserPassword,
  useUpdateManagedRole,
  useUpdateManagedUser,
} from './data/queries'
import type {
  AccessManagementMeta,
  ManagedRole,
  ManagedUser,
  RoleInput,
  UserInput,
  UserStatus,
} from './domain'

type PageSearch = {
  tab?: 'users' | 'roles'
  filter?: string
  site?: string[]
  status?: UserStatus[]
  role?: string[]
  page?: number
  pageSize?: number
}

export function UserAccessPage({
  search,
  navigate,
}: {
  search: PageSearch
  navigate: NavigateFn
}) {
  const tab = search.tab ?? 'users'
  const meta = useAccessMeta()
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <Main>
      <div className='mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end'>
        <div>
          <p className='text-sm font-medium text-primary'>
            Administrasi Sistem
          </p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            User & Hak Akses
          </h1>
          <p className='max-w-2xl text-muted-foreground'>
            Kelola akun pengguna, akses site, dan kewenangan tiap peran.
          </p>
        </div>
        {tab === 'users' && (
          <Button disabled={!meta.data} onClick={() => setCreateOpen(true)}>
            <Plus /> Tambah User
          </Button>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({
            search: (current) => ({
              ...current,
              tab: value === 'users' ? undefined : value,
              filter: undefined,
              status: undefined,
              role: undefined,
              page: undefined,
            }),
          })
        }
      >
        <div className='mb-5 overflow-x-auto pb-1'>
          <TabsList className='h-10 min-w-max justify-start gap-1'>
            <TabsTrigger value='users' className='h-9 px-4'>
              <Users /> Pengguna
            </TabsTrigger>
            <TabsTrigger value='roles' className='h-9 px-4'>
              <ShieldCheck /> Hak Akses
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value='users'>
          <UsersTab search={search} navigate={navigate} meta={meta.data} />
        </TabsContent>
        <TabsContent value='roles'>
          <RolesTab search={search} navigate={navigate} meta={meta.data} />
        </TabsContent>
      </Tabs>

      {meta.data && (
        <UserFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          meta={meta.data}
        />
      )}
    </Main>
  )
}

function UsersTab({
  search,
  navigate,
  meta,
}: {
  search: PageSearch
  navigate: NavigateFn
  meta?: AccessManagementMeta
}) {
  const result = useManagedUsers({
    query: search.filter,
    site: search.site,
    status: search.status,
    role: search.role,
    page: search.page ?? 1,
    pageSize: search.pageSize ?? 50,
  })
  const currentUserUid = useAuthStore((state) => state.session?.user.uid)
  const [selectedUid, setSelectedUid] = useState<string>()
  const [editTarget, setEditTarget] = useState<ManagedUser>()
  const [resetTarget, setResetTarget] = useState<ManagedUser>()
  const openDetail = useCallback((user: ManagedUser) => {
    setSelectedUid(user.uid)
  }, [])
  const openEdit = useCallback((user: ManagedUser) => setEditTarget(user), [])
  const openReset = useCallback((user: ManagedUser) => setResetTarget(user), [])
  const columns = useMemo<ColumnDef<ManagedUser>[]>(
    () => [
      {
        accessorKey: 'fullName',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Pengguna' />
        ),
        cell: ({ row }) => <UserIdentity user={row.original} />,
        meta: { label: 'Pengguna' },
      },
      {
        id: 'role',
        accessorFn: (row) => row.roles.map((role) => role.code).join(','),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Peran' />
        ),
        cell: ({ row }) => (
          <div className='flex flex-wrap gap-1'>
            {row.original.roles.map((role) => (
              <Badge key={role.uid} variant='secondary'>
                {role.name}
              </Badge>
            ))}
          </div>
        ),
        filterFn: (row, _id, value: string[]) =>
          row.original.roles.some((role) => value.includes(role.uid)),
        meta: { label: 'Peran' },
      },
      {
        id: 'site',
        accessorFn: (row) => row.siteAccess.map((site) => site.code).join(','),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Akses Site' />
        ),
        cell: ({ row }) => (
          <span className='text-sm'>
            {row.original.siteAccess.map((site) => site.name).join(', ') || '-'}
          </span>
        ),
        filterFn: (row, _id, value: string[]) =>
          row.original.siteAccess.some((site) => value.includes(site.code)),
        meta: { label: 'Akses Site' },
      },
      {
        accessorKey: 'lastLoginAt',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Login Terakhir' />
        ),
        cell: ({ row }) => formatDateTime(row.original.lastLoginAt),
        meta: { label: 'Login Terakhir' },
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Status' />
        ),
        cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
        filterFn: (row, id, value: string[]) =>
          value.includes(row.getValue(id)),
        meta: { label: 'Status' },
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className='flex justify-end gap-1'>
            <DataTableActionButton
              label={`Lihat detail ${row.original.fullName}`}
              onClick={() => openDetail(row.original)}
            >
              <Eye />
            </DataTableActionButton>
            <DataTableActionButton
              label={`Ubah user ${row.original.fullName}`}
              onClick={() => openEdit(row.original)}
            >
              <Pencil />
            </DataTableActionButton>
            {row.original.uid !== currentUserUid && (
              <DataTableActionButton
                label={`Atur ulang password ${row.original.fullName}`}
                onClick={() => openReset(row.original)}
              >
                <KeyRound />
              </DataTableActionButton>
            )}
          </div>
        ),
      },
    ],
    [currentUserUid, openDetail, openEdit, openReset]
  )
  const [sorting, setSorting] = useState<SortingState>([])
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      { columnId: 'status', searchKey: 'status', type: 'array' },
      { columnId: 'role', searchKey: 'role', type: 'array' },
    ],
  })
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: result.data?.data ?? [],
    columns,
    state: {
      sorting,
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
    },
    pageCount: Math.max(
      1,
      Math.ceil(
        (result.data?.meta.total ?? 0) / (result.data?.meta.pageSize ?? 50)
      )
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
    <div className='space-y-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari nama, username, atau email...'
        searchDebounceMs={500}
        filters={[
          {
            columnId: 'site',
            title: 'Site',
            options:
              meta?.sites.map((site) => ({
                value: site.code,
                label: site.name,
              })) ?? [],
          },
          {
            columnId: 'role',
            title: 'Peran',
            options:
              meta?.roles.map((role) => ({
                value: role.uid,
                label: role.name,
              })) ?? [],
          },
          {
            columnId: 'status',
            title: 'Status',
            options: statusOptions,
          },
        ]}
      />
      <TableState
        pending={result.isPending}
        fetching={result.isFetching}
        error={result.isError}
        empty={!result.data?.data.length}
        label='user'
        onRetry={() => void result.refetch()}
      >
        <div className='hidden overflow-x-auto rounded-md border md:block'>
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
          {result.data?.data.map((user) => (
            <div key={user.uid} className='rounded-md border p-4'>
              <div className='flex items-start justify-between gap-3'>
                <UserIdentity user={user} />
                <UserStatusBadge status={user.status} />
              </div>
              <dl className='mt-4 grid gap-2 text-sm'>
                <DetailLine
                  label='Peran'
                  value={user.roles.map((role) => role.name).join(', ') || '-'}
                />
                <DetailLine
                  label='Akses site'
                  value={
                    user.siteAccess.map((site) => site.name).join(', ') || '-'
                  }
                />
              </dl>
              <div className='mt-3 flex justify-end gap-1 border-t pt-2'>
                <DataTableActionButton
                  label={`Lihat detail ${user.fullName}`}
                  onClick={() => openDetail(user)}
                >
                  <Eye />
                </DataTableActionButton>
                <DataTableActionButton
                  label={`Ubah user ${user.fullName}`}
                  onClick={() => openEdit(user)}
                >
                  <Pencil />
                </DataTableActionButton>
                {user.uid !== currentUserUid && (
                  <DataTableActionButton
                    label={`Atur ulang password ${user.fullName}`}
                    onClick={() => openReset(user)}
                  >
                    <KeyRound />
                  </DataTableActionButton>
                )}
              </div>
            </div>
          ))}
        </div>
        {result.data && (
          <DataTablePagination
            table={table}
            summary={paginationSummary(result.data.meta)}
          />
        )}
      </TableState>

      <UserDetailSheet
        uid={selectedUid}
        open={Boolean(selectedUid)}
        onOpenChange={(open) => !open && setSelectedUid(undefined)}
        onEdit={(user) => {
          setSelectedUid(undefined)
          setEditTarget(user)
        }}
      />
      {meta && (
        <UserFormDialog
          open={Boolean(editTarget)}
          onOpenChange={(open) => !open && setEditTarget(undefined)}
          meta={meta}
          user={editTarget}
        />
      )}
      <ResetPasswordDialog
        user={resetTarget}
        open={Boolean(resetTarget)}
        onOpenChange={(open) => !open && setResetTarget(undefined)}
      />
    </div>
  )
}

function RolesTab({
  search,
  navigate,
  meta,
}: {
  search: PageSearch
  navigate: NavigateFn
  meta?: AccessManagementMeta
}) {
  const result = useManagedRoles()
  const [selectedUid, setSelectedUid] = useState<string>()
  const [editing, setEditing] = useState<ManagedRole>()
  const [sorting, setSorting] = useState<SortingState>([])
  const columns = useMemo<ColumnDef<ManagedRole>[]>(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Peran' />
        ),
        cell: ({ row }) => (
          <div>
            <p className='font-medium'>{row.original.name}</p>
            <p className='text-xs text-muted-foreground'>{row.original.code}</p>
          </div>
        ),
        meta: { label: 'Peran' },
      },
      {
        accessorKey: 'description',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Keterangan' />
        ),
        cell: ({ row }) => row.original.description || '-',
        meta: { label: 'Keterangan' },
      },
      {
        accessorKey: 'permissionCount',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Hak Akses' />
        ),
        cell: ({ row }) => `${row.original.permissionCount} hak akses`,
        meta: { label: 'Hak Akses' },
      },
      {
        accessorKey: 'userCount',
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Pengguna' />
        ),
        cell: ({ row }) => `${row.original.userCount} pengguna`,
        meta: { label: 'Pengguna' },
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
        meta: { label: 'Status' },
      },
      {
        id: 'actions',
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className='flex justify-end gap-1'>
            <DataTableActionButton
              label={`Lihat hak akses ${row.original.name}`}
              onClick={() => setSelectedUid(row.original.uid)}
            >
              <Eye />
            </DataTableActionButton>
            {!row.original.permissionsImmutable && (
              <DataTableActionButton
                label={`Ubah hak akses ${row.original.name}`}
                onClick={() => setEditing(row.original)}
              >
                <Pencil />
              </DataTableActionButton>
            )}
          </div>
        ),
      },
    ],
    []
  )
  const url = useTableUrlState({ search, navigate })
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: result.data ?? [],
    columns,
    state: {
      sorting,
      globalFilter: url.globalFilter,
      pagination: url.pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: url.onGlobalFilterChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className='space-y-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder='Cari kode atau nama peran...'
      />
      <TableState
        pending={result.isPending}
        fetching={result.isFetching}
        error={result.isError}
        empty={!result.data?.length}
        label='peran'
        onRetry={() => void result.refetch()}
      >
        <div className='overflow-x-auto rounded-md border'>
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
      </TableState>
      <RoleDetailSheet
        uid={selectedUid}
        open={Boolean(selectedUid)}
        onOpenChange={(open) => !open && setSelectedUid(undefined)}
        onEdit={(role) => {
          setSelectedUid(undefined)
          setEditing(role)
        }}
      />
      {meta && (
        <RoleFormDialog
          role={editing}
          meta={meta}
          open={Boolean(editing)}
          onOpenChange={(open) => !open && setEditing(undefined)}
        />
      )}
    </div>
  )
}

function TableState({
  pending,
  fetching,
  error,
  empty,
  label,
  onRetry,
  children,
}: {
  pending: boolean
  fetching: boolean
  error: boolean
  empty: boolean
  label: string
  onRetry: () => void
  children: React.ReactNode
}) {
  if (pending) {
    return (
      <p role='status' className='py-12 text-center text-muted-foreground'>
        Memuat data {label}...
      </p>
    )
  }
  if (error) {
    return (
      <div className='py-12 text-center'>
        <p>Data {label} gagal dimuat.</p>
        <Button variant='outline' className='mt-3' onClick={onRetry}>
          <RefreshCcw /> Coba lagi
        </Button>
      </div>
    )
  }
  if (empty) {
    return (
      <div className='py-12 text-center text-muted-foreground'>
        <UserCog className='mx-auto mb-2' />
        Tidak ada data {label} yang sesuai filter.
      </div>
    )
  }
  return (
    <>
      {fetching && (
        <p role='status' className='flex gap-2 text-xs text-muted-foreground'>
          <LoaderCircle className='size-3 animate-spin' /> Memperbarui data...
        </p>
      )}
      {children}
    </>
  )
}

function UserFormDialog({
  open,
  onOpenChange,
  meta,
  user,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  meta: AccessManagementMeta
  user?: ManagedUser
}) {
  const create = useCreateManagedUser()
  const update = useUpdateManagedUser()
  const currentUserUid = useAuthStore((state) => state.session?.user.uid)
  const isCurrentUser = user?.uid === currentUserUid
  const [draft, setDraft] = useState<UserInput>(() => userDraft(user))
  const identity = user?.uid ?? 'new'
  const [draftIdentity, setDraftIdentity] = useState(identity)
  if (draftIdentity !== identity) {
    setDraftIdentity(identity)
    setDraft(userDraft(user))
  }
  const pending = create.isPending || update.isPending
  const selectedRoleCodes = meta.roles
    .filter((role) => draft.roleUids.includes(role.uid))
    .map((role) => role.code)
  const requiresSite = selectedRoleCodes.some(
    (code) => !['SUPER_ADMIN', 'DIRECTOR'].includes(code)
  )
  const valid =
    draft.fullName.trim().length >= 2 &&
    /^[a-zA-Z0-9._-]{3,100}$/.test(draft.username.trim()) &&
    draft.roleUids.length > 0 &&
    (!requiresSite || draft.siteUids.length > 0) &&
    (!draft.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) &&
    (!draft.defaultSiteUid || draft.siteUids.includes(draft.defaultSiteUid)) &&
    (Boolean(user) || validPassword(draft.initialPassword ?? ''))

  const submit = () => {
    if (!valid) return
    const input: UserInput = {
      ...draft,
      fullName: draft.fullName.trim(),
      username: draft.username.trim(),
      email: nullable(draft.email),
      phone: nullable(draft.phone),
    }
    const options = {
      onSuccess: () => {
        toast.success(
          user ? 'Data user berhasil diperbarui.' : 'User berhasil dibuat.'
        )
        onOpenChange(false)
      },
      onError: (error: unknown) =>
        toast.error(apiMessage(error, 'Data user belum dapat disimpan.')),
    }
    if (user) update.mutate({ uid: user.uid, input }, options)
    else create.mutate(input, options)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{user ? 'Ubah User' : 'Tambah User'}</DialogTitle>
          <DialogDescription>
            Atur identitas akun, peran, dan site yang boleh diakses.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 sm:grid-cols-2'>
          <Field label='Nama lengkap' className='sm:col-span-2'>
            <Input
              value={draft.fullName}
              maxLength={150}
              autoComplete='name'
              onChange={(event) =>
                setDraft({ ...draft, fullName: event.target.value })
              }
            />
          </Field>
          <Field label='Username'>
            <Input
              value={draft.username}
              maxLength={100}
              autoComplete='username'
              onChange={(event) =>
                setDraft({ ...draft, username: event.target.value })
              }
            />
          </Field>
          <Field label='Status akun'>
            <Select
              value={draft.status}
              disabled={isCurrentUser}
              onValueChange={(status) =>
                setDraft({ ...draft, status: status as UserStatus })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((status) => (
                  <SelectItem key={status.value} value={status.value}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isCurrentUser && (
              <p className='text-xs text-muted-foreground'>
                Status akun yang sedang digunakan tidak dapat diubah.
              </p>
            )}
          </Field>
          <Field label='Email'>
            <Input
              type='email'
              value={draft.email ?? ''}
              maxLength={191}
              autoComplete='email'
              placeholder='Opsional'
              onChange={(event) =>
                setDraft({ ...draft, email: event.target.value })
              }
            />
          </Field>
          <Field label='Nomor telepon'>
            <Input
              value={draft.phone ?? ''}
              maxLength={30}
              autoComplete='tel'
              placeholder='Opsional'
              onChange={(event) =>
                setDraft({ ...draft, phone: event.target.value })
              }
            />
          </Field>
          {!user && (
            <Field label='Password awal' className='sm:col-span-2'>
              <Input
                type='password'
                value={draft.initialPassword ?? ''}
                autoComplete='new-password'
                onChange={(event) =>
                  setDraft({ ...draft, initialPassword: event.target.value })
                }
              />
              <p className='text-xs text-muted-foreground'>
                Minimal 8 karakter serta mengandung huruf dan angka.
              </p>
            </Field>
          )}
          <fieldset className='space-y-2 sm:col-span-2'>
            <legend className='text-sm font-medium'>Peran pengguna</legend>
            <div className='grid gap-2 rounded-md border p-3 sm:grid-cols-2'>
              {meta.roles
                .filter((role) => role.isActive)
                .map((role) => (
                  <CheckLine
                    key={role.uid}
                    checked={draft.roleUids.includes(role.uid)}
                    disabled={
                      isCurrentUser &&
                      role.code === 'SUPER_ADMIN' &&
                      draft.roleUids.includes(role.uid)
                    }
                    label={role.name}
                    description={role.code}
                    onCheckedChange={(checked) =>
                      setDraft({
                        ...draft,
                        roleUids: toggle(draft.roleUids, role.uid, checked),
                      })
                    }
                  />
                ))}
            </div>
            {requiresSite && draft.siteUids.length === 0 && (
              <p className='text-xs text-destructive'>
                Peran yang dipilih wajib memiliki minimal satu akses site.
              </p>
            )}
          </fieldset>
          <fieldset className='space-y-2 sm:col-span-2'>
            <legend className='text-sm font-medium'>Akses site</legend>
            <div className='grid gap-2 rounded-md border p-3 sm:grid-cols-3'>
              {meta.sites.map((site) => (
                <CheckLine
                  key={site.uid}
                  checked={draft.siteUids.includes(site.uid)}
                  label={site.name}
                  description={site.code}
                  onCheckedChange={(checked) => {
                    const siteUids = toggle(draft.siteUids, site.uid, checked)
                    setDraft({
                      ...draft,
                      siteUids,
                      defaultSiteUid: siteUids.includes(
                        draft.defaultSiteUid ?? ''
                      )
                        ? draft.defaultSiteUid
                        : null,
                    })
                  }}
                />
              ))}
            </div>
          </fieldset>
          <Field label='Site utama' className='sm:col-span-2'>
            <Select
              value={draft.defaultSiteUid ?? 'NONE'}
              onValueChange={(value) =>
                setDraft({
                  ...draft,
                  defaultSiteUid: value === 'NONE' ? null : value,
                })
              }
            >
              <SelectTrigger className='w-full sm:w-72'>
                <SelectValue placeholder='Pilih site utama' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='NONE'>Tanpa site utama</SelectItem>
                {meta.sites
                  .filter((site) => draft.siteUids.includes(site.uid))
                  .map((site) => (
                    <SelectItem key={site.uid} value={site.uid}>
                      {site.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          {!user && (
            <p className='rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-muted-foreground sm:col-span-2'>
              Demi keamanan, pengguna wajib mengganti password awal saat login
              pertama sebelum dapat membuka menu lain.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button disabled={!valid || pending} onClick={submit}>
            {pending && <LoaderCircle className='animate-spin' />}
            {user ? 'Simpan perubahan' : 'Buat user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UserDetailSheet({
  uid,
  open,
  onOpenChange,
  onEdit,
}: {
  uid?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (user: ManagedUser) => void
}) {
  const result = useManagedUser(uid)
  const user = result.data
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-lg'>
        <SheetHeader className='border-b'>
          <SheetTitle>Detail User</SheetTitle>
          <SheetDescription>
            Informasi akun dan cakupan akses pengguna.
          </SheetDescription>
        </SheetHeader>
        {result.isPending ? (
          <p className='p-5 text-muted-foreground'>Memuat detail user...</p>
        ) : result.isError || !user ? (
          <p className='p-5 text-destructive'>Detail user gagal dimuat.</p>
        ) : (
          <div className='space-y-6 p-5'>
            <div className='flex items-center gap-3'>
              <Avatar className='size-12'>
                <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
              </Avatar>
              <div className='min-w-0 flex-1'>
                <p className='truncate font-semibold'>{user.fullName}</p>
                <p className='truncate text-sm text-muted-foreground'>
                  @{user.username}
                </p>
              </div>
              <UserStatusBadge status={user.status} />
            </div>
            <section className='space-y-3'>
              <h3 className='font-semibold'>Informasi akun</h3>
              <dl className='grid gap-2 rounded-md border p-4 text-sm'>
                <DetailLine label='Email' value={user.email || '-'} />
                <DetailLine label='Telepon' value={user.phone || '-'} />
                <DetailLine
                  label='Login terakhir'
                  value={formatDateTime(user.lastLoginAt)}
                />
                <DetailLine
                  label='Ganti password saat login'
                  value={user.mustChangePassword ? 'Ya' : 'Tidak'}
                />
              </dl>
            </section>
            <section className='space-y-3'>
              <h3 className='font-semibold'>Peran</h3>
              <div className='flex flex-wrap gap-2'>
                {user.roles.map((role) => (
                  <Badge key={role.uid} variant='secondary'>
                    {role.name}
                  </Badge>
                ))}
              </div>
            </section>
            <section className='space-y-3'>
              <h3 className='font-semibold'>Akses site</h3>
              <div className='grid gap-2'>
                {user.siteAccess.map((site) => (
                  <div
                    key={site.uid}
                    className='flex items-center justify-between rounded-md border p-3 text-sm'
                  >
                    <span>{site.name}</span>
                    {site.isDefault && <Badge variant='outline'>Utama</Badge>}
                  </div>
                ))}
                {!user.siteAccess.length && (
                  <p className='text-sm text-muted-foreground'>
                    Belum memiliki akses site.
                  </p>
                )}
              </div>
            </section>
            <Button className='w-full' onClick={() => onEdit(user)}>
              <Pencil /> Ubah User
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user?: ManagedUser
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const reset = useResetManagedUserPassword()
  const [password, setPassword] = useState('')
  const submit = () => {
    if (!user || !validPassword(password)) return
    reset.mutate(
      { uid: user.uid, input: { newPassword: password } },
      {
        onSuccess: () => {
          toast.success('Password berhasil diatur ulang.')
          setPassword('')
          onOpenChange(false)
        },
        onError: (error) =>
          toast.error(apiMessage(error, 'Password belum dapat diatur ulang.')),
      }
    )
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !reset.isPending && onOpenChange(next)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Atur Ulang Password</DialogTitle>
          <DialogDescription>
            Buat password awal baru untuk {user?.fullName ?? 'pengguna ini'}.
          </DialogDescription>
        </DialogHeader>
        <Field label='Password baru'>
          <Input
            type='password'
            value={password}
            autoComplete='new-password'
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className='text-xs text-muted-foreground'>
            Minimal 8 karakter serta mengandung huruf dan angka.
          </p>
        </Field>
        <p className='rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-muted-foreground'>
          Seluruh sesi pengguna akan dikeluarkan. Pada login berikutnya,
          pengguna wajib mengganti password sementara ini terlebih dahulu.
        </p>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={!validPassword(password) || reset.isPending}
            onClick={submit}
          >
            {reset.isPending && <LoaderCircle className='animate-spin' />}
            Atur ulang password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RoleDetailSheet({
  uid,
  open,
  onOpenChange,
  onEdit,
}: {
  uid?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (role: ManagedRole) => void
}) {
  const result = useManagedRole(uid)
  const role = result.data
  const grouped = useMemo(
    () => groupPermissions(role?.permissions ?? []),
    [role?.permissions]
  )
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto sm:max-w-xl'>
        <SheetHeader className='border-b'>
          <SheetTitle>Rincian Hak Akses</SheetTitle>
          <SheetDescription>
            Daftar kewenangan yang diberikan kepada peran ini.
          </SheetDescription>
        </SheetHeader>
        {result.isPending ? (
          <p className='p-5 text-muted-foreground'>Memuat hak akses...</p>
        ) : result.isError || !role ? (
          <p className='p-5 text-destructive'>Hak akses gagal dimuat.</p>
        ) : (
          <div className='space-y-5 p-5'>
            <div>
              <div className='flex flex-wrap items-center gap-2'>
                <h3 className='text-lg font-semibold'>{role.name}</h3>
                <Badge variant={role.isActive ? 'default' : 'secondary'}>
                  {role.isActive ? 'Aktif' : 'Nonaktif'}
                </Badge>
              </div>
              <p className='text-sm text-muted-foreground'>{role.code}</p>
              <p className='mt-2 text-sm'>{role.description || '-'}</p>
            </div>
            <div className='grid grid-cols-2 gap-3'>
              <div className='rounded-md border p-3'>
                <p className='text-xs text-muted-foreground'>Pengguna</p>
                <p className='text-xl font-semibold'>{role.userCount}</p>
              </div>
              <div className='rounded-md border p-3'>
                <p className='text-xs text-muted-foreground'>Hak akses</p>
                <p className='text-xl font-semibold'>{role.permissionCount}</p>
              </div>
            </div>
            {grouped.map(([module, permissions]) => (
              <section key={module} className='space-y-2'>
                <h4 className='font-medium'>{moduleLabel(module)}</h4>
                <div className='divide-y rounded-md border'>
                  {permissions.map((permission) => (
                    <div key={permission.uid} className='p-3'>
                      <p className='text-sm font-medium'>{permission.name}</p>
                      <p className='text-xs text-muted-foreground'>
                        {permission.description || permission.code}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {role.permissionsImmutable ? (
              <p className='rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-muted-foreground'>
                Super Admin selalu memiliki seluruh hak akses. Ketentuan ini
                tidak dapat dikurangi.
              </p>
            ) : (
              <Button className='w-full' onClick={() => onEdit(role)}>
                <Pencil /> Ubah Hak Akses
              </Button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function RoleFormDialog({
  role,
  meta,
  open,
  onOpenChange,
}: {
  role?: ManagedRole
  meta: AccessManagementMeta
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const detail = useManagedRole(open ? role?.uid : undefined)
  const update = useUpdateManagedRole()
  const source = detail.data ?? role
  const [draft, setDraft] = useState<RoleInput>(() => roleDraft(source))
  const identity = `${source?.uid ?? ''}:${source?.permissions?.map((item) => item.uid).join(',') ?? ''}`
  const [draftIdentity, setDraftIdentity] = useState(identity)
  if (identity && draftIdentity !== identity) {
    setDraftIdentity(identity)
    setDraft(roleDraft(source))
  }
  const grouped = useMemo(
    () => groupPermissions(meta.permissions),
    [meta.permissions]
  )
  const submit = () => {
    if (!role) return
    update.mutate(
      {
        uid: role.uid,
        input: draft,
      },
      {
        onSuccess: () => {
          toast.success('Hak akses peran berhasil diperbarui.')
          onOpenChange(false)
        },
        onError: (error) =>
          toast.error(apiMessage(error, 'Hak akses belum dapat disimpan.')),
      }
    )
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !update.isPending && onOpenChange(next)}
    >
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Ubah Hak Akses</DialogTitle>
          <DialogDescription>
            Perubahan berlaku untuk seluruh pengguna dengan peran ini.
          </DialogDescription>
        </DialogHeader>
        {detail.isPending ? (
          <p className='py-10 text-center text-muted-foreground'>
            Memuat rincian peran...
          </p>
        ) : (
          <div className='space-y-5'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field label='Nama peran'>
                <Input value={role?.name ?? ''} disabled />
              </Field>
              <Field label='Kode peran'>
                <Input value={role?.code ?? ''} disabled />
              </Field>
              <div className='sm:col-span-2'>
                <p className='text-sm font-medium'>Keterangan</p>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {role?.description || '-'}
                </p>
              </div>
            </div>
            <div className='space-y-4'>
              <div>
                <h3 className='font-semibold'>Daftar kewenangan</h3>
                <p className='text-sm text-muted-foreground'>
                  Pilih tindakan yang boleh dilakukan oleh peran ini.
                </p>
              </div>
              {grouped.map(([module, permissions]) => (
                <fieldset key={module} className='space-y-2'>
                  <legend className='font-medium'>{moduleLabel(module)}</legend>
                  <div className='grid gap-2 rounded-md border p-3 sm:grid-cols-2'>
                    {permissions.map((permission) => (
                      <CheckLine
                        key={permission.uid}
                        checked={draft.permissionUids.includes(permission.uid)}
                        disabled={role?.code === 'SUPER_ADMIN'}
                        label={permission.name}
                        description={permission.description || permission.code}
                        onCheckedChange={(checked) =>
                          setDraft({
                            ...draft,
                            permissionUids: toggle(
                              draft.permissionUids,
                              permission.uid,
                              checked
                            ),
                          })
                        }
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={
              detail.isPending || update.isPending || role?.permissionsImmutable
            }
            onClick={submit}
          >
            {update.isPending && <LoaderCircle className='animate-spin' />}
            Simpan perubahan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <label className={`grid gap-1.5 text-sm font-medium ${className ?? ''}`}>
      {label}
      {children}
    </label>
  )
}

function CheckLine({
  checked,
  label,
  description,
  disabled,
  onCheckedChange,
}: {
  checked: boolean
  label: string
  description?: string
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  const id = `check-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <label
      htmlFor={id}
      className='flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/60'
    >
      <Checkbox
        id={id}
        className='mt-0.5'
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span className='min-w-0'>
        <span className='block text-sm font-medium'>{label}</span>
        {description && (
          <span className='block text-xs text-muted-foreground'>
            {description}
          </span>
        )}
      </span>
    </label>
  )
}

function UserIdentity({ user }: { user: ManagedUser }) {
  return (
    <div className='flex min-w-0 items-center gap-3'>
      <Avatar className='size-9'>
        <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
      </Avatar>
      <div className='min-w-0'>
        <p className='truncate font-medium'>{user.fullName}</p>
        <p className='truncate text-xs text-muted-foreground'>
          @{user.username} {user.email ? `· ${user.email}` : ''}
        </p>
      </div>
    </div>
  )
}

function UserStatusBadge({ status }: { status: UserStatus }) {
  return (
    <Badge
      variant={
        status === 'ACTIVE'
          ? 'default'
          : status === 'LOCKED'
            ? 'destructive'
            : 'secondary'
      }
    >
      {statusLabel(status)}
    </Badge>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex justify-between gap-4'>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='text-right font-medium'>{value}</dd>
    </div>
  )
}

const statusOptions = [
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'INACTIVE', label: 'Nonaktif' },
  { value: 'LOCKED', label: 'Terkunci' },
]

function userDraft(user?: ManagedUser): UserInput {
  return {
    fullName: user?.fullName ?? '',
    username: user?.username ?? '',
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    status: user?.status ?? 'ACTIVE',
    roleUids: user?.roles.map((role) => role.uid) ?? [],
    siteUids: user?.siteAccess.map((site) => site.uid) ?? [],
    defaultSiteUid:
      user?.siteAccess.find((site) => site.isDefault)?.uid ?? null,
    initialPassword: user ? undefined : '',
  }
}

function roleDraft(role?: ManagedRole): RoleInput {
  return {
    permissionUids: role?.permissions?.map((item) => item.uid) ?? [],
  }
}

function groupPermissions<T extends { module: string }>(items: T[]) {
  const groups = new Map<string, T[]>()
  items.forEach((item) =>
    groups.set(item.module, [...(groups.get(item.module) ?? []), item])
  )
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'id'))
}

function moduleLabel(module: string) {
  const labels: Record<string, string> = {
    dashboard: 'Dashboard',
    employees: 'Karyawan',
    attendance: 'Attendance',
    production: 'Produksi Borongan',
    payroll: 'Payroll',
    documents: 'Dokumen',
    reports: 'Laporan',
    users: 'User & Hak Akses',
    settings: 'Pengaturan Sistem',
    audit: 'Audit Trail',
  }
  return labels[module] ?? module
}

function toggle(values: string[], value: string, checked: boolean) {
  return checked
    ? [...new Set([...values, value])]
    : values.filter((item) => item !== value)
}

function validPassword(value: string) {
  return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value)
}

function nullable(value: string | null | undefined) {
  return value?.trim() || null
}

function initials(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function statusLabel(status: UserStatus) {
  return status === 'ACTIVE'
    ? 'Aktif'
    : status === 'LOCKED'
      ? 'Terkunci'
      : 'Nonaktif'
}

function formatDateTime(value: string | null) {
  if (!value) return 'Belum pernah'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function paginationSummary(result: {
  page: number
  pageSize: number
  total: number
}) {
  if (!result.total) return 'Tidak ada data.'
  const start = (result.page - 1) * result.pageSize + 1
  const end = Math.min(result.page * result.pageSize, result.total)
  return `Menampilkan ${start}–${end} dari ${result.total} data.`
}

function apiMessage(error: unknown, fallback: string) {
  if (!isAxiosError(error)) return fallback
  const message = error.response?.data?.message
  return typeof message === 'string' ? message : fallback
}
