import { env } from '../config.js'
import { ApiError } from './errors.js'

type TurnstileResponse = {
  success?: boolean
  hostname?: string
  action?: string
}

export function recruitmentTurnstileEnabled() {
  return env.NODE_ENV === 'production'
}

export async function verifyRecruitmentTurnstile(input: {
  token?: string
  remoteIp?: string
  expectedAction: 'recruitment-check' | 'recruitment-submit'
}) {
  // Pengembangan lokal tetap memakai seluruh validasi form, rate limit,
  // idempotency, dan validasi berkas. Hanya panggilan ke Cloudflare yang
  // dilewati agar form dapat diuji tanpa domain publik.
  if (!recruitmentTurnstileEnabled()) return

  const secret = env.RECRUITMENT_TURNSTILE_SECRET_KEY
  if (!secret) {
    throw new ApiError(503, 'Form Data Pelamar belum siap digunakan.')
  }
  if (!input.token) {
    throw new ApiError(422, 'Silakan ulangi verifikasi keamanan.')
  }

  const body = new URLSearchParams({
    secret,
    response: input.token,
  })
  if (input.remoteIp) body.set('remoteip', input.remoteIp)

  let response: Response
  try {
    response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(5_000),
      }
    )
  } catch {
    throw new ApiError(
      503,
      'Verifikasi keamanan sedang terganggu. Silakan coba kembali.'
    )
  }

  if (!response.ok) {
    throw new ApiError(
      503,
      'Verifikasi keamanan sedang terganggu. Silakan coba kembali.'
    )
  }
  const result = (await response.json()) as TurnstileResponse
  const hostnameMatches =
    !env.RECRUITMENT_TURNSTILE_EXPECTED_HOSTNAME ||
    result.hostname === env.RECRUITMENT_TURNSTILE_EXPECTED_HOSTNAME
  if (
    !result.success ||
    !hostnameMatches ||
    (result.action && result.action !== input.expectedAction)
  ) {
    throw new ApiError(422, 'Verifikasi keamanan gagal. Silakan coba kembali.')
  }
}
