import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { apiClient } from '@/lib/api-client'
import { EmployeeRecordFormPage } from './employee-record-form-page'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}))
vi.mock('@/hooks/use-unsaved-changes', () => ({
  useUnsavedChanges: () => ({ confirmation: null }),
}))
vi.mock('./employee-picker', () => ({
  EmployeePicker: () => <span>Karyawan uji</span>,
}))
afterEach(() => vi.restoreAllMocks())

it('reuses the uploaded file and creation key when the manual document form retries a lost response', async () => {
  navigate.mockReset()
  const documents = new Map<string, string>()
  const post = vi
    .spyOn(apiClient, 'post')
    .mockImplementation(async (url, body) => {
      if (url === '/files')
        return {
          data: {
            uid: 'uploaded-file',
            originalName: 'test.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 4,
          },
        }
      const key = (body as { idempotencyKey: string }).idempotencyKey
      if (!documents.has(key)) {
        documents.set(key, 'saved-document')
        throw new Error('Synthetic response lost after commit')
      }
      return { data: { uid: documents.get(key) } }
    })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const screen = await render(
    <QueryClientProvider client={client}>
      <EmployeeRecordFormPage
        kind='document'
        employeeUid='synthetic-employee'
      />
    </QueryClientProvider>
  )
  await screen.getByLabelText('Tipe dokumen').fill('KTP')
  await screen.getByLabelText('Nama dokumen').fill('Dokumen Uji')
  const files = new DataTransfer()
  files.items.add(new File(['test'], 'test.pdf', { type: 'application/pdf' }))
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  input.files = files.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await screen.getByRole('button', { name: 'Simpan dokumen' }).click()
  await expect
    .element(
      screen.getByText(
        'Dokumen belum dapat disimpan. Coba kembali untuk melanjutkan penyimpanan.'
      )
    )
    .toBeVisible()
  expect(navigate).not.toHaveBeenCalled()
  await screen.getByRole('button', { name: 'Simpan dokumen' }).click()
  await expect.poll(() => navigate.mock.calls.length).toBe(1)
  expect(documents.size).toBe(1)
  expect(post.mock.calls.filter(([url]) => url === '/files')).toHaveLength(1)
  const creates = post.mock.calls.filter(([url]) => url.endsWith('/documents'))
  expect(creates).toHaveLength(2)
  expect(creates[0][1]).toEqual(creates[1][1])
  client.clear()
})
