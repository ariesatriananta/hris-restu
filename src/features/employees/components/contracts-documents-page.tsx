import { useMemo, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Main } from '@/components/layout/main'
import {
  useContracts,
  useDocuments,
  useEmployeeList,
  useSaveContract,
  useSaveDocument,
} from '../data/queries'
import type { Employee, EmployeeContract, EmployeeDocument } from '../domain'
import { formatDate, statusLabel } from '../utils'
import { RecordsTable, type EmployeeRecordRow } from './records-table'

const contractSchema = z
  .object({
    employeeUid: z.string().min(1, 'Karyawan wajib dipilih.'),
    contractNumber: z.string().min(1, 'Nomor kontrak wajib diisi.'),
    contractType: z.enum(['PKWT', 'PKWTT', 'OTHER']),
    sequenceNumber: z.coerce
      .number()
      .int()
      .positive('Urutan kontrak minimal 1.'),
    startDate: z.string().min(1, 'Tanggal mulai wajib diisi.'),
    endDate: z.string().optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED']),
    notes: z.string().optional(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'Tanggal berakhir tidak boleh sebelum tanggal mulai.',
  })
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
type ContractValues = z.input<typeof contractSchema>
type ContractOutput = z.output<typeof contractSchema>
type DocumentValues = z.infer<typeof documentSchema>

export function ContractsDocumentsPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const employees = useEmployeeList({ page: 1, pageSize: 100 })
  const contracts = useContracts()
  const documents = useDocuments()
  const [editingContract, setEditingContract] = useState<EmployeeContract>()
  const [editingDocument, setEditingDocument] = useState<EmployeeDocument>()
  const [contractOpen, setContractOpen] = useState(false)
  const [documentOpen, setDocumentOpen] = useState(false)
  const byUid = useMemo(
    () =>
      new Map((employees.data?.items ?? []).map((item) => [item.uid, item])),
    [employees.data?.items]
  )
  const contractRows: EmployeeRecordRow[] = (contracts.data ?? []).map(
    (item) => ({
      uid: item.uid,
      employeeUid: item.employeeUid,
      title: item.contractNumber,
      employee:
        byUid.get(item.employeeUid)?.fullName ?? 'Karyawan tidak ditemukan',
      site: byUid.get(item.employeeUid)?.site ?? '—',
      detail: `${item.contractType} · ${formatDate(item.startDate)} — ${formatDate(item.endDate)}`,
      status: item.status,
      expiry: expiry(item.endDate),
    })
  )
  const documentRows: EmployeeRecordRow[] = (documents.data ?? []).map(
    (item) => ({
      uid: item.uid,
      employeeUid: item.employeeUid,
      title: item.name,
      employee:
        byUid.get(item.employeeUid)?.fullName ?? 'Karyawan tidak ditemukan',
      site: byUid.get(item.employeeUid)?.site ?? '—',
      detail: `${item.documentType} · ${item.file.originalName}`,
      status: item.status,
      expiry: expiry(item.expiryDate),
    })
  )
  const retry = () => {
    void employees.refetch()
    void contracts.refetch()
    void documents.refetch()
  }
  return (
    <Main>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold'>PKWT & Dokumen</h1>
        <p className='text-muted-foreground'>
          Kontrak, masa berlaku, dan metadata lampiran karyawan.
        </p>
      </div>
      <Tabs defaultValue='contracts'>
        <TabsList>
          <TabsTrigger value='contracts'>PKWT & Kontrak</TabsTrigger>
          <TabsTrigger value='documents'>Dokumen</TabsTrigger>
        </TabsList>
        <TabsContent value='contracts' className='mt-4'>
          <RecordsTable
            data={contractRows}
            search={search}
            navigate={navigate}
            prefix='contract'
            statuses={['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED']}
            actionLabel='Tambah kontrak'
            onCreate={() => {
              setEditingContract(undefined)
              setContractOpen(true)
            }}
            onEdit={(uid) => {
              setEditingContract(
                (contracts.data ?? []).find((item) => item.uid === uid)
              )
              setContractOpen(true)
            }}
            isPending={employees.isPending || contracts.isPending}
            isError={employees.isError || contracts.isError}
            onRetry={retry}
          />
        </TabsContent>
        <TabsContent value='documents' className='mt-4'>
          <RecordsTable
            data={documentRows}
            search={search}
            navigate={navigate}
            prefix='document'
            statuses={['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED']}
            actionLabel='Tambah dokumen'
            onCreate={() => {
              setEditingDocument(undefined)
              setDocumentOpen(true)
            }}
            onEdit={(uid) => {
              setEditingDocument(
                (documents.data ?? []).find((item) => item.uid === uid)
              )
              setDocumentOpen(true)
            }}
            isPending={employees.isPending || documents.isPending}
            isError={employees.isError || documents.isError}
            onRetry={retry}
          />
        </TabsContent>
      </Tabs>
      <ContractDialog
        open={contractOpen}
        onOpenChange={setContractOpen}
        employees={employees.data?.items ?? []}
        contract={editingContract}
      />
      <DocumentDialog
        open={documentOpen}
        onOpenChange={setDocumentOpen}
        employees={employees.data?.items ?? []}
        document={editingDocument}
      />
    </Main>
  )
}

function ContractDialog({
  open,
  onOpenChange,
  employees,
  contract,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employees: Employee[]
  contract?: EmployeeContract
}) {
  const save = useSaveContract()
  const form = useForm<ContractValues>({
    resolver: zodResolver(contractSchema),
    values: {
      employeeUid: contract?.employeeUid ?? '',
      contractNumber: contract?.contractNumber ?? '',
      contractType: contract?.contractType ?? 'PKWT',
      sequenceNumber: contract?.sequenceNumber ?? 1,
      startDate: contract?.startDate ?? '',
      endDate: contract?.endDate ?? '',
      status: contract?.status ?? 'DRAFT',
      notes: contract?.notes ?? '',
    },
  })
  const submit = (raw: ContractValues) => {
    const value: ContractOutput = contractSchema.parse(raw)
    const employee = employees.find((item) => item.uid === value.employeeUid)
    save.mutate(
      {
        uid: contract?.uid,
        input: {
          ...value,
          endDate: value.endDate || undefined,
          notes: value.notes || undefined,
          signedDate: contract?.signedDate,
          salaryOrRateNotes: contract?.salaryOrRateNotes,
          issuedFile: contract?.issuedFile,
          positionNameSnapshot:
            contract?.positionNameSnapshot ?? employee?.position,
          siteNameSnapshot:
            contract?.siteNameSnapshot ??
            (employee ? `Site ${statusLabel(employee.site)}` : undefined),
        },
      },
      { onSuccess: () => onOpenChange(false) }
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {contract ? 'Ubah kontrak' : 'Tambah kontrak'}
          </DialogTitle>
          <DialogDescription>
            Lampiran tetap berupa metadata mock.
          </DialogDescription>
        </DialogHeader>
        <form className='grid gap-3' onSubmit={form.handleSubmit(submit)}>
          <EmployeeField
            employees={employees}
            disabled={!!contract}
            {...form.register('employeeUid')}
          />
          <Labeled
            label='Nomor kontrak'
            error={form.formState.errors.contractNumber?.message}
          >
            <Input {...form.register('contractNumber')} />
          </Labeled>
          <SelectNative
            {...form.register('contractType')}
            values={['PKWT', 'PKWTT', 'OTHER']}
          />
          <Labeled
            label='Urutan kontrak'
            error={form.formState.errors.sequenceNumber?.message}
          >
            <Input type='number' {...form.register('sequenceNumber')} />
          </Labeled>
          <Labeled
            label='Tanggal mulai'
            error={form.formState.errors.startDate?.message}
          >
            <Input type='date' {...form.register('startDate')} />
          </Labeled>
          <Labeled
            label='Tanggal berakhir'
            error={form.formState.errors.endDate?.message}
          >
            <Input type='date' {...form.register('endDate')} />
          </Labeled>
          <SelectNative
            {...form.register('status')}
            values={['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'CANCELLED']}
          />
          <Labeled label='Catatan'>
            <Textarea {...form.register('notes')} />
          </Labeled>
          <Button disabled={save.isPending}>
            {save.isPending ? 'Menyimpan...' : 'Simpan kontrak'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DocumentDialog({
  open,
  onOpenChange,
  employees,
  document,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employees: Employee[]
  document?: EmployeeDocument
}) {
  const save = useSaveDocument()
  const form = useForm<DocumentValues>({
    resolver: zodResolver(documentSchema),
    values: {
      employeeUid: document?.employeeUid ?? '',
      documentType: document?.documentType ?? '',
      name: document?.name ?? '',
      documentNumber: document?.documentNumber ?? '',
      issuedDate: document?.issuedDate ?? '',
      expiryDate: document?.expiryDate ?? '',
      status: document?.status ?? 'ACTIVE',
      notes: document?.notes ?? '',
    },
  })
  const submit = (value: DocumentValues) =>
    save.mutate(
      {
        uid: document?.uid,
        input: {
          ...value,
          documentNumber: value.documentNumber || undefined,
          issuedDate: value.issuedDate || undefined,
          expiryDate: value.expiryDate || undefined,
          notes: value.notes || undefined,
          file: document?.file ?? {
            uid: `file-${crypto.randomUUID()}`,
            originalName: 'lampiran-mock.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 0,
            extension: 'pdf',
          },
        },
      },
      { onSuccess: () => onOpenChange(false) }
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {document ? 'Ubah dokumen' : 'Tambah dokumen'}
          </DialogTitle>
          <DialogDescription>
            File belum diunggah; metadata lampiran mock digunakan.
          </DialogDescription>
        </DialogHeader>
        <form className='grid gap-3' onSubmit={form.handleSubmit(submit)}>
          <EmployeeField
            employees={employees}
            disabled={!!document}
            {...form.register('employeeUid')}
          />
          <Labeled
            label='Tipe dokumen'
            error={form.formState.errors.documentType?.message}
          >
            <Input {...form.register('documentType')} />
          </Labeled>
          <Labeled
            label='Nama dokumen'
            error={form.formState.errors.name?.message}
          >
            <Input {...form.register('name')} />
          </Labeled>
          <Labeled label='Nomor dokumen'>
            <Input {...form.register('documentNumber')} />
          </Labeled>
          <Labeled label='Tanggal terbit'>
            <Input type='date' {...form.register('issuedDate')} />
          </Labeled>
          <Labeled label='Tanggal kedaluwarsa'>
            <Input type='date' {...form.register('expiryDate')} />
          </Labeled>
          <SelectNative
            {...form.register('status')}
            values={['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED']}
          />
          <Labeled label='Catatan'>
            <Textarea {...form.register('notes')} />
          </Labeled>
          <Button disabled={save.isPending}>
            {save.isPending ? 'Menyimpan...' : 'Simpan dokumen'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Labeled({
  label,
  error,
  children,
}: {
  label?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <label className='grid gap-1 text-sm'>
      {label}
      {children}
      {error && <span className='text-destructive'>{error}</span>}
    </label>
  )
}
function SelectNative({
  values,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { values: string[] }) {
  return (
    <select
      className='h-9 rounded-md border bg-background px-3 text-sm'
      {...props}
    >
      {values.map((value) => (
        <option key={value} value={value}>
          {statusLabel(value)}
        </option>
      ))}
    </select>
  )
}
function EmployeeField({
  employees,
  disabled,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { employees: Employee[] }) {
  return (
    <label className='grid gap-1 text-sm'>
      Karyawan
      <select
        className='h-9 rounded-md border bg-background px-3 text-sm'
        disabled={disabled}
        {...props}
      >
        <option value=''>Pilih karyawan</option>
        {employees.map((item) => (
          <option key={item.uid} value={item.uid}>
            {item.fullName} · {item.employeeNumber}
          </option>
        ))}
      </select>
    </label>
  )
}
function expiry(date?: string) {
  if (!date) return undefined
  const days = Math.ceil(
    (new Date(`${date}T00:00:00+07:00`).getTime() - Date.now()) / 86400000
  )
  return days < 0
    ? 'Sudah berakhir'
    : days <= 30
      ? `${days} hari lagi`
      : undefined
}
