import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CircleCheckBig,
  Clock3,
  CalendarClock,
  FilePenLine,
  Plus,
  ScrollText,
  Files,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
import { currentListReturnTo } from '@/lib/list-return-to'
import type { NavigateFn } from '@/hooks/use-table-url-state'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Main } from '@/components/layout/main'
import {
  useContractConflicts,
  useContractKpiSummary,
  useContractList,
  useEmployeeLookups,
} from '../data/queries'
import type {
  EmployeeContract,
  ContractConflictListResult,
  ContractKpiSummary,
  ContractLifecycleConflict,
  EmployeeRecordListParams,
  PaginatedResult,
  SiteCode,
} from '../domain'
import { formatDate, statusLabel } from '../utils'
import { ContractDetailDrawer } from './contract-detail-drawer'
import { RecordsTable, type EmployeeRecordRow } from './records-table'
import { ScheduledStatusChangesTable } from './scheduled-status-changes-table'

export function ContractsDocumentsPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const returnTo = currentListReturnTo()
  const routerNavigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'contracts' | 'status-changes'>(
    'contracts'
  )
  const [selectedContract, setSelectedContract] = useState<EmployeeContract>()
  const [conflictsOpen, setConflictsOpen] = useState(false)
  const [conflictPage, setConflictPage] = useState(1)
  const contractParams = params(search, 'contract')
  const statusChangeParams = statusChangeParamsFromSearch(search)
  const contracts = useContractList(contractParams)
  const lookups = useEmployeeLookups()
  const contractKpis = useContractKpiSummary({
    site: contractParams.site,
    productionModule: contractParams.productionModule,
    productionSection: contractParams.productionSection,
  })
  const conflicts = useContractConflicts({ page: conflictPage, pageSize: 50 })
  useEffect(() => {
    if (conflicts.isFetching || !conflicts.data) return
    const lastPage = Math.max(
      1,
      Math.ceil(conflicts.data.total / conflicts.data.pageSize)
    )
    if (conflictPage <= lastPage) return
    const resetPage = window.setTimeout(() => setConflictPage(lastPage), 0)
    return () => window.clearTimeout(resetPage)
  }, [conflictPage, conflicts.data, conflicts.isFetching])
  const contractRows = useMemo(
    () => mapContracts(contracts.data),
    [contracts.data]
  )
  return (
    <Main>
      <div className='mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end'>
        <div>
          <h1 className='text-2xl font-bold'>Kontrak Karyawan</h1>
          <p className='text-muted-foreground'>
            Kontrak, masa berlaku, dan metadata lampiran karyawan.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {activeTab === 'contracts' && (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button>
                  <Plus />
                  Tambah kontrak
                  <ChevronDown className='size-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-52'>
                <DropdownMenuItem
                  onSelect={() =>
                    routerNavigate({
                      to: '/karyawan/pkwt/tambah',
                      search: { returnTo },
                    })
                  }
                >
                  Single Kontrak
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    routerNavigate({
                      to: '/karyawan/pkwt/tambah-multiple',
                      search: { returnTo },
                    })
                  }
                >
                  Multiple Kontrak
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      {activeTab === 'contracts' && conflicts.isError ? (
        <Alert variant='destructive' className='mb-4'>
          <AlertTriangle />
          <div className='col-start-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div className='min-w-0'>
              <AlertTitle className='text-sm'>
                Konflik lifecycle gagal dimuat
              </AlertTitle>
              <AlertDescription className='mt-1'>
                Muat ulang agar kasus kontrak yang perlu ditindak tidak
                terlewat.
              </AlertDescription>
            </div>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='w-fit shrink-0'
              onClick={() => conflicts.refetch()}
            >
              <RefreshCw /> Muat ulang
            </Button>
          </div>
        </Alert>
      ) : activeTab === 'contracts' && (conflicts.data?.total ?? 0) > 0 ? (
        <Alert className='mb-4 border-amber-500/40 bg-amber-500/5 text-amber-950 dark:text-amber-100'>
          <AlertTriangle className='text-amber-600 dark:text-amber-400' />
          <div className='col-start-2 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <div className='min-w-0'>
              <AlertTitle className='text-sm'>
                {conflicts.data?.total ?? 0} konflik lifecycle kontrak perlu
                ditindak
              </AlertTitle>
              <AlertDescription className='mt-1 text-amber-900/80 dark:text-amber-100/75'>
                Periksa konflik agar status kontrak dan karyawan tetap sinkron.
              </AlertDescription>
            </div>
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='w-fit shrink-0 border-amber-500/40 bg-background/70 hover:bg-amber-500/10'
              onClick={() => setConflictsOpen(true)}
            >
              Lihat konflik
            </Button>
          </div>
        </Alert>
      ) : null}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === 'contracts' || value === 'status-changes') {
            setActiveTab(value)
          }
        }}
      >
        <TabsList className='h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1 sm:w-fit'>
          <TabsTrigger value='contracts' className='h-10 flex-none gap-2 px-4'>
            <ScrollText className='size-4' />
            Daftar Kontrak
          </TabsTrigger>
          <TabsTrigger
            value='status-changes'
            className='h-10 flex-none gap-2 px-4'
          >
            <CalendarClock className='size-4' />
            Status Kerja Terjadwal
          </TabsTrigger>
        </TabsList>
        <TabsContent value='contracts' className='mt-4'>
          <ContractKpiCards
            data={contractKpis.data}
            isPending={contractKpis.isPending}
            isError={contractKpis.isError}
          />
          <RecordsTable
            data={contractRows}
            search={search}
            navigate={navigate}
            prefix='contract'
            productionModuleOptions={(
              lookups.data?.productionModules ?? []
            ).map((item) => ({
              value: item.uid,
              label: `${statusLabel(item.siteCode)} - ${item.name}`,
            }))}
            productionSectionOptions={uniqueOptions(
              (lookups.data?.productionModuleSections ?? []).map((item) => ({
                value: item.sectionUid,
                label: item.sectionName,
              }))
            )}
            statuses={[
              'DRAFT',
              'SCHEDULED',
              'ACTIVE',
              'EXPIRED',
              'TERMINATED',
              'CANCELLED',
            ]}
            onEdit={(uid) =>
              routerNavigate({
                to: '/karyawan/pkwt/$contractUid/ubah',
                params: { contractUid: uid },
                search: { returnTo },
              })
            }
            canEdit={(row) =>
              !['EXPIRED', 'TERMINATED', 'CANCELLED'].includes(row.status)
            }
            onView={(row) => setSelectedContract(row.contract)}
            onExtendContract={(contract) =>
              routerNavigate({
                to: '/karyawan/pkwt/tambah',
                search: { employeeUid: contract.employeeUid, returnTo },
              })
            }
            isPending={contracts.isPending}
            isError={contracts.isError}
            onRetry={() => contracts.refetch()}
          />
        </TabsContent>
        <TabsContent value='status-changes' className='mt-4'>
          <ScheduledStatusChangesTable
            search={search}
            navigate={navigate}
            params={statusChangeParams}
          />
        </TabsContent>
      </Tabs>
      <ContractDetailDrawer
        contract={selectedContract}
        employee={
          selectedContract
            ? {
                uid: selectedContract.employeeUid,
                fullName: selectedContract.employeeName ?? 'Karyawan',
              }
            : undefined
        }
        open={Boolean(selectedContract)}
        onOpenChange={(open) => {
          if (!open) setSelectedContract(undefined)
        }}
      />
      <ContractConflictsDialog
        open={conflictsOpen}
        onOpenChange={setConflictsOpen}
        data={conflicts.data}
        isPending={conflicts.isPending}
        isFetching={conflicts.isFetching}
        isError={conflicts.isError}
        page={conflictPage}
        onPageChange={setConflictPage}
        onRetry={() => conflicts.refetch()}
        onOpenEmployee={(employeeUid) =>
          routerNavigate({
            to: '/karyawan/data-karyawan/$employeeUid',
            params: { employeeUid },
            search: { returnTo },
          })
        }
      />
    </Main>
  )
}

function ContractConflictsDialog({
  open,
  onOpenChange,
  data,
  isPending,
  isFetching,
  isError,
  page,
  onPageChange,
  onRetry,
  onOpenEmployee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data?: ContractConflictListResult
  isPending: boolean
  isFetching: boolean
  isError: boolean
  page: number
  onPageChange: (page: number) => void
  onRetry: () => void
  onOpenEmployee: (employeeUid: string) => void
}) {
  const total = data?.total ?? 0
  const shownPage = data?.page ?? page
  const pageSize = data?.pageSize ?? 50
  const start = total === 0 ? 0 : (shownPage - 1) * pageSize + 1
  const end = Math.min(shownPage * pageSize, total)
  const groups = [
    {
      severity: 'danger' as const,
      label: 'Konflik kritis',
      items: (data?.items ?? []).filter(
        (conflict) => conflict.severity === 'danger'
      ),
    },
    {
      severity: 'warning' as const,
      label: 'Perlu tindak lanjut',
      items: (data?.items ?? []).filter(
        (conflict) => conflict.severity === 'warning'
      ),
    },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-3xl'>
        <DialogHeader className='border-b px-6 py-5 pr-12'>
          <DialogTitle>Konflik lifecycle kontrak</DialogTitle>
          <DialogDescription>
            {total > 0
              ? `${total} konflik perlu diperiksa agar status kontrak dan karyawan tetap sinkron.`
              : 'Tidak ada konflik lifecycle kontrak yang perlu ditindak.'}
          </DialogDescription>
        </DialogHeader>

        <div
          className='min-h-0 flex-1 overflow-y-auto px-6 py-4'
          aria-busy={isFetching}
        >
          {isPending ? (
            <div className='space-y-3' aria-label='Memuat konflik kontrak'>
              <Skeleton className='h-24 w-full' />
              <Skeleton className='h-24 w-full' />
              <Skeleton className='h-24 w-full' />
            </div>
          ) : isError ? (
            <div className='flex min-h-48 flex-col items-center justify-center gap-3 text-center'>
              <AlertTriangle className='size-8 text-destructive' />
              <div>
                <p className='font-medium'>Daftar konflik gagal dimuat</p>
                <p className='text-sm text-muted-foreground'>
                  Coba muat ulang tanpa meninggalkan halaman ini.
                </p>
              </div>
              <Button type='button' variant='outline' onClick={onRetry}>
                <RefreshCw /> Muat ulang
              </Button>
            </div>
          ) : total === 0 ? (
            <div className='flex min-h-48 flex-col items-center justify-center gap-2 text-center'>
              <CircleCheckBig className='size-9 text-emerald-600' />
              <p className='font-medium'>Status kontrak sudah sinkron</p>
              <p className='text-sm text-muted-foreground'>
                Tidak ada konflik yang perlu ditindak saat ini.
              </p>
            </div>
          ) : (
            <div
              className={`space-y-5 transition-opacity ${isFetching ? 'opacity-60' : ''}`}
            >
              {groups.map((group) =>
                group.items.length ? (
                  <section key={group.severity} aria-label={group.label}>
                    <div className='mb-2 flex items-center gap-2'>
                      <Badge
                        variant={
                          group.severity === 'danger'
                            ? 'destructive'
                            : 'outline'
                        }
                        className={
                          group.severity === 'warning'
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                            : undefined
                        }
                      >
                        {group.label}
                      </Badge>
                      <span className='text-xs text-muted-foreground'>
                        {group.items.length} pada halaman ini
                      </span>
                    </div>
                    <div className='divide-y rounded-lg border'>
                      {group.items.map((conflict) => (
                        <ContractConflictItem
                          key={`${conflict.employeeUid}-${conflict.code}`}
                          conflict={conflict}
                          onOpenEmployee={onOpenEmployee}
                        />
                      ))}
                    </div>
                  </section>
                ) : null
              )}
            </div>
          )}
        </div>

        <DialogFooter className='items-center justify-between border-t px-6 py-4 sm:justify-between'>
          <p className='text-sm text-muted-foreground' aria-live='polite'>
            {total > 0
              ? `Menampilkan ${start}-${end} dari ${total} konflik`
              : '0 konflik'}
          </p>
          <div className='flex items-center gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={page <= 1 || isFetching}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              <ArrowLeft /> Sebelumnya
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              disabled={!data?.hasMore || isFetching}
              onClick={() => onPageChange(page + 1)}
            >
              Berikutnya <ArrowRight />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ContractConflictItem({
  conflict,
  onOpenEmployee,
}: {
  conflict: ContractLifecycleConflict
  onOpenEmployee: (employeeUid: string) => void
}) {
  return (
    <article className='space-y-2 px-4 py-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Button
          type='button'
          variant='link'
          className='h-auto min-w-0 justify-start p-0 text-left font-semibold'
          onClick={() => onOpenEmployee(conflict.employeeUid)}
        >
          <span className='truncate'>
            {conflict.employeeNumber} - {conflict.fullName}
          </span>
        </Button>
        <span className='text-xs text-muted-foreground'>
          {statusLabel(conflict.site)}
        </span>
      </div>
      <p className='text-sm leading-relaxed'>{conflict.reason}</p>
      {conflict.contractNumbers.length ? (
        <p className='break-words text-xs text-muted-foreground'>
          Kontrak: {conflict.contractNumbers.join(', ')}
        </p>
      ) : null}
    </article>
  )
}

function params(
  search: Record<string, unknown>,
  prefix: 'contract' | 'document'
): EmployeeRecordListParams {
  return {
    query:
      typeof search[`${prefix}Filter`] === 'string'
        ? (search[`${prefix}Filter`] as string)
        : undefined,
    site: Array.isArray(search[`${prefix}Site`])
      ? ((search[`${prefix}Site`] as unknown[]).filter(
          (value): value is SiteCode =>
            value === 'JEPARA' || value === 'SEMARANG' || value === 'KLATEN'
        ) as SiteCode[])
      : undefined,
    status: Array.isArray(search[`${prefix}Status`])
      ? (search[`${prefix}Status`] as string[])
      : undefined,
    coverage:
      prefix === 'contract' && Array.isArray(search.contractCoverage)
        ? (search.contractCoverage as string[])
        : undefined,
    productionModule:
      prefix === 'contract' && Array.isArray(search.contractProductionModule)
        ? (search.contractProductionModule as string[])
        : undefined,
    productionSection:
      prefix === 'contract' && Array.isArray(search.contractProductionSection)
        ? (search.contractProductionSection as string[])
        : undefined,
    page:
      typeof search[`${prefix}Page`] === 'number'
        ? (search[`${prefix}Page`] as number)
        : 1,
    pageSize:
      typeof search[`${prefix}PageSize`] === 'number'
        ? (search[`${prefix}PageSize`] as number)
        : 50,
  }
}
function statusChangeParamsFromSearch(
  search: Record<string, unknown>
): EmployeeRecordListParams {
  return {
    query:
      typeof search.statusChangeFilter === 'string'
        ? search.statusChangeFilter
        : undefined,
    site: Array.isArray(search.statusChangeSite)
      ? (search.statusChangeSite as SiteCode[])
      : undefined,
    status: Array.isArray(search.statusChangeStatus)
      ? (search.statusChangeStatus as string[])
      : undefined,
    action: Array.isArray(search.statusChangeAction)
      ? (search.statusChangeAction as string[])
      : undefined,
    page:
      typeof search.statusChangePage === 'number' ? search.statusChangePage : 1,
    pageSize:
      typeof search.statusChangePageSize === 'number'
        ? search.statusChangePageSize
        : 50,
  }
}
function ContractKpiCards({
  data,
  isPending,
  isError,
}: {
  data?: ContractKpiSummary
  isPending: boolean
  isError: boolean
}) {
  const cards = [
    {
      label: 'Kontrak aktif berlaku',
      value: data?.activeValid,
      icon: CircleCheckBig,
      className:
        'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400',
    },
    {
      label: 'Berakhir <= 7 hari',
      value: data?.expiringWithin7Days,
      icon: Clock3,
      className:
        'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400',
    },
    {
      label: 'Perlu kontrak',
      value: data?.activeWithoutValidContract,
      icon: AlertTriangle,
      className: 'border-destructive/30 bg-destructive/5 text-destructive',
    },
    {
      label: 'Draft perlu diproses',
      value: data?.drafts,
      icon: FilePenLine,
      className: 'border-primary/25 bg-primary/5 text-primary',
    },
    {
      label: 'Terjadwal menunggu mulai',
      value: data?.scheduled,
      icon: CalendarClock,
      className:
        'border-sky-500/30 bg-sky-500/5 text-sky-700 dark:text-sky-400',
    },
    {
      label: 'Total kontrak tercatat',
      value: data?.totalContracts,
      icon: Files,
      className: 'border-muted-foreground/20 bg-muted/40 text-foreground',
    },
  ]

  if (isPending) {
    return (
      <div className='mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'>
        {cards.map((card) => (
          <Skeleton key={card.label} className='h-[68px] rounded-lg' />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <p className='mb-4 text-sm text-muted-foreground'>
        Ringkasan KPI kontrak belum dapat dimuat. Tabel kontrak tetap tersedia.
      </p>
    )
  }

  return (
    <div className='mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'>
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <section
            key={card.label}
            className={`min-h-[68px] rounded-lg border px-3 py-2.5 ${card.className}`}
            aria-label={card.label}
          >
            <div className='flex items-start justify-between gap-3'>
              <div>
                <p className='text-[11px] leading-3 font-medium'>
                  {card.label}
                </p>
                <p className='mt-1 text-xl leading-none font-semibold tabular-nums'>
                  {card.value ?? 0}
                </p>
              </div>
              <Icon className='size-3.5 shrink-0' aria-hidden='true' />
            </div>
          </section>
        )
      })}
    </div>
  )
}

function mapContracts(
  data?: PaginatedResult<EmployeeContract>
): PaginatedResult<EmployeeRecordRow> {
  return {
    items: (data?.items ?? []).map((item) => ({
      uid: item.uid,
      employeeUid: item.employeeUid,
      title: item.contractNumber,
      employee: item.employeeName ?? 'Karyawan',
      site: item.site ?? '-',
      employeeType: item.employeeType,
      position: item.positionNameSnapshot,
      productionModule: item.productionModule,
      productionSection: item.productionSection,
      detail: `${formatDate(item.startDate)} - ${formatDate(item.endDate)}`,
      status: item.status,
      coverage: item.isCoverageIssue
        ? 'ACTIVE_WITHOUT_VALID_CONTRACT'
        : item.isExpiringWithin7Days
          ? 'EXPIRING_WITHIN_7_DAYS'
          : 'NORMAL',
      expiry: item.status === 'ACTIVE' ? expiry(item.endDate) : undefined,
      contract: item,
    })),
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    pageSize: data?.pageSize ?? 50,
  }
}
function expiry(date?: string) {
  if (!date) return undefined
  const days = Math.ceil(
    (new Date(`${date}T00:00:00+07:00`).getTime() - Date.now()) / 86400000
  )
  return days < 0
    ? 'Sudah berakhir'
    : days <= 30
      ? `${days} hari lagi`
      : undefined
}

function uniqueOptions(options: { value: string; label: string }[]) {
  const seen = new Set<string>()
  return options.filter((option) => {
    if (seen.has(option.value)) return false
    seen.add(option.value)
    return true
  })
}
