import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  FileImage,
  LoaderCircle,
  RefreshCcw,
  Save,
  UserRoundCheck,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { educationLevelLabel } from '@/features/employees/education-level'
import {
  getRecruitmentFile,
  useRecruitmentCandidate,
  useSaveRecruitmentNotes,
  useTransitionRecruitmentCandidate,
} from './data'
import type {
  RecruitmentCandidateListItem,
  RecruitmentCandidateFile,
  RecruitmentStatus,
} from './domain'
import { RecruitmentStatusBadge } from './recruitment-columns'
import {
  formatFileSize,
  formatRecruitmentDateTime,
  recruitmentActionLabel,
  recruitmentFileLabel,
  recruitmentStatusLabel,
  visibleRecruitmentActions,
} from './utils'

export function RecruitmentCandidateCard({
  candidate,
  onDetail,
}: {
  candidate: RecruitmentCandidateListItem
  onDetail: () => void
}) {
  return (
    <Card>
      <CardContent className='p-4'>
        <div className='flex items-start justify-between gap-3'>
          <button type='button' className='text-left' onClick={onDetail}>
            <p className='font-semibold hover:underline'>
              {candidate.fullName}
            </p>
            <p className='text-xs text-muted-foreground'>
              {candidate.applicationNumber} · {candidate.site.name}
            </p>
          </button>
          <RecruitmentStatusBadge status={candidate.status} />
        </div>
        <div className='mt-3 grid grid-cols-2 gap-2 text-sm'>
          <Info label='Nomor HP' value={candidate.phone} />
          <Info label='NIK' value={candidate.nationalIdMasked} />
          <Info
            label='Tanggal daftar'
            value={formatRecruitmentDateTime(candidate.submittedAt)}
          />
        </div>
        <Button
          variant='outline'
          size='sm'
          className='mt-4 w-full'
          onClick={onDetail}
        >
          <Eye /> Lihat detail
        </Button>
      </CardContent>
    </Card>
  )
}

export function RecruitmentDetailSheet({
  uid,
  returnTo,
  open,
  onOpenChange,
}: {
  uid?: string
  returnTo?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const result = useRecruitmentCandidate(open ? uid : undefined)
  const detail = result.data
  const [transition, setTransition] = useState<RecruitmentStatus>()
  const navigate = useNavigate()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='w-full overflow-y-auto p-0 sm:max-w-3xl'>
        <SheetHeader className='sticky top-0 z-10 border-b bg-background pe-12'>
          <SheetTitle>Detail Pelamar</SheetTitle>
          <SheetDescription>
            Biodata, dokumen, catatan, dan riwayat proses rekrutmen.
          </SheetDescription>
        </SheetHeader>
        {result.isPending ? (
          <State text='Memuat detail pelamar...' loading />
        ) : result.isError || !detail ? (
          <State text='Detail pelamar gagal dimuat.'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => void result.refetch()}
            >
              <RefreshCcw /> Coba lagi
            </Button>
          </State>
        ) : (
          <div className='space-y-6 p-4 sm:p-6'>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
              <div>
                <h2 className='text-xl font-semibold'>{detail.fullName}</h2>
                <p className='text-sm text-muted-foreground'>
                  {detail.applicationNumber} · {detail.site.name}
                </p>
                <p className='text-xs text-muted-foreground'>
                  Didaftarkan {formatRecruitmentDateTime(detail.submittedAt)}
                </p>
              </div>
              <RecruitmentStatusBadge status={detail.status} />
            </div>

            <Section title='Biodata pelamar'>
              <dl className='grid gap-3 rounded-lg border p-4 sm:grid-cols-2'>
                <Info label='NIK' value={detail.nationalIdNumber} />
                <Info label='Nomor KK' value={detail.familyCardNumber} />
                <Info
                  label='Jenis kelamin'
                  value={detail.gender === 'MALE' ? 'Laki-laki' : 'Perempuan'}
                />
                <Info
                  label='Tempat, tanggal lahir'
                  value={`${detail.birthPlace}, ${dateLabel(detail.birthDate)}`}
                />
                <Info
                  label='Pendidikan terakhir'
                  value={educationLevelLabel(detail.educationLevel) ?? '—'}
                />
                <Info label='Nomor HP/WhatsApp' value={detail.phone} />
                <Info label='Email' value={detail.email || 'Tidak diisi'} />
                <div className='sm:col-span-2'>
                  <Info label='Alamat sesuai KTP' value={detail.address} />
                </div>
              </dl>
            </Section>

            <Section
              title='Dokumen pelamar'
              description='Dokumen hanya dimuat saat dibuka dan tidak memiliki tautan permanen.'
            >
              <div className='grid gap-3 sm:grid-cols-3'>
                {detail.files.map((file) => (
                  <PrivateImage
                    key={file.uid}
                    candidateUid={detail.uid}
                    file={file}
                  />
                ))}
              </div>
            </Section>

            <InternalNotes
              key={`${detail.uid}:${detail.updatedAt}`}
              uid={detail.uid}
              initialValue={detail.internalNotes}
              currentUpdatedAt={detail.updatedAt}
              canManage={detail.canManage}
            />

            <Section title='Riwayat status'>
              <ol className='space-y-3'>
                {detail.statusHistory.map((event) => (
                  <li
                    key={event.uid}
                    className='relative rounded-lg border p-4'
                  >
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <div className='flex items-center gap-2'>
                        <RecruitmentStatusBadge status={event.toStatus} />
                        {event.fromStatus && (
                          <span className='text-xs text-muted-foreground'>
                            dari {recruitmentStatusLabel(event.fromStatus)}
                          </span>
                        )}
                      </div>
                      <time className='text-xs text-muted-foreground'>
                        {formatRecruitmentDateTime(event.occurredAt)}
                      </time>
                    </div>
                    <p className='mt-2 text-sm text-muted-foreground'>
                      {event.actorName ||
                        (event.eventSource === 'PUBLIC_SUBMISSION'
                          ? 'Pelamar'
                          : 'Sistem')}
                    </p>
                    {event.applicantReason && (
                      <p className='mt-2 text-sm'>
                        Alasan untuk pelamar: {event.applicantReason}
                      </p>
                    )}
                    {event.internalNotes && (
                      <p className='mt-1 text-sm'>
                        Catatan HR: {event.internalNotes}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </Section>

            {detail.canManage &&
              detail.status === 'PASSED' &&
              !detail.employeeUid && (
                <div className='rounded-lg border border-positive/30 bg-positive/5 p-4'>
                  <p className='font-semibold text-positive'>
                    Kandidat lolos - lanjutkan ke Master Karyawan
                  </p>
                  <p className='mt-1 text-sm text-muted-foreground'>
                    Lengkapi data penempatan. Karyawan akan dibuat Nonaktif dan
                    baru diaktifkan melalui proses kontrak.
                  </p>
                  <Button
                    className='mt-3'
                    onClick={() =>
                      void navigate({
                        to: '/karyawan/rekrutmen/$candidateUid/lengkapi',
                        params: { candidateUid: detail.uid },
                        search: { returnTo },
                      })
                    }
                  >
                    <UserRoundCheck /> Lengkapi data & buat karyawan
                  </Button>
                </div>
              )}

            {visibleRecruitmentActions(
              detail.canManage,
              detail.allowedTransitions
            ).length > 0 && (
              <Section title='Ubah status kandidat'>
                <div className='flex flex-wrap gap-2'>
                  {visibleRecruitmentActions(
                    detail.canManage,
                    detail.allowedTransitions
                  ).map((status) => (
                    <Button
                      key={status}
                      variant={
                        status === 'REJECTED' ? 'destructive' : 'outline'
                      }
                      onClick={() => setTransition(status)}
                    >
                      {transitionIcon(status)}{' '}
                      {recruitmentActionLabel(status, detail.status)}
                    </Button>
                  ))}
                </div>
              </Section>
            )}
            {detail.employeeUid && (
              <Button variant='outline' asChild>
                <Link
                  to='/karyawan/data-karyawan/$employeeUid'
                  params={{ employeeUid: detail.employeeUid }}
                  search={{ returnTo }}
                >
                  <UserRoundCheck /> Buka data karyawan
                </Link>
              </Button>
            )}
          </div>
        )}
      </SheetContent>
      {detail && transition && (
        <TransitionDialog
          detail={detail}
          target={transition}
          open
          onOpenChange={(next) => !next && setTransition(undefined)}
        />
      )}
    </Sheet>
  )
}

function PrivateImage({
  candidateUid,
  file,
}: {
  candidateUid: string
  file: RecruitmentCandidateFile
}) {
  const [url, setUrl] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url]
  )
  const open = async () => {
    setLoading(true)
    setFailed(false)
    try {
      const blob = await getRecruitmentFile(candidateUid, file.uid)
      setUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return URL.createObjectURL(blob)
      })
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }
  return (
    <div className='overflow-hidden rounded-lg border'>
      <div className='flex aspect-4/3 items-center justify-center bg-muted/40'>
        {url ? (
          <img
            src={url}
            alt={recruitmentFileLabel(file.kind)}
            className='size-full object-contain'
          />
        ) : (
          <FileImage className='size-9 text-muted-foreground' aria-hidden />
        )}
      </div>
      <div className='space-y-2 p-3'>
        <div>
          <p className='text-sm font-medium'>
            {recruitmentFileLabel(file.kind)}
          </p>
          <p className='text-xs text-muted-foreground'>
            {formatFileSize(file.sizeBytes)}
          </p>
        </div>
        {failed && (
          <p role='alert' className='text-xs text-destructive'>
            Dokumen gagal dibuka.
          </p>
        )}
        <Button
          variant='outline'
          size='sm'
          className='w-full'
          disabled={loading}
          onClick={() => void open()}
        >
          {loading ? <LoaderCircle className='animate-spin' /> : <Eye />}
          {url ? 'Muat ulang' : 'Buka dokumen'}
        </Button>
      </div>
    </div>
  )
}

function InternalNotes({
  uid,
  initialValue,
  currentUpdatedAt,
  canManage,
}: {
  uid: string
  initialValue: string | null
  currentUpdatedAt: string
  canManage: boolean
}) {
  const [value, setValue] = useState(initialValue ?? '')
  const mutation = useSaveRecruitmentNotes()
  return (
    <Section
      title='Catatan internal HR'
      description='Catatan ini tidak pernah ditampilkan kepada pelamar.'
    >
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        readOnly={!canManage}
        aria-label='Catatan internal HR'
        placeholder={
          canManage
            ? 'Tambahkan catatan untuk tim HR...'
            : 'Belum ada catatan internal.'
        }
        className='min-h-28'
      />
      {canManage && (
        <Button
          size='sm'
          disabled={mutation.isPending || value === (initialValue ?? '')}
          onClick={() =>
            mutation.mutate(
              { uid, internalNotes: value.trim() || null, currentUpdatedAt },
              {
                onSuccess: () => toast.success('Catatan internal disimpan.'),
                onError: () =>
                  toast.error(
                    'Catatan gagal disimpan. Muat ulang lalu coba lagi.'
                  ),
              }
            )
          }
        >
          {mutation.isPending ? (
            <LoaderCircle className='animate-spin' />
          ) : (
            <Save />
          )}{' '}
          Simpan catatan
        </Button>
      )}
    </Section>
  )
}

function TransitionDialog({
  detail,
  target,
  open,
  onOpenChange,
}: {
  detail: { uid: string; fullName: string; status: RecruitmentStatus }
  target: RecruitmentStatus
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mutation = useTransitionRecruitmentCandidate()
  const [applicantReason, setApplicantReason] = useState('')
  const [internalNotes, setInternalNotes] = useState('')
  const rejecting = target === 'REJECTED'
  const invalid = rejecting && applicantReason.trim().length < 5
  const submit = () =>
    mutation.mutate(
      {
        uid: detail.uid,
        toStatus: target,
        currentStatus: detail.status,
        idempotencyKey: crypto.randomUUID(),
        applicantReason: rejecting ? applicantReason.trim() : undefined,
        internalNotes: internalNotes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Status ${detail.fullName} diperbarui.`)
          onOpenChange(false)
        },
        onError: () =>
          toast.error('Status gagal diperbarui. Muat ulang lalu coba lagi.'),
      }
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {recruitmentActionLabel(target, detail.status)}?
          </DialogTitle>
          <DialogDescription>
            Status {detail.fullName} akan berubah dari{' '}
            {recruitmentStatusLabel(detail.status)} menjadi{' '}
            {recruitmentStatusLabel(target)}.
          </DialogDescription>
        </DialogHeader>
        {rejecting && (
          <div className='grid gap-2'>
            <Label htmlFor='applicant-reason'>Alasan untuk pelamar</Label>
            <Textarea
              id='applicant-reason'
              value={applicantReason}
              onChange={(event) => setApplicantReason(event.target.value)}
              placeholder='Gunakan bahasa yang sopan dan mudah dipahami.'
            />
            <p className='text-xs text-muted-foreground'>
              Alasan ini dapat dilihat pelamar jika mendaftar kembali.
            </p>
          </div>
        )}
        <div className='grid gap-2'>
          <Label htmlFor='transition-notes'>
            Catatan internal HR (opsional)
          </Label>
          <Textarea
            id='transition-notes'
            value={internalNotes}
            onChange={(event) => setInternalNotes(event.target.value)}
            placeholder='Tidak akan ditampilkan kepada pelamar.'
          />
        </div>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Batal
          </Button>
          <Button
            variant={rejecting ? 'destructive' : 'default'}
            disabled={mutation.isPending || invalid}
            onClick={submit}
          >
            {mutation.isPending ? (
              <LoaderCircle className='animate-spin' />
            ) : (
              transitionIcon(target)
            )}{' '}
            Konfirmasi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className='space-y-2'>
      <div>
        <h3 className='font-semibold'>{title}</h3>
        {description && (
          <p className='text-xs text-muted-foreground'>{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='text-sm font-medium break-words'>{value}</p>
    </div>
  )
}
function State({
  text,
  loading,
  children,
}: {
  text: string
  loading?: boolean
  children?: ReactNode
}) {
  return (
    <div
      role='status'
      className='grid justify-items-center gap-3 p-12 text-center text-muted-foreground'
    >
      {loading && <LoaderCircle className='animate-spin' />}
      <p>{text}</p>
      {children}
    </div>
  )
}
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(
    new Date(`${value}T00:00:00`)
  )
}
function transitionIcon(status: RecruitmentStatus) {
  if (status === 'REJECTED') return <XCircle />
  if (status === 'PASSED') return <CheckCircle2 />
  return <ArrowRight />
}
