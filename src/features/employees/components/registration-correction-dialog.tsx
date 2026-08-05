import { useEffect, type ChangeEvent, type ComponentProps } from 'react'
import { isAxiosError } from 'axios'
import { z } from 'zod'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { useCorrectRegistration, useEmployeeLookups } from '../data/queries'
import type { Employee, RegistrationCorrectionInput } from '../domain'
import { statusLabel } from '../utils'

const schema = z
  .object({
    site: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']),
    department: z.string().optional(),
    position: z.string().optional(),
    workGroup: z.string().optional(),
    productionModuleUid: z.string().optional(),
    productionModuleSectionUid: z.string().optional(),
    employeeType: z.enum(['BORONGAN', 'HARIAN', 'TRAINING', 'BULANAN']),
    reason: z.string().trim().min(3, 'Alasan koreksi wajib diisi.'),
  })
  .refine(
    (value) => Boolean(value.productionModuleSectionUid),
    {
      path: ['productionModuleSectionUid'],
      message: 'Bagian produksi wajib dipilih.',
    }
  )

export function RegistrationCorrectionDialog({
  employee,
  open,
  onOpenChange,
}: {
  employee?: Employee
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const lookups = useEmployeeLookups(open)
  const correction = useCorrectRegistration()
  const form = useForm<RegistrationCorrectionInput>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues(employee),
  })

  useEffect(() => {
    if (!open) return
    form.reset(emptyValues(employee))
  }, [employee, form, open])

  const selectedSite = useWatch({ control: form.control, name: 'site' })
  const selectedDepartment = useWatch({
    control: form.control,
    name: 'department',
  })
  const selectedPosition = useWatch({ control: form.control, name: 'position' })
  const selectedEmployeeType = useWatch({
    control: form.control,
    name: 'employeeType',
  })
  const selectedProductionModuleUid = useWatch({
    control: form.control,
    name: 'productionModuleUid',
  })
  const selectedProductionModuleSectionUid = useWatch({
    control: form.control,
    name: 'productionModuleSectionUid',
  })
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
  const requiresProduction = Boolean(selectedEmployeeType)
  const controlledSelect = (
    name: keyof RegistrationCorrectionInput,
    value: string | undefined,
    onChange?: (event: ChangeEvent<HTMLSelectElement>) => void
  ) => {
    const registration = form.register(name)
    return {
      ...registration,
      value: value ?? '',
      onChange: (event: ChangeEvent<HTMLSelectElement>) => {
        void registration.onChange(event)
        onChange?.(event)
      },
    }
  }

  const submit = (input: RegistrationCorrectionInput) => {
    if (!employee) return
    correction.mutate(
      {
        employeeUid: employee.uid,
        input: normalizeCorrectionInput(employee, input),
      },
      {
        onSuccess: () => {
          toast.success('Data registrasi awal berhasil dikoreksi.')
          onOpenChange(false)
        },
        onError: (error) => toast.error(correctionErrorMessage(error)),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Koreksi Data Registrasi</DialogTitle>
          <DialogDescription>
            Gunakan hanya untuk salah input awal sebelum karyawan dipakai di
            kontrak, attendance, produksi, payroll, atau jadwal perubahan.
          </DialogDescription>
        </DialogHeader>
        <form className='grid gap-3' onSubmit={form.handleSubmit(submit)}>
          <Field
            label='Karyawan'
            value={employee?.fullName ?? '-'}
            description={employee?.employeeNumber}
          />
          <SelectField
            label='Site'
            error={form.formState.errors.site?.message}
            {...controlledSelect('site', selectedSite)}
          >
            <option value={employee?.site ?? 'JEPARA'}>
              {statusLabel(employee?.site ?? 'JEPARA')}
            </option>
          </SelectField>
          <SelectField
            label='Departemen'
            error={form.formState.errors.department?.message}
            {...controlledSelect('department', selectedDepartment)}
          >
            <option value=''>Pilih departemen</option>
            {currentOption(
              employee?.department,
              departments.some((item) => item.name === employee?.department)
            )}
            {departments.map((item) => (
              <option key={item.uid} value={item.name}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label='Jabatan'
            error={form.formState.errors.position?.message}
            {...controlledSelect('position', selectedPosition)}
          >
            <option value=''>Pilih jabatan</option>
            {currentOption(
              employee?.position,
              positions.some((item) => item.name === employee?.position)
            )}
            {positions.map((item) => (
              <option key={item.uid} value={item.name}>
                {item.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label='Jenis karyawan'
            error={form.formState.errors.employeeType?.message}
            {...controlledSelect('employeeType', selectedEmployeeType)}
          >
            <option value='BORONGAN'>Borongan</option>
            <option value='HARIAN'>Harian</option>
            <option value='TRAINING'>Training</option>
            <option value='BULANAN'>Bulanan</option>
          </SelectField>
          {requiresProduction && (
            <>
              <SelectField
                label='Modul produksi'
                error={form.formState.errors.productionModuleUid?.message}
                {...controlledSelect(
                  'productionModuleUid',
                  selectedProductionModuleUid,
                  () =>
                    form.setValue('productionModuleSectionUid', '', {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                )}
            >
              <option value=''>Pilih modul produksi</option>
              {currentOption(
                employee?.productionModuleUid,
                productionModules.some(
                  (item) => item.uid === employee?.productionModuleUid
                ),
                employee?.productionModule
                  ? `${statusLabel(employee.site)} - ${employee.productionModule}`
                  : undefined
              )}
              {productionModules.map((item) => (
                <option key={item.uid} value={item.uid}>
                  {statusLabel(item.siteCode)} - {item.name}
                  </option>
                ))}
              </SelectField>
              <SelectField
                label='Bagian produksi'
                error={form.formState.errors.productionModuleSectionUid?.message}
                disabled={!selectedProductionModuleUid}
                {...controlledSelect(
                  'productionModuleSectionUid',
                  selectedProductionModuleSectionUid
                )}
              >
                <option value=''>Pilih bagian produksi</option>
                {currentOption(
                  employee?.productionModuleSectionUid,
                  productionModuleSections.some(
                    (item) =>
                      item.uid === employee?.productionModuleSectionUid
                  ),
                  employee?.productionSection
                )}
                {productionModuleSections.map((item) => (
                  <option key={item.uid} value={item.uid}>
                    {item.sectionName}
                  </option>
                ))}
              </SelectField>
            </>
          )}
          <label className='grid gap-1 text-sm'>
            <span>Alasan koreksi</span>
            <Textarea
              placeholder='Contoh: Salah pilih jenis karyawan saat registrasi awal.'
              {...form.register('reason')}
            />
            {form.formState.errors.reason?.message && (
              <span className='text-xs text-destructive'>
                {form.formState.errors.reason.message}
              </span>
            )}
          </label>
          <div className='flex justify-end gap-2 pt-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type='submit' disabled={correction.isPending}>
              Simpan koreksi
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function emptyValues(employee?: Employee): RegistrationCorrectionInput {
  return {
    site: employee?.site ?? 'JEPARA',
    department: employee?.department ?? '',
    position: employee?.position ?? '',
    workGroup: employee?.workGroup ?? '',
    productionModuleUid: employee?.productionModuleUid ?? '',
    productionModuleSectionUid: employee?.productionModuleSectionUid ?? '',
    employeeType: employee?.employeeType ?? 'BORONGAN',
    reason: '',
  }
}

function currentOption(value?: string, exists = false, label = value) {
  if (!value || exists) return null
  return <option value={value}>{label ?? value}</option>
}

function normalizeCorrectionInput(
  employee: Employee,
  input: RegistrationCorrectionInput
): RegistrationCorrectionInput {
  return {
    site: employee.site,
    department: input.department || employee.department || undefined,
    position: input.position || employee.position || undefined,
    workGroup: input.workGroup || employee.workGroup || undefined,
    productionModuleUid:
      input.productionModuleUid || employee.productionModuleUid || undefined,
    productionModuleSectionUid:
      input.productionModuleSectionUid ||
      employee.productionModuleSectionUid ||
      undefined,
    employeeType: input.employeeType || employee.employeeType,
    reason: input.reason.trim(),
  }
}

function Field({
  label,
  value,
  description,
}: {
  label: string
  value: string
  description?: string
}) {
  return (
    <div className='grid gap-1 text-sm'>
      <span>{label}</span>
      <div className='rounded-md border bg-muted/40 px-3 py-2'>
        <p className='font-medium'>{value}</p>
        {description && (
          <p className='text-xs text-muted-foreground'>{description}</p>
        )}
      </div>
    </div>
  )
}

function SelectField({
  label,
  error,
  children,
  ...props
}: ComponentProps<'select'> & {
  label: string
  error?: string
}) {
  return (
    <label className='grid gap-1 text-sm'>
      <span>{label}</span>
      <select
        className='h-9 rounded-md border bg-background px-3 disabled:cursor-not-allowed disabled:opacity-60'
        {...props}
      >
        {children}
      </select>
      {error && <span className='text-xs text-destructive'>{error}</span>}
    </label>
  )
}

function correctionErrorMessage(error: unknown) {
  if (isAxiosError(error)) {
    return (
      error.response?.data?.message ??
      'Koreksi data registrasi gagal disimpan.'
    )
  }
  return 'Koreksi data registrasi gagal disimpan.'
}
