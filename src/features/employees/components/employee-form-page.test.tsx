import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { apiClient } from '@/lib/api-client'
import type { EmployeeInput } from '../domain'
import { EmployeeFormPage } from './employee-form-page'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('@tanstack/react-router', async (original) => ({
  ...(await original<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
  Link: ({ children }: PropsWithChildren) => <span>{children}</span>,
}))
const input: EmployeeInput = {
  fullName: 'KARYAWAN UJI',
  employeeType: 'BORONGAN',
  employeeStatus: 'INACTIVE',
  site: 'KLATEN',
  gender: 'MALE',
  educationLevel: 'SENIOR_SECONDARY',
  joinDate: '2026-11-01',
}
const files = {
  nationalId: new File(['test'], 'test-ktp.jpg', { type: 'image/jpeg' }),
  familyCard: new File(['test'], 'test-kk.jpg', { type: 'image/jpeg' }),
}
vi.mock('@/features/employees/components/employee-form', () => ({
  EmployeeForm: ({
    onSubmit,
    isPending,
    submitLabel,
  }: {
    onSubmit: (
      input: EmployeeInput,
      files: { nationalId: File; familyCard: File }
    ) => Promise<void>
    isPending: boolean
    submitLabel?: string
  }) => (
    <button
      disabled={isPending}
      onClick={() => {
        void onSubmit(input, files).catch(() => undefined)
      }}
    >
      {submitLabel ?? 'Simpan formulir uji'}
    </button>
  ),
}))
afterEach(() => vi.restoreAllMocks())

it('keeps the created employee and completed KTP when the user retries a failed KK from the page', async () => {
  navigate.mockReset()
  let failed = false
  const uploads: string[] = []
  const post = vi
    .spyOn(apiClient, 'post')
    .mockImplementation(async (url, body) => {
      if (url === '/files') {
        const file = (body as FormData).get('file') as File
        uploads.push(file.name)
        if (file.name === files.familyCard.name && !failed) {
          failed = true
          throw new Error('Synthetic offline')
        }
        return {
          data: {
            uid: file.name,
            originalName: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          },
        }
      }
      return {
        data: {
          uid: url === '/employees' ? 'created-employee' : 'created-document',
        },
      }
    })
  vi.spyOn(apiClient, 'patch').mockResolvedValue({ status: 204 })
  vi.spyOn(apiClient, 'get').mockResolvedValue({
    data: {
      ...input,
      uid: 'created-employee',
      employeeNumber: 'TEST-001',
      barcode: 'TEST-001',
    },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const screen = await render(
    <QueryClientProvider client={client}>
      <EmployeeFormPage />
    </QueryClientProvider>
  )
  await screen.getByRole('button', { name: 'Simpan formulir uji' }).click()
  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent('Data karyawan sudah tersimpan')
  expect(navigate).not.toHaveBeenCalled()
  await screen.getByRole('button', { name: 'Lanjutkan penyimpanan' }).click()
  await expect.poll(() => navigate.mock.calls.length).toBe(1)
  expect(navigate).toHaveBeenCalledWith(
    expect.objectContaining({ params: { employeeUid: 'created-employee' } })
  )
  expect(post.mock.calls.filter(([url]) => url === '/employees')).toHaveLength(
    1
  )
  expect(
    post.mock.calls.filter(
      ([url]) => url === '/employees/created-employee/documents'
    )
  ).toHaveLength(2)
  expect(uploads.filter((name) => name === files.nationalId.name)).toHaveLength(
    1
  )
  client.clear()
})
