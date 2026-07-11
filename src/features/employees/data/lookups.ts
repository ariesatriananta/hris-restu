import type { LookupOption } from '../domain'

export const sites: LookupOption[] = [
  { uid: 'site-jepara', code: 'JEPARA', name: 'Site Jepara' },
  { uid: 'site-semarang', code: 'SEMARANG', name: 'Site Semarang' },
  { uid: 'site-klaten', code: 'KLATEN', name: 'Site Klaten' },
]
export const departments: LookupOption[] = [
  { uid: 'dept-prod', code: 'PROD', name: 'Produksi' },
  { uid: 'dept-ops', code: 'OPS', name: 'Operasional' },
  { uid: 'dept-hr', code: 'HR', name: 'HR' },
  { uid: 'dept-qc', code: 'QC', name: 'Quality Control' },
]
export const positions: LookupOption[] = [
  { uid: 'pos-operator', code: 'OPERATOR', name: 'Operator Produksi' },
  { uid: 'pos-pack', code: 'PACK', name: 'Operator Pengemasan' },
  { uid: 'pos-qc', code: 'QC', name: 'Quality Control' },
  { uid: 'pos-supervisor', code: 'SUP', name: 'Supervisor Produksi' },
  { uid: 'pos-admin-hr', code: 'ADMIN_HR', name: 'Admin HR' },
]
export const workGroups: LookupOption[] = [
  { uid: 'group-a', code: 'A', name: 'Kelompok A' },
  { uid: 'group-b', code: 'B', name: 'Kelompok B' },
  { uid: 'group-qc', code: 'QC', name: 'Kelompok QC' },
]
