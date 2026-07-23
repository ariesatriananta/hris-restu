import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  CircleCheckBig,
  Clock3,
  CalendarClock,
  FilePenLine,
  FileText,
  Plus,
  ScrollText,
  Files,
  RefreshCw,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Main } from '@/components/layout/main'
import {
  useContractConflicts,
  useContractKpiSummary,
  useContractList,
  useDocumentList,
  useManualContractsReconcile,
} from '../data/queries'
import type {
  EmployeeContract,
  ContractKpiSummary,
  EmployeeDocument,
  EmployeeRecordListParams,
  PaginatedResult,
  SiteCode,
} from '../domain'
import { formatDate } from '../utils'
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
  const routerNavigate = useNavigate()
  const [activeTab, setActiveTab] = useState<
    'contracts' | 'documents' | 'status-changes'
  >('contracts')
  const [selectedContract, setSelectedContract] = useState<EmployeeContract>()
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [conflictsOpen, setConflictsOpen] = useState(false)
  const user = useAuthStore((state) => state.session?.user)
  const contractParams = params(search, 'contract')
  const documentParams = params(search, 'document')
  const statusChangeParams = statusChangeParamsFromSearch(search)
  const contracts = useContractList(contractParams)
  const contractKpis = useContractKpiSummary(contractParams.site)
  const documents = useDocumentList(documentParams)
  const conflicts = useContractConflicts()
  const reconcile = useManualContractsReconcile()
  const contractRows = useMemo(
    () => mapContracts(contracts.data),
    [contracts.data]
  )
  const documentRows = useMemo(
    () => mapDocuments(documents.data),
    [documents.data]
  )
  return (
    <Main>
      <div className='mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end'>
        <div>
          <h1 className='text-2xl font-bold'>PKWT & Dokumen</h1>
          <p className='text-muted-foreground'>
            Kontrak, masa berlaku, dan metadata lampiran karyawan.
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          {activeTab === 'contracts' && user?.role === 'SUPER_ADMIN' && (
            <Button variant='outline' onClick={() => setReconcileOpen(true)}>
              <RefreshCw /> Jalankan rekonsiliasi
            </Button>
          )}
          {activeTab !== 'status-changes' && (
            <Button
              onClick={() =>
                routerNavigate({
                  to:
                    activeTab === 'contracts'
                      ? '/karyawan/pkwt/tambah'
                      : '/karyawan/dokumen/tambah',
                })
              }
            >
              <Plus />
              {activeTab === 'contracts' ? 'Tambah kontrak' : 'Tambah dokumen'}
            </Button>
          )}
        </div>
      </div>
      {activeTab === 'contracts' && conflicts.data?.items.length ? (
        <Alert variant='destructive' className='mb-4'>
          <AlertTriangle />
          <Collapsible
            open={conflictsOpen}
            onOpenChange={setConflictsOpen}
            className='col-start-2 min-w-0'
          >
            <CollapsibleTrigger className='flex w-full items-center justify-between gap-3 text-left'>
              <AlertTitle className='animate-pulse text-sm motion-reduce:animate-none'>
                {conflicts.data.total} konflik lifecycle kontrak perlu ditindak
              </AlertTitle>
              <ChevronDown
                className={`size-4 shrink-0 transition-transform ${
                  conflictsOpen ? 'rotate-180' : ''
                }`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className='CollapsibleContent'>
              <AlertDescription>
                <ul className='mt-2 space-y-1 text-destructive'>
                  {conflicts.data.items.map((conflict) => (
                    <li key={conflict.employeeUid}>
                      <Button
                        variant='link'
                        className='h-auto p-0 text-destructive underline hover:text-destructive/80'
                        onClick={() =>
                          routerNavigate({
                            to: '/karyawan/data-karyawan/$employeeUid',
                            params: { employeeUid: conflict.employeeUid },
                          })
                        }
                      >
                        {conflict.employeeNumber} · {conflict.fullName}
                      </Button>{' '}
                      — {conflict.reason} ({conflict.contractNumbers.join(', ')}
                      )
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </CollapsibleContent>
          </Collapsible>
        </Alert>
      ) : null}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (
            value === 'contracts' ||
            value === 'documents' ||
            value === 'status-changes'
          ) {
            setActiveTab(value)
          }
        }}
      >
        <TabsList className='h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1 sm:w-fit'>
          <TabsTrigger value='contracts' className='h-10 flex-none gap-2 px-4'>
            <ScrollText className='size-4' />
            PKWT & Kontrak
          </TabsTrigger>
          <TabsTrigger value='documents' className='h-10 flex-none gap-2 px-4'>
            <FileText className='size-4' />
            Dokumen
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
              })
            }
            canEdit={(row) =>
              !['EXPIRED', 'TERMINATED', 'CANCELLED'].includes(row.status)
            }
            onView={(row) => setSelectedContract(row.contract)}
            onExtendContract={(contract) =>
              routerNavigate({
                to: '/karyawan/pkwt/tambah',
                search: { employeeUid: contract.employeeUid },
              })
            }
            isPending={contracts.isPending}
            isError={contracts.isError}
            onRetry={() => contracts.refetch()}
          />
        </TabsContent>
        <TabsContent value='documents' className='mt-4'>
          <RecordsTable
            data={documentRows}
            search={search}
            navigate={navigate}
            prefix='document'
            statuses={['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED']}
            onEdit={(uid) =>
              routerNavigate({
                to: '/karyawan/dokumen/$documentUid/ubah',
                params: { documentUid: uid },
              })
            }
            isPending={documents.isPending}
            isError={documents.isError}
            onRetry={() => documents.refetch()}
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
      <ConfirmDialog
        open={reconcileOpen}
        onOpenChange={(open) => {
          if (!reconcile.isPending) setReconcileOpen(open)
        }}
        title='Jalankan rekonsiliasi kontrak sekarang?'
        desc='Sistem akan menjalankan proses yang sama dengan webhook cron untuk seluruh site: aktivasi dan expiry kontrak, sinkronisasi status karyawan, mutasi terjadwal, serta status kerja terjadwal yang jatuh tempo.'
        cancelBtnText='Batal'
        confirmText='Jalankan sekarang'
        isLoading={reconcile.isPending}
        handleConfirm={() =>
          reconcile.mutate(undefined, {
            onSuccess: (result) => {
              setReconcileOpen(false)
              toast.success(
                result.status === 'SKIPPED'
                  ? 'Rekonsiliasi lain masih berjalan.'
                  : `Rekonsiliasi selesai: ${result.activated ?? 0} kontrak aktif, ${result.expired ?? 0} kontrak berakhir.`
              )
            },
            onError: () =>
              toast.error('Rekonsiliasi kontrak gagal dijalankan.'),
          })
        }
      />
    </Main>
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
    page:
      typeof search[`${prefix}Page`] === 'number'
        ? (search[`${prefix}Page`] as number)
        : 1,
    pageSize:
      typeof search[`${prefix}PageSize`] === 'number'
        ? (search[`${prefix}PageSize`] as number)
        : 100,
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
        : 100,
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
      label: 'Berakhir ≤ 7 hari',
      value: data?.expiringWithin7Days,
      icon: Clock3,
      className:
        'border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400',
    },
    {
      label: 'Aktif tanpa kontrak',
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
      site: item.site ?? '—',
      detail: `${item.contractType} · ${formatDate(item.startDate)} — ${formatDate(item.endDate)}`,
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
    pageSize: data?.pageSize ?? 100,
  }
}
function mapDocuments(
  data?: PaginatedResult<EmployeeDocument>
): PaginatedResult<EmployeeRecordRow> {
  return {
    items: (data?.items ?? []).map((item) => ({
      uid: item.uid,
      employeeUid: item.employeeUid,
      title: item.name,
      employee: item.employeeName ?? 'Karyawan',
      site: item.site ?? '—',
      detail: `${item.documentType} · ${item.file.originalName}`,
      status: item.status,
      expiry: expiry(item.expiryDate),
    })),
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    pageSize: data?.pageSize ?? 100,
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
