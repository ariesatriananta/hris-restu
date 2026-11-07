import type {
  Employee,
  EmployeeDocument,
  EmployeeInput,
  MockFileAttachment,
} from '../domain'

type IdentityType = 'KTP' | 'KK'
type UploadedFile = { file: File; attachment: MockFileAttachment }
export type EmployeeSaveProgress = {
  employeeUid?: string
  photo?: UploadedFile & { linked: boolean }
  documents: Partial<
    Record<IdentityType, UploadedFile & { saved?: EmployeeDocument }>
  >
}
export type EmployeeFiles = {
  photo?: File
  nationalId?: File
  familyCard?: File
}
type SaveDocument = (value: {
  uid?: string
  input: Omit<EmployeeDocument, 'uid'>
}) => Promise<EmployeeDocument>

export async function saveEmployeeRegistration({
  input,
  files,
  progress,
  documents,
  saveEmployee,
  saveDocument,
  upload,
  onPersisted,
}: {
  input: EmployeeInput
  files: EmployeeFiles
  progress: EmployeeSaveProgress
  documents: Partial<Record<IdentityType, EmployeeDocument>>
  saveEmployee: (value: {
    input: EmployeeInput
    uid?: string
    onPersisted: (uid: string) => void
  }) => Promise<Employee>
  saveDocument: SaveDocument
  upload: (file: File, employeeUid: string) => Promise<MockFileAttachment>
  onPersisted: (uid: string) => void
}) {
  const rememberUid = (uid: string) => {
    progress.employeeUid = uid
    onPersisted(uid)
  }
  // Remember the committed UID before the repository's follow-up GET can fail.
  const result = await saveEmployee({
    input: {
      ...input,
      photo: progress.photo?.linked ? progress.photo.attachment : input.photo,
    },
    uid: progress.employeeUid,
    onPersisted: rememberUid,
  })
  rememberUid(result.uid)
  if (files.photo) {
    if (progress.photo?.file !== files.photo) {
      progress.photo = {
        file: files.photo,
        attachment: await upload(files.photo, result.uid),
        linked: false,
      }
    }
    const photo = progress.photo!
    if (!photo.linked) {
      await saveEmployee({
        input: { ...input, photo: photo.attachment },
        uid: result.uid,
        onPersisted: (uid) => {
          rememberUid(uid)
          photo.linked = true
        },
      })
      photo.linked = true
    }
  }
  for (const entry of [
    {
      type: 'KTP' as const,
      file: files.nationalId,
      number: input.nationalIdNumber,
      name: 'Foto KTP',
    },
    {
      type: 'KK' as const,
      file: files.familyCard,
      number: input.familyCardNumber,
      name: 'Foto Kartu Keluarga',
    },
  ]) {
    if (!entry.file) continue
    const previous =
      progress.documents[entry.type]?.saved ?? documents[entry.type]
    if (progress.documents[entry.type]?.file !== entry.file) {
      progress.documents[entry.type] = {
        file: entry.file,
        attachment: await upload(entry.file, result.uid),
        saved: previous,
      }
    }
    const uploaded = progress.documents[entry.type]!
    const current = uploaded.saved ?? previous
    if (
      current?.file.uid === uploaded.attachment.uid &&
      current.documentNumber === entry.number
    )
      continue
    uploaded.saved = await saveDocument({
      uid: current?.uid,
      input: {
        employeeUid: result.uid,
        documentType: entry.type,
        name: entry.name,
        documentNumber: entry.number,
        issuedDate: current?.issuedDate,
        expiryDate: current?.expiryDate,
        status: current?.status ?? 'ACTIVE',
        notes: current?.notes,
        file: uploaded.attachment,
      },
    })
  }
  return result
}
