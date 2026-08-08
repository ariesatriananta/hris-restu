import { CalendarRange, ClipboardCheck } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Main } from '@/components/layout/main'
import { hasPermission } from '@/features/auth/permissions'
import { AttendanceClassificationPage } from './classification-page'
import { AttendanceCorrectionPage } from './correction-page'
import { useAttendanceReadiness } from './data/queries'
import type { AttendanceSiteCode } from './domain'

type FollowUpTab = 'correction' | 'classification'

export function AttendanceFollowUpPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const role = useAuthStore((state) => state.session?.user.role)
  const session = useAuthStore((state) => state.session)
  const canClassify = role === 'HR_OFFICER' || role === 'SUPER_ADMIN'
  const canViewReadiness = hasPermission(session, 'attendance.view')
  const requestedTab =
    search.tab === 'classification' ? 'classification' : 'correction'
  const tab: FollowUpTab = canClassify ? requestedTab : 'correction'
  const readiness = useAttendanceReadiness(
    {
      site: arrayValue<AttendanceSiteCode>(search.site),
    },
    canViewReadiness
  )
  const pendingCorrectionCount = readiness.data?.items.reduce(
    (total, item) => total + item.followUp.pendingCorrectionCount,
    0
  )
  const pendingClassificationCount = readiness.data?.items.reduce(
    (total, item) => total + item.followUp.pendingClassificationCount,
    0
  )

  const changeTab = (value: string) => {
    const next = value as FollowUpTab
    navigate({
      search: (previous) => ({
        ...previous,
        tab: next === 'correction' ? undefined : next,
        page: undefined,
      }),
    })
  }

  return (
    <Main>
      <div className='mb-5'>
        <p className='text-sm font-medium text-primary'>Attendance</p>
        <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
          Tindak Lanjut Attendance
        </h1>
        <p className='text-sm text-muted-foreground'>
          Periksa koreksi jam dan klasifikasi ketidakhadiran dalam satu ruang
          kerja HR.
        </p>
      </div>

      <Tabs value={tab} onValueChange={changeTab} className='gap-4'>
        <div className='overflow-x-auto pb-1'>
          <TabsList className='h-11 min-w-max gap-1 p-1'>
            <TabsTrigger value='correction' className='h-9 px-4'>
              <ClipboardCheck /> Koreksi Attendance
              {canViewReadiness && (
                <PendingBadge
                  value={pendingCorrectionCount}
                  pending={readiness.isPending}
                  error={readiness.isError}
                />
              )}
            </TabsTrigger>
            {canClassify && (
              <TabsTrigger value='classification' className='h-9 px-4'>
                <CalendarRange /> Klasifikasi Attendance
                {canViewReadiness && (
                  <PendingBadge
                    value={pendingClassificationCount}
                    pending={readiness.isPending}
                    error={readiness.isError}
                  />
                )}
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value='correction'>
          {tab === 'correction' && (
            <AttendanceCorrectionPage
              search={search}
              navigate={navigate}
              embedded
            />
          )}
        </TabsContent>
        {canClassify && (
          <TabsContent value='classification'>
            {tab === 'classification' && (
              <AttendanceClassificationPage
                search={search}
                navigate={navigate}
                embedded
              />
            )}
          </TabsContent>
        )}
      </Tabs>
    </Main>
  )
}

function PendingBadge({
  value,
  pending,
  error,
}: {
  value?: number
  pending: boolean
  error: boolean
}) {
  const label = pending ? '…' : error ? '?' : String(value ?? 0)
  return (
    <Badge
      variant='secondary'
      className='ms-1 min-w-6 justify-center px-1.5 tabular-nums'
      title={error ? 'Jumlah pending gagal dimuat' : 'Jumlah pending'}
      aria-label={
        error
          ? 'Jumlah pending gagal dimuat'
          : pending
            ? 'Memuat jumlah pending'
            : `${value ?? 0} pending`
      }
    >
      {label}
    </Badge>
  )
}

function arrayValue<T>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : undefined
}
