import { useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { Building2, ImagePlus, Info, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  useCompanyProfileSettings,
  useUpdateCompanyProfileSettings,
  useUploadCompanyLogo,
} from './data/queries'
import type {
  CompanyLogo,
  CompanyProfileSettings,
  UpdateCompanyProfileInput,
} from './domain'

type ProfileDraft = UpdateCompanyProfileInput
type ProfileField = Exclude<keyof ProfileDraft, 'logoFileUid'>
type ValidationErrors = Partial<Record<ProfileField, string>>

const acceptedLogoTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maximumLogoSize = 10 * 1024 * 1024

export function CompanyProfileSettingsContent() {
  const settings = useCompanyProfileSettings()

  if (settings.isPending) return <ProfileSkeleton />
  if (settings.isError || !settings.data) {
    return (
      <Alert variant='destructive'>
        <Info />
        <AlertTitle>Profil perusahaan gagal dimuat</AlertTitle>
        <AlertDescription>
          <p>Periksa koneksi layanan lalu coba kembali.</p>
          <Button
            size='sm'
            variant='outline'
            onClick={() => void settings.refetch()}
          >
            Coba lagi
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <CompanyProfileForm
      key={`${settings.data.updatedAt ?? 'initial'}:${settings.data.logo?.uid ?? 'no-logo'}`}
      profile={settings.data}
    />
  )
}

function CompanyProfileForm({ profile }: { profile: CompanyProfileSettings }) {
  const update = useUpdateCompanyProfileSettings()
  const uploadLogo = useUploadCompanyLogo()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<ProfileDraft>(() => profileDraft(profile))
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [uploadedLogo, setUploadedLogo] = useState<CompanyLogo | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const errors = useMemo(() => validateProfile(draft), [draft])
  const isDirty = Boolean(
    logoFile || JSON.stringify(draft) !== JSON.stringify(profileDraft(profile))
  )
  const isSaving = update.isPending || uploadLogo.isPending
  const { confirmation } = useUnsavedChanges(isDirty && !isSaving)

  const currentLogoUrl =
    previewUrl ??
    (draft.logoFileUid ? (uploadedLogo?.url ?? profile.logo?.url) : null)

  const updateField = (field: ProfileField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  const selectLogo = (file?: File) => {
    if (!file) return
    if (!acceptedLogoTypes.has(file.type)) {
      toast.error('Logo harus berformat JPG, PNG, atau WebP.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (file.size > maximumLogoSize) {
      toast.error('Ukuran logo maksimal 10 MB.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setPreviewUrl(URL.createObjectURL(file))
    setLogoFile(file)
    setUploadedLogo(null)
  }

  const removeLogo = () => {
    setPreviewUrl(null)
    setLogoFile(null)
    setUploadedLogo(null)
    setDraft((current) => ({ ...current, logoFileUid: null }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const submit = async () => {
    if (Object.keys(errors).length > 0 || !isDirty) return
    try {
      let logoFileUid = draft.logoFileUid
      if (logoFile) {
        const uploaded =
          uploadedLogo ?? (await uploadLogo.mutateAsync(logoFile))
        setUploadedLogo(uploaded)
        logoFileUid = uploaded.uid
      }
      const savedDraft = {
        companyName: draft.companyName.trim(),
        legalAddress: draft.legalAddress.trim(),
        phone: draft.phone.trim(),
        email: draft.email.trim(),
        website: draft.website.trim(),
        taxNumber: draft.taxNumber.trim(),
        logoFileUid,
      }
      await update.mutateAsync(savedDraft)
      setDraft(savedDraft)
      setLogoFile(null)
      setPreviewUrl(null)
      setConfirmOpen(false)
      toast.success('Profil perusahaan berhasil diperbarui.')
    } catch (error) {
      const message = isAxiosError(error)
        ? error.response?.data?.message
        : undefined
      toast.error(message ?? 'Profil perusahaan belum dapat disimpan.')
    }
  }

  return (
    <div className='space-y-6'>
      <div>
        <div className='flex flex-wrap items-center gap-2'>
          <h2 className='text-xl font-semibold'>Profil Perusahaan</h2>
          <Badge variant='outline'>Global</Badge>
        </div>
        <p className='text-sm text-muted-foreground'>
          Kelola identitas legal dan kontak resmi yang digunakan lintas modul.
        </p>
      </div>

      <Alert className='border-sky-500/40 bg-sky-500/5'>
        <Building2 className='text-sky-700' />
        <AlertTitle>Satu identitas untuk seluruh aplikasi</AlertTitle>
        <AlertDescription>
          Perubahan profil digunakan oleh dokumen dan fitur baru yang mengambil
          identitas perusahaan dari Pengaturan Sistem. Dokumen lama yang sudah
          menjadi snapshot tetap aman.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Identitas Legal</CardTitle>
          <CardDescription>
            Nama resmi, alamat kantor pusat, dan nomor pajak perusahaan.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>
          <ProfileField
            label='Nama perusahaan'
            htmlFor='company-profile-name'
            error={errors.companyName}
            className='sm:col-span-2'
          >
            <Input
              id='company-profile-name'
              value={draft.companyName}
              maxLength={150}
              aria-invalid={Boolean(errors.companyName)}
              onChange={(event) =>
                updateField('companyName', event.target.value)
              }
            />
          </ProfileField>
          <ProfileField
            label='Alamat kantor pusat'
            htmlFor='company-profile-address'
            error={errors.legalAddress}
            className='sm:col-span-2'
          >
            <Textarea
              id='company-profile-address'
              value={draft.legalAddress}
              maxLength={500}
              rows={3}
              aria-invalid={Boolean(errors.legalAddress)}
              onChange={(event) =>
                updateField('legalAddress', event.target.value)
              }
            />
          </ProfileField>
          <ProfileField label='NPWP' htmlFor='company-profile-tax-number'>
            <Input
              id='company-profile-tax-number'
              value={draft.taxNumber}
              maxLength={50}
              onChange={(event) => updateField('taxNumber', event.target.value)}
            />
          </ProfileField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kontak Resmi</CardTitle>
          <CardDescription>
            Informasi kontak dapat dikosongkan jika belum tersedia.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>
          <ProfileField label='Nomor telepon' htmlFor='company-profile-phone'>
            <Input
              id='company-profile-phone'
              inputMode='tel'
              value={draft.phone}
              maxLength={30}
              onChange={(event) => updateField('phone', event.target.value)}
            />
          </ProfileField>
          <ProfileField
            label='Email'
            htmlFor='company-profile-email'
            error={errors.email}
          >
            <Input
              id='company-profile-email'
              type='email'
              value={draft.email}
              maxLength={191}
              aria-invalid={Boolean(errors.email)}
              onChange={(event) => updateField('email', event.target.value)}
            />
          </ProfileField>
          <ProfileField
            label='Website'
            htmlFor='company-profile-website'
            error={errors.website}
            className='sm:col-span-2'
          >
            <Input
              id='company-profile-website'
              type='url'
              value={draft.website}
              maxLength={255}
              placeholder='https://contoh.co.id'
              aria-invalid={Boolean(errors.website)}
              onChange={(event) => updateField('website', event.target.value)}
            />
          </ProfileField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logo Perusahaan</CardTitle>
          <CardDescription>
            Gunakan JPG, PNG, atau WebP maksimal 10 MB. Logo akan disimpan saat
            profil dikonfirmasi.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4 sm:flex-row sm:items-center'>
          <div className='flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40 p-3'>
            {currentLogoUrl ? (
              <img
                src={currentLogoUrl}
                alt='Pratinjau logo perusahaan'
                className='size-full object-contain'
              />
            ) : (
              <Building2 className='size-10 text-muted-foreground' />
            )}
          </div>
          <div className='space-y-3'>
            <div>
              <p className='text-sm font-medium'>
                {logoFile?.name ??
                  (draft.logoFileUid
                    ? profile.logo?.originalName
                    : 'Belum ada logo')}
              </p>
              <p className='text-xs text-muted-foreground'>
                Pilih gambar dengan latar transparan agar hasil dokumen lebih
                rapi.
              </p>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button type='button' variant='outline' asChild>
                <label
                  htmlFor='company-profile-logo'
                  className='cursor-pointer'
                >
                  <ImagePlus /> Pilih logo
                </label>
              </Button>
              <Input
                ref={fileInputRef}
                id='company-profile-logo'
                type='file'
                accept='image/jpeg,image/png,image/webp'
                className='sr-only'
                onChange={(event) => selectLogo(event.target.files?.[0])}
              />
              {(currentLogoUrl || draft.logoFileUid) && (
                <Button type='button' variant='outline' onClick={removeLogo}>
                  <Trash2 /> Hapus logo
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className='sticky bottom-3 z-10 flex flex-col gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-sm text-muted-foreground'>
          {isDirty
            ? 'Ada perubahan profil yang belum disimpan.'
            : 'Semua perubahan sudah tersimpan.'}
        </p>
        <Button
          disabled={!isDirty || Object.keys(errors).length > 0 || isSaving}
          onClick={() => setConfirmOpen(true)}
        >
          <Save /> Simpan perubahan
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => !isSaving && setConfirmOpen(open)}
        title='Simpan profil perusahaan?'
        desc='Identitas terbaru akan digunakan oleh fitur yang membaca profil perusahaan setelah perubahan tersimpan.'
        confirmText='Simpan perubahan'
        isLoading={isSaving}
        handleConfirm={() => void submit()}
      />
      {confirmation}
    </div>
  )
}

function ProfileField({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string
  htmlFor: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className='text-sm font-medium'>
        {label}
      </label>
      <div className='mt-1.5'>{children}</div>
      {error && <p className='mt-1 text-xs text-destructive'>{error}</p>}
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-14 w-72 max-w-full' />
      <Skeleton className='h-64 w-full' />
      <Skeleton className='h-56 w-full' />
    </div>
  )
}

function profileDraft(settings: CompanyProfileSettings): ProfileDraft {
  return {
    companyName: settings.companyName,
    legalAddress: settings.legalAddress,
    phone: settings.phone,
    email: settings.email,
    website: settings.website,
    taxNumber: settings.taxNumber,
    logoFileUid: settings.logo?.uid ?? null,
  }
}

function validateProfile(draft: ProfileDraft): ValidationErrors {
  const errors: ValidationErrors = {}
  if (!draft.companyName.trim()) {
    errors.companyName = 'Nama perusahaan wajib diisi.'
  }
  if (!draft.legalAddress.trim()) {
    errors.legalAddress = 'Alamat kantor pusat wajib diisi.'
  }
  if (
    draft.email.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim())
  ) {
    errors.email = 'Email tidak valid.'
  }
  if (draft.website.trim()) {
    try {
      const parsed = new URL(draft.website.trim())
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
    } catch {
      errors.website = 'Website harus berupa URL lengkap yang valid.'
    }
  }
  return errors
}
