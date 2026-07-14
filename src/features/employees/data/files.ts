import { apiClient } from '@/lib/api-client'
import type { MockFileAttachment } from '../domain'

export async function uploadEmployeeFile(
  file: File,
  employeeKey?: string
): Promise<MockFileAttachment> {
  const body = new FormData()
  body.append('file', file)
  if (employeeKey) body.append('employeeKey', employeeKey)
  const { data } = await apiClient.post<MockFileAttachment>('/files', body)
  return data
}
