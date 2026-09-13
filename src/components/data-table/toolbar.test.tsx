import type { Table } from '@tanstack/react-table'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useAuthStore } from '@/stores/auth-store'
import { DataTableToolbar } from './toolbar'

function tableStub(setFilterValue: (value: unknown) => void) {
  return {
    getState: () => ({ columnFilters: [], globalFilter: '' }),
    getColumn: (id: string) =>
      id === 'site'
        ? {
            getFilterValue: () => undefined,
            setFilterValue,
            getFacetedUniqueValues: () => new Map(),
          }
        : undefined,
    setGlobalFilter: vi.fn(),
    resetColumnFilters: vi.fn(),
  } as unknown as Table<Record<string, unknown>>
}

describe('DataTableToolbar site scope', () => {
  beforeEach(() => {
    useAuthStore.setState({
      session: {
        user: {
          uid: '11111111-1111-4111-8111-111111111111',
          name: 'HR Jepara',
          email: null,
          role: 'HR_OFFICER',
          roleLabel: 'HR Officer',
          roles: ['HR_OFFICER'],
          siteAccess: ['JEPARA'],
          mustChangePassword: false,
        },
        permissions: ['attendance.view'],
        expiresAt: Date.now() + 60_000,
      },
    })
  })

  afterEach(() => useAuthStore.setState({ session: null }))

  it('menampilkan label terkunci dan menerapkan site akses tunggal', async () => {
    const setFilterValue = vi.fn()
    const screen = await render(
      <DataTableToolbar
        table={tableStub(setFilterValue)}
        showViewOptions={false}
        filters={[
          {
            columnId: 'site',
            title: 'Site',
            options: [{ value: 'JEPARA', label: 'Pabrik Jepara' }],
          },
        ]}
      />
    )

    await expect
      .element(screen.getByLabelText('Site terkunci: Pabrik Jepara'))
      .toBeInTheDocument()
    expect(setFilterValue).toHaveBeenCalledWith(['JEPARA'])
  })

  it('menghormati pengecualian filter Akses Site', async () => {
    const setFilterValue = vi.fn()
    const screen = await render(
      <DataTableToolbar
        table={tableStub(setFilterValue)}
        showViewOptions={false}
        filters={[
          {
            columnId: 'site',
            title: 'Site',
            lockToSiteAccess: false,
            options: [{ value: 'JEPARA', label: 'Pabrik Jepara' }],
          },
        ]}
      />
    )

    await expect
      .element(screen.getByRole('button', { name: /Site/ }))
      .toBeInTheDocument()
    expect(setFilterValue).not.toHaveBeenCalled()
  })
})
