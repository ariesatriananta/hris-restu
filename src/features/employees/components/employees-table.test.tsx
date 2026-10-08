import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import type { EmployeeLookups } from '../data/queries'
import { EmployeesTable } from './employees-table'

const jeparaModule = '00000000-0000-4000-8000-000000000011'
const klatenModule = '00000000-0000-4000-8000-000000000012'
const section = '00000000-0000-4000-8000-000000000021'
const lookups: EmployeeLookups = {
  sites: [],
  departments: [],
  positions: [],
  workGroups: [],
  contractTypes: [],
  productionModules: [
    {
      uid: jeparaModule,
      code: 'MOD-J',
      name: 'Modul Jepara',
      siteCode: 'JEPARA',
    },
    {
      uid: klatenModule,
      code: 'MOD-K',
      name: 'Modul Klaten',
      siteCode: 'KLATEN',
    },
  ],
  productionModuleSections: [
    {
      uid: 'mapping-j',
      moduleUid: jeparaModule,
      sectionUid: section,
      sectionCode: 'LINTING',
      sectionName: 'Linting',
      siteCode: 'JEPARA',
    },
    {
      uid: 'mapping-k',
      moduleUid: klatenModule,
      sectionUid: section,
      sectionCode: 'LINTING',
      sectionName: 'Linting',
      siteCode: 'KLATEN',
    },
  ],
}
const columns = ['site', 'employeeType', 'employeeStatus'].map((id) => ({
  id,
  header: id,
}))

function Harness({
  initialSearch,
  onNavigate,
}: {
  initialSearch: Record<string, unknown>
  onNavigate: (search: Record<string, unknown>) => void
}) {
  const [search, setSearch] = useState(initialSearch)
  const navigate: NavigateFn = (options) => {
    const next =
      typeof options.search === 'function'
        ? options.search(search)
        : options.search
    if (next === true) return
    onNavigate(next)
    setSearch(next)
  }
  return (
    <EmployeesTable
      data={{ items: [], total: 0, page: 1, pageSize: 50 }}
      columns={columns}
      search={search}
      navigate={navigate}
      onEdit={() => {}}
      lookups={lookups}
    />
  )
}

describe('EmployeesTable production filters', () => {
  it('opsi Modul mengikuti Site dan Bagian dideduplikasi; pilihan tersimpan di URL', async () => {
    const onNavigate = vi.fn()
    const screen = await render(
      <Harness
        initialSearch={{ site: ['JEPARA'], page: 3 }}
        onNavigate={onNavigate}
      />
    )
    await screen
      .getByRole('button', { name: 'Modul Produksi', exact: true })
      .click()
    await expect
      .element(screen.getByRole('option', { name: 'Modul Jepara' }))
      .toBeInTheDocument()
    await expect
      .element(screen.getByRole('option', { name: 'Modul Klaten' }))
      .not.toBeInTheDocument()
    await screen.getByRole('option', { name: 'Modul Jepara' }).click()
    expect(onNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        productionModule: [jeparaModule],
        page: undefined,
      })
    )
    await screen.getByRole('button', { name: /Modul Produksi/ }).click()
    await screen
      .getByRole('button', { name: 'Bagian Produksi', exact: true })
      .click()
    await screen.getByRole('option', { name: 'Linting', exact: true }).click()
    expect(onNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        productionModule: [jeparaModule],
        productionSection: [section],
      })
    )
  })

  it('perubahan Site membersihkan Modul yang tidak cocok dan mempertahankan filter lain', async () => {
    const onNavigate = vi.fn()
    const screen = await render(
      <Harness
        initialSearch={{
          site: ['JEPARA'],
          productionModule: [jeparaModule],
          productionSection: [section],
          employeeType: ['BORONGAN'],
          filter: 'kata',
          page: 4,
        }}
        onNavigate={onNavigate}
      />
    )
    await screen.getByRole('button', { name: /^Site/ }).click()
    await screen.getByRole('option', { name: 'Jepara', exact: true }).click()
    await screen.getByRole('option', { name: 'Klaten', exact: true }).click()
    expect(onNavigate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        site: ['KLATEN'],
        productionModule: undefined,
        productionSection: [section],
        employeeType: ['BORONGAN'],
        filter: 'kata',
        page: undefined,
      })
    )
  })
})
