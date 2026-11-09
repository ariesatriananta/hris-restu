import { describe, expect, it } from 'vitest'
import type { AuthContext } from '../middleware/authenticate.js'
import { isQc, productionModuleScope } from './production-module-access.js'

const auth: AuthContext = {
  id: 1,
  uid: 'qc',
  name: 'QC',
  email: null,
  roles: ['QC'],
  permissions: [],
  siteAccess: ['KLATEN'],
}
describe('QC production module scope', () => {
  it('fails closed without selected modules including legacy sessions', () => {
    expect(productionModuleScope(auth, 'pt.production_module_id')).toEqual({
      clause: '1=0',
      params: [],
    })
  })
  it('uses frozen transaction module id and deduplicated bound public UIDs', () => {
    const scope = productionModuleScope(
      { ...auth, productionModuleAccess: ['m1', 'm1', 'm2'] },
      'pt.production_module_id'
    )
    expect(scope.clause).toContain('access_pm.id=pt.production_module_id')
    expect(scope.clause).toContain('IN (?,?)')
    expect(scope.params).toEqual(['m1', 'm2'])
  })
  it('preserves existing roles and Super Admin access', () => {
    expect(isQc({ ...auth, roles: ['SUPER_ADMIN', 'QC'] })).toBe(false)
    expect(
      productionModuleScope({ ...auth, roles: ['PRODUCTION_ADMIN'] }, 'pm.id')
    ).toEqual({ clause: '1=1', params: [] })
  })
})
