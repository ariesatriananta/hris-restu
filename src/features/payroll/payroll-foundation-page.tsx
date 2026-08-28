import {
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  FileClock,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'

export type PayrollFoundationSection =
  | 'periods'
  | 'simulation'
  | 'approval'
  | 'history'
  | 'payslips'

const sectionContent: Record<
  PayrollFoundationSection,
  {
    title: string
    description: string
    icon: LucideIcon
    preparations: string[]
  }
> = {
  periods: {
    title: 'Periode Payroll',
    description:
      'Menyiapkan periode payroll borongan per site tanpa periode aktif yang bertumpang-tindih.',
    icon: FileClock,
    preparations: [
      'Periode payroll borongan per site',
      'Pemeriksaan kesiapan Attendance dan Produksi',
      'Pencegahan periode aktif yang bertumpang-tindih',
    ],
  },
  simulation: {
    title: 'Simulasi Payroll',
    description:
      'Menyiapkan perhitungan borongan yang mengambil snapshot transaksi Produksi dan dapat dihitung ulang sebelum diajukan.',
    icon: ClipboardCheck,
    preparations: [
      'Snapshot transaksi Produksi yang memenuhi syarat',
      'Komponen pendapatan dan potongan yang dapat ditelusuri',
      'Preview hasil sebelum pengajuan',
    ],
  },
  approval: {
    title: 'Approval & Closing',
    description:
      'Menyiapkan persetujuan terhadap satu versi perhitungan dan closing yang tidak dapat diubah kembali.',
    icon: LockKeyhole,
    preparations: [
      'Persetujuan terhadap run yang spesifik',
      'Pemisahan kewenangan hitung, setujui, dan closing',
      'Penguncian hasil Payroll yang sudah ditutup',
    ],
  },
  history: {
    title: 'Riwayat Payroll',
    description:
      'Menyiapkan histori run dan keputusan Payroll tanpa menimpa hasil perhitungan sebelumnya.',
    icon: ShieldCheck,
    preparations: [
      'Riwayat perhitungan ulang per periode',
      'Jejak pengajuan, persetujuan, dan penolakan',
      'Detail snapshot karyawan yang dapat diaudit',
    ],
  },
  payslips: {
    title: 'Slip Gaji',
    description:
      'Menyiapkan preview simulasi dan slip resmi yang hanya bersumber dari Payroll yang sudah closing.',
    icon: ReceiptText,
    preparations: [
      'Preview bertanda Simulasi sebelum closing',
      'Slip resmi hanya dari hasil yang sudah ditutup',
      'Rincian pendapatan dan potongan per karyawan',
    ],
  },
}

const milestones = [
  {
    title: 'Payroll 0 — Integrity',
    description: 'Guard sumber data, permission, konkurensi, dan audit trail.',
    active: true,
  },
  {
    title: 'Periode & Kesiapan',
    description: 'Periode per site dan pemeriksaan data sebelum perhitungan.',
  },
  {
    title: 'Simulasi Borongan',
    description: 'Snapshot Produksi, komponen, dan preview hasil.',
  },
  {
    title: 'Approval & Closing',
    description: 'Persetujuan run spesifik dan penguncian hasil akhir.',
  },
  {
    title: 'Riwayat, Ekspor & Slip',
    description: 'Dokumen final dan histori yang dapat ditelusuri.',
  },
]

export function PayrollFoundationPage({
  section,
}: {
  section: PayrollFoundationSection
}) {
  const content = sectionContent[section]
  const SectionIcon = content.icon

  return (
    <Main>
      <div className='mx-auto w-full max-w-5xl space-y-5'>
        <div className='space-y-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <p className='text-sm font-medium text-primary'>Payroll</p>
            <Badge
              variant='outline'
              className='gap-1.5 border-warning/40 bg-warning/10 text-warning-foreground'
            >
              <CircleDashed className='size-3.5' aria-hidden='true' />
              Fondasi sedang disiapkan
            </Badge>
          </div>
          <div className='flex items-start gap-3'>
            <div className='mt-0.5 rounded-lg bg-primary/10 p-2 text-primary'>
              <SectionIcon className='size-5' aria-hidden='true' />
            </div>
            <div>
              <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
                {content.title}
              </h1>
              <p className='mt-1 max-w-3xl text-muted-foreground'>
                {content.description}
              </p>
            </div>
          </div>
        </div>

        <div className='rounded-lg border border-primary/25 bg-primary/5 px-4 py-3 text-sm'>
          Menu ini belum menjalankan perhitungan atau mengubah data Payroll.
          Implementasi dibuka setelah aturan integritas sumber data selesai
          diverifikasi.
        </div>

        <div className='grid gap-4 lg:grid-cols-[1fr_1.2fr]'>
          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base'>Cakupan menu ini</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className='space-y-2.5'>
                {content.preparations.map((item) => (
                  <li
                    key={item}
                    className='flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm'
                  >
                    <CheckCircle2
                      className='mt-0.5 size-4 shrink-0 text-positive'
                      aria-hidden='true'
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='pb-3'>
              <CardTitle className='text-base'>
                Milestone implementasi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className='space-y-1'>
                {milestones.map((milestone, index) => (
                  <li
                    key={milestone.title}
                    className='flex gap-3 rounded-lg px-2 py-2.5'
                  >
                    <div
                      className={
                        milestone.active
                          ? 'flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground'
                          : 'flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold text-muted-foreground'
                      }
                      aria-hidden='true'
                    >
                      {index + 1}
                    </div>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <p className='text-sm font-semibold'>
                          {milestone.title}
                        </p>
                        {milestone.active && (
                          <Badge
                            variant='secondary'
                            className='h-5 text-[11px]'
                          >
                            Sedang dikerjakan
                          </Badge>
                        )}
                      </div>
                      <p className='mt-0.5 text-xs leading-relaxed text-muted-foreground'>
                        {milestone.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </Main>
  )
}
