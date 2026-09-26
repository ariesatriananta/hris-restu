import { useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { safeInternalReturnTo } from '@/lib/list-return-to'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import { httpEmployeeRepository } from '../data/http-employee-repository'
import {
  useActivateContractsBatch,
  usePreviewContractsBatchActivation,
  useSaveContractsBatch,
} from '../data/queries'
import type {
  ContractBatchActivationPreview,
  Employee,
  EmployeeContract,
} from '../domain'
import { contractTypeRequiresEndDate } from '../employee-contract-policy'
import { formatDate, statusLabel } from '../utils'
import {
  mergeSharedContractInput,
  type BatchContractInput,
} from './batch-contract-input'
import { EmployeePicker } from './employee-picker'
import { OnboardingSteps } from './onboarding-steps'

type BatchContractRow = {
  employee: Employee
  contracts: EmployeeContract[]
  input: BatchContractInput
}

export function BatchContractFormPage({
  returnTo,
  employeeUids,
  contractUids,
  onboarding = false,
}: {
  returnTo?: string
  employeeUids?: string
  contractUids?: string
  onboarding?: boolean
}) {
  const navigate = useNavigate()
  const session = useAuthStore((state) => state.session)
  const canPrepareAttendance = hasPermission(session, 'attendance.manage_shift')
  const listReturnTo = safeInternalReturnTo(returnTo, '/karyawan/pkwt-dokumen')
  const [rows, setRows] = useState<BatchContractRow[]>([])
  const [pickerValue, setPickerValue] = useState('')
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [loadingEmployeeUid, setLoadingEmployeeUid] = useState<string>()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const resumedContractUids = useMemo(
    () => uniqueUids(contractUids),
    [contractUids]
  )
  const [step, setStep] = useState<2 | 3>(resumedContractUids.length ? 3 : 2)
  const [createdContractUids, setCreatedContractUids] =
    useState<string[]>(resumedContractUids)
  const [activationPreview, setActivationPreview] =
    useState<ContractBatchActivationPreview>()
  const saveBatch = useSaveContractsBatch()
  const activationPreviewMutation = usePreviewContractsBatchActivation()
  const loadedActivationCheckpoint = useRef('')
  const activateBatch = useActivateContractsBatch()
  const [sharedInput, setSharedInput] = useState<BatchContractInput>({
    contractType: 'PKWT',
    startDate: businessDateInput(),
    endDate: '',
    notes: '',
  })
  const { confirmation } = useUnsavedChanges(rows.length > 0)

  const rowErrors = useMemo(() => validateRows(rows), [rows])
  const hasErrors = Object.keys(rowErrors).length > 0

  const goBack = (ignoreBlocker = false) => {
    navigate({ to: listReturnTo, ignoreBlocker })
  }

  const addEmployee = async (employee: Employee) => {
    if (rows.some((row) => row.employee.uid === employee.uid)) {
      toast.error('Karyawan ini sudah ada di dalam batch.')
      setPickerValue('')
      return
    }
    if (rows.length >= 200) {
      toast.error('Satu batch maksimal 200 karyawan.')
      setPickerValue('')
      return
    }
    setLoadingEmployeeUid(employee.uid)
    try {
      const contracts = await httpEmployeeRepository.contracts(employee.uid)
      setRows((previous) => [
        ...previous,
        createBatchContractRow(employee, contracts),
      ])
      setPickerValue('')
    } catch (error) {
      toast.error(
        isAxiosError<{ message?: string }>(error)
          ? (error.response?.data?.message ?? 'Kontrak karyawan gagal dimuat.')
          : 'Kontrak karyawan gagal dimuat.'
      )
    } finally {
      setLoadingEmployeeUid(undefined)
    }
  }

  useEffect(() => {
    if (!employeeUids) return
    const uniqueEmployeeUids = [
      ...new Set(
        employeeUids
          .split(',')
          .map((uid) => uid.trim())
          .filter(Boolean)
      ),
    ]
    if (!uniqueEmployeeUids.length) return
    if (uniqueEmployeeUids.length > 200) {
      toast.error('Create multiple kontrak maksimal 200 karyawan.')
      return
    }
    let cancelled = false
    queueMicrotask(() => {
      if (!cancelled) setLoadingEmployeeUid('batch')
    })
    Promise.all(
      uniqueEmployeeUids.map(async (uid) => {
        const employee = await httpEmployeeRepository.getByUid(uid)
        if (!employee) throw new Error('Karyawan tidak ditemukan.')
        const contracts = await httpEmployeeRepository.contracts(uid)
        return createBatchContractRow(employee, contracts)
      })
    )
      .then((nextRows) => {
        if (cancelled) return
        setRows(nextRows)
      })
      .catch((error) =>
        toast.error(
          isAxiosError<{ message?: string }>(error)
            ? (error.response?.data?.message ??
                'Data karyawan terpilih gagal dimuat.')
            : 'Data karyawan terpilih gagal dimuat.'
        )
      )
      .finally(() => {
        if (!cancelled) setLoadingEmployeeUid(undefined)
      })
    return () => {
      cancelled = true
    }
  }, [employeeUids])

  useEffect(() => {
    const checkpoint = resumedContractUids.join(',')
    if (!checkpoint || loadedActivationCheckpoint.current === checkpoint) return
    loadedActivationCheckpoint.current = checkpoint
    setCreatedContractUids(resumedContractUids)
    setStep(3)
    activationPreviewMutation.mutate(resumedContractUids, {
      onSuccess: setActivationPreview,
      onError: () => toast.error('Preview aktivasi kontrak gagal dimuat.'),
    })
  }, [activationPreviewMutation, resumedContractUids])

  const updateRow = (
    index: number,
    patch: Partial<BatchContractRow['input']>
  ) => {
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

  const review = () => {
    const nextErrors = validateRows(rows)
    if (!rows.length) {
      toast.error('Pilih minimal satu karyawan.')
      return
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      toast.error('Periksa baris yang masih belum valid.')
      return
    }
    setErrors({})
    setConfirmOpen(true)
  }

  const save = () => {
    const nextErrors = validateRows(rows)
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      setConfirmOpen(false)
      toast.error('Periksa baris yang masih belum valid.')
      return
    }
    saveBatch.mutate(
      rows.map((row) => ({
        employeeUid: row.employee.uid,
        input: {
          contractType: row.input.contractType,
          startDate: row.input.startDate,
          endDate: row.input.endDate || undefined,
          notes: row.input.notes || undefined,
        },
      })),
      {
        onSuccess: (result) => {
          toast.success(`${result.created.length} kontrak draft dibuat.`)
          setConfirmOpen(false)
          const contractUids = result.created.map((item) => item.uid)
          setCreatedContractUids(contractUids)
          setStep(3)
          if (onboarding) {
            navigate({
              to: '/karyawan/pkwt/tambah-multiple',
              search: {
                returnTo,
                onboarding: true,
                contractUids: contractUids.join(','),
              },
              replace: true,
              ignoreBlocker: true,
            })
          }
          activationPreviewMutation.mutate(contractUids, {
            onSuccess: setActivationPreview,
            onError: () =>
              toast.error('Preview aktivasi kontrak gagal dimuat.'),
          })
        },
        onError: (error) =>
          toast.error(
            isAxiosError<{ message?: string }>(error)
              ? (error.response?.data?.message ??
                  'Batch kontrak gagal disimpan.')
              : 'Batch kontrak gagal disimpan.'
          ),
      }
    )
  }

  return (
    <Main className='max-w-none'>
      <Button variant='ghost' className='mb-3 -ml-3' onClick={() => goBack()}>
        <ArrowLeft /> Kontrak Karyawan
      </Button>
      <div className='mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end'>
        <div>
          <h1 className='text-2xl font-bold'>Multiple Kontrak</h1>
          <p className='text-muted-foreground'>
            Buat beberapa kontrak draft sekaligus. Jika satu baris gagal
            validasi server, seluruh batch dibatalkan.
          </p>
        </div>
        <span className='w-fit rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary'>
          Maksimal 200 karyawan
        </span>
      </div>

      {onboarding && (
        <div className='mb-4 max-w-3xl'>
          <OnboardingSteps activeStep={step} />
        </div>
      )}

      {step === 3 ? (
        <ActivationReview
          preview={activationPreview}
          isLoading={activationPreviewMutation.isPending}
          isActivating={activateBatch.isPending}
          onActivate={() => {
            activateBatch.mutate(createdContractUids, {
              onSuccess: (result) => {
                const scheduledText = result.scheduled.length
                  ? `, ${result.scheduled.length} dijadwalkan`
                  : ''
                toast.success(
                  `${result.activated.length} kontrak aktif${scheduledText}.`
                )
                const activeEmployeeUids = result.activated.map(
                  (item) => item.employeeUid
                )
                if (
                  onboarding &&
                  activeEmployeeUids.length &&
                  canPrepareAttendance
                ) {
                  navigate({
                    to: '/attendance/master-shift',
                    search: {
                      tab: 'assignment',
                      setupAttendance: true,
                      employeeUids: activeEmployeeUids.join(','),
                    },
                    ignoreBlocker: true,
                  })
                  return
                }
                if (
                  onboarding &&
                  activeEmployeeUids.length &&
                  !canPrepareAttendance
                ) {
                  toast.info(
                    'Kontrak sudah aktif. Penugasan Shift perlu dilanjutkan oleh pengguna yang memiliki akses Attendance.'
                  )
                }
                goBack(true)
              },
              onError: (error) =>
                toast.error(
                  isAxiosError<{ message?: string }>(error)
                    ? (error.response?.data?.message ?? 'Aktivasi batch gagal.')
                    : 'Aktivasi batch gagal.'
                ),
            })
          }}
          onBack={rows.length ? () => setStep(2) : undefined}
        />
      ) : (
        <div className='space-y-4 pb-24'>
          {rows.length > 0 && (
            <SharedContractForm
              value={sharedInput}
              onChange={setSharedInput}
              onApply={() => {
                setRows((previous) =>
                  previous.map((row) => ({
                    ...row,
                    input: mergeSharedContractInput(row.input, sharedInput),
                  }))
                )
                setErrors({})
                toast.success(
                  'Pengaturan kontrak diterapkan ke semua karyawan.'
                )
              }}
            />
          )}
          <div className='flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-end sm:justify-between'>
            <div className='w-full sm:max-w-lg'>
              <EmployeePicker
                value={pickerValue}
                onChange={setPickerValue}
                onSelectEmployee={addEmployee}
              />
            </div>
            <div className='flex flex-wrap gap-2 text-xs'>
              <span className='rounded-md border bg-background px-2 py-1.5 text-muted-foreground'>
                {rows.length}/200 dipilih
              </span>
              <span className='rounded-md border bg-background px-2 py-1.5 text-muted-foreground'>
                {loadingEmployeeUid ? 'Memuat kontrak...' : 'Status: draft'}
              </span>
            </div>
          </div>

          {!rows.length ? (
            <div className='flex min-h-72 flex-col items-center justify-center rounded-lg border border-dashed px-6 text-center text-sm text-muted-foreground'>
              <Plus className='mb-2 size-5' />
              Pilih karyawan untuk mulai menyusun batch kontrak.
            </div>
          ) : (
            <div className='rounded-lg border'>
              <Table className='w-full table-fixed'>
                <colgroup>
                  <col className='w-[4%]' />
                  <col className='w-[24%]' />
                  <col className='w-[14%]' />
                  <col className='w-[15%]' />
                  <col className='w-[15%]' />
                  <col className='w-[24%]' />
                  <col className='w-[4%]' />
                </colgroup>
                <TableHeader>
                  <TableRow>
                    <TableHead className='text-center'>No.</TableHead>
                    <TableHead>Karyawan</TableHead>
                    <TableHead>Jenis kontrak</TableHead>
                    <TableHead>Tanggal mulai</TableHead>
                    <TableHead>Tanggal berakhir</TableHead>
                    <TableHead>Catatan & status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <BatchContractTableRow
                      key={row.employee.uid}
                      row={row}
                      rowNumber={index + 1}
                      error={errors[index] ?? rowErrors[index]}
                      onChange={(patch) => updateRow(index, patch)}
                      onRemove={() => {
                        setRows((previous) =>
                          previous.filter((_, rowIndex) => rowIndex !== index)
                        )
                        setErrors({})
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className='sticky bottom-3 z-20 flex flex-col-reverse justify-between gap-3 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:flex-row sm:items-center'>
          <p className='text-sm text-muted-foreground'>
            {hasErrors
              ? 'Masih ada baris yang perlu diperbaiki.'
              : `${rows.length} kontrak draft siap ditinjau.`}
          </p>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              onClick={() => goBack()}
              disabled={saveBatch.isPending}
            >
              Batal
            </Button>
            <Button
              onClick={review}
              disabled={
                !rows.length ||
                hasErrors ||
                Boolean(loadingEmployeeUid) ||
                saveBatch.isPending
              }
            >
              <Save /> Tinjau batch ({rows.length})
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !saveBatch.isPending) setConfirmOpen(false)
        }}
        title='Konfirmasi multiple kontrak'
        desc={<BatchContractSummary rows={rows} />}
        cancelBtnText='Kembali periksa'
        confirmText='Simpan seluruh batch'
        isLoading={saveBatch.isPending}
        handleConfirm={save}
      />
      {confirmation}
    </Main>
  )
}

function SharedContractForm({
  value,
  onChange,
  onApply,
}: {
  value: BatchContractInput
  onChange: (value: BatchContractInput) => void
  onApply: () => void
}) {
  return (
    <section className='rounded-lg border border-primary/20 bg-primary/5 p-4'>
      <div className='mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center'>
        <div>
          <h2 className='font-medium'>Berlaku untuk semua karyawan</h2>
          <p className='text-xs text-muted-foreground'>
            Isi sekali, lalu terapkan ke seluruh baris. Setelah itu Anda masih
            bisa menyesuaikan kontrak tertentu di tabel.
          </p>
        </div>
        <Button type='button' size='sm' variant='secondary' onClick={onApply}>
          Terapkan ke semua
        </Button>
      </div>
      <div className='grid gap-3 sm:grid-cols-4'>
        <label className='grid gap-1.5 text-xs font-medium'>
          Jenis kontrak
          <select
            aria-label='Jenis kontrak untuk semua'
            className='h-9 rounded-md border bg-background px-2 text-sm'
            value={value.contractType}
            onChange={(event) =>
              onChange({
                ...value,
                contractType: event.target
                  .value as BatchContractRow['input']['contractType'],
              })
            }
          >
            <option value='TRAINING'>Training</option>
            <option value='PKWT'>PKWT</option>
            <option value='PKWTT'>PKWTT</option>
          </select>
        </label>
        <label className='grid gap-1.5 text-xs font-medium'>
          Tanggal mulai
          <DatePicker
            selected={dateFromInput(value.startDate)}
            onSelect={(date) =>
              date && onChange({ ...value, startDate: dateToInput(date) })
            }
            triggerClassName='h-9 px-2 text-sm'
          />
        </label>
        <label className='grid gap-1.5 text-xs font-medium'>
          Tanggal berakhir
          <DatePicker
            selected={dateFromInput(value.endDate)}
            disabledDates={(date) =>
              Boolean(value.startDate && dateToInput(date) < value.startDate)
            }
            onSelect={(date) =>
              onChange({ ...value, endDate: date ? dateToInput(date) : '' })
            }
            triggerClassName='h-9 px-2 text-sm'
          />
        </label>
        <label className='grid gap-1.5 text-xs font-medium'>
          Catatan
          <Textarea
            className='min-h-9 resize-y bg-background px-2 py-1.5 text-sm'
            placeholder='Opsional'
            value={value.notes}
            onChange={(event) =>
              onChange({ ...value, notes: event.target.value })
            }
          />
        </label>
      </div>
    </section>
  )
}

function ActivationReview({
  preview,
  isLoading,
  isActivating,
  onActivate,
  onBack,
}: {
  preview?: ContractBatchActivationPreview
  isLoading: boolean
  isActivating: boolean
  onActivate: () => void
  onBack?: () => void
}) {
  return (
    <section className='max-w-3xl space-y-4 pb-24'>
      <div className='rounded-xl border border-emerald-300/60 bg-emerald-50/70 p-5 dark:border-emerald-900 dark:bg-emerald-950/20'>
        <div className='flex items-start gap-3'>
          <CheckCircle2 className='mt-0.5 size-6 shrink-0 text-emerald-600' />
          <div>
            <h2 className='font-semibold'>Kontrak draft berhasil dibuat</h2>
            <p className='mt-1 text-sm text-muted-foreground'>
              Periksa ringkasan berikut. Kontrak dengan tanggal mulai hari ini
              atau sebelumnya siap diaktifkan. Kontrak masa depan perlu
              diperbaiki terlebih dahulu.
            </p>
          </div>
        </div>
      </div>
      {isLoading ? (
        <div className='flex items-center gap-2 rounded-lg border p-5 text-sm text-muted-foreground'>
          <LoaderCircle className='size-4 animate-spin' /> Memeriksa kesiapan
          aktivasi...
        </div>
      ) : preview ? (
        <>
          <div className='grid gap-3 sm:grid-cols-3'>
            <SummaryCard label='Total kontrak' value={preview.total} />
            <SummaryCard label='Siap aktif' value={preview.ready} />
            <SummaryCard label='Dijadwalkan' value={preview.scheduled} />
          </div>
          {preview.blockers.length > 0 && (
            <div className='rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm'>
              <p className='font-medium text-destructive'>Perlu diperbaiki</p>
              <ul className='mt-2 list-disc space-y-1 pl-5 text-muted-foreground'>
                {preview.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}
          <div className='rounded-lg border'>
            <div className='grid max-h-72 divide-y overflow-y-auto'>
              {preview.items.map((item) => (
                <div
                  key={item.uid}
                  className='flex items-center justify-between gap-3 px-4 py-3 text-sm'
                >
                  <div className='min-w-0'>
                    <p className='truncate font-medium'>{item.employeeName}</p>
                    <p className='text-xs text-muted-foreground'>
                      {item.contractNumber}
                    </p>
                  </div>
                  <Badge
                    variant={
                      item.action === 'BLOCKED' ? 'destructive' : 'secondary'
                    }
                  >
                    {item.action === 'ACTIVATE'
                      ? 'Aktif'
                      : item.action === 'SCHEDULE'
                        ? 'Dijadwalkan'
                        : 'Perlu diperbaiki'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
      <div className='flex flex-col-reverse justify-between gap-2 sm:flex-row'>
        {onBack ? (
          <Button variant='outline' onClick={onBack} disabled={isActivating}>
            <ArrowLeft /> Kembali periksa
          </Button>
        ) : (
          <span />
        )}
        <Button
          onClick={onActivate}
          disabled={isLoading || isActivating || !preview?.canActivate}
        >
          {isActivating ? (
            <LoaderCircle className='animate-spin' />
          ) : (
            <ArrowRight />
          )}
          Aktifkan semua kontrak
        </Button>
      </div>
    </section>
  )
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className='rounded-lg border bg-muted/20 p-3'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='mt-1 text-xl font-semibold tabular-nums'>{value}</p>
    </div>
  )
}

function BatchContractTableRow({
  row,
  rowNumber,
  error,
  onChange,
  onRemove,
}: {
  row: BatchContractRow
  rowNumber: number
  error?: string
  onChange: (patch: Partial<BatchContractRow['input']>) => void
  onRemove: () => void
}) {
  return (
    <TableRow className={error ? 'bg-destructive/5' : undefined}>
      <TableCell className='py-2 text-center align-top text-[11px] text-muted-foreground tabular-nums'>
        {rowNumber}
      </TableCell>
      <TableCell className='min-w-0 py-2 align-top whitespace-normal'>
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
      </TableCell>
      <TableCell className='py-2 align-top'>
        <select
          aria-label='Jenis kontrak'
          className='h-8 w-full rounded-md border bg-background px-2 text-xs'
          value={row.input.contractType}
          onChange={(event) =>
            onChange({
              contractType: event.target
                .value as BatchContractRow['input']['contractType'],
            })
          }
        >
          <option value='TRAINING'>Training</option>
          <option value='PKWT'>PKWT</option>
          <option value='PKWTT'>PKWTT</option>
        </select>
      </TableCell>
      <TableCell className='py-2 align-top'>
        <DatePicker
          selected={dateFromInput(row.input.startDate)}
          disabledDates={(date) => dateToInput(date) < row.employee.joinDate}
          onSelect={(date) => onChange({ startDate: dateToInput(date) })}
          triggerClassName='h-8 px-2 text-xs'
        />
      </TableCell>
      <TableCell className='py-2 align-top'>
        <DatePicker
          selected={dateFromInput(row.input.endDate)}
          disabledDates={(date) =>
            Boolean(
              row.input.startDate && dateToInput(date) < row.input.startDate
            )
          }
          onSelect={(date) => onChange({ endDate: dateToInput(date) })}
          triggerClassName='h-8 px-2 text-xs'
        />
      </TableCell>
      <TableCell className='py-2 align-top'>
        <div className='grid gap-1.5'>
          <Textarea
            aria-label='Catatan kontrak'
            className='min-h-8 min-w-0 resize-y px-2 py-1 text-xs'
            placeholder='Catatan opsional'
            value={row.input.notes}
            onChange={(event) => onChange({ notes: event.target.value })}
          />
          {error ? (
            <p className='text-[11px] text-destructive'>{error}</p>
          ) : (
            <Badge variant='secondary' className='w-fit'>
              Valid
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className='py-2 align-top'>
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

function BatchContractSummary({ rows }: { rows: BatchContractRow[] }) {
  return (
    <div className='grid max-h-80 gap-2 overflow-y-auto text-sm text-foreground'>
      <p className='text-muted-foreground'>
        Periksa seluruh kontrak. Jika satu baris tidak lolos validasi server,
        tidak ada kontrak yang disimpan.
      </p>
      {rows.map((row) => (
        <div key={row.employee.uid} className='rounded-md border p-3'>
          <div className='flex flex-wrap justify-between gap-x-3 gap-y-1'>
            <strong>{row.employee.fullName}</strong>
            <span className='text-muted-foreground'>
              {row.input.contractType}
            </span>
          </div>
          <p className='mt-1 text-muted-foreground'>
            {row.employee.employeeNumber} - {row.employee.site} /{' '}
            {row.employee.position ?? '-'}
          </p>
          <p className='mt-1 text-xs text-muted-foreground'>
            {formatDate(row.input.startDate)} - {formatDate(row.input.endDate)}
          </p>
        </div>
      ))}
    </div>
  )
}

function validateRows(rows: BatchContractRow[]) {
  const errors: Record<number, string> = {}
  rows.forEach((row, index) => {
    const error = batchContractRowError(row)
    if (error) errors[index] = error
  })
  return errors
}

function batchContractRowError(row: BatchContractRow) {
  if (!row.input.startDate) return 'Tanggal mulai wajib diisi.'
  if (
    contractTypeRequiresEndDate(row.input.contractType) &&
    !row.input.endDate
  ) {
    return 'Tanggal berakhir wajib untuk kontrak Training atau PKWT.'
  }
  if (row.input.endDate && row.input.endDate < row.input.startDate) {
    return 'Tanggal berakhir tidak boleh sebelum tanggal mulai.'
  }
  if (row.employee.joinDate && row.input.startDate < row.employee.joinDate) {
    return 'Tanggal mulai tidak boleh sebelum tanggal bergabung.'
  }
  const overlap = findOverlappingContract(
    row.contracts,
    row.input.startDate,
    row.input.endDate
  )
  if (overlap) {
    return `Periode bertumpang tindih dengan ${overlap.contractNumber}.`
  }
  return undefined
}

function findOverlappingContract(
  contracts: EmployeeContract[],
  startDate: string,
  endDate?: string
) {
  if (!startDate) return undefined
  const effectiveEndDate = endDate || '9999-12-31'
  return contracts.find((contract) => {
    if (contract.status === 'CANCELLED') return false
    return (
      contract.startDate <= effectiveEndDate &&
      (contract.status === 'TERMINATED'
        ? contract.terminatedAt || contract.endDate || '9999-12-31'
        : contract.endDate || '9999-12-31') >= startDate
    )
  })
}

function createBatchContractRow(
  employee: Employee,
  contracts: EmployeeContract[]
): BatchContractRow {
  const startDate =
    employee.joinDate && employee.joinDate > businessDateInput()
      ? employee.joinDate
      : businessDateInput()
  return {
    employee,
    contracts,
    input: {
      contractType: 'PKWT',
      startDate,
      endDate: '',
      notes: '',
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

function uniqueUids(value?: string) {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((uid) => uid.trim())
        .filter(Boolean)
    ),
  ]
}
