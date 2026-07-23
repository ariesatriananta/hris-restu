import { useMemo } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Plus, RefreshCcw } from 'lucide-react'
import { currentListReturnTo } from '@/lib/list-return-to'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import { Main } from '@/components/layout/main'
import { useEmployeeList } from '../data/queries'
import type { EmployeeListParams } from '../domain'
import { createEmployeeColumns } from './employees-columns'
import { EmployeesTable } from './employees-table'

export function EmployeesPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const params: EmployeeListParams = {
    query: typeof search.filter === 'string' ? search.filter : undefined,
    site: Array.isArray(search.site) ? search.site : undefined,
    employeeType: Array.isArray(search.employeeType)
      ? search.employeeType
      : undefined,
    employeeStatus: Array.isArray(search.employeeStatus)
      ? search.employeeStatus
      : undefined,
    page: typeof search.page === 'number' ? search.page : 1,
    pageSize: typeof search.pageSize === 'number' ? search.pageSize : 50,
  }
  const query = useEmployeeList(params, { keepPreviousData: true })
  const returnTo = currentListReturnTo()
  const routerNavigate = useNavigate()
  const columns = useMemo(
    () =>
      createEmployeeColumns(
        (employee) =>
          routerNavigate({
            to: '/karyawan/ubah-karyawan/$employeeUid',
            params: { employeeUid: employee.uid },
            search: { returnTo },
          }),
        returnTo
      ),
    [returnTo, routerNavigate]
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
        <Button asChild>
          <Link to='/karyawan/tambah-karyawan'>
            <Plus /> Tambah karyawan
          </Link>
        </Button>
      </div>
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
        <EmployeesTable
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
        />
      )}
    </Main>
  )
}
