import { createFileRoute } from '@tanstack/react-router'
import { AttendanceFoundationPage } from '@/features/attendance/attendance-foundation-page'
import { requirePermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/attendance/scan')({
  beforeLoad: () => requirePermission('attendance.scan'),
  component: () => <AttendanceFoundationPage kind='scan' />,
})
