import type {
  RecruitmentEligibility,
  RecruitmentFiles,
  RecruitmentFormValues,
  RecruitmentIdentity,
  RecruitmentPublicConfig,
  RecruitmentReceipt,
} from './domain'

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api'

export class PublicRecruitmentError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message)
  }
}

async function responseData<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as {
    message?: string
  } | null
  if (!response.ok) {
    throw new PublicRecruitmentError(
      body?.message ||
        'Layanan pendaftaran sedang terganggu. Silakan coba kembali.',
      response.status
    )
  }
  return body as T
}

function endpoint(siteToken: string, path: string) {
  return `${API_BASE}/public/recruitment/${encodeURIComponent(siteToken)}/${path}`
}

export async function getRecruitmentPublicConfig(siteToken: string) {
  const response = await fetch(endpoint(siteToken, 'config'), {
    headers: { Accept: 'application/json' },
    credentials: 'omit',
  })
  return responseData<RecruitmentPublicConfig>(response)
}

export async function checkRecruitmentIdentity(
  siteToken: string,
  identity: RecruitmentIdentity,
  turnstileToken?: string
) {
  const response = await fetch(endpoint(siteToken, 'check'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'omit',
    body: JSON.stringify({ ...identity, turnstileToken }),
  })
  return responseData<RecruitmentEligibility>(response)
}

export async function submitRecruitmentApplication(input: {
  siteToken: string
  values: RecruitmentFormValues
  files: RecruitmentFiles
  privacyNoticeVersion: string
  idempotencyKey: string
  turnstileToken?: string
}) {
  if (!input.files.photo || !input.files.ktp || !input.files.kk)
    throw new PublicRecruitmentError('Semua foto wajib dilengkapi.')
  const formData = new FormData()
  formData.set(
    'payload',
    JSON.stringify({
      ...input.values,
      email: input.values.email.trim() || undefined,
      privacyNoticeVersion: input.privacyNoticeVersion,
      idempotencyKey: input.idempotencyKey,
    })
  )
  formData.set('photo', input.files.photo)
  formData.set('ktp', input.files.ktp)
  formData.set('kk', input.files.kk)
  const response = await fetch(endpoint(input.siteToken, 'submit'), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(input.turnstileToken
        ? { 'x-turnstile-token': input.turnstileToken }
        : {}),
    },
    credentials: 'omit',
    body: formData,
  })
  return responseData<RecruitmentReceipt>(response)
}
