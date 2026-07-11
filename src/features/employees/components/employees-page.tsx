import { useMemo, useState } from 'react'
import { Plus, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Main } from '@/components/layout/main'
import { useEmployeeList, useSaveEmployee } from '../data/queries'
import type { Employee, EmployeeListParams } from '../domain'
import { EmployeeForm } from './employee-form'
import { createEmployeeColumns } from './employees-columns'
import { EmployeesTable } from './employees-table'

export function EmployeesPage({
  mockState = 'normal',
  search,
  navigate,
}: {
  mockState?: 'normal' | 'empty' | 'error'
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const [editing, setEditing] = useState<Employee | null | undefined>(undefined)
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
    pageSize: typeof search.pageSize === 'number' ? search.pageSize : 10,
    mockState,
  }
  const query = useEmployeeList(params)
  const save = useSaveEmployee()
  const columns = useMemo(
    () => createEmployeeColumns((employee) => setEditing(employee)),
    []
  )
  const submit = (input: Parameters<typeof save.mutate>[0]['input']) =>
    save.mutate(
      { input, uid: editing?.uid },
      {
        onSuccess: () => {
          toast.success(
            editing ? 'Data karyawan diperbarui.' : 'Karyawan ditambahkan.'
          )
          setEditing(undefined)
        },
        onError: (error) => toast.error(error.message),
      }
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
        <Button onClick={() => setEditing(null)}>
          <Plus /> Tambah karyawan
        </Button>
      </div>
      <Card>
        <CardContent className='pt-6'>
          {query.isPending ? (
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
              search={search}
              navigate={navigate}
              onEdit={setEditing}
            />
          )}
        </CardContent>
      </Card>
      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
      >
        <DialogContent className='max-h-[90svh] max-w-4xl overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Ubah karyawan' : 'Tambah karyawan'}
            </DialogTitle>
            <DialogDescription>
              Data pribadi sensitif hanya muncul pada form Super Admin ini.
            </DialogDescription>
          </DialogHeader>
          <EmployeeForm
            employee={editing ?? undefined}
            onSubmit={submit}
            isPending={save.isPending}
          />
        </DialogContent>
      </Dialog>
    </Main>
  )
}
