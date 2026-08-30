import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  Check,
  Clock3,
  KeyRound,
  MapPinned,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Main } from '@/components/layout/main'
import { PasswordInput } from '@/components/password-input'
import type { UserProfile } from './domain'
import {
  changeMyPassword,
  getMyProfile,
  updateMyProfile,
} from './http-profile-repository'
import {
  normalizeProfileDraft,
  type PasswordDraft,
  type ProfileDraft,
  validatePasswordDraft,
  validateProfileDraft,
} from './profile-form-utils'
import { getUserInitials } from './profile-utils'

const emptyPasswordDraft: PasswordDraft = {
  currentPassword: '',
  newPassword: '',
  confirmation: '',
}

export function ProfilePage() {
  const mustChangePassword = useAuthStore(
    (state) => state.session?.user.mustChangePassword
  )
  const query = useQuery({
    queryKey: ['auth', 'profile'],
    queryFn: getMyProfile,
    staleTime: 5 * 60 * 1000,
  })

  return (
    <Main>
      <div className='mx-auto w-full max-w-5xl space-y-5'>
        <div>
          <p className='text-sm font-medium text-primary'>Akun</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Profil Saya
          </h1>
          <p className='text-sm text-muted-foreground'>
            Perbarui informasi akun dan jaga keamanan kata sandi Anda.
          </p>
        </div>

        {mustChangePassword && (
          <Alert className='border-amber-500/40 bg-amber-500/5'>
            <KeyRound className='text-amber-700' />
            <AlertTitle>Ganti kata sandi sementara</AlertTitle>
            <AlertDescription>
              Demi keamanan akun, buat kata sandi baru terlebih dahulu. Setelah
              berhasil, seluruh menu dapat digunakan kembali.
            </AlertDescription>
          </Alert>
        )}

        {query.isPending ? (
          <ProfileSkeleton />
        ) : query.isError ? (
          <Alert variant='destructive'>
            <UserRound />
            <AlertTitle>Profil belum dapat dimuat</AlertTitle>
            <AlertDescription>
              <p>Periksa koneksi lalu coba muat kembali halaman ini.</p>
              <Button
                size='sm'
                variant='outline'
                className='mt-2'
                onClick={() => void query.refetch()}
              >
                <RefreshCw /> Coba lagi
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <ProfileContent profile={query.data} />
        )}
      </div>
    </Main>
  )
}

function ProfileContent({ profile }: { profile: UserProfile }) {
  const queryClient = useQueryClient()
  const refreshSession = useAuthStore((state) => state.refreshSession)
  const initialDraft = useMemo(() => profileDraft(profile), [profile])
  const [draft, setDraft] = useState<ProfileDraft>(initialDraft)
  const [passwordDraft, setPasswordDraft] =
    useState<PasswordDraft>(emptyPasswordDraft)
  const [passwordAttempted, setPasswordAttempted] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const profileErrors = useMemo(() => validateProfileDraft(draft), [draft])
  const passwordErrors = useMemo(
    () => validatePasswordDraft(passwordDraft),
    [passwordDraft]
  )
  const isProfileDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft)
  const isPasswordDirty = Object.values(passwordDraft).some(Boolean)
  const hasAllSiteAccess = profile.roles.some(
    (role) => role.code === 'SUPER_ADMIN'
  )

  const profileMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: async (_result, variables) => {
      setConfirmOpen(false)
      queryClient.setQueryData<UserProfile>(['auth', 'profile'], (current) =>
        current ? { ...current, ...variables } : current
      )
      setDraft({
        fullName: variables.fullName,
        username: variables.username,
        email: variables.email ?? '',
        phone: variables.phone ?? '',
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['auth', 'profile'] }),
        refreshSession(),
      ])
      toast.success('Informasi akun berhasil diperbarui.')
    },
    onError: (error) =>
      toast.error(apiMessage(error, 'Informasi akun belum dapat disimpan.')),
  })

  const passwordMutation = useMutation({
    mutationFn: changeMyPassword,
    onSuccess: async () => {
      setPasswordDraft(emptyPasswordDraft)
      setPasswordAttempted(false)
      await refreshSession()
      toast.success('Kata sandi berhasil diganti.')
    },
    onError: (error) =>
      toast.error(apiMessage(error, 'Kata sandi belum dapat diganti.')),
  })

  const isSaving = profileMutation.isPending || passwordMutation.isPending
  const { confirmation } = useUnsavedChanges(
    (isProfileDirty || isPasswordDirty) && !isSaving
  )

  const updateProfileField = (field: keyof ProfileDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const submitPassword = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPasswordAttempted(true)
    if (Object.keys(passwordErrors).length > 0) return
    passwordMutation.mutate({
      currentPassword: passwordDraft.currentPassword,
      newPassword: passwordDraft.newPassword,
    })
  }

  return (
    <>
      <ProfileHero profile={profile} />

      <div className='grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]'>
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2 text-base'>
              <UserRound className='size-4 text-primary' /> Informasi akun
            </CardTitle>
            <CardDescription>
              Informasi ini digunakan untuk mengenali akun Anda di HRIS.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField
                label='Nama lengkap'
                htmlFor='profile-full-name'
                error={profileErrors.fullName}
                className='sm:col-span-2'
              >
                <Input
                  id='profile-full-name'
                  value={draft.fullName}
                  maxLength={150}
                  autoComplete='name'
                  aria-invalid={Boolean(profileErrors.fullName)}
                  onChange={(event) =>
                    updateProfileField('fullName', event.target.value)
                  }
                />
              </FormField>
              <FormField
                label='Username'
                htmlFor='profile-username'
                error={profileErrors.username}
                hint='Huruf, angka, titik, garis bawah, atau tanda minus.'
              >
                <Input
                  id='profile-username'
                  value={draft.username}
                  maxLength={100}
                  autoCapitalize='none'
                  autoComplete='username'
                  aria-invalid={Boolean(profileErrors.username)}
                  onChange={(event) =>
                    updateProfileField('username', event.target.value)
                  }
                />
              </FormField>
              <FormField
                label='Email (opsional)'
                htmlFor='profile-email'
                error={profileErrors.email}
              >
                <Input
                  id='profile-email'
                  type='email'
                  value={draft.email}
                  maxLength={191}
                  autoComplete='email'
                  placeholder='nama@perusahaan.com'
                  aria-invalid={Boolean(profileErrors.email)}
                  onChange={(event) =>
                    updateProfileField('email', event.target.value)
                  }
                />
              </FormField>
              <FormField
                label='Nomor telepon (opsional)'
                htmlFor='profile-phone'
                error={profileErrors.phone}
                className='sm:col-span-2'
              >
                <Input
                  id='profile-phone'
                  inputMode='tel'
                  value={draft.phone}
                  maxLength={30}
                  autoComplete='tel'
                  placeholder='Contoh: 0812 3456 7890'
                  aria-invalid={Boolean(profileErrors.phone)}
                  onChange={(event) =>
                    updateProfileField('phone', event.target.value)
                  }
                />
              </FormField>
            </div>

            <div className='flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between'>
              <p className='text-xs text-muted-foreground'>
                {isProfileDirty
                  ? 'Ada perubahan informasi yang belum disimpan.'
                  : 'Informasi akun sudah tersimpan.'}
              </p>
              <div className='flex gap-2 sm:justify-end'>
                <Button
                  type='button'
                  variant='outline'
                  className='flex-1 sm:flex-none'
                  disabled={!isProfileDirty || profileMutation.isPending}
                  onClick={() => setDraft(initialDraft)}
                >
                  <RotateCcw /> Batalkan
                </Button>
                <Button
                  type='button'
                  className='flex-1 sm:flex-none'
                  disabled={
                    !isProfileDirty ||
                    Object.keys(profileErrors).length > 0 ||
                    profileMutation.isPending
                  }
                  onClick={() => setConfirmOpen(true)}
                >
                  <Save /> Simpan
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <AccessCard profile={profile} hasAllSiteAccess={hasAllSiteAccess} />
      </div>

      <PasswordCard
        draft={passwordDraft}
        setDraft={setPasswordDraft}
        errors={passwordErrors}
        attempted={passwordAttempted}
        isPending={passwordMutation.isPending}
        isDirty={isPasswordDirty}
        onReset={() => {
          setPasswordDraft(emptyPasswordDraft)
          setPasswordAttempted(false)
        }}
        onSubmit={submitPassword}
      />

      <p className='text-center text-xs text-muted-foreground'>
        Role dan akses site hanya dapat diubah oleh Administrator HRIS.
      </p>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) =>
          !profileMutation.isPending && setConfirmOpen(open)
        }
        title='Simpan perubahan akun?'
        desc='Nama, username, dan informasi kontak terbaru akan digunakan pada akun Anda.'
        confirmText='Simpan perubahan'
        isLoading={profileMutation.isPending}
        handleConfirm={() =>
          profileMutation.mutate(normalizeProfileDraft(draft))
        }
      />
      {confirmation}
    </>
  )
}

function ProfileHero({ profile }: { profile: UserProfile }) {
  return (
    <section className='overflow-hidden rounded-xl border bg-card shadow-sm'>
      <div className='h-20 bg-gradient-to-r from-primary to-primary/75 sm:h-24' />
      <div className='px-4 pb-5 sm:px-6'>
        <Avatar className='-mt-10 size-20 border-4 border-card shadow-sm sm:-mt-12 sm:size-24'>
          <AvatarFallback className='bg-primary text-xl font-semibold text-primary-foreground sm:text-2xl'>
            {getUserInitials(profile.fullName)}
          </AvatarFallback>
        </Avatar>
        <div className='mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between'>
          <div className='min-w-0'>
            <h2 className='truncate text-xl font-bold sm:text-2xl'>
              {profile.fullName}
            </h2>
            <p className='truncate text-sm text-muted-foreground'>
              @{profile.username}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            {profile.roles.map((role) => (
              <Badge key={role.code} variant='secondary' className='gap-1.5'>
                <ShieldCheck className='size-3.5' /> {role.name}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function AccessCard({
  profile,
  hasAllSiteAccess,
}: {
  profile: UserProfile
  hasAllSiteAccess: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <Building2 className='size-4 text-primary' /> Akses kerja
        </CardTitle>
        <CardDescription>
          Ringkasan status, role, dan site yang dapat Anda akses.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <div className='grid grid-cols-2 gap-3'>
          <div className='rounded-lg border bg-muted/20 p-3'>
            <p className='text-xs text-muted-foreground'>Status akun</p>
            <Badge
              variant={profile.status === 'ACTIVE' ? 'outline' : 'secondary'}
              className={
                profile.status === 'ACTIVE'
                  ? 'mt-2 border-positive/40 text-positive'
                  : 'mt-2'
              }
            >
              {profile.status === 'ACTIVE' ? 'Aktif' : profile.status}
            </Badge>
          </div>
          <div className='rounded-lg border bg-muted/20 p-3'>
            <p className='text-xs text-muted-foreground'>Terakhir masuk</p>
            <p className='mt-2 flex items-start gap-1.5 text-xs font-medium'>
              <Clock3 className='mt-0.5 size-3.5 shrink-0 text-muted-foreground' />
              {formatDateTime(profile.lastLoginAt)}
            </p>
          </div>
        </div>
        <div>
          <p className='mb-2 text-xs text-muted-foreground'>Role</p>
          <div className='flex flex-wrap gap-2'>
            {profile.roles.map((role) => (
              <Badge key={role.code} variant='secondary'>
                <ShieldCheck className='mr-1 size-3.5' /> {role.name}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <p className='mb-2 text-xs text-muted-foreground'>Akses site</p>
          {hasAllSiteAccess ? (
            <div className='flex items-center gap-3 rounded-lg border bg-muted/30 p-3'>
              <MapPinned className='size-5 shrink-0 text-positive' />
              <div>
                <p className='text-sm font-medium'>Seluruh site</p>
                <p className='text-xs text-muted-foreground'>
                  Jepara, Semarang, dan Klaten
                </p>
              </div>
            </div>
          ) : profile.siteAccess.length > 0 ? (
            <div className='flex flex-wrap gap-2'>
              {profile.siteAccess.map((site) => (
                <Badge
                  key={site.code}
                  variant='outline'
                  className='gap-1.5 py-1'
                >
                  <MapPinned className='size-3.5 text-positive' /> {site.name}
                </Badge>
              ))}
            </div>
          ) : (
            <div className='rounded-lg border border-dashed p-4 text-sm text-muted-foreground'>
              Belum ada akses site untuk akun ini.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function PasswordCard({
  draft,
  setDraft,
  errors,
  attempted,
  isPending,
  isDirty,
  onReset,
  onSubmit,
}: {
  draft: PasswordDraft
  setDraft: React.Dispatch<React.SetStateAction<PasswordDraft>>
  errors: ReturnType<typeof validatePasswordDraft>
  attempted: boolean
  isPending: boolean
  isDirty: boolean
  onReset: () => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <KeyRound className='size-4 text-primary' /> Ganti kata sandi
        </CardTitle>
        <CardDescription>
          Gunakan kata sandi yang tidak mudah ditebak dan belum pernah
          dibagikan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className='grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(16rem,2fr)]'
          onSubmit={onSubmit}
        >
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              label='Kata sandi saat ini'
              htmlFor='current-password'
              error={attempted ? errors.currentPassword : undefined}
              className='sm:col-span-2'
            >
              <PasswordInput
                id='current-password'
                value={draft.currentPassword}
                maxLength={128}
                autoComplete='current-password'
                aria-invalid={attempted && Boolean(errors.currentPassword)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    currentPassword: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField
              label='Kata sandi baru'
              htmlFor='new-password'
              error={attempted ? errors.newPassword : undefined}
            >
              <PasswordInput
                id='new-password'
                value={draft.newPassword}
                maxLength={128}
                autoComplete='new-password'
                aria-invalid={attempted && Boolean(errors.newPassword)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    newPassword: event.target.value,
                  }))
                }
              />
            </FormField>
            <FormField
              label='Ulangi kata sandi baru'
              htmlFor='password-confirmation'
              error={attempted ? errors.confirmation : undefined}
            >
              <PasswordInput
                id='password-confirmation'
                value={draft.confirmation}
                maxLength={128}
                autoComplete='new-password'
                aria-invalid={attempted && Boolean(errors.confirmation)}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    confirmation: event.target.value,
                  }))
                }
              />
            </FormField>
            <div className='flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:justify-end'>
              <Button
                type='button'
                variant='outline'
                disabled={!isDirty || isPending}
                onClick={onReset}
              >
                Kosongkan
              </Button>
              <Button type='submit' disabled={isPending}>
                <KeyRound /> {isPending ? 'Mengganti...' : 'Ganti kata sandi'}
              </Button>
            </div>
          </div>

          <div className='rounded-lg border bg-muted/30 p-4'>
            <p className='text-sm font-medium'>Syarat kata sandi baru</p>
            <div className='mt-3 space-y-2'>
              <PasswordRequirement
                met={draft.newPassword.length >= 8}
                label='Minimal 8 karakter'
              />
              <PasswordRequirement
                met={/[A-Za-z]/.test(draft.newPassword)}
                label='Memiliki minimal satu huruf'
              />
              <PasswordRequirement
                met={/\d/.test(draft.newPassword)}
                label='Memiliki minimal satu angka'
              />
              <PasswordRequirement
                met={
                  Boolean(draft.confirmation) &&
                  draft.confirmation === draft.newPassword
                }
                label='Konfirmasi kata sandi sama'
              />
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function FormField({
  label,
  htmlFor,
  error,
  hint,
  className,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className='text-sm font-medium'>
        {label}
      </label>
      <div className='mt-1.5'>{children}</div>
      {(error || hint) && (
        <p
          className={
            error
              ? 'mt-1 text-xs text-destructive'
              : 'mt-1 text-xs text-muted-foreground'
          }
        >
          {error ?? hint}
        </p>
      )}
    </div>
  )
}

function PasswordRequirement({ met, label }: { met: boolean; label: string }) {
  return (
    <p
      className={
        met
          ? 'flex items-center gap-2 text-xs text-positive'
          : 'flex items-center gap-2 text-xs text-muted-foreground'
      }
    >
      <span
        className={
          met
            ? 'flex size-4 items-center justify-center rounded-full bg-positive/15'
            : 'size-4 rounded-full border'
        }
        aria-hidden='true'
      >
        {met && <Check className='size-3' />}
      </span>
      {label}
    </p>
  )
}

function ProfileSkeleton() {
  return (
    <div className='space-y-4' aria-label='Memuat profil'>
      <Skeleton className='h-60 w-full rounded-xl' />
      <div className='grid gap-4 lg:grid-cols-2'>
        <Skeleton className='h-96 w-full rounded-xl' />
        <Skeleton className='h-72 w-full rounded-xl' />
      </div>
      <Skeleton className='h-96 w-full rounded-xl' />
    </div>
  )
}

function profileDraft(profile: UserProfile): ProfileDraft {
  return {
    fullName: profile.fullName,
    username: profile.username,
    email: profile.email ?? '',
    phone: profile.phone ?? '',
  }
}

function formatDateTime(value: string | null) {
  if (!value) return 'Belum pernah masuk'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}
