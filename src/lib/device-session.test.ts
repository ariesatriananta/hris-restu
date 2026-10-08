import { describe, expect, it } from 'vitest'
import { isDeviceSessionInvalid } from './device-session'

describe('persistent scanner activation', () => {
  it.each([
    [401, undefined, false],
    [403, undefined, false],
    [403, 'PASSWORD_CHANGE_REQUIRED', false],
    [500, undefined, false],
    [401, 'DEVICE_SESSION_INVALID', true],
    [403, 'DEVICE_SESSION_INVALID', false],
  ])(
    'only removes activation on explicit device 401: %s %s',
    (status, code, expected) => {
      expect(
        isDeviceSessionInvalid({
          isAxiosError: true,
          response: { status, data: { code } },
        })
      ).toBe(expected)
    }
  )
  it('retains activation on network errors and legacy responses', () => {
    expect(isDeviceSessionInvalid(new Error('Offline'))).toBe(false)
    expect(
      isDeviceSessionInvalid({ isAxiosError: true, response: { status: 401 } })
    ).toBe(false)
  })
})
