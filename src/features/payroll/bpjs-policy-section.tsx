import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { isAxiosError } from 'axios'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  PencilLine,
  Plus,
  RefreshCcw,
  ShieldCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  siteScopeLabel,
  useSiteScopeFilter,
} from '@/hooks/use-site-scope-filter'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Textarea } from '@/components/ui/textarea'
import {
  DataTableActionButton,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { SiteScopeFilter } from '@/components/site-scope-filter'
import { BpjsEnrollmentImportDialog } from './bpjs-enrollment-import-dialog'
import {
  usePayrollBpjsConfiguration,
  usePayrollBpjsEnrollments,
  useSavePayrollBpjsEnrollment,
  useSavePayrollBpjsPolicy,
} from './data/queries'
import type {
  PayrollBpjsEnrollment,
  PayrollBpjsPolicy,
  PayrollSite,
} from './domain'

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
function key(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
}
function rate(value: string) {
  return `${Number(value).toLocaleString('id-ID', { maximumFractionDigits: 4 })}%`
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? (value as string[]) : undefined
}

function numberStatus(item: PayrollBpjsEnrollment) {
  return item.hasHealthNumber && item.hasEmploymentNumber
    ? 'COMPLETE'
    : 'INCOMPLETE'
}

function participationStatus(item: PayrollBpjsEnrollment) {
  return item.healthEnabled &&
    item.jhtEnabled &&
    item.jkkEnabled &&
    item.jkmEnabled &&
    item.jpEnabled
    ? 'ALL_ACTIVE'
    : 'ANY_DISABLED'
}

function paginationSummary(page: number, pageSize: number, total: number) {
  return total
    ? `Menampilkan ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} dari ${total} data.`
    : 'Tidak ada data.'
}

function ProgramStatus({
  enabled,
  label,
}: {
  enabled: boolean
  label: string
}) {
  return (
    <div
      className='flex justify-center'
      title={`${label} ${enabled ? 'aktif' : 'nonaktif'}`}
    >
      {enabled ? (
        <CheckCircle2 className='size-4 text-emerald-600' aria-hidden='true' />
      ) : (
        <span className='text-muted-foreground' aria-hidden='true'>
          —
        </span>
      )}
      <span className='sr-only'>
        {label} {enabled ? 'aktif' : 'nonaktif'}
      </span>
    </div>
  )
}

function NumberStatusBadge({ item }: { item: PayrollBpjsEnrollment }) {
  return numberStatus(item) === 'COMPLETE' ? (
    <Badge variant='secondary'>Lengkap</Badge>
  ) : (
    <Badge
      variant='outline'
      className='border-amber-300 text-amber-700 dark:text-amber-300'
    >
      Belum lengkap
    </Badge>
  )
}

function EnrollmentState({ children }: { children: ReactNode }) {
  return (
    <div className='flex min-h-28 flex-wrap items-center justify-center gap-2 rounded-md border border-dashed px-4 text-sm text-muted-foreground'>
      {children}
    </div>
  )
}

export function BpjsPolicySection({
  sites,
  site,
  year,
  canManagePolicy,
  canManageEnrollment,
  onFilter,
  search,
  navigate,
}: {
  sites: PayrollSite[]
  site: string
  year?: number
  canManagePolicy: boolean
  canManageEnrollment: boolean
  onFilter: (value: Record<string, unknown>) => void
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const selectedYear = year ?? new Date().getFullYear()
  const page = numberValue(search.page, 1)
  const pageSize = numberValue(search.pageSize, 50)
  const numberStatuses = arrayValue(search.bpjsNumberStatus)
  const participationStatuses = arrayValue(search.bpjsParticipationStatus)
  const sortBy =
    search.bpjsSortBy === 'site' || search.bpjsSortBy === 'numberStatus'
      ? search.bpjsSortBy
      : 'employee'
  const sortDirection = search.bpjsSortDirection === 'desc' ? 'desc' : 'asc'
  const configuration = usePayrollBpjsConfiguration({
    year: selectedYear,
    site: site || undefined,
  })
  const enrollments = usePayrollBpjsEnrollments(
    {
      site: site || undefined,
      query: stringValue(search.query),
      numberStatus: numberStatuses,
      participationStatus: participationStatuses,
      sortBy,
      sortDirection,
      page,
      pageSize,
    },
    true
  )
  const [policyOpen, setPolicyOpen] = useState(false)
  const [employeeOpen, setEmployeeOpen] = useState<PayrollBpjsEnrollment>()
  const [importOpen, setImportOpen] = useState(false)
  const { lockedSite } = useSiteScopeFilter(site ? [site] : undefined)
  const columns = useMemo<ColumnDef<PayrollBpjsEnrollment>[]>(
    () => [
      {
        id: 'employee',
        accessorFn: (item) => item.employee.fullName,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Karyawan' />
        ),
        cell: ({ row }) => (
          <div>
            <p className='font-medium'>{row.original.employee.fullName}</p>
            <p className='text-xs text-muted-foreground'>
              {row.original.employee.employeeNumber}
              {row.original.implicitDefault ? ' · default' : ''}
            </p>
          </div>
        ),
      },
      {
        id: 'site',
        accessorFn: (item) => item.site.name,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Site' />
        ),
      },
      ...(
        [
          ['healthEnabled', 'Kes.'],
          ['jhtEnabled', 'JHT'],
          ['jkkEnabled', 'JKK'],
          ['jkmEnabled', 'JKM'],
          ['jpEnabled', 'JP'],
        ] as const
      ).map(
        ([field, label]) =>
          ({
            id: field,
            accessorFn: (item) => item[field],
            header: () => <span className='block text-center'>{label}</span>,
            cell: ({ row }) => (
              <ProgramStatus enabled={row.original[field]} label={label} />
            ),
            enableSorting: false,
          }) satisfies ColumnDef<PayrollBpjsEnrollment>
      ),
      {
        id: 'numberStatus',
        accessorFn: (item) => numberStatus(item),
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Nomor BPJS' />
        ),
        cell: ({ row }) => <NumberStatusBadge item={row.original} />,
      },
      {
        id: 'participationStatus',
        accessorFn: (item) => participationStatus(item),
        header: 'Status program',
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>Aksi</span>,
        cell: ({ row }) =>
          canManageEnrollment ? (
            <DataTableActionButton
              label={`Atur kepesertaan ${row.original.employee.fullName}`}
              onClick={() => setEmployeeOpen(row.original)}
            >
              <PencilLine />
            </DataTableActionButton>
          ) : null,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [canManageEnrollment]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'query' },
    columnFilters: [
      {
        columnId: 'numberStatus',
        searchKey: 'bpjsNumberStatus',
        type: 'array',
      },
      {
        columnId: 'participationStatus',
        searchKey: 'bpjsParticipationStatus',
        type: 'array',
      },
    ],
  })
  const sorting: SortingState = [{ id: sortBy, desc: sortDirection === 'desc' }]
  // TanStack Table mengembalikan fungsi stateful; ini pola resmi starter.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: enrollments.data?.data ?? [],
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
    pageCount: enrollments.data?.meta.totalPages ?? 1,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater
      const first = next[0]
      navigate({
        search: (previous) => ({
          ...previous,
          bpjsSortBy: first?.id ?? undefined,
          bpjsSortDirection: first ? (first.desc ? 'desc' : 'asc') : undefined,
          page: undefined,
        }),
      })
    },
    getCoreRowModel: getCoreRowModel(),
    getRowId: (item) => item.employee.uid,
    initialState: { columnVisibility: { participationStatus: false } },
  })

  useEffect(() => {
    if (enrollments.data) {
      url.ensurePageInRange(enrollments.data.meta.totalPages)
    }
  }, [enrollments.data, url])

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-end justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>Kebijakan BPJS Borongan</h2>
          <p className='text-sm text-muted-foreground'>
            UMK aktif per site dipakai otomatis sebagai dasar iuran. Hasil
            Produksi tetap menjadi penghasilan utama karyawan.
          </p>
        </div>
        <div className='space-y-1'>
          <Label htmlFor='bpjs-year'>Tahun</Label>
          <Input
            id='bpjs-year'
            className='w-28'
            type='number'
            min={2000}
            max={2100}
            value={selectedYear}
            onChange={(event) =>
              onFilter({ year: Number(event.target.value) || undefined })
            }
          />
        </div>
      </div>
      <Alert className='border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/30'>
        <ShieldCheck />
        <AlertDescription>
          Switch Potong BPJS dipilih pada periode Payroll. Sistem hanya memotong
          satu kali untuk setiap karyawan dan bulan iuran.
        </AlertDescription>
      </Alert>
      {configuration.isError ? (
        <Alert variant='destructive'>
          <AlertTriangle />
          <AlertTitle>Konfigurasi gagal dimuat</AlertTitle>
          <AlertDescription>
            {apiMessage(
              configuration.error,
              'Periksa migration BPJS dan koneksi API.'
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      <section className='rounded-lg border p-4'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h3 className='font-semibold'>Ketentuan tahun {selectedYear}</h3>
            <p className='text-xs text-muted-foreground'>
              Persentase global, toggle setiap porsi, batas upah, dan
              pembulatan.
            </p>
          </div>
          {canManagePolicy ? (
            <Button size='sm' onClick={() => setPolicyOpen(true)}>
              {configuration.data?.data.policy ? <PencilLine /> : <Plus />}
              {configuration.data?.data.policy
                ? 'Ubah kebijakan'
                : 'Buat kebijakan'}
            </Button>
          ) : null}
        </div>
        {configuration.isPending ? (
          <p className='mt-4 text-sm text-muted-foreground'>
            Memuat kebijakan...
          </p>
        ) : configuration.data?.data.policy ? (
          <PolicySummary policy={configuration.data.data.policy} />
        ) : (
          <div className='mt-4 rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
            Kebijakan BPJS tahun ini belum dibuat.
          </div>
        )}
      </section>
      <section className='space-y-2'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <h3 className='font-semibold'>Kepesertaan karyawan Borongan</h3>
            <p className='text-xs text-muted-foreground'>
              Default seluruh program aktif. Nomor BPJS kosong hanya menjadi
              peringatan.
            </p>
          </div>
          {canManageEnrollment ? (
            <Button
              size='sm'
              variant='outline'
              onClick={() => setImportOpen(true)}
            >
              <FileSpreadsheet /> Import Excel
            </Button>
          ) : null}
        </div>
        <DataTableToolbar
          table={table}
          searchPlaceholder='Cari nama atau nomor karyawan...'
          searchDebounceMs={500}
          className='flex-col sm:flex-row'
          controlsClassName='w-full flex-col sm:flex-row'
          searchInputClassName='w-full sm:w-56 lg:w-64'
          additionalFilters={
            lockedSite ? (
              <SiteScopeFilter
                siteLabel={siteScopeLabel(
                  lockedSite,
                  sites.map((item) => ({
                    value: item.code,
                    label: item.name,
                  }))
                )}
                className='h-8'
              />
            ) : (
              <Select
                value={site || 'ALL'}
                onValueChange={(value) =>
                  onFilter({
                    site: value === 'ALL' ? undefined : value,
                    page: undefined,
                  })
                }
              >
                <SelectTrigger
                  className='h-8 w-full sm:w-44'
                  aria-label='Filter site'
                >
                  <SelectValue placeholder='Semua site' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>Semua site</SelectItem>
                  {sites.map((item) => (
                    <SelectItem key={item.uid} value={item.code}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          }
          hasAdditionalFilters={Boolean(!lockedSite && site)}
          onResetAdditionalFilters={() =>
            onFilter({ site: undefined, page: undefined })
          }
          filters={[
            {
              columnId: 'numberStatus',
              title: 'Nomor BPJS',
              options: [
                { value: 'COMPLETE', label: 'Lengkap' },
                { value: 'INCOMPLETE', label: 'Belum lengkap' },
              ],
            },
            {
              columnId: 'participationStatus',
              title: 'Program',
              options: [
                { value: 'ALL_ACTIVE', label: 'Semua aktif' },
                { value: 'ANY_DISABLED', label: 'Ada yang nonaktif' },
              ],
            },
          ]}
        />
        {enrollments.isPending ? (
          <EnrollmentState>
            <LoaderCircle className='size-4 animate-spin' /> Memuat
            kepesertaan...
          </EnrollmentState>
        ) : enrollments.isError ? (
          <EnrollmentState>
            Data kepesertaan gagal dimuat.
            <Button
              size='sm'
              variant='outline'
              onClick={() => void enrollments.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </EnrollmentState>
        ) : !enrollments.data?.data.length ? (
          <EnrollmentState>
            Karyawan Borongan tidak ditemukan pada filter ini.
          </EnrollmentState>
        ) : (
          <>
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
            <div className='grid gap-2 md:hidden'>
              {enrollments.data.data.map((item) => (
                <div key={item.employee.uid} className='rounded-lg border p-3'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <p className='truncate font-medium'>
                        {item.employee.fullName}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {item.employee.employeeNumber} · {item.site.name}
                        {item.implicitDefault ? ' · default' : ''}
                      </p>
                    </div>
                    {canManageEnrollment ? (
                      <DataTableActionButton
                        label={`Atur kepesertaan ${item.employee.fullName}`}
                        onClick={() => setEmployeeOpen(item)}
                      >
                        <PencilLine />
                      </DataTableActionButton>
                    ) : null}
                  </div>
                  <div className='mt-3 flex flex-wrap items-center gap-2'>
                    {(
                      [
                        ['healthEnabled', 'Kes.'],
                        ['jhtEnabled', 'JHT'],
                        ['jkkEnabled', 'JKK'],
                        ['jkmEnabled', 'JKM'],
                        ['jpEnabled', 'JP'],
                      ] as const
                    ).map(([field, label]) => (
                      <Badge
                        key={field}
                        variant={item[field] ? 'secondary' : 'outline'}
                      >
                        {label} {item[field] ? 'aktif' : 'nonaktif'}
                      </Badge>
                    ))}
                    <NumberStatusBadge item={item} />
                  </div>
                </div>
              ))}
            </div>
            <DataTablePagination
              table={table}
              summary={paginationSummary(
                enrollments.data.meta.page,
                enrollments.data.meta.pageSize,
                enrollments.data.meta.total
              )}
            />
          </>
        )}
      </section>
      {policyOpen ? (
        <PolicyDialog
          open
          onOpenChange={setPolicyOpen}
          year={selectedYear}
          policy={configuration.data?.data.policy ?? null}
        />
      ) : null}
      {employeeOpen ? (
        <EnrollmentDialog
          open
          onOpenChange={(open) => !open && setEmployeeOpen(undefined)}
          item={employeeOpen}
        />
      ) : null}
      {importOpen ? (
        <BpjsEnrollmentImportDialog
          open
          onOpenChange={setImportOpen}
          templateFilters={{
            site: site || undefined,
            query: stringValue(search.query),
            sortBy: 'employee',
            sortDirection: 'asc',
          }}
        />
      ) : null}
    </div>
  )
}

function PolicySummary({ policy }: { policy: PayrollBpjsPolicy }) {
  const items = [
    [
      'Kesehatan perusahaan',
      policy.healthEmployerEnabled,
      policy.healthEmployerRate,
    ],
    [
      'Kesehatan karyawan',
      policy.healthEmployeeEnabled,
      policy.healthEmployeeRate,
    ],
    ['JHT perusahaan', policy.jhtEmployerEnabled, policy.jhtEmployerRate],
    ['JHT karyawan', policy.jhtEmployeeEnabled, policy.jhtEmployeeRate],
    ['JKK perusahaan', policy.jkkEmployerEnabled, policy.jkkEmployerRate],
    ['JKM perusahaan', policy.jkmEmployerEnabled, policy.jkmEmployerRate],
    ['JP perusahaan', policy.jpEmployerEnabled, policy.jpEmployerRate],
    ['JP karyawan', policy.jpEmployeeEnabled, policy.jpEmployeeRate],
  ] as const
  return (
    <div className='mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
      {items.map(([label, enabled, value]) => (
        <div key={label} className='rounded-md bg-muted/50 p-2'>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='font-semibold'>{enabled ? rate(value) : 'Nonaktif'}</p>
        </div>
      ))}
      <div className='rounded-md bg-muted/50 p-2'>
        <p className='text-xs text-muted-foreground'>Pembulatan karyawan</p>
        <p className='font-semibold'>
          Rp{policy.roundingUnit.toLocaleString('id-ID')}
        </p>
      </div>
    </div>
  )
}

type PolicyForm = Omit<
  PayrollBpjsPolicy,
  | 'uid'
  | 'status'
  | 'updatedAt'
  | 'healthWageCeiling'
  | 'jpWageCeiling'
  | 'regulationReference'
  | 'notes'
> & {
  healthWageCeiling: string
  jpWageCeiling: string
  regulationReference: string
  notes: string
  reason: string
}
function PolicyDialog({
  open,
  onOpenChange,
  year,
  policy,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  year: number
  policy: PayrollBpjsPolicy | null
}) {
  const mutation = useSavePayrollBpjsPolicy()
  const defaults: PolicyForm = {
    policyYear: year,
    healthEmployerEnabled: true,
    healthEmployerRate: '4',
    healthEmployeeEnabled: true,
    healthEmployeeRate: '1',
    jhtEmployerEnabled: true,
    jhtEmployerRate: '3.7',
    jhtEmployeeEnabled: true,
    jhtEmployeeRate: '2',
    jkkEmployerEnabled: true,
    jkkEmployerRate: '0.54',
    jkmEmployerEnabled: true,
    jkmEmployerRate: '0.3',
    jpEmployerEnabled: false,
    jpEmployerRate: '2',
    jpEmployeeEnabled: true,
    jpEmployeeRate: '1',
    healthWageCeiling: '',
    jpWageCeiling: '',
    roundingUnit: 1000,
    regulationReference: '',
    notes: '',
    reason: '',
  }
  const [form, setForm] = useState<PolicyForm>(() =>
    policy
      ? {
          ...policy,
          healthWageCeiling: policy.healthWageCeiling ?? '',
          jpWageCeiling: policy.jpWageCeiling ?? '',
          regulationReference: policy.regulationReference ?? '',
          notes: policy.notes ?? '',
          reason: '',
        }
      : defaults
  )
  const save = async () => {
    try {
      await mutation.mutateAsync({
        ...form,
        healthWageCeiling: form.healthWageCeiling || null,
        jpWageCeiling: form.jpWageCeiling || null,
        idempotencyKey: key('bpjs-policy'),
      })
      toast.success('Kebijakan BPJS disimpan.')
      onOpenChange(false)
    } catch (error) {
      toast.error(apiMessage(error, 'Kebijakan BPJS gagal disimpan.'))
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Kebijakan BPJS {year}</DialogTitle>
          <DialogDescription>
            Toggle perusahaan dan karyawan berdiri sendiri sesuai kebijakan
            client.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-3 sm:grid-cols-2'>
          {(
            [
              [
                'Kesehatan perusahaan',
                'healthEmployerEnabled',
                'healthEmployerRate',
              ],
              [
                'Kesehatan karyawan',
                'healthEmployeeEnabled',
                'healthEmployeeRate',
              ],
              ['JHT perusahaan', 'jhtEmployerEnabled', 'jhtEmployerRate'],
              ['JHT karyawan', 'jhtEmployeeEnabled', 'jhtEmployeeRate'],
              ['JKK perusahaan', 'jkkEmployerEnabled', 'jkkEmployerRate'],
              ['JKM perusahaan', 'jkmEmployerEnabled', 'jkmEmployerRate'],
              ['JP perusahaan', 'jpEmployerEnabled', 'jpEmployerRate'],
              ['JP karyawan', 'jpEmployeeEnabled', 'jpEmployeeRate'],
            ] as const
          ).map(([label, enabledField, rateField]) => (
            <div
              key={label}
              className='grid grid-cols-[1fr_92px] items-end gap-2 rounded-lg border p-3'
            >
              <div className='flex items-center gap-2'>
                <Switch
                  checked={form[enabledField]}
                  onCheckedChange={(checked) =>
                    setForm((value) => ({ ...value, [enabledField]: checked }))
                  }
                />
                <Label>{label}</Label>
              </div>
              <div>
                <Label className='text-xs'>Persen</Label>
                <Input
                  type='number'
                  step='0.0001'
                  min='0'
                  max='100'
                  value={form[rateField]}
                  onChange={(event) =>
                    setForm((value) => ({
                      ...value,
                      [rateField]: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          ))}
          <div className='space-y-1'>
            <Label>Batas upah Kesehatan (opsional)</Label>
            <Input
              type='number'
              value={form.healthWageCeiling}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  healthWageCeiling: event.target.value,
                }))
              }
            />
          </div>
          <div className='space-y-1'>
            <Label>Batas upah JP (opsional)</Label>
            <Input
              type='number'
              value={form.jpWageCeiling}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  jpWageCeiling: event.target.value,
                }))
              }
            />
          </div>
          <div className='space-y-1'>
            <Label>Pembulatan potongan karyawan</Label>
            <Input
              type='number'
              value={form.roundingUnit}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  roundingUnit: Number(event.target.value),
                }))
              }
            />
          </div>
          <div className='space-y-1'>
            <Label>Referensi regulasi</Label>
            <Input
              value={form.regulationReference}
              onChange={(event) =>
                setForm((value) => ({
                  ...value,
                  regulationReference: event.target.value,
                }))
              }
            />
          </div>
          <div className='space-y-1 sm:col-span-2'>
            <Label>Catatan</Label>
            <Textarea
              value={form.notes}
              onChange={(event) =>
                setForm((value) => ({ ...value, notes: event.target.value }))
              }
            />
          </div>
          <div className='space-y-1 sm:col-span-2'>
            <Label>Alasan perubahan</Label>
            <Textarea
              value={form.reason}
              onChange={(event) =>
                setForm((value) => ({ ...value, reason: event.target.value }))
              }
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            onClick={() => void save()}
            disabled={mutation.isPending || form.reason.trim().length < 5}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EnrollmentDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: PayrollBpjsEnrollment
}) {
  const mutation = useSavePayrollBpjsEnrollment()
  const [values, setValues] = useState(() => ({
    healthEnabled: item?.healthEnabled ?? true,
    jhtEnabled: item?.jhtEnabled ?? true,
    jkkEnabled: item?.jkkEnabled ?? true,
    jkmEnabled: item?.jkmEnabled ?? true,
    jpEnabled: item?.jpEnabled ?? true,
  }))
  const [reason, setReason] = useState('')
  const save = async () => {
    if (!item) return
    try {
      await mutation.mutateAsync({
        employeeUid: item.employee.uid,
        ...values,
        reason,
        idempotencyKey: key('bpjs-enrollment'),
      })
      toast.success('Kepesertaan BPJS diperbarui.')
      onOpenChange(false)
    } catch (error) {
      toast.error(apiMessage(error, 'Kepesertaan gagal diperbarui.'))
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kepesertaan BPJS</DialogTitle>
          <DialogDescription>
            {item?.employee.fullName} · perubahan berlaku hari ini dan tetap
            dicatat dalam jejak revisi.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          {(
            [
              ['BPJS Kesehatan', 'healthEnabled'],
              ['JHT', 'jhtEnabled'],
              ['JKK', 'jkkEnabled'],
              ['JKM', 'jkmEnabled'],
              ['Jaminan Pensiun', 'jpEnabled'],
            ] as const
          ).map(([label, field]) => (
            <div
              key={field}
              className='flex items-center justify-between rounded-lg border px-3 py-2'
            >
              <Label>{label}</Label>
              <Switch
                checked={values[field]}
                onCheckedChange={(checked) =>
                  setValues((value) => ({ ...value, [field]: checked }))
                }
              />
            </div>
          ))}
          <div className='space-y-1'>
            <Label>Alasan perubahan</Label>
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            onClick={() => void save()}
            disabled={mutation.isPending || reason.trim().length < 5}
          >
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
