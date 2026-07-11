import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, GitBranchPlus, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Main } from '@/components/layout/main'
import {
  useContracts,
  useDocuments,
  useEmployee,
  useHistories,
  useSaveEmployee,
} from '../data/queries'
import { formatDate, maskValue, statusLabel } from '../utils'
import { EmployeeForm } from './employee-form'
import { EmployeeIdCard } from './id-card'
import { MutationDialog } from './mutation-dialog'

export function EmployeeDetail({ employeeUid }: { employeeUid: string }) {
  const employee = useEmployee(employeeUid)
  const histories = useHistories(employeeUid)
  const contracts = useContracts(employeeUid)
  const documents = useDocuments(employeeUid)
  const [mutationOpen, setMutationOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const save = useSaveEmployee()
  if (employee.isPending)
    return (
      <Main>
        <p>Memuat detail karyawan...</p>
      </Main>
    )
  if (employee.isError)
    return (
      <Main>
        <h1 className='text-2xl font-bold'>Detail gagal dimuat</h1>
        <Button className='mt-4' onClick={() => employee.refetch()}>
          Coba lagi
        </Button>
      </Main>
    )
  if (!employee.data)
    return (
      <Main>
        <h1 className='text-2xl font-bold'>Karyawan tidak ditemukan</h1>
        <Button asChild className='mt-4'>
          <Link to='/karyawan/data-karyawan'>Kembali ke data karyawan</Link>
        </Button>
      </Main>
    )
  const data = employee.data
  return (
    <Main>
      <div className='mb-6'>
        <Button asChild variant='ghost' className='mb-3 -ml-3'>
          <Link to='/karyawan/data-karyawan'>
            <ArrowLeft /> Data Karyawan
          </Link>
        </Button>
        <div className='flex flex-col justify-between gap-4 sm:flex-row sm:items-start'>
          <div>
            <div className='flex items-start gap-3'>
              {data.photo?.temporaryUrl ? (
                <img
                  src={data.photo.temporaryUrl}
                  alt={`Foto ${data.fullName}`}
                  className='size-14 rounded-full border object-cover'
                />
              ) : (
                <div className='flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary'>
                  {data.fullName
                    .split(' ')
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join('')}
                </div>
              )}
              <div>
                <div className='flex flex-wrap items-center gap-2'>
                  <h1 className='text-2xl font-bold'>{data.fullName}</h1>
                  <Badge>{statusLabel(data.employeeStatus)}</Badge>
                </div>
                <p className='text-muted-foreground'>
                  {data.employeeNumber} · {data.barcode} · Site {data.site}
                </p>
              </div>
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' onClick={() => setEditOpen(true)}>
              <Pencil /> Ubah data
            </Button>
            <Button variant='outline' onClick={() => setMutationOpen(true)}>
              <GitBranchPlus /> Catat mutasi
            </Button>
            <Button asChild>
              <Link
                to='/karyawan/cetak-id-card'
                search={{ employeeUid: data.uid }}
              >
                ID Card
              </Link>
            </Button>
          </div>
        </div>
      </div>
      <Tabs defaultValue='ringkasan'>
        <TabsList className='mb-5 w-full justify-start overflow-x-auto'>
          <TabsTrigger value='ringkasan'>Ringkasan</TabsTrigger>
          <TabsTrigger value='pribadi'>Data pribadi</TabsTrigger>
          <TabsTrigger value='mutasi'>Penempatan & Mutasi</TabsTrigger>
          <TabsTrigger value='kontrak'>PKWT</TabsTrigger>
          <TabsTrigger value='dokumen'>Dokumen</TabsTrigger>
          <TabsTrigger value='id-card'>ID Card</TabsTrigger>
        </TabsList>
        <TabsContent value='ringkasan'>
          <div className='grid gap-4 md:grid-cols-2'>
            <InfoCard
              title='Penempatan aktif'
              rows={[
                ['Site', data.site],
                ['Departemen', data.department],
                ['Jabatan', data.position],
                ['Kelompok kerja', data.workGroup],
                ['Jenis', statusLabel(data.employeeType)],
                ['Bergabung', formatDate(data.joinDate)],
              ]}
            />
            <InfoCard
              title='Status kerja'
              rows={[
                ['Status', statusLabel(data.employeeStatus)],
                ['Tanggal tetap', formatDate(data.permanentDate)],
                ['Tanggal resign', formatDate(data.resignDate)],
                ['Alasan resign', data.resignReason],
                ['Catatan', data.notes],
              ]}
            />
          </div>
        </TabsContent>
        <TabsContent value='pribadi'>
          <div className='grid gap-4 md:grid-cols-2'>
            <InfoCard
              title='Identitas & kontak'
              rows={[
                [
                  'Jenis kelamin',
                  data.gender === 'MALE' ? 'Laki-laki' : 'Perempuan',
                ],
                [
                  'Tempat/tanggal lahir',
                  `${data.birthPlace ?? '—'} / ${formatDate(data.birthDate)}`,
                ],
                ['Alamat', data.address],
                ['Kota', data.city],
                ['Telepon', maskValue(data.phone)],
              ]}
            />
            <InfoCard
              title='Data sensitif'
              rows={[
                ['NIK', maskValue(data.nationalIdNumber)],
                ['Kartu keluarga', maskValue(data.familyCardNumber)],
                ['Rekening', maskValue(data.bankAccountNumber)],
                ['BPJS Kesehatan', maskValue(data.bpjsHealthNumber)],
                ['BPJS Ketenagakerjaan', maskValue(data.bpjsEmploymentNumber)],
                ['Kontak darurat', maskValue(data.emergencyContactPhone)],
                ['NPWP', maskValue(data.taxNumber)],
              ]}
            />
          </div>
        </TabsContent>
        <TabsContent value='mutasi'>
          <Card>
            <CardHeader>
              <CardTitle>Histori penempatan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                {histories.data?.map((item) => (
                  <div
                    key={item.uid}
                    className='border-s-2 border-primary ps-4'
                  >
                    <div className='flex flex-wrap items-center gap-2'>
                      <p className='font-semibold'>
                        {item.site} · {item.position ?? 'Tanpa jabatan'}
                      </p>
                      <Badge variant='secondary'>{item.changeType}</Badge>
                    </div>
                    <p className='text-sm text-muted-foreground'>
                      {formatDate(item.effectiveFrom)} —{' '}
                      {formatDate(item.effectiveTo)} ·{' '}
                      {item.reason ?? 'Tidak ada alasan'}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value='kontrak'>
          <Records
            title='PKWT & kontrak'
            empty='Belum ada kontrak.'
            items={contracts.data?.map(
              (item) =>
                `${item.contractNumber} · ${statusLabel(item.status)} · ${formatDate(item.startDate)} — ${formatDate(item.endDate)}`
            )}
          />
        </TabsContent>
        <TabsContent value='dokumen'>
          <Records
            title='Dokumen karyawan'
            empty='Belum ada dokumen.'
            items={documents.data?.map(
              (item) =>
                `${item.name} · ${statusLabel(item.status)} · ${item.file.originalName}`
            )}
          />
        </TabsContent>
        <TabsContent value='id-card'>
          <EmployeeIdCard employee={data} />
        </TabsContent>
      </Tabs>
      <MutationDialog
        employee={data}
        open={mutationOpen}
        onOpenChange={setMutationOpen}
      />
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className='max-h-[90svh] max-w-4xl overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>Ubah data karyawan</DialogTitle>
            <DialogDescription>
              Penempatan dan status kerja hanya dapat diubah lewat Catat Mutasi.
            </DialogDescription>
          </DialogHeader>
          <EmployeeForm
            employee={data}
            isPending={save.isPending}
            onSubmit={(input) =>
              save.mutate(
                { input, uid: data.uid },
                {
                  onSuccess: () => {
                    toast.success('Data karyawan diperbarui.')
                    setEditOpen(false)
                  },
                  onError: (error) => toast.error(error.message),
                }
              )
            }
          />
        </DialogContent>
      </Dialog>
    </Main>
  )
}
function InfoCard({
  title,
  rows,
}: {
  title: string
  rows: [string, string | undefined][]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className='grid gap-3 text-sm'>
          {rows.map(([label, value]) => (
            <div key={label} className='grid grid-cols-[140px_1fr] gap-3'>
              <dt className='text-muted-foreground'>{label}</dt>
              <dd className='font-medium'>{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
function Records({
  title,
  empty,
  items,
}: {
  title: string
  empty: string
  items?: string[]
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {items?.length ? (
          <ul className='space-y-3'>
            {items.map((item) => (
              <li key={item} className='rounded-md border p-3 text-sm'>
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-sm text-muted-foreground'>{empty}</p>
        )}
      </CardContent>
    </Card>
  )
}
