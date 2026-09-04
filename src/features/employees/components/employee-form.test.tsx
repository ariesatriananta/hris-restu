import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import type { Employee } from '../domain'
import { EmployeeForm } from './employee-form'

const inheritedImageUrl =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="2" height="2"%3E%3Crect width="2" height="2" fill="green"/%3E%3C/svg%3E'

vi.mock('@/hooks/use-unsaved-changes', () => ({
  useUnsavedChanges: () => ({ confirmation: null }),
}))

describe('EmployeeForm', () => {
  it('mengirim field pribadi opsional melalui schema Zod', async () => {
    const onSubmit = vi.fn()
    const employee = {
      uid: 'ca0a0392-71e3-4c52-af44-0c83c8296ee1',
      employeeNumber: 'PSMG-2607-11001',
      barcode: 'PSMG-2607-11001',
      fullName: 'Karyawan Fiktif',
      employeeType: 'BULANAN',
      employeeStatus: 'INACTIVE',
      site: 'SEMARANG',
      productionModuleUid: 'd42fc166-b62e-4cea-b89e-04f434d079f0',
      productionModuleSectionUid: '1514bce8-dab7-4d40-a217-5c6471134aca',
      joinDate: '2026-07-11',
      gender: 'MALE',
    } satisfies Employee
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const screen = await render(
      <QueryClientProvider client={client}>
        <EmployeeForm
          employee={employee}
          onSubmit={onSubmit}
          onCancel={() => {}}
          disableLookupQuery
        />
      </QueryClientProvider>
    )

    await expect
      .element(screen.getByLabelText('Employee ID'))
      .toHaveValue('PSMG-2607-11001')
    await expect
      .element(screen.getByLabelText('Tanggal bergabung'))
      .toBeDisabled()
    await userEvent.clear(screen.getByLabelText('Nama lengkap'))
    await userEvent.fill(screen.getByLabelText('Nama lengkap'), 'Budi Santoso')
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'NIK' }),
      'MOCK-NIK-1234'
    )
    await userEvent.fill(
      screen.getByLabelText('Nomor rekening'),
      'MOCK-REKENING-5678'
    )
    await userEvent.fill(screen.getByLabelText('RT/RW'), '001002')
    await userEvent.fill(screen.getByLabelText('Kelurahan'), 'Karanganyar')
    await userEvent.fill(screen.getByLabelText('Kecamatan'), 'Pecangaan')
    await userEvent.fill(
      screen.getByLabelText('Email'),
      'karyawan.fiktif@example.test'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Simpan perubahan' })
    )

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    const submitted = onSubmit.mock.calls[0]?.[0]
    expect(submitted).not.toHaveProperty('employeeNumber')
    expect(submitted).not.toHaveProperty('barcode')
    expect(submitted).toMatchObject({
      fullName: 'BUDI SANTOSO',
      nationalIdNumber: 'MOCK-NIK-1234',
      bankAccountNumber: 'MOCK-REKENING-5678',
      rtrw: '001/002',
      kelurahan: 'KARANGANYAR',
      kecamatan: 'PECANGAAN',
      email: 'karyawan.fiktif@example.test',
    })
  })

  it('menampilkan data awal rekrutmen tanpa membuka perubahan site dan berkas', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const screen = await render(
      <QueryClientProvider client={client}>
        <EmployeeForm
          createDefaults={{
            fullName: 'SITI AMINAH',
            employeeType: 'BORONGAN',
            employeeStatus: 'INACTIVE',
            site: 'KLATEN',
            joinDate: '2026-09-04',
            gender: 'PEREMPUAN',
          }}
          lockCreateSite
          inheritedRecruitmentDocuments={['PHOTO', 'KTP', 'KK']}
          inheritedRecruitmentAttachments={{
            PHOTO: {
              uid: 'photo-recruitment',
              originalName: 'foto-pelamar.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 1_024,
              url: inheritedImageUrl,
            },
            KTP: {
              uid: 'ktp-recruitment',
              originalName: 'ktp-pelamar.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 1_024,
              url: inheritedImageUrl,
            },
            KK: {
              uid: 'kk-recruitment',
              originalName: 'kk-pelamar.jpg',
              mimeType: 'image/jpeg',
              sizeBytes: 1_024,
              url: inheritedImageUrl,
            },
          }}
          submitLabel='Buat karyawan dari pelamar'
          onSubmit={() => {}}
          onCancel={() => {}}
          disableLookupQuery
        />
      </QueryClientProvider>
    )

    await expect
      .element(screen.getByLabelText('Nama lengkap'))
      .toHaveValue('SITI AMINAH')
    await expect.element(screen.getByLabelText('Site')).toBeDisabled()
    await expect.element(screen.getByText('foto-pelamar.jpg')).toBeVisible()
    await expect.element(screen.getByAltText('Foto karyawan')).toBeVisible()
    await expect.element(screen.getByAltText('Foto KTP')).toBeVisible()
    await expect.element(screen.getByAltText('Foto KK')).toBeVisible()
    await expect
      .element(
        screen.getByRole('button', { name: 'Buat karyawan dari pelamar' })
      )
      .toBeVisible()
  })
})
