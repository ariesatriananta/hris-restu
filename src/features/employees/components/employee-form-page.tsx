import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Main } from '@/components/layout/main'
import { uploadEmployeeFile } from '../data/files'
import { useEmployee, useSaveEmployee } from '../data/queries'
import { EmployeeForm } from './employee-form'

export function EmployeeFormPage({ employeeUid }: { employeeUid?: string }) {
  const navigate = useNavigate()
  const employee = useEmployee(employeeUid ?? '')
  const save = useSaveEmployee()
  const isEdit = Boolean(employeeUid)

  if (isEdit && employee.isPending) return <Main>Memuat data karyawan...</Main>
  if (isEdit && (!employee.data || employee.isError))
    return <Main>Data karyawan tidak ditemukan.</Main>

  return (
    <Main className='max-w-5xl'>
      <Button asChild variant='ghost' className='mb-3 -ml-3'>
        <Link
          to={
            isEdit
              ? '/karyawan/data-karyawan/$employeeUid'
              : '/karyawan/data-karyawan'
          }
          params={isEdit ? { employeeUid: employeeUid! } : undefined}
        >
          <ArrowLeft /> {isEdit ? 'Detail karyawan' : 'Data Karyawan'}
        </Link>
      </Button>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold'>
          {isEdit ? 'Ubah data karyawan' : 'Tambah karyawan'}
        </h1>
        <p className='text-muted-foreground'>
          Form lengkap dibuka sebagai halaman agar nyaman di desktop maupun
          mobile.
        </p>
      </div>
      <EmployeeForm
        employee={employee.data ?? undefined}
        isPending={save.isPending}
        onSubmit={async (input, photoFile) => {
          const result = await save.mutateAsync({ input, uid: employeeUid })
          if (photoFile) {
            const photo = await uploadEmployeeFile(photoFile, result.uid)
            await save.mutateAsync({
              input: { ...input, photo },
              uid: result.uid,
            })
          }
          toast.success(
            isEdit ? 'Data karyawan diperbarui.' : 'Karyawan ditambahkan.'
          )
          await navigate({
            to: '/karyawan/data-karyawan/$employeeUid',
            params: { employeeUid: result.uid },
            ignoreBlocker: true,
          })
        }}
        onCancel={() =>
          navigate({
            to: isEdit
              ? '/karyawan/data-karyawan/$employeeUid'
              : '/karyawan/data-karyawan',
            params: isEdit ? { employeeUid: employeeUid! } : undefined,
          })
        }
      />
    </Main>
  )
}
