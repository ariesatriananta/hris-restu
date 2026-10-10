import { useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ChevronDown,
  Plus,
  RefreshCcw,
  MoreHorizontal,
  Trash2,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { currentListReturnTo } from '@/lib/list-return-to'
import { useKpiVisibility } from '@/hooks/use-kpi-visibility'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { KpiVisibilityMenuItem } from '@/components/kpi-visibility-menu'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import {
  useEmployeeKpiSummary,
  useEmployeeList,
  useEmployeeLookups,
  useEmployeeOnboardingReadiness,
} from '../data/queries'
import type {
  Employee,
  EmployeeListParams,
  EmployeeOnboardingReadinessItem,
} from '../domain'
import { EmployeeBatchDeleteDialog } from './employee-batch-delete-dialog'
import { EmployeeImportDialog } from './employee-import-dialog'
import { EmployeeKpiCards } from './employee-kpi-cards'
import { continueEmployeeOnboarding } from './employee-onboarding-navigation'
import {
  EmployeeOnboardingBanner,
  EmployeeOnboardingDialog,
} from './employee-onboarding-readiness'
import { createEmployeeColumns } from './employees-columns'
import { EmployeesTable } from './employees-table'
import { RegistrationCorrectionDialog } from './registration-correction-dialog'

export function EmployeesPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const { showKpi, setShowKpi } = useKpiVisibility('employees-list')
  const session = useAuthStore((state) => state.session)
  const canDeleteBatch =
    hasPermission(session, 'employees.manage') &&
    (session?.user.role === 'SUPER_ADMIN' ||
      session?.user.roles.includes('SUPER_ADMIN') === true)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)
  const params: EmployeeListParams = {
    query: typeof search.filter === 'string' ? search.filter : undefined,
    site: Array.isArray(search.site) ? search.site : undefined,
    employeeType: Array.isArray(search.employeeType)
      ? search.employeeType
      : undefined,
    employeeStatus: Array.isArray(search.employeeStatus)
      ? search.employeeStatus
      : undefined,
    productionModule: Array.isArray(search.productionModule)
      ? search.productionModule
      : undefined,
    productionSection: Array.isArray(search.productionSection)
      ? search.productionSection
      : undefined,
    page: typeof search.page === 'number' ? search.page : 1,
    pageSize: typeof search.pageSize === 'number' ? search.pageSize : 50,
  }
  const query = useEmployeeList(params, { keepPreviousData: true })
  const lookups = useEmployeeLookups()
  const employeeKpis = useEmployeeKpiSummary({
    site: params.site,
    employeeType: params.employeeType,
  })
  const onboardingReadiness = useEmployeeOnboardingReadiness()
  const returnTo = currentListReturnTo()
  const routerNavigate = useNavigate()
  const [correctionEmployee, setCorrectionEmployee] = useState<Employee>()
  const [importOpen, setImportOpen] = useState(false)
  const [onboardingOpen, setOnboardingOpen] = useState(false)
  const onboardingByEmployeeUid = useMemo(
    () =>
      new Map(
        (onboardingReadiness.data?.items ?? []).map((item) => [
          item.employeeUid,
          item,
        ])
      ),
    [onboardingReadiness.data?.items]
  )
  const continueOnboarding = (items: EmployeeOnboardingReadinessItem[]) =>
    continueEmployeeOnboarding(items, routerNavigate, returnTo)
  const columns = useMemo(
    () =>
      createEmployeeColumns(
        (employee) =>
          routerNavigate({
            to: '/karyawan/ubah-karyawan/$employeeUid',
            params: { employeeUid: employee.uid },
            search: { returnTo },
          }),
        setCorrectionEmployee,
        returnTo,
        onboardingByEmployeeUid,
        (item) => continueEmployeeOnboarding([item], routerNavigate, returnTo)
      ),
    [onboardingByEmployeeUid, returnTo, routerNavigate]
  )
  return (
    <Main>
      <div className='mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end'>
        <div>
          <h1 className='text-2xl font-bold'>Data Karyawan</h1>
          <p className='text-muted-foreground'>
            Master karyawan aktif dan histori dasar tiga site.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button>
                <Plus /> Tambah karyawan <ChevronDown className='size-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-52'>
              <DropdownMenuItem asChild>
                <Link to='/karyawan/tambah-karyawan' search={{ returnTo }}>
                  Single Karyawan
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                Import Excel
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                size='icon'
                variant='outline'
                aria-label='Opsi tampilan'
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-56'>
              {canDeleteBatch && (
                <>
                  <DropdownMenuItem
                    variant='destructive'
                    onSelect={() => setBatchDeleteOpen(true)}
                  >
                    <Trash2 /> Hapus Karyawan Batch
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <KpiVisibilityMenuItem
                showKpi={showKpi}
                onCheckedChange={setShowKpi}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {showKpi && (
        <EmployeeKpiCards
          data={employeeKpis.data}
          isPending={employeeKpis.isPending}
          isError={employeeKpis.isError}
        />
      )}
      {onboardingReadiness.data && (
        <div className='mb-4'>
          <EmployeeOnboardingBanner
            data={onboardingReadiness.data}
            onOpen={() => setOnboardingOpen(true)}
          />
        </div>
      )}
      {query.isPending && !query.data ? (
        <p className='py-10 text-center text-muted-foreground'>
          Memuat data karyawan...
        </p>
      ) : query.isError ? (
        <div className='py-10 text-center'>
          <p>Data gagal dimuat.</p>
          <Button
            variant='outline'
            className='mt-3'
            onClick={() => query.refetch()}
          >
            <RefreshCcw /> Coba lagi
          </Button>
        </div>
      ) : (
        <>
          <EmployeesTable
            lookups={lookups.data}
            data={query.data}
            columns={columns}
            returnTo={returnTo}
            search={search}
            navigate={navigate}
            onEdit={(employee) =>
              routerNavigate({
                to: '/karyawan/ubah-karyawan/$employeeUid',
                params: { employeeUid: employee.uid },
                search: { returnTo },
              })
            }
            isFetching={query.isFetching}
            onboardingByEmployeeUid={onboardingByEmployeeUid}
            onContinueOnboarding={(item) => continueOnboarding([item])}
          />
          <RegistrationCorrectionDialog
            employee={correctionEmployee}
            open={Boolean(correctionEmployee)}
            onOpenChange={(open) => {
              if (!open) setCorrectionEmployee(undefined)
            }}
          />
        </>
      )}
      <EmployeeImportDialog open={importOpen} onOpenChange={setImportOpen} />
      {canDeleteBatch && (
        <EmployeeBatchDeleteDialog
          open={batchDeleteOpen}
          onOpenChange={setBatchDeleteOpen}
        />
      )}
      {onboardingReadiness.data && (
        <EmployeeOnboardingDialog
          open={onboardingOpen}
          onOpenChange={setOnboardingOpen}
          data={onboardingReadiness.data}
          onContinue={continueOnboarding}
        />
      )}
    </Main>
  )
}
