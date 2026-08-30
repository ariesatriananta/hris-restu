export interface UserProfile {
  uid: string
  fullName: string
  username: string
  email: string | null
  phone: string | null
  status: string
  lastLoginAt: string | null
  roles: Array<{ code: string; name: string }>
  siteAccess: Array<{ code: string; name: string }>
}

export interface UpdateMyProfileInput {
  fullName: string
  username: string
  email: string | null
  phone: string | null
}

export interface ChangeMyPasswordInput {
  currentPassword: string
  newPassword: string
}
