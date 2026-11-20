import type { PropsWithChildren } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { apiClient } from '@/lib/api-client'
import type { EmployeeDocument, EmployeeInput } from '../domain'
import { EmployeeFormPage } from './employee-form-page'
import type { EmployeeFiles } from './employee-registration-save'

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
let submittedInput = input
let submittedFiles: EmployeeFiles = files
vi.mock('@/features/employees/components/employee-form', () => ({
  EmployeeForm: ({
    onSubmit,
    isPending,
    submitLabel,
  }: {
    onSubmit: (input: EmployeeInput, files: EmployeeFiles) => Promise<void>
    isPending: boolean
    submitLabel?: string
  }) => (
    <button
      disabled={isPending}
      onClick={() => {
        void onSubmit(submittedInput, submittedFiles).catch(() => undefined)
      }}
    >
      {submitLabel ?? 'Simpan formulir uji'}
    </button>
  ),
}))
afterEach(() => {
  vi.restoreAllMocks()
  submittedInput = input
  submittedFiles = files
})

const activeDocument: EmployeeDocument = {
  uid: 'active-ktp',
  employeeUid: 'existing-employee',
  documentType: 'KTP',
  documentNumber: 'OLD-ID',
  name: 'CUSTOM KTP',
  status: 'ACTIVE',
  notes: 'PRESERVE',
  file: {
    uid: 'stored-file',
    originalName: 'stored.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 100,
  },
}
function editSetup(documents: EmployeeDocument[]) {
  const employee = {
    ...input,
    nationalIdNumber: 'OLD-ID',
    uid: 'existing-employee',
    employeeNumber: 'TEST-001',
    barcode: 'TEST-001',
  }
  vi.spyOn(apiClient, 'get').mockImplementation(async (url) => ({
    data: url.endsWith('/documents') ? documents : employee,
  }))
  const patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({ status: 204 })
  const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: {} })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  navigate.mockReset()
  return { patch, post, client }
}

it('edit without a new file updates only the active identity document after archived rows', async () => {
  submittedInput = { ...input, nationalIdNumber: 'NEW-ID' }
  submittedFiles = {}
  const { patch, post, client } = editSetup([
    { ...activeDocument, uid: 'archived-ktp', status: 'ARCHIVED' },
    activeDocument,
  ])
  const screen = await render(
    <QueryClientProvider client={client}>
      <EmployeeFormPage employeeUid='existing-employee' />
    </QueryClientProvider>
  )
  await screen.getByRole('button', { name: 'Simpan formulir uji' }).click()
  await expect.poll(() => navigate.mock.calls.length).toBe(1)
  expect(patch).toHaveBeenCalledWith(
    '/employees/documents/active-ktp',
    expect.objectContaining({
      documentNumber: 'NEW-ID',
      fileUid: 'stored-file',
      name: 'CUSTOM KTP',
      notes: 'PRESERVE',
    })
  )
  expect(patch.mock.calls.some(([url]) => url.includes('archived-ktp'))).toBe(
    false
  )
  expect(post).not.toHaveBeenCalled()
  client.clear()
})

it('blocks ambiguous active KTP changes before saving profile or any document', async () => {
  submittedInput = { ...input, nationalIdNumber: 'NEW-ID' }
  submittedFiles = {}
  const { patch, post, client } = editSetup([
    activeDocument,
    { ...activeDocument, uid: 'duplicate-ktp' },
  ])
  const screen = await render(
    <QueryClientProvider client={client}>
      <EmployeeFormPage employeeUid='existing-employee' />
    </QueryClientProvider>
  )
  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent('lebih dari satu dokumen KTP aktif')
  await screen.getByRole('button', { name: 'Simpan formulir uji' }).click()
  expect(patch).not.toHaveBeenCalled()
  expect(post).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
  client.clear()
})

it('allows unrelated profile changes when active identity documents are ambiguous', async () => {
  submittedInput = {
    ...input,
    fullName: 'UPDATED NAME',
    nationalIdNumber: 'OLD-ID',
  }
  submittedFiles = {}
  const { patch, client } = editSetup([
    activeDocument,
    { ...activeDocument, uid: 'duplicate-ktp' },
  ])
  const screen = await render(
    <QueryClientProvider client={client}>
      <EmployeeFormPage employeeUid='existing-employee' />
    </QueryClientProvider>
  )
  await screen.getByRole('button', { name: 'Simpan formulir uji' }).click()
  await expect.poll(() => navigate.mock.calls.length).toBe(1)
  expect(patch).toHaveBeenCalledTimes(1)
  expect(patch).toHaveBeenCalledWith(
    '/employees/existing-employee',
    expect.objectContaining({ fullName: 'UPDATED NAME' })
  )
  client.clear()
})

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
