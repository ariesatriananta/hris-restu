import { apiClient } from '@/lib/api-client'
import type {
  ChangeMyPasswordInput,
  UpdateMyProfileInput,
  UserProfile,
} from './domain'

export async function getMyProfile() {
  const { data } = await apiClient.get<UserProfile>('/auth/profile')
  return data
}

export async function updateMyProfile(input: UpdateMyProfileInput) {
  const { data } = await apiClient.patch<{ updated: true }>(
    '/auth/profile',
    input
  )
  return data
}

export async function changeMyPassword(input: ChangeMyPasswordInput) {
  await apiClient.patch('/auth/profile/password', input)
}
