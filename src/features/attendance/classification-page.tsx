import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
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
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import {
  uploadAttendanceClassificationAttachment,
  useCancelAttendanceClassification,
  useAttendanceClassification,
  useAttendanceClassificationEmployees,
  useAttendanceClassifications,
  useAttendanceFoundation,
  useCreateAttendanceClassification,
  useReviewAttendanceClassification,
} from './data/queries'
import type {
  AttendanceClassification,
  AttendanceClassificationApprovalStatus,
  AttendanceClassificationEmployee,
  AttendanceClassificationType,
  AttendanceSiteCode,
} from './domain'

export function AttendanceClassificationPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
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

  return (
    <Main>
      <div className='mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <p className='text-sm font-medium text-primary'>Attendance</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Klasifikasi Attendance
          </h1>
          <p className='text-sm text-muted-foreground'>
            Ajukan dan setujui cuti, sakit, atau izin untuk satu tanggal maupun
            rentang tanggal.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus /> Ajukan klasifikasi
          </Button>
        )}
      </div>

      <div className='mb-4 grid gap-3 sm:grid-cols-2 sm:justify-end lg:ml-auto lg:max-w-md'>
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

      <ClassificationTable
        result={result}
        search={search}
        navigate={navigate}
        siteOptions={siteOptions}
        classificationOptions={classificationOptions}
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
    </Main>
  )
}

function ClassificationTable({
  result,
  search,
  navigate,
  siteOptions,
  classificationOptions,
  onOpen,
}: {
  result: ReturnType<typeof useAttendanceClassifications>
  search: Record<string, unknown>
  navigate: NavigateFn
  siteOptions: { value: string; label: string }[]
  classificationOptions: {
    value: AttendanceClassificationType
    label: string
  }[]
  onOpen: (item: AttendanceClassification) => void
}) {
  const columns = useMemo<ColumnDef<AttendanceClassification>[]>(
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
            </p>
          </div>
        ),
      },
      { accessorKey: 'site', header: 'Site' },
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
    [onOpen]
  )
  const url = useTableUrlState({
    search,
    navigate,
    globalFilter: { key: 'filter' },
    columnFilters: [
      { columnId: 'site', searchKey: 'site', type: 'array' },
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
        searchPlaceholder='Cari nama atau nomor karyawan...'
        searchDebounceMs={500}
        filters={[
          { columnId: 'site', title: 'Site', options: siteOptions },
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
              <button
                key={item.uid}
                type='button'
                className='space-y-2 rounded-lg border p-3 text-left'
                onClick={() => onOpen(item)}
              >
                <div className='flex items-start justify-between gap-2'>
                  <div>
                    <p className='font-medium'>{item.employee.fullName}</p>
                    <p className='text-xs text-muted-foreground'>
                      {item.employee.employeeNumber} · {item.site}
                    </p>
                  </div>
                  <ApprovalBadge value={item.approvalStatus} />
                </div>
                <p className='text-sm'>
                  {classificationLabel(item.classificationType)} ·{' '}
                  {periodLabel(item.startDate, item.endDate)}
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
            Hari nonkerja dalam rentang akan dilewati otomatis saat disetujui.
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
              <Input
                type='date'
                value={startDate}
                onChange={(event) => {
                  const next = event.target.value
                  setStartDate(next)
                  if (endDate < next) setEndDate(next)
                }}
                required
              />
            </Field>
            <Field label='Tanggal selesai'>
              <Input
                type='date'
                value={endDate}
                min={startDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
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
  const [notes, setNotes] = useState('')
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
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
                  value={`${item.appliedCount} diterapkan · ${item.skippedCount} dilewati`}
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
                    HR dapat menyetujui pengajuan sendiri. Hari nonkerja tidak
                    dibuat sebagai attendance.
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
            </div>
          )}
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
  value: 'PENDING' | 'APPLIED' | 'SKIPPED_NON_WORKDAY'
}) {
  return (
    <Badge
      variant={
        value === 'APPLIED'
          ? 'default'
          : value === 'PENDING'
            ? 'outline'
            : 'secondary'
      }
    >
      {value === 'APPLIED'
        ? 'Diterapkan'
        : value === 'PENDING'
          ? 'Menunggu'
          : 'Hari nonkerja'}
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
      <Input
        type='date'
        value={value}
        onChange={(event) => onChange(event.target.value)}
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

function apiError(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
