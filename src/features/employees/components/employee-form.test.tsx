import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { EmployeeForm } from './employee-form'

describe('EmployeeForm', () => {
  it('mengirim field pribadi opsional melalui schema Zod', async () => {
    const onSubmit = vi.fn()
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const screen = await render(
      <QueryClientProvider client={client}>
        <EmployeeForm onSubmit={onSubmit} disableLookupQuery />
      </QueryClientProvider>
    )

    await userEvent.fill(screen.getByLabelText('Nomor karyawan'), 'RST-TEST-01')
    await userEvent.fill(screen.getByLabelText('Barcode'), 'RSTTEST01')
    await userEvent.fill(
      screen.getByLabelText('Nama lengkap'),
      'Karyawan Fiktif'
    )
    await userEvent.fill(
      screen.getByLabelText('Tanggal bergabung'),
      '2026-07-11'
    )
    await userEvent.fill(
      screen.getByRole('textbox', { name: 'NIK' }),
      'MOCK-NIK-1234'
    )
    await userEvent.fill(
      screen.getByLabelText('Nomor rekening'),
      'MOCK-REKENING-5678'
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Tambah karyawan' })
    )

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledOnce())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        nationalIdNumber: 'MOCK-NIK-1234',
        bankAccountNumber: 'MOCK-REKENING-5678',
      })
    )
  })
})
