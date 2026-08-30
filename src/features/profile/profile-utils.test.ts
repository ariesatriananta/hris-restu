import { describe, expect, it } from 'vitest'
import { getSiteName, getUserInitials } from './profile-utils'

describe('profile utils', () => {
  it('membuat inisial dari nama pengguna', () => {
    expect(getUserInitials('Administrator HRIS')).toBe('AH')
    expect(getUserInitials('  Budi  Wicaksono Yuwono ')).toBe('BW')
    expect(getUserInitials('')).toBe('U')
  })

  it('mengubah kode site menjadi nama yang mudah dibaca', () => {
    expect(getSiteName('JEPARA')).toBe('Jepara')
    expect(getSiteName('SEMARANG')).toBe('Semarang')
    expect(getSiteName('KLATEN')).toBe('Klaten')
  })
})
