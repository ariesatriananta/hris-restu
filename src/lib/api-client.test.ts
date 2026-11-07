import { AxiosError, AxiosHeaders, type AxiosAdapter } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './api-client'
import {
  expireSession,
  isSessionExpired,
  startSession,
} from './session-lifecycle'

const originalAdapter = apiClient.defaults.adapter
beforeEach(() => startSession())
afterEach(() => {
  apiClient.defaults.adapter = originalAdapter
})

describe('API session refresh', () => {
  it('expires a session when its single replay is still 401 and recovers after a new login', async () => {
    let refreshCount = 0
    let loggedIn = false
    apiClient.defaults.adapter = async (config) => {
      const response = {
        config,
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        data: {},
      }
      if (config.url === '/auth/refresh') {
        refreshCount += 1
        expect(config.timeout).toBe(15_000)
        return response
      }
      if (loggedIn) return response
      throw new AxiosError(
        'Unauthorized',
        'ERR_BAD_REQUEST',
        config,
        undefined,
        { ...response, status: 401 }
      )
    }
    await expect(apiClient.get('/one')).rejects.toMatchObject({
      response: { status: 401 },
    })
    expect(refreshCount).toBe(1)
    expect(isSessionExpired()).toBe(true)
    startSession()
    loggedIn = true
    await expect(apiClient.get('/one')).resolves.toMatchObject({ status: 200 })
  })
  it('shares one failed refresh across simultaneous 401s and stops later refresh attempts', async () => {
    let refreshCount = 0
    const calls: string[] = []
    let failRefresh!: () => void
    apiClient.defaults.adapter = async (config) => {
      calls.push(config.url!)
      if (config.url === '/auth/refresh') {
        refreshCount += 1
        await new Promise<void>((resolve) => {
          failRefresh = resolve
        })
      }
      throw new AxiosError(
        'Unauthorized',
        'ERR_BAD_REQUEST',
        config,
        undefined,
        {
          config,
          status: 401,
          statusText: 'Unauthorized',
          headers: new AxiosHeaders(),
          data: {},
        }
      )
    }
    const results = Promise.allSettled([
      apiClient.get('/one'),
      apiClient.get('/two'),
    ])
    await vi.waitFor(() => expect(refreshCount).toBe(1))
    failRefresh()
    expect(
      (await results).every((result) => result.status === 'rejected')
    ).toBe(true)
    expect(isSessionExpired()).toBe(true)
    await expect(apiClient.get('/later')).rejects.toMatchObject({
      response: { status: 401 },
    })
    expect(refreshCount).toBe(1)
    expect(calls).not.toContain('/later')
  })
  it('does not replay requests when logout occurs during refresh', async () => {
    const calls: string[] = []
    let finish!: () => void
    apiClient.defaults.adapter = async (config) => {
      calls.push(config.url!)
      if (config.url === '/auth/refresh') {
        await new Promise<void>((resolve) => {
          finish = resolve
        })
        return {
          config,
          status: 204,
          statusText: 'OK',
          headers: new AxiosHeaders(),
          data: {},
        }
      }
      throw new AxiosError(
        'Unauthorized',
        'ERR_BAD_REQUEST',
        config,
        undefined,
        {
          config,
          status: 401,
          statusText: 'Unauthorized',
          headers: new AxiosHeaders(),
          data: {},
        }
      )
    }
    const result = apiClient.get('/one').catch((error) => error)
    await vi.waitFor(() => expect(calls).toContain('/auth/refresh'))
    expireSession()
    finish()
    expect((await result).response.status).toBe(401)
    expect(calls).toEqual(['/one', '/auth/refresh'])
  })
  it('preserves service failures instead of reporting a false expired session', async () => {
    apiClient.defaults.adapter = async (config) => {
      const status = config.url === '/auth/refresh' ? 503 : 401
      throw new AxiosError(
        'Service error',
        'ERR_BAD_RESPONSE',
        config,
        undefined,
        {
          config,
          status,
          statusText: 'error',
          headers: new AxiosHeaders(),
          data: {},
        }
      )
    }
    await expect(apiClient.get('/one')).rejects.toMatchObject({
      response: { status: 503 },
    })
    expect(isSessionExpired()).toBe(false)
  })
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
