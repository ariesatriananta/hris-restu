export const legacyContractImportNote = 'Rekonstruksi import disetujui Owner: kontrak 12 bulan berantai dari join date. Bukan bukti dokumen bertanda tangan.'
export const operationalContractImportNote = 'Masa kontrak 12 bulan, dengan perpanjangan mengikuti periode kontrak sebelumnya.'

// Compatibility for already-imported rows; preserve all user-written notes.
export function contractNotesForDisplay(notes: unknown) {
  return notes === legacyContractImportNote ? operationalContractImportNote : notes
}
