import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiClient } from '@/lib/api-client'

export type ContractPrintSnapshot = {
  contract: {
    uid: string
    number: string
    type: string
    startDate: string
    endDate?: string | null
  }
  company: {
    name: string
    site: string
    address: string
    signerTitle: string
  }
  employee: {
    name: string
    employeeNumber: string
    nationalIdNumber: string
    address: string
    position: string
  }
  payment: {
    schedule: string
  }
  jobs: {
    uid: string
    code: string
    name: string
    unit: string
    rateAmount: number
    currency: string
  }[]
}

const dateFormatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' })
const moneyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})

function date(value?: string | null) {
  if (!value) return '-'
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed)
}

function money(value: number) {
  return moneyFormatter.format(value)
}

function useAutoPrint(isReady: boolean) {
  useEffect(() => {
    if (!isReady) return
    let cancelled = false

    void (async () => {
      await document.fonts?.ready
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
      if (!cancelled) window.print()
    })()

    return () => {
      cancelled = true
    }
  }, [isReady])
}

export function ContractPrintPage({ contractUid }: { contractUid: string }) {
  const preview = useQuery({
    queryKey: ['contract-print', contractUid],
    queryFn: async () =>
      (
        await apiClient.get<ContractPrintSnapshot>(
          `/employees/contracts/${contractUid}/print-preview`
        )
      ).data,
  })

  useAutoPrint(Boolean(preview.data))

  if (preview.isPending) {
    return (
      <p className='p-8 text-center text-muted-foreground'>
        Menyiapkan dokumen kontrak...
      </p>
    )
  }

  if (preview.isError || !preview.data) {
    return (
      <p className='p-8 text-center'>
        Preview kontrak belum tersedia atau tidak dapat dibuka.
      </p>
    )
  }

  return (
    <main className='contract-print-root min-h-screen bg-muted p-4 print:bg-white print:p-0'>
      <div className='mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 print:hidden'>
        <Button variant='outline' onClick={() => window.close()}>
          <X /> Tutup
        </Button>
        <Button onClick={() => window.print()}>
          <Printer /> Cetak
        </Button>
      </div>

      <ContractPrintDocument data={preview.data} />
    </main>
  )
}

export function ContractBulkPrintPage({
  contractUids,
}: {
  contractUids: string[]
}) {
  const previews = useQuery({
    queryKey: ['contract-print-bulk', contractUids],
    queryFn: async () =>
      (
        await apiClient.get<{ items: ContractPrintSnapshot[] }>(
          '/employees/contracts/print-previews',
          { params: { contractUids: contractUids.join(',') } }
        )
      ).data.items,
    enabled: contractUids.length > 0,
  })

  useAutoPrint(Boolean(previews.data?.length))

  if (!contractUids.length) {
    return <p className='p-8 text-center'>Tidak ada kontrak yang dipilih.</p>
  }

  if (previews.isPending) {
    return (
      <p className='p-8 text-center text-muted-foreground'>
        Menyiapkan dokumen kontrak...
      </p>
    )
  }

  if (previews.isError || !previews.data?.length) {
    return (
      <p className='p-8 text-center'>
        Preview kontrak belum tersedia atau tidak dapat dibuka.
      </p>
    )
  }

  return (
    <main className='contract-print-root min-h-screen bg-muted p-4 print:bg-white print:p-0'>
      <div className='mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 print:hidden'>
        <Button variant='outline' onClick={() => window.close()}>
          <X /> Tutup
        </Button>
        <Button onClick={() => window.print()}>
          <Printer /> Cetak {previews.data.length} Kontrak
        </Button>
      </div>

      <div className='space-y-4 print:space-y-0'>
        {previews.data.map((item) => (
          <ContractPrintDocument key={item.contract.uid} data={item} />
        ))}
      </div>
    </main>
  )
}

export function ContractPrintDocument({
  data,
}: {
  data: ContractPrintSnapshot
}) {
  const title =
    data.contract.type === 'TRAINING'
      ? 'Perjanjian Masa Training'
      : 'Perjanjian Kerja Waktu Tertentu'

  return (
    <article className='contract-print-document mx-auto min-h-[297mm] max-w-[210mm] bg-white p-[18mm] text-[10.5pt] leading-[1.55] text-black shadow print:shadow-none'>
      <header className='mb-6 text-center'>
        <h1 className='text-[14pt] font-bold uppercase'>{title}</h1>
        <p className='mt-1 font-semibold'>Nomor: {data.contract.number}</p>
      </header>

      <p>Pada hari ini, para pihak sepakat membuat perjanjian kerja sebagai berikut:</p>

      <ol className='mt-3 list-decimal space-y-2 pl-5'>
        <li>
          <b>{data.company.name}</b>, berkedudukan di {data.company.address},{' '}
          {data.company.site}, selanjutnya disebut <b>PIHAK PERTAMA</b>.
        </li>
        <li>
          <b>{data.employee.name}</b>, NIK {data.employee.nationalIdNumber},
          beralamat di {data.employee.address}, selanjutnya disebut{' '}
          <b>PIHAK KEDUA</b>.
        </li>
      </ol>

      <section className='mt-5 space-y-2.5'>
        <h2 className='mt-4 font-bold uppercase'>
          Pasal 1 - Masa Kerja dan Penempatan
        </h2>
        <p>
          PIHAK KEDUA bekerja sebagai <b>{data.employee.position}</b> di{' '}
          {data.company.site}, terhitung sejak {date(data.contract.startDate)}{' '}
          sampai dengan {date(data.contract.endDate)}.
        </p>

        <h2 className='mt-4 font-bold uppercase'>
          Pasal 2 - Pekerjaan dan Tarif Produksi
        </h2>
        <p>
          Imbalan PIHAK KEDUA dihitung berdasarkan hasil pekerjaan yang diterima
          perusahaan. Tarif yang disepakati adalah:
        </p>

        <table className='my-2 w-full table-fixed border-collapse text-[9.5pt]'>
          <thead>
            <tr className='bg-slate-100'>
              <th className='w-10 border border-black/60 px-2 py-1 text-center'>
                No
              </th>
              <th className='border border-black/60 px-2 py-1 text-left'>
                Pekerjaan
              </th>
              <th className='w-32 border border-black/60 px-2 py-1 text-left'>
                Satuan
              </th>
              <th className='w-32 border border-black/60 px-2 py-1 text-right'>
                Tarif
              </th>
            </tr>
          </thead>
          <tbody>
            {data.jobs.map((job, index) => (
              <tr key={job.uid}>
                <td className='border border-black/60 px-2 py-1 text-center'>
                  {index + 1}
                </td>
                <td className='border border-black/60 px-2 py-1'>{job.name}</td>
                <td className='border border-black/60 px-2 py-1'>{job.unit}</td>
                <td className='border border-black/60 px-2 py-1 text-right'>
                  {money(job.rateAmount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p>
          Pembayaran hasil produksi dilakukan {data.payment.schedule.toLowerCase()}{' '}
          berdasarkan hasil yang telah diverifikasi perusahaan.
        </p>

        <h2 className='mt-4 font-bold uppercase'>Pasal 3 - Kewajiban Kerja</h2>
        <p>
          PIHAK KEDUA wajib menjalankan pekerjaan sesuai arahan, standar mutu,
          keselamatan kerja, tata tertib, dan ketentuan operasional perusahaan.
          PIHAK PERTAMA berhak melakukan evaluasi atas hasil pekerjaan.
        </p>

        <h2 className='mt-4 font-bold uppercase'>Pasal 4 - Penutup</h2>
        <p>
          Perjanjian ini dibuat dengan itikad baik dalam dua rangkap yang
          mempunyai kekuatan hukum yang sama setelah ditandatangani para pihak.
        </p>
      </section>

      <section className='mt-12 grid grid-cols-2 gap-12 text-center'>
        <div>
          <p>PIHAK PERTAMA</p>
          <div className='h-20' />
          <p className='font-semibold'>{data.company.signerTitle}</p>
          <p>{data.company.name}</p>
        </div>
        <div>
          <p>PIHAK KEDUA</p>
          <div className='h-20' />
          <p className='font-semibold'>{data.employee.name}</p>
          <p>Karyawan</p>
        </div>
      </section>
    </article>
  )
}
