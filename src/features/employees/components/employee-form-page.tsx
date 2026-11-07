import { useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { safeInternalReturnTo } from '@/lib/list-return-to'
import { Button } from '@/components/ui/button'
import { Main } from '@/components/layout/main'
import { uploadEmployeeFile } from '../data/files'
import {
  useDocuments,
  useEmployee,
  useSaveDocument,
  useSaveEmployee,
} from '../data/queries'
import type { Employee, EmployeeDocument } from '../domain'
import { EmployeeForm } from './employee-form'
import {
  saveEmployeeRegistration,
  type EmployeeSaveProgress,
} from './employee-registration-save'

type EmployeeFormPageProps = { employeeUid?: string; returnTo?: string }

export function EmployeeFormPage(props: EmployeeFormPageProps) {
  return <EmployeeFormPageContent key={props.employeeUid ?? 'new'} {...props} />
}

function EmployeeFormPageContent({
  employeeUid,
  returnTo,
}: EmployeeFormPageProps) {
  const navigate = useNavigate()
  const progress = useRef<EmployeeSaveProgress>({ employeeUid, documents: {} })
  const submitting = useRef(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedUid, setSavedUid] = useState(employeeUid)
  const [partialFailure, setPartialFailure] = useState(false)
  const [savedEmployee, setSavedEmployee] = useState<Employee>()
  const employee = useEmployee(employeeUid ?? '')
  const documents = useDocuments(employeeUid)
  const save = useSaveEmployee()
  const saveDocument = useSaveDocument()
  const isEdit = Boolean(employeeUid)
  const listReturnTo = safeInternalReturnTo(returnTo, '/karyawan/data-karyawan')

  if (isEdit && employee.isPending) return <Main>Memuat data karyawan...</Main>
  if (isEdit && (!employee.data || employee.isError))
    return <Main>Data karyawan tidak ditemukan.</Main>
  if (isEdit && documents.isPending)
    return <Main>Memuat dokumen identitas...</Main>
  if (isEdit && documents.isError)
    return <Main>Dokumen identitas gagal dimuat. Silakan coba lagi.</Main>

  const identityDocuments = byIdentityType(documents.data)

  return (
    <Main className='max-w-5xl'>
      <Button asChild variant='ghost' className='mb-3 -ml-3'>
        <Link
          to={savedUid ? '/karyawan/data-karyawan/$employeeUid' : listReturnTo}
          params={savedUid ? { employeeUid: savedUid } : undefined}
          search={savedUid ? { returnTo: listReturnTo } : undefined}
        >
          <ArrowLeft /> {savedUid ? 'Detail karyawan' : 'Data Karyawan'}
        </Link>
      </Button>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold'>
          {isEdit
            ? 'Ubah data karyawan'
            : savedUid
              ? 'Lengkapi data karyawan'
              : 'Tambah karyawan'}
        </h1>
      </div>
      {partialFailure && (
        <p
          role='alert'
          className='mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs'
        >
          Data karyawan sudah tersimpan, tetapi penyimpanan belum selesai. Coba
          simpan kembali untuk melanjutkan pada karyawan yang sama.
        </p>
      )}
      <EmployeeForm
        employee={
          savedEmployee ?? (isEdit ? (employee.data ?? undefined) : undefined)
        }
        identityDocuments={identityDocuments}
        isPending={isSaving || save.isPending || saveDocument.isPending}
        submitLabel={savedUid && !isEdit ? 'Lanjutkan penyimpanan' : undefined}
        onSubmit={async (input, files) => {
          if (submitting.current) return
          submitting.current = true
          setIsSaving(true)
          setPartialFailure(false)
          try {
            const result = await saveEmployeeRegistration({
              input,
              files,
              progress: progress.current,
              documents: identityDocuments,
              saveEmployee: async (value) => {
                const saved = await save.mutateAsync(value)
                setSavedEmployee(saved)
                return saved
              },
              saveDocument: saveDocument.mutateAsync,
              upload: uploadEmployeeFile,
              onPersisted: setSavedUid,
            })
            toast.success(
              isEdit ? 'Data karyawan diperbarui.' : 'Karyawan ditambahkan.'
            )
            await navigate({
              to: '/karyawan/data-karyawan/$employeeUid',
              params: { employeeUid: result.uid },
              search: { returnTo: listReturnTo },
              ignoreBlocker: true,
            })
          } catch (error) {
            setPartialFailure(Boolean(progress.current.employeeUid))
            throw error
          } finally {
            submitting.current = false
            setIsSaving(false)
          }
        }}
        onCancel={() =>
          savedUid
            ? navigate({
                to: '/karyawan/data-karyawan/$employeeUid',
                params: { employeeUid: savedUid! },
                search: { returnTo: listReturnTo },
              })
            : navigate({ to: listReturnTo })
        }
      />
    </Main>
  )
}

function byIdentityType(documents?: EmployeeDocument[]) {
  return {
    KTP: documents?.find((document) => document.documentType === 'KTP'),
    KK: documents?.find((document) => document.documentType === 'KK'),
  }
}
