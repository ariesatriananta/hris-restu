import { beforeEach, describe, expect, it } from 'vitest'
import { mockEmployeeRepository } from './mock-employee-repository'

describe('mock employee repository', () => {
  beforeEach(async () => {
    await mockEmployeeRepository.reset()
  })
  it('memfilter dan mem-paginasi karyawan berdasarkan site', async () => {
    const result = await mockEmployeeRepository.list({
      site: 'JEPARA',
      page: 1,
      pageSize: 1,
    })
    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.site).toBe('JEPARA')
  })
  it('menolak nomor karyawan atau barcode yang duplikat', async () => {
    const current = await mockEmployeeRepository.getByUid('emp-adi-001')
    await expect(
      mockEmployeeRepository.save({
        ...current!,
        employeeNumber: 'RST-SMG-014',
      })
    ).rejects.toThrow('sudah digunakan')
  })
  it('menyimpan data pribadi opsional dan mengunci penempatan saat edit', async () => {
    const current = await mockEmployeeRepository.getByUid('emp-adi-001')
    const saved = await mockEmployeeRepository.save(
      {
        ...current!,
        site: 'KLATEN',
        position: 'Supervisor Produksi',
        nationalIdNumber: 'MOCK-IDENTITAS-1234',
        bankAccountNumber: 'MOCK-REKENING-5678',
      },
      current!.uid
    )
    expect(saved.nationalIdNumber).toBe('MOCK-IDENTITAS-1234')
    expect(saved.bankAccountNumber).toBe('MOCK-REKENING-5678')
    expect(saved.site).toBe('JEPARA')
    expect(saved.position).toBe('Operator Produksi')
  })
  it('mutasi menutup histori aktif dan memperbarui penempatan', async () => {
    await mockEmployeeRepository.applyMutation('emp-adi-001', {
      site: 'SEMARANG',
      department: 'Produksi',
      position: 'Quality Control',
      workGroup: 'Kelompok QC',
      employeeType: 'BORONGAN',
      employeeStatus: 'ACTIVE',
      effectiveFrom: '2026-07-12',
      changeType: 'TRANSFER',
      reason: 'Rotasi mock',
    })
    const histories = await mockEmployeeRepository.histories('emp-adi-001')
    const employee = await mockEmployeeRepository.getByUid('emp-adi-001')
    expect(histories).toHaveLength(2)
    expect(
      histories.find((item) => item.changeType === 'INITIAL')?.effectiveTo
    ).toBe('2026-07-11')
    expect(employee?.site).toBe('SEMARANG')
  })
  it('memvalidasi rentang tanggal kontrak dan dokumen', async () => {
    await expect(
      mockEmployeeRepository.saveContract({
        employeeUid: 'emp-adi-001',
        contractNumber: 'TEST-1',
        contractType: 'PKWT',
        sequenceNumber: 1,
        startDate: '2026-07-10',
        endDate: '2026-07-09',
        status: 'DRAFT',
      })
    ).rejects.toThrow('tidak boleh sebelum')
    await expect(
      mockEmployeeRepository.saveDocument({
        employeeUid: 'emp-adi-001',
        documentType: 'LAINNYA',
        name: 'Dokumen',
        issuedDate: '2026-07-10',
        expiryDate: '2026-07-09',
        status: 'ACTIVE',
        file: {
          uid: 'file-test',
          originalName: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1,
        },
      })
    ).rejects.toThrow('tidak boleh sebelum')
  })
})
