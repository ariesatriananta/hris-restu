import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertPublicRecruitmentConfigured,
  privateRecruitmentBucket,
  privateRecruitmentPrefix,
} from './recruitment-public-config.js'

const { env } = vi.hoisted(() => ({
  env: {
    NODE_ENV: 'production',
    R2_BUCKET_NAME: 'rsia-live',
    R2_KEY_PREFIX: 'hris-rsia/',
    RECRUITMENT_R2_BUCKET_NAME: 'rsia-live',
    RECRUITMENT_R2_KEY_PREFIX: 'hris-rsia-recruitment/',
    RECRUITMENT_TURNSTILE_SITE_KEY: 'synthetic',
    RECRUITMENT_TURNSTILE_SECRET_KEY: 'synthetic',
    RECRUITMENT_TURNSTILE_EXPECTED_HOSTNAME: 'hris.example.test',
  },
}))
vi.mock('../config.js', () => ({ env }))

const initial = { ...env }
beforeEach(() => Object.assign(env, initial))
afterEach(() => vi.restoreAllMocks())
describe('shared recruitment bucket configuration', () => {
  it('accepts the shared bucket with sibling folders and retains production verification', () => {
    expect(privateRecruitmentBucket()).toBe('rsia-live')
    expect(privateRecruitmentPrefix()).toBe('hris-rsia-recruitment/')
    expect(() => assertPublicRecruitmentConfigured()).not.toThrow()
  })
  it('retains existing separate bucket paths', () => {
    env.RECRUITMENT_R2_BUCKET_NAME = 'legacy-private'
    env.RECRUITMENT_R2_KEY_PREFIX = 'hris-rsia-private/recruitment/'
    expect(privateRecruitmentBucket()).toBe('legacy-private')
    expect(privateRecruitmentPrefix()).toBe('hris-rsia-private/recruitment/')
  })
  it.each([
    'hris-rsia/',
    'hris-rsia/recruitment/',
    '/',
    '',
    '../docs/',
    'docs//files/',
  ])('rejects overlapping or invalid shared prefix %s', (prefix) => {
    env.RECRUITMENT_R2_KEY_PREFIX = prefix
    expect(() => assertPublicRecruitmentConfigured()).toThrow()
  })
  it('rejects a main folder nested under recruitment', () => {
    env.R2_KEY_PREFIX = 'hris-rsia-recruitment/employees/'
    expect(() => assertPublicRecruitmentConfigured()).toThrow()
  })
  it('requires an explicit recruitment bucket', () => {
    env.RECRUITMENT_R2_BUCKET_NAME = ''
    expect(() => assertPublicRecruitmentConfigured()).toThrow()
  })
  it.each([
    'RECRUITMENT_TURNSTILE_SITE_KEY',
    'RECRUITMENT_TURNSTILE_SECRET_KEY',
    'RECRUITMENT_TURNSTILE_EXPECTED_HOSTNAME',
  ] as const)('still fails closed when production %s is missing', (field) => {
    env[field] = ''
    expect(() => assertPublicRecruitmentConfigured()).toThrow()
  })
})
