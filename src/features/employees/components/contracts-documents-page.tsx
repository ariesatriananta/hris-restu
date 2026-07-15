import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, Plus } from 'lucide-react'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Main } from '@/components/layout/main'
import {
  useContractConflicts,
  useContractList,
  useDocumentList,
} from '../data/queries'
import type {
  EmployeeContract,
  EmployeeDocument,
  EmployeeRecordListParams,
  PaginatedResult,
  SiteCode,
} from '../domain'
import { formatDate } from '../utils'
import { ContractDetailDrawer } from './contract-detail-drawer'
import { RecordsTable, type EmployeeRecordRow } from './records-table'

export function ContractsDocumentsPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const routerNavigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'contracts' | 'documents'>(
    'contracts'
  )
  const [selectedContract, setSelectedContract] = useState<EmployeeContract>()
  const contractParams = params(search, 'contract')
  const documentParams = params(search, 'document')
  const contracts = useContractList(contractParams)
  const documents = useDocumentList(documentParams)
  const conflicts = useContractConflicts()
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
      </div>
      {activeTab === 'contracts' && conflicts.data?.items.length ? (
        <Alert variant='destructive' className='mb-4'>
          <AlertTriangle />
          <AlertTitle>
            {conflicts.data.total} konflik lifecycle kontrak perlu ditindak
          </AlertTitle>
          <AlertDescription>
            <ul className='mt-2 space-y-1'>
              {conflicts.data.items.map((conflict) => (
                <li key={conflict.employeeUid}>
                  <Button
                    variant='link'
                    className='h-auto p-0 text-inherit underline'
                    onClick={() =>
                      routerNavigate({
                        to: '/karyawan/data-karyawan/$employeeUid',
                        params: { employeeUid: conflict.employeeUid },
                      })
                    }
                  >
                    {conflict.employeeNumber} · {conflict.fullName}
                  </Button>{' '}
                  — {conflict.reason} ({conflict.contractNumbers.join(', ')})
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          if (value === 'contracts' || value === 'documents') {
            setActiveTab(value)
          }
        }}
      >
        <TabsList>
          <TabsTrigger value='contracts'>PKWT & Kontrak</TabsTrigger>
          <TabsTrigger value='documents'>Dokumen</TabsTrigger>
        </TabsList>
        <TabsContent value='contracts' className='mt-4'>
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
