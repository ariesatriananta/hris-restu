import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import type { Employee } from '../domain'
import { EmployeeForm } from './employee-form'

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
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'NIK' }),
      'MOCK-NIK-1234'
    )
    await userEvent.fill(
      screen.getByLabelText('Nomor rekening'),
      'MOCK-REKENING-5678'
    )
    await userEvent.fill(screen.getByLabelText('RT/RW'), '001/002')
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
      nationalIdNumber: 'MOCK-NIK-1234',
      bankAccountNumber: 'MOCK-REKENING-5678',
      rtrw: '001/002',
      kelurahan: 'Karanganyar',
      kecamatan: 'Pecangaan',
      email: 'karyawan.fiktif@example.test',
    })
  })
})
