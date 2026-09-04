import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { RecruitmentConversionPage } from '@/features/recruitment/recruitment-conversion-page'

export const Route = createFileRoute(
  '/_authenticated/karyawan/rekrutmen_/$candidateUid/lengkapi'
)({
  beforeLoad: () => requirePermission('recruitment.manage'),
  validateSearch: z.object({ returnTo: z.string().optional() }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <RecruitmentConversionPage
      candidateUid={Route.useParams().candidateUid}
      returnTo={Route.useSearch().returnTo}
    />
  )
}
