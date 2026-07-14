import { useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useApplyMutation, useEmployeeLookups } from '../data/queries'
import type { Employee, MutationInput } from '../domain'
import { statusLabel } from '../utils'

const mutationSchema = z.object({
  site: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']),
  department: z.string().optional(),
  position: z.string().optional(),
  workGroup: z.string().optional(),
  employeeType: z.enum(['BORONGAN', 'BULANAN']),
  employeeStatus: z.enum(['ACTIVE', 'LEAVE', 'RESIGNED', 'INACTIVE']),
  effectiveFrom: z.string().min(1, 'Tanggal efektif wajib diisi.'),
  changeType: z.enum([
    'INITIAL',
    'TRANSFER',
    'PROMOTION',
    'DEMOTION',
    'STATUS_CHANGE',
    'TYPE_CHANGE',
    'GROUP_CHANGE',
    'OTHER',
  ]),
  referenceNumber: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
})

export function MutationDialog({
  employee,
  open,
  onOpenChange,
}: {
  employee: Employee
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mutation = useApplyMutation()
  const lookups = useEmployeeLookups()
  const [pendingInput, setPendingInput] = useState<MutationInput>()
  const form = useForm<MutationInput>({
    resolver: zodResolver(mutationSchema),
    defaultValues: {
      site: employee.site,
      department: employee.department,
      position: employee.position,
      workGroup: employee.workGroup,
      employeeType: employee.employeeType,
      employeeStatus: employee.employeeStatus,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      changeType: 'TRANSFER',
    },
  })
  const selectedSite = useWatch({ control: form.control, name: 'site' })
  const commit = (input: MutationInput) =>
    mutation.mutate(
      { employeeUid: employee.uid, input },
      {
        onSuccess: () => {
          toast.success('Mutasi dicatat sebagai histori baru.')
          setPendingInput(undefined)
          onOpenChange(false)
        },
        onError: (error) => toast.error(error.message),
      }
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Catat mutasi</DialogTitle>
          <DialogDescription>
            Histori aktif akan ditutup dan record baru ditambahkan. Record lama
            tidak dapat diedit dari alur ini.
          </DialogDescription>
        </DialogHeader>
        <form
          className='grid gap-3'
          onSubmit={form.handleSubmit((input) => setPendingInput(input))}
        >
          <Select
            label='Site'
            options={(lookups.data?.sites ?? []).map((item) => ({
              value: item.code,
              label: item.name,
            }))}
            {...form.register('site')}
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
            label='Kelompok kerja'
            options={(lookups.data?.workGroups ?? [])
              .filter(
                (item) => !item.siteCode || item.siteCode === selectedSite
              )
              .map((item) => ({
                value: item.name,
                label: item.name,
              }))}
            {...form.register('workGroup')}
          />
          <Select
            label='Jenis perubahan'
            options={[
              'TRANSFER',
              'PROMOTION',
              'DEMOTION',
              'STATUS_CHANGE',
              'TYPE_CHANGE',
              'GROUP_CHANGE',
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
          <Select
            label='Status kerja baru'
            options={[
              { value: 'ACTIVE', label: 'Aktif' },
              { value: 'LEAVE', label: 'Cuti' },
              { value: 'RESIGNED', label: 'Resign' },
              { value: 'INACTIVE', label: 'Nonaktif' },
            ]}
            {...form.register('employeeStatus')}
          />
          <label className='grid gap-1 text-sm'>
            Tanggal efektif
            <Input
              type='date'
              {...form.register('effectiveFrom', { required: true })}
            />
          </label>
          <label className='grid gap-1 text-sm'>
            Nomor referensi
            <Input {...form.register('referenceNumber')} />
          </label>
          <label className='grid gap-1 text-sm'>
            Alasan
            <Textarea {...form.register('reason')} />
          </label>
          <label className='grid gap-1 text-sm'>
            Catatan
            <Textarea {...form.register('notes')} />
          </label>
          <Button disabled={mutation.isPending}>Tinjau mutasi</Button>
        </form>
        <ConfirmDialog
          open={Boolean(pendingInput)}
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !mutation.isPending) setPendingInput(undefined)
          }}
          title='Konfirmasi perubahan mutasi'
          desc={
            pendingInput ? (
              <MutationSummary employee={employee} input={pendingInput} />
            ) : (
              ''
            )
          }
          cancelBtnText='Kembali periksa'
          confirmText='Simpan mutasi'
          isLoading={mutation.isPending}
          handleConfirm={() => pendingInput && commit(pendingInput)}
        />
      </DialogContent>
    </Dialog>
  )
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
        Periksa perubahan berikut sebelum histori baru dibuat.
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
      <SummaryRow
        label='Tanggal efektif'
        before='Histori aktif ditutup sehari sebelumnya'
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
