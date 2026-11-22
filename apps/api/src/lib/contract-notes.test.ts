import { expect, it } from 'vitest'
import { contractNotesForDisplay, legacyContractImportNote, operationalContractImportNote } from './contract-notes.js'

it('replaces only the exact legacy technical note and preserves operational notes', () => {
  expect(contractNotesForDisplay(legacyContractImportNote)).toBe(operationalContractImportNote)
  expect(contractNotesForDisplay('Catatan dari HR')).toBe('Catatan dari HR')
  expect(contractNotesForDisplay(null)).toBeNull()
  expect(contractNotesForDisplay(undefined)).toBeUndefined()
})
