import { createFileRoute } from '@tanstack/react-router'
import { AttendanceFoundationPage } from '@/features/attendance/attendance-foundation-page'
import { requirePermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/attendance/master-shift')(
  {
    beforeLoad: () => requirePermission('attendance.manage_shift'),
    component: () => <AttendanceFoundationPage kind='shift' />,
  }
)
