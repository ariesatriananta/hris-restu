import { z } from 'zod'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAuthStore } from '@/stores/auth-store'
import { AttendanceClassificationPage } from '@/features/attendance/classification-page'
import { requireAnyPermission } from '@/features/auth/permissions'

export const Route = createFileRoute('/_authenticated/attendance/klasifikasi')({
  beforeLoad: () => {
    requireAnyPermission(['attendance.correct', 'attendance.approve'])
    const role = useAuthStore.getState().session?.user.role
    if (role !== 'HR_OFFICER' && role !== 'SUPER_ADMIN') {
      throw redirect({ to: '/errors/$error', params: { error: 'forbidden' } })
    }
  },
  validateSearch: z.object({
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().min(1).max(500).optional(),
    filter: z.string().optional(),
    site: z.array(z.enum(['JEPARA', 'SEMARANG', 'KLATEN'])).optional(),
    classificationType: z
      .array(z.enum(['LEAVE', 'SICK', 'PERMISSION']))
      .optional(),
    approvalStatus: z
      .array(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']))
      .optional(),
    dateFrom: z.string().date().optional(),
    dateTo: z.string().date().optional(),
    employeeUid: z.string().uuid().optional(),
    employeeName: z.string().max(200).optional(),
    employeeNumber: z.string().max(100).optional(),
    employeeSite: z.enum(['JEPARA', 'SEMARANG', 'KLATEN']).optional(),
    employeeType: z
      .enum(['BORONGAN', 'HARIAN', 'BULANAN', 'TRAINING'])
      .optional(),
    businessDate: z.string().date().optional(),
  }),
  component: RouteComponent,
})

// eslint-disable-next-line react-refresh/only-export-components
function RouteComponent() {
  return (
    <AttendanceClassificationPage
      search={Route.useSearch()}
      navigate={Route.useNavigate()}
    />
  )
}
