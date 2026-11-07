import axios, {
  AxiosError,
  AxiosHeaders,
  type InternalAxiosRequestConfig,
} from 'axios'
import {
  expireSession,
  isSessionExpired,
  sessionGeneration,
} from './session-lifecycle'

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

apiClient.interceptors.request.use((config) => {
  if (isSessionExpired() && !config.url?.startsWith('/auth/')) {
    // Stale polling and queued queries must not continue hitting the server.
    throw new AxiosError(
      'Sesi telah berakhir.',
      'ERR_BAD_REQUEST',
      config,
      undefined,
      {
        config,
        status: 401,
        statusText: 'Unauthorized',
        headers: new AxiosHeaders(),
        data: { code: 'SESSION_EXPIRED' },
      }
    )
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error: {
    response?: { status?: number; data?: { code?: string } }
    config?: InternalAxiosRequestConfig
  }) => {
    const config = error.config
    const isAuthEndpoint = config?.url?.startsWith('/auth/')
    if (
      error.response?.status !== 401 ||
      error.response?.data?.code === 'DEVICE_SESSION_INVALID' ||
      !config ||
      config._retriedAfterRefresh ||
      config.skipSessionRefresh ||
      isAuthEndpoint
    ) {
      if (
        error.response?.status === 401 &&
        config?._retriedAfterRefresh &&
        error.response?.data?.code !== 'DEVICE_SESSION_INVALID'
      )
        expireSession()
      return Promise.reject(error)
    }
    if (isSessionExpired()) return Promise.reject(error)
    const generation = sessionGeneration()
    try {
      refreshPromise ??= apiClient
        .post('/auth/refresh', undefined, {
          skipSessionRefresh: true,
          timeout: 15_000,
        } as InternalAxiosRequestConfig)
        .then(() => undefined)
        .finally(() => {
          refreshPromise = undefined
        })
      await refreshPromise
      if (isSessionExpired() || generation !== sessionGeneration())
        return Promise.reject(error)
      config._retriedAfterRefresh = true
      return apiClient(config)
    } catch (refreshError) {
      if (
        axios.isAxiosError(refreshError) &&
        [401, 403].includes(refreshError.response?.status ?? 0)
      ) {
        expireSession()
        return Promise.reject(error)
      }
      // A timeout or service outage does not prove that the login is invalid.
      return Promise.reject(refreshError)
    }
  }
)
