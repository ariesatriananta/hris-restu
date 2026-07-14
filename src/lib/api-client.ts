import axios, { type InternalAxiosRequestConfig } from 'axios'

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    _retriedAfterRefresh?: boolean
    skipSessionRefresh?: boolean
  }
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001/api',
  withCredentials: true,
})

let refreshPromise: Promise<void> | undefined

apiClient.interceptors.response.use(
  (response) => response,
  async (error: {
    response?: { status?: number }
    config?: InternalAxiosRequestConfig
  }) => {
    const config = error.config
    const isAuthEndpoint = config?.url?.startsWith('/auth/')
    if (
      error.response?.status !== 401 ||
      !config ||
      config._retriedAfterRefresh ||
      config.skipSessionRefresh ||
      isAuthEndpoint
    ) {
      return Promise.reject(error)
    }
    try {
      refreshPromise ??= apiClient
        .post('/auth/refresh', undefined, {
          skipSessionRefresh: true,
        } as InternalAxiosRequestConfig)
        .then(() => undefined)
        .finally(() => {
          refreshPromise = undefined
        })
      await refreshPromise
      config._retriedAfterRefresh = true
      return apiClient(config)
    } catch {
      return Promise.reject(error)
    }
  }
)
