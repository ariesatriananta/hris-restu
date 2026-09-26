import type { useNavigate } from '@tanstack/react-router'
import type { EmployeeOnboardingReadinessItem } from '../domain'

type Navigate = ReturnType<typeof useNavigate>

export function continueEmployeeOnboarding(
  items: EmployeeOnboardingReadinessItem[],
  navigate: Navigate,
  returnTo = '/karyawan/data-karyawan'
) {
  const actionable = items.filter((item) => item.canContinue)
  const stage = actionable[0]?.stage
  if (!stage || actionable.some((item) => item.stage !== stage)) return

  if (stage === 'NEEDS_SHIFT') {
    navigate({
      to: '/attendance/master-shift',
      search: {
        tab: 'assignment',
        setupAttendance: true,
        employeeUids: actionable.map((item) => item.employeeUid).join(','),
      },
    })
    return
  }

  navigate({
    to: '/karyawan/pkwt/tambah-multiple',
    search: {
      returnTo,
      onboarding: true,
      employeeUids:
        stage === 'NEEDS_CONTRACT'
          ? actionable.map((item) => item.employeeUid).join(',')
          : undefined,
      contractUids:
        stage === 'NEEDS_ACTIVATION'
          ? actionable
              .map((item) => item.contractUid)
              .filter(Boolean)
              .join(',')
          : undefined,
    },
  })
}
