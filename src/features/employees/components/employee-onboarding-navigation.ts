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

  if (stage === 'NEEDS_PRODUCTION_ASSIGNMENT') {
    navigate({
      to: '/produksi/master-pekerjaan',
      search: {
        tab: 'assignments',
        assignmentView: 'readiness',
        setupProduction: true,
        employeeUids: actionable.map((item) => item.employeeUid).join(','),
      },
    })
    return
  }

  if (stage === 'MISSING_PRODUCTION_RATE') {
    const item = actionable[0]
    navigate({
      to: '/produksi/tarif-site',
      search: {
        site: item.site ? [item.site] : undefined,
        filter: item.primaryJobCode,
      },
    })
    return
  }

  if (stage === 'PRODUCTION_ASSIGNMENT_CONFLICT') {
    const item = actionable[0]
    navigate({
      to: '/produksi/master-pekerjaan',
      search: {
        tab: 'assignments',
        assignmentView: 'readiness',
        filter: item.employeeNumber,
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
