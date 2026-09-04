import { useRef } from 'react'
import { isAxiosError } from 'axios'
import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, LoaderCircle, RefreshCcw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { safeInternalReturnTo } from '@/lib/list-return-to'
import { Button } from '@/components/ui/button'
import { Main } from '@/components/layout/main'
import { EmployeeForm } from '@/features/employees/components/employee-form'
import {
  useConvertRecruitmentCandidate,
  useRecruitmentConversionPrefill,
} from './data'
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
