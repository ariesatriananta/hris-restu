import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { hasPermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/laporan/')({
  beforeLoad: () => {
    const session = useAuthStore.getState().session

    if (hasPermission(session, 'employees.view')) {
      throw redirect({ to: '/laporan/karyawan', search: {}, replace: true })
    }

    if (hasPermission(session, 'attendance.view')) {
      throw redirect({ to: '/laporan/attendance', search: {}, replace: true })
    }

    if (hasPermission(session, 'production.view')) {
      throw redirect({
        to: '/laporan/produksi-borongan',
        search: {},
        replace: true,
      })
    }

    if (hasPermission(session, 'payroll.view')) {
      throw redirect({
        to: '/laporan/payroll-final',
        search: {},
        replace: true,
      })
    }

    if (hasPermission(session, 'audit.view')) {
      throw redirect({
        to: '/laporan/audit-aktivitas',
        search: {},
        replace: true,
      })
    }

    throw redirect({
      to: '/errors/$error',
      params: { error: 'forbidden' },
      replace: true,
    })
  },
})
