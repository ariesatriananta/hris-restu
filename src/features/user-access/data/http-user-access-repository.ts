import { apiClient } from '@/lib/api-client'
import type { AccessManagementRepository } from '../domain'

export const httpUserAccessRepository: AccessManagementRepository = {
  async getMeta() {
    return (await apiClient.get('/system/access-management/meta')).data
  },
  async listUsers(input) {
    const { query, site, status, role, ...pagination } = input
    return (
      await apiClient.get('/system/access-management/users', {
        params: {
          ...pagination,
          search: query,
          site: site?.join(','),
          status: status?.join(','),
          role: role?.join(','),
        },
      })
    ).data
  },
  async getUser(uid) {
    return (await apiClient.get(`/system/access-management/users/${uid}`)).data
  },
  async createUser(input) {
    return (await apiClient.post('/system/access-management/users', input)).data
  },
  async updateUser(uid, input) {
    const { initialPassword: _initialPassword, ...update } = input
    await apiClient.patch(`/system/access-management/users/${uid}`, update)
  },
  async resetPassword(uid, input) {
    await apiClient.post(
      `/system/access-management/users/${uid}/reset-password`,
      input
    )
  },
  async listRoles() {
    return (await apiClient.get('/system/access-management/roles')).data
  },
  async getRole(uid) {
    return (await apiClient.get(`/system/access-management/roles/${uid}`)).data
  },
  async updateRole(uid, input) {
    await apiClient.patch(`/system/access-management/roles/${uid}`, input)
  },
}
