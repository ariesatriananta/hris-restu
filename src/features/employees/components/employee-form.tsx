import { useEffect, useState, type ChangeEvent } from 'react'
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
import { educationLevelOptions, educationLevelValues } from '../education-level'
import type {
  Employee,
  EmployeeDocument,
  EmployeeInput,
  MockFileAttachment,
} from '../domain'
import { FormActionBar } from './form-action-bar'

const optionalText = z.string().optional()
const optionalRtrw = z
  .string()
  .refine(
    (value) => !value || /^\d{3}\/\d{3}$/.test(value),
    'RT/RW wajib berformat 001/002.'
  )
const optionalEmail = z
  .string()
  .trim()
  .refine(
    (value) => !value || z.string().email().safeParse(value).success,
    'Email tidak valid.'
  )
const schema = z
  .object({
    fullName: z.string().min(2, 'Nama lengkap wajib diisi.'),
    nickname: optionalText,
    employeeType: z.enum(['BORONGAN', 'HARIAN', 'TRAINING', 'BULANAN']),
    employeeStatus: z.enum(['ACTIVE', 'RESIGNED', 'INACTIVE', 'LEAVE']),
    site: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']),
    department: optionalText,
    position: optionalText,
    workGroup: optionalText,
    productionModuleUid: optionalText,
    productionModuleSectionUid: optionalText,
    joinDate: z.string().min(1, 'Tanggal bergabung wajib diisi.'),
    permanentDate: optionalText,
    resignDate: optionalText,
    resignReason: optionalText,
    gender: z.enum(['LAKI-LAKI', 'PEREMPUAN', 'MALE', 'FEMALE']),
    birthPlace: optionalText,
    birthDate: optionalText,
    maritalStatus: z
      .enum([
        'BELUM_KAWIN',
        'KAWIN',
        'CERAI_HIDUP',
        'CERAI_MATI',
        'SINGLE',
        'MARRIED',
        'DIVORCED',
        'WIDOWED',
        '',
      ])
      .optional(),
    religion: optionalText,
    educationLevel: z.enum(educationLevelValues),
    address: optionalText,
    rtrw: optionalRtrw,
    kelurahan: optionalText,
    kecamatan: optionalText,
    city: optionalText,
    province: optionalText,
    postalCode: optionalText,
    phone: optionalText,
    email: optionalEmail,
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
  .refine((value) => Boolean(value.productionModuleSectionUid), {
    path: ['productionModuleSectionUid'],
    message: 'Bagian produksi wajib dipilih.',
  })

type Values = z.infer<typeof schema>
const formFieldNames = new Set<keyof Values>(schema.keyof().options)
const empty = (value?: string) => value?.trim() || undefined
const legacyGenderCodes = new Set(['MALE', 'FEMALE'])
const legacyMaritalStatusCodes = new Set([
  'SINGLE',
  'MARRIED',
  'DIVORCED',
  'WIDOWED',
])
function genderLabel(value?: string) {
  return (
    {
      'LAKI-LAKI': 'Laki-laki',
      PEREMPUAN: 'Perempuan',
      MALE: 'Laki-laki (legacy)',
      FEMALE: 'Perempuan (legacy)',
    }[value ?? ''] ?? value
  )
}
function maritalStatusLabel(value?: string) {
  return (
    {
      BELUM_KAWIN: 'Belum Kawin',
      KAWIN: 'Kawin',
      CERAI_HIDUP: 'Cerai Hidup',
      CERAI_MATI: 'Cerai Mati',
      SINGLE: 'Belum menikah (legacy)',
      MARRIED: 'Menikah (legacy)',
      DIVORCED: 'Cerai (legacy)',
      WIDOWED: 'Duda/Janda (legacy)',
    }[value ?? ''] ?? value
  )
}

const personalFields: [keyof Values, string, string?][] = [
  ['birthPlace', 'Tempat lahir'],
  ['birthDate', 'Tanggal lahir', 'date'],
  ['religion', 'Agama'],
  ['nationalIdNumber', 'NIK'],
  ['familyCardNumber', 'Nomor kartu keluarga'],
]
const contactFields: [keyof Values, string][] = [
  ['rtrw', 'RT/RW'],
  ['kelurahan', 'Kelurahan'],
  ['kecamatan', 'Kecamatan'],
  ['city', 'Kota'],
  ['province', 'Provinsi'],
  ['postalCode', 'Kode pos'],
  ['phone', 'Nomor telepon'],
  ['email', 'Email'],
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
const uppercaseFields = new Set<keyof Values>([
  'fullName',
  'birthPlace',
  'religion',
  'address',
  'kelurahan',
  'kecamatan',
  'city',
  'province',
])

export function EmployeeForm({
  employee,
  createDefaults,
  identityDocuments,
  lockCreateSite = false,
  inheritedRecruitmentDocuments,
  inheritedRecruitmentAttachments,
  onSubmit,
  onCancel,
  isPending,
  submitLabel,
  disableLookupQuery = false,
}: {
  employee?: Employee
  createDefaults?: Partial<Employee>
  identityDocuments?: Partial<Record<'KTP' | 'KK', EmployeeDocument>>
  lockCreateSite?: boolean
  inheritedRecruitmentDocuments?: Array<'PHOTO' | 'KTP' | 'KK'>
  inheritedRecruitmentAttachments?: Partial<
    Record<'PHOTO' | 'KTP' | 'KK', MockFileAttachment>
  >
  onSubmit: (
    input: EmployeeInput,
    files: { photo?: File; nationalId?: File; familyCard?: File }
  ) => void | Promise<void>
  onCancel: () => void
  isPending?: boolean
  submitLabel?: string
  disableLookupQuery?: boolean
}) {
  const initial = employee ?? createDefaults
  const [photo, setPhoto] = useState<MockFileAttachment | undefined>(
    initial?.photo ?? inheritedRecruitmentAttachments?.PHOTO
  )
  const [photoFile, setPhotoFile] = useState<File>()
  const [nationalIdPhoto, setNationalIdPhoto] = useState<
    MockFileAttachment | undefined
  >(identityDocuments?.KTP?.file ?? inheritedRecruitmentAttachments?.KTP)
  const [nationalIdFile, setNationalIdFile] = useState<File>()
  const [familyCardPhoto, setFamilyCardPhoto] = useState<
    MockFileAttachment | undefined
  >(identityDocuments?.KK?.file ?? inheritedRecruitmentAttachments?.KK)
  const [familyCardFile, setFamilyCardFile] = useState<File>()
  const [isUploading, setIsUploading] = useState(false)
  const lookups = useEmployeeLookups(!disableLookupQuery)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      fullName: initial?.fullName ?? '',
      nickname: initial?.nickname ?? '',
      employeeType: initial?.employeeType ?? 'BORONGAN',
      employeeStatus: initial?.employeeStatus ?? 'INACTIVE',
      site: initial?.site ?? 'JEPARA',
      department: initial?.department ?? '',
      position: initial?.position ?? '',
      workGroup: initial?.workGroup ?? '',
      productionModuleUid: initial?.productionModuleUid ?? '',
      productionModuleSectionUid: initial?.productionModuleSectionUid ?? '',
      joinDate: dateInput(initial?.joinDate),
      permanentDate: dateInput(initial?.permanentDate),
      resignDate: dateInput(initial?.resignDate),
      resignReason: initial?.resignReason ?? '',
      gender: initial?.gender ?? 'LAKI-LAKI',
      birthPlace: initial?.birthPlace ?? '',
      birthDate: dateInput(initial?.birthDate),
      maritalStatus: initial?.maritalStatus ?? '',
      religion: initial?.religion ?? '',
      educationLevel: initial?.educationLevel ?? undefined,
      address: initial?.address ?? '',
      rtrw: initial?.rtrw ?? '',
      kelurahan: initial?.kelurahan ?? '',
      kecamatan: initial?.kecamatan ?? '',
      city: initial?.city ?? '',
      province: initial?.province ?? '',
      postalCode: initial?.postalCode ?? '',
      phone: initial?.phone ?? '',
      email: initial?.email ?? '',
      emergencyContactName: initial?.emergencyContactName ?? '',
      emergencyContactPhone: initial?.emergencyContactPhone ?? '',
      emergencyContactRelation: initial?.emergencyContactRelation ?? '',
      nationalIdNumber: initial?.nationalIdNumber ?? '',
      familyCardNumber: initial?.familyCardNumber ?? '',
      taxNumber: initial?.taxNumber ?? '',
      bankName: initial?.bankName ?? '',
      bankAccountNumber: initial?.bankAccountNumber ?? '',
      bankAccountName: initial?.bankAccountName ?? '',
      bpjsHealthNumber: initial?.bpjsHealthNumber ?? '',
      bpjsEmploymentNumber: initial?.bpjsEmploymentNumber ?? '',
      notes: initial?.notes ?? '',
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
            productionModuleSectionUid: employee.productionModuleSectionUid,
          }
        : {
            employeeType: values.employeeType,
            employeeStatus: values.employeeStatus,
            site: values.site,
            department: empty(values.department),
            position: empty(values.position),
            workGroup: empty(values.workGroup),
            productionModuleSectionUid: empty(
              values.productionModuleSectionUid
            ),
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
          educationLevel: values.educationLevel,
          address: empty(values.address),
          rtrw: empty(values.rtrw),
          kelurahan: empty(values.kelurahan),
          kecamatan: empty(values.kecamatan),
          city: empty(values.city),
          province: empty(values.province),
          postalCode: empty(values.postalCode),
          phone: empty(values.phone),
          email: empty(values.email),
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
    options: { value: string; label: string; disabled?: boolean }[],
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
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  )

  const textField = (name: keyof Values, label: string, type = 'text') => {
    const registration = form.register(name)
    return (
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
          <Input
            type={type}
            inputMode={name === 'rtrw' ? 'numeric' : undefined}
            maxLength={name === 'rtrw' ? 7 : undefined}
            placeholder={name === 'rtrw' ? '001/002' : undefined}
            {...registration}
            onChange={formatFieldOnChange(name, registration.onChange)}
          />
        )}
      </Field>
    )
  }
  const formattedRegistration = (name: keyof Values) => {
    const registration = form.register(name)
    return {
      ...registration,
      onChange: formatFieldOnChange(name, registration.onChange),
    }
  }
  const selectedSite = useWatch({ control: form.control, name: 'site' })
  const selectedEmployeeType = useWatch({
    control: form.control,
    name: 'employeeType',
  })
  const selectedProductionModuleUid = useWatch({
    control: form.control,
    name: 'productionModuleUid',
  })
  const selectedJoinDate = useWatch({ control: form.control, name: 'joinDate' })
  const currentFullName = useWatch({ control: form.control, name: 'fullName' })
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
  const productionModules = (lookups.data?.productionModules ?? []).filter(
    (item) => item.siteCode === selectedSite
  )
  const productionModuleSections = (
    lookups.data?.productionModuleSections ?? []
  ).filter((item) => item.moduleUid === selectedProductionModuleUid)
  const genderOptions = [
    { value: 'LAKI-LAKI', label: 'Laki-laki' },
    { value: 'PEREMPUAN', label: 'Perempuan' },
    ...(employee && legacyGenderCodes.has(employee.gender)
      ? [
          {
            value: employee.gender,
            label: genderLabel(employee.gender) ?? employee.gender,
          },
        ]
      : []),
  ]
  const maritalStatusOptions = [
    { value: '', label: 'Belum diisi' },
    { value: 'BELUM_KAWIN', label: 'Belum Kawin' },
    { value: 'KAWIN', label: 'Kawin' },
    { value: 'CERAI_HIDUP', label: 'Cerai Hidup' },
    { value: 'CERAI_MATI', label: 'Cerai Mati' },
    ...(employee?.maritalStatus &&
    legacyMaritalStatusCodes.has(employee.maritalStatus)
      ? [
          {
            value: employee.maritalStatus,
            label:
              maritalStatusLabel(employee.maritalStatus) ??
              employee.maritalStatus,
          },
        ]
      : []),
  ]

  useEffect(() => {
    if (
      !employee &&
      lookups.data &&
      selectedProductionModuleUid &&
      !productionModules.some(
        (item) => item.uid === selectedProductionModuleUid
      )
    ) {
      form.setValue('productionModuleUid', '', { shouldDirty: true })
      form.setValue('productionModuleSectionUid', '', {
        shouldDirty: true,
        shouldValidate: true,
      })
    }
  }, [
    employee,
    form,
    lookups.data,
    productionModules,
    selectedProductionModuleUid,
  ])

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
                { value: 'HARIAN', label: 'Harian' },
                { value: 'TRAINING', label: 'Training' },
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
              !!employee || lockCreateSite
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
            {selectedEmployeeType && (
              <>
                <Field
                  label='Modul produksi'
                  error={form.formState.errors.productionModuleUid?.message}
                >
                  <select
                    className='h-9 rounded-md border bg-background px-3 disabled:cursor-not-allowed disabled:opacity-60'
                    disabled={!!employee}
                    {...form.register('productionModuleUid', {
                      onChange: () =>
                        form.setValue('productionModuleSectionUid', '', {
                          shouldDirty: true,
                          shouldValidate: true,
                        }),
                    })}
                  >
                    <option value=''>Pilih modul produksi</option>
                    {productionModules.map((item) => (
                      <option key={item.uid} value={item.uid}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label='Bagian produksi'
                  error={
                    form.formState.errors.productionModuleSectionUid?.message
                  }
                >
                  <select
                    className='h-9 rounded-md border bg-background px-3 disabled:cursor-not-allowed disabled:opacity-60'
                    disabled={!!employee || !selectedProductionModuleUid}
                    {...form.register('productionModuleSectionUid')}
                  >
                    <option value=''>Pilih Bagian produksi</option>
                    {productionModuleSections.map((item) => (
                      <option key={item.uid} value={item.uid}>
                        {item.sectionName}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {employee ? (
              <Field label='Tanggal bergabung'>
                <FormDatePicker
                  control={form.control}
                  name='joinDate'
                  setValue={form.setValue}
                  disabled
                />
              </Field>
            ) : (
              textField('joinDate', 'Tanggal bergabung', 'date')
            )}
            {textField('permanentDate', 'Tanggal tetap', 'date')}
            {select('gender', 'Jenis kelamin', genderOptions)}
            {select('maritalStatus', 'Status perkawinan', maritalStatusOptions)}
          </div>
          {employee && (
            <p className='rounded-md bg-muted p-3 text-xs text-muted-foreground'>
              Penempatan dan jenis karyawan dikelola melalui Catat Mutasi.
              Status kerja serta data resign dikelola melalui lifecycle kontrak.
              Tanggal bergabung hanya dapat diubah melalui Koreksi Data
              Registrasi agar histori awal dan Employee ID tetap sesuai.
            </p>
          )}
        </section>

        <section className='space-y-3 border-t pt-5'>
          <h3 className='font-semibold'>Identitas pribadi</h3>
          <div className='grid gap-3 sm:grid-cols-2'>
            {personalFields.map(([name, label, type]) =>
              textField(name, label, type)
            )}
            {select('educationLevel', 'Pendidikan terakhir', [
              { value: '', label: 'Pilih pendidikan terakhir', disabled: true },
              ...educationLevelOptions,
            ])}
          </div>
        </section>

        <section className='space-y-3 border-t pt-5'>
          <h3 className='font-semibold'>Alamat & kontak</h3>
          <Field label='Alamat'>
            <Textarea {...formattedRegistration('address')} />
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
          {inheritedRecruitmentDocuments?.length ? (
            <p className='rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground'>
              Foto pelamar, KTP, dan KK dari pendaftaran akan disalin otomatis
              saat data karyawan dibuat. Setelah tersimpan, dokumen dapat
              diperbarui dari detail karyawan.
            </p>
          ) : null}
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
                    (inheritedRecruitmentDocuments?.includes('PHOTO')
                      ? 'Foto pelamar siap disalin dari pendaftaran.'
                      : 'Belum ada foto. Pilih foto wajah yang jelas.')}
                </p>
              </div>
              <Input
                type='file'
                accept='image/png,image/jpeg,image/webp'
                disabled={Boolean(inheritedRecruitmentDocuments?.length)}
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
                {photo && !inheritedRecruitmentDocuments?.length && (
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
              disabled={Boolean(inheritedRecruitmentDocuments?.length)}
              inherited={inheritedRecruitmentDocuments?.includes('KTP')}
              onSelect={(file) => {
                setNationalIdFile(file)
                setNationalIdPhoto(attachmentFromFile(file))
              }}
            />
            <ImageUploadCard
              label='Foto KK'
              description='Foto atau scan Kartu Keluarga yang terbaca jelas.'
              attachment={familyCardPhoto}
              disabled={Boolean(inheritedRecruitmentDocuments?.length)}
              inherited={inheritedRecruitmentDocuments?.includes('KK')}
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
        submitLabel={
          submitLabel ?? (employee ? 'Simpan perubahan' : 'Tambah karyawan')
        }
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
  disabled = false,
}: {
  control: ReturnType<typeof useForm<Values>>['control']
  name: keyof Values
  setValue: UseFormSetValue<Values>
  disabled?: boolean
}) {
  const value = useWatch({ control, name })
  return (
    <DatePicker
      disabled={disabled}
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

function formatFieldOnChange(
  name: keyof Values,
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
) {
  return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const formatted = formatFieldValue(name, event.target.value)
    if (formatted !== event.target.value) event.target.value = formatted
    onChange(event)
  }
}

function formatFieldValue(name: keyof Values, value: string) {
  if (name === 'rtrw') return maskRtrw(value)
  if (uppercaseFields.has(name)) return value.toUpperCase()
  return value
}

function maskRtrw(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 6)
  if (digits.length <= 3) return digits
  return `${digits.slice(0, 3)}/${digits.slice(3)}`
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
  disabled = false,
  inherited = false,
  onSelect,
}: {
  label: string
  description: string
  attachment?: MockFileAttachment
  disabled?: boolean
  inherited?: boolean
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
            {inherited
              ? `${label} siap disalin dari pendaftaran.`
              : `Belum ada ${label.toLowerCase()}.`}
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
          disabled={disabled}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onSelect(file)
          }}
        />
      </div>
    </div>
  )
}
