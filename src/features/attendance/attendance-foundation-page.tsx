import {
  CalendarClock,
  CheckCircle2,
  Construction,
  MapPin,
  ShieldCheck,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import { useAttendanceFoundation } from './data/queries'

export type AttendancePageKind =
  | 'monitoring'
  | 'scan'
  | 'recap'
  | 'correction'
  | 'shift'

const pageCopy: Record<
  AttendancePageKind,
  { title: string; description: string }
> = {
  monitoring: {
    title: 'Monitoring Harian',
    description: 'Pantau kehadiran dan anomali attendance per site.',
  },
  scan: {
    title: 'Scan Attendance',
    description: 'Terminal scan masuk dan pulang melalui browser perangkat.',
  },
  recap: {
    title: 'Rekap Attendance',
    description: 'Rekap attendance berdasarkan periode, site, dan karyawan.',
  },
  correction: {
    title: 'Koreksi Attendance',
    description: 'Pengajuan dan persetujuan koreksi attendance yang terlacak.',
  },
  shift: {
    title: 'Master Shift',
    description: 'Pengaturan shift dan toleransi waktu per site.',
  },
}

export function AttendanceFoundationPage({
  kind,
}: {
  kind: AttendancePageKind
}) {
  const session = useAuthStore((state) => state.session)
  const canReadFoundation = hasPermission(session, 'attendance.view')
  const foundation = useAttendanceFoundation(canReadFoundation)
  const page = pageCopy[kind]

  return (
    <Main>
      <div className='mb-6 max-w-3xl space-y-2'>
        <Badge
          variant='outline'
          className='gap-1.5 border-warning/40 bg-warning/10 text-warning-foreground'
        >
          <Construction className='size-3.5' aria-hidden='true' />
          Fondasi siap, proses operasional belum tersedia
        </Badge>
        <p className='text-sm font-medium text-primary'>Attendance</p>
        <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
          {page.title}
        </h1>
        <p className='text-muted-foreground'>{page.description}</p>
      </div>

      <div className='grid max-w-4xl gap-4 md:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <ShieldCheck className='size-4 text-primary' aria-hidden='true' />
              Status implementasi
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <StatusItem>Hak akses halaman sudah diterapkan.</StatusItem>
            <StatusItem>Scope site berasal dari sesi pengguna.</StatusItem>
            <div className='rounded-lg bg-muted p-3 text-muted-foreground'>
              Endpoint transaksi, scan, koreksi, dan master shift belum
              tersedia. Halaman ini belum mengirim atau mengubah data
              attendance.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <MapPin className='size-4 text-primary' aria-hidden='true' />
              Cakupan akses
            </CardTitle>
          </CardHeader>
          <CardContent className='text-sm'>
            {!canReadFoundation ? (
              <p className='text-muted-foreground'>
                Detail capability membutuhkan izin melihat attendance. Akses
                aksi tetap akan divalidasi kembali oleh server.
              </p>
            ) : foundation.isPending ? (
              <p role='status' className='text-muted-foreground'>
                Memuat fondasi attendance...
              </p>
            ) : foundation.isError ? (
              <p role='alert' className='text-destructive'>
                Fondasi attendance gagal dimuat. Silakan coba lagi.
              </p>
            ) : foundation.data.sites.length === 0 ? (
              <p className='text-muted-foreground'>
                Tidak ada site aktif dalam cakupan akun ini.
              </p>
            ) : (
              <ul className='space-y-2'>
                {foundation.data.sites.map((site) => (
                  <li key={site.uid} className='rounded-lg border p-3'>
                    <span className='font-medium'>{site.name}</span>
                    <span className='block text-xs text-muted-foreground'>
                      {site.code} · {site.timezone}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className='mt-4 flex max-w-4xl items-start gap-2 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground'>
        <CalendarClock className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
        Attendance menjadi syarat setoran produksi pada business date yang sama.
        Integrasi tersebut belum diaktifkan pada milestone ini.
      </div>
    </Main>
  )
}

function StatusItem({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex items-start gap-2'>
      <CheckCircle2
        className='mt-0.5 size-4 shrink-0 text-positive'
        aria-hidden='true'
      />
      <span>{children}</span>
    </div>
  )
}
