import '@/styles/index.css'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import type { AccessManagementMeta, ManagedUser } from './domain'
import { UserFormDialog } from './user-access-page'

const { update } = vi.hoisted(() => ({ update: vi.fn() }))
vi.mock('@/features/user-access/data/queries', () => ({
  useAccessMeta: vi.fn(),
  useManagedRole: vi.fn(),
  useManagedRoles: vi.fn(),
  useManagedUser: vi.fn(),
  useManagedUsers: vi.fn(),
  useResetManagedUserPassword: vi.fn(),
  useUpdateManagedRole: vi.fn(),
  useCreateManagedUser: () => ({ isPending: false, mutate: vi.fn() }),
  useUpdateManagedUser: () => ({ isPending: false, mutate: update }),
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ session: null }),
}))

const meta: AccessManagementMeta = {
  sites: [
    { uid: 'kl', code: 'KLATEN', name: 'Klaten' },
    { uid: 'sm', code: 'SEMARANG', name: 'Semarang' },
  ],
  roles: [
    { uid: 'qc', code: 'QC', name: 'QC', isActive: true, isSystem: true },
    {
      uid: 'hr',
      code: 'HR_OFFICER',
      name: 'HR Officer',
      isActive: true,
      isSystem: true,
    },
  ],
  permissions: [],
  productionModules: [
    {
      uid: 'kl1',
      code: 'KL1',
      name: 'Linting Klaten',
      siteUid: 'kl',
      siteCode: 'KLATEN',
      isActive: true,
    },
    {
      uid: 'sm1',
      code: 'SM1',
      name: 'Linting Semarang',
      siteUid: 'sm',
      siteCode: 'SEMARANG',
      isActive: true,
    },
  ],
}
const user: ManagedUser = {
  uid: 'user',
  fullName: 'Operator QC',
  username: 'qcuser',
  email: null,
  phone: null,
  status: 'ACTIVE',
  mustChangePassword: false,
  failedLoginAttempts: 0,
  lockedUntil: null,
  lastLoginAt: null,
  createdAt: '',
  updatedAt: '',
  roles: [meta.roles[0]],
  siteAccess: [{ ...meta.sites[0], isDefault: true }],
  productionModuleAccess: [meta.productionModules![0]],
}

beforeEach(() => vi.clearAllMocks())

describe('QC module access form', () => {
  it('requires a module for each added site and submits the selected scope', async () => {
    const screen = await render(
      <UserFormDialog open onOpenChange={vi.fn()} meta={meta} user={user} />
    )
    await expect
      .element(screen.getByRole('button', { name: 'Simpan perubahan' }))
      .toBeEnabled()
    await screen
      .getByRole('checkbox', { name: 'Semarang SEMARANG', exact: true })
      .click()
    await expect
      .element(screen.getByRole('button', { name: 'Simpan perubahan' }))
      .toBeDisabled()
    await screen
      .getByRole('checkbox', { name: 'Linting Semarang SM1', exact: true })
      .click()
    await screen.getByRole('button', { name: 'Simpan perubahan' }).click()
    expect(update.mock.calls[0][0].input.productionModuleUids).toEqual([
      'kl1',
      'sm1',
    ])
  })
  it('clears a deselected site module instead of restoring it on re-selection', async () => {
    const screen = await render(
      <UserFormDialog open onOpenChange={vi.fn()} meta={meta} user={user} />
    )
    await screen
      .getByRole('checkbox', { name: 'Klaten KLATEN', exact: true })
      .click()
    await screen
      .getByRole('checkbox', { name: 'Klaten KLATEN', exact: true })
      .click()
    await expect
      .element(
        screen.getByRole('checkbox', {
          name: 'Linting Klaten KL1',
          exact: true,
        })
      )
      .not.toBeChecked()
    await expect
      .element(screen.getByRole('button', { name: 'Simpan perubahan' }))
      .toBeDisabled()
  })
  it('changing to a non-QC role removes the module fields and stale scope', async () => {
    const screen = await render(
      <UserFormDialog open onOpenChange={vi.fn()} meta={meta} user={user} />
    )
    await screen
      .getByRole('checkbox', { name: 'HR Officer HR_OFFICER', exact: true })
      .click()
    await expect
      .element(screen.getByRole('checkbox', { name: 'QC QC', exact: true }))
      .not.toBeChecked()
    await screen.getByRole('button', { name: 'Simpan perubahan' }).click()
    expect(update.mock.calls[0][0].input.productionModuleUids).toEqual([])
    expect(update.mock.calls[0][0].input.roleUids).toEqual(['hr'])
  })
})
