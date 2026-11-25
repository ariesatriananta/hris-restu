import { describe, expect, it } from 'vitest'
import {
  buildRecruitmentListParams,
  formatRecruitmentDateTime,
  recruitmentRequiredDocumentsMissing,
  recruitmentUploadFileUid,
  recruitmentMissingFieldLabel,
  recruitmentConversionInput,
  recruitmentEmployeeDefaults,
  recruitmentActionLabel,
  recruitmentFileLabel,
  recruitmentStatusLabel,
  visibleRecruitmentActions,
} from './utils'

describe('Rekrutmen internal', () => {
  it('menampilkan instant UTC dan offset eksplisit pada tanggal/jam WIB yang sama', () => {
    const fromUtc = formatRecruitmentDateTime('2026-11-24T20:15:00.000Z')
    expect(fromUtc).toBe(formatRecruitmentDateTime('2026-11-25T03:15:00+07:00'))
    expect(fromUtc).toContain('25 Nov 2026')
    expect(fromUtc).toMatch(/03[.:]15/)
  })

  it('memetakan status dan dokumen ke bahasa operasional', () => {
    expect(recruitmentStatusLabel('IN_PROGRESS')).toBe('Diproses')
    expect(recruitmentActionLabel('REJECTED')).toBe('Nyatakan tidak lolos')
    expect(recruitmentActionLabel('IN_PROGRESS', 'PASSED')).toBe(
      'Kembalikan ke Diproses'
    )
    expect(recruitmentFileLabel('KTP')).toBe('Foto KTP')
  })

  it('mempertahankan filter URL serta memakai pagination standar', () => {
    expect(
      buildRecruitmentListParams({
        filter: 'Siti',
        site: ['JEPARA'],
        status: ['NEW'],
        dateFrom: '2026-09-01',
        dateTo: '2026-09-04',
        sortBy: 'fullName',
        sortDirection: 'asc',
      })
    ).toEqual({
      search: 'Siti',
      site: ['JEPARA'],
      status: ['NEW'],
      dateFrom: '2026-09-01',
      dateTo: '2026-09-04',
      page: 1,
      pageSize: 50,
      sortBy: 'fullName',
      sortDirection: 'asc',
    })
  })

  it('menyembunyikan aksi perubahan dari pengguna lihat-saja', () => {
    expect(
      visibleRecruitmentActions(false, ['IN_PROGRESS', 'REJECTED'])
    ).toEqual([])
    expect(
      visibleRecruitmentActions(true, ['IN_PROGRESS', 'REJECTED'])
    ).toEqual(['IN_PROGRESS', 'REJECTED'])
  })

  it('menyiapkan biodata pelamar tanpa mengirim status dan file dari browser', () => {
    expect(
      recruitmentEmployeeDefaults({
        fullName: 'SITI AMINAH',
        employeeType: null,
        employeeStatus: 'ACTIVE',
        gender: 'FEMALE',
      })
    ).toEqual(
      expect.objectContaining({
        fullName: 'SITI AMINAH',
        employeeType: 'BORONGAN',
        employeeStatus: 'INACTIVE',
        gender: 'PEREMPUAN',
      })
    )

    const result = recruitmentConversionInput({
      fullName: 'SITI AMINAH',
      employeeType: 'BORONGAN',
      employeeStatus: 'INACTIVE',
      site: 'JEPARA',
      joinDate: '2026-09-04',
      gender: 'PEREMPUAN',
      educationLevel: 'SENIOR_SECONDARY',
      productionModuleSectionUid: '11111111-1111-4111-8111-111111111111',
      photo: {
        uid: '22222222-2222-4222-8222-222222222222',
        originalName: 'foto.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 10,
      },
    })
    expect(result).not.toHaveProperty('employeeStatus')
    expect(result).not.toHaveProperty('photo')
  })
})

describe('Dokumen calon migrasi', () => {
  const file = {
    uid: 'drive-ktp',
    kind: 'KTP' as const,
    originalName: 'KTP',
    mimeType: 'application/octet-stream',
    sizeBytes: 0,
    sourceType: 'GOOGLE_DRIVE' as const,
    externalUrl: 'https://drive.google.com/file/d/example/view',
  }
  it('tidak meminta blob R2 untuk Drive atau dokumen yang tidak ada', () => {
    expect(recruitmentUploadFileUid(file)).toBeUndefined()
    expect(recruitmentUploadFileUid()).toBeUndefined()
    expect(recruitmentUploadFileUid({ ...file, sourceType: 'UPLOAD' })).toBe(
      'drive-ktp'
    )
  })
  it('foto opsional khusus migrasi, KTP dan KK tetap wajib', () => {
    const files = [file, { ...file, uid: 'drive-kk', kind: 'KK' as const }]
    expect(recruitmentRequiredDocumentsMissing(files, true)).toEqual([])
    expect(recruitmentRequiredDocumentsMissing(files)).toEqual(['PHOTO'])
    expect(recruitmentRequiredDocumentsMissing([], true)).toEqual(['KTP', 'KK'])
  })
  it('tanggal daftar tidak diketahui tidak ditampilkan sebagai tanggal palsu', () => {
    expect(formatRecruitmentDateTime(null)).toBe('-')
    expect(formatRecruitmentDateTime('invalid')).toBe('-')
    expect(recruitmentMissingFieldLabel('nationalIdNumber')).toBe('NIK')
  })
})
