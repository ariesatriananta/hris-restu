import { createFileRoute } from '@tanstack/react-router'
import { ProductionRatePage } from '@/features/production/production-rate-pages'

export const Route = createFileRoute('/_authenticated/produksi/tarif-site')({
  component: ProductionRatePage,
})
