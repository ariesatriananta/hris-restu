import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { PayrollPolicyVersion } from './domain'
import { PeriodPreview, PolicyCard } from './payroll-configuration-page'

function policy(
  overrides: Partial<PayrollPolicyVersion> = {}
): PayrollPolicyVersion {
  return {
    uid: '11111111-1111-4111-8111-111111111111',
    version: 1,
    site: {
      uid: '22222222-2222-4222-8222-222222222222',
      code: 'JEPARA',
      name: 'Jepara',
    },
    employeeType: 'TRAINING',
    wageBasis: 'TIME_BASED',
    payFrequency: 'WEEKLY',
    cutoffType: 'WEEK_END',
    cutoffDay: null,
    roundingMode: 'HALF_UP',
    roundingScale: 0,
    effectiveFrom: '2026-08-31',
    effectiveTo: null,
    status: 'ACTIVE',
    reason: null,
    createdAt: null,
    createdByName: null,
    nextPeriods: [{ periodStart: '2026-08-31', periodEnd: '2026-09-06' }],
    ...overrides,
  }
}

describe('Payroll M5A1 configuration UI', () => {
  it('menjelaskan policy Training sebagai satuan waktu mingguan', () => {
    const html = renderToStaticMarkup(
      <PolicyCard policy={policy()} onOpen={vi.fn()} />
    )

    expect(html).toContain('Training')
    expect(html).toContain('Satuan waktu')
    expect(html).toContain('Mingguan')
    expect(html).toContain('Senin–Minggu')
  })

  it('menampilkan cutoff akhir bulan untuk karyawan Bulanan', () => {
    const html = renderToStaticMarkup(
      <PolicyCard
        policy={policy({
          employeeType: 'BULANAN',
          payFrequency: 'MONTHLY',
          cutoffType: 'LAST_DAY',
        })}
        onOpen={vi.fn()}
      />
    )

    expect(html).toContain('Bulanan')
    expect(html).toContain('Akhir bulan')
  })

  it('menyajikan tiga periode preview secara kronologis', () => {
    const html = renderToStaticMarkup(
      <PeriodPreview
        periods={[
          { periodStart: '2026-08-01', periodEnd: '2026-08-31' },
          { periodStart: '2026-09-01', periodEnd: '2026-09-30' },
          { periodStart: '2026-10-01', periodEnd: '2026-10-31' },
        ]}
      />
    )

    expect(html).toContain('1 Agt 2026')
    expect(html).toContain('30 Sep 2026')
    expect(html).toContain('31 Okt 2026')
  })
})
