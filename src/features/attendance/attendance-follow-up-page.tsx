import { CalendarRange, ClipboardCheck } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Main } from '@/components/layout/main'
import { AttendanceClassificationPage } from './classification-page'
import { AttendanceCorrectionPage } from './correction-page'

type FollowUpTab = 'correction' | 'classification'

export function AttendanceFollowUpPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const role = useAuthStore((state) => state.session?.user.role)
  const canClassify = role === 'HR_OFFICER' || role === 'SUPER_ADMIN'
  const requestedTab =
    search.tab === 'classification' ? 'classification' : 'correction'
  const tab: FollowUpTab = canClassify ? requestedTab : 'correction'

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
            </TabsTrigger>
            {canClassify && (
              <TabsTrigger value='classification' className='h-9 px-4'>
                <CalendarRange /> Klasifikasi Attendance
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
