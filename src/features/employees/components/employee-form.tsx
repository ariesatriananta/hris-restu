import { useState } from 'react'
import { z } from 'zod'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useEmployeeLookups } from '../data/queries'
import type { Employee, EmployeeInput, MockFileAttachment } from '../domain'

const optionalText = z.string().optional()
const schema = z
  .object({
    employeeNumber: z.string().min(1, 'Nomor karyawan wajib diisi.'),
    barcode: z.string().min(1, 'Barcode wajib diisi.'),
    fullName: z.string().min(2, 'Nama lengkap wajib diisi.'),
    nickname: optionalText,
    employeeType: z.enum(['BORONGAN', 'BULANAN']),
    employeeStatus: z.enum(['ACTIVE', 'LEAVE', 'RESIGNED', 'INACTIVE']),
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
  onSubmit,
  isPending,
  disableLookupQuery = false,
}: {
  employee?: Employee
  onSubmit: (input: EmployeeInput, photoFile?: File) => void | Promise<void>
  isPending?: boolean
  disableLookupQuery?: boolean
}) {
  const [photo, setPhoto] = useState<MockFileAttachment | undefined>(
    employee?.photo
  )
  const [photoFile, setPhotoFile] = useState<File>()
  const [isUploading, setIsUploading] = useState(false)
  const lookups = useEmployeeLookups(!disableLookupQuery)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      employeeNumber: employee?.employeeNumber ?? '',
      barcode: employee?.barcode ?? '',
      fullName: employee?.fullName ?? '',
      nickname: employee?.nickname ?? '',
      employeeType: employee?.employeeType ?? 'BORONGAN',
      employeeStatus: employee?.employeeStatus ?? 'ACTIVE',
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
          employeeNumber: values.employeeNumber.trim(),
          barcode: values.barcode.trim(),
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
        photoFile
      )
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
      <Input type={type} {...form.register(name)} />
    </Field>
  )
  const selectedSite = useWatch({ control: form.control, name: 'site' })
  const sites = lookups.data?.sites ?? []
  const departments = (lookups.data?.departments ?? []).filter(
    (item) => !item.siteCode || item.siteCode === selectedSite
  )
  const positions = lookups.data?.positions ?? []
  const workGroups = (lookups.data?.workGroups ?? []).filter(
    (item) => !item.siteCode || item.siteCode === selectedSite
  )

  return (
    <form onSubmit={form.handleSubmit(submit)} className='space-y-6'>
      <section className='space-y-3'>
        <h3 className='font-semibold'>Identitas kerja</h3>
        <div className='grid gap-3 sm:grid-cols-2'>
          {textField('employeeNumber', 'Nomor karyawan')}
          {textField('barcode', 'Barcode')}
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
            [
              { value: 'ACTIVE', label: 'Aktif' },
              { value: 'LEAVE', label: 'Cuti' },
              { value: 'RESIGNED', label: 'Resign' },
              { value: 'INACTIVE', label: 'Nonaktif' },
            ],
            !!employee
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
            <Input
              type='date'
              disabled={!!employee}
              {...form.register('resignDate')}
            />
          </Field>
          <Field label='Alasan resign'>
            <Input disabled={!!employee} {...form.register('resignReason')} />
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
            Penempatan, jenis, dan status kerja dikunci pada form edit. Gunakan
            aksi Catat Mutasi agar perubahan masuk ke histori.
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
        <h3 className='font-semibold'>Foto dan catatan</h3>
        <label className='grid gap-1 text-sm'>
          Foto karyawan
          <Input
            type='file'
            accept='image/*'
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
          <span className='text-xs text-muted-foreground'>
            {photo?.originalName ?? 'Belum ada foto dipilih.'} Foto akan
            diunggah saat form disimpan.
          </span>
        </label>
        <Field label='Catatan'>
          <Textarea {...form.register('notes')} />
        </Field>
        <p className='text-xs text-muted-foreground'>
          Data NIK, rekening, BPJS, dan kontak hanya ditampilkan utuh saat form
          Super Admin ini dibuka.
        </p>
      </section>

      <Button type='submit' disabled={isPending || isUploading}>
        {isPending || isUploading
          ? 'Menyimpan...'
          : employee
            ? 'Simpan perubahan'
            : 'Tambah karyawan'}
      </Button>
    </form>
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

function dateInput(value?: string) {
  return value ? value.slice(0, 10) : ''
}
