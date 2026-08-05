import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table'
import {
  Download,
  Eye,
  ExternalLink,
  FilePlus2,
  FileText,
  ImageIcon,
  Pencil,
  Printer,
  RefreshCcw,
  ScrollText,
} from 'lucide-react'
import { toast } from 'sonner'
import { currentListReturnTo } from '@/lib/list-return-to'
import { apiClient } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useTableUrlState, type NavigateFn } from '@/hooks/use-table-url-state'
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
  DataTableBulkActions,
  DataTableColumnHeader,
  DataTablePagination,
  DataTableToolbar,
} from '@/components/data-table'
import type { EmployeeContract, PaginatedResult } from '../domain'
import {
  contractStatusBadgeClassName,
  contractStatusBadgeVariant,
  statusLabel,
} from '../utils'
import { ContractLifecycleActionButtons } from './contract-lifecycle-action-buttons'

export type EmployeeRecordRow = {
  uid: string
  employeeUid: string
  title: string
  employee: string
  site: string
  employeeType?: string
  position?: string
  productionModule?: string
  productionSection?: string
  status: string
  detail: string
  expiry?: string
  coverage?: string
  contract?: EmployeeContract
}

export function RecordsTable({
  data,
  search,
  navigate,
  prefix,
  statuses,
  onEdit,
  canEdit = () => true,
  onView,
  onExtendContract,
  productionModuleOptions = [],
  productionSectionOptions = [],
  isPending,
  isError,
  onRetry,
}: {
  data: PaginatedResult<EmployeeRecordRow>
  search: Record<string, unknown>
  navigate: NavigateFn
  prefix: 'contract' | 'document'
  statuses: string[]
  onEdit: (uid: string) => void
  canEdit?: (row: EmployeeRecordRow) => boolean
  onView?: (row: EmployeeRecordRow) => void
  onExtendContract?: (contract: EmployeeContract) => void
  productionModuleOptions?: { value: string; label: string }[]
  productionSectionOptions?: { value: string; label: string }[]
  isPending: boolean
  isError: boolean
  onRetry: () => void
}) {
  const returnTo = currentListReturnTo()
  const routerNavigate = useNavigate()
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [previewContract, setPreviewContract] = useState<EmployeeContract>()
  const [isBulkPrintPending, setBulkPrintPending] = useState(false)
  const url = useTableUrlState({
    search,
    navigate,
    pagination: { pageKey: `${prefix}Page`, pageSizeKey: `${prefix}PageSize` },
    globalFilter: { key: `${prefix}Filter` },
    columnFilters: [
      { columnId: 'site', searchKey: `${prefix}Site`, type: 'array' },
      { columnId: 'status', searchKey: `${prefix}Status`, type: 'array' },
      ...(prefix === 'contract'
        ? [
            {
              columnId: 'coverage',
              searchKey: 'contractCoverage',
              type: 'array' as const,
            },
            {
              columnId: 'productionModule',
              searchKey: 'contractProductionModule',
              type: 'array' as const,
            },
            {
              columnId: 'productionSection',
              searchKey: 'contractProductionSection',
              type: 'array' as const,
            },
          ]
        : []),
    ],
  })
  const columns: ColumnDef<EmployeeRecordRow>[] = [
    ...(prefix === 'contract'
      ? [
          {
            id: 'select',
            header: ({ table }) => (
              <Checkbox
                checked={
                  table.getIsAllPageRowsSelected() ||
                  (table.getIsSomePageRowsSelected() && 'indeterminate')
                }
                onCheckedChange={(value) =>
                  table.toggleAllPageRowsSelected(!!value)
                }
                aria-label='Pilih semua kontrak di halaman ini'
                className='translate-y-0.5'
              />
            ),
            cell: ({ row }) => (
              <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label={`Pilih kontrak ${row.original.title}`}
                className='translate-y-0.5'
              />
            ),
            enableSorting: false,
            enableHiding: false,
            meta: {
              className: 'w-9 px-2',
              tdClassName: 'w-9 px-2',
            },
          } satisfies ColumnDef<EmployeeRecordRow>,
          {
            id: 'productionModule',
            accessorFn: (row) => row.contract?.productionModule,
            enableHiding: false,
            filterFn: (row, id, value: string[]) =>
              value.includes(row.getValue(id)),
          } satisfies ColumnDef<EmployeeRecordRow>,
          {
            id: 'productionSection',
            accessorFn: (row) => row.contract?.productionSection,
            enableHiding: false,
            filterFn: (row, id, value: string[]) =>
              value.includes(row.getValue(id)),
          } satisfies ColumnDef<EmployeeRecordRow>,
        ]
      : []),
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={prefix === 'contract' ? 'Kontrak' : 'Dokumen'}
        />
      ),
      cell: ({ row }) => (
        <div>
          {prefix === 'contract' &&
          onView &&
          !row.original.contract?.isMissingContract ? (
            <Button
              type='button'
              variant='link'
              className='h-auto p-0 text-left font-medium'
              onClick={() => onView(row.original)}
            >
              {row.original.title}
            </Button>
          ) : (
            <p className='font-medium'>{row.original.title}</p>
          )}
          <p className='text-[11px] leading-3 text-muted-foreground'>
            {row.original.detail}
          </p>
        </div>
      ),
      meta: {
        label: prefix === 'contract' ? 'Kontrak' : 'Dokumen',
      },
    },
    {
      accessorKey: 'employee',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Karyawan' />
      ),
      cell: ({ row }) => (
        <div>
          <Link
            className='font-medium text-primary hover:underline'
            to='/karyawan/data-karyawan/$employeeUid'
            params={{ employeeUid: row.original.employeeUid }}
            search={{ returnTo }}
          >
            {row.original.employee}
          </Link>
          {prefix === 'contract' && (
            <p className='text-[11px] leading-3 text-muted-foreground'>
              {row.original.site || '-'}
            </p>
          )}
        </div>
      ),
      meta: {
        label: 'Karyawan',
      },
    },
    ...(prefix === 'contract'
      ? [
          {
            id: 'typePosition',
            header: ({ column }) => (
              <DataTableColumnHeader column={column} title='Jenis & Jabatan' />
            ),
            cell: ({ row }) => (
              <div>
                <p className='font-medium'>
                  {row.original.employeeType
                    ? statusLabel(row.original.employeeType)
                    : '-'}
                </p>
                <p className='text-[11px] leading-3 text-muted-foreground'>
                  {row.original.position || '-'}
                </p>
              </div>
            ),
            meta: {
              label: 'Jenis & Jabatan',
            },
          } satisfies ColumnDef<EmployeeRecordRow>,
          {
            id: 'productionArea',
            header: ({ column }) => (
              <DataTableColumnHeader column={column} title='Bagian Produksi' />
            ),
            cell: ({ row }) => (
              <div>
                <p className='font-medium'>
                  {row.original.productionModule || '-'}
                </p>
                <p className='text-[11px] leading-3 text-muted-foreground'>
                  {row.original.productionSection || '-'}
                </p>
              </div>
            ),
            meta: {
              label: 'Bagian Produksi',
            },
          } satisfies ColumnDef<EmployeeRecordRow>,
        ]
      : []),
    {
      accessorKey: 'site',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Site' />
      ),
      enableHiding: prefix !== 'contract',
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      meta: {
        label: 'Site',
      },
    },
    {
      accessorKey: 'status',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => (
        <div className='flex gap-1'>
          <Badge
            variant={
              prefix === 'contract'
                ? contractStatusBadgeVariant(row.original.status)
                : 'secondary'
            }
            className={
              prefix === 'contract'
                ? contractStatusBadgeClassName(row.original.status)
                : undefined
            }
          >
            {statusLabel(row.original.status)}
          </Badge>
          {row.original.expiry && (
            <Badge variant='outline'>{row.original.expiry}</Badge>
          )}
        </div>
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
      meta: {
        label: 'Status',
      },
    },
    ...(prefix === 'contract'
      ? [
          {
            id: 'issuedFile',
            header: ({ column }) => (
              <DataTableColumnHeader column={column} title='Dokumen Kontrak' />
            ),
            cell: ({ row }) => {
              const file = row.original.contract?.issuedFile
              return (
                <Button
                  type='button'
                  variant='link'
                  className={cn(
                    'h-auto max-w-32 justify-start truncate px-0 text-left text-xs',
                    !file?.url && 'text-destructive hover:text-destructive/80'
                  )}
                  title={file?.originalName ?? 'Belum ada'}
                  onClick={() => setPreviewContract(row.original.contract)}
                >
                  <span className='block truncate'>
                    {file?.originalName ?? 'Belum ada'}
                  </span>
                </Button>
              )
            },
            enableSorting: false,
            meta: {
              label: 'Dokumen Kontrak',
              className: 'w-36 max-w-36',
              tdClassName: 'w-36 max-w-36',
            },
          } satisfies ColumnDef<EmployeeRecordRow>,
        ]
      : []),
    {
      id: 'coverage',
      accessorFn: (row) => row.coverage ?? 'NORMAL',
      enableHiding: false,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => (
        <div className='flex items-center gap-1'>
          {onView && !row.original.contract?.isMissingContract && (
            <DataTableActionButton
              onClick={() => onView(row.original)}
              label={`Lihat detail ${row.original.title}`}
            >
              <Eye />
            </DataTableActionButton>
          )}
          {canEdit(row.original) &&
            !row.original.contract?.isMissingContract && (
              <DataTableActionButton
                onClick={() => onEdit(row.original.uid)}
                label={`Ubah ${row.original.title}`}
              >
                <Pencil />
              </DataTableActionButton>
            )}
          {prefix === 'contract' &&
            row.original.contract?.isMissingContract &&
            onExtendContract && (
              <DataTableActionButton
                onClick={() => onExtendContract(row.original.contract!)}
                label={`Tambah kontrak untuk ${row.original.employee}`}
              >
                <FilePlus2 />
              </DataTableActionButton>
            )}
          {prefix === 'contract' &&
            (row.original.contract?.status === 'EXPIRED' ||
              row.original.contract?.isExpiringWithin7Days) &&
            row.original.contract.isLatestForEmployee &&
            onExtendContract && (
              <DataTableActionButton
                onClick={() => onExtendContract(row.original.contract!)}
                label={`Perpanjang kontrak ${row.original.title}`}
              >
                <FilePlus2 />
              </DataTableActionButton>
            )}
          {prefix === 'contract' && row.original.contract && (
            <ContractLifecycleActionButtons
              contract={row.original.contract}
              compact
            />
          )}
        </div>
      ),
    },
  ]
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data.items,
    columns,
    state: {
      sorting,
      globalFilter: url.globalFilter,
      columnFilters: url.columnFilters,
      pagination: url.pagination,
      columnVisibility: {
        coverage: false,
        ...(prefix === 'contract'
          ? { site: false, productionModule: false, productionSection: false }
          : {}),
      },
      rowSelection,
    },
    enableRowSelection: prefix === 'contract',
    getRowId: (row) => row.uid,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: url.onGlobalFilterChange,
    onColumnFiltersChange: url.onColumnFiltersChange,
    onPaginationChange: url.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualFiltering: true,
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(data.total / data.pageSize)),
  })
  return (
    <>
    <div className='space-y-4'>
      <DataTableToolbar
        table={table}
        searchPlaceholder={
          prefix === 'contract'
            ? 'Cari nama karyawan, nomor karyawan, atau nomor kontrak...'
            : 'Cari karyawan, nomor, atau dokumen...'
        }
        searchDebounceMs={300}
        filters={[
          {
            columnId: 'site',
            title: 'Site',
            options: ['JEPARA', 'SEMARANG', 'KLATEN'].map((value) => ({
              value,
              label: statusLabel(value),
            })),
          },
          {
            columnId: 'status',
            title: 'Status',
            options: statuses.map((value) => ({
              value,
              label: statusLabel(value),
            })),
          },
          ...(prefix === 'contract'
            ? [
                {
                  columnId: 'coverage',
                  title: 'Status kontrak aktif',
                  options: [
                    {
                      value: 'ACTIVE_WITHOUT_VALID_CONTRACT',
                      label: 'Perlu dibuatkan kontrak',
                    },
                    {
                      value: 'EXPIRING_WITHIN_7_DAYS',
                      label: 'Berakhir <= 7 hari',
                    },
                  ],
                },
                {
                  columnId: 'productionModule',
                  title: 'Modul Produksi',
                  options: productionModuleOptions,
                },
                {
                  columnId: 'productionSection',
                  title: 'Bagian Produksi',
                  options: productionSectionOptions,
                },
              ]
            : []),
        ]}
      />
      {prefix === 'contract' && (
        <DataTableBulkActions
          table={table}
          entityName='kontrak'
          entityNamePlural='kontrak'
        >
          <Button
            variant='outline'
            size='sm'
            className='h-8'
            disabled={isBulkPrintPending}
            onClick={async () => {
              const selectedRows = table.getFilteredSelectedRowModel().rows
              const contractUids = selectedRows
                .filter((row) => !row.original.contract?.isMissingContract)
                .map((row) => row.original.uid)
              if (!contractUids.length) return
              if (contractUids.length > 50) {
                toast.error('Bulk cetak maksimal 50 kontrak sekali proses.')
                return
              }
              const unsupported = selectedRows.filter((row) => {
                const contract = row.original.contract
                return !contract?.isMissingContract &&
                  (contract?.employeeType !== 'BORONGAN' ||
                    contract?.contractType !== 'PKWT')
              })
              if (unsupported.length) {
                toast.error('Cetak template hanya untuk karyawan Borongan dengan kontrak PKWT.')
                return
              }
              const popup = window.open('', '_blank')
              setBulkPrintPending(true)
              try {
                await apiClient.post('/employees/contracts/print-snapshots', {
                  contractUids,
                })
                const target = `/karyawan/pkwt/cetak-bulk?contractUids=${encodeURIComponent(contractUids.join(','))}`
                if (popup) popup.location.href = target
                else window.open(target, '_blank')
                table.resetRowSelection()
              } catch (error) {
                popup?.close()
                const message = (error as { response?: { data?: { message?: string } } }).response?.data?.message
                toast.error(message ?? 'Bulk preview PKWT gagal dibuat.')
              } finally {
                setBulkPrintPending(false)
              }
            }}
          >
            <Printer /> Cetak Template
          </Button>
          <Button
            variant='outline'
            size='sm'
            className='h-8'
            onClick={() => {
              const selectedRows = table.getFilteredSelectedRowModel().rows
              const employeeUids = [
                ...new Set(selectedRows.map((row) => row.original.employeeUid)),
              ]
              if (!employeeUids.length) return
              if (employeeUids.length > 25) {
                toast.error('Create multiple kontrak maksimal 25 karyawan.')
                return
              }
              routerNavigate({
                to: '/karyawan/pkwt/tambah-multiple',
                search: {
                  returnTo,
                  employeeUids: employeeUids.join(','),
                },
              })
            }}
          >
            <ScrollText /> Create Multiple Kontrak
          </Button>
        </DataTableBulkActions>
      )}
      {isPending ? (
        <p className='py-10 text-center text-muted-foreground'>
          Memuat data...
        </p>
      ) : isError ? (
        <div className='py-10 text-center'>
          <p>Data gagal dimuat.</p>
          <Button variant='outline' className='mt-3' onClick={onRetry}>
            <RefreshCcw /> Coba lagi
          </Button>
        </div>
      ) : table.getRowModel().rows.length === 0 ? (
        <div className='py-10 text-center text-muted-foreground'>
          <FileText className='mx-auto mb-2' />
          Tidak ada data yang sesuai filter.
        </div>
      ) : (
        <>
          <div className='overflow-x-auto rounded-md border'>
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((group) => (
                  <TableRow key={group.id}>
                    {group.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className={
                          header.column.columnDef.meta?.className as
                            | string
                            | undefined
                        }
                      >
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
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          cell.column.columnDef.meta?.className as
                            | string
                            | undefined,
                          cell.column.columnDef.meta?.tdClassName as
                            | string
                            | undefined
                        )}
                      >
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
          <DataTablePagination
            table={table}
            summary={
              <>
                Menampilkan{' '}
                {data.total ? (data.page - 1) * data.pageSize + 1 : 0}-
                {Math.min(data.page * data.pageSize, data.total)} dari{' '}
                {data.total} data.
              </>
            }
          />
        </>
      )}
    </div>
    {prefix === 'contract' && (
      <ContractFilePreviewDialog
        contract={previewContract}
        returnTo={returnTo}
        onOpenChange={(open) => {
          if (!open) setPreviewContract(undefined)
        }}
      />
    )}
    </>
  )
}

function ContractFilePreviewDialog({
  contract,
  returnTo,
  onOpenChange,
}: {
  contract?: EmployeeContract
  returnTo?: string
  onOpenChange: (open: boolean) => void
}) {
  const file = contract?.issuedFile
  const open = Boolean(contract)
  const [isTemplatePending, setTemplatePending] = useState(false)
  const downloadTemplate = async () => {
    if (!contract || contract.isMissingContract) return
    const popup = window.open('', '_blank')
    setTemplatePending(true)
    try {
      await apiClient.post(`/employees/contracts/${contract.uid}/print-snapshot`)
      await apiClient.post(
        `/employees/contracts/${contract.uid}/normalize-print-snapshot`
      )
      const target = `/karyawan/pkwt/${contract.uid}/cetak`
      if (popup) popup.location.href = target
      else window.open(target, '_blank')
    } catch (error) {
      popup?.close()
      const message = (error as { response?: { data?: { message?: string } } })
        .response?.data?.message
      toast.error(message ?? 'Template kontrak gagal dibuat.')
    } finally {
      setTemplatePending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Preview dokumen kontrak</DialogTitle>
          <DialogDescription>
            {contract?.contractNumber ?? 'Kontrak'} -{' '}
            {file?.originalName ?? 'Dokumen belum diunggah'}
          </DialogDescription>
        </DialogHeader>
        {file?.url ? (
          <>
            <AttachmentPreview
              url={file.url}
              mimeType={file.mimeType}
              originalName={file.originalName}
            />
            <DialogFooter className='gap-2 sm:justify-end'>
              <Button size='sm' variant='outline' asChild>
                <a href={file.url} target='_blank' rel='noreferrer'>
                  <ExternalLink /> Buka File
                </a>
              </Button>
              <Button size='sm' variant='outline' asChild>
                <a href={file.url} download>
                  <Download /> Download
                </a>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className='flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
              <FileText />
              {contract?.isMissingContract
                ? 'Kontrak belum dibuat, sehingga dokumen kontrak belum dapat diunggah.'
                : 'Scan kontrak asli bertanda tangan belum diunggah.'}
            </div>
            <DialogFooter className='gap-2 sm:justify-end'>
              {!contract?.isMissingContract && contract && (
                <Button size='sm' variant='outline' asChild>
                  <Link
                    to='/karyawan/pkwt/$contractUid/ubah'
                    params={{ contractUid: contract.uid }}
                    search={{ returnTo }}
                  >
                    <FilePlus2 /> Upload Dokumen
                  </Link>
                </Button>
              )}
              {!contract?.isMissingContract &&
                contract?.employeeType === 'BORONGAN' &&
                contract.contractType === 'PKWT' && (
                <Button
                  size='sm'
                  variant='outline'
                  disabled={isTemplatePending}
                  onClick={() => void downloadTemplate()}
                >
                  <Printer /> Cetak Template Kontrak
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function AttachmentPreview({
  url,
  mimeType,
  originalName,
}: {
  url: string
  mimeType: string
  originalName: string
}) {
  if (mimeType.startsWith('image/')) {
    return (
      <div className='overflow-hidden rounded-md border bg-muted'>
        <img
          src={url}
          alt={`Pratinjau ${originalName}`}
          className='max-h-[60svh] w-full object-contain'
        />
      </div>
    )
  }

  if (mimeType === 'application/pdf') {
    return (
      <div className='overflow-hidden rounded-md border bg-muted'>
        <iframe
          title={`Pratinjau ${originalName}`}
          src={url}
          className='h-[60svh] w-full bg-background'
        />
      </div>
    )
  }

  return (
    <div className='flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground'>
      {mimeType.startsWith('image/') ? <ImageIcon /> : <FileText />}
      Pratinjau tidak tersedia untuk tipe file ini.
    </div>
  )
}
