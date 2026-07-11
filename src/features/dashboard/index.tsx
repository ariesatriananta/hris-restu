import { useNavigate, useSearch } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ScanLine,
  Users,
  UserX,
  WalletCards,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Main } from '@/components/layout/main'
import { useDashboardOverview } from './data/dashboard-query'
import type { SiteCode } from './data/types'

const number = new Intl.NumberFormat('id-ID')
const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
})
const shortRupiah = new Intl.NumberFormat('id-ID', {
  notation: 'compact',
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 1,
})
const shortDate = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
})

export function Dashboard() {
  const search = useSearch({ from: '/_authenticated/' })
  const navigate = useNavigate({ from: '/' })
  const site = search.site ?? 'ALL'
  const mockState =
    (import.meta.env.DEV ? search.mockState : undefined) ?? 'normal'
  const query = useDashboardOverview(site, mockState)

  function setSite(value: string) {
    void navigate({
      search: (previous) => ({ ...previous, site: value as SiteCode }),
    })
  }

  return (
    <Main>
      <div className='mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Dashboard Operasional
          </h1>
          <p className='mt-1 text-muted-foreground'>
            Ringkasan attendance, produksi borongan, dan payroll hari ini.
          </p>
        </div>
        <div className='w-full sm:w-56'>
          <label
            htmlFor='site-filter'
            className='mb-1.5 block text-xs font-medium text-muted-foreground'
          >
            Filter data site
          </label>
          <Select value={site} onValueChange={setSite}>
            <SelectTrigger id='site-filter' className='w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='ALL'>Semua Site</SelectItem>
              <SelectItem value='JEPARA'>Jepara</SelectItem>
              <SelectItem value='SEMARANG'>Semarang</SelectItem>
              <SelectItem value='KLATEN'>Klaten</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {query.isPending ? (
        <DashboardSkeleton />
      ) : query.isError ? (
        <DashboardError
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : !query.data ? (
        <DashboardEmpty />
      ) : (
        <DashboardContent data={query.data} />
      )}
    </Main>
  )
}

function DashboardContent({
  data,
}: {
  data: NonNullable<ReturnType<typeof useDashboardOverview>['data']>
}) {
  const kpis = [
    {
      label: 'Karyawan aktif',
      value: number.format(data.kpis.activeEmployees),
      detail: 'Dalam scope site',
      icon: Users,
    },
    {
      label: 'Kehadiran hari ini',
      value: number.format(data.kpis.presentToday),
      detail: `${Math.round((data.kpis.presentToday / data.kpis.activeEmployees) * 100)}% dari karyawan aktif`,
      icon: CheckCircle2,
    },
    {
      label: 'Belum absen masuk',
      value: number.format(data.kpis.missingClockIn),
      detail: 'Perlu ditindaklanjuti',
      icon: UserX,
      warning: true,
    },
    {
      label: 'Belum absen pulang',
      value: number.format(data.kpis.missingClockOut),
      detail: 'Attendance belum lengkap',
      icon: Clock3,
      warning: true,
    },
    {
      label: 'Setoran hari ini',
      value: number.format(data.kpis.productionTransactions),
      detail: 'Transaksi produksi',
      icon: ScanLine,
    },
    {
      label: 'Nilai produksi',
      value: rupiah.format(data.kpis.productionValue),
      detail: 'Nilai bruto hari ini',
      icon: Banknote,
    },
  ]

  return (
    <div className='space-y-5'>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
        {kpis.map((item) => (
          <Card key={item.label} className='gap-3 py-4'>
            <CardHeader className='flex flex-row items-center justify-between px-4 pb-0'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                {item.label}
              </CardTitle>
              <div
                className={`rounded-md p-2 ${item.warning ? 'bg-warning/15 text-warning-foreground' : 'bg-primary/10 text-primary'}`}
              >
                <item.icon className='size-4' />
              </div>
            </CardHeader>
            <CardContent className='px-4'>
              <p className='text-2xl font-bold tabular-nums'>{item.value}</p>
              <p className='text-xs text-muted-foreground'>{item.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className='grid gap-5 xl:grid-cols-[1.45fr_0.8fr]'>
        <Card>
          <CardHeader>
            <CardTitle>Tren attendance 7 hari</CardTitle>
            <CardDescription>
              Jumlah hadir dibandingkan karyawan aktif.
            </CardDescription>
          </CardHeader>
          <CardContent className='h-72 px-2 sm:px-6'>
            <ResponsiveContainer width='100%' height='100%'>
              <LineChart
                data={data.attendanceTrend}
                margin={{ left: -16, right: 12 }}
              >
                <CartesianGrid
                  strokeDasharray='3 3'
                  vertical={false}
                  stroke='var(--border)'
                />
                <XAxis
                  dataKey='date'
                  tickFormatter={(value) =>
                    shortDate.format(new Date(`${value}T00:00:00+07:00`))
                  }
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(value) => number.format(Number(value))}
                  labelFormatter={(value) =>
                    shortDate.format(new Date(`${value}T00:00:00+07:00`))
                  }
                />
                <Line
                  type='monotone'
                  dataKey='expected'
                  name='Karyawan aktif'
                  stroke='var(--muted-foreground)'
                  strokeDasharray='4 4'
                  dot={false}
                />
                <Line
                  type='monotone'
                  dataKey='present'
                  name='Hadir'
                  stroke='var(--primary)'
                  strokeWidth={2.5}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className='border-primary/20 bg-primary/[0.03]'>
          <CardHeader className='flex-row items-start justify-between'>
            <div>
              <CardTitle>Payroll aktif</CardTitle>
              <CardDescription>{data.payroll.periodLabel}</CardDescription>
            </div>
            <WalletCards className='size-5 text-primary' />
          </CardHeader>
          <CardContent className='space-y-4'>
            <div>
              <p className='text-3xl font-bold'>{data.payroll.activePeriods}</p>
              <p className='text-sm text-muted-foreground'>
                periode site aktif
              </p>
            </div>
            <Badge className='bg-primary/10 text-primary hover:bg-primary/10'>
              {data.payroll.statusLabel}
            </Badge>
            <div className='space-y-2 border-t pt-4'>
              {data.sites.map((site) => (
                <div
                  key={site.uid}
                  className='flex items-center justify-between text-sm'
                >
                  <span>{site.name}</span>
                  <span className='font-medium'>
                    {site.payrollStatus === 'DRAFT' ? 'Draft' : 'Dihitung'}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-5 xl:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Produksi per pekerjaan</CardTitle>
            <CardDescription>
              Jumlah transaksi pada hari berjalan.
            </CardDescription>
          </CardHeader>
          <CardContent className='h-72 px-2 sm:px-6'>
            <ResponsiveContainer width='100%' height='100%'>
              <BarChart
                data={data.productionByJob}
                layout='vertical'
                margin={{ left: 14, right: 16 }}
              >
                <CartesianGrid
                  strokeDasharray='3 3'
                  horizontal={false}
                  stroke='var(--border)'
                />
                <XAxis
                  type='number'
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type='category'
                  dataKey='name'
                  width={112}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value) =>
                    `${number.format(Number(value))} transaksi`
                  }
                />
                <Bar
                  dataKey='transactions'
                  name='Transaksi'
                  fill='var(--chart-2)'
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Perbandingan antar-site</CardTitle>
            <CardDescription>Kinerja operasional hari ini.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='space-y-3 sm:hidden'>
              {data.sites.map((site) => (
                <div key={site.uid} className='rounded-lg border p-3'>
                  <p className='font-semibold'>{site.name}</p>
                  <dl className='mt-3 grid grid-cols-3 gap-2 text-xs'>
                    <div>
                      <dt className='text-muted-foreground'>Hadir</dt>
                      <dd className='mt-1 font-medium tabular-nums'>
                        {number.format(site.presentToday)} /{' '}
                        {number.format(site.activeEmployees)}
                      </dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground'>Setoran</dt>
                      <dd className='mt-1 font-medium tabular-nums'>
                        {number.format(site.productionTransactions)}
                      </dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground'>Nilai</dt>
                      <dd className='mt-1 font-medium tabular-nums'>
                        {shortRupiah.format(site.productionValue)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
            <div className='hidden overflow-x-auto sm:block'>
              <table className='w-full min-w-[540px] text-sm'>
                <thead>
                  <tr className='border-b text-left text-xs text-muted-foreground'>
                    <th className='pb-3 font-medium'>Site</th>
                    <th className='pb-3 text-right font-medium'>Hadir</th>
                    <th className='pb-3 text-right font-medium'>Setoran</th>
                    <th className='pb-3 text-right font-medium'>Nilai</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sites.map((site) => (
                    <tr key={site.uid} className='border-b last:border-0'>
                      <td className='py-3 font-medium'>{site.name}</td>
                      <td className='py-3 text-right tabular-nums'>
                        {number.format(site.presentToday)} /{' '}
                        {number.format(site.activeEmployees)}
                      </td>
                      <td className='py-3 text-right tabular-nums'>
                        {number.format(site.productionTransactions)}
                      </td>
                      <td className='py-3 text-right font-medium tabular-nums'>
                        {shortRupiah.format(site.productionValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className='grid gap-5 xl:grid-cols-[0.9fr_1.1fr]'>
        <Card>
          <CardHeader>
            <CardTitle>Perlu ditindaklanjuti</CardTitle>
            <CardDescription>
              Alert operasional yang membutuhkan pemeriksaan.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {data.alerts.map((alert) => (
              <Alert
                key={alert.uid}
                variant={
                  alert.severity === 'danger' ? 'destructive' : 'default'
                }
                className={
                  alert.severity === 'warning'
                    ? 'border-warning/40 bg-warning/10'
                    : ''
                }
              >
                <AlertTriangle />
                <AlertTitle>{alert.title}</AlertTitle>
                <AlertDescription>
                  {alert.detail}
                  <Button
                    variant='link'
                    className='mt-1 h-auto p-0 text-current'
                  >
                    {alert.actionLabel}
                    <ArrowRight />
                  </Button>
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Aktivitas terbaru</CardTitle>
            <CardDescription>
              Pembaruan operasional lintas modul.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className='space-y-4'>
              {data.activities.map((activity) => (
                <li
                  key={activity.uid}
                  className='grid grid-cols-[3rem_1fr] gap-3'
                >
                  <span className='text-xs font-medium text-muted-foreground tabular-nums'>
                    {activity.time}
                  </span>
                  <div className='border-b pb-4 last:border-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <p className='text-sm font-semibold'>{activity.title}</p>
                      <Badge variant='secondary'>{activity.site}</Badge>
                    </div>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      {activity.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
      <p className='text-right text-xs text-muted-foreground'>
        Data mock diperbarui 11 Juli 2026, 15.30 WIB
      </p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div aria-label='Memuat dashboard' className='space-y-5'>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className='h-32 rounded-xl' />
        ))}
      </div>
      <div className='grid gap-5 xl:grid-cols-[1.45fr_0.8fr]'>
        <Skeleton className='h-96 rounded-xl' />
        <Skeleton className='h-96 rounded-xl' />
      </div>
      <div className='grid gap-5 xl:grid-cols-2'>
        <Skeleton className='h-80 rounded-xl' />
        <Skeleton className='h-80 rounded-xl' />
      </div>
    </div>
  )
}

function DashboardError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <Card className='mx-auto max-w-xl'>
      <CardContent className='flex flex-col items-center py-12 text-center'>
        <AlertTriangle className='mb-4 size-10 text-destructive' />
        <h2 className='text-lg font-semibold'>Dashboard gagal dimuat</h2>
        <p className='mt-1 text-sm text-muted-foreground'>{message}</p>
        <Button className='mt-5' onClick={onRetry}>
          <RefreshCw /> Coba lagi
        </Button>
      </CardContent>
    </Card>
  )
}

function DashboardEmpty() {
  return (
    <Card className='mx-auto max-w-xl'>
      <CardContent className='flex flex-col items-center py-12 text-center'>
        <Banknote className='mb-4 size-10 text-muted-foreground' />
        <h2 className='text-lg font-semibold'>Belum ada data operasional</h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          Tidak ada data dashboard untuk filter site yang dipilih.
        </p>
      </CardContent>
    </Card>
  )
}
