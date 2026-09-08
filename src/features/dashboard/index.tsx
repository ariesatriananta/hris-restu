import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  LayoutDashboard,
  RefreshCw,
  ScanLine,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { cn } from '@/lib/utils'
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
import type { DashboardCapabilities, DashboardOverview } from './data/types'

const number = new Intl.NumberFormat('id-ID')
const percentage = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
const shortDate = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
})
const longDate = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const time = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit',
  minute: '2-digit',
})

const chartTooltipStyle = {
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  background: 'var(--popover)',
  color: 'var(--popover-foreground)',
  boxShadow: 'var(--shadow-md)',
}

function localDate(value: string) {
  return new Date(`${value}T00:00:00+07:00`)
}

function formattedGeneratedAt(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '-'
    : `${longDate.format(date)}, ${time.format(date)} WIB`
}

function formattedActivityTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '-' : time.format(date)
}

function attendanceRate(present: number | null, eligible: number | null) {
  if (present === null || eligible === null || eligible <= 0) return null
  return Math.min(100, Math.max(0, (present / eligible) * 100))
}

export function Dashboard() {
  const search = useSearch({ from: '/_authenticated/' })
  const navigate = useNavigate({ from: '/' })
  const site = search.site ?? 'ALL'
  const query = useDashboardOverview(site)

  function setSite(value: string) {
    void navigate({
      search: {
        site:
          value === 'ALL'
            ? undefined
            : (value as 'JEPARA' | 'SEMARANG' | 'KLATEN'),
      },
    })
  }

  return (
    <Main>
      <header className='relative mb-5 overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/[0.12] via-background to-positive/[0.08] p-4 shadow-sm sm:p-6'>
        <div
          className='pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-primary/10 blur-3xl'
          aria-hidden='true'
        />
        <div className='relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between'>
          <div className='min-w-0'>
            <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
              Dashboard
            </h1>
            <p className='mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base'>
              Pantau kesiapan SDM, attendance, produksi, dan rekrutmen dalam
              satu pandangan ringkas.
            </p>
            {query.data && (
              <p className='mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground'>
                <span className='size-1.5 rounded-full bg-positive' />
                Data operasional{' '}
                {longDate.format(localDate(query.data.businessDate))}
              </p>
            )}
          </div>
          <div className='flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:items-end'>
            {query.data && query.data.availableSites.length > 1 && (
              <div className='w-full sm:w-56'>
                <label
                  htmlFor='dashboard-site-filter'
                  className='mb-1.5 block text-xs font-medium text-muted-foreground'
                >
                  Cakupan site
                </label>
                <Select value={site} onValueChange={setSite}>
                  <SelectTrigger
                    id='dashboard-site-filter'
                    className='w-full bg-background/80 shadow-sm backdrop-blur-sm'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='ALL'>Semua Site</SelectItem>
                    {query.data.availableSites.map((item) => (
                      <SelectItem key={item.code} value={item.code}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <Button
              type='button'
              variant='outline'
              className='bg-background/80 shadow-sm backdrop-blur-sm sm:size-9 sm:px-0'
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw
                className={cn('size-4', query.isFetching && 'animate-spin')}
                aria-hidden='true'
              />
              <span className='sm:sr-only'>Perbarui dashboard</span>
            </Button>
          </div>
        </div>
      </header>

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

function DashboardContent({ data }: { data: DashboardOverview }) {
  const kpis = dashboardKpis(data)
  const hasOperationalData = Object.values(data.capabilities).some(Boolean)

  if (!hasOperationalData) return <DashboardNoAccess />

  return (
    <div className='space-y-5'>
      <section
        aria-label='Ringkasan utama'
        className={cn(
          'grid gap-2',
          kpis.length > 2 ? 'sm:grid-cols-2 xl:grid-cols-4' : 'sm:grid-cols-2'
        )}
      >
        {kpis.map((item) => (
          <Card
            key={item.label}
            className='group relative min-h-[112px] gap-2 overflow-hidden rounded-xl py-4 shadow-sm'
          >
            <span
              className={cn('absolute inset-y-0 left-0 w-1', item.accent)}
              aria-hidden='true'
            />
            <CardContent className='flex items-start justify-between gap-3 px-4'>
              <div className='min-w-0'>
                <p className='truncate text-xs font-medium text-muted-foreground'>
                  {item.label}
                </p>
                <p className='mt-2 text-2xl font-bold tracking-tight tabular-nums'>
                  {number.format(item.value)}
                </p>
                <p className='mt-1 truncate text-xs text-muted-foreground'>
                  {item.detail}
                </p>
              </div>
              <div
                className={cn(
                  'rounded-xl p-2.5 ring-1 ring-inset',
                  item.iconStyle
                )}
              >
                <item.icon className='size-5' aria-hidden='true' />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      {(data.capabilities.attendance || data.priorities.length > 0) && (
        <div className='grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]'>
          {data.capabilities.attendance && (
            <AttendanceTrend data={data.attendanceTrend} />
          )}
          <PriorityPanel priorities={data.priorities} />
        </div>
      )}

      {(data.capabilities.production || data.sites.length > 1) && (
        <div className='grid gap-5 xl:grid-cols-2'>
          {data.capabilities.production && (
            <ProductionChart data={data.productionByJob} />
          )}
          {data.sites.length > 1 && (
            <SiteComparison
              sites={data.sites}
              capabilities={data.capabilities}
            />
          )}
        </div>
      )}

      {(data.capabilities.recruitment || data.activities.length > 0) && (
        <div className='grid gap-5 xl:grid-cols-[0.8fr_1.2fr]'>
          {data.capabilities.recruitment && data.recruitment && (
            <RecruitmentPipeline data={data.recruitment} />
          )}
          {data.activities.length > 0 && (
            <ActivityPanel activities={data.activities} />
          )}
        </div>
      )}

      <footer className='flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground'>
        <span>
          Data operasional per {longDate.format(localDate(data.businessDate))}
        </span>
        <span>
          Terakhir diperbarui {formattedGeneratedAt(data.generatedAt)}
        </span>
      </footer>
    </div>
  )
}

function dashboardKpis(data: DashboardOverview) {
  const items: Array<{
    label: string
    value: number
    detail: string
    icon: typeof Users
    accent: string
    iconStyle: string
  }> = []
  if (data.capabilities.employees && data.kpis.activeEmployees !== null) {
    items.push({
      label: 'Karyawan aktif',
      value: data.kpis.activeEmployees,
      detail: 'Dalam cakupan site',
      icon: Users,
      accent: 'bg-primary',
      iconStyle: 'bg-primary/10 text-primary ring-primary/15',
    })
  }
  if (data.capabilities.attendance && data.kpis.presentToday !== null) {
    const rate = attendanceRate(data.kpis.presentToday, data.kpis.eligibleToday)
    items.push({
      label: 'Hadir hari ini',
      value: data.kpis.presentToday,
      detail:
        rate === null
          ? 'Attendance tercatat'
          : `${percentage.format(rate)}% dari pekerja eligible`,
      icon: UserCheck,
      accent: 'bg-positive',
      iconStyle: 'bg-positive/10 text-positive ring-positive/15',
    })
  }
  if (data.capabilities.attendance && data.kpis.attendanceAttention !== null) {
    items.push({
      label: 'Perlu tindak lanjut',
      value: data.kpis.attendanceAttention,
      detail: 'Masalah Attendance terbuka',
      icon: AlertCircle,
      accent:
        data.kpis.attendanceAttention > 0 ? 'bg-amber-500' : 'bg-positive',
      iconStyle:
        data.kpis.attendanceAttention > 0
          ? 'bg-amber-500/10 text-amber-700 ring-amber-500/15 dark:text-amber-300'
          : 'bg-positive/10 text-positive ring-positive/15',
    })
  }
  if (
    data.capabilities.production &&
    data.kpis.productionTransactions !== null
  ) {
    items.push({
      label: 'Setoran hari ini',
      value: data.kpis.productionTransactions,
      detail: 'Transaksi produksi tercatat',
      icon: ScanLine,
      accent: 'bg-chart-3',
      iconStyle: 'bg-chart-3/10 text-chart-3 ring-chart-3/15',
    })
  }
  return items
}

function AttendanceTrend({
  data,
}: {
  data: DashboardOverview['attendanceTrend']
}) {
  return (
    <Card className='min-w-0 overflow-hidden rounded-xl shadow-sm'>
      <CardHeader className='pb-2'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div>
            <CardTitle>Tren kehadiran 7 hari</CardTitle>
            <CardDescription>
              Hadir dibandingkan pekerja yang eligible.
            </CardDescription>
          </div>
          <div className='flex items-center gap-3 text-[11px] text-muted-foreground'>
            <span className='flex items-center gap-1.5'>
              <span className='size-2 rounded-full bg-primary' /> Hadir
            </span>
            <span className='flex items-center gap-1.5'>
              <span className='size-2 rounded-full bg-muted-foreground/50' />
              Eligible
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className='h-72 px-1 pb-4 sm:px-5'>
        {data.length === 0 ? (
          <ChartEmpty label='Belum ada tren Attendance untuk cakupan ini.' />
        ) : (
          <ResponsiveContainer width='100%' height='100%'>
            <AreaChart data={data} margin={{ left: -18, right: 12, top: 8 }}>
              <defs>
                <linearGradient
                  id='dashboardPresentFill'
                  x1='0'
                  y1='0'
                  x2='0'
                  y2='1'
                >
                  <stop
                    offset='0%'
                    stopColor='var(--primary)'
                    stopOpacity={0.24}
                  />
                  <stop
                    offset='100%'
                    stopColor='var(--primary)'
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray='3 3'
                vertical={false}
                stroke='var(--border)'
              />
              <XAxis
                dataKey='date'
                tickFormatter={(value) =>
                  shortDate.format(localDate(String(value)))
                }
                fontSize={11}
                tickLine={false}
                axisLine={false}
              />
              <YAxis fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value, name) => [
                  number.format(Number(value)),
                  name === 'eligible' ? 'Eligible' : 'Hadir',
                ]}
                labelFormatter={(value) =>
                  longDate.format(localDate(String(value)))
                }
              />
              <Area
                type='monotone'
                dataKey='eligible'
                stroke='var(--muted-foreground)'
                strokeDasharray='4 4'
                fill='transparent'
                dot={false}
              />
              <Area
                type='monotone'
                dataKey='present'
                stroke='var(--primary)'
                strokeWidth={2.5}
                fill='url(#dashboardPresentFill)'
                dot={false}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function PriorityPanel({
  priorities,
}: {
  priorities: DashboardOverview['priorities']
}) {
  return (
    <Card className='min-w-0 overflow-hidden rounded-xl border-amber-500/20 shadow-sm'>
      <CardHeader className='pb-2'>
        <div className='flex items-start justify-between gap-3'>
          <div>
            <CardTitle>Prioritas hari ini</CardTitle>
            <CardDescription>Hal yang perlu segera diperiksa.</CardDescription>
          </div>
          <Badge
            variant={priorities.length ? 'secondary' : 'outline'}
            className={cn(
              priorities.length &&
                'bg-amber-500/10 text-amber-800 dark:text-amber-200'
            )}
          >
            {priorities.length} item
          </Badge>
        </div>
      </CardHeader>
      <CardContent className='space-y-2'>
        {priorities.length === 0 ? (
          <div className='flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed px-4 text-center'>
            <CheckCircle2 className='mb-2 size-8 text-positive' />
            <p className='text-sm font-medium'>Tidak ada prioritas mendesak</p>
            <p className='mt-1 text-xs text-muted-foreground'>
              Kondisi operasional dalam cakupan ini terpantau baik.
            </p>
          </div>
        ) : (
          priorities.slice(0, 5).map((item) => (
            <Alert
              key={item.uid}
              variant={item.severity === 'danger' ? 'destructive' : 'default'}
              className={cn(
                'rounded-xl',
                item.severity === 'warning' &&
                  'border-amber-500/40 bg-amber-500/10 text-foreground',
                item.severity === 'info' && 'border-primary/30 bg-primary/5'
              )}
            >
              <AlertTriangle aria-hidden='true' />
              <AlertTitle>{item.title}</AlertTitle>
              <AlertDescription className='text-current/80'>
                <p>{item.detail}</p>
                {item.actionUrl && item.actionLabel && (
                  <Button
                    variant='link'
                    className='mt-1 h-auto p-0 text-current'
                    asChild
                  >
                    <Link to={item.actionUrl}>
                      {item.actionLabel}
                      <ArrowRight aria-hidden='true' />
                    </Link>
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function ProductionChart({
  data,
}: {
  data: DashboardOverview['productionByJob']
}) {
  return (
    <Card className='min-w-0 overflow-hidden rounded-xl shadow-sm'>
      <CardHeader className='pb-2'>
        <CardTitle>Aktivitas produksi</CardTitle>
        <CardDescription>
          Jumlah setoran hari ini per pekerjaan.
        </CardDescription>
      </CardHeader>
      <CardContent className='h-72 px-1 pb-4 sm:px-5'>
        {data.length === 0 ? (
          <ChartEmpty label='Belum ada setoran produksi hari ini.' />
        ) : (
          <ResponsiveContainer width='100%' height='100%'>
            <BarChart
              data={data.slice(0, 7)}
              layout='vertical'
              margin={{ left: 12, right: 18, top: 8 }}
            >
              <defs>
                <linearGradient
                  id='dashboardProductionFill'
                  x1='0'
                  y1='0'
                  x2='1'
                  y2='0'
                >
                  <stop
                    offset='0%'
                    stopColor='var(--chart-2)'
                    stopOpacity={0.7}
                  />
                  <stop
                    offset='100%'
                    stopColor='var(--chart-2)'
                    stopOpacity={1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray='3 3'
                horizontal={false}
                stroke='var(--border)'
              />
              <XAxis
                type='number'
                allowDecimals={false}
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
                tickFormatter={(value) =>
                  String(value).length > 18
                    ? `${String(value).slice(0, 17)}…`
                    : String(value)
                }
              />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(value) => [
                  `${number.format(Number(value))} transaksi`,
                  'Setoran',
                ]}
              />
              <Bar
                dataKey='transactions'
                fill='url(#dashboardProductionFill)'
                radius={[0, 7, 7, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

function SiteComparison({
  sites,
  capabilities,
}: {
  sites: DashboardOverview['sites']
  capabilities: DashboardCapabilities
}) {
  return (
    <Card className='min-w-0 overflow-hidden rounded-xl shadow-sm'>
      <CardHeader className='pb-2'>
        <CardTitle>Ringkasan antar-site</CardTitle>
        <CardDescription>
          Perbandingan kondisi operasional hari ini.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-2 md:hidden'>
          {sites.map((site) => {
            const rate = attendanceRate(site.presentToday, site.eligibleToday)
            return (
              <div
                key={site.uid}
                className='rounded-xl border bg-muted/20 p-3.5'
              >
                <div className='flex items-center justify-between gap-2'>
                  <p className='font-semibold'>{site.name}</p>
                  {rate !== null && (
                    <Badge variant='secondary'>
                      {percentage.format(rate)}% hadir
                    </Badge>
                  )}
                </div>
                {rate !== null && (
                  <div
                    className='mt-3 h-1.5 overflow-hidden rounded-full bg-muted'
                    role='progressbar'
                    aria-label={`Kehadiran ${site.name}`}
                    aria-valuenow={Math.round(rate)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className='h-full rounded-full bg-gradient-to-r from-primary to-positive'
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                )}
                <dl className='mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs'>
                  {capabilities.employees && (
                    <Metric
                      label='Karyawan aktif'
                      value={site.activeEmployees}
                    />
                  )}
                  {capabilities.attendance && (
                    <Metric
                      label='Hadir / eligible'
                      value={
                        site.presentToday === null ||
                        site.eligibleToday === null
                          ? null
                          : `${number.format(site.presentToday)} / ${number.format(site.eligibleToday)}`
                      }
                    />
                  )}
                  {capabilities.attendance && (
                    <Metric
                      label='Perlu tindakan'
                      value={site.attendanceAttention}
                      warning
                    />
                  )}
                  {capabilities.production && (
                    <Metric
                      label='Setoran'
                      value={site.productionTransactions}
                    />
                  )}
                </dl>
              </div>
            )
          })}
        </div>
        <div className='hidden overflow-x-auto md:block'>
          <table className='w-full min-w-[560px] text-sm'>
            <thead>
              <tr className='border-b text-left text-xs text-muted-foreground'>
                <th className='pb-3 font-medium'>Site</th>
                {capabilities.employees && (
                  <th className='pb-3 text-right font-medium'>
                    Karyawan aktif
                  </th>
                )}
                {capabilities.attendance && (
                  <th className='pb-3 text-right font-medium'>Kehadiran</th>
                )}
                {capabilities.attendance && (
                  <th className='pb-3 text-right font-medium'>
                    Perlu tindakan
                  </th>
                )}
                {capabilities.production && (
                  <th className='pb-3 text-right font-medium'>Setoran</th>
                )}
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const rate = attendanceRate(
                  site.presentToday,
                  site.eligibleToday
                )
                return (
                  <tr key={site.uid} className='border-b last:border-0'>
                    <td className='py-3 font-medium'>
                      <span className='inline-flex items-center gap-2'>
                        <span
                          className='size-1.5 rounded-full bg-primary'
                          aria-hidden='true'
                        />
                        {site.name}
                      </span>
                    </td>
                    {capabilities.employees && (
                      <td className='py-3 text-right tabular-nums'>
                        {site.activeEmployees === null
                          ? '-'
                          : number.format(site.activeEmployees)}
                      </td>
                    )}
                    {capabilities.attendance && (
                      <td className='py-3 text-right'>
                        <span className='font-medium tabular-nums'>
                          {rate === null ? '-' : `${percentage.format(rate)}%`}
                        </span>
                        {site.presentToday !== null &&
                          site.eligibleToday !== null && (
                            <span className='ml-1 text-xs text-muted-foreground'>
                              ({number.format(site.presentToday)}/
                              {number.format(site.eligibleToday)})
                            </span>
                          )}
                      </td>
                    )}
                    {capabilities.attendance && (
                      <td
                        className={cn(
                          'py-3 text-right tabular-nums',
                          (site.attendanceAttention ?? 0) > 0 &&
                            'font-semibold text-amber-700 dark:text-amber-300'
                        )}
                      >
                        {site.attendanceAttention === null
                          ? '-'
                          : number.format(site.attendanceAttention)}
                      </td>
                    )}
                    {capabilities.production && (
                      <td className='py-3 text-right tabular-nums'>
                        {site.productionTransactions === null
                          ? '-'
                          : number.format(site.productionTransactions)}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function Metric({
  label,
  value,
  warning,
}: {
  label: string
  value: number | string | null
  warning?: boolean
}) {
  return (
    <div>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd
        className={cn(
          'mt-0.5 font-semibold tabular-nums',
          warning &&
            typeof value === 'number' &&
            value > 0 &&
            'text-amber-700 dark:text-amber-300'
        )}
      >
        {value === null
          ? '-'
          : typeof value === 'number'
            ? number.format(value)
            : value}
      </dd>
    </div>
  )
}

function RecruitmentPipeline({
  data,
}: {
  data: NonNullable<DashboardOverview['recruitment']>
}) {
  const items = [
    {
      label: 'Kandidat baru',
      value: data.newCount,
      icon: UserPlus,
      style: 'bg-primary/10 text-primary ring-primary/15',
    },
    {
      label: 'Sedang diproses',
      value: data.inProgressCount,
      icon: Clock3,
      style:
        'bg-amber-500/10 text-amber-700 ring-amber-500/15 dark:text-amber-300',
    },
    {
      label: 'Lolos, belum dikonversi',
      value: data.passedCount,
      icon: UserCheck,
      style: 'bg-positive/10 text-positive ring-positive/15',
    },
  ]
  const total = items.reduce((sum, item) => sum + item.value, 0)
  return (
    <Card className='overflow-hidden rounded-xl shadow-sm'>
      <CardHeader className='pb-2'>
        <CardTitle>Pipeline rekrutmen</CardTitle>
        <CardDescription>
          Kandidat yang masih memerlukan proses.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-2'>
        {total > 0 && (
          <div
            className='mb-4 flex h-2 overflow-hidden rounded-full bg-muted'
            aria-label={`${number.format(total)} kandidat aktif`}
          >
            {items.map((item, index) => (
              <span
                key={item.label}
                className={cn(
                  index === 0 && 'bg-primary',
                  index === 1 && 'bg-amber-500',
                  index === 2 && 'bg-positive'
                )}
                style={{ width: `${(item.value / total) * 100}%` }}
              />
            ))}
          </div>
        )}
        {items.map((item) => (
          <div
            key={item.label}
            className='flex items-center gap-3 rounded-xl border bg-muted/20 p-3'
          >
            <div className={cn('rounded-lg p-2 ring-1 ring-inset', item.style)}>
              <item.icon className='size-4' aria-hidden='true' />
            </div>
            <p className='min-w-0 flex-1 text-sm font-medium'>{item.label}</p>
            <span className='text-lg font-bold tabular-nums'>
              {number.format(item.value)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ActivityPanel({
  activities,
}: {
  activities: DashboardOverview['activities']
}) {
  return (
    <Card className='overflow-hidden rounded-xl shadow-sm'>
      <CardHeader className='pb-2'>
        <CardTitle>Aktivitas terbaru</CardTitle>
        <CardDescription>Pembaruan operasional lintas modul.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className='space-y-0'>
          {activities.slice(0, 6).map((item, index) => (
            <li key={item.uid} className='grid grid-cols-[2.75rem_1fr] gap-3'>
              <span className='pt-0.5 text-xs font-medium text-muted-foreground tabular-nums'>
                {formattedActivityTime(item.occurredAt)}
              </span>
              <div
                className={cn(
                  'relative pb-4 pl-4',
                  index < activities.slice(0, 6).length - 1 && 'border-l'
                )}
              >
                <span className='absolute top-1 -left-[5px] size-2.5 rounded-full border-2 border-background bg-gradient-to-br from-primary to-positive shadow-sm' />
                <div className='flex flex-wrap items-center gap-2'>
                  <p className='text-sm font-semibold'>{item.title}</p>
                  {item.site && <Badge variant='outline'>{item.site}</Badge>}
                </div>
                <p className='mt-1 text-sm text-muted-foreground'>
                  {item.detail}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className='flex h-full flex-col items-center justify-center text-center'>
      <Activity
        className='mb-2 size-8 text-muted-foreground/60'
        aria-hidden='true'
      />
      <p className='text-sm text-muted-foreground'>{label}</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div aria-label='Memuat dashboard' className='space-y-5' aria-busy='true'>
      <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className='h-[92px] rounded-lg' />
        ))}
      </div>
      <div className='grid gap-5 xl:grid-cols-[1.55fr_0.85fr]'>
        <Skeleton className='h-80 rounded-xl' />
        <Skeleton className='h-80 rounded-xl' />
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
        <AlertTriangle
          className='mb-4 size-10 text-destructive'
          aria-hidden='true'
        />
        <h2 className='text-lg font-semibold'>Dashboard gagal dimuat</h2>
        <p className='mt-1 text-sm text-muted-foreground'>{message}</p>
        <Button className='mt-5' onClick={onRetry}>
          <RefreshCw aria-hidden='true' /> Coba lagi
        </Button>
      </CardContent>
    </Card>
  )
}

function DashboardEmpty() {
  return (
    <Card className='mx-auto max-w-xl'>
      <CardContent className='flex flex-col items-center py-12 text-center'>
        <LayoutDashboard
          className='mb-4 size-10 text-muted-foreground'
          aria-hidden='true'
        />
        <h2 className='text-lg font-semibold'>Belum ada data operasional</h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          Tidak ada data dashboard untuk cakupan site yang dipilih.
        </p>
      </CardContent>
    </Card>
  )
}

function DashboardNoAccess() {
  return (
    <Card className='mx-auto max-w-xl'>
      <CardContent className='flex flex-col items-center py-12 text-center'>
        <LayoutDashboard
          className='mb-4 size-10 text-muted-foreground'
          aria-hidden='true'
        />
        <h2 className='text-lg font-semibold'>Ringkasan belum tersedia</h2>
        <p className='mt-1 text-sm text-muted-foreground'>
          Akun ini belum memiliki akses ke data operasional dashboard.
        </p>
      </CardContent>
    </Card>
  )
}
