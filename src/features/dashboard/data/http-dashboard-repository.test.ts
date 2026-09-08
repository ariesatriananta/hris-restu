import { beforeEach, describe, expect, it, vi } from 'vitest'
import { httpDashboardRepository } from './http-dashboard-repository'

const mocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock('@/lib/api-client', () => ({ apiClient: { get: mocks.get } }))

describe('HTTP dashboard repository', () => {
  beforeEach(() => mocks.get.mockReset())

  it('mengirim filter site dan membuka envelope data API', async () => {
    const overview = {
      generatedAt: '2026-09-08T08:00:00.000Z',
      businessDate: '2026-09-08',
      selectedSite: 'JEPARA',
      availableSites: [{ code: 'JEPARA', name: 'Jepara' }],
      capabilities: {
        employees: true,
        attendance: true,
        production: true,
        recruitment: false,
      },
      kpis: {
        activeEmployees: 10,
        presentToday: 8,
        eligibleToday: 10,
        attendanceAttention: 1,
        productionTransactions: 12,
      },
      attendanceTrend: [],
      productionByJob: [],
      sites: [],
      recruitment: null,
      priorities: [],
      activities: [],
    }
    mocks.get.mockResolvedValue({ status: 200, data: { data: overview } })
    const signal = new AbortController().signal

    const result = await httpDashboardRepository.getOverview({
      site: 'JEPARA',
      signal,
    })

    expect(result).toEqual(overview)
    expect(mocks.get).toHaveBeenCalledWith('/dashboard/overview', {
      params: { site: 'JEPARA' },
      signal,
    })
  })
})
