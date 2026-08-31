import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  CalendarCheck2,
  FileClock,
  FileBarChart,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'

const reports = [
  {
    title: 'Laporan Kontrak',
    description:
      'Pantau kontrak yang akan berakhir atau sudah berakhir berdasarkan periode dan site.',
    icon: FileClock,
    permission: 'employees.view',
    to: '/laporan/kontrak' as const,
    status: 'Tersedia',
  },
  {
    title: 'Laporan Karyawan',
    description:
      'Lihat posisi karyawan berdasarkan tanggal, site, jenis, status, dan bagian produksi.',
    icon: UsersRound,
    permission: 'employees.view',
    to: '/laporan/karyawan' as const,
    status: 'Tersedia',
  },
  {
    title: 'Laporan Attendance',
    description:
      'Ringkas kehadiran, ketidakhadiran, keterlambatan, dan status finalisasi periode.',
    icon: CalendarCheck2,
    permission: 'attendance.view',
    to: '/laporan/attendance' as const,
    status: 'Tersedia',
  },
]

export function ReportsCatalogPage() {
  const session = useAuthStore((state) => state.session)
  return (
    <Main>
      <div className='mb-6'>
        <p className='text-sm font-medium text-primary'>Kontrol</p>
        <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
          Pusat Laporan
        </h1>
        <p className='text-muted-foreground'>
          Pilih laporan operasional sesuai kebutuhan dan hak akses Anda.
        </p>
      </div>

      <div className='mb-5 flex items-start gap-3 rounded-lg border bg-muted/30 p-4'>
        <ShieldCheck className='mt-0.5 size-5 shrink-0 text-primary' />
        <div>
          <p className='font-medium'>Data tetap mengikuti akses site</p>
          <p className='text-sm text-muted-foreground'>
            Laporan hanya menampilkan data site dan modul yang boleh Anda lihat.
          </p>
        </div>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
        {reports.map((report) => {
          const allowed = hasPermission(session, report.permission)
          const Icon = report.icon
          return (
            <Card key={report.title} className='flex min-h-52 flex-col'>
              <CardHeader className='pb-3'>
                <div className='flex items-start justify-between gap-3'>
                  <span className='rounded-lg bg-primary/10 p-2 text-primary'>
                    <Icon className='size-5' />
                  </span>
                  <Badge variant={allowed ? 'default' : 'secondary'}>
                    {allowed ? report.status : 'Tidak ada akses'}
                  </Badge>
                </div>
                <CardTitle className='mt-3 text-lg'>{report.title}</CardTitle>
              </CardHeader>
              <CardContent className='flex flex-1 flex-col justify-between gap-4'>
                <p className='text-sm text-muted-foreground'>
                  {report.description}
                </p>
                {allowed ? (
                  <Button asChild className='w-full sm:w-fit'>
                    <Link to={report.to} search={{}}>
                      Buka laporan <ArrowRight />
                    </Link>
                  </Button>
                ) : (
                  <p className='text-xs text-muted-foreground'>
                    Hubungi Administrator bila laporan ini diperlukan.
                  </p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className='mt-6 flex items-center gap-2 text-xs text-muted-foreground'>
        <FileBarChart className='size-4' /> Laporan Produksi dan Payroll akan
        ditambahkan pada tahap berikutnya.
      </div>
    </Main>
  )
}
