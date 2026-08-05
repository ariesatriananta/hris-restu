import {
  useEffect,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import { z } from 'zod'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { safeInternalReturnTo } from '@/lib/list-return-to'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'
import { Main } from '@/components/layout/main'
import { uploadEmployeeFile } from '../data/files'
import {
  useContract,
  useContracts,
  useDocument,
  useEmployee,
  useEmployeeLookups,
  useSaveContract,
  useSaveDocument,
} from '../data/queries'
import type {
  EmployeeContract,
  EmployeeDocument,
  MockFileAttachment,
} from '../domain'
import {
  contractTypeRequiresEndDate,
  isSelectableContractType,
} from '../employee-contract-policy'
import { EmployeePicker } from './employee-picker'
import { FormActionBar } from './form-action-bar'

const contractSchema = z
  .object({
    employeeUid: z.string().min(1, 'Karyawan wajib dipilih.'),
    contractNumber: z.string().optional(),
    contractType: z.string().min(1, 'Jenis kontrak wajib dipilih.'),
    sequenceNumber: z.number().int().nonnegative().optional(),
    startDate: z.string().min(1),
    endDate: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'Tanggal berakhir tidak boleh sebelum tanggal mulai.',
  })
  .refine(
    (v) => !contractTypeRequiresEndDate(v.contractType) || Boolean(v.endDate),
    {
      path: ['endDate'],
      message: 'Tanggal berakhir wajib untuk kontrak Training atau PKWT.',
    }
  )
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
type ContractPeriod = '1' | '3' | '12' | 'CUSTOM'

export function EmployeeRecordFormPage({
  kind,
  recordUid,
  employeeUid,
  returnTo,
}: {
  kind: 'contract' | 'document'
  recordUid?: string
  employeeUid?: string
  returnTo?: string
}) {
  const navigate = useNavigate()
  const listReturnTo = safeInternalReturnTo(returnTo, '/karyawan/pkwt-dokumen')
  const goBack = (ignoreBlocker = false) => {
    navigate({ to: listReturnTo, ignoreBlocker })
  }
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
          <a href={listReturnTo}>Kembali</a>
        </Button>
      </Main>
    )
  return kind === 'contract' ? (
    <ContractForm
      record={contract.data}
      employeeUid={employeeUid}
      onBack={() => goBack()}
      onSaved={() => goBack(true)}
    />
  ) : (
    <DocumentForm
      record={document.data}
      employeeUid={employeeUid}
      onBack={() => goBack()}
      onSaved={() => goBack(true)}
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
  const lookups = useEmployeeLookups()
  const [file, setFile] = useState<File>()
  const [attachment, setAttachment] = useState<MockFileAttachment | undefined>(
    record?.issuedFile
  )
  const [contractPeriod, setContractPeriod] = useState<ContractPeriod>(() =>
    deriveContractPeriod(record?.startDate, record?.endDate)
  )
  const form = useForm<ContractValues>({
    resolver: zodResolver(contractSchema),
    defaultValues: {
      employeeUid: employeeUid ?? record?.employeeUid ?? '',
      contractNumber: record?.contractNumber ?? '',
      contractType: record?.contractType ?? 'PKWT',
      sequenceNumber: record?.sequenceNumber ?? 0,
      startDate: record?.startDate?.slice(0, 10) ?? '',
      endDate: record?.endDate?.slice(0, 10) ?? '',
      notes: record?.notes ?? '',
    },
  })
  const selectedEmployeeUid = useWatch({
    control: form.control,
    name: 'employeeUid',
  })
  const selectedEmployee = useEmployee(selectedEmployeeUid)
  const employeeContracts = useContracts(selectedEmployeeUid || undefined)
  const selectedContractType = useWatch({
    control: form.control,
    name: 'contractType',
  })
  const startDate = useWatch({ control: form.control, name: 'startDate' })
  const endDate = useWatch({ control: form.control, name: 'endDate' })
  const overlappingContract = findOverlappingContract(
    employeeContracts.data,
    startDate,
    endDate,
    record?.uid
  )
  const isCheckingContractOverlap = Boolean(
    selectedEmployeeUid && startDate && employeeContracts.isPending
  )
  const { confirmation } = useUnsavedChanges(form.formState.isDirty)
  useEffect(() => {
    const temporaryUrl = attachment?.temporaryUrl
    return () => {
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl)
    }
  }, [attachment?.temporaryUrl])
  const submit = async (value: ContractValues) => {
    if (!isSelectableContractType(value.contractType)) {
      form.setError('contractType', {
        message: 'Pilih jenis kontrak Training, PKWT, atau PKWTT.',
      })
      return
    }
    if (
      selectedEmployee.data?.joinDate &&
      value.startDate < selectedEmployee.data.joinDate
    ) {
      form.setError('startDate', {
        message:
          'Tanggal mulai kontrak tidak boleh sebelum tanggal bergabung karyawan.',
      })
      return
    }
    const overlap = findOverlappingContract(
      employeeContracts.data,
      value.startDate,
      value.endDate,
      record?.uid
    )
    if (overlap) {
      form.setError('startDate', {
        message: `Periode kontrak bertumpang tindih dengan ${overlap.contractNumber}.`,
      })
      return
    }
    const attachment = file
      ? await uploadEmployeeFile(file, value.employeeUid)
      : record?.issuedFile
    await save.mutateAsync({
      uid: record?.uid,
      input: {
        ...value,
        contractType: value.contractType,
        status: record?.status ?? 'DRAFT',
        contractNumber: record?.contractNumber ?? '',
        sequenceNumber: record?.sequenceNumber ?? 0,
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
      description='Kelola kontrak kerja dan lampirannya pada halaman penuh.'
      formId='contract-form'
      pending={save.isPending}
      submitDisabled={Boolean(overlappingContract) || isCheckingContractOverlap}
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
          <Input
            value={record?.contractNumber ?? 'Akan dibuat otomatis'}
            readOnly
            disabled
          />
        </Field>
        <Native
          label='Jenis kontrak'
          values={(lookups.data?.contractTypes ?? [])
            .filter((item) => isSelectableContractType(item.code))
            .map((item) => ({ value: item.code, label: item.name }))}
          disabled={
            lookups.isPending ||
            !lookups.data?.contractTypes.length ||
            Boolean(record && !['DRAFT', 'SCHEDULED'].includes(record.status))
          }
          {...form.register('contractType')}
        />
        <Field label='Urutan kontrak'>
          <Input
            value={record?.sequenceNumber ?? 'Ditentukan otomatis'}
            readOnly
            disabled
          />
        </Field>
        <DateField
          label='Tanggal mulai'
          error={form.formState.errors.startDate?.message}
          value={startDate}
          disabledDates={(date) =>
            Boolean(
              selectedEmployee.data?.joinDate &&
              dateToInput(date) < selectedEmployee.data.joinDate
            )
          }
          onChange={(date) => {
            const value = dateToInput(date)
            form.setValue('startDate', value, {
              shouldDirty: true,
              shouldValidate: true,
            })
            if (contractPeriod !== 'CUSTOM') {
              form.setValue(
                'endDate',
                calculateContractEndDate(value, Number(contractPeriod)),
                { shouldDirty: true, shouldValidate: true }
              )
            }
          }}
        />
        <Native
          label='Periode kontrak'
          values={[
            { value: '1', label: '1 bulan' },
            { value: '3', label: '3 bulan' },
            { value: '12', label: '12 bulan' },
            { value: 'CUSTOM', label: 'Custom' },
          ]}
          value={contractPeriod}
          onChange={(event) => {
            const value = event.target.value as ContractPeriod
            setContractPeriod(value)
            if (value !== 'CUSTOM') {
              form.setValue(
                'endDate',
                calculateContractEndDate(startDate, Number(value)),
                { shouldDirty: true, shouldValidate: true }
              )
            }
          }}
        />
        <DateField
          label={
            contractTypeRequiresEndDate(selectedContractType)
              ? 'Tanggal berakhir'
              : 'Tanggal berakhir (opsional)'
          }
          error={form.formState.errors.endDate?.message}
          value={endDate}
          onChange={(date) => {
            setContractPeriod('CUSTOM')
            form.setValue('endDate', dateToInput(date), {
              shouldDirty: true,
              shouldValidate: true,
            })
          }}
        />
        {overlappingContract && (
          <Alert variant='destructive' className='sm:col-span-2'>
            <AlertTriangle className='size-4' />
            <AlertDescription>
              Periode kontrak bertumpang tindih dengan{' '}
              {overlappingContract.contractNumber} (
              {formatInputDate(overlappingContract.startDate)} -{' '}
              {formatInputDate(overlappingContract.endDate)}). Ubah tanggal
              mulai atau tanggal berakhir sebelum menyimpan.
            </AlertDescription>
          </Alert>
        )}
        {isCheckingContractOverlap && (
          <p className='text-sm text-muted-foreground sm:col-span-2'>
            Memeriksa periode kontrak karyawan...
          </p>
        )}
        <Field label='Status workflow'>
          <Input value={record?.status ?? 'DRAFT'} readOnly disabled />
        </Field>
        <Field label='Scan kontrak asli bertanda tangan (opsional)'>
          <ContractAttachmentPreview attachment={attachment} />
          <Input
            type='file'
            accept='.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png'
            onChange={(e) => {
              const nextFile = e.target.files?.[0]
              if (!nextFile) return
              setFile(nextFile)
              setAttachment(attachmentFromFile(nextFile))
            }}
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
  const issuedDate = useWatch({ control: form.control, name: 'issuedDate' })
  const expiryDate = useWatch({ control: form.control, name: 'expiryDate' })
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
        <DateField
          label='Tanggal terbit'
          value={issuedDate}
          onChange={(date) =>
            form.setValue('issuedDate', dateToInput(date), {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
        <DateField
          label='Tanggal kedaluwarsa'
          value={expiryDate}
          onChange={(date) =>
            form.setValue('expiryDate', dateToInput(date), {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        />
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

function DateField({
  label,
  error,
  value,
  onChange,
  disabledDates,
}: {
  label: string
  error?: string
  value?: string
  onChange: (date: Date | undefined) => void
  disabledDates?: (date: Date) => boolean
}) {
  return (
    <Field label={label} error={error}>
      <DatePicker
        selected={dateFromInput(value)}
        onSelect={onChange}
        disabledDates={disabledDates}
      />
    </Field>
  )
}

function ContractAttachmentPreview({
  attachment,
}: {
  attachment?: MockFileAttachment
}) {
  const url = attachment?.temporaryUrl ?? attachment?.url
  if (!attachment || !url) {
    return (
      <p className='rounded-md border border-dashed p-3 text-sm text-muted-foreground'>
        Belum ada lampiran. PDF akan dapat dipratinjau di sini.
      </p>
    )
  }

  if (attachment.mimeType === 'application/pdf') {
    return (
      <div className='overflow-hidden rounded-md border bg-muted'>
        <iframe
          title={`Pratinjau ${attachment.originalName}`}
          src={url}
          className='h-72 w-full bg-background'
        />
      </div>
    )
  }

  return (
    <p className='rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground'>
      {attachment.originalName} — pratinjau tidak tersedia untuk tipe file ini.
    </p>
  )
}

function RecordLayout({
  title,
  description,
  formId,
  pending,
  submitDisabled,
  submitLabel,
  onCancel,
  confirmation,
  children,
}: {
  title: string
  description: string
  formId: string
  pending: boolean
  submitDisabled?: boolean
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
        disabled={submitDisabled}
        submitLabel={submitLabel}
        onCancel={onCancel}
      />
      {confirmation}
    </Main>
  )
}

function findOverlappingContract(
  contracts: EmployeeContract[] | undefined,
  startDate: string,
  endDate: string | undefined,
  exceptUid?: string
) {
  if (!contracts?.length || !startDate) return undefined
  const nextEndDate = endDate || '9999-12-31'
  return contracts.find((contract) => {
    if (contract.uid === exceptUid) return false
    if (contract.status === 'CANCELLED') {
      return false
    }
    return (
      contract.startDate <= nextEndDate &&
      (contract.endDate || '9999-12-31') >= startDate
    )
  })
}

function formatInputDate(value?: string) {
  return value?.slice(0, 10) || 'tanpa tanggal akhir'
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

function dateFromInput(value?: string) {
  if (!value) return undefined
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function dateToInput(value?: Date) {
  if (!value) return ''
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function calculateContractEndDate(startDate: string, months: number) {
  if (!startDate) return ''
  const [year, month, day] = startDate.split('-').map(Number)
  const targetMonthIndex = month - 1 + months
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const targetMonth = targetMonthIndex % 12
  const lastDayOfTargetMonth = new Date(
    targetYear,
    targetMonth + 1,
    0
  ).getDate()
  const endDate = new Date(
    targetYear,
    targetMonth,
    Math.min(day, lastDayOfTargetMonth)
  )
  endDate.setDate(endDate.getDate() - 1)
  return dateToInput(endDate)
}

function deriveContractPeriod(startDate?: string, endDate?: string) {
  const normalizedStartDate = startDate?.slice(0, 10) ?? ''
  const normalizedEndDate = endDate?.slice(0, 10) ?? ''
  const months = ([1, 3, 12] as const).find(
    (months) =>
      calculateContractEndDate(normalizedStartDate, months) ===
      normalizedEndDate
  )
  return months ? (String(months) as ContractPeriod) : 'CUSTOM'
}

function attachmentFromFile(file: File): MockFileAttachment {
  return {
    uid: '',
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    extension: file.name.split('.').pop(),
    temporaryUrl: URL.createObjectURL(file),
  }
}

function Native({
  label,
  values,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  values: Array<string | { value: string; label: string; disabled?: boolean }>
}) {
  return (
    <Field label={label}>
      <select
        className='h-9 rounded-md border bg-background px-3 text-sm'
        {...props}
      >
        {values.map((item) => {
          const option =
            typeof item === 'string' ? { value: item, label: item } : item
          return (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          )
        })}
      </select>
    </Field>
  )
}
