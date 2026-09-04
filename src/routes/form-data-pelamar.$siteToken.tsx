import { createFileRoute } from '@tanstack/react-router'
import { PublicApplicationRoute } from '@/features/recruitment-public/public-application-route'

export const Route = createFileRoute('/form-data-pelamar/$siteToken')({
  component: PublicApplicationRoute,
})
