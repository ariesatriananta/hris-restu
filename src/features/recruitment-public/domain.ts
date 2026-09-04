export type RecruitmentPublicConfig = {
  company: { name: string; logoUrl: string | null }
  site: { uid: string; code: string; name: string }
  privacyNoticeVersion: string
  turnstileSiteKey: string | null
  limits: { imageTypes: string[]; maxImageBytes: number }
}

export type RecruitmentIdentity = {
  nationalIdNumber: string
  familyCardNumber: string
  birthDate: string
}

export type RecruitmentEligibility = {
  canSubmit: boolean
  message: string
  priorRejectedApplication: {
    submittedDate: string
    reason: string
  } | null
}

export type RecruitmentFormValues = RecruitmentIdentity & {
  fullName: string
  gender: 'MALE' | 'FEMALE' | ''
  birthPlace: string
  address: string
  phone: string
  email: string
  privacyConsent: boolean
}

export type RecruitmentFiles = {
  photo: File | null
  ktp: File | null
  kk: File | null
}

export type RecruitmentReceipt = {
  applicationNumber: string
  message: string
}
