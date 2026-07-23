import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { CalendarDays, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DatePicker } from '@/components/date-picker'
import { useApplyBatchMutation, useEmployeeLookups } from '../data/queries'
import type { Employee, MutationInput } from '../domain'
import {
  editableMutationFields,
  selectableMutationChangeTypes,
} from '../mutation-change-type'
import { statusLabel } from '../utils'
import { EmployeePicker } from './employee-picker'

type BatchRow = {
  employee: Employee
  input: MutationInput
}

type RowErrors = Record<number, string>

export function BatchMutationDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [rows, setRows] = useState<BatchRow[]>([])
  const [pickerValue, setPickerValue] = useState('')
  const [errors, setErrors] = useState<RowErrors>({})
  const [confirmOpen, setConfirmOpen] = useState(false)
  const lookups = useEmployeeLookups(open)
  const batch = useApplyBatchMutation()

  const addEmployee = (employee: Employee) => {
    setRows((previous) => {
      if (previous.some((row) => row.employee.uid === employee.uid)) {
        toast.error('Karyawan ini sudah ada di dalam batch.')
        return previous
      }
      if (previous.length >= 25) {
        toast.error('Satu batch maksimal 25 karyawan.')
        return previous
      }
      return [...previous, createBatchRow(employee)]
    })
    setPickerValue('')
  }

  const directCount = useMemo(
    () =>
      rows.filter((row) => row.input.effectiveFrom === businessDateInput())
        .length,
    [rows]
  )
  const scheduledCount = rows.length - directCount

  const updateRow = (index: number, patch: Partial<MutationInput>) => {
    setRows((previous) =>
      previous.map((row, rowIndex) =>
        rowIndex === index ? { ...row, input: { ...row.input, ...patch } } : row
      )
    )
    setErrors((previous) => {
      const { [index]: _removed, ...rest } = previous
      return rest
    })
  }

  const changeSite = (index: number, site: MutationInput['site']) => {
    updateRow(index, {
      site,
      department: undefined,
      productionModuleUid: undefined,
      productionModuleSectionUid: undefined,
    })
  }

  const changeEmployeeType = (
    index: number,
    employeeType: MutationInput['employeeType']
  ) => {
    updateRow(index, {
      employeeType,
      productionModuleUid: undefined,
      productionModuleSectionUid: undefined,
    })
  }

  const changeRowChangeType = (
    index: number,
    changeType: MutationInput['changeType']
  ) => {
    setRows((previous) =>
      previous.map((row, rowIndex) => {
        if (rowIndex !== index) return row
        return {
          ...row,
          input: {
            ...createBatchRow(row.employee).input,
            effectiveFrom: row.input.effectiveFrom,
            referenceNumber: row.input.referenceNumber,
            reason: row.input.reason,
            notes: row.input.notes,
            changeType,
          },
        }
      })
    )
  }

  const review = () => {
    const nextErrors: RowErrors = {}
    rows.forEach((row, index) => {
      const error = batchRowError(row)
      if (error) nextErrors[index] = error
    })
    if (!rows.length) {
      toast.error('Pilih minimal satu karyawan.')
      return
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      toast.error('Periksa baris yang masih belum valid.')
      return
    }
    setConfirmOpen(true)
  }

  const reset = () => {
    setRows([])
    setPickerValue('')
    setErrors({})
    setConfirmOpen(false)
  }

  const close = () => {
    reset()
    onOpenChange(false)
  }

  const save = () => {
    batch.mutate(
      rows.map(({ employee, input }) => ({ employeeUid: employee.uid, input })),
      {
        onSuccess: (result) => {
          toast.success(
            `Batch tersimpan: ${result.applied} diterapkan, ${result.scheduled} dijadwalkan.`
          )
          close()
        },
        onError: (error) =>
          toast.error(
            isAxiosError<{ message?: string }>(error)
              ? (error.response?.data?.message ??
                  'Batch mutasi gagal disimpan.')
              : 'Batch mutasi gagal disimpan.'
          ),
      }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !batch.isPending) {
          close()
        }
      }}
    >
      <DialogContent className='flex h-[min(88svh,54rem)] w-[calc(100vw-1rem)] max-w-none flex-col overflow-hidden p-0 sm:w-[calc(100vw-3rem)] sm:max-w-[calc(100vw-3rem)] sm:rounded-xl xl:max-w-[110rem]'>
        <DialogHeader className='border-b bg-muted/25 px-6 pt-6 pb-4 sm:px-8'>
          <div className='flex flex-col gap-2 pr-8 sm:flex-row sm:items-start sm:justify-between'>
            <DialogTitle>Catat mutasi batch</DialogTitle>
            <span className='w-fit rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary'>
              Maksimal 25 karyawan
            </span>
          </div>
          <DialogDescription>
            Atur target dan tanggal efektif per karyawan. Batch akan tersimpan
            seluruhnya atau batal seluruhnya jika ada satu baris yang gagal.
          </DialogDescription>
        </DialogHeader>
        <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-4 sm:px-8'>
          <div className='flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-end sm:justify-between'>
            <div className='w-full sm:max-w-lg'>
              <EmployeePicker
                value={pickerValue}
                onChange={setPickerValue}
                onSelectEmployee={addEmployee}
              />
            </div>
            <div className='flex gap-2 text-xs'>
              <span className='rounded-md border bg-background px-2 py-1.5 text-muted-foreground'>
                {rows.length}/25 dipilih
              </span>
              <span className='rounded-md border bg-background px-2 py-1.5 text-muted-foreground'>
                Atur setiap baris secara mandiri
              </span>
            </div>
          </div>
          {!rows.length ? (
            <div className='flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground'>
              <Plus className='mb-2 size-5' />
              Pilih karyawan untuk mulai menyusun batch mutasi.
            </div>
          ) : (
            <div className='rounded-lg border'>
              <Table className='w-full table-fixed'>
                <colgroup>
                  <col className='w-[4%]' />
                  <col className='w-[16%]' />
                  <col className='w-[15%]' />
                  <col className='w-[42%]' />
                  <col className='w-[19%]' />
                  <col className='w-[4%]' />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-12 text-center'>No.</TableHead>
                    <TableHead>Karyawan</TableHead>
                    <TableHead>Efektif & perubahan</TableHead>
                    <TableHead>Target perubahan</TableHead>
                    <TableHead>Alasan & catatan</TableHead>
                    <TableHead className='w-12' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <BatchMutationTableRow
                      key={row.employee.uid}
                      row={row}
                      rowNumber={index + 1}
                      error={errors[index]}
                      lookups={lookups.data}
                      onChange={(patch) => updateRow(index, patch)}
                      onSiteChange={(site) => changeSite(index, site)}
                      onEmployeeTypeChange={(employeeType) =>
                        changeEmployeeType(index, employeeType)
                      }
                      onChangeType={(changeType) =>
                        changeRowChangeType(index, changeType)
                      }
                      onRemove={() =>
                        setRows((previous) =>
                          previous.filter((_, rowIndex) => rowIndex !== index)
                        )
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <div className='flex flex-col-reverse justify-between gap-3 border-t bg-background px-6 py-4 sm:flex-row sm:items-center sm:px-8'>
          <p className='text-sm text-muted-foreground'>
            {directCount} langsung diterapkan / {scheduledCount} dijadwalkan
          </p>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={close}>
              Batal
            </Button>
            <Button onClick={review} disabled={!rows.length || batch.isPending}>
              <CalendarDays /> Tinjau batch ({rows.length})
            </Button>
          </div>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={(nextOpen) => {
            if (!nextOpen && !batch.isPending) setConfirmOpen(false)
          }}
          title='Konfirmasi mutasi batch'
          desc={<BatchMutationSummary rows={rows} />}
          cancelBtnText='Kembali periksa'
          confirmText='Simpan seluruh batch'
          isLoading={batch.isPending}
          handleConfirm={save}
        />
      </DialogContent>
    </Dialog>
  )
}

function batchRowError(row: BatchRow) {
  if (row.input.effectiveFrom < businessDateInput()) {
    return 'Tanggal efektif tidak boleh lampau.'
  }
  if (
    editableMutationFields(row.input.changeType, row.input.employeeType).has(
      'productionAssignment'
    ) &&
    ['BORONGAN', 'TRAINING'].includes(row.input.employeeType) &&
    !row.input.productionModuleSectionUid
  ) {
    return 'Modul dan Bagian wajib dipilih.'
  }
  if (
    row.input.changeType === 'TRANSFER' &&
    row.input.site === row.employee.site
  ) {
    return 'Pilih site tujuan yang berbeda.'
  }
  if (
    (row.input.changeType === 'PROMOTION' ||
      row.input.changeType === 'DEMOTION') &&
    row.input.position === row.employee.position
  ) {
    return 'Pilih jabatan baru.'
  }
  if (
    row.input.changeType === 'DEPARTMENT_CHANGE' &&
    row.input.department === row.employee.department
  ) {
    return 'Pilih departemen baru.'
  }
  if (
    row.input.changeType === 'TYPE_CHANGE' &&
    row.input.employeeType === row.employee.employeeType
  ) {
    return 'Pilih jenis karyawan yang berbeda.'
  }
  if (
    row.input.changeType === 'PRODUCTION_ASSIGNMENT_CHANGE' &&
    row.input.productionModuleSectionUid ===
      row.employee.productionModuleSectionUid
  ) {
    return 'Pilih Modul atau Bagian yang berbeda.'
  }
  return undefined
}

function BatchMutationTableRow({
  row,
  rowNumber,
  error,
  lookups,
  onChange,
  onSiteChange,
  onEmployeeTypeChange,
  onChangeType,
  onRemove,
}: {
  row: BatchRow
  rowNumber: number
  error?: string
  lookups: ReturnType<typeof useEmployeeLookups>['data']
  onChange: (patch: Partial<MutationInput>) => void
  onSiteChange: (site: MutationInput['site']) => void
  onEmployeeTypeChange: (employeeType: MutationInput['employeeType']) => void
  onChangeType: (changeType: MutationInput['changeType']) => void
  onRemove: () => void
}) {
  const modules = (lookups?.productionModules ?? []).filter(
    (item) => item.siteCode === row.input.site
  )
  const sections = (lookups?.productionModuleSections ?? []).filter(
    (item) => item.moduleUid === row.input.productionModuleUid
  )
  const editableFields = editableMutationFields(
    row.input.changeType,
    row.input.employeeType
  )
  return (
    <TableRow className={error ? 'bg-destructive/5' : undefined}>
      <TableCell className='w-10 py-1 text-center align-top text-[11px] text-muted-foreground tabular-nums'>
        {rowNumber}
      </TableCell>
      <TableCell className='min-w-0 py-1 align-top whitespace-normal'>
        <p className='text-sm leading-4 font-medium break-words'>
          {row.employee.fullName}
        </p>
        <p className='text-[10px] leading-3 break-words text-muted-foreground'>
          {row.employee.employeeNumber} -{' '}
          {statusLabel(row.employee.employeeType)}
        </p>
        <p className='mt-0.5 text-[10px] leading-3 break-words text-muted-foreground'>
          {row.employee.site} / {row.employee.department ?? '-'} /{' '}
          {row.employee.position ?? '-'}
        </p>
        {error ? (
          <p className='mt-1 text-[11px] text-destructive'>{error}</p>
        ) : null}
      </TableCell>
      <TableCell className='min-w-0 py-1 align-top'>
        <DatePicker
          selected={dateFromInput(row.input.effectiveFrom)}
          onSelect={(date) => onChange({ effectiveFrom: dateToInput(date) })}
          triggerClassName='h-8 px-2 text-xs'
        />
        <InlineSelect
          aria-label='Jenis perubahan'
          className='mt-1.5'
          value={row.input.changeType}
          onChange={(event) =>
            onChangeType(event.target.value as MutationInput['changeType'])
          }
        >
          {selectableMutationChangeTypes.map((value) => (
            <option key={value} value={value}>
              {statusLabel(value)}
            </option>
          ))}
        </InlineSelect>
        <p className='mt-1 text-[10px] leading-3 text-muted-foreground'>
          Field lain dikunci sesuai jenis perubahan.
        </p>
      </TableCell>
      <TableCell className='min-w-0 py-1 align-top'>
        <div className='grid gap-1.5'>
          <div className='grid grid-cols-3 gap-1.5'>
            <InlineSelect
              aria-label='Target site'
              value={row.input.site}
              disabled={!editableFields.has('site')}
              onChange={(event) =>
                onSiteChange(event.target.value as MutationInput['site'])
              }
            >
              {(lookups?.sites ?? []).map((item) => (
                <option key={item.uid} value={item.code}>
                  {item.name}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              aria-label='Target departemen'
              value={row.input.department ?? ''}
              disabled={!editableFields.has('department')}
              onChange={(event) =>
                onChange({ department: event.target.value || undefined })
              }
            >
              <option value=''>Tanpa departemen</option>
              {(lookups?.departments ?? [])
                .filter(
                  (item) => !item.siteCode || item.siteCode === row.input.site
                )
                .map((item) => (
                  <option key={item.uid} value={item.name}>
                    {item.name}
                  </option>
                ))}
            </InlineSelect>
            <InlineSelect
              aria-label='Target jabatan'
              value={row.input.position ?? ''}
              disabled={!editableFields.has('position')}
              onChange={(event) =>
                onChange({ position: event.target.value || undefined })
              }
            >
              <option value=''>Tanpa jabatan</option>
              {(lookups?.positions ?? []).map((item) => (
                <option key={item.uid} value={item.name}>
                  {item.name}
                </option>
              ))}
            </InlineSelect>
          </div>
          <div className='grid grid-cols-3 gap-1.5'>
            <InlineSelect
              aria-label='Jenis karyawan'
              value={row.input.employeeType}
              disabled={!editableFields.has('employeeType')}
              onChange={(event) =>
                onEmployeeTypeChange(
                  event.target.value as MutationInput['employeeType']
                )
              }
            >
              <option value='BORONGAN'>Borongan</option>
              <option value='TRAINING'>Training</option>
              <option value='BULANAN'>Bulanan</option>
            </InlineSelect>
            <InlineSelect
              aria-label='Modul produksi'
              value={
                ['BORONGAN', 'TRAINING'].includes(row.input.employeeType)
                  ? (row.input.productionModuleUid ?? '')
                  : ''
              }
              disabled={
                !['BORONGAN', 'TRAINING'].includes(row.input.employeeType) ||
                !editableFields.has('productionAssignment')
              }
              onChange={(event) =>
                onChange({
                  productionModuleUid: event.target.value || undefined,
                  productionModuleSectionUid: undefined,
                })
              }
            >
              <option value=''>
                {['BORONGAN', 'TRAINING'].includes(row.input.employeeType)
                  ? 'Pilih modul'
                  : 'Tidak berlaku'}
              </option>
              {modules.map((item) => (
                <option key={item.uid} value={item.uid}>
                  {item.name}
                </option>
              ))}
            </InlineSelect>
            <InlineSelect
              aria-label='Bagian produksi'
              value={
                ['BORONGAN', 'TRAINING'].includes(row.input.employeeType)
                  ? (row.input.productionModuleSectionUid ?? '')
                  : ''
              }
              disabled={
                !['BORONGAN', 'TRAINING'].includes(row.input.employeeType) ||
                !editableFields.has('productionAssignment') ||
                !row.input.productionModuleUid
              }
              onChange={(event) =>
                onChange({
                  productionModuleSectionUid: event.target.value || undefined,
                })
              }
            >
              <option value=''>
                {['BORONGAN', 'TRAINING'].includes(row.input.employeeType)
                  ? 'Pilih Bagian'
                  : 'Tidak berlaku'}
              </option>
              {sections.map((item) => (
                <option key={item.uid} value={item.uid}>
                  {item.sectionName}
                </option>
              ))}
            </InlineSelect>
          </div>
        </div>
      </TableCell>
      <TableCell className='min-w-0 py-1 align-top'>
        <div className='grid gap-1.5'>
          <Input
            aria-label='Alasan mutasi'
            className='h-8 min-w-0 px-2 text-xs'
            placeholder='Alasan'
            value={row.input.reason ?? ''}
            onChange={(event) => onChange({ reason: event.target.value })}
          />
          <Textarea
            aria-label='Catatan mutasi'
            className='min-h-8 min-w-0 resize-y px-2 py-1 text-xs'
            placeholder='Catatan'
            value={row.input.notes ?? ''}
            onChange={(event) => onChange({ notes: event.target.value })}
          />
        </div>
      </TableCell>
      <TableCell className='w-10 py-1 align-top'>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label={`Hapus ${row.employee.fullName} dari batch`}
          onClick={onRemove}
        >
          <Trash2 className='text-destructive' />
        </Button>
      </TableCell>
    </TableRow>
  )
}

function BatchMutationSummary({ rows }: { rows: BatchRow[] }) {
  return (
    <div className='grid max-h-80 gap-2 overflow-y-auto text-sm text-foreground'>
      <p className='text-muted-foreground'>
        Periksa seluruh baris. Jika satu baris tidak lolos validasi server,
        tidak ada mutasi yang disimpan.
      </p>
      {rows.map((row) => (
        <div key={row.employee.uid} className='rounded-md border p-3'>
          <div className='flex flex-wrap justify-between gap-x-3 gap-y-1'>
            <strong>{row.employee.fullName}</strong>
            <span className='text-muted-foreground'>
              {row.input.effectiveFrom > businessDateInput()
                ? 'Dijadwalkan'
                : 'Diterapkan hari ini'}
            </span>
          </div>
          <p className='mt-1 text-muted-foreground'>
            {row.employee.site} / {row.employee.department ?? '-'} /{' '}
            {row.employee.position ?? '-'} to {row.input.site} /{' '}
            {row.input.department ?? '-'} / {row.input.position ?? '-'}
          </p>
          <p className='mt-1 text-xs text-muted-foreground'>
            {statusLabel(row.input.changeType)} · {row.input.effectiveFrom}
          </p>
        </div>
      ))}
    </div>
  )
}

function InlineSelect({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'block h-8 w-full min-w-0 rounded-md border bg-background px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

function createBatchRow(employee: Employee): BatchRow {
  return {
    employee,
    input: {
      site: employee.site,
      department: employee.department,
      position: employee.position,
      workGroup: employee.workGroup,
      productionModuleUid: employee.productionModuleUid,
      productionModuleSectionUid: employee.productionModuleSectionUid,
      employeeType: employee.employeeType,
      effectiveFrom: businessDateInput(),
      changeType: 'TRANSFER',
    },
  }
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
