import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useKpiVisibility } from '@/hooks/use-kpi-visibility'
import { KpiVisibilityMenu } from './kpi-visibility-menu'

const pageKeys = [
  'attendance-monitoring',
  'attendance-recap-summary',
  'employees-list',
  'recruitment',
  'contracts-list',
  'payroll-periods',
  'payroll-simulation',
  'payroll-history',
  'payroll-payslips',
]
const storageKey = (page: string) => `hris-rsia-${page}-kpi-visible-v1`
function Page({ page }: { page: string }) {
  const { showKpi, setShowKpi } = useKpiVisibility(page)
  return (
    <>
      <KpiVisibilityMenu showKpi={showKpi} onCheckedChange={setShowKpi} />
      {showKpi && <p>Ringkasan KPI</p>}
    </>
  )
}
beforeEach(() => {
  vi.restoreAllMocks()
  for (const page of pageKeys) localStorage.removeItem(storageKey(page))
})
describe('preferensi KPI per halaman', () => {
  it.each(pageKeys)(
    'menyimpan show/hide %s setelah remount tanpa mengubah halaman lain',
    async (page) => {
      const first = await render(<Page page={page} />)
      await expect.element(first.getByText('Ringkasan KPI')).toBeInTheDocument()
      await first.getByRole('button', { name: 'Opsi tampilan' }).click()
      await first
        .getByRole('menuitemcheckbox', { name: 'Tampilkan KPI' })
        .click()
      await expect
        .element(first.getByText('Ringkasan KPI'))
        .not.toBeInTheDocument()
      expect(localStorage.getItem(storageKey(page))).toBe('false')
      for (const other of pageKeys.filter((value) => value !== page))
        expect(localStorage.getItem(storageKey(other))).toBeNull()
      await first.unmount()
      const second = await render(<Page page={page} />)
      await expect
        .element(second.getByText('Ringkasan KPI'))
        .not.toBeInTheDocument()
      await second.getByRole('button', { name: 'Opsi tampilan' }).click()
      await second
        .getByRole('menuitemcheckbox', { name: 'Tampilkan KPI' })
        .click()
      await expect
        .element(second.getByText('Ringkasan KPI'))
        .toBeInTheDocument()
      expect(localStorage.getItem(storageKey(page))).toBe('true')
    }
  )
  it('tetap dapat diubah ketika storage diblokir', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    const screen = await render(<Page page='employees-list' />)
    await expect.element(screen.getByText('Ringkasan KPI')).toBeInTheDocument()
    await screen.getByRole('button', { name: 'Opsi tampilan' }).click()
    await screen
      .getByRole('menuitemcheckbox', { name: 'Tampilkan KPI' })
      .click()
    await expect
      .element(screen.getByText('Ringkasan KPI'))
      .not.toBeInTheDocument()
  })
})
