import { createFileRoute } from '@tanstack/react-router'
import { ProductionJobMasterPage } from '@/features/production/production-rate-pages'

export const Route = createFileRoute(
  '/_authenticated/produksi/master-pekerjaan'
)({ component: ProductionJobMasterPage })
