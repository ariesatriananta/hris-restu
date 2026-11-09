import type { AuthContext } from '../middleware/authenticate.js'

export const QC_PERMISSIONS = [
  'production.view',
  'production.scan',
  'production.correct',
]
export const isQc = (auth: AuthContext) =>
  auth.roles.includes('QC') && !auth.roles.includes('SUPER_ADMIN')

/** expression is a trusted server SQL expression holding a production module id. */
export function productionModuleScope(auth: AuthContext, expression: string) {
  if (!isQc(auth)) return { clause: '1=1', params: [] as string[] }
  const modules = [...new Set(auth.productionModuleAccess ?? [])]
  if (!modules.length) return { clause: '1=0', params: [] as string[] }
  return {
    clause: `EXISTS(SELECT 1 FROM production_modules access_pm WHERE access_pm.id=${expression} AND access_pm.uid IN (${modules.map(() => '?').join(',')}))`,
    params: modules,
  }
}
