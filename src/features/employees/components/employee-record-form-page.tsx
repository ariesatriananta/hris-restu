import { useState, type ReactNode, type SelectHTMLAttributes } from 'react'
import { z } from 'zod'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Main } from '@/components/layout/main'
import { uploadEmployeeFile } from '../data/files'
import {
  useContract,
  useDocument,
  useSaveContract,
  useSaveDocument,
} from '../data/queries'
import type { EmployeeContract, EmployeeDocument } from '../domain'
import { EmployeePicker } from './employee-picker'
import { FormActionBar } from './form-action-bar'

const contractSchema = z
  .object({
    employeeUid: z.string().min(1, 'Karyawan wajib dipilih.'),
    contractNumber: z.string().min(1, 'Nomor kontrak wajib diisi.'),
    contractType: z.enum(['PKWT', 'PKWTT', 'OTHER']),
    sequenceNumber: z.number().int().positive(),
    startDate: z.string().min(1),
    endDate: z.string().optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED']),
    notes: z.string().optional(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'Tanggal berakhir tidak boleh sebelum tanggal mulai.',
  })
const documentSchema = z.object({
  employeeUid: z.string().min(1, 'Karyawan wajib dipilih.'),
  documentType: z.string().min(1, 'Tipe dokumen wajib diisi.'),
  name: z.string().min(1, 'Nama dokumen wajib diisi.'),
  documentNumber: z.string().optional(),
  issuedDate: z.string().optional(),
  expiryDate: z.string().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED']),
  notes: z.string().optional(),
})
type ContractValues = z.infer<typeof contractSchema>
type DocumentValues = z.infer<typeof documentSchema>

export function EmployeeRecordFormPage({
  kind,
  recordUid,
  employeeUid,
}: {
  kind: 'contract' | 'document'
  recordUid?: string
  employeeUid?: string
}) {
  const navigate = useNavigate()
  const contract = useContract(
    kind === 'contract' && recordUid ? recordUid : ''
  )
  const document = useDocument(
    kind === 'document' && recordUid ? recordUid : ''
  )
  const isLoading =
    Boolean(recordUid) &&
    (kind === 'contract' ? contract.isPending : document.isPending)
  const failed =
    Boolean(recordUid) &&
    (kind === 'contract' ? contract.isError : document.isError)
  if (isLoading) return <Main>Memuat data...</Main>
  if (
    failed ||
    (recordUid && !(kind === 'contract' ? contract.data : document.data))
  )
    return (
      <Main>
        <p>Data tidak ditemukan.</p>
        <Button className='mt-3' asChild>
          <Link to='/karyawan/pkwt-dokumen'>Kembali</Link>
        </Button>
      </Main>
    )
  return kind === 'contract' ? (
    <ContractForm
      record={contract.data}
      employeeUid={employeeUid}
      onBack={() => navigate({ to: '/karyawan/pkwt-dokumen' })}
      onSaved={() =>
        navigate({ to: '/karyawan/pkwt-dokumen', ignoreBlocker: true })
      }
    />
  ) : (
    <DocumentForm
      record={document.data}
      employeeUid={employeeUid}
      onBack={() => navigate({ to: '/karyawan/pkwt-dokumen' })}
      onSaved={() =>
        navigate({ to: '/karyawan/pkwt-dokumen', ignoreBlocker: true })
      }
    />
  )
}

function ContractForm({
  record,
  employeeUid,
  onBack,
  onSaved,
}: {
  record?: EmployeeContract
  employeeUid?: string
  onBack: () => void
  onSaved: () => void
}) {
  const save = useSaveContract()
  const [file, setFile] = useState<File>()
  const form = useForm<ContractValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      employeeUid: employeeUid ?? record?.employeeUid ?? '',
      contractNumber: record?.contractNumber ?? '',
      contractType: record?.contractType ?? 'PKWT',
      sequenceNumber: record?.sequenceNumber ?? 1,
      startDate: record?.startDate?.slice(0, 10) ?? '',
      endDate: record?.endDate?.slice(0, 10) ?? '',
      status: record?.status ?? 'DRAFT',
      notes: record?.notes ?? '',
    },
  })
  const selectedEmployeeUid = useWatch({
    control: form.control,
    name: 'employeeUid',
  })
  const { confirmation } = useUnsavedChanges(form.formState.isDirty)
  const submit = async (value: ContractValues) => {
    const attachment = file
      ? await uploadEmployeeFile(file, value.employeeUid)
      : record?.issuedFile
    await save.mutateAsync({
      uid: record?.uid,
      input: {
        ...value,
        endDate: value.endDate || undefined,
        notes: value.notes || undefined,
        issuedFile: attachment,
      },
    })
    toast.success(record ? 'Kontrak diperbarui.' : 'Kontrak ditambahkan.')
    form.reset(value)
    onSaved()
  }
  return (
    <RecordLayout
      title={record ? 'Ubah kontrak' : 'Tambah kontrak'}
      description='Kelola PKWT dan lampirannya pada halaman penuh.'
      formId='contract-form'
      pending={save.isPending}
      submitLabel='Simpan kontrak'
      onCancel={onBack}
      confirmation={confirmation}
    >
      <form
        id='contract-form'
        className='grid gap-4 pb-24 sm:grid-cols-2'
        onSubmit={form.handleSubmit(submit)}
      >
        <EmployeePicker
          value={selectedEmployeeUid}
          onChange={(v) =>
            form.setValue('employeeUid', v, { shouldDirty: true })
          }
          locked={Boolean(employeeUid || record)}
        />
        <Field
          label='Nomor kontrak'
          error={form.formState.errors.contractNumber?.message}
        >
          <Input {...form.register('contractNumber')} />
        </Field>
        <Native
          label='Jenis kontrak'
          values={['PKWT', 'PKWTT', 'OTHER']}
          {...form.register('contractType')}
        />
        <Field label='Urutan kontrak'>
          <Input
            type='number'
            {...form.register('sequenceNumber', { valueAsNumber: true })}
          />
        </Field>
        <Field label='Tanggal mulai'>
          <Input type='date' {...form.register('startDate')} />
        </Field>
        <Field
          label='Tanggal berakhir'
          error={form.formState.errors.endDate?.message}
        >
          <Input type='date' {...form.register('endDate')} />
        </Field>
        <Native
          label='Status'
          values={['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED']}
          {...form.register('status')}
        />
        <Field label='Lampiran kontrak (opsional)'>
          <Input
            type='file'
            accept='.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </Field>
        <div className='sm:col-span-2'>
          <Field label='Catatan'>
            <Textarea {...form.register('notes')} />
          </Field>
        </div>
      </form>
    </RecordLayout>
  )
}

function DocumentForm({
  record,
  employeeUid,
  onBack,
  onSaved,
}: {
  record?: EmployeeDocument
  employeeUid?: string
  onBack: () => void
  onSaved: () => void
}) {
  const save = useSaveDocument()
  const [file, setFile] = useState<File>()
  const form = useForm<DocumentValues>({
    resolver: zodResolver(documentSchema),
    defaultValues: {
      employeeUid: employeeUid ?? record?.employeeUid ?? '',
      documentType: record?.documentType ?? '',
      name: record?.name ?? '',
      documentNumber: record?.documentNumber ?? '',
      issuedDate: record?.issuedDate?.slice(0, 10) ?? '',
      expiryDate: record?.expiryDate?.slice(0, 10) ?? '',
      status: record?.status ?? 'ACTIVE',
      notes: record?.notes ?? '',
    },
  })
  const selectedEmployeeUid = useWatch({
    control: form.control,
    name: 'employeeUid',
  })
  const { confirmation } = useUnsavedChanges(form.formState.isDirty)
  const submit = async (value: DocumentValues) => {
    const attachment = file
      ? await uploadEmployeeFile(file, value.employeeUid)
      : record?.file
    if (!attachment) {
      form.setError('root', { message: 'File dokumen wajib dipilih.' })
      return
    }
    await save.mutateAsync({
      uid: record?.uid,
      input: {
        ...value,
        documentNumber: value.documentNumber || undefined,
        issuedDate: value.issuedDate || undefined,
        expiryDate: value.expiryDate || undefined,
        notes: value.notes || undefined,
        file: attachment,
      },
    })
    toast.success(record ? 'Dokumen diperbarui.' : 'Dokumen ditambahkan.')
    form.reset(value)
    onSaved()
  }
  return (
    <RecordLayout
      title={record ? 'Ubah dokumen' : 'Tambah dokumen'}
      description='Kelola metadata dan file dokumen karyawan.'
      formId='document-form'
      pending={save.isPending}
      submitLabel='Simpan dokumen'
      onCancel={onBack}
      confirmation={confirmation}
    >
      <form
        id='document-form'
        className='grid gap-4 pb-24 sm:grid-cols-2'
        onSubmit={form.handleSubmit(submit)}
      >
        <EmployeePicker
          value={selectedEmployeeUid}
          onChange={(v) =>
            form.setValue('employeeUid', v, { shouldDirty: true })
          }
          locked={Boolean(employeeUid || record)}
        />
        <Field
          label='Tipe dokumen'
          error={form.formState.errors.documentType?.message}
        >
          <Input {...form.register('documentType')} />
        </Field>
        <Field label='Nama dokumen' error={form.formState.errors.name?.message}>
          <Input {...form.register('name')} />
        </Field>
        <Field label='Nomor dokumen'>
          <Input {...form.register('documentNumber')} />
        </Field>
        <Field label='Tanggal terbit'>
          <Input type='date' {...form.register('issuedDate')} />
        </Field>
        <Field label='Tanggal kedaluwarsa'>
          <Input type='date' {...form.register('expiryDate')} />
        </Field>
        <Native
          label='Status'
          values={['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED']}
          {...form.register('status')}
        />
        <Field label='File dokumen' error={form.formState.errors.root?.message}>
          <Input
            type='file'
            accept='.pdf,.docx,image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </Field>
        <div className='sm:col-span-2'>
          <Field label='Catatan'>
            <Textarea {...form.register('notes')} />
          </Field>
        </div>
      </form>
    </RecordLayout>
  )
}

function RecordLayout({
  title,
  description,
  formId,
  pending,
  submitLabel,
  onCancel,
  confirmation,
  children,
}: {
  title: string
  description: string
  formId: string
  pending: boolean
  submitLabel: string
  onCancel: () => void
  confirmation: ReactNode
  children: ReactNode
}) {
  return (
    <Main className='max-w-4xl'>
      <Button variant='ghost' className='mb-3 -ml-3' onClick={onCancel}>
        <ArrowLeft /> PKWT & Dokumen
      </Button>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold'>{title}</h1>
        <p className='text-muted-foreground'>{description}</p>
      </div>
      {children}
      <FormActionBar
        formId={formId}
        isPending={pending}
        submitLabel={submitLabel}
        onCancel={onCancel}
      />
      {confirmation}
    </Main>
  )
}
function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className='grid gap-1 text-sm'>
      <span>{label}</span>
      {children}
      {error && (
        <span className='text-xs text-destructive'>{String(error)}</span>
      )}
    </label>
  )
}
function Native({
  label,
  values,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  values: string[]
}) {
  return (
    <Field label={label}>
      <select
        className='h-9 rounded-md border bg-background px-3 text-sm'
        {...props}
      >
        {values.map((v: string) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </Field>
  )
}
