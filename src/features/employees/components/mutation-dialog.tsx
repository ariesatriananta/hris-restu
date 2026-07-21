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
import { statusLabel } from '../utils'

const mutationSchema = z
  .object({
    site: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']),
    department: z.string().optional(),
    position: z.string().optional(),
    workGroup: z.string().optional(),
    productionModuleUid: z.string().optional(),
    productionModuleSectionUid: z.string().optional(),
    employeeType: z.enum(['BORONGAN', 'BULANAN']),
    effectiveFrom: z.string().min(1, 'Tanggal efektif wajib diisi.'),
    changeType: z.enum([
      'TRANSFER',
      'PROMOTION',
      'DEMOTION',
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
      value.employeeType !== 'BORONGAN' ||
      Boolean(value.productionModuleSectionUid),
    {
      path: ['productionModuleSectionUid'],
      message: 'Bagian produksi wajib dipilih untuk karyawan Borongan.',
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
          onSubmit={form.handleSubmit((input) => {
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
            setPendingInput(input as MutationInput)
          })}
        >
          <Select
            label='Site'
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
            options={(lookups.data?.positions ?? []).map((item) => ({
              value: item.name,
              label: item.name,
            }))}
            {...form.register('position')}
          />
          <Select
            label='Jenis perubahan'
            options={[
              'TRANSFER',
              'PROMOTION',
              'DEMOTION',
              'TYPE_CHANGE',
              'PRODUCTION_ASSIGNMENT_CHANGE',
              'OTHER',
            ].map((value) => ({ value, label: statusLabel(value) }))}
            {...form.register('changeType')}
          />
          <Select
            label='Jenis karyawan baru'
            options={[
              { value: 'BORONGAN', label: 'Borongan' },
              { value: 'BULANAN', label: 'Bulanan' },
            ]}
            {...form.register('employeeType')}
          />
          {selectedEmployeeType === 'BORONGAN' && (
            <>
              <Select
                label='Modul produksi'
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
                disabled={!selectedProductionModuleUid}
                {...form.register('productionModuleSectionUid')}
              />
            </>
          )}
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
          <Button disabled={isSaving}>
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
      {input.employeeType === 'BORONGAN' && (
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
  ...props
}: {
  label: string
  options: { value: string; label: string }[]
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className='grid gap-1 text-sm'>
      {label}
      <select className='h-9 rounded-md border bg-background px-3' {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
