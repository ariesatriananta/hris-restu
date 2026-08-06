export type SystemSettingsTab =
  | 'kontrak'
  | 'profil-perusahaan'
  | 'attendance'
  | 'payroll'
  | 'notifikasi-integrasi'

export type ContractFirstPartySettings = {
  companyName: string
  directorName: string
  directorTitle: string
  headOfficeAddress: string
  configured: boolean
  updatedAt: string | null
}

export type ContractTargetSettings = {
  siteCode: string
  siteName: string
  sectionCode: string
  sectionName: string
  moduleNames: string[]
  value: number | null
  unit: string
  configured: boolean
  updatedAt: string | null
}

export type ContractSettings = {
  firstParty: ContractFirstPartySettings
  targets: ContractTargetSettings[]
}

export type UpdateContractSettingsInput = {
  firstParty?: Omit<ContractFirstPartySettings, 'configured' | 'updatedAt'>
  targets: Array<
    Pick<
      ContractTargetSettings,
      'siteCode' | 'sectionCode' | 'value' | 'unit'
    > & { value: number }
  >
}
