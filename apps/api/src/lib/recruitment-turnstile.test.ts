import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  env: {
    NODE_ENV: 'development' as 'development' | 'test' | 'production',
    RECRUITMENT_TURNSTILE_SECRET_KEY: 'local-secret' as string | undefined,
    RECRUITMENT_TURNSTILE_EXPECTED_HOSTNAME: 'hris.example.com' as
      | string
      | undefined,
  },
}))

vi.mock('../config.js', () => ({ env: mocks.env }))

import {
  recruitmentTurnstileEnabled,
  verifyRecruitmentTurnstile,
} from './recruitment-turnstile.js'

describe('recruitment Turnstile policy', () => {
  beforeEach(() => {
    mocks.env.NODE_ENV = 'development'
    mocks.env.RECRUITMENT_TURNSTILE_SECRET_KEY = 'local-secret'
    mocks.env.RECRUITMENT_TURNSTILE_EXPECTED_HOSTNAME = 'hris.example.com'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('melewati Cloudflare di development walaupun secret lokal masih terisi', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(recruitmentTurnstileEnabled()).toBe(false)
    await expect(
      verifyRecruitmentTurnstile({
        expectedAction: 'recruitment-submit',
      })
    ).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('melewati Cloudflare di environment test', async () => {
    mocks.env.NODE_ENV = 'test'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      verifyRecruitmentTurnstile({
        expectedAction: 'recruitment-check',
      })
    ).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('production gagal tertutup bila secret belum dikonfigurasi', async () => {
    mocks.env.NODE_ENV = 'production'
    mocks.env.RECRUITMENT_TURNSTILE_SECRET_KEY = undefined

    expect(recruitmentTurnstileEnabled()).toBe(true)
    await expect(
      verifyRecruitmentTurnstile({
        token: 'token-valid',
        expectedAction: 'recruitment-submit',
      })
    ).rejects.toMatchObject({ status: 503 })
  })

  it('production tetap mewajibkan token Turnstile', async () => {
    mocks.env.NODE_ENV = 'production'

    await expect(
      verifyRecruitmentTurnstile({
        expectedAction: 'recruitment-submit',
      })
    ).rejects.toMatchObject({ status: 422 })
  })

  it('production memvalidasi token, hostname, dan action ke Cloudflare', async () => {
    mocks.env.NODE_ENV = 'production'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          hostname: 'hris.example.com',
          action: 'recruitment-submit',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      verifyRecruitmentTurnstile({
        token: 'token-valid',
        remoteIp: '203.0.113.10',
        expectedAction: 'recruitment-submit',
      })
    ).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
