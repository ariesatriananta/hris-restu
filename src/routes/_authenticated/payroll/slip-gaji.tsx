import { createFileRoute } from '@tanstack/react-router'
import { requirePermission } from '@/features/auth/permissions'
import { PayrollFoundationPage } from '@/features/payroll/payroll-foundation-page'

export const Route = createFileRoute('/_authenticated/payroll/slip-gaji')({
  beforeLoad: () => requirePermission('payroll.view'),
  component: () => <PayrollFoundationPage section='payslips' />,
})
