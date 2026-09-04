import { useEffect, useMemo, useRef } from 'react'
import { isAxiosError } from 'axios'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, LoaderCircle, RefreshCcw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { safeInternalReturnTo } from '@/lib/list-return-to'
import { Button } from '@/components/ui/button'
import { Main } from '@/components/layout/main'
import { EmployeeForm } from '@/features/employees/components/employee-form'
import type { MockFileAttachment } from '@/features/employees/domain'
import {
  useConvertRecruitmentCandidate,
  useRecruitmentConversionPrefill,
  useRecruitmentFileBlob,
} from './data'
import type { RecruitmentCandidateFile } from './domain'
import {
  recruitmentConversionInput,
  recruitmentEmployeeDefaults,
} from './utils'

export function RecruitmentConversionPage({
  candidateUid,
  returnTo,
}: {
  candidateUid: string
  returnTo?: string
}) {
  const navigate = useNavigate()
  const prefill = useRecruitmentConversionPrefill(candidateUid)
  const convert = useConvertRecruitmentCandidate()
  const idempotencyKey = useRef(crypto.randomUUID())
  const listReturnTo = safeInternalReturnTo(returnTo, '/karyawan/rekrutmen')
  const candidateFiles = prefill.data?.candidate.files ?? []
  const photoMeta = candidateFiles.find((file) => file.kind === 'PHOTO')
  const ktpMeta = candidateFiles.find((file) => file.kind === 'KTP')
  const kkMeta = candidateFiles.find((file) => file.kind === 'KK')
  const photoBlob = useRecruitmentFileBlob(candidateUid, photoMeta?.uid)
  const ktpBlob = useRecruitmentFileBlob(candidateUid, ktpMeta?.uid)
  const kkBlob = useRecruitmentFileBlob(candidateUid, kkMeta?.uid)
  const photoAttachment = usePrivateFilePreview(photoMeta, photoBlob.data)
  const ktpAttachment = usePrivateFilePreview(ktpMeta, ktpBlob.data)
  const kkAttachment = usePrivateFilePreview(kkMeta, kkBlob.data)

  if (prefill.isPending) {
    return (
      <Main className='grid min-h-72 place-items-center'>
        <p className='flex items-center gap-2 text-muted-foreground'>
          <LoaderCircle className='animate-spin' /> Menyiapkan data pelamar...
        </p>
      </Main>
    )
  }

  if (prefill.isError || !prefill.data) {
    return (
      <Main className='grid min-h-72 place-items-center text-center'>
        <div className='space-y-3'>
          <p className='text-muted-foreground'>
            Data pelamar tidak dapat disiapkan. Kandidat mungkin sudah diproses
            atau statusnya bukan Lolos.
          </p>
          <div className='flex justify-center gap-2'>
            <Button variant='outline' onClick={() => void prefill.refetch()}>
              <RefreshCcw /> Coba lagi
            </Button>
            <Button asChild>
              <Link to={listReturnTo}>Kembali ke Rekrutmen</Link>
            </Button>
          </div>
        </div>
      </Main>
    )
  }

  const source = prefill.data
  const previewQueries = [photoBlob, ktpBlob, kkBlob]
  const previewPending =
    previewQueries.some((query) => query.isPending) ||
    !photoAttachment ||
    !ktpAttachment ||
    !kkAttachment
  const previewError = previewQueries.some((query) => query.isError)

  if (previewError) {
    return (
      <Main className='grid min-h-72 place-items-center text-center'>
        <div className='space-y-3'>
          <p className='text-muted-foreground'>
            Foto pelamar belum berhasil dibuka. Muat ulang foto sebelum
            melengkapi data karyawan.
          </p>
          <div className='flex justify-center gap-2'>
            <Button
              variant='outline'
              onClick={() =>
                void Promise.all(previewQueries.map((query) => query.refetch()))
              }
            >
              <RefreshCcw /> Muat ulang foto
            </Button>
            <Button asChild>
              <Link to={listReturnTo}>Kembali ke Rekrutmen</Link>
            </Button>
          </div>
        </div>
      </Main>
    )
  }

  if (previewPending) {
    return (
      <Main className='grid min-h-72 place-items-center'>
        <p className='flex items-center gap-2 text-muted-foreground'>
          <LoaderCircle className='animate-spin' /> Membuka foto pelamar...
        </p>
      </Main>
    )
  }

  const createDefaults = recruitmentEmployeeDefaults(source.employeeInput)

  return (
    <Main className='max-w-5xl'>
      <Button asChild variant='ghost' className='mb-3 -ml-3'>
        <Link to={listReturnTo}>
          <ArrowLeft /> Rekrutmen
        </Link>
      </Button>
      <div className='mb-6 space-y-3'>
        <div>
          <p className='text-sm font-medium text-primary'>Rekrutmen</p>
          <h1 className='text-2xl font-bold tracking-tight'>
            Lengkapi data karyawan
          </h1>
          <p className='text-muted-foreground'>
            {source.candidate.applicationNumber} · Data dasar pelamar sudah
            diisikan. Lengkapi penempatan sebelum membuat karyawan.
          </p>
        </div>
        <div className='flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm'>
          <ShieldCheck className='mt-0.5 size-5 shrink-0 text-primary' />
          <p>
            Karyawan dibuat dengan status <strong>Nonaktif</strong>. Foto, KTP,
            dan KK dari lamaran disalin otomatis. Aktivasi tetap dilakukan
            melalui proses kontrak yang berlaku.
          </p>
        </div>
      </div>

      <EmployeeForm
        createDefaults={createDefaults}
        lockCreateSite
        inheritedRecruitmentDocuments={source.candidate.files.map(
          (file) => file.kind
        )}
        inheritedRecruitmentAttachments={{
          PHOTO: photoAttachment,
          KTP: ktpAttachment,
          KK: kkAttachment,
        }}
        isPending={convert.isPending}
        submitLabel='Buat karyawan dari pelamar'
        onSubmit={async (input) => {
          try {
            const result = await convert.mutateAsync({
              uid: candidateUid,
              currentUpdatedAt: source.candidate.updatedAt,
              idempotencyKey: idempotencyKey.current,
              input: recruitmentConversionInput(input),
            })
            toast.success(
              result.replayed
                ? 'Karyawan sudah pernah dibuat. Data terbaru dibuka kembali.'
                : `Karyawan ${result.employee.employeeNumber} berhasil dibuat.`
            )
            await navigate({
              to: '/karyawan/data-karyawan/$employeeUid',
              params: { employeeUid: result.employee.uid },
              search: { returnTo: listReturnTo },
              ignoreBlocker: true,
            })
          } catch (error) {
            toast.error(
              isAxiosError<{ message?: string }>(error)
                ? (error.response?.data?.message ??
                    'Karyawan belum berhasil dibuat. Periksa data lalu coba lagi.')
                : 'Karyawan belum berhasil dibuat. Periksa data lalu coba lagi.'
            )
            throw error
          }
        }}
        onCancel={() => navigate({ to: listReturnTo })}
      />
    </Main>
  )
}

function usePrivateFilePreview(file?: RecruitmentCandidateFile, blob?: Blob) {
  const attachment = useMemo<MockFileAttachment | undefined>(() => {
    if (!file || !blob) return undefined
    return {
      uid: file.uid,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      extension: file.originalName.split('.').pop(),
      // URL ini dimiliki halaman konversi. Jangan tandai sebagai temporaryUrl
      // milik EmployeeForm karena cleanup Strict Mode dapat mencabutnya saat
      // komponen form baru dipasang.
      url: URL.createObjectURL(blob),
    }
  }, [blob, file])

  useEffect(
    () => () => {
      if (attachment?.url) {
        URL.revokeObjectURL(attachment.url)
      }
    },
    [attachment]
  )

  return attachment
}
