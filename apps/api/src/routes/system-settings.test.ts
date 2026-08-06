import { describe, expect, it } from 'vitest'
import { contractSettingsInput } from '../lib/contract-settings.js'

const validTarget = {
  siteCode: 'JEPARA',
  sectionCode: 'LINTING',
  value: 450,
  unit: 'batang per-jam kerja',
}

describe('contractSettingsInput', () => {
  it('menerima perubahan pihak pertama dan beberapa target', () => {
    const result = contractSettingsInput.parse({
      firstParty: {
        companyName: 'PT Restu Sejati Inti Abadi',
        directorName: 'Budi Wicaksono Yuwono',
        directorTitle: 'Direktur',
        headOfficeAddress: 'Semarang',
      },
      targets: [
        validTarget,
        { ...validTarget, siteCode: 'KLATEN', value: 500 },
      ],
    })

    expect(result.targets).toHaveLength(2)
  })

  it.each([0, -1])('menolak target tidak positif: %s', (value) => {
    expect(() =>
      contractSettingsInput.parse({
        targets: [{ ...validTarget, value }],
      })
    ).toThrow()
  })

  it('menolak satuan kosong dan target duplikat', () => {
    expect(() =>
      contractSettingsInput.parse({
        targets: [validTarget, { ...validTarget, unit: '   ' }],
      })
    ).toThrow()
  })

  it('menolak payload tanpa perubahan', () => {
    expect(() => contractSettingsInput.parse({ targets: [] })).toThrow()
  })
})
