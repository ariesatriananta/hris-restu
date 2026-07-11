import { describe, expect, it } from 'vitest'
import {
  buildOverview,
  mockDashboardRepository,
} from './mock-dashboard-repository'

describe('mock dashboard repository', () => {
  it('menjaga total seluruh site konsisten', () => {
    const all = buildOverview('ALL')
    const perSite = ['JEPARA', 'SEMARANG', 'KLATEN'].map((site) =>
      buildOverview(site as 'JEPARA' | 'SEMARANG' | 'KLATEN')
    )
    expect(all.kpis.activeEmployees).toBe(
      perSite.reduce((total, item) => total + item.kpis.activeEmployees, 0)
    )
    expect(all.kpis.productionValue).toBe(
      perSite.reduce((total, item) => total + item.kpis.productionValue, 0)
    )
    expect(
      all.productionByJob.reduce((total, item) => total + item.transactions, 0)
    ).toBe(all.kpis.productionTransactions)
  })

  it('menyediakan state empty dan error yang dapat diuji', async () => {
    await expect(
      mockDashboardRepository.getOverview({ site: 'ALL', mockState: 'empty' })
    ).resolves.toBeNull()
    await expect(
      mockDashboardRepository.getOverview({ site: 'ALL', mockState: 'error' })
    ).rejects.toThrow('mensimulasikan kegagalan')
  })
})
