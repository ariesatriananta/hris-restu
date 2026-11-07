import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api-client'
import { httpEmployeeRepository } from '../data/http-employee-repository'
import type { Employee, EmployeeInput, MockFileAttachment } from '../domain'
import {
  saveEmployeeRegistration,
  type EmployeeSaveProgress,
  type EmployeeFiles,
} from './employee-registration-save'

const input: EmployeeInput = {
  fullName: 'KARYAWAN UJI',
  employeeType: 'BORONGAN',
  employeeStatus: 'INACTIVE',
  site: 'KLATEN',
  gender: 'MALE',
  educationLevel: 'SENIOR_SECONDARY',
  joinDate: '2026-11-01',
  nationalIdNumber: 'TEST-ID',
  familyCardNumber: 'TEST-KK',
}
const employee: Employee = {
  ...input,
  uid: 'employee-created',
  employeeNumber: 'TEST-001',
  barcode: 'TEST-001',
}
const photo = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })
const nationalId = new File(['ktp'], 'ktp.jpg', { type: 'image/jpeg' })
const familyCard = new File(['kk'], 'kk.jpg', { type: 'image/jpeg' })
let progress: EmployeeSaveProgress
let upload: ReturnType<
  typeof vi.fn<
    (file: File, employeeUid?: string) => Promise<MockFileAttachment>
  >
>
const spyPost = () => vi.spyOn(apiClient, 'post')
const spyPatch = () => vi.spyOn(apiClient, 'patch')
const spyGet = () => vi.spyOn(apiClient, 'get')
let post: ReturnType<typeof spyPost>
let patch: ReturnType<typeof spyPatch>
let get: ReturnType<typeof spyGet>
function run(files: EmployeeFiles, data = input) {
  return saveEmployeeRegistration({
    input: data,
    files,
    progress,
    documents: {},
    saveEmployee: ({ input, uid, onPersisted }) =>
      httpEmployeeRepository.save(input, uid, onPersisted),
    saveDocument: ({ input, uid }) =>
      httpEmployeeRepository.saveDocument(input, uid),
    upload,
    onPersisted: vi.fn(),
  })
}
beforeEach(() => {
  progress = { documents: {} }
  post = spyPost().mockImplementation(async (url) => ({
    data: {
      uid:
        url === '/employees'
          ? employee.uid
          : `document-${post.mock.calls.length}`,
    },
  }))
  patch = spyPatch().mockResolvedValue({ status: 204 })
  get = spyGet().mockResolvedValue({ data: employee })
  upload = vi.fn(async (file: File) => ({
    uid: file.name,
    originalName: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  }))
})
afterEach(() => vi.restoreAllMocks())

describe('registration attachment retry', () => {
  it.each(['photo', 'nationalId', 'familyCard'] as const)(
    'retries failed %s upload against the already-created employee',
    async (field) => {
      const files = { photo, nationalId, familyCard }
      const original = upload.getMockImplementation()!
      let failed = false
      upload.mockImplementation(async (file: File) => {
        if (file === files[field] && !failed) {
          failed = true
          throw new Error('Synthetic upload failure')
        }
        return original(file)
      })
      await expect(run(files)).rejects.toThrow('Synthetic upload failure')
      expect(progress.employeeUid).toBe(employee.uid)
      await expect(run(files)).resolves.toMatchObject({ uid: employee.uid })
      expect(
        post.mock.calls.filter(([url]) => url === '/employees')
      ).toHaveLength(1)
      expect(
        post.mock.calls.filter(
          ([url]) => url === `/employees/${employee.uid}/documents`
        )
      ).toHaveLength(2)
      const completedBeforeFailure =
        field === 'familyCard' ? nationalId : undefined
      if (completedBeforeFailure)
        expect(
          upload.mock.calls.filter(([file]) => file === completedBeforeFailure)
        ).toHaveLength(1)
      expect(
        patch.mock.calls.every(([url]) =>
          url.startsWith(`/employees/${employee.uid}`)
        )
      ).toBe(true)
    }
  )
  it('remembers a committed UID even if the follow-up GET fails before any upload', async () => {
    get.mockRejectedValueOnce(new Error('Synthetic detail read failure'))
    await expect(run({ photo })).rejects.toThrow(
      'Synthetic detail read failure'
    )
    expect(progress.employeeUid).toBe(employee.uid)
    await run({ photo })
    expect(
      post.mock.calls.filter(([url]) => url === '/employees')
    ).toHaveLength(1)
  })
  it('reuses the uploaded attachment when saving the document fails', async () => {
    const originalPost = post.getMockImplementation()!
    let failed = false
    post.mockImplementation(async (...args) => {
      if (args[0].endsWith('/documents') && !failed) {
        failed = true
        throw new Error('Synthetic document failure')
      }
      return originalPost(...args)
    })
    await expect(run({ nationalId })).rejects.toThrow(
      'Synthetic document failure'
    )
    await run({ nationalId })
    expect(upload).toHaveBeenCalledOnce()
    expect(upload).toHaveBeenCalledWith(nationalId, employee.uid)
  })
  it('preserves a committed photo link when a later detail read fails', async () => {
    get
      .mockResolvedValueOnce({ data: employee })
      .mockRejectedValueOnce(new Error('Synthetic photo detail failure'))
    await expect(run({ photo })).rejects.toThrow(
      'Synthetic photo detail failure'
    )
    await run({ photo })
    expect(upload).toHaveBeenCalledOnce()
    expect(patch.mock.calls[1][1]).toMatchObject({ photoUid: photo.name })
  })
  it('updates the existing document when a completed file or identity number is changed on retry', async () => {
    const original = upload.getMockImplementation()!
    upload.mockImplementation(async (file: File) => {
      if (file === familyCard) throw new Error('Synthetic KK failure')
      return original(file)
    })
    await expect(run({ nationalId, familyCard })).rejects.toThrow(
      'Synthetic KK failure'
    )
    const uid = progress.documents.KTP!.saved!.uid
    const replacement = new File(['new'], 'replacement.jpg', {
      type: 'image/jpeg',
    })
    await run(
      { nationalId: replacement },
      { ...input, nationalIdNumber: 'TEST-UPDATED' }
    )
    expect(patch).toHaveBeenCalledWith(
      `/employees/documents/${uid}`,
      expect.objectContaining({
        documentNumber: 'TEST-UPDATED',
        fileUid: replacement.name,
      })
    )
    expect(
      post.mock.calls.filter(([url]) => url.endsWith('/documents'))
    ).toHaveLength(1)
  })
  it('keeps edit retries on the existing employee without creating any employee', async () => {
    progress.employeeUid = employee.uid
    upload.mockRejectedValueOnce(new Error('Synthetic offline'))
    await expect(run({ photo })).rejects.toThrow('Synthetic offline')
    await run({ photo })
    expect(
      post.mock.calls.filter(([url]) => url === '/employees')
    ).toHaveLength(0)
  })
})
