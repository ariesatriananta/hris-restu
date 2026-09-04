import { useParams } from '@tanstack/react-router'
import { PublicApplicationPage } from './public-application-page'

export function PublicApplicationRoute() {
  const { siteToken } = useParams({
    from: '/form-data-pelamar/$siteToken',
  })
  return <PublicApplicationPage siteToken={siteToken} />
}
