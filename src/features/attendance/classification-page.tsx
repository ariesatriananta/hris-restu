import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type Table as TanStackTable,
} from '@tanstack/react-table'
import {
  Check,
  ChevronsUpDown,
  Eye,
  FileText,
  LoaderCircle,
  Plus,
  RefreshCcw,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { cn } from '@/lib/utils'
import { type NavigateFn, useTableUrlState } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
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
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  DataTableActionButton,
  DataTableBulkActions,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import {
  uploadAttendanceClassificationAttachment,
  useCancelAttendanceClassification,
  useAttendanceClassification,
  useAttendanceClassificationEmployees,
  useAttendanceClassifications,
  useAttendanceFoundation,
  useBulkReviewAttendanceClassifications,
  useCreateAttendanceClassification,
  useReviewAttendanceClassification,
  useReverseAttendanceClassification,
} from './data/queries'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'
import {
  attendanceClassificationReverseReasonError,
  canReverseAttendanceClassification,
  type AttendanceBulkReviewResult,
  type AttendanceClassification,
  type AttendanceClassificationApprovalStatus,
  type AttendanceClassificationDetailOutcome,
  type AttendanceClassificationEmployee,
  type AttendanceClassificationType,
  type AttendanceEmployeeType,
  type AttendanceSiteCode,
} from './domain'
import {
  attendanceEmployeeTypeOptions,
  attendanceProductionSectionOptions,
} from './filter-options'

export function AttendanceClassificationPage({
  search,
  navigate,
  embedded = false,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
  embedded?: boolean
}) {
  const session = useAuthStore((state) => state.session)
  const canCreate = hasPermission(session, 'attendance.correct')
  const canApprove = hasPermission(session, 'attendance.approve')
  const foundation = useAttendanceFoundation()
  const [createOpen, setCreateOpen] = useState(
    typeof search.employeeUid === 'string' && Boolean(search.employeeUid)
  )
  const [selectedUid, setSelectedUid] = useState<string>()
  const result = useAttendanceClassifications({
    query: stringValue(search.filter),
    site: arrayValue(search.site),
    employeeType: arrayValue<AttendanceEmployeeType>(search.employeeTypeFilter),
    productionSection: arrayValue(search.productionSection),
    classificationType: arrayValue(search.classificationType),
    approvalStatus: arrayValue(search.approvalStatus),
    dateFrom: stringValue(search.dateFrom),
    dateTo: stringValue(search.dateTo),
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  })
  const siteOptions = (foundation.data?.sites ?? []).map((site) => ({
    value: site.code,
    label: site.name,
  }))
  const classificationOptions = foundation.data?.lookups.classificationTypes
    ?.length
    ? foundation.data.lookups.classificationTypes
    : classificationTypeOptions
  const selectedSites = arrayValue<AttendanceSiteCode>(search.site) ?? []
  const productionSectionOptions = attendanceProductionSectionOptions(
    foundation.data,
    selectedSites
  )
  const bulkSite =
    selectedSites.length === 1
      ? selectedSites[0]
      : siteOptions.length === 1
        ? (siteOptions[0].value as AttendanceSiteCode)
        : undefined
  const handleCreateOpenChange = (open: boolean) => {
    setCreateOpen(open)
    if (!open && search.employeeUid) {
      navigate({
        search: (previous) => ({
          ...previous,
          employeeUid: undefined,
          employeeName: undefined,
          employeeNumber: undefined,
          employeeSite: undefined,
          employeeType: undefined,
          businessDate: undefined,
        }),
      })
    }
  }

  const PageContainer = embedded ? 'div' : Main
  return (
    <PageContainer>
      {!embedded && (
        <div className='mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <p className='text-sm font-medium text-primary'>Attendance</p>
            <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
              Klasifikasi Attendance
            </h1>
            <p className='text-sm text-muted-foreground'>
              Ajukan dan setujui cuti, sakit, atau izin untuk satu tanggal
              maupun rentang tanggal.
            </p>
          </div>
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Ajukan klasifikasi
            </Button>
          )}
        </div>
      )}

      <div className='mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end'>
        <div className='grid gap-3 sm:grid-cols-2 lg:w-md'>
          <DateFilter
            label='Dari tanggal'
            value={stringValue(search.dateFrom) ?? ''}
            onChange={(dateFrom) =>
              navigate({
                search: (previous) => ({
                  ...previous,
                  dateFrom: dateFrom || undefined,
                  page: undefined,
                }),
              })
            }
          />
          <DateFilter
            label='Sampai tanggal'
            value={stringValue(search.dateTo) ?? ''}
            onChange={(dateTo) =>
              navigate({
                search: (previous) => ({
                  ...previous,
                  dateTo: dateTo || undefined,
                  page: undefined,
                }),
              })
            }
          />
        </div>
        {embedded && canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Ajukan klasifikasi
          </Button>
        )}
      </div>

      <ClassificationTable
        result={result}
        search={search}
        navigate={navigate}
        siteOptions={siteOptions}
        productionSectionOptions={productionSectionOptions}
        classificationOptions={classificationOptions}
        canApprove={canApprove}
        bulkSite={bulkSite}
        onOpen={(item) => setSelectedUid(item.uid)}
      />
      <CreateClassificationDialog
        key={createOpen ? `open-${String(search.employeeUid ?? '')}` : 'closed'}
        open={createOpen}
        onOpenChange={handleCreateOpenChange}
        siteOptions={siteOptions}
        classificationOptions={classificationOptions}
        initialEmployeeUid={stringValue(search.employeeUid)}
        initialEmployeeName={stringValue(search.employeeName)}
        initialEmployeeNumber={stringValue(search.employeeNumber)}
        initialEmployeeSite={
          stringValue(search.employeeSite) as AttendanceSiteCode | undefined
        }
        initialEmployeeType={
          stringValue(search.employeeType) as
            | AttendanceClassificationEmployee['employeeType']
            | undefined
        }
        initialDate={stringValue(search.businessDate)}
      />
      <ClassificationDetailDialog
        key={selectedUid ?? 'closed'}
        uid={selectedUid}
        open={Boolean(selectedUid)}
        canApprove={canApprove}
        canCorrect={canCreate}
        onOpenChange={(open) => !open && setSelectedUid(undefined)}
      />
    </PageContainer>
  )
}

function ClassificationTable({
  result,
  search,
  navigate,
  siteOptions,
  productionSectionOptions,
  classificationOptions,
  canApprove,
  bulkSite,
  onOpen,
}: {
  result: ReturnType<typeof useAttendanceClassifications>
  search: Record<string, unknown>
  navigate: NavigateFn
  siteOptions: { value: string; label: string }[]
  productionSectionOptions: { value: string; label: string }[]
  classificationOptions: {
    value: AttendanceClassificationType
    label: string
  }[]
  canApprove: boolean
  bulkSite?: AttendanceSiteCode
  onOpen: (item: AttendanceClassification) => void
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [bulkOpen, setBulkOpen] = useState(false)
  const pageItemKey = (result.data?.items ?? [])
    .map((item) => item.uid)
    .join('|')
  const selectionScopeKey = JSON.stringify([
    search.filter,
    search.site,
    search.employeeTypeFilter,
    search.productionSection,
    search.classificationType,
    search.approvalStatus,
    search.dateFrom,
    search.dateTo,
    search.page,
    search.pageSize,
    pageItemKey,
  ])
  useEffect(() => setRowSelection({}), [selectionScopeKey])
  const columns = useMemo<ColumnDef<AttendanceClassification>[]>(
    () => [
      ...(canApprove && bulkSite
        ? [
            {
              id: 'select',
              header: ({ table }) => {
                const eligible = table
                  .getRowModel()
                  .rows.filter((row) => row.getCanSelect())
                  .slice(0, 50)
                const allSelected =
                  eligible.length > 0 &&
                  eligible.every((row) => row.getIsSelected())
                const someSelected = eligible.some((row) => row.getIsSelected())
                return (
                  <Checkbox
                    checked={allSelected || (someSelected && 'indeterminate')}
                    onCheckedChange={(checked) =>
                      eligible.forEach((row) => row.toggleSelected(!!checked))
                    }
                    aria-label='Pilih semua klasifikasi menunggu pada halaman ini, maksimal 50'
                  />
                )
              },
              cell: ({ row, table }) =>
                row.getCanSelect() ? (
                  <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(checked) => {
                      if (checked && tableSelectedCount(table) >= 50) {
                        toast.error(
                          'Maksimal 50 klasifikasi dapat dipilih sekali proses.'
                        )
                        return
                      }
                      row.toggleSelected(!!checked)
                    }}
                    aria-label={`Pilih klasifikasi ${row.original.employee.fullName}`}
                  />
                ) : null,
              enableSorting: false,
              enableHiding: false,
            } satisfies ColumnDef<AttendanceClassification>,
          ]
        : []),
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
            </p>
          </div>
        ),
      },
      { accessorKey: 'site', header: 'Site' },
      {
        id: 'employeeType',
        accessorFn: (item) => item.employee.employeeType,
        header: 'Jenis karyawan',
      },
      {
        id: 'productionSection',
        accessorFn: (item) => item.employee.productionSectionUid,
        header: 'Bagian produksi',
      },
      {
        accessorKey: 'classificationType',
        header: 'Klasifikasi',
        cell: ({ row }) => classificationLabel(row.original.classificationType),
      },
      {
        id: 'period',
        header: 'Tanggal',
        cell: ({ row }) =>
          periodLabel(row.original.startDate, row.original.endDate),
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
            label='Lihat detail'
            onClick={() => onOpen(row.original)}
          >
            <Eye />
          </DataTableActionButton>
        ),
      },
    ],
    [bulkSite, canApprove, onOpen]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
      {
        columnId: 'employeeType',
        searchKey: 'employeeTypeFilter',
        type: 'array',
      },
      {
        columnId: 'productionSection',
        searchKey: 'productionSection',
        type: 'array',
      },
      {
        columnId: 'classificationType',
        searchKey: 'classificationType',
        type: 'array',
      },
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
      rowSelection,
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
    onRowSelectionChange: setRowSelection,
    enableRowSelection: (row) =>
      canApprove &&
      Boolean(bulkSite) &&
      row.original.approvalStatus === 'PENDING',
    getRowId: (row) => row.uid,
    getCoreRowModel: getCoreRowModel(),
    initialState: {
      columnVisibility: {
        site: false,
        employeeType: false,
        productionSection: false,
      },
    },
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
            columnId: 'employeeType',
            title: 'Jenis karyawan',
            options: attendanceEmployeeTypeOptions,
          },
          {
            columnId: 'productionSection',
            title: 'Bagian produksi',
            options: productionSectionOptions,
          },
          {
            columnId: 'classificationType',
            title: 'Klasifikasi',
            options: classificationOptions,
          },
          {
            columnId: 'approvalStatus',
            title: 'Status approval',
            options: approvalStatusOptions,
          },
        ]}
      />
      {canApprove && !bulkSite && (
        <p className='text-sm text-muted-foreground'>
          Pilih tepat satu site untuk menggunakan approval massal.
        </p>
      )}
      {bulkSite && (
        <DataTableBulkActions
          table={table}
          entityName='klasifikasi'
          entityNamePlural='klasifikasi'
        >
          <Button size='sm' className='h-8' onClick={() => setBulkOpen(true)}>
            <Check /> Approve terpilih
          </Button>
        </DataTableBulkActions>
      )}
      {result.isPending ? (
        <StateText>Memuat klasifikasi attendance...</StateText>
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
        <StateText>Belum ada klasifikasi attendance pada filter ini.</StateText>
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
              <div
                key={item.uid}
                className='space-y-2 rounded-lg border p-3 text-left'
              >
                <div className='flex items-start justify-between gap-2'>
                  <div className='flex min-w-0 items-start gap-3'>
                    {canApprove &&
                      bulkSite &&
                      item.approvalStatus === 'PENDING' && (
                        <Checkbox
                          checked={table.getRow(item.uid).getIsSelected()}
                          onCheckedChange={(checked) => {
                            const row = table.getRow(item.uid)
                            if (checked && tableSelectedCount(table) >= 50) {
                              toast.error(
                                'Maksimal 50 klasifikasi dapat dipilih sekali proses.'
                              )
                              return
                            }
                            row.toggleSelected(!!checked)
                          }}
                          aria-label={`Pilih klasifikasi ${item.employee.fullName}`}
                        />
                      )}
                    <button
                      type='button'
                      className='min-w-0 text-left'
                      onClick={() => onOpen(item)}
                    >
                      <p className='font-medium'>{item.employee.fullName}</p>
                      <p className='text-xs text-muted-foreground'>
                        {item.employee.employeeNumber} · {item.site}
                      </p>
                    </button>
                  </div>
                  <ApprovalBadge value={item.approvalStatus} />
                </div>
                <button
                  type='button'
                  className='block w-full text-left'
                  onClick={() => onOpen(item)}
                >
                  <p className='text-sm'>
                    {classificationLabel(item.classificationType)} ·{' '}
                    {periodLabel(item.startDate, item.endDate)}
                  </p>
                  <p className='line-clamp-2 text-xs text-muted-foreground'>
                    {item.reason}
                  </p>
                </button>
              </div>
            ))}
          </div>
          <DataTablePagination
            table={table}
            summary={paginationSummary(data.page, data.pageSize, data.total)}
          />
        </>
      )}
      {bulkSite && (
        <BulkClassificationApprovalDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          site={bulkSite}
          items={table
            .getFilteredSelectedRowModel()
            .rows.map((row) => row.original)}
          onFinished={() => table.resetRowSelection()}
        />
      )}
    </div>
  )
}

function BulkClassificationApprovalDialog({
  open,
  onOpenChange,
  site,
  items,
  onFinished,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  site: AttendanceSiteCode
  items: AttendanceClassification[]
  onFinished: () => void
}) {
  const mutation = useBulkReviewAttendanceClassifications()
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<AttendanceBulkReviewResult>()
  const dates = items.flatMap((item) => [item.startDate, item.endDate]).sort()
  const close = () => {
    onOpenChange(false)
    setResult(undefined)
    setNotes('')
  }
  const submit = () => {
    mutation.mutate(
      {
        site,
        uids: items.map((item) => item.uid),
        decision: 'APPROVED',
        reviewNotes: notes.trim() || undefined,
      },
      {
        onSuccess: (response) => {
          onFinished()
          setResult(response)
          if (response.failed) {
            toast.warning(
              `${response.approved} berhasil disetujui, ${response.failed} gagal dan tetap menunggu.`
            )
          } else {
            toast.success(
              `${response.approved} klasifikasi berhasil disetujui.`
            )
          }
        },
        onError: (error) =>
          toast.error(
            apiError(error, 'Approval massal klasifikasi gagal diproses.')
          ),
      }
    )
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return
        if (next) onOpenChange(true)
        else close()
      }}
    >
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {result
              ? 'Hasil approval klasifikasi'
              : `Setujui ${items.length} klasifikasi?`}
          </DialogTitle>
          <DialogDescription>
            {result
              ? `${result.approved} berhasil, ${result.failed} gagal dari ${result.requested} data.`
              : 'Approval akan menerapkan klasifikasi pada tanggal kerja yang masih valid.'}
          </DialogDescription>
        </DialogHeader>
        {result ? (
          result.failures.length > 0 && (
            <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm'>
              <p className='font-medium'>Data gagal dan tetap menunggu</p>
              <ul className='mt-2 max-h-48 space-y-1 overflow-y-auto text-muted-foreground'>
                {result.failures.map((failure) => (
                  <li key={failure.uid}>• {failure.message}</li>
                ))}
              </ul>
            </div>
          )
        ) : (
          <div className='space-y-4'>
            <div className='grid gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-2'>
              <Field label='Site'>{siteLabel(site)}</Field>
              <Field label='Rentang tanggal'>{dateRangeLabel(dates)}</Field>
            </div>
            <div className='grid gap-2'>
              <Label htmlFor='bulk-classification-notes'>
                Catatan review (opsional)
              </Label>
              <Textarea
                id='bulk-classification-notes'
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder='Catatan yang berlaku untuk seluruh approval ini.'
              />
            </div>
          </div>
        )}
        <DialogFooter>
          {result ? (
            <Button onClick={close}>Tutup</Button>
          ) : (
            <>
              <Button
                variant='outline'
                onClick={close}
                disabled={mutation.isPending}
              >
                Periksa kembali
              </Button>
              <Button
                onClick={submit}
                disabled={
                  mutation.isPending || !items.length || items.length > 50
                }
              >
                {mutation.isPending ? (
                  <LoaderCircle className='animate-spin' />
                ) : (
                  <Check />
                )}
                Setujui {items.length} data
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CreateClassificationDialog({
  open,
  onOpenChange,
  siteOptions,
  classificationOptions,
  initialEmployeeUid,
  initialEmployeeName,
  initialEmployeeNumber,
  initialEmployeeSite,
  initialEmployeeType,
  initialDate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  siteOptions: { value: string; label: string }[]
  classificationOptions: {
    value: AttendanceClassificationType
    label: string
  }[]
  initialEmployeeUid?: string
  initialEmployeeName?: string
  initialEmployeeNumber?: string
  initialEmployeeSite?: AttendanceSiteCode
  initialEmployeeType?: AttendanceClassificationEmployee['employeeType']
  initialDate?: string
}) {
  const create = useCreateAttendanceClassification()
  const [employee, setEmployee] = useState<
    AttendanceClassificationEmployee | undefined
  >(() =>
    initialEmployeeUid &&
    initialEmployeeName &&
    initialEmployeeNumber &&
    initialEmployeeSite &&
    initialEmployeeType
      ? {
          uid: initialEmployeeUid,
          fullName: initialEmployeeName,
          employeeNumber: initialEmployeeNumber,
          site: initialEmployeeSite,
          employeeType: initialEmployeeType,
        }
      : undefined
  )
  const [employeeUid, setEmployeeUid] = useState(initialEmployeeUid ?? '')
  const [startDate, setStartDate] = useState(initialDate ?? today())
  const [endDate, setEndDate] = useState(initialDate ?? today())
  const [type, setType] = useState<AttendanceClassificationType>('LEAVE')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState<File>()
  const [uploading, setUploading] = useState(false)
  const valid =
    employeeUid &&
    startDate &&
    endDate >= startDate &&
    reason.trim().length >= 5 &&
    (!file || file.size <= 10 * 1024 * 1024)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!valid) return
    try {
      setUploading(Boolean(file))
      const attachment = file
        ? await uploadAttendanceClassificationAttachment(file)
        : undefined
      await create.mutateAsync({
        employeeUid,
        startDate,
        endDate,
        classificationType: type,
        reason: reason.trim(),
        fileUid: attachment?.uid,
      })
      toast.success('Klasifikasi attendance berhasil diajukan.')
      onOpenChange(false)
    } catch (error) {
      toast.error(apiError(error, 'Klasifikasi attendance gagal diajukan.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Ajukan Klasifikasi Attendance</DialogTitle>
          <DialogDescription>
            Hari libur kalender dalam rentang akan dilewati otomatis saat
            disetujui.
          </DialogDescription>
        </DialogHeader>
        <form id='classification-form' className='grid gap-4' onSubmit={submit}>
          <EmployeePicker
            value={employeeUid}
            selected={employee}
            onChange={(item) => {
              setEmployee(item)
              setEmployeeUid(item.uid)
            }}
            siteOptions={siteOptions}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <Field label='Tanggal mulai'>
              <DatePicker
                selected={dateOnlyFromInput(startDate)}
                onSelect={(date) => {
                  const next = dateOnlyToInput(date)
                  if (!next) return
                  setStartDate(next)
                  if (endDate < next) setEndDate(next)
                }}
              />
            </Field>
            <Field label='Tanggal selesai'>
              <DatePicker
                selected={dateOnlyFromInput(endDate)}
                onSelect={(date) => {
                  const next = dateOnlyToInput(date)
                  if (next) setEndDate(next)
                }}
                disabledDates={(date) => {
                  const minimum = dateOnlyFromInput(startDate)
                  return Boolean(minimum && date < minimum)
                }}
              />
            </Field>
          </div>
          <Field label='Klasifikasi'>
            <Select
              value={type}
              onValueChange={(value: AttendanceClassificationType) =>
                setType(value)
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {classificationOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className='grid gap-1.5'>
            <Label htmlFor='classification-reason'>Alasan</Label>
            <Textarea
              id='classification-reason'
              value={reason}
              maxLength={500}
              placeholder='Jelaskan alasan cuti, sakit, atau izin.'
              onChange={(event) => setReason(event.target.value)}
              required
            />
            <p className='text-xs text-muted-foreground'>Minimal 5 karakter.</p>
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='classification-file'>Lampiran (opsional)</Label>
            <Input
              id='classification-file'
              type='file'
              accept='.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp'
              onChange={(event) => setFile(event.target.files?.[0])}
            />
            <p className='text-xs text-muted-foreground'>
              PDF atau gambar JPG, PNG, WEBP. Maksimal 10 MB.
            </p>
            {file && file.size > 10 * 1024 * 1024 && (
              <p className='text-sm text-destructive'>
                Ukuran lampiran melebihi 10 MB.
              </p>
            )}
          </div>
        </form>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={uploading || create.isPending}
          >
            Batal
          </Button>
          <Button
            type='submit'
            form='classification-form'
            disabled={!valid || uploading || create.isPending}
          >
            {(uploading || create.isPending) && (
              <LoaderCircle className='animate-spin' />
            )}
            Ajukan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmployeePicker({
  value,
  selected,
  onChange,
  siteOptions,
}: {
  value: string
  selected?: AttendanceClassificationEmployee
  onChange: (item: AttendanceClassificationEmployee) => void
  siteOptions: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [site, setSite] = useState<AttendanceSiteCode | 'ALL'>('ALL')
  const employees = useAttendanceClassificationEmployees(
    {
      query: query.trim() || undefined,
      site: site === 'ALL' ? undefined : site,
      page: 1,
      pageSize: 20,
    },
    open
  )
  return (
    <div className='grid gap-1.5'>
      <Label>Karyawan</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='outline'
            role='combobox'
            aria-expanded={open}
            className='justify-between font-normal'
          >
            {selected
              ? `${selected.fullName} · ${selected.employeeNumber}`
              : value
                ? 'Karyawan terpilih'
                : 'Pilih karyawan'}
            <ChevronsUpDown className='opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align='start'
          className='w-[min(32rem,calc(100vw-2rem))] p-0'
        >
          <div className='border-b p-2'>
            <Select
              value={site}
              onValueChange={(next) =>
                setSite(next as AttendanceSiteCode | 'ALL')
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Semua site' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ALL'>Semua site</SelectItem>
                {siteOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Command shouldFilter={false}>
            <CommandInput
              placeholder='Cari nama atau nomor karyawan...'
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              <CommandEmpty>
                {employees.isPending
                  ? 'Mencari...'
                  : 'Karyawan tidak ditemukan.'}
              </CommandEmpty>
              <CommandGroup>
                {(employees.data?.items ?? []).map((item) => (
                  <CommandItem
                    key={item.uid}
                    value={item.uid}
                    onSelect={() => {
                      onChange(item)
                      setOpen(false)
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2',
                        value === item.uid ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div>
                      <p>
                        {item.fullName} · {item.employeeNumber}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {item.site} · {item.shiftName ?? 'Shift belum diatur'}
                      </p>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function ClassificationDetailDialog({
  uid,
  open,
  canApprove,
  canCorrect,
  onOpenChange,
}: {
  uid?: string
  open: boolean
  canApprove: boolean
  canCorrect: boolean
  onOpenChange: (open: boolean) => void
}) {
  const detail = useAttendanceClassification(uid)
  const review = useReviewAttendanceClassification()
  const cancel = useCancelAttendanceClassification()
  const reverse = useReverseAttendanceClassification()
  const [notes, setNotes] = useState('')
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [reverseOpen, setReverseOpen] = useState(false)
  const [reverseReason, setReverseReason] = useState('')
  const item = detail.data
  const submit = (decision: 'APPROVED' | 'REJECTED') => {
    if (!uid) return
    if (decision === 'REJECTED' && !notes.trim()) {
      toast.error('Alasan penolakan wajib diisi.')
      return
    }
    review.mutate(
      { uid, input: { decision, reviewNotes: notes.trim() || undefined } },
      {
        onSuccess: (result) => {
          toast.success(
            decision === 'APPROVED'
              ? `Klasifikasi disetujui. ${result.appliedCount} hari diterapkan, ${result.skippedCount} hari nonkerja dilewati.`
              : 'Klasifikasi attendance ditolak.'
          )
          onOpenChange(false)
        },
        onError: (error) =>
          toast.error(apiError(error, 'Review klasifikasi gagal diproses.')),
      }
    )
  }
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl'>
          <DialogHeader>
            <DialogTitle>Detail Klasifikasi Attendance</DialogTitle>
            <DialogDescription>
              Rincian pengajuan, tanggal yang diterapkan, dan hari nonkerja yang
              dilewati.
            </DialogDescription>
          </DialogHeader>
          {detail.isPending ? (
            <StateText>Memuat detail klasifikasi...</StateText>
          ) : detail.isError || !item ? (
            <StateText>Detail klasifikasi gagal dimuat.</StateText>
          ) : (
            <div className='grid gap-4'>
              <div className='grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3'>
                <Detail
                  label='Karyawan'
                  value={`${item.employee.fullName} · ${item.employee.employeeNumber}`}
                />
                <Detail
                  label='Klasifikasi'
                  value={classificationLabel(item.classificationType)}
                />
                <Detail
                  label='Status'
                  value={<ApprovalBadge value={item.approvalStatus} />}
                />
                <Detail
                  label='Tanggal'
                  value={periodLabel(item.startDate, item.endDate)}
                />
                <Detail label='Site' value={item.site} />
                <Detail
                  label='Hasil'
                  value={
                    item.reversedCount > 0
                      ? `${item.reversedCount} dibatalkan · ${item.skippedCount} dilewati`
                      : `${item.appliedCount} diterapkan · ${item.skippedCount} dilewati`
                  }
                />
              </div>
              <div className='rounded-lg border p-3 text-sm'>
                <p className='text-xs text-muted-foreground'>
                  Alasan pengajuan
                </p>
                <p className='mt-1 whitespace-pre-wrap'>{item.reason}</p>
                <p className='mt-2 text-xs text-muted-foreground'>
                  Diajukan {item.requestedByName} ·{' '}
                  {dateTimeLabel(item.requestedAt)}
                </p>
              </div>
              {item.attachment?.url && (
                <Button variant='outline' className='w-fit' asChild>
                  <a
                    href={item.attachment.url}
                    target='_blank'
                    rel='noreferrer'
                  >
                    <FileText /> Buka lampiran
                  </a>
                </Button>
              )}
              {item.reviewedAt && (
                <div className='rounded-lg bg-muted p-3 text-sm'>
                  <p className='font-medium'>
                    Review {item.reviewedByName ?? '-'}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {dateTimeLabel(item.reviewedAt)}
                  </p>
                  {item.reviewNotes && (
                    <p className='mt-2 whitespace-pre-wrap'>
                      {item.reviewNotes}
                    </p>
                  )}
                </div>
              )}
              <div>
                <p className='mb-2 text-sm font-medium'>Rincian tanggal</p>
                <div className='max-h-60 overflow-auto rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tanggal</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead>Hasil</TableHead>
                        <TableHead>Catatan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {item.details.map((row) => (
                        <TableRow key={row.uid}>
                          <TableCell>{dateLabel(row.businessDate)}</TableCell>
                          <TableCell>{row.shiftName ?? '-'}</TableCell>
                          <TableCell>
                            <OutcomeBadge value={row.outcome} />
                          </TableCell>
                          <TableCell>{row.notes ?? '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
              {canApprove && item.approvalStatus === 'PENDING' && (
                <div className='grid gap-2'>
                  <Label htmlFor='classification-review-notes'>
                    Catatan review (opsional untuk approval)
                  </Label>
                  <Textarea
                    id='classification-review-notes'
                    value={notes}
                    placeholder='Isi alasan bila pengajuan ditolak.'
                    onChange={(event) => setNotes(event.target.value)}
                  />
                  <p className='text-xs text-muted-foreground'>
                    HR dapat menyetujui pengajuan sendiri. Hari libur kalender
                    tidak dibuat sebagai attendance.
                  </p>
                  <div className='flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
                    <Button
                      variant='destructive'
                      disabled={review.isPending}
                      onClick={() => submit('REJECTED')}
                    >
                      <X /> Tolak
                    </Button>
                    <Button
                      disabled={review.isPending}
                      onClick={() => submit('APPROVED')}
                    >
                      <Check /> Setujui & terapkan
                    </Button>
                  </div>
                </div>
              )}
              {canCorrect && item.approvalStatus === 'PENDING' && (
                <div className='flex justify-start border-t pt-4'>
                  <Button
                    variant='ghost'
                    className='text-destructive hover:text-destructive'
                    disabled={cancel.isPending}
                    onClick={() => setCancelConfirmOpen(true)}
                  >
                    <X /> Batalkan pengajuan
                  </Button>
                </div>
              )}
              {canReverseAttendanceClassification(
                item.approvalStatus,
                canApprove
              ) && (
                <div className='flex justify-start border-t pt-4'>
                  <Button
                    variant='outline'
                    className='text-destructive hover:text-destructive'
                    disabled={reverse.isPending}
                    onClick={() => setReverseOpen(true)}
                  >
                    <RefreshCcw /> Batalkan klasifikasi
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={reverseOpen}
        onOpenChange={(nextOpen) => {
          if (reverse.isPending) return
          setReverseOpen(nextOpen)
          if (!nextOpen) setReverseReason('')
        }}
      >
        <DialogContent className='sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>Batalkan klasifikasi attendance?</DialogTitle>
            <DialogDescription>
              Tanggal kerja yang sudah diterapkan akan dikembalikan menjadi
              Alpha dan perlu difinalisasi ulang. Hari nonkerja yang sebelumnya
              dilewati tidak berubah, dan riwayat pengajuan tetap tersimpan
              untuk audit.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-2'>
            <Label htmlFor='classification-reverse-reason'>
              Alasan pembatalan
            </Label>
            <Textarea
              id='classification-reverse-reason'
              value={reverseReason}
              minLength={10}
              maxLength={500}
              rows={4}
              autoFocus
              disabled={reverse.isPending}
              placeholder='Contoh: Karyawan ternyata hadir dan pengajuan cuti salah input.'
              onChange={(event) => setReverseReason(event.target.value)}
            />
            <p className='text-xs text-muted-foreground'>
              Minimal 10 karakter · {reverseReason.trim().length}/500
            </p>
          </div>
          <DialogFooter className='gap-2 sm:gap-0'>
            <Button
              variant='outline'
              disabled={reverse.isPending}
              onClick={() => setReverseOpen(false)}
            >
              Kembali
            </Button>
            <Button
              variant='destructive'
              disabled={
                reverse.isPending ||
                Boolean(
                  attendanceClassificationReverseReasonError(reverseReason)
                )
              }
              onClick={() => {
                if (!uid) return
                const reason = reverseReason.trim()
                const reasonError =
                  attendanceClassificationReverseReasonError(reason)
                if (reasonError) {
                  toast.error(reasonError)
                  return
                }
                reverse.mutate(
                  { uid, input: { reason } },
                  {
                    onSuccess: (result) => {
                      toast.success(
                        `Klasifikasi dibatalkan. ${result.reversedCount} tanggal dikembalikan.`
                      )
                      setReverseOpen(false)
                      setReverseReason('')
                      onOpenChange(false)
                    },
                    onError: (error) =>
                      toast.error(
                        apiError(error, 'Klasifikasi gagal dibatalkan.')
                      ),
                  }
                )
              }}
            >
              {reverse.isPending ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <RefreshCcw />
              )}
              Batalkan klasifikasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        title='Batalkan pengajuan klasifikasi?'
        desc='Pengajuan yang dibatalkan tidak dapat direview atau diterapkan.'
        cancelBtnText='Kembali'
        confirmText='Batalkan pengajuan'
        destructive
        isLoading={cancel.isPending}
        handleConfirm={() => {
          if (!uid) return
          cancel.mutate(uid, {
            onSuccess: () => {
              toast.success('Pengajuan klasifikasi dibatalkan.')
              setCancelConfirmOpen(false)
              onOpenChange(false)
            },
            onError: (error) =>
              toast.error(
                apiError(error, 'Pengajuan klasifikasi gagal dibatalkan.')
              ),
          })
        }}
      />
    </>
  )
}

function ApprovalBadge({
  value,
}: {
  value: AttendanceClassificationApprovalStatus
}) {
  const label =
    approvalStatusOptions.find((item) => item.value === value)?.label ?? value
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
    >
      {label}
    </Badge>
  )
}

function OutcomeBadge({
  value,
}: {
  value: AttendanceClassificationDetailOutcome
}) {
  return (
    <Badge
      variant={
        value === 'APPLIED'
          ? 'default'
          : value === 'REVERSED'
            ? 'secondary'
            : value === 'PENDING'
              ? 'outline'
              : 'secondary'
      }
    >
      {value === 'APPLIED'
        ? 'Diterapkan'
        : value === 'REVERSED'
          ? 'Dibatalkan'
          : value === 'PENDING'
            ? 'Menunggu'
            : value === 'SKIPPED_HOLIDAY'
              ? 'Dilewati · hari libur'
              : 'Dilewati · tidak ada jadwal'}
    </Badge>
  )
}

function DateFilter({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className='grid gap-1 text-sm'>
      <span className='font-medium'>{label}</span>
      <DatePicker
        selected={dateOnlyFromInput(value)}
        placeholder='Semua tanggal'
        onSelect={(date) => onChange(dateOnlyToInput(date))}
      />
    </label>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className='grid gap-1.5 text-sm'>
      <span className='font-medium'>{label}</span>
      {children}
    </label>
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

function StateText({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex min-h-40 items-center justify-center gap-2 text-center text-sm text-muted-foreground'>
      {children}
    </div>
  )
}

const classificationTypeOptions = [
  { value: 'LEAVE', label: 'Cuti' },
  { value: 'SICK', label: 'Sakit' },
  { value: 'PERMISSION', label: 'Izin' },
] satisfies { value: AttendanceClassificationType; label: string }[]

const approvalStatusOptions = [
  { value: 'PENDING', label: 'Menunggu' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'REJECTED', label: 'Ditolak' },
  { value: 'CANCELLED', label: 'Dibatalkan' },
] satisfies { value: AttendanceClassificationApprovalStatus; label: string }[]

function classificationLabel(value: AttendanceClassificationType) {
  return (
    classificationTypeOptions.find((item) => item.value === value)?.label ??
    value
  )
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(
    new Date(`${value}T00:00:00`)
  )
}

function periodLabel(startDate: string, endDate: string) {
  return startDate === endDate
    ? dateLabel(startDate)
    : `${dateLabel(startDate)} – ${dateLabel(endDate)}`
}

function dateTimeLabel(value?: string | null) {
  return value
    ? new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '-'
}

function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(
    new Date()
  )
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

function tableSelectedCount<T>(table: TanStackTable<T>) {
  return table.getFilteredSelectedRowModel().rows.length
}

function siteLabel(site: AttendanceSiteCode) {
  return site[0] + site.slice(1).toLowerCase()
}

function dateRangeLabel(dates: string[]) {
  if (!dates.length) return '-'
  return dates[0] === dates[dates.length - 1]
    ? dateLabel(dates[0])
    : `${dateLabel(dates[0])}–${dateLabel(dates[dates.length - 1])}`
}

function apiError(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
