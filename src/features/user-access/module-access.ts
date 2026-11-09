import type { AccessManagementMeta, UserInput } from './domain'

export function isQcRole(draft: UserInput, meta: AccessManagementMeta) {
  return meta.roles.some(
    (role) => role.code === 'QC' && draft.roleUids.includes(role.uid)
  )
}

export function changeUserRole(
  draft: UserInput,
  meta: AccessManagementMeta,
  roleUid: string,
  checked: boolean
): UserInput {
  const role = meta.roles.find((item) => item.uid === roleUid)
  const qcUid = meta.roles.find((item) => item.code === 'QC')?.uid
  const roleUids = checked
    ? role?.code === 'QC'
      ? [roleUid]
      : [
          ...new Set([
            ...draft.roleUids.filter((uid) => uid !== qcUid),
            roleUid,
          ]),
        ]
    : draft.roleUids.filter((uid) => uid !== roleUid)
  const next = { ...draft, roleUids }
  return {
    ...next,
    productionModuleUids: isQcRole(next, meta)
      ? (draft.productionModuleUids ?? [])
      : [],
  }
}

export function changeUserSites(
  draft: UserInput,
  meta: AccessManagementMeta,
  siteUids: string[]
): UserInput {
  const allowedModules = new Set(
    (meta.productionModules ?? [])
      .filter((module) => siteUids.includes(module.siteUid))
      .map((module) => module.uid)
  )
  return {
    ...draft,
    siteUids,
    defaultSiteUid: siteUids.includes(draft.defaultSiteUid ?? '')
      ? draft.defaultSiteUid
      : null,
    productionModuleUids: (draft.productionModuleUids ?? []).filter((uid) =>
      allowedModules.has(uid)
    ),
  }
}

export function moduleAccessError(
  draft: UserInput,
  meta: AccessManagementMeta
) {
  if (!isQcRole(draft, meta)) return null
  if (draft.roleUids.length !== 1)
    return 'Peran QC tidak dapat digabung dengan peran lain.'
  const selected = draft.productionModuleUids ?? []
  const modules = meta.productionModules ?? []
  if (
    selected.some(
      (uid) =>
        !modules.some(
          (module) =>
            module.uid === uid &&
            module.isActive &&
            draft.siteUids.includes(module.siteUid)
        )
    )
  ) {
    return 'Hapus modul nonaktif atau modul di luar akses site sebelum menyimpan.'
  }
  if (
    !draft.siteUids.length ||
    draft.siteUids.some(
      (siteUid) =>
        !modules.some(
          (module) =>
            module.siteUid === siteUid &&
            module.isActive &&
            selected.includes(module.uid)
        )
    )
  ) {
    return 'Pilih minimal satu modul produksi aktif untuk setiap site QC.'
  }
  return null
}
