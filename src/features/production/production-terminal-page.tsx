import { useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  CheckCircle2,
  ChevronDown,
  Keyboard,
  LoaderCircle,
  LogOut,
  PackageCheck,
  RefreshCcw,
  ScanBarcode,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { isDeviceSessionInvalid } from '@/lib/device-session'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Main } from '@/components/layout/main'
import {
  useActivateProductionDevice,
  usePostProductionTransaction,
  useProductionTerminalLookup,
  useProductionTerminalRecent,
} from './data/queries'
import type {
  ActivatedProductionDevice,
  ProductionTerminalLookup,
} from './domain'
import { ProductionQcFields } from './production-qc-fields'
import {
  emptyProductionQc,
  defaultProductionQc,
  productionQcDraftSignature,
  isLintingJob,
  productionQcPayload,
  validateProductionQc,
} from './production-qc-form-policy'
import { ProductionTerminalDetail } from './production-terminal-detail'
import {
  canUseProductionTerminalSite,
  normalizeProductionQuantity,
  validateProductionQuantity,
} from './production-terminal-policy'
import { ProductionTerminalSummary } from './production-terminal-summary'

const storageKey = 'hris-rsia-production-device-v1'
const recentExpandedKey = 'hris-rsia-production-recent-expanded-v1'

export function ProductionTerminalPage() {
  const authSession = useAuthStore((state) => state.session)
  const [session, setSession] = useState<ActivatedProductionDevice | null>(
    readSession
  )
  const sessionAllowed = Boolean(
    session &&
    canUseProductionTerminalSite(
      authSession?.user.role,
      authSession?.user.siteAccess,
      session.device.site
    )
  )
  const activeSession = sessionAllowed ? session : null

  if (session && !sessionAllowed)
    return (
      <Main className='p-4'>
        <Card>
          <CardContent className='space-y-2 p-4'>
            <p className='font-semibold'>Akses terminal belum tersedia.</p>
            <p className='text-sm text-muted-foreground'>
              Login dengan akun yang memiliki akses site{' '}
              {session.device.siteName}. Aktivasi perangkat tetap tersimpan;
              tidak perlu kode aktivasi baru.
            </p>
          </CardContent>
        </Card>
      </Main>
    )

  if (!activeSession)
    return (
      <ActivationScreen
        onActivated={(value) => {
          localStorage.setItem(storageKey, JSON.stringify(value))
          setSession(value)
        }}
      />
    )

  return (
    <ProductionTerminal
      key={`${activeSession.device.uid}:${activeSession.device.site}`}
      session={activeSession}
      onDeactivate={() => {
        localStorage.removeItem(storageKey)
        setSession(null)
      }}
    />
  )
}

function ActivationScreen({
  onActivated,
}: {
  onActivated: (session: ActivatedProductionDevice) => void
}) {
  const [activationCode, setActivationCode] = useState('')
  const activate = useActivateProductionDevice()

  return (
    <Main className='flex min-h-[calc(100vh-4rem)] items-center justify-center p-4'>
      <Card className='w-full max-w-md'>
        <CardContent className='space-y-6 p-6 sm:p-8'>
          <div className='text-center'>
            <div className='mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary'>
              <PackageCheck className='size-8' />
            </div>
            <h1 className='text-2xl font-bold'>Aktivasi Terminal Produksi</h1>
            <p className='mt-2 text-sm text-muted-foreground'>
              Hubungkan scanner USB atau terminal site memakai kode aktivasi
              dari Master Perangkat.
            </p>
          </div>
          <form
            className='space-y-4'
            onSubmit={(event) => {
              event.preventDefault()
              if (!activationCode.trim()) return
              activate.mutate(activationCode.trim().toUpperCase(), {
                onSuccess: onActivated,
              })
            }}
          >
            <div className='grid gap-2'>
              <Label htmlFor='production-activation-code'>Kode aktivasi</Label>
              <Input
                id='production-activation-code'
                className='h-12 text-center text-lg font-semibold tracking-widest uppercase'
                value={activationCode}
                onChange={(event) =>
                  setActivationCode(event.target.value.toUpperCase())
                }
                autoComplete='off'
                autoFocus
                required
              />
            </div>
            {activate.isError && (
              <p
                role='alert'
                className='rounded-lg bg-destructive/10 p-3 text-sm text-destructive'
              >
                {apiMessage(
                  activate.error,
                  'Kode aktivasi tidak valid, sudah dipakai, atau perangkat tidak mendukung Produksi.'
                )}
              </p>
            )}
            <Button
              className='h-12 w-full'
              disabled={activate.isPending || !activationCode.trim()}
            >
              {activate.isPending && <LoaderCircle className='animate-spin' />}
              Aktifkan terminal
            </Button>
          </form>
          <p className='text-center text-xs text-muted-foreground'>
            Token terminal Produksi disimpan terpisah dari terminal Attendance.
          </p>
        </CardContent>
      </Card>
    </Main>
  )
}

function ProductionTerminal({
  session,
  onDeactivate,
}: {
  session: ActivatedProductionDevice
  onDeactivate: () => void
}) {
  const [barcode, setBarcode] = useState('')
  const [lookup, setLookup] = useState<ProductionTerminalLookup>()
  const [batilBarcode, setBatilBarcode] = useState('')
  const [batilLookup, setBatilLookup] = useState<ProductionTerminalLookup>()
  const [batilError, setBatilError] = useState<string>()
  const [batilPending, setBatilPending] = useState(false)
  const [confirmedBatilBarcode, setConfirmedBatilBarcode] = useState<string>()
  const [jobUid, setJobUid] = useState('')
  const [quantity, setQuantity] = useState('')
  const [qc, setQc] = useState(emptyProductionQc)
  const recentQuery = useProductionTerminalRecent(
    session.device.uid,
    session.deviceToken
  )
  const recent = recentQuery.data?.items ?? []
  const [recentExpanded, setRecentExpanded] = useState(readRecentExpanded)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [detailUid, setDetailUid] = useState<string>()
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine
  )
  const barcodeRef = useRef<HTMLInputElement>(null)
  const quantityRef = useRef<HTMLInputElement>(null)
  const idempotencyKey = useRef<string | undefined>(undefined)
  const lookupRequest = useRef(0)
  const batilRequest = useRef(0)
  const latestBarcode = useRef('')
  const latestBatilBarcode = useRef('')
  const lookupMutation = useProductionTerminalLookup()
  const batilLookupMutation = useProductionTerminalLookup()
  const postMutation = usePostProductionTransaction()
  const selectedJob = lookup?.jobs.find((job) => job.uid === jobUid)
  const linting = isLintingJob(selectedJob?.code)
  const canPairBatil = session.device.site === 'KLATEN' && linting
  const standaloneBatilBlocked =
    session.device.site === 'KLATEN' && selectedJob?.code === 'BORONGAN-BATIL'
  const standaloneBatilMessage =
    'Batil harus berpasangan dengan Linting. Scan pekerja Linting terlebih dahulu, lalu isi pekerja Batil pada field pasangan.'
  const batilReady = Boolean(
    batilLookup && confirmedBatilBarcode === batilBarcode.trim()
  )
  const batilBlocked =
    canPairBatil &&
    Boolean(batilPending || (batilBarcode.trim() && !batilReady))
  const qcError = selectedJob
    ? validateProductionQc(qc, lookup?.qcOptions, linting)
    : undefined

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  useEffect(() => {
    window.setTimeout(
      () => (lookup ? quantityRef.current : barcodeRef.current)?.focus(),
      50
    )
  }, [lookup])
  useEffect(
    () => () => {
      lookupRequest.current += 1
      batilRequest.current += 1
    },
    []
  )

  const clearBatil = () => {
    batilRequest.current += 1
    latestBatilBarcode.current = ''
    setConfirmedBatilBarcode(undefined)
    setBatilBarcode('')
    setBatilLookup(undefined)
    setBatilError(undefined)
    setBatilPending(false)
    batilLookupMutation.reset()
  }
  const clearLookup = () => {
    lookupRequest.current += 1
    latestBarcode.current = ''
    clearBatil()
    setLookup(undefined)
    setJobUid('')
    setQuantity('')
    setQc(emptyProductionQc())
    setBarcode('')
    idempotencyKey.current = undefined
    lookupMutation.reset()
    postMutation.reset()
  }

  const handleDeviceAuthError = (error: unknown) => {
    if (!isDeviceSessionInvalid(error)) return false
    toast.error('Aktivasi perangkat tidak valid. Hubungkan kembali perangkat.')
    onDeactivate()
    return true
  }

  const submitLookup = async () => {
    const value = barcode.trim()
    if (!value || lookupMutation.isPending || !online) return
    const request = ++lookupRequest.current
    clearBatil()
    try {
      const result = await lookupMutation.mutateAsync({
        barcode: value,
        deviceToken: session.deviceToken,
      })
      if (
        request !== lookupRequest.current ||
        latestBarcode.current.trim() !== value
      )
        return
      setLookup(result)
      setJobUid(result.defaultJobUid)
      setQuantity('')
      setQc(
        defaultProductionQc(result.qcOptions, result.lastBrandUid ?? undefined)
      )
      idempotencyKey.current = undefined
    } catch (error) {
      if (
        request !== lookupRequest.current ||
        latestBarcode.current.trim() !== value
      )
        return
      if (!handleDeviceAuthError(error)) {
        toast.error(apiMessage(error, 'Karyawan tidak siap menerima setoran.'))
        window.setTimeout(() => barcodeRef.current?.focus(), 50)
      }
    }
  }

  const submitBatilLookup = async () => {
    const value = batilBarcode.trim()
    if (
      !canPairBatil ||
      !lookup ||
      !value ||
      batilPending ||
      !online ||
      postMutation.isPending
    )
      return
    const request = ++batilRequest.current
    setBatilPending(true)
    setBatilError(undefined)
    setBatilLookup(undefined)
    setConfirmedBatilBarcode(undefined)
    const current = () =>
      request === batilRequest.current &&
      latestBatilBarcode.current.trim() === value
    try {
      const result = await batilLookupMutation.mutateAsync({
        barcode: value,
        deviceToken: session.deviceToken,
      })
      if (!current()) return
      if (result.employee.uid === lookup.employee.uid) {
        setBatilError('Pekerja Batil harus berbeda dari pekerja Linting.')
      } else if (
        result.employee.site !== 'KLATEN' ||
        result.businessDate !== lookup.businessDate
      ) {
        setBatilError(
          'Pekerja Batil harus siap di Klaten pada tanggal kerja yang sama.'
        )
      } else if (
        result.jobs.filter(
          (job) => job.code === 'BORONGAN-BATIL' && job.unit.code === 'PCS'
        ).length !== 1
      ) {
        setBatilError('Penugasan dan tarif Batil (PCS) belum siap.')
      } else {
        setConfirmedBatilBarcode(value)
        setBatilLookup(result)
        quantityRef.current?.focus()
      }
    } catch (error) {
      if (!current()) return
      if (!handleDeviceAuthError(error))
        setBatilError(
          apiMessage(error, 'Pekerja Batil belum siap menerima setoran.')
        )
    } finally {
      if (current()) setBatilPending(false)
    }
  }

  const submitTransaction = async () => {
    if (!lookup || !selectedJob || postMutation.isPending) return
    if (standaloneBatilBlocked) {
      toast.error(standaloneBatilMessage)
      return
    }
    if (batilBlocked) {
      toast.error(
        batilError ?? 'Periksa barcode pekerja Batil sebelum menyimpan.'
      )
      return
    }
    if (qcError) {
      toast.error(qcError)
      return
    }
    const validation = validateProductionQuantity(
      quantity,
      selectedJob.unit.decimalPrecision
    )
    if (validation) {
      toast.error(validation)
      quantityRef.current?.focus()
      return
    }
    idempotencyKey.current ??= crypto.randomUUID()
    try {
      const result = await postMutation.mutateAsync({
        deviceToken: session.deviceToken,
        input: {
          barcode: barcode.trim(),
          ...(canPairBatil && batilBarcode.trim()
            ? { batilBarcode: batilBarcode.trim() }
            : {}),
          jobUid: selectedJob.uid,
          quantity: normalizeProductionQuantity(quantity),
          ...(lookup.qcOptions
            ? { qc: productionQcPayload(qc, lookup.qcOptions, linting) }
            : {}),
          idempotencyKey: idempotencyKey.current,
        },
      })
      void recentQuery.refetch()
      toast.success(
        result.duplicate
          ? 'Setoran sebelumnya ditemukan; tidak dibuat ganda.'
          : result.message
      )
      clearLookup()
    } catch (error) {
      if (!handleDeviceAuthError(error)) {
        toast.error(
          apiMessage(error, 'Setoran gagal disimpan. Silakan coba lagi.')
        )
      }
    }
  }

  return (
    <Main className='mx-auto w-full max-w-6xl p-2 sm:p-4'>
      <header className='mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-2.5 sm:p-3'>
        <div className='min-w-0'>
          <p className='text-xs font-medium text-primary'>Terminal Produksi</p>
          <h1 className='truncate text-base font-bold sm:text-lg'>
            {session.device.name}
          </h1>
          <div className='mt-1 flex flex-wrap gap-1.5'>
            <Badge>{session.device.siteName}</Badge>
            <Badge variant='outline' className='hidden sm:inline-flex'>
              {session.device.code}
            </Badge>
            <Badge variant='secondary' className='hidden sm:inline-flex'>
              {session.device.deviceType === 'USB_SCANNER'
                ? 'Scanner USB'
                : 'Terminal'}
            </Badge>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge
            variant='outline'
            className={
              online
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }
          >
            {online ? <Wifi /> : <WifiOff />}
            {online ? 'Online' : 'Offline'}
          </Badge>
          <Button
            type='button'
            size='sm'
            variant='outline'
            onClick={() => setConfirmDeactivate(true)}
          >
            <LogOut /> Putuskan
          </Button>
        </div>
      </header>

      {!online && (
        <div
          role='alert'
          className='mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive'
        >
          <WifiOff className='mt-0.5 size-4 shrink-0' />
          Terminal offline. Setoran tidak disimpan lokal; sambungkan internet
          sebelum melanjutkan.
        </div>
      )}

      <div className='grid gap-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]'>
        <Card className='min-w-0 gap-0 py-0'>
          <CardContent className='space-y-3 p-2.5 sm:p-4'>
            {!lookup ? (
              <form
                className='space-y-4'
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitLookup()
                }}
              >
                <div className='text-center'>
                  <div className='mx-auto mb-3 flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary'>
                    <ScanBarcode className='size-9' />
                  </div>
                  <h2 className='text-xl font-semibold'>Scan label pekerja</h2>
                  <p className='text-sm text-muted-foreground'>
                    Barcode hanya memilih karyawan. Jumlah hasil tetap diisi
                    operator setelah identitas terverifikasi.
                  </p>
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='production-barcode'>Barcode karyawan</Label>
                  <div className='flex gap-2'>
                    <Input
                      ref={barcodeRef}
                      id='production-barcode'
                      className='h-14 text-center text-lg font-semibold tracking-wide'
                      value={barcode}
                      onChange={(event) => {
                        latestBarcode.current = event.target.value
                        setBarcode(event.target.value)
                      }}
                      placeholder='Scan atau ketik nomor karyawan'
                      autoComplete='off'
                      disabled={!online || lookupMutation.isPending}
                      autoFocus
                    />
                    <Button
                      className='h-14'
                      disabled={
                        !barcode.trim() || !online || lookupMutation.isPending
                      }
                    >
                      {lookupMutation.isPending ? (
                        <LoaderCircle className='animate-spin' />
                      ) : (
                        <Keyboard />
                      )}
                      Cek
                    </Button>
                  </div>
                </div>
                {lookupMutation.isError && (
                  <p className='rounded-lg bg-destructive/10 p-3 text-sm text-destructive'>
                    {apiMessage(
                      lookupMutation.error,
                      'Karyawan tidak ditemukan atau belum siap menerima setoran.'
                    )}
                  </p>
                )}
              </form>
            ) : (
              <form
                className='space-y-2.5'
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitTransaction()
                }}
              >
                <div className='flex items-start justify-between gap-2 rounded-lg border border-primary/30 bg-gradient-to-br from-primary via-primary/90 to-primary/75 p-2.5 text-primary-foreground shadow-sm'>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <ShieldCheck className='size-4 shrink-0 text-primary-foreground' />
                      <p className='text-sm font-semibold'>
                        {lookup.employee.fullName}
                      </p>
                    </div>
                    <p className='mt-0.5 text-xs text-primary-foreground/85'>
                      {lookup.employee.employeeNumber} ·{' '}
                      {lookup.employee.productionSection?.name ??
                        'Bagian belum diatur'}
                    </p>
                    <p className='text-xs text-primary-foreground/85'>
                      Clock in {formatTime(lookup.attendance.clockInAt)} ·{' '}
                      {lookup.businessDate}
                    </p>
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='h-10 shrink-0 bg-background px-2 text-xs text-foreground'
                    onClick={clearLookup}
                    disabled={postMutation.isPending}
                  >
                    <RefreshCcw />{' '}
                    <span className='hidden sm:inline'>Ganti pekerja</span>
                    <span className='sm:hidden'>Ganti</span>
                  </Button>
                </div>

                <div className='grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start gap-2'>
                  <div className='grid min-w-0 gap-1'>
                    <Label htmlFor='production-job'>Pekerjaan</Label>
                    <Select
                      value={jobUid}
                      disabled={postMutation.isPending}
                      onValueChange={(value) => {
                        clearBatil()
                        setJobUid(value)
                        setQuantity('')
                        setQc(
                          defaultProductionQc(
                            lookup.qcOptions,
                            lookup.lastBrandUid ?? undefined
                          )
                        )
                        idempotencyKey.current = undefined
                      }}
                    >
                      <SelectTrigger
                        id='production-job'
                        className='h-10 w-full min-w-0'
                      >
                        <SelectValue placeholder='Pilih pekerjaan' />
                      </SelectTrigger>
                      <SelectContent>
                        {lookup.jobs.map((job) => (
                          <SelectItem key={job.uid} value={job.uid}>
                            {job.name} · {job.unit.code}
                            {job.isPrimary ? ' · Utama' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='grid min-w-0 gap-1'>
                    <Label htmlFor='production-quantity'>
                      Jumlah {selectedJob ? `(${selectedJob.unit.code})` : ''}
                    </Label>
                    <Input
                      ref={quantityRef}
                      id='production-quantity'
                      className='h-10 min-w-0'
                      type='text'
                      inputMode='decimal'
                      value={quantity}
                      onChange={(event) => {
                        setQuantity(event.target.value)
                        idempotencyKey.current = undefined
                      }}
                      placeholder='0'
                      autoComplete='off'
                      disabled={!selectedJob || postMutation.isPending}
                    />
                  </div>
                </div>

                {canPairBatil && (
                  <div className='grid gap-1 rounded-md border bg-muted/20 p-2'>
                    <Label
                      htmlFor='production-batil-barcode'
                      className='text-xs'
                    >
                      Pekerja Batil (opsional)
                    </Label>
                    <div className='flex gap-1.5'>
                      <Input
                        id='production-batil-barcode'
                        className='h-9 min-w-0 text-sm'
                        value={batilBarcode}
                        placeholder='Scan barcode pekerja Batil'
                        autoComplete='off'
                        disabled={!online || postMutation.isPending}
                        onBlur={(event) => {
                          if (
                            event.relatedTarget?.id ===
                              'production-batil-check' ||
                            batilReady
                          )
                            return
                          void submitBatilLookup()
                        }}
                        onChange={(event) => {
                          const value = event.target.value
                          latestBatilBarcode.current = value
                          batilRequest.current += 1
                          setConfirmedBatilBarcode(undefined)
                          setBatilBarcode(value)
                          setBatilLookup(undefined)
                          setBatilError(undefined)
                          setBatilPending(false)
                          idempotencyKey.current = undefined
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return
                          event.preventDefault()
                          void submitBatilLookup()
                        }}
                      />
                      <Button
                        id='production-batil-check'
                        type='button'
                        size='sm'
                        variant='outline'
                        className='h-9 shrink-0'
                        disabled={
                          !batilBarcode.trim() ||
                          batilPending ||
                          !online ||
                          postMutation.isPending
                        }
                        onClick={() => void submitBatilLookup()}
                      >
                        {batilPending ? (
                          <LoaderCircle className='animate-spin' />
                        ) : (
                          <ScanBarcode />
                        )}
                        Cek
                      </Button>
                    </div>
                    {batilLookup ? (
                      <div className='flex min-w-0 items-center gap-2 rounded-lg border border-primary/30 bg-gradient-to-br from-primary via-primary/90 to-primary/75 px-2.5 py-2 text-primary-foreground shadow-sm'>
                        <ShieldCheck className='size-3.5 shrink-0' />
                        <div className='min-w-0'>
                          <p className='text-[10px] leading-tight text-primary-foreground/85'>
                            Di Batil Oleh:
                          </p>
                          <p className='mt-0.5 text-xs leading-snug break-words'>
                            <span className='font-semibold'>
                              {batilLookup.employee.fullName}
                            </span>{' '}
                            · {batilLookup.employee.employeeNumber} · Batil siap
                          </p>
                        </div>
                      </div>
                    ) : batilError ? (
                      <p role='alert' className='text-xs text-destructive'>
                        {batilError}
                      </p>
                    ) : (
                      <p className='text-[11px] text-muted-foreground'>
                        Kosongkan untuk Linting saja. Jumlah PCS dan Brand
                        digunakan bersama.
                      </p>
                    )}
                  </div>
                )}

                {selectedJob && (
                  <ProductionQcFields
                    linting={linting}
                    quantity={quantity}
                    value={qc}
                    options={lookup.qcOptions}
                    disabled={postMutation.isPending}
                    onChange={(value) => {
                      setQc(value)
                      if (
                        productionQcDraftSignature(value) !==
                        productionQcDraftSignature(qc)
                      )
                        idempotencyKey.current = undefined
                    }}
                  />
                )}

                {postMutation.isError && (
                  <p
                    role='alert'
                    className='rounded-lg bg-destructive/10 p-3 text-sm text-destructive'
                  >
                    {apiMessage(
                      postMutation.error,
                      'Setoran gagal disimpan. Periksa data lalu coba lagi.'
                    )}
                  </p>
                )}
                {standaloneBatilBlocked && (
                  <p role='alert' className='text-xs text-destructive'>
                    {standaloneBatilMessage}
                  </p>
                )}
                <Button
                  className='h-11 w-full text-base'
                  disabled={
                    !selectedJob ||
                    standaloneBatilBlocked ||
                    Boolean(qcError) ||
                    batilBlocked ||
                    Boolean(
                      validateProductionQuantity(
                        quantity,
                        selectedJob?.unit.decimalPrecision ?? 0
                      )
                    ) ||
                    postMutation.isPending ||
                    !online
                  }
                >
                  {postMutation.isPending ? (
                    <LoaderCircle className='animate-spin' />
                  ) : (
                    <PackageCheck />
                  )}
                  Simpan Setoran
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card className='min-w-0 gap-0 self-start py-0'>
          <CardContent className='p-3'>
            <Collapsible
              open={recentExpanded}
              onOpenChange={(expanded) => {
                setRecentExpanded(expanded)
                try {
                  localStorage.setItem(
                    recentExpandedKey,
                    JSON.stringify(expanded)
                  )
                } catch {
                  // Browser restrictions must not interrupt scanning.
                }
              }}
            >
              <CollapsibleTrigger asChild>
                <button
                  type='button'
                  className='flex min-h-10 w-full items-center justify-between gap-2 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                >
                  <span className='min-w-0'>
                    <span className='block font-semibold'>
                      5 setoran terakhir
                    </span>
                    <span className='block text-xs text-muted-foreground'>
                      Transaksi terakhir dari perangkat aktif ini.
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden='true'
                    className={`size-4 shrink-0 transition-transform ${recentExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className='pt-3'>
                {recentQuery.isPending ? (
                  <p
                    role='status'
                    className='py-4 text-center text-sm text-muted-foreground'
                  >
                    Memuat setoran terakhir...
                  </p>
                ) : recentQuery.isError ? (
                  <div
                    role='alert'
                    className='space-y-2 rounded-lg border p-3 text-sm'
                  >
                    <p>
                      Riwayat setoran gagal dimuat. Data setoran tersimpan tetap
                      aman.
                    </p>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      onClick={() => void recentQuery.refetch()}
                    >
                      Coba lagi
                    </Button>
                  </div>
                ) : !recent.length ? (
                  <div className='rounded-lg border border-dashed py-4 text-center text-sm text-muted-foreground'>
                    <PackageCheck className='mx-auto mb-2 size-6' />
                    Belum ada setoran dari perangkat ini.
                  </div>
                ) : (
                  <div className='space-y-2'>
                    {recent.map((item) => (
                      <button
                        type='button'
                        key={item.uid}
                        onClick={() => setDetailUid(item.uid)}
                        aria-label={`Lihat detail setoran ${item.transactionNumber}`}
                        className='w-full rounded-lg border p-3 text-left transition-colors hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                      >
                        <div className='flex items-start justify-between gap-2'>
                          <div className='min-w-0'>
                            <p className='truncate font-medium'>
                              {item.employee.fullName}
                            </p>
                            <p className='truncate text-xs text-muted-foreground'>
                              {item.job.name} · {item.transactionNumber}
                            </p>
                          </div>
                          <CheckCircle2 className='size-5 shrink-0 text-emerald-600' />
                        </div>
                        <div className='mt-2 flex items-start justify-between gap-2'>
                          <div className='shrink-0'>
                            <p className='text-sm font-semibold'>
                              {formatQuantity(
                                item.quantity,
                                item.unit.decimalPrecision
                              )}{' '}
                              {item.unit.code}
                            </p>
                          </div>
                          <div className='min-w-0 text-right'>
                            <p
                              className='truncate text-sm font-semibold'
                              title={item.brand?.name}
                            >
                              {item.brand?.name ?? '—'}
                            </p>
                            <p className='text-[11px] text-muted-foreground'>
                              {formatTime(item.transactionAt)}
                            </p>
                          </div>
                        </div>
                        {isLintingJob(item.job.code) && (
                          <p
                            className='mt-2 flex items-center justify-between gap-2 border-t pt-2 text-[11px] text-muted-foreground'
                            aria-label='Ringkasan QC Linting'
                          >
                            <span className='shrink-0'>
                              Defect{' '}
                              {item.qcSummary
                                ? item.qcSummary.totalDefects.toLocaleString(
                                    'id-ID'
                                  )
                                : '—'}
                            </span>
                            <span
                              className='min-w-0 truncate text-right'
                              title={`Berat 1: ${formatSampleWeight(item.qcSummary?.weight1Grams)} g · Berat 2: ${formatSampleWeight(item.qcSummary?.weight2Grams)} g`}
                            >
                              Berat{' '}
                              {formatSampleWeight(item.qcSummary?.weight1Grams)}{' '}
                              /{' '}
                              {formatSampleWeight(item.qcSummary?.weight2Grams)}{' '}
                              g
                            </span>
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      </div>

      {!lookup && !barcode.trim() && (
        <ProductionTerminalSummary
          deviceUid={session.device.uid}
          deviceToken={session.deviceToken}
          onDialogClosed={() => barcodeRef.current?.focus()}
        />
      )}

      <ProductionTerminalDetail
        session={session}
        uid={detailUid}
        onClose={() => setDetailUid(undefined)}
      />
      <ConfirmDialog
        open={confirmDeactivate}
        onOpenChange={setConfirmDeactivate}
        title='Putuskan terminal Produksi?'
        desc='Token Produksi pada browser ini akan dihapus. Aktivasi ulang diperlukan untuk mencatat setoran.'
        confirmText='Putuskan'
        destructive
        handleConfirm={onDeactivate}
      />
    </Main>
  )
}

function formatQuantity(value: string, precision: number) {
  return new Intl.NumberFormat('id-ID', {
    maximumFractionDigits: precision,
  }).format(Number(value))
}

function formatSampleWeight(value?: string | null) {
  return value == null
    ? '—'
    : Number(value).toLocaleString('id-ID', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
}

function apiMessage(error: unknown, fallback: string) {
  if (
    isAxiosError(error) &&
    error.response?.status === 401 &&
    !isDeviceSessionInvalid(error)
  )
    return 'Sesi login tidak valid. Silakan login ulang; aktivasi perangkat tetap tersimpan.'
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? fallback)
    : fallback
}

function readSession(): ActivatedProductionDevice | null {
  if (typeof window === 'undefined') return null
  try {
    const value = localStorage.getItem(storageKey)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<ActivatedProductionDevice>
    return parsed.deviceToken &&
      parsed.device?.uid &&
      parsed.device.site &&
      parsed.device.siteName &&
      (parsed.device.deviceType === 'USB_SCANNER' ||
        parsed.device.deviceType === 'TERMINAL')
      ? (parsed as ActivatedProductionDevice)
      : null
  } catch {
    localStorage.removeItem(storageKey)
    return null
  }
}

function readRecentExpanded() {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(recentExpandedKey) !== 'false'
  } catch {
    return true
  }
}
