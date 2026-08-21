import { Link, useNavigate } from '@tanstack/react-router'
import {
  CalendarClock,
  CalendarDays,
  Clock3,
  Info,
  MonitorSmartphone,
  RefreshCcw,
  ShieldCheck,
  UsersRound,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AttendanceReadinessPanel } from '@/features/attendance/attendance-readiness-panel'
import { useAttendanceSystemSettings } from './data/queries'
import type { AttendanceSystemSettings } from './domain'

export function AttendanceSettingsContent() {
  const settings = useAttendanceSystemSettings()
  const navigate = useNavigate()

  return (
    <div className='space-y-6'>
      <div>
        <div className='flex flex-wrap items-center gap-2'>
          <h2 className='text-xl font-semibold'>Attendance</h2>
          <Badge variant='outline'>Control center</Badge>
        </div>
        <p className='text-sm text-muted-foreground'>
          Tinjau kebijakan efektif dan kesiapan operasional Attendance per site.
        </p>
      </div>

      <Alert className='border-sky-500/40 bg-sky-500/5'>
        <Info className='text-sky-700' />
        <AlertTitle>Kebijakan dikelola dari sumber resminya</AlertTitle>
        <AlertDescription>
          Halaman ini menampilkan konfigurasi efektif tanpa tombol simpan.
          Perubahan kebijakan teknis dilakukan melalui konfigurasi aplikasi agar
          tidak berbeda antarserver.
        </AlertDescription>
      </Alert>

      {settings.isPending ? (
        <AttendanceSettingsSkeleton />
      ) : settings.isError || !settings.data ? (
        <Alert variant='destructive'>
          <Info />
          <AlertTitle>Konfigurasi Attendance gagal dimuat</AlertTitle>
          <AlertDescription>
            <p>Periksa koneksi layanan lalu coba kembali.</p>
            <Button
              size='sm'
              variant='outline'
              onClick={() => void settings.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <EffectiveAttendanceSettings settings={settings.data} />
      )}

      <AttendanceNavigation />

      <div>
        <h3 className='mb-1 font-semibold'>Kesiapan Operasional</h3>
        <p className='mb-3 text-sm text-muted-foreground'>
          Pemeriksaan shift, perangkat, kalender, tindak lanjut, dan finalisasi
          menggunakan kondisi data terkini.
        </p>
        <AttendanceReadinessPanel
          onOpenFinalization={(site, businessDate) =>
            void navigate({
              to: '/attendance/monitoring-harian',
              search: { site: [site], businessDate },
            })
          }
        />
      </div>
    </div>
  )
}

function EffectiveAttendanceSettings({
  settings,
}: {
  settings: AttendanceSystemSettings
}) {
  const items = [
    {
      label: 'Mulai berlaku',
      value: dateLabel(settings.effective.goLiveDate),
      detail: 'Batas awal data Attendance yang diproses aplikasi.',
      source: sourceLabel(settings.sources.goLiveDate),
      icon: CalendarClock,
    },
    {
      label: 'Zona waktu',
      value: settings.effective.timezone,
      detail: 'Acuan tanggal bisnis dan waktu scan.',
      source: sourceLabel(settings.sources.timezone),
      icon: Clock3,
    },
    {
      label: 'Tenggang finalisasi',
      value: `${settings.effective.finalizationGraceMinutes} menit`,
      detail: 'Jeda setelah akhir shift sebelum Alpha dapat dibentuk.',
      source: sourceLabel(settings.sources.finalizationGraceMinutes),
      icon: ShieldCheck,
    },
    {
      label: 'Kehadiran Produksi',
      value: productionPresenceLabel(settings),
      detail:
        settings.effective.productionIntegrationStatus === 'PLANNED'
          ? 'Kebijakan tersimpan; integrasi ke engine Produksi masih direncanakan.'
          : 'Kebijakan kehadiran untuk transaksi Produksi.',
      source: sourceLabel(settings.sources.productionRequiresPresence),
      icon: UsersRound,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-start justify-between gap-2'>
          <div>
            <CardTitle>Konfigurasi Efektif</CardTitle>
            <CardDescription>
              Nilai yang sedang digunakan oleh aplikasi saat ini.
            </CardDescription>
          </div>
          {settings.updatedAt && (
            <Badge variant='secondary'>
              Diperbarui {dateTimeLabel(settings.updatedAt)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className='grid gap-2 sm:grid-cols-2'>
        {items.map(({ label, value, detail, source, icon: Icon }) => (
          <section key={label} className='rounded-lg border px-3 py-2.5'>
            <div className='flex items-start gap-2.5'>
              <Icon
                className='mt-0.5 size-4 shrink-0 text-primary'
                aria-hidden='true'
              />
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center justify-between gap-1'>
                  <p className='text-xs font-medium text-muted-foreground'>
                    {label}
                  </p>
                  <Badge variant='outline' className='text-[10px]'>
                    {source}
                  </Badge>
                </div>
                <p className='mt-0.5 font-semibold'>{value}</p>
                <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
              </div>
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  )
}

function AttendanceNavigation() {
  const items = [
    {
      title: 'Master Shift',
      description: 'Kelola jam kerja dan penugasan shift karyawan.',
      icon: Clock3,
      action: (
        <Button size='sm' variant='outline' asChild>
          <Link to='/attendance/master-shift' search={{}}>
            Buka Master Shift
          </Link>
        </Button>
      ),
    },
    {
      title: 'Master Perangkat',
      description: 'Periksa terminal dan perangkat scan di setiap site.',
      icon: MonitorSmartphone,
      action: (
        <Button size='sm' variant='outline' asChild>
          <Link to='/attendance/master-perangkat' search={{}}>
            Buka Perangkat
          </Link>
        </Button>
      ),
    },
    {
      title: 'Kalender Kerja',
      description: 'Tinjau hari libur dan pengecualian hari kerja.',
      icon: CalendarDays,
      action: (
        <Button size='sm' variant='outline' asChild>
          <Link to='/attendance/kalender-kerja' search={{}}>
            Buka Kalender
          </Link>
        </Button>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pengaturan Operasional</CardTitle>
        <CardDescription>
          Konfigurasi operasional tetap dikelola pada master masing-masing.
        </CardDescription>
      </CardHeader>
      <CardContent className='grid gap-3 lg:grid-cols-3'>
        {items.map(({ title, description, icon: Icon, action }) => (
          <section
            key={title}
            className='flex min-w-0 flex-col items-start rounded-lg border p-3'
          >
            <div className='mb-2 flex items-center gap-2'>
              <Icon className='size-4 text-primary' aria-hidden='true' />
              <h3 className='font-semibold'>{title}</h3>
            </div>
            <p className='mb-3 flex-1 text-xs text-muted-foreground'>
              {description}
            </p>
            {action}
          </section>
        ))}
      </CardContent>
    </Card>
  )
}

function AttendanceSettingsSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-12 w-72 max-w-full' />
      <Skeleton className='h-48 w-full' />
    </div>
  )
}

function sourceLabel(source: string) {
  return (
    {
      ENVIRONMENT: 'Environment',
      APPLICATION_POLICY: 'Kebijakan aplikasi',
      FIXED_POLICY: 'Kebijakan tetap',
      SYSTEM_SETTING: 'Pengaturan sistem',
    }[source] ?? source
  )
}

function productionPresenceLabel(settings: AttendanceSystemSettings) {
  const value = settings.effective.productionRequiresPresence
    ? 'Wajib hadir'
    : 'Tidak diwajibkan'
  return settings.effective.productionIntegrationStatus === 'PLANNED'
    ? `${value} (direncanakan)`
    : value
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(
    new Date(`${value}T00:00:00`)
  )
}

function dateTimeLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
