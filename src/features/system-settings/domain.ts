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

export type CompanyLogo = {
  uid: string
  originalName: string
  mimeType: string
  sizeBytes: number
  url: string
}

export type CompanyProfileSettings = {
  companyName: string
  legalAddress: string
  phone: string
  email: string
  website: string
  taxNumber: string
  logo: CompanyLogo | null
  configured: boolean
  updatedAt: string | null
}

export type UpdateCompanyProfileInput = Pick<
  CompanyProfileSettings,
  'companyName' | 'legalAddress' | 'phone' | 'email' | 'website' | 'taxNumber'
> & { logoFileUid: string | null }

export type AttendanceSystemSettings = {
  effective: {
    goLiveDate: string
    timezone: string
    finalizationGraceMinutes: number
    productionRequiresPresence: boolean
    productionIntegrationStatus: 'PLANNED'
  }
  sources: {
    goLiveDate: 'ENVIRONMENT'
    timezone: 'APPLICATION_POLICY'
    finalizationGraceMinutes: 'FIXED_POLICY'
    productionRequiresPresence: 'SYSTEM_SETTING'
  }
  updatedAt: string | null
}
