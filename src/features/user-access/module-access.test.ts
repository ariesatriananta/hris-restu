import { describe, expect, it } from 'vitest'
import type { AccessManagementMeta, UserInput } from './domain'
import {
  changeUserRole,
  changeUserSites,
  moduleAccessError,
} from './module-access'

const meta: AccessManagementMeta = {
  sites: [],
  permissions: [],
  roles: ['QC', 'HR_OFFICER', 'SITE_SUPERVISOR'].map((code) => ({
    uid: code,
    code,
    name: code,
    isActive: true,
    isSystem: true,
  })),
  productionModules: [
    {
      uid: 'kl1',
      code: 'KL1',
      name: 'Linting',
      siteUid: 'kl',
      siteCode: 'KLATEN',
      isActive: true,
    },
    {
      uid: 'sm1',
      code: 'SM1',
      name: 'Linting',
      siteUid: 'sm',
      siteCode: 'SEMARANG',
      isActive: true,
    },
    {
      uid: 'old',
      code: 'OLD',
      name: 'Lama',
      siteUid: 'kl',
      siteCode: 'KLATEN',
      isActive: false,
    },
  ],
}
const draft: UserInput = {
  fullName: 'QC User',
  username: 'qcuser',
  email: null,
  phone: null,
  status: 'ACTIVE',
  roleUids: ['QC'],
  siteUids: ['kl', 'sm'],
  defaultSiteUid: 'sm',
  productionModuleUids: ['kl1', 'sm1'],
}

describe('QC access selection', () => {
  it('requires one active module for every selected site', () => {
    expect(moduleAccessError(draft, meta)).toBeNull()
    expect(
      moduleAccessError({ ...draft, productionModuleUids: ['kl1'] }, meta)
    ).toContain('setiap site')
    expect(
      moduleAccessError(
        { ...draft, siteUids: [], productionModuleUids: [] },
        meta
      )
    ).toContain('setiap site')
  })
  it('rejects stale, foreign and inactive module selections', () => {
    for (const uid of ['missing', 'old', 'sm1']) {
      expect(
        moduleAccessError(
          { ...draft, siteUids: ['kl'], productionModuleUids: ['kl1', uid] },
          meta
        )
      ).toContain('di luar akses site')
    }
  })
  it('removes modules and default site when their site is unchecked', () => {
    const result = changeUserSites(draft, meta, ['kl'])
    expect(result.productionModuleUids).toEqual(['kl1'])
    expect(result.defaultSiteUid).toBeNull()
    expect(
      changeUserSites(result, meta, ['kl', 'sm']).productionModuleUids
    ).toEqual(['kl1'])
  })
  it('switching away from QC clears module scope and switching back requires selection', () => {
    const result = changeUserRole(draft, meta, 'HR_OFFICER', true)
    expect(result.roleUids).toEqual(['HR_OFFICER'])
    expect(result.productionModuleUids).toEqual([])
    const qc = changeUserRole(result, meta, 'QC', true)
    expect(qc.roleUids).toEqual(['QC'])
    expect(moduleAccessError(qc, meta)).toContain('setiap site')
  })
  it('keeps existing multi-role behavior for non-QC users', () => {
    const result = changeUserRole(
      { ...draft, roleUids: ['HR_OFFICER'], productionModuleUids: [] },
      meta,
      'SITE_SUPERVISOR',
      true
    )
    expect(result.roleUids).toEqual(['HR_OFFICER', 'SITE_SUPERVISOR'])
    expect(moduleAccessError(result, meta)).toBeNull()
  })
  it('rejects mixed QC roles even if draft bypassed the selection handler', () => {
    expect(
      moduleAccessError({ ...draft, roleUids: ['QC', 'HR_OFFICER'] }, meta)
    ).toContain('tidak dapat digabung')
  })
})
