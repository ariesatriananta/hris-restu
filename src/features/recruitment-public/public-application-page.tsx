import { useCallback, useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  FileCheck2,
  Loader2,
  LockKeyhole,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import type {
  RecruitmentEligibility,
  RecruitmentFiles,
  RecruitmentFormValues,
  RecruitmentPublicConfig,
  RecruitmentReceipt,
} from './domain'
import { ImageUploadField } from './image-upload-field'
import {
  checkRecruitmentIdentity,
  getRecruitmentPublicConfig,
  PublicRecruitmentError,
  submitRecruitmentApplication,
} from './public-api'
import { TurnstileWidget } from './turnstile-widget'
import {
  type FieldErrors,
  missingRecruitmentFiles,
  validateIdentity,
  validateRecruitmentForm,
} from './validation'

type Step = 'IDENTITY' | 'FORM' | 'SUCCESS'
type FileErrors = Partial<Record<keyof RecruitmentFiles, string>>

const emptyValues: RecruitmentFormValues = {
  nationalIdNumber: '',
  familyCardNumber: '',
  birthDate: '',
  fullName: '',
  gender: '',
  birthPlace: '',
  address: '',
  phone: '',
  email: '',
  privacyConsent: false,
}
const emptyFiles: RecruitmentFiles = { photo: null, ktp: null, kk: null }

function friendlyError(error: unknown) {
  if (error instanceof PublicRecruitmentError) return error.message
  if (error instanceof TypeError)
    return 'Tidak dapat terhubung ke layanan. Periksa koneksi internet lalu coba lagi.'
  return 'Terjadi gangguan. Silakan coba kembali beberapa saat lagi.'
}

function FormField({
  id,
  label,
  required = true,
  error,
  children,
}: {
  id: string
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className='text-destructive'>*</span>
        ) : (
          <span className='font-normal text-muted-foreground'>(opsional)</span>
        )}
      </Label>
      {children}
      {error && (
        <p id={`${id}-error`} className='text-xs text-destructive'>
          {error}
        </p>
      )}
    </div>
  )
}

function StepIndicator({ step }: { step: Step }) {
  const active = step === 'IDENTITY' ? 1 : step === 'FORM' ? 2 : 3
  return (
    <ol className='grid grid-cols-3 gap-2' aria-label='Tahap pengisian'>
      {['Verifikasi', 'Lengkapi data', 'Selesai'].map((label, index) => {
        const number = index + 1
        return (
          <li key={label} className='space-y-1.5'>
            <div
              className={cn(
                'h-1.5 rounded-full',
                number <= active ? 'bg-primary' : 'bg-muted'
              )}
            />
            <span
              className={cn(
                'text-[11px] sm:text-xs',
                number === active
                  ? 'font-semibold text-primary'
                  : 'text-muted-foreground'
              )}
            >
              {number}. {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function PublicApplicationPage({ siteToken }: { siteToken: string }) {
  const [config, setConfig] = useState<RecruitmentPublicConfig | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [configError, setConfigError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('IDENTITY')
  const [values, setValues] = useState(emptyValues)
  const [files, setFiles] = useState<RecruitmentFiles>(emptyFiles)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [fileErrors, setFileErrors] = useState<FileErrors>({})
  const [eligibility, setEligibility] = useState<RecruitmentEligibility | null>(
    null
  )
  const [checkToken, setCheckToken] = useState<string | null>(null)
  const [submitToken, setSubmitToken] = useState<string | null>(null)
  const [checkChallenge, setCheckChallenge] = useState(0)
  const [submitChallenge, setSubmitChallenge] = useState(0)
  const [busy, setBusy] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<RecruitmentReceipt | null>(null)
  const idempotencyKey = useRef(crypto.randomUUID())
  const submitGuard = useRef(false)
  const onCheckToken = useCallback(
    (token: string | null) => setCheckToken(token),
    []
  )
  const onSubmitToken = useCallback(
    (token: string | null) => setSubmitToken(token),
    []
  )

  const renewSubmissionAttempt = () => {
    idempotencyKey.current = crypto.randomUUID()
    submitGuard.current = false
  }

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true)
    setConfigError(null)
    try {
      setConfig(await getRecruitmentPublicConfig(siteToken))
    } catch (error) {
      setConfigError(friendlyError(error))
    } finally {
      setLoadingConfig(false)
    }
  }, [siteToken])

  useEffect(() => {
    let active = true
    void getRecruitmentPublicConfig(siteToken)
      .then((result) => {
        if (active) setConfig(result)
      })
      .catch((error: unknown) => {
        if (active) setConfigError(friendlyError(error))
      })
      .finally(() => {
        if (active) setLoadingConfig(false)
      })
    return () => {
      active = false
    }
  }, [siteToken])
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Form Data Pelamar | HRIS RSIA'
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]')
    const created = !robots
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.appendChild(robots)
    }
    const previousRobots = robots.content
    robots.content = 'noindex, nofollow, noarchive'
    return () => {
      document.title = previousTitle
      if (created) robots?.remove()
      else if (robots) robots.content = previousRobots
    }
  }, [])

  const updateValue = <K extends keyof RecruitmentFormValues>(
    key: K,
    value: RecruitmentFormValues[K]
  ) => {
    renewSubmissionAttempt()
    setValues((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
    setRequestError(null)
    if (
      key === 'nationalIdNumber' ||
      key === 'familyCardNumber' ||
      key === 'birthDate'
    ) {
      if (eligibility || checkToken) setCheckChallenge((current) => current + 1)
      setEligibility(null)
      setCheckToken(null)
    }
  }

  const updateFile = (
    kind: keyof RecruitmentFiles,
    file: File | null,
    error?: string
  ) => {
    renewSubmissionAttempt()
    setFiles((current) => ({ ...current, [kind]: file }))
    setFileErrors((current) => ({ ...current, [kind]: error }))
    setRequestError(null)
  }

  const checkIdentity = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!config || busy) return
    const nextErrors = validateIdentity(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    if (config.turnstileSiteKey && !checkToken) {
      setRequestError('Selesaikan verifikasi keamanan terlebih dahulu.')
      return
    }
    setBusy(true)
    setRequestError(null)
    try {
      const result = await checkRecruitmentIdentity(
        siteToken,
        {
          nationalIdNumber: values.nationalIdNumber,
          familyCardNumber: values.familyCardNumber,
          birthDate: values.birthDate,
        },
        checkToken ?? undefined
      )
      setEligibility(result)
      if (result.canSubmit) {
        setStep('FORM')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      } else {
        setCheckToken(null)
        setCheckChallenge((current) => current + 1)
      }
    } catch (error) {
      setRequestError(friendlyError(error))
      setCheckToken(null)
      setCheckChallenge((current) => current + 1)
    } finally {
      setBusy(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!config || busy || submitGuard.current) return
    const nextErrors = validateRecruitmentForm(values)
    const missingFiles = missingRecruitmentFiles(files)
    const nextFileErrors = Object.fromEntries(
      missingFiles.map((kind) => [kind, 'Foto ini wajib dilengkapi.'])
    ) as FileErrors
    setErrors(nextErrors)
    setFileErrors(nextFileErrors)
    if (Object.keys(nextErrors).length || missingFiles.length) {
      setRequestError(
        'Masih ada data yang perlu dilengkapi. Periksa bagian bertanda merah.'
      )
      return
    }
    if (config.turnstileSiteKey && !submitToken) {
      setRequestError('Selesaikan verifikasi keamanan sebelum mengirim form.')
      return
    }
    submitGuard.current = true
    setBusy(true)
    setRequestError(null)
    try {
      const result = await submitRecruitmentApplication({
        siteToken,
        values,
        files,
        privacyNoticeVersion: config.privacyNoticeVersion,
        idempotencyKey: idempotencyKey.current,
        turnstileToken: submitToken ?? undefined,
      })
      setReceipt(result)
      setStep('SUCCESS')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (error) {
      setRequestError(friendlyError(error))
      submitGuard.current = false
      setSubmitToken(null)
      setSubmitChallenge((current) => current + 1)
    } finally {
      setBusy(false)
    }
  }

  if (loadingConfig)
    return (
      <PublicShell>
        <div className='flex min-h-72 items-center justify-center gap-3 text-muted-foreground'>
          <Loader2 className='size-5 animate-spin' /> Menyiapkan form...
        </div>
      </PublicShell>
    )
  if (!config)
    return (
      <PublicShell>
        <div className='flex min-h-72 flex-col items-center justify-center gap-4 px-5 text-center'>
          <AlertCircle className='size-10 text-destructive' />
          <div>
            <h1 className='text-xl font-semibold'>Form belum dapat dibuka</h1>
            <p className='mt-1 max-w-md text-sm text-muted-foreground'>
              {configError}
            </p>
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() => void loadConfig()}
          >
            <RefreshCw /> Coba lagi
          </Button>
        </div>
      </PublicShell>
    )

  return (
    <PublicShell>
      <header className='border-b bg-gradient-to-br from-primary/[0.08] via-background to-positive/[0.08] px-5 py-6 sm:px-8'>
        <div className='flex items-center gap-4'>
          <img
            src={config.company.logoUrl || '/brand/restu-logo.png'}
            alt={`Logo ${config.company.name}`}
            className='size-16 rounded-2xl bg-white object-contain p-1.5 shadow-sm ring-1 ring-black/5 sm:size-20'
          />
          <div className='min-w-0'>
            <p className='text-xs font-semibold tracking-[0.12em] text-positive uppercase'>
              Rekrutmen Karyawan
            </p>
            <h1 className='mt-1 text-xl leading-tight font-bold sm:text-2xl'>
              {config.company.name}
            </h1>
            <div className='mt-2 inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-2.5 py-1 text-xs font-medium'>
              <MapPin className='size-3.5 text-positive' /> Site{' '}
              {config.site.name}
              <LockKeyhole className='ml-1 size-3 text-muted-foreground' />
            </div>
          </div>
        </div>
      </header>

      <div className='space-y-6 px-5 py-6 sm:px-8 sm:py-8'>
        <div>
          <h2 className='text-2xl font-bold tracking-tight'>
            Form Data Pelamar
          </h2>
          <p className='mt-1 text-sm leading-6 text-muted-foreground'>
            Isi data sesuai KTP dan pastikan foto dokumen terlihat jelas.
          </p>
        </div>
        <StepIndicator step={step} />

        {step === 'IDENTITY' && (
          <form onSubmit={checkIdentity} className='space-y-5' noValidate>
            <div className='rounded-xl border bg-muted/25 p-4'>
              <div className='flex gap-3'>
                <ShieldCheck className='mt-0.5 size-5 shrink-0 text-positive' />
                <div>
                  <p className='text-sm font-semibold'>Pemeriksaan awal</p>
                  <p className='mt-1 text-xs leading-5 text-muted-foreground'>
                    Data ini digunakan untuk memastikan tidak ada proses lamaran
                    aktif yang sama.
                  </p>
                </div>
              </div>
            </div>
            <FormField
              id='nationalIdNumber'
              label='NIK'
              error={errors.nationalIdNumber}
            >
              <Input
                id='nationalIdNumber'
                inputMode='numeric'
                autoComplete='off'
                maxLength={16}
                placeholder='16 angka pada KTP'
                value={values.nationalIdNumber}
                onChange={(e) =>
                  updateValue(
                    'nationalIdNumber',
                    e.target.value.replace(/\D/g, '')
                  )
                }
                aria-invalid={!!errors.nationalIdNumber}
                aria-describedby={
                  errors.nationalIdNumber ? 'nationalIdNumber-error' : undefined
                }
              />
            </FormField>
            <FormField
              id='familyCardNumber'
              label='Nomor KK'
              error={errors.familyCardNumber}
            >
              <Input
                id='familyCardNumber'
                inputMode='numeric'
                autoComplete='off'
                maxLength={16}
                placeholder='16 angka pada Kartu Keluarga'
                value={values.familyCardNumber}
                onChange={(e) =>
                  updateValue(
                    'familyCardNumber',
                    e.target.value.replace(/\D/g, '')
                  )
                }
                aria-invalid={!!errors.familyCardNumber}
                aria-describedby={
                  errors.familyCardNumber ? 'familyCardNumber-error' : undefined
                }
              />
            </FormField>
            <FormField
              id='birthDate'
              label='Tanggal lahir'
              error={errors.birthDate}
            >
              <Input
                id='birthDate'
                type='date'
                max={format(new Date(), 'yyyy-MM-dd')}
                value={values.birthDate}
                onChange={(e) => updateValue('birthDate', e.target.value)}
                aria-invalid={!!errors.birthDate}
                aria-describedby={
                  errors.birthDate ? 'birthDate-error' : undefined
                }
              />
            </FormField>
            <TurnstileWidget
              key={checkChallenge}
              siteKey={config.turnstileSiteKey}
              action='recruitment-check'
              onToken={onCheckToken}
            />
            {requestError && (
              <Alert variant='destructive'>
                <AlertCircle />
                <AlertTitle>Belum dapat dilanjutkan</AlertTitle>
                <AlertDescription>{requestError}</AlertDescription>
              </Alert>
            )}
            {eligibility && !eligibility.canSubmit && (
              <Alert variant='destructive'>
                <AlertCircle />
                <AlertTitle>Pendaftaran belum dapat dilanjutkan</AlertTitle>
                <AlertDescription>{eligibility.message}</AlertDescription>
              </Alert>
            )}
            <Button
              type='submit'
              size='lg'
              className='h-12 w-full'
              disabled={busy}
            >
              {busy ? <Loader2 className='animate-spin' /> : <ClipboardCheck />}{' '}
              {busy ? 'Memeriksa...' : 'Periksa dan lanjutkan'}{' '}
              {!busy && <ArrowRight />}
            </Button>
          </form>
        )}

        {step === 'FORM' && (
          <form onSubmit={submit} className='space-y-8' noValidate>
            {eligibility?.priorRejectedApplication && (
              <Alert className='border-warning/50 bg-warning/10'>
                <AlertCircle className='text-warning-foreground' />
                <AlertTitle>Anda pernah mendaftar sebelumnya</AlertTitle>
                <AlertDescription>
                  <p>
                    Anda tetap dapat mengirim lamaran baru. Lamaran sebelumnya
                    dikirim pada{' '}
                    {new Intl.DateTimeFormat('id-ID', {
                      dateStyle: 'long',
                    }).format(
                      new Date(
                        `${eligibility.priorRejectedApplication.submittedDate}T00:00:00`
                      )
                    )}
                    .
                  </p>
                  <p>
                    <strong>Catatan sebelumnya:</strong>{' '}
                    {eligibility.priorRejectedApplication.reason}
                  </p>
                </AlertDescription>
              </Alert>
            )}

            <section className='space-y-5' aria-labelledby='biodata-title'>
              <div className='flex items-center gap-2'>
                <UserRound className='size-5 text-primary' />
                <h3 id='biodata-title' className='text-lg font-semibold'>
                  Biodata sesuai KTP
                </h3>
              </div>
              <FormField
                id='fullName'
                label='Nama lengkap'
                error={errors.fullName}
              >
                <Input
                  id='fullName'
                  autoComplete='name'
                  maxLength={150}
                  placeholder='Nama lengkap tanpa gelar'
                  value={values.fullName}
                  onChange={(e) => updateValue('fullName', e.target.value)}
                  aria-invalid={!!errors.fullName}
                />
              </FormField>
              <div className='space-y-2'>
                <Label id='gender-label'>
                  Jenis kelamin <span className='text-destructive'>*</span>
                </Label>
                <RadioGroup
                  aria-labelledby='gender-label'
                  value={values.gender}
                  onValueChange={(value) =>
                    updateValue('gender', value as 'MALE' | 'FEMALE')
                  }
                  className='grid grid-cols-2 gap-3'
                >
                  <Label
                    className={cn(
                      'flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-3',
                      values.gender === 'MALE' && 'border-primary bg-primary/5'
                    )}
                  >
                    <RadioGroupItem value='MALE' /> Laki-laki
                  </Label>
                  <Label
                    className={cn(
                      'flex h-11 cursor-pointer items-center gap-2 rounded-lg border px-3',
                      values.gender === 'FEMALE' &&
                        'border-primary bg-primary/5'
                    )}
                  >
                    <RadioGroupItem value='FEMALE' /> Perempuan
                  </Label>
                </RadioGroup>
                {errors.gender && (
                  <p className='text-xs text-destructive'>{errors.gender}</p>
                )}
              </div>
              <div className='grid gap-5 sm:grid-cols-2'>
                <FormField
                  id='birthPlace'
                  label='Tempat lahir'
                  error={errors.birthPlace}
                >
                  <Input
                    id='birthPlace'
                    maxLength={100}
                    placeholder='Kota/kabupaten'
                    value={values.birthPlace}
                    onChange={(e) => updateValue('birthPlace', e.target.value)}
                    aria-invalid={!!errors.birthPlace}
                  />
                </FormField>
                <FormField id='birthDateLocked' label='Tanggal lahir'>
                  <Input
                    id='birthDateLocked'
                    type='date'
                    value={values.birthDate}
                    disabled
                  />
                </FormField>
              </div>
              <FormField
                id='address'
                label='Alamat sesuai KTP'
                error={errors.address}
              >
                <Textarea
                  id='address'
                  rows={4}
                  maxLength={2000}
                  placeholder='Tuliskan alamat lengkap sesuai KTP'
                  value={values.address}
                  onChange={(e) => updateValue('address', e.target.value)}
                  aria-invalid={!!errors.address}
                />
              </FormField>
              <div className='grid gap-5 sm:grid-cols-2'>
                <FormField
                  id='phone'
                  label='Nomor HP/WhatsApp'
                  error={errors.phone}
                >
                  <Input
                    id='phone'
                    type='tel'
                    inputMode='tel'
                    autoComplete='tel'
                    maxLength={30}
                    placeholder='Contoh: 081234567890'
                    value={values.phone}
                    onChange={(e) => updateValue('phone', e.target.value)}
                    aria-invalid={!!errors.phone}
                  />
                </FormField>
                <FormField
                  id='email'
                  label='Email'
                  required={false}
                  error={errors.email}
                >
                  <Input
                    id='email'
                    type='email'
                    inputMode='email'
                    autoComplete='email'
                    maxLength={191}
                    placeholder='nama@email.com'
                    value={values.email}
                    onChange={(e) => updateValue('email', e.target.value)}
                    aria-invalid={!!errors.email}
                  />
                </FormField>
              </div>
            </section>

            <section className='space-y-5' aria-labelledby='document-title'>
              <div>
                <div className='flex items-center gap-2'>
                  <FileCheck2 className='size-5 text-primary' />
                  <h3 id='document-title' className='text-lg font-semibold'>
                    Foto dan dokumen
                  </h3>
                </div>
                <p className='mt-1 text-xs leading-5 text-muted-foreground'>
                  Pastikan tulisan terbaca, tidak terpotong, dan tidak buram.
                </p>
              </div>
              <div className='grid gap-6 sm:grid-cols-2'>
                <ImageUploadField
                  label='Foto diri terbaru'
                  description='Ambil foto wajah dengan pencahayaan cukup.'
                  file={files.photo}
                  allowedTypes={config.limits.imageTypes}
                  maxBytes={config.limits.maxImageBytes}
                  error={fileErrors.photo}
                  onChange={(file, error) => updateFile('photo', file, error)}
                />
                <ImageUploadField
                  label='Foto KTP'
                  description='Posisikan seluruh bagian KTP di dalam gambar.'
                  file={files.ktp}
                  allowedTypes={config.limits.imageTypes}
                  maxBytes={config.limits.maxImageBytes}
                  error={fileErrors.ktp}
                  onChange={(file, error) => updateFile('ktp', file, error)}
                />
                <ImageUploadField
                  label='Foto Kartu Keluarga'
                  description='Pastikan seluruh halaman KK terlihat jelas.'
                  file={files.kk}
                  allowedTypes={config.limits.imageTypes}
                  maxBytes={config.limits.maxImageBytes}
                  error={fileErrors.kk}
                  onChange={(file, error) => updateFile('kk', file, error)}
                />
              </div>
            </section>

            <section className='rounded-xl border bg-muted/25 p-4'>
              <div className='flex items-start gap-3'>
                <Checkbox
                  id='privacyConsent'
                  checked={values.privacyConsent}
                  onCheckedChange={(checked) =>
                    updateValue('privacyConsent', checked === true)
                  }
                  aria-invalid={!!errors.privacyConsent}
                />
                <div className='space-y-1'>
                  <Label htmlFor='privacyConsent' className='leading-5'>
                    Saya menyetujui penggunaan data ini untuk proses rekrutmen.{' '}
                    <span className='text-destructive'>*</span>
                  </Label>
                  <p className='text-xs leading-5 text-muted-foreground'>
                    Data dan dokumen akan disimpan secara privat serta hanya
                    digunakan oleh petugas yang berwenang.
                  </p>
                  {errors.privacyConsent && (
                    <p className='text-xs text-destructive'>
                      {errors.privacyConsent}
                    </p>
                  )}
                </div>
              </div>
            </section>
            <TurnstileWidget
              key={submitChallenge}
              siteKey={config.turnstileSiteKey}
              action='recruitment-submit'
              onToken={onSubmitToken}
            />
            {requestError && (
              <Alert variant='destructive'>
                <AlertCircle />
                <AlertTitle>Form belum terkirim</AlertTitle>
                <AlertDescription>{requestError}</AlertDescription>
              </Alert>
            )}
            <div className='flex flex-col-reverse gap-3 sm:flex-row sm:justify-between'>
              <Button
                type='button'
                variant='outline'
                size='lg'
                className='h-12'
                disabled={busy}
                onClick={() => {
                  setStep('IDENTITY')
                  setEligibility(null)
                  setRequestError(null)
                  setCheckToken(null)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
              >
                <ArrowLeft /> Kembali
              </Button>
              <Button
                type='submit'
                size='lg'
                className='h-12 sm:min-w-52'
                disabled={busy}
              >
                {busy ? <Loader2 className='animate-spin' /> : <ShieldCheck />}{' '}
                {busy ? 'Mengirim data...' : 'Kirim pendaftaran'}
              </Button>
            </div>
          </form>
        )}

        {step === 'SUCCESS' && receipt && (
          <div className='space-y-6 py-4 text-center'>
            <span className='mx-auto flex size-20 items-center justify-center rounded-full bg-positive/10 text-positive'>
              <CheckCircle2 className='size-10' />
            </span>
            <div>
              <h2 className='text-2xl font-bold'>
                Pendaftaran berhasil diterima
              </h2>
              <p className='mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground'>
                Simpan nomor bukti berikut. HR akan menghubungi nomor
                HP/WhatsApp yang telah Anda masukkan bila diperlukan.
              </p>
            </div>
            <div className='rounded-xl border bg-muted/30 p-5'>
              <p className='text-xs font-medium tracking-wide text-muted-foreground uppercase'>
                Nomor bukti pendaftaran
              </p>
              <p className='mt-2 font-mono text-lg font-bold break-all text-primary sm:text-xl'>
                {receipt.applicationNumber}
              </p>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='mt-4'
                onClick={() =>
                  void navigator.clipboard.writeText(receipt.applicationNumber)
                }
              >
                <Copy /> Salin nomor
              </Button>
            </div>
            <Alert className='text-left'>
              <ShieldCheck />
              <AlertTitle>Data Anda tersimpan secara privat</AlertTitle>
              <AlertDescription>
                Tidak ada halaman pengecekan status publik. Hati-hati terhadap
                pihak yang meminta kata sandi atau biaya rekrutmen.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </div>
    </PublicShell>
  )
}

function PublicShell({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear()
  return (
    <main className='min-h-svh bg-[radial-gradient(circle_at_top_left,rgba(43,144,46,0.10),transparent_30%),radial-gradient(circle_at_top_right,rgba(14,36,89,0.12),transparent_34%),linear-gradient(to_bottom,#f8fafc,#eef2f7)] px-3 py-4 text-foreground sm:px-5 sm:py-8 dark:bg-background'>
      <Card className='mx-auto max-w-2xl gap-0 overflow-hidden border-white/70 py-0 shadow-xl shadow-slate-900/8'>
        {children}
      </Card>
      <footer className='mx-auto flex max-w-2xl flex-col items-center gap-2 px-4 py-6 text-center text-xs text-slate-500 sm:flex-row sm:justify-between'>
        <span className='inline-flex items-center gap-1.5'>
          <Building2 className='size-3.5' /> Form resmi HRIS RSIA
        </span>
        <span>© {year} PT Restu Sejati Inti Abadi</span>
      </footer>
    </main>
  )
}
