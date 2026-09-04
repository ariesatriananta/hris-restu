import { describe, expect, it } from 'vitest'
import {
  buildRecruitmentListParams,
  recruitmentConversionInput,
  recruitmentEmployeeDefaults,
  recruitmentActionLabel,
  recruitmentFileLabel,
  recruitmentStatusLabel,
  visibleRecruitmentActions,
} from './utils'

describe('Rekrutmen internal', () => {
  it('memetakan status dan dokumen ke bahasa operasional', () => {
    expect(recruitmentStatusLabel('IN_PROGRESS')).toBe('Diproses')
    expect(recruitmentActionLabel('REJECTED')).toBe('Nyatakan tidak lolos')
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
