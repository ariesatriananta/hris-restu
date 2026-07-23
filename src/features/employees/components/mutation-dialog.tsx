import { useEffect, useState } from 'react'
import { z } from 'zod'
import { isAxiosError } from 'axios'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DatePicker } from '@/components/date-picker'
import {
  useApplyMutation,
  useEmployeeLookups,
  useHistories,
  useScheduleMutation,
  useUpdateScheduledMutation,
} from '../data/queries'
import type {
  Employee,
  MutationInput,
  ScheduledEmployeeMutation,
} from '../domain'
import {
  editableMutationFields,
  selectableMutationChangeTypes,
} from '../mutation-change-type'
import { statusLabel } from '../utils'

const mutationSchema = z
  .object({
    site: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']),
    department: z.string().optional(),
    position: z.string().optional(),
    workGroup: z.string().optional(),
    productionModuleUid: z.string().optional(),
    productionModuleSectionUid: z.string().optional(),
    employeeType: z.enum(['BORONGAN', 'TRAINING', 'BULANAN']),
    effectiveFrom: z.string().min(1, 'Tanggal efektif wajib diisi.'),
    changeType: z.enum([
      'TRANSFER',
      'PROMOTION',
      'DEMOTION',
      'DEPARTMENT_CHANGE',
      'TYPE_CHANGE',
      'GROUP_CHANGE',
      'PRODUCTION_ASSIGNMENT_CHANGE',
      'OTHER',
    ]),
    referenceNumber: z.string().optional(),
    reason: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (value) =>
      !editableMutationFields(value.changeType, value.employeeType).has(
        'productionAssignment'
      ) ||
      !['BORONGAN', 'TRAINING'].includes(value.employeeType) ||
      Boolean(value.productionModuleSectionUid),
    {
      path: ['productionModuleSectionUid'],
      message:
        'Bagian produksi wajib dipilih untuk karyawan Borongan atau Training.',
    }
  )

export function MutationDialog({
  employee,
  open,
  onOpenChange,
  schedule,
}: {
  employee: Employee
  open: boolean
  onOpenChange: (open: boolean) => void
  schedule?: ScheduledEmployeeMutation
}) {
  const mutation = useApplyMutation()
  const scheduleMutation = useScheduleMutation()
  const updateSchedule = useUpdateScheduledMutation()
  const lookups = useEmployeeLookups()
  const histories = useHistories(employee.uid)
  const [pendingInput, setPendingInput] = useState<MutationInput>()
  const form = useForm<MutationInput>({
    resolver: zodResolver(mutationSchema),
    defaultValues: {
      site: employee.site,
      department: employee.department,
      position: employee.position,
      workGroup: schedule?.workGroup ?? employee.workGroup,
      productionModuleUid: employee.productionModuleUid,
      productionModuleSectionUid: employee.productionModuleSectionUid,
      employeeType: employee.employeeType,
      effectiveFrom: businessDateInput(),
      changeType: 'TRANSFER',
    },
  })
  useEffect(() => {
    if (!open) return
    form.reset({
      site: schedule?.site ?? employee.site,
      department: schedule?.department ?? employee.department,
      position: schedule?.position ?? employee.position,
      workGroup: employee.workGroup,
      productionModuleUid:
        schedule?.productionModuleUid ?? employee.productionModuleUid,
      productionModuleSectionUid:
        schedule?.productionModuleSectionUid ??
        employee.productionModuleSectionUid,
      employeeType: schedule?.employeeType ?? employee.employeeType,
      effectiveFrom: schedule?.effectiveFrom ?? businessDateInput(),
      changeType: schedule?.changeType ?? 'TRANSFER',
      referenceNumber: schedule?.referenceNumber,
      reason: schedule?.reason,
      notes: schedule?.notes,
    })
  }, [employee, form, open, schedule])
  const selectedSite = useWatch({ control: form.control, name: 'site' })
  const selectedChangeType = useWatch({
    control: form.control,
    name: 'changeType',
  })
  const selectedEmployeeType = useWatch({
    control: form.control,
    name: 'employeeType',
  })
  const selectedProductionModuleUid = useWatch({
    control: form.control,
    name: 'productionModuleUid',
  })
  const effectiveFrom = useWatch({
    control: form.control,
    name: 'effectiveFrom',
  })
  const isFuture = Boolean(
    pendingInput && pendingInput.effectiveFrom > businessDateInput()
  )
  const isSaving =
    mutation.isPending || scheduleMutation.isPending || updateSchedule.isPending
  const editableFields = editableMutationFields(
    selectedChangeType,
    selectedEmployeeType
  )
  const changeTypeOptions = [
    ...selectableMutationChangeTypes,
    ...(schedule &&
    !selectableMutationChangeTypes.includes(schedule.changeType as never)
      ? [schedule.changeType]
      : []),
  ]
  const resetForChangeType = (changeType: MutationInput['changeType']) => {
    const current = form.getValues()
    form.reset({
      site: employee.site,
      department: employee.department,
      position: employee.position,
      workGroup: employee.workGroup,
      productionModuleUid: employee.productionModuleUid,
      productionModuleSectionUid: employee.productionModuleSectionUid,
      employeeType: employee.employeeType,
      effectiveFrom: current.effectiveFrom,
      changeType,
      referenceNumber: current.referenceNumber,
      reason: current.reason,
      notes: current.notes,
    })
  }
  const commit = (input: MutationInput) => {
    const onSuccess = () => {
      toast.success(
        input.effectiveFrom > businessDateInput()
          ? schedule
            ? 'Jadwal mutasi diperbarui.'
            : 'Mutasi berhasil dijadwalkan.'
          : 'Mutasi dicatat sebagai histori baru.'
      )
      setPendingInput(undefined)
      onOpenChange(false)
    }
    const onError = (error: unknown) => toast.error(mutationErrorMessage(error))
    if (input.effectiveFrom > businessDateInput()) {
      if (schedule)
        updateSchedule.mutate(
          { uid: schedule.uid, input },
          { onSuccess, onError }
        )
      else
        scheduleMutation.mutate(
          { employeeUid: employee.uid, input },
          { onSuccess, onError }
        )
      return
    }
    mutation.mutate(
      { employeeUid: employee.uid, input },
      { onSuccess, onError }
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Catat mutasi</DialogTitle>
          <DialogDescription>
            Tanggal hari ini diterapkan langsung. Tanggal masa depan masuk
            antrean dan tidak mengubah penempatan karyawan sebelum tanggal
            efektifnya.
          </DialogDescription>
        </DialogHeader>
        <form
          className='grid gap-3'
          onSubmit={form.handleSubmit(
            (input) => {
              const activeHistory = histories.data?.find(
                (history) => !history.effectiveTo
              )
              if (input.effectiveFrom < businessDateInput()) {
                form.setError('effectiveFrom', {
                  message: 'Tanggal efektif tidak boleh lampau.',
                })
                return
              }
              if (
                activeHistory &&
                input.effectiveFrom <= activeHistory.effectiveFrom
              ) {
                form.setError('effectiveFrom', {
                  message: `Tanggal efektif harus setelah ${activeHistory.effectiveFrom}.`,
                })
                return
              }
              const mutationError = mutationInputError(
                employee,
                input as MutationInput
              )
              if (mutationError) {
                form.setError(mutationError.field, {
                  message: mutationError.message,
                })
                return
              }
              setPendingInput(input as MutationInput)
            },
            () => toast.error('Periksa field mutasi yang masih belum valid.')
          )}
        >
          <label className='grid gap-1 text-sm'>
            Tanggal efektif
            <DatePicker
              selected={dateFromInput(effectiveFrom)}
              onSelect={(date) =>
                form.setValue('effectiveFrom', dateToInput(date), {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
            {form.formState.errors.effectiveFrom?.message && (
              <span className='text-xs text-destructive'>
                {form.formState.errors.effectiveFrom.message}
              </span>
            )}
          </label>
          <Select
            label='Jenis perubahan'
            error={form.formState.errors.changeType?.message}
            options={changeTypeOptions.map((value) => ({
              value,
              label: statusLabel(value),
            }))}
            {...form.register('changeType', {
              onChange: (event) =>
                resetForChangeType(
                  event.target.value as MutationInput['changeType']
                ),
            })}
          />
          <p className='text-xs text-muted-foreground'>
            Hanya target yang relevan dengan jenis perubahan dapat diubah.
          </p>
          <Select
            label='Site tujuan'
            error={form.formState.errors.site?.message}
            disabled={!editableFields.has('site')}
            options={(lookups.data?.sites ?? []).map((item) => ({
              value: item.code,
              label: item.name,
            }))}
            {...form.register('site', {
              onChange: () => {
                form.setValue('productionModuleUid', '', { shouldDirty: true })
                form.setValue('productionModuleSectionUid', '', {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              },
            })}
          />
          <Select
            label='Departemen'
            error={form.formState.errors.department?.message}
            disabled={!editableFields.has('department')}
            options={(lookups.data?.departments ?? [])
              .filter(
                (item) => !item.siteCode || item.siteCode === selectedSite
              )
              .map((item) => ({
                value: item.name,
                label: item.name,
              }))}
            {...form.register('department')}
          />
          <Select
            label='Jabatan'
            error={form.formState.errors.position?.message}
            disabled={!editableFields.has('position')}
            options={(lookups.data?.positions ?? []).map((item) => ({
              value: item.name,
              label: item.name,
            }))}
            {...form.register('position')}
          />
          <Select
            label='Jenis karyawan baru'
            error={form.formState.errors.employeeType?.message}
            options={[
              { value: 'BORONGAN', label: 'Borongan' },
              { value: 'TRAINING', label: 'Training' },
              { value: 'BULANAN', label: 'Bulanan' },
            ]}
            {...form.register('employeeType')}
            disabled={!editableFields.has('employeeType')}
          />
          {['BORONGAN', 'TRAINING'].includes(selectedEmployeeType) && (
            <>
              <Select
                label='Modul produksi'
                error={form.formState.errors.productionModuleUid?.message}
                disabled={!editableFields.has('productionAssignment')}
                options={[
                  { value: '', label: 'Pilih modul produksi' },
                  ...(lookups.data?.productionModules ?? [])
                    .filter((item) => item.siteCode === selectedSite)
                    .map((item) => ({ value: item.uid, label: item.name })),
                ]}
                {...form.register('productionModuleUid', {
                  onChange: () =>
                    form.setValue('productionModuleSectionUid', '', {
                      shouldDirty: true,
                      shouldValidate: true,
                    }),
                })}
              />
              <Select
                label='Bagian produksi'
                error={
                  form.formState.errors.productionModuleSectionUid?.message
                }
                options={[
                  { value: '', label: 'Pilih Bagian produksi' },
                  ...(lookups.data?.productionModuleSections ?? [])
                    .filter(
                      (item) => item.moduleUid === selectedProductionModuleUid
                    )
                    .map((item) => ({
                      value: item.uid,
                      label: item.sectionName,
                    })),
                ]}
                disabled={
                  !editableFields.has('productionAssignment') ||
                  !selectedProductionModuleUid
                }
                {...form.register('productionModuleSectionUid')}
              />
            </>
          )}
          <label className='grid gap-1 text-sm'>
            Nomor referensi
            <Input {...form.register('referenceNumber')} />
          </label>
          <label className='grid gap-1 text-sm'>
            Alasan
            <Textarea {...form.register('reason')} />
            {form.formState.errors.reason?.message && (
              <span className='text-xs text-destructive'>
                {form.formState.errors.reason.message}
              </span>
            )}
          </label>
          <label className='grid gap-1 text-sm'>
            Catatan
            <Textarea {...form.register('notes')} />
          </label>
          <Button type='submit' disabled={isSaving}>
            {effectiveFrom > businessDateInput()
              ? schedule
                ? 'Tinjau jadwal ulang'
                : 'Tinjau jadwal mutasi'
              : 'Tinjau mutasi'}
          </Button>
        </form>
        <ConfirmDialog
          open={Boolean(pendingInput)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !isSaving) setPendingInput(undefined)
          }}
          title={
            isFuture
              ? 'Konfirmasi jadwal mutasi'
              : 'Konfirmasi perubahan mutasi'
          }
          desc={
            pendingInput ? (
              <MutationSummary employee={employee} input={pendingInput} />
            ) : (
              ''
            )
          }
          cancelBtnText='Kembali periksa'
          confirmText={
            isFuture
              ? schedule
                ? 'Simpan jadwal ulang'
                : 'Jadwalkan mutasi'
              : 'Simpan mutasi'
          }
          isLoading={isSaving}
          handleConfirm={() => pendingInput && commit(pendingInput)}
        />
      </DialogContent>
    </Dialog>
  )
}

function mutationInputError(employee: Employee, input: MutationInput) {
  if (input.changeType === 'TRANSFER' && input.site === employee.site) {
    return {
      field: 'site' as const,
      message: 'Pilih site tujuan yang berbeda.',
    }
  }
  if (
    (input.changeType === 'PROMOTION' || input.changeType === 'DEMOTION') &&
    input.position === employee.position
  ) {
    return { field: 'position' as const, message: 'Pilih jabatan baru.' }
  }
  if (
    input.changeType === 'DEPARTMENT_CHANGE' &&
    input.department === employee.department
  ) {
    return { field: 'department' as const, message: 'Pilih departemen baru.' }
  }
  if (
    input.changeType === 'TYPE_CHANGE' &&
    input.employeeType === employee.employeeType
  ) {
    return {
      field: 'employeeType' as const,
      message: 'Pilih jenis karyawan yang berbeda.',
    }
  }
  if (
    input.changeType === 'PRODUCTION_ASSIGNMENT_CHANGE' &&
    input.productionModuleSectionUid === employee.productionModuleSectionUid
  ) {
    return {
      field: 'productionModuleSectionUid' as const,
      message: 'Pilih Modul atau Bagian yang berbeda.',
    }
  }
  return undefined
}
function mutationErrorMessage(error: unknown) {
  if (isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? 'Mutasi gagal disimpan.'
  }
  return error instanceof Error ? error.message : 'Mutasi gagal disimpan.'
}
function MutationSummary({
  employee,
  input,
}: {
  employee: Employee
  input: MutationInput
}) {
  return (
    <div className='grid gap-2 text-sm text-foreground'>
      <p className='text-muted-foreground'>
        {input.effectiveFrom > businessDateInput()
          ? 'Data penempatan karyawan belum berubah sampai cron menerapkan jadwal pada tanggal efektif.'
          : 'Periksa perubahan berikut sebelum histori baru dibuat.'}
      </p>
      <SummaryRow label='Site' before={employee.site} after={input.site} />
      <SummaryRow
        label='Jabatan'
        before={employee.position}
        after={input.position}
      />
      <SummaryRow
        label='Departemen'
        before={employee.department}
        after={input.department}
      />
      {['BORONGAN', 'TRAINING'].includes(input.employeeType) && (
        <SummaryRow
          label='Penempatan produksi'
          before={
            employee.productionModule || employee.productionSection
              ? `${employee.productionModule ?? '—'} / ${employee.productionSection ?? '—'}`
              : undefined
          }
          after='Sesuai Modul dan Bagian yang dipilih'
        />
      )}
      <SummaryRow
        label='Tanggal efektif'
        before={
          input.effectiveFrom > businessDateInput()
            ? 'Belum diterapkan'
            : 'Histori aktif ditutup sehari sebelumnya'
        }
        after={input.effectiveFrom}
      />
    </div>
  )
}
function SummaryRow({
  label,
  before,
  after,
}: {
  label: string
  before?: string
  after?: string
}) {
  return (
    <div className='grid grid-cols-[105px_1fr] gap-2'>
      <span className='text-muted-foreground'>{label}</span>
      <span>
        {before || '—'} <span className='px-1 text-muted-foreground'>→</span>{' '}
        <strong>{after || '—'}</strong>
      </span>
    </div>
  )
}
function Select({
  label,
  options,
  error,
  ...props
}: {
  label: string
  options: { value: string; label: string }[]
  error?: string
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className='grid gap-1 text-sm'>
      {label}
      <select
        className='h-9 rounded-md border bg-background px-3 transition-colors disabled:cursor-not-allowed disabled:border-muted disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100'
        aria-invalid={Boolean(error)}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <span className='text-xs text-destructive'>{error}</span>}
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

function businessDateInput() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}
