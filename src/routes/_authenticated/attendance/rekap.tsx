import { createFileRoute } from '@tanstack/react-router'
import { AttendanceFoundationPage } from '@/features/attendance/attendance-foundation-page'
import { requirePermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/attendance/rekap')({
  beforeLoad: () => requirePermission('attendance.view'),
  component: () => <AttendanceFoundationPage kind='recap' />,
})
