import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Download,
  ExternalLink,
  GitBranchPlus,
  Pencil,
  Plus,
  RefreshCcw,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Main } from '@/components/layout/main'
import {
  useContracts,
  useDocuments,
  useEmployee,
  useHistories,
} from '../data/queries'
import { formatDate, maskValue, statusLabel } from '../utils'
import { EmployeeIdCard } from './id-card'
import { MutationDialog } from './mutation-dialog'

export function EmployeeDetail({ employeeUid }: { employeeUid: string }) {
  const employee = useEmployee(employeeUid)
  const histories = useHistories(employeeUid)
  const contracts = useContracts(employeeUid)
  const documents = useDocuments(employeeUid)
  const [mutationOpen, setMutationOpen] = useState(false)
  if (employee.isPending)
    return (
      <Main>
        <RecordSkeleton />
      </Main>
    )
  if (employee.isError)
    return (
      <Main>
        <h1 className='text-2xl font-bold'>Detail gagal dimuat</h1>
        <Retry onClick={() => employee.refetch()} />
      </Main>
    )
  if (!employee.data)
    return (
      <Main>
        <h1 className='text-2xl font-bold'>Karyawan tidak ditemukan</h1>
        <Button className='mt-4' asChild>
          <Link to='/karyawan/data-karyawan'>Kembali</Link>
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
          <div className='flex items-start gap-3'>
            {data.photo?.url || data.photo?.temporaryUrl ? (
              <img
                src={data.photo.url ?? data.photo.temporaryUrl}
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
          <div className='flex flex-wrap gap-2'>
            <Button asChild variant='outline'>
              <Link
                to='/karyawan/ubah-karyawan/$employeeUid'
                params={{ employeeUid: data.uid }}
              >
                <Pencil /> Ubah data
              </Link>
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
              <div className='flex justify-between gap-3'>
                <CardTitle>Histori penempatan</CardTitle>
                <Button size='sm' onClick={() => setMutationOpen(true)}>
                  <Plus /> Catat mutasi
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {histories.isPending ? (
                <RecordSkeleton />
              ) : histories.isError ? (
                <Retry onClick={() => histories.refetch()} />
              ) : !histories.data?.length ? (
                <Empty text='Belum ada histori penempatan.' />
              ) : (
                <div className='space-y-4'>
                  {histories.data.map((item) => (
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value='kontrak'>
          <Records
            title='PKWT & kontrak'
            empty='Belum ada kontrak.'
            pending={contracts.isPending}
            error={contracts.isError}
            retry={() => contracts.refetch()}
            add={{
              to: '/karyawan/pkwt/tambah',
              employeeUid: data.uid,
              label: 'Tambah PKWT',
            }}
            items={contracts.data?.map((item) => ({
              label: `${item.contractNumber} · ${statusLabel(item.status)} · ${formatDate(item.startDate)} — ${formatDate(item.endDate)}`,
              edit: `/karyawan/pkwt/${item.uid}/ubah`,
              file: item.issuedFile?.url,
            }))}
          />
        </TabsContent>
        <TabsContent value='dokumen'>
          <Records
            title='Dokumen karyawan'
            empty='Belum ada dokumen.'
            pending={documents.isPending}
            error={documents.isError}
            retry={() => documents.refetch()}
            add={{
              to: '/karyawan/dokumen/tambah',
              employeeUid: data.uid,
              label: 'Tambah dokumen',
            }}
            items={documents.data?.map((item) => ({
              label: `${item.name} · ${statusLabel(item.status)} · ${item.file.originalName}`,
              edit: `/karyawan/dokumen/${item.uid}/ubah`,
              file: item.file.url,
            }))}
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
  pending,
  error,
  retry,
  add,
}: {
  title: string
  empty: string
  items?: { label: string; edit: string; file?: string }[]
  pending: boolean
  error: boolean
  retry: () => void
  add: {
    to: '/karyawan/pkwt/tambah' | '/karyawan/dokumen/tambah'
    employeeUid: string
    label: string
  }
}) {
  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between gap-3'>
          <CardTitle>{title}</CardTitle>
          <Button size='sm' asChild>
            <Link to={add.to} search={{ employeeUid: add.employeeUid }}>
              <Plus /> {add.label}
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {pending ? (
          <RecordSkeleton />
        ) : error ? (
          <Retry onClick={retry} />
        ) : items?.length ? (
          <ul className='space-y-3'>
            {items.map((item) => (
              <li
                key={item.edit}
                className='flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm'
              >
                <span>{item.label}</span>
                <span className='flex gap-1'>
                  <Button size='sm' variant='ghost' asChild>
                    <a href={item.edit} aria-label={`Ubah ${item.label}`}>
                      <Pencil />
                      <span className='sr-only'>Ubah</span>
                    </a>
                  </Button>
                  {item.file && (
                    <>
                      <Button size='sm' variant='ghost' asChild>
                        <a href={item.file} target='_blank' rel='noreferrer'>
                          <ExternalLink /> Buka file
                        </a>
                      </Button>
                      <Button size='sm' variant='ghost' asChild>
                        <a href={item.file} download>
                          <Download />
                        </a>
                      </Button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty text={empty} />
        )}
      </CardContent>
    </Card>
  )
}
function RecordSkeleton() {
  return (
    <div className='space-y-3'>
      {[1, 2, 3].map((item) => (
        <Skeleton key={item} className='h-14 w-full' />
      ))}
    </div>
  )
}
function Retry({ onClick }: { onClick: () => void }) {
  return (
    <div className='py-6 text-sm'>
      <p>Data gagal dimuat.</p>
      <Button variant='outline' className='mt-3' onClick={onClick}>
        <RefreshCcw /> Coba lagi
      </Button>
    </div>
  )
}
function Empty({ text }: { text: string }) {
  return <p className='py-6 text-sm text-muted-foreground'>{text}</p>
}
