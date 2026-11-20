import type {
  Employee,
  EmployeeDocument,
  EmployeeInput,
  MockFileAttachment,
} from '../domain'

type IdentityType = 'KTP' | 'KK'
type UploadedFile = { file: File; attachment: MockFileAttachment }
export function selectIdentityDocuments(
  documents: EmployeeDocument[] | undefined,
  employeeUid?: string
) {
  const selected: Partial<Record<IdentityType, EmployeeDocument>> = {}
  const ambiguous: IdentityType[] = []
  if (employeeUid) {
    for (const type of ['KTP', 'KK'] as const) {
      const active =
        documents?.filter(
          (document) =>
            document.employeeUid === employeeUid &&
            document.documentType === type &&
            document.status === 'ACTIVE'
        ) ?? []
      if (active.length === 1) selected[type] = active[0]
      else if (active.length > 1) ambiguous.push(type)
    }
  }
  return { selected, ambiguous }
}
export type EmployeeSaveProgress = {
  employeeUid?: string
  photo?: UploadedFile & { linked: boolean }
  documents: Partial<
    Record<
      IdentityType,
      {
        file?: File
        attachment: MockFileAttachment
        saved?: EmployeeDocument
        creationKey?: string
      }
    >
  >
}
export type EmployeeFiles = {
  photo?: File
  nationalId?: File
  familyCard?: File
}
type SaveDocument = (value: {
  uid?: string
  idempotencyKey?: string
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
  for (const type of ['KTP', 'KK'] as const) {
    const current = progress.documents[type]?.saved ?? documents[type]
    if (
      current &&
      (current.employeeUid !== progress.employeeUid ||
        current.status !== 'ACTIVE')
    ) {
      throw new Error(
        'Dokumen identitas aktif tidak sesuai dengan karyawan yang sedang diedit. Muat ulang data terlebih dahulu.'
      )
    }
  }
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
    const previous =
      progress.documents[entry.type]?.saved ?? documents[entry.type]
    if (!entry.file) {
      // Only update the selected active identity document. Preserve its attachment
      // and every other metadata field; never create a document without a file.
      if (!previous || (previous.documentNumber ?? '') === (entry.number ?? ''))
        continue
      const { uid, ...metadata } = previous
      const saved = await saveDocument({
        uid,
        input: { ...metadata, documentNumber: entry.number },
      })
      progress.documents[entry.type] = {
        ...progress.documents[entry.type],
        attachment: saved.file,
        saved,
      }
      continue
    }
    const creationKey = progress.documents[entry.type]?.creationKey
    if (progress.documents[entry.type]?.file !== entry.file) {
      progress.documents[entry.type] = {
        file: entry.file,
        attachment: await upload(entry.file, result.uid),
        saved: previous,
        creationKey,
      }
    }
    const uploaded = progress.documents[entry.type]!
    const current = uploaded.saved ?? previous
    if (
      current?.file.uid === uploaded.attachment.uid &&
      (current.documentNumber ?? '') === (entry.number ?? '')
    )
      continue
    uploaded.saved = await saveDocument({
      uid: current?.uid,
      idempotencyKey: current
        ? undefined
        : (uploaded.creationKey ??= crypto.randomUUID()),
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
