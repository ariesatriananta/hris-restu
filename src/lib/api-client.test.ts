import { AxiosError, AxiosHeaders, type AxiosAdapter } from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import { apiClient } from './api-client'

const originalAdapter = apiClient.defaults.adapter
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter
})

describe('API session refresh', () => {
  it.each([
    ['DEVICE_SESSION_INVALID', false],
    [undefined, true],
  ])(
    'refreshes login only, not an invalid device: %s',
    async (code, refreshExpected) => {
      const calls: string[] = []
      const adapter: AxiosAdapter = async (config) => {
        calls.push(config.url ?? '')
        const response = {
          config,
          status: 200,
          statusText: 'OK',
          headers: new AxiosHeaders(),
          data: {},
        }
        if (config.url === '/auth/refresh' || config._retriedAfterRefresh)
          return response
        throw new AxiosError(
          'Unauthorized',
          'ERR_BAD_REQUEST',
          config,
          undefined,
          {
            ...response,
            status: 401,
            data: { code },
          }
        )
      }
      apiClient.defaults.adapter = adapter
      if (refreshExpected)
        await expect(apiClient.get('/terminal-test')).resolves.toMatchObject({
          status: 200,
        })
      else
        await expect(apiClient.get('/terminal-test')).rejects.toMatchObject({
          response: { status: 401 },
        })
      expect(calls).toEqual(
        refreshExpected
          ? ['/terminal-test', '/auth/refresh', '/terminal-test']
          : ['/terminal-test']
      )
    }
  )
})
