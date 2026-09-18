import { describe, expect, it } from 'vitest'
import { shouldShowAppLogo } from './app-branding'

describe('SHOW_APP_LOGO', () => {
  it('menampilkan logo secara default', () => {
    expect(shouldShowAppLogo(undefined)).toBe(true)
    expect(shouldShowAppLogo('')).toBe(true)
  })

  it('menyembunyikan logo saat env false', () => {
    expect(shouldShowAppLogo('false')).toBe(false)
    expect(shouldShowAppLogo(' FALSE ')).toBe(false)
  })
})
