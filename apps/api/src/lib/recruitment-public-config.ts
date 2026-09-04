import { env } from '../config.js'
import { ApiError } from './errors.js'

let cachedSource: string | undefined
let cachedTokens = new Map<string, string>()

function recruitmentSiteTokens() {
  if (cachedSource !== env.RECRUITMENT_SITE_TOKENS_JSON) {
    cachedSource = env.RECRUITMENT_SITE_TOKENS_JSON
    cachedTokens = new Map<string, string>()
    if (cachedSource) {
      try {
        const parsed = JSON.parse(cachedSource) as unknown
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          throw new Error('Token map must be an object.')
        }
        for (const [publicToken, siteCode] of Object.entries(parsed)) {
          if (
            /^[A-Za-z0-9_-]{24,100}$/.test(publicToken) &&
            typeof siteCode === 'string' &&
            /^[A-Z0-9_-]{2,20}$/.test(siteCode)
          ) {
            cachedTokens.set(publicToken, siteCode)
          }
        }
      } catch {
        cachedTokens.clear()
      }
    }
  }
  return cachedTokens
}

export function recruitmentSiteCodeFromToken(token: string) {
  const normalizedToken = token.trim()
  if (!/^[A-Za-z0-9_-]{24,100}$/.test(normalizedToken)) return null
  return recruitmentSiteTokens().get(normalizedToken) ?? null
}

export function recruitmentPublicTokensBySite() {
  const tokensBySite = new Map<string, string>()
  for (const [token, siteCode] of recruitmentSiteTokens()) {
    if (!tokensBySite.has(siteCode)) tokensBySite.set(siteCode, token)
  }
  return tokensBySite
}

export function privateRecruitmentBucket() {
  if (
    !env.RECRUITMENT_R2_BUCKET_NAME ||
    env.RECRUITMENT_R2_BUCKET_NAME === env.R2_BUCKET_NAME
  ) {
    throw new ApiError(503, 'Form Data Pelamar belum siap digunakan.')
  }
  return env.RECRUITMENT_R2_BUCKET_NAME
}

export function assertPublicRecruitmentConfigured() {
  privateRecruitmentBucket()
  if (
    env.NODE_ENV === 'production' &&
    (!env.RECRUITMENT_TURNSTILE_SITE_KEY ||
      !env.RECRUITMENT_TURNSTILE_SECRET_KEY ||
      !env.RECRUITMENT_TURNSTILE_EXPECTED_HOSTNAME)
  ) {
    throw new ApiError(503, 'Form Data Pelamar belum siap digunakan.')
  }
}

export function privateRecruitmentPrefix() {
  return env.RECRUITMENT_R2_KEY_PREFIX.replace(/^\/+|\/+$/g, '') + '/'
}
