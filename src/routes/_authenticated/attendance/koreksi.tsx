import { createFileRoute } from '@tanstack/react-router'
import { AttendanceFoundationPage } from '@/features/attendance/attendance-foundation-page'
import { requireAnyPermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/attendance/koreksi')({
  beforeLoad: () =>
    requireAnyPermission(['attendance.correct', 'attendance.approve']),
  component: () => <AttendanceFoundationPage kind='correction' />,
})
