import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from '@/lib/api-client'
import { httpEmployeeRepository } from '../data/http-employee-repository'
import type {
  Employee,
  EmployeeDocument,
  EmployeeInput,
  MockFileAttachment,
} from '../domain'
import {
  saveEmployeeRegistration,
  selectIdentityDocuments,
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
function run(
  files: EmployeeFiles,
  data = input,
  documents: Partial<Record<'KTP' | 'KK', EmployeeDocument>> = {}
) {
  return saveEmployeeRegistration({
    input: data,
    files,
    progress,
    documents,
    saveEmployee: ({ input, uid, onPersisted }) =>
      httpEmployeeRepository.save(input, uid, onPersisted),
    saveDocument: ({ input, uid, idempotencyKey }) =>
      httpEmployeeRepository.saveDocument(input, uid, idempotencyKey),
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
  const existingDocument = (type: 'KTP' | 'KK'): EmployeeDocument => ({
    uid: `existing-${type}`,
    employeeUid: employee.uid,
    documentType: type,
    documentNumber:
      type === 'KTP' ? input.nationalIdNumber : input.familyCardNumber,
    name: `CUSTOM ${type}`,
    status: 'ACTIVE',
    notes: 'PRESERVE NOTES',
    issuedDate: '2026-01-01',
    expiryDate: '2030-01-01',
    file: {
      uid: `stored-${type}`,
      originalName: `${type}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 100,
    },
  })

  it.each(['KTP', 'KK'] as const)(
    'updates the selected %s number without uploading a file or changing other metadata',
    async (type) => {
      progress.employeeUid = employee.uid
      const document = existingDocument(type)
      const values =
        type === 'KTP'
          ? { ...input, nationalIdNumber: 'UPDATED-ID' }
          : { ...input, familyCardNumber: 'UPDATED-KK' }
      await run({}, values, { [type]: document })
      const { uid: _uid, ...metadata } = document
      expect(patch).toHaveBeenCalledWith(
        `/employees/documents/${document.uid}`,
        expect.objectContaining({
          ...metadata,
          fileUid: document.file.uid,
          documentNumber: type === 'KTP' ? 'UPDATED-ID' : 'UPDATED-KK',
        })
      )
      expect(upload).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
      expect(progress.documents[type]!.saved!.documentNumber).toBe(
        type === 'KTP' ? 'UPDATED-ID' : 'UPDATED-KK'
      )
    }
  )

  it('retries a failed KK metadata update without repeating the completed KTP update', async () => {
    progress.employeeUid = employee.uid
    const documents = {
      KTP: existingDocument('KTP'),
      KK: existingDocument('KK'),
    }
    let failed = false
    patch.mockImplementation(async (url) => {
      if (url === `/employees/documents/${documents.KK.uid}` && !failed) {
        failed = true
        throw new Error('Synthetic metadata failure')
      }
      return { status: 204 }
    })
    const values = {
      ...input,
      nationalIdNumber: 'UPDATED-ID',
      familyCardNumber: 'UPDATED-KK',
    }
    await expect(run({}, values, documents)).rejects.toThrow(
      'Synthetic metadata failure'
    )
    await run({}, values, documents)
    expect(
      patch.mock.calls.filter(
        ([url]) => url === `/employees/documents/${documents.KTP.uid}`
      )
    ).toHaveLength(1)
    expect(
      patch.mock.calls.filter(
        ([url]) => url === `/employees/documents/${documents.KK.uid}`
      )
    ).toHaveLength(2)
    expect(upload).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('does not write unchanged numbers, including equivalent empty values', async () => {
    progress.employeeUid = employee.uid
    const document = { ...existingDocument('KTP'), documentNumber: undefined }
    await run({}, { ...input, nationalIdNumber: '' }, { KTP: document })
    expect(
      patch.mock.calls.filter(([url]) => url.includes('/documents/'))
    ).toHaveLength(0)
    expect(post).not.toHaveBeenCalled()
  })

  it('clears the active document number when the profile number is deliberately cleared', async () => {
    progress.employeeUid = employee.uid
    const document = existingDocument('KTP')
    await run({}, { ...input, nationalIdNumber: undefined }, { KTP: document })
    expect(patch).toHaveBeenCalledWith(
      `/employees/documents/${document.uid}`,
      expect.objectContaining({
        documentNumber: undefined,
        fileUid: document.file.uid,
      })
    )
    expect(upload).not.toHaveBeenCalled()
  })

  it('does not create an identity document when there is no existing document and no new file', async () => {
    progress.employeeUid = employee.uid
    await run({}, { ...input, nationalIdNumber: 'UPDATED-ID' })
    expect(
      patch.mock.calls.filter(([url]) => url.includes('/documents/'))
    ).toHaveLength(0)
    expect(post).not.toHaveBeenCalled()
    expect(upload).not.toHaveBeenCalled()
  })

  it.each(['foreign', 'archived'] as const)(
    'rejects a %s document before saving the employee',
    async (kind) => {
      progress.employeeUid = employee.uid
      const document = {
        ...existingDocument('KTP'),
        ...(kind === 'foreign'
          ? { employeeUid: 'another-employee' }
          : { status: 'ARCHIVED' as const }),
      }
      await expect(run({}, input, { KTP: document })).rejects.toThrow(
        'Dokumen identitas aktif tidak sesuai'
      )
      expect(patch).not.toHaveBeenCalled()
      expect(post).not.toHaveBeenCalled()
    }
  )

  it('selects only one active identity document belonging to the current employee, preserving archives and other employees', () => {
    const active = existingDocument('KTP')
    const archive = { ...active, uid: 'old', status: 'ARCHIVED' as const }
    const foreign = {
      ...active,
      uid: 'foreign',
      employeeUid: 'another-employee',
    }
    const expired = { ...existingDocument('KK'), status: 'EXPIRED' as const }
    expect(
      selectIdentityDocuments([archive, foreign, expired, active], employee.uid)
    ).toEqual({ selected: { KTP: active }, ambiguous: [] })
    expect(selectIdentityDocuments([active])).toEqual({
      selected: {},
      ambiguous: [],
    })
    expect(
      selectIdentityDocuments(
        [active, { ...active, uid: 'duplicate' }],
        employee.uid
      )
    ).toEqual({ selected: {}, ambiguous: ['KTP'] })
  })
  it('retries a lost document response with the same operation key and creates only one document', async () => {
    const saved = new Map<string, string>()
    let lost = false
    post.mockImplementation(async (url, body) => {
      if (url === '/employees') return { data: { uid: employee.uid } }
      const key = (body as { idempotencyKey: string }).idempotencyKey
      expect(key).toMatch(/^[0-9a-f-]{36}$/)
      if (!saved.has(key)) saved.set(key, `doc-${saved.size + 1}`)
      if (!lost) {
        lost = true
        throw new Error('Synthetic lost response after commit')
      }
      return { data: { uid: saved.get(key) } }
    })
    await expect(run({ nationalId })).rejects.toThrow(
      'Synthetic lost response after commit'
    )
    const key = progress.documents.KTP!.creationKey
    await run({ nationalId })
    expect(progress.documents.KTP!.creationKey).toBe(key)
    expect(progress.documents.KTP!.saved!.uid).toBe(saved.get(key!))
    expect(saved.size).toBe(1)
    expect(upload).toHaveBeenCalledOnce()
    expect(
      post.mock.calls.filter(([url]) => url === '/employees')
    ).toHaveLength(1)
  })

  it('uses different keys for KTP and KK and retains the pending key after a file is replaced', async () => {
    let failed = false
    post.mockImplementation(async (url, body) => {
      if (url === '/employees') return { data: { uid: employee.uid } }
      const payload = body as { documentType: string; idempotencyKey: string }
      if (payload.documentType === 'KK' && !failed) {
        failed = true
        throw new Error('Synthetic response failure')
      }
      return { data: { uid: payload.idempotencyKey } }
    })
    await expect(run({ nationalId, familyCard })).rejects.toThrow(
      'Synthetic response failure'
    )
    const ktpKey = progress.documents.KTP!.creationKey
    const kkKey = progress.documents.KK!.creationKey
    expect(ktpKey).not.toBe(kkKey)
    const replacement = new File(['replacement'], 'kk-replacement.jpg', {
      type: 'image/jpeg',
    })
    await run({ nationalId, familyCard: replacement })
    expect(progress.documents.KK!.creationKey).toBe(kkKey)
    expect(progress.documents.KK!.saved!.uid).toBe(kkKey)
  })
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
