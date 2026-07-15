import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useForm, useWatch, type UseFormSetValue } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'
import { useEmployeeLookups } from '../data/queries'
import type {
  Employee,
  EmployeeDocument,
  EmployeeInput,
  MockFileAttachment,
} from '../domain'
import { FormActionBar } from './form-action-bar'

const optionalText = z.string().optional()
const schema = z
  .object({
    fullName: z.string().min(2, 'Nama lengkap wajib diisi.'),
    nickname: optionalText,
    employeeType: z.enum(['BORONGAN', 'BULANAN']),
    employeeStatus: z.enum(['ACTIVE', 'RESIGNED', 'INACTIVE', 'LEAVE']),
    site: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']),
    department: optionalText,
    position: optionalText,
    workGroup: optionalText,
    joinDate: z.string().min(1, 'Tanggal bergabung wajib diisi.'),
    permanentDate: optionalText,
    resignDate: optionalText,
    resignReason: optionalText,
    gender: z.enum(['MALE', 'FEMALE']),
    birthPlace: optionalText,
    birthDate: optionalText,
    maritalStatus: z
      .enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', ''])
      .optional(),
    religion: optionalText,
    address: optionalText,
    city: optionalText,
    province: optionalText,
    postalCode: optionalText,
    phone: optionalText,
    emergencyContactName: optionalText,
    emergencyContactPhone: optionalText,
    emergencyContactRelation: optionalText,
    nationalIdNumber: optionalText,
    familyCardNumber: optionalText,
    taxNumber: optionalText,
    bankName: optionalText,
    bankAccountNumber: optionalText,
    bankAccountName: optionalText,
    bpjsHealthNumber: optionalText,
    bpjsEmploymentNumber: optionalText,
    notes: optionalText,
  })
  .refine((value) => !value.resignDate || value.resignDate >= value.joinDate, {
    path: ['resignDate'],
    message: 'Tanggal resign tidak boleh sebelum tanggal bergabung.',
  })

type Values = z.infer<typeof schema>
const formFieldNames = new Set<keyof Values>(schema.keyof().options)
const empty = (value?: string) => value?.trim() || undefined

const personalFields: [keyof Values, string, string?][] = [
  ['birthPlace', 'Tempat lahir'],
  ['birthDate', 'Tanggal lahir', 'date'],
  ['religion', 'Agama'],
  ['nationalIdNumber', 'NIK'],
  ['familyCardNumber', 'Nomor kartu keluarga'],
]
const contactFields: [keyof Values, string][] = [
  ['city', 'Kota'],
  ['province', 'Provinsi'],
  ['postalCode', 'Kode pos'],
  ['phone', 'Nomor telepon'],
]
const sensitiveFields: [keyof Values, string][] = [
  ['emergencyContactName', 'Nama kontak darurat'],
  ['emergencyContactPhone', 'Telepon kontak darurat'],
  ['emergencyContactRelation', 'Hubungan'],
  ['taxNumber', 'NPWP'],
  ['bpjsHealthNumber', 'BPJS Kesehatan'],
  ['bpjsEmploymentNumber', 'BPJS Ketenagakerjaan'],
  ['bankName', 'Bank'],
  ['bankAccountNumber', 'Nomor rekening'],
  ['bankAccountName', 'Nama pemilik rekening'],
]

export function EmployeeForm({
  employee,
  identityDocuments,
  onSubmit,
  onCancel,
  isPending,
  disableLookupQuery = false,
}: {
  employee?: Employee
  identityDocuments?: Partial<Record<'KTP' | 'KK', EmployeeDocument>>
  onSubmit: (
    input: EmployeeInput,
    files: { photo?: File; nationalId?: File; familyCard?: File }
  ) => void | Promise<void>
  onCancel: () => void
  isPending?: boolean
  disableLookupQuery?: boolean
}) {
  const [photo, setPhoto] = useState<MockFileAttachment | undefined>(
    employee?.photo
  )
  const [photoFile, setPhotoFile] = useState<File>()
  const [nationalIdPhoto, setNationalIdPhoto] = useState<
    MockFileAttachment | undefined
  >(identityDocuments?.KTP?.file)
  const [nationalIdFile, setNationalIdFile] = useState<File>()
  const [familyCardPhoto, setFamilyCardPhoto] = useState<
    MockFileAttachment | undefined
  >(identityDocuments?.KK?.file)
  const [familyCardFile, setFamilyCardFile] = useState<File>()
  const [isUploading, setIsUploading] = useState(false)
  const lookups = useEmployeeLookups(!disableLookupQuery)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: employee?.fullName ?? '',
      nickname: employee?.nickname ?? '',
      employeeType: employee?.employeeType ?? 'BORONGAN',
      employeeStatus: employee?.employeeStatus ?? 'INACTIVE',
      site: employee?.site ?? 'JEPARA',
      department: employee?.department ?? '',
      position: employee?.position ?? '',
      workGroup: employee?.workGroup ?? '',
      joinDate: dateInput(employee?.joinDate),
      permanentDate: dateInput(employee?.permanentDate),
      resignDate: dateInput(employee?.resignDate),
      resignReason: employee?.resignReason ?? '',
      gender: employee?.gender ?? 'MALE',
      birthPlace: employee?.birthPlace ?? '',
      birthDate: dateInput(employee?.birthDate),
      maritalStatus: employee?.maritalStatus ?? '',
      religion: employee?.religion ?? '',
      address: employee?.address ?? '',
      city: employee?.city ?? '',
      province: employee?.province ?? '',
      postalCode: employee?.postalCode ?? '',
      phone: employee?.phone ?? '',
      emergencyContactName: employee?.emergencyContactName ?? '',
      emergencyContactPhone: employee?.emergencyContactPhone ?? '',
      emergencyContactRelation: employee?.emergencyContactRelation ?? '',
      nationalIdNumber: employee?.nationalIdNumber ?? '',
      familyCardNumber: employee?.familyCardNumber ?? '',
      taxNumber: employee?.taxNumber ?? '',
      bankName: employee?.bankName ?? '',
      bankAccountNumber: employee?.bankAccountNumber ?? '',
      bankAccountName: employee?.bankAccountName ?? '',
      bpjsHealthNumber: employee?.bpjsHealthNumber ?? '',
      bpjsEmploymentNumber: employee?.bpjsEmploymentNumber ?? '',
      notes: employee?.notes ?? '',
    },
  })
  const { confirmation } = useUnsavedChanges(form.formState.isDirty)
  const photoUrl = photo?.temporaryUrl ?? photo?.url

  useEffect(() => {
    const temporaryUrl = photo?.temporaryUrl
    return () => {
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl)
    }
  }, [photo?.temporaryUrl])
  useEffect(
    () => revokeTemporaryUrl(nationalIdPhoto?.temporaryUrl),
    [nationalIdPhoto?.temporaryUrl]
  )
  useEffect(
    () => revokeTemporaryUrl(familyCardPhoto?.temporaryUrl),
    [familyCardPhoto?.temporaryUrl]
  )

  const submit = async (values: Values) => {
    setIsUploading(true)
    try {
      const lockedPlacement = employee
        ? {
            employeeType: employee.employeeType,
            employeeStatus: employee.employeeStatus,
            site: employee.site,
            department: employee.department,
            position: employee.position,
            workGroup: employee.workGroup,
          }
        : {
            employeeType: values.employeeType,
            employeeStatus: values.employeeStatus,
            site: values.site,
            department: empty(values.department),
            position: empty(values.position),
            workGroup: empty(values.workGroup),
          }
      await onSubmit(
        {
          fullName: values.fullName.trim(),
          nickname: empty(values.nickname),
          ...lockedPlacement,
          joinDate: values.joinDate,
          permanentDate: empty(values.permanentDate),
          resignDate: employee?.resignDate ?? empty(values.resignDate),
          resignReason: employee?.resignReason ?? empty(values.resignReason),
          gender: values.gender,
          birthPlace: empty(values.birthPlace),
          birthDate: empty(values.birthDate),
          maritalStatus: values.maritalStatus || undefined,
          religion: empty(values.religion),
          address: empty(values.address),
          city: empty(values.city),
          province: empty(values.province),
          postalCode: empty(values.postalCode),
          phone: empty(values.phone),
          emergencyContactName: empty(values.emergencyContactName),
          emergencyContactPhone: empty(values.emergencyContactPhone),
          emergencyContactRelation: empty(values.emergencyContactRelation),
          nationalIdNumber: empty(values.nationalIdNumber),
          familyCardNumber: empty(values.familyCardNumber),
          taxNumber: empty(values.taxNumber),
          bankName: empty(values.bankName),
          bankAccountNumber: empty(values.bankAccountNumber),
          bankAccountName: empty(values.bankAccountName),
          bpjsHealthNumber: empty(values.bpjsHealthNumber),
          bpjsEmploymentNumber: empty(values.bpjsEmploymentNumber),
          photo,
          notes: empty(values.notes),
        },
        {
          photo: photoFile,
          nationalId: nationalIdFile,
          familyCard: familyCardFile,
        }
      )
      form.reset(values)
    } catch (error) {
      applyServerFieldErrors(error, form.setError)
      throw error
    } finally {
      setIsUploading(false)
    }
  }

  const select = (
    name: keyof Values,
    label: string,
    options: { value: string; label: string }[],
    disabled = false
  ) => (
    <Field
      key={name}
      label={label}
      error={form.formState.errors[name]?.message}
    >
      <select
        className='h-9 rounded-md border bg-background px-3 disabled:cursor-not-allowed disabled:opacity-60'
        disabled={disabled}
        {...form.register(name)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )

  const textField = (name: keyof Values, label: string, type = 'text') => (
    <Field
      key={name}
      label={label}
      error={form.formState.errors[name]?.message}
    >
      {type === 'date' ? (
        <FormDatePicker
          control={form.control}
          name={name}
          setValue={form.setValue}
        />
      ) : (
        <Input type={type} {...form.register(name)} />
      )}
    </Field>
  )
  const selectedSite = useWatch({ control: form.control, name: 'site' })
  const selectedJoinDate = useWatch({ control: form.control, name: 'joinDate' })
  const currentFullName = useWatch({ control: form.control, name: 'fullName' })
  const resignDate = useWatch({ control: form.control, name: 'resignDate' })
  const sites = lookups.data?.sites ?? []
  const employeeNumberPreview = employee
    ? employee.employeeNumber
    : formatEmployeeNumberPreview(
        sites.find((site) => site.code === selectedSite)?.employeeNumberPrefix,
        selectedJoinDate
      )
  const departments = (lookups.data?.departments ?? []).filter(
    (item) => !item.siteCode || item.siteCode === selectedSite
  )
  const positions = lookups.data?.positions ?? []
  const workGroups = (lookups.data?.workGroups ?? []).filter(
    (item) => !item.siteCode || item.siteCode === selectedSite
  )

  return (
    <>
      <form
        id='employee-form'
        onSubmit={form.handleSubmit(submit)}
        className='space-y-6 pb-24'
      >
        <section className='space-y-3'>
          <h3 className='font-semibold'>Identitas kerja</h3>
          <div className='grid gap-3 sm:grid-cols-2'>
            <Field label='Employee ID'>
              <Input value={employeeNumberPreview} readOnly disabled />
            </Field>
            {textField('fullName', 'Nama lengkap')}
            {textField('nickname', 'Nama panggilan')}
            {select(
              'employeeType',
              'Jenis karyawan',
              [
                { value: 'BORONGAN', label: 'Borongan' },
                { value: 'BULANAN', label: 'Bulanan' },
              ],
              !!employee
            )}
            {select(
              'employeeStatus',
              'Status',
              employee?.employeeStatus === 'LEAVE'
                ? [{ value: 'LEAVE', label: 'Cuti (legacy)' }]
                : [{ value: 'INACTIVE', label: 'Nonaktif' }],
              true
            )}
            {select(
              'site',
              'Site',
              sites.map((item) => ({ value: item.code, label: item.name })),
              !!employee
            )}
            {select(
              'department',
              'Departemen',
              [
                { value: '', label: 'Pilih departemen' },
                ...departments.map((item) => ({
                  value: item.name,
                  label: item.name,
                })),
              ],
              !!employee
            )}
            {select(
              'position',
              'Jabatan',
              [
                { value: '', label: 'Pilih jabatan' },
                ...positions.map((item) => ({
                  value: item.name,
                  label: item.name,
                })),
              ],
              !!employee
            )}
            {select(
              'workGroup',
              'Kelompok kerja',
              [
                { value: '', label: 'Pilih kelompok' },
                ...workGroups.map((item) => ({
                  value: item.name,
                  label: item.name,
                })),
              ],
              !!employee
            )}
            {textField('joinDate', 'Tanggal bergabung', 'date')}
            {textField('permanentDate', 'Tanggal tetap', 'date')}
            <Field
              label='Tanggal resign'
              error={form.formState.errors.resignDate?.message}
            >
              <DatePicker
                selected={dateFromInput(resignDate)}
                onSelect={() => undefined}
                disabled
              />
            </Field>
            <Field label='Alasan resign'>
              <Input disabled {...form.register('resignReason')} />
            </Field>
            {select('gender', 'Jenis kelamin', [
              { value: 'MALE', label: 'Laki-laki' },
              { value: 'FEMALE', label: 'Perempuan' },
            ])}
            {select('maritalStatus', 'Status perkawinan', [
              { value: '', label: 'Belum diisi' },
              { value: 'SINGLE', label: 'Belum menikah' },
              { value: 'MARRIED', label: 'Menikah' },
              { value: 'DIVORCED', label: 'Cerai' },
              { value: 'WIDOWED', label: 'Duda/Janda' },
            ])}
          </div>
          {employee && (
            <p className='rounded-md bg-muted p-3 text-xs text-muted-foreground'>
              Penempatan, jenis, status, dan data resign dikelola melalui Catat
              Mutasi agar perubahan masuk ke histori. Tanggal bergabung dapat
              dikoreksi tanpa mengubah Employee ID.
            </p>
          )}
        </section>

        <section className='space-y-3 border-t pt-5'>
          <h3 className='font-semibold'>Identitas pribadi</h3>
          <div className='grid gap-3 sm:grid-cols-2'>
            {personalFields.map(([name, label, type]) =>
              textField(name, label, type)
            )}
          </div>
        </section>

        <section className='space-y-3 border-t pt-5'>
          <h3 className='font-semibold'>Alamat & kontak</h3>
          <Field label='Alamat'>
            <Textarea {...form.register('address')} />
          </Field>
          <div className='grid gap-3 sm:grid-cols-2'>
            {contactFields.map(([name, label]) => textField(name, label))}
          </div>
        </section>

        <section className='space-y-3 border-t pt-5'>
          <h3 className='font-semibold'>Data darurat & legal</h3>
          <div className='grid gap-3 sm:grid-cols-2'>
            {sensitiveFields.map(([name, label]) => textField(name, label))}
          </div>
        </section>

        <section className='space-y-3 border-t pt-5'>
          <h3 className='font-semibold'>Foto karyawan dan identitas</h3>
          <div className='flex flex-col gap-4 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center'>
            <Avatar className='size-28 rounded-xl border bg-background shadow-sm'>
              <AvatarImage
                src={photoUrl}
                alt={photo ? `Foto ${employee?.fullName ?? 'karyawan'}` : ''}
                className='object-cover'
              />
              <AvatarFallback className='rounded-xl bg-primary/10 text-2xl font-semibold text-primary'>
                {initials(employee?.fullName ?? currentFullName)}
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0 flex-1 space-y-2'>
              <div>
                <p className='font-medium'>Foto karyawan</p>
                <p className='text-sm text-muted-foreground'>
                  {photo?.originalName ??
                    'Belum ada foto. Pilih foto wajah yang jelas.'}
                </p>
              </div>
              <Input
                type='file'
                accept='image/png,image/jpeg,image/webp'
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (!file) return
                  setPhotoFile(file)
                  setPhoto({
                    uid: '',
                    originalName: file.name,
                    mimeType: file.type || 'application/octet-stream',
                    sizeBytes: file.size,
                    extension: file.name.split('.').pop(),
                    temporaryUrl: URL.createObjectURL(file),
                  })
                }}
              />
              <div className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                <span>
                  PNG, JPG, atau WebP. Foto diunggah saat form disimpan.
                </span>
                {photo && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='h-auto px-1 text-destructive hover:text-destructive'
                    onClick={() => {
                      setPhoto(undefined)
                      setPhotoFile(undefined)
                    }}
                  >
                    Hapus foto
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className='grid gap-4 md:grid-cols-2'>
            <ImageUploadCard
              label='Foto KTP'
              description='Foto atau scan KTP yang terbaca jelas.'
              attachment={nationalIdPhoto}
              onSelect={(file) => {
                setNationalIdFile(file)
                setNationalIdPhoto(attachmentFromFile(file))
              }}
            />
            <ImageUploadCard
              label='Foto KK'
              description='Foto atau scan Kartu Keluarga yang terbaca jelas.'
              attachment={familyCardPhoto}
              onSelect={(file) => {
                setFamilyCardFile(file)
                setFamilyCardPhoto(attachmentFromFile(file))
              }}
            />
          </div>
          <Field label='Catatan'>
            <Textarea {...form.register('notes')} />
          </Field>
          <p className='text-xs text-muted-foreground'>
            Data NIK, rekening, BPJS, dan kontak hanya ditampilkan utuh saat
            form Super Admin ini dibuka.
          </p>
        </section>
      </form>
      <FormActionBar
        formId='employee-form'
        isPending={isPending || isUploading}
        submitLabel={employee ? 'Simpan perubahan' : 'Tambah karyawan'}
        onCancel={onCancel}
      />
      {confirmation}
    </>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className='grid gap-1 text-sm'>
      <span>{label}</span>
      {children}
      {error && <span className='text-xs text-destructive'>{error}</span>}
    </label>
  )
}

function FormDatePicker({
  control,
  name,
  setValue,
}: {
  control: ReturnType<typeof useForm<Values>>['control']
  name: keyof Values
  setValue: UseFormSetValue<Values>
}) {
  const value = useWatch({ control, name })
  return (
    <DatePicker
      selected={dateFromInput(value)}
      onSelect={(date) =>
        setValue(name, dateToInput(date), {
          shouldDirty: true,
          shouldValidate: true,
        })
      }
    />
  )
}

function dateInput(value?: string) {
  return value ? value.slice(0, 10) : ''
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

function formatEmployeeNumberPreview(prefix?: string, joinDate?: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(joinDate ?? '')
  if (!prefix || !match) return 'Akan dibuat otomatis'
  const [, year, month, day] = match
  return `P${prefix}-${year.slice(2)}${month}-${day}xxx`
}

function applyServerFieldErrors(
  error: unknown,
  setError: ReturnType<typeof useForm<Values>>['setError']
) {
  const fieldErrors = (
    error as {
      response?: {
        data?: { issues?: { fieldErrors?: Record<string, string[]> } }
      }
    }
  ).response?.data?.issues?.fieldErrors

  if (!fieldErrors) return
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (!isFormField(field) || !messages[0]) continue
    setError(field, { type: 'server', message: messages[0] })
  }
}

function isFormField(field: string): field is keyof Values {
  return formFieldNames.has(field as keyof Values)
}

function initials(name?: string) {
  const result = name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
  return result || 'FK'
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

function revokeTemporaryUrl(temporaryUrl?: string) {
  return () => {
    if (temporaryUrl) URL.revokeObjectURL(temporaryUrl)
  }
}

function ImageUploadCard({
  label,
  description,
  attachment,
  onSelect,
}: {
  label: string
  description: string
  attachment?: MockFileAttachment
  onSelect: (file: File) => void
}) {
  const url = attachment?.temporaryUrl ?? attachment?.url
  return (
    <div className='overflow-hidden rounded-lg border bg-muted/30'>
      <div className='aspect-[4/3] bg-muted'>
        {url ? (
          <img src={url} alt={label} className='size-full object-cover' />
        ) : (
          <div className='flex size-full items-center justify-center px-6 text-center text-sm text-muted-foreground'>
            Belum ada {label.toLowerCase()}.
          </div>
        )}
      </div>
      <div className='space-y-2 p-3'>
        <div>
          <p className='font-medium'>{label}</p>
          <p className='text-xs text-muted-foreground'>{description}</p>
        </div>
        <Input
          type='file'
          accept='image/png,image/jpeg,image/webp'
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onSelect(file)
          }}
        />
      </div>
    </div>
  )
}
