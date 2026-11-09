import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthContext } from '../middleware/authenticate.js'
import {
  assertProductionRevisionDate,
  canReviseProductionDate,
  canViewProductionWages,
  redactProductionFinancials,
} from './production-access-policy.js'

const auth = (role: string): AuthContext => ({
  id: 1,
  uid: 'test',
  name: 'test',
  email: null,
  roles: [role],
  permissions: ['production.correct', 'production.export'],
  siteAccess: [],
})
afterEach(() => vi.useRealTimers())

describe('Production M1 access policy', () => {
  it.each(['HR_OFFICER', 'SUPER_ADMIN'])('allows wages only for %s', (role) => {
    const body = { grossAmount: '100.00', jobs: [{ rate: { amount: '1' } }] }
    expect(canViewProductionWages(auth(role))).toBe(true)
    expect(redactProductionFinancials(body, auth(role))).toBe(body)
  })
  it.each(['QC', 'PRODUCTION_ADMIN', 'DIRECTOR', 'SITE_SUPERVISOR', 'HR', ''])(
    'redacts nested financials for %s while preserving quantity and source objects',
    (role) => {
      const body = {
        grossAmount: '100.00',
        total_gross_amount: '100.00',
        totalRateAmount: '20',
        employee: { uid: 'employee', fullName: 'Example' },
        quantity: '500',
        payableQuantity: '485',
        deductionPercentage: '3',
        jobs: [
          {
            uid: 'job',
            rate: { uid: 'secret-rate', amount: '20', currency: 'IDR' },
          },
        ],
        rateDetails: [
          {
            minQuantity: '1',
            quantity: '500',
            rateAmount: '20',
            amount: '100',
          },
        ],
        revisions: [
          {
            before: {
              rate_snapshot: '20',
              gross_amount: '100',
              quantity: '400',
            },
            afterData: JSON.stringify({
              quantity: '500',
              rateAmount: '20',
              pair: { amount_snapshot: '10' },
            }),
            reason: 'Correction',
          },
        ],
        notes: '{"grossAmount":"keep user text"}',
        qc: { weight1Grams: '73', totalReject: 2 },
      }
      const before = JSON.stringify(body)
      const result = redactProductionFinancials(body, auth(role))
      expect(result).toEqual({
        employee: body.employee,
        quantity: '500',
        payableQuantity: '485',
        deductionPercentage: '3',
        jobs: [{ uid: 'job' }],
        revisions: [
          {
            before: { quantity: '400' },
            afterData: '{"quantity":"500","pair":{}}',
            reason: 'Correction',
          },
        ],
        notes: body.notes,
        qc: body.qc,
      })
      expect(JSON.stringify(body)).toBe(before)
      expect(canViewProductionWages(auth(role))).toBe(false)
    }
  )
  it('uses Jakarta midnight even while UTC is still the preceding date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-09T17:00:00Z'))
    expect(() =>
      assertProductionRevisionDate(auth('QC'), '2026-11-09')
    ).toThrow(/hanya boleh/)
    expect(() =>
      assertProductionRevisionDate(auth('QC'), '2026-11-10')
    ).not.toThrow()
    expect(canReviseProductionDate(auth('DIRECTOR'), '2026-11-09')).toBe(false)
    expect(() =>
      assertProductionRevisionDate(auth('HR_OFFICER'), '2026-01-01')
    ).not.toThrow()
    expect(() =>
      assertProductionRevisionDate(auth('SUPER_ADMIN'), '2026-01-01')
    ).not.toThrow()
  })
  it('rejects malformed dates for unprivileged callers', () => {
    expect(canReviseProductionDate(auth('QC'), 'invalid')).toBe(false)
  })
})
