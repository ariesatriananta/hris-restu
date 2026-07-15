import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Main } from '@/components/layout/main'
import { uploadEmployeeFile } from '../data/files'
import {
  useDocuments,
  useEmployee,
  useSaveDocument,
  useSaveEmployee,
} from '../data/queries'
import type { EmployeeDocument } from '../domain'
import { EmployeeForm } from './employee-form'

export function EmployeeFormPage({ employeeUid }: { employeeUid?: string }) {
  const navigate = useNavigate()
  const employee = useEmployee(employeeUid ?? '')
  const documents = useDocuments(employeeUid)
  const save = useSaveEmployee()
  const saveDocument = useSaveDocument()
  const isEdit = Boolean(employeeUid)

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
      </div>
      <EmployeeForm
        employee={isEdit ? (employee.data ?? undefined) : undefined}
        identityDocuments={identityDocuments}
        isPending={save.isPending || saveDocument.isPending}
        onSubmit={async (input, files) => {
          const result = await save.mutateAsync({ input, uid: employeeUid })
          if (files.photo) {
            const photo = await uploadEmployeeFile(files.photo, result.uid)
            await save.mutateAsync({
              input: { ...input, photo },
              uid: result.uid,
            })
          }
          await saveIdentityDocuments({
            employeeUid: result.uid,
            nationalIdFile: files.nationalId,
            familyCardFile: files.familyCard,
            nationalIdNumber: input.nationalIdNumber,
            familyCardNumber: input.familyCardNumber,
            documents: identityDocuments,
            save: saveDocument.mutateAsync,
          })
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

function byIdentityType(documents?: EmployeeDocument[]) {
  return {
    KTP: documents?.find((document) => document.documentType === 'KTP'),
    KK: documents?.find((document) => document.documentType === 'KK'),
  }
}

async function saveIdentityDocuments({
  employeeUid,
  nationalIdFile,
  familyCardFile,
  nationalIdNumber,
  familyCardNumber,
  documents,
  save,
}: {
  employeeUid: string
  nationalIdFile?: File
  familyCardFile?: File
  nationalIdNumber?: string
  familyCardNumber?: string
  documents: ReturnType<typeof byIdentityType>
  save: ReturnType<typeof useSaveDocument>['mutateAsync']
}) {
  const entries = [
    {
      type: 'KTP' as const,
      file: nationalIdFile,
      number: nationalIdNumber,
      name: 'Foto KTP',
      current: documents.KTP,
    },
    {
      type: 'KK' as const,
      file: familyCardFile,
      number: familyCardNumber,
      name: 'Foto Kartu Keluarga',
      current: documents.KK,
    },
  ]

  for (const entry of entries) {
    if (!entry.file) continue
    const attachment = await uploadEmployeeFile(entry.file, employeeUid)
    await save({
      uid: entry.current?.uid,
      input: {
        employeeUid,
        documentType: entry.type,
        name: entry.name,
        documentNumber: entry.number,
        issuedDate: entry.current?.issuedDate,
        expiryDate: entry.current?.expiryDate,
        status: entry.current?.status ?? 'ACTIVE',
        notes: entry.current?.notes,
        file: attachment,
      },
    })
  }
}
