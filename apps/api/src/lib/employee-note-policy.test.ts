import { describe, expect, it } from 'vitest'
import { employeeNoteInput, employeeNotesForDisplay, isLegacyImport, klatenLegacySourceHash } from './employee-archive-policy.js'

const importedNotes = (operationalNotes?: string | null) => JSON.stringify({
  legacyImport: { sourceHash: klatenLegacySourceHash, sourceRow: 42, raw: { '12:STATUS (Aktif/Tidak Aktif)': 'Tidak Aktif' } },
  ...(operationalNotes === undefined ? {} : { operationalNotes }),
})

describe('employee notes and protected import provenance', () => {
  it('shows normal HR notes unchanged', () => {
    expect(employeeNotesForDisplay('Catatan operasional HR.')).toBe('Catatan operasional HR.')
    expect(employeeNoteInput('Catatan operasional HR.')).toBe('Catatan operasional HR.')
  })

  it('does not show raw spreadsheet/import metadata to an employee form', () => {
    expect(employeeNotesForDisplay(importedNotes())).toBeNull()
    expect(employeeNotesForDisplay(importedNotes(null))).toBeNull()
  })

  it('shows only the HR note stored alongside immutable legacy metadata', () => {
    expect(employeeNotesForDisplay(importedNotes('Perlu konfirmasi alamat.'))).toBe('Perlu konfirmasi alamat.')
    expect(isLegacyImport(importedNotes('Perlu konfirmasi alamat.'))).toBe(true)
  })

  it('cannot create trusted provenance by supplying import JSON as a normal note', () => {
    expect(employeeNoteInput(importedNotes())).toBeNull()
    const sanitized = employeeNoteInput(importedNotes('Catatan biasa.'))
    expect(sanitized).toBe('Catatan biasa.')
    expect(isLegacyImport(sanitized)).toBe(false)
  })

  it('also strips unsupported provenance from a normal create/update caller', () => {
    const sanitized = employeeNoteInput(JSON.stringify({ legacyImport: { sourceHash: 'unapproved-import' }, operationalNotes: 'Catatan HR.' }))
    expect(sanitized).toBe('Catatan HR.')
    expect(isLegacyImport(sanitized)).toBe(false)
  })

  it('does not trust metadata smuggled inside a nested operational note', () => {
    const sanitized = employeeNoteInput(importedNotes(importedNotes()))
    expect(isLegacyImport(sanitized)).toBe(false)
    expect(sanitized).toBeNull()
  })

  it('allows clearing an operational note without manufacturing a marker', () => {
    for (const value of [undefined, null, '', '   ', importedNotes('')]) {
      expect(employeeNoteInput(value)).toBeNull()
      expect(isLegacyImport(employeeNoteInput(value))).toBe(false)
    }
  })

  it('preserves ordinary malformed JSON text as a human note', () => {
    expect(employeeNoteInput('{alamat belum lengkap')).toBe('{alamat belum lengkap')
  })
})
