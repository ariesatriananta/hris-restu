import { createFileRoute } from '@tanstack/react-router'
import { TerminalScanPage } from '@/features/attendance/terminal-scan-page'
import { requirePermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/attendance/scan')({
  beforeLoad: () => requirePermission('attendance.scan'),
  component: TerminalScanPage,
})
