import { useEffect, useMemo, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  CheckCircle2,
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
} from './data/queries'
import type {
  ActivatedProductionDevice,
  ProductionPostResult,
  ProductionTerminalLookup,
} from './domain'
import {
  canUseProductionTerminalSite,
  normalizeProductionQuantity,
  validateProductionQuantity,
} from './production-terminal-policy'

const storageKey = 'hris-rsia-production-device-v1'

type RecentTransaction = ProductionPostResult['transaction'] & {
  duplicate: boolean
}

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

  useEffect(() => {
    if (session && !sessionAllowed) {
      localStorage.removeItem(storageKey)
      toast.error('Terminal tersimpan tidak sesuai dengan akses site pengguna.')
    }
  }, [session, sessionAllowed])

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
  const [jobUid, setJobUid] = useState('')
  const [quantity, setQuantity] = useState('')
  const [recent, setRecent] = useState<RecentTransaction[]>([])
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine
  )
  const barcodeRef = useRef<HTMLInputElement>(null)
  const quantityRef = useRef<HTMLInputElement>(null)
  const idempotencyKey = useRef<string | undefined>(undefined)
  const lookupMutation = useProductionTerminalLookup()
  const postMutation = usePostProductionTransaction()
  const selectedJob = lookup?.jobs.find((job) => job.uid === jobUid)
  const estimatedGross = useMemo(() => {
    const amount = Number(selectedJob?.rate.amount)
    const count = Number(normalizeProductionQuantity(quantity))
    return Number.isFinite(amount) && Number.isFinite(count) && count > 0
      ? amount * count
      : 0
  }, [quantity, selectedJob?.rate.amount])

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

  const clearLookup = () => {
    setLookup(undefined)
    setJobUid('')
    setQuantity('')
    setBarcode('')
    idempotencyKey.current = undefined
    lookupMutation.reset()
    postMutation.reset()
  }

  const handleDeviceAuthError = (error: unknown) => {
    const status = isAxiosError(error) ? error.response?.status : undefined
    if (status !== 401 && status !== 403) return false
    toast.error('Sesi terminal tidak valid atau tidak memiliki akses site.')
    onDeactivate()
    return true
  }

  const submitLookup = async () => {
    const value = barcode.trim()
    if (!value || lookupMutation.isPending || !online) return
    try {
      const result = await lookupMutation.mutateAsync({
        barcode: value,
        deviceToken: session.deviceToken,
      })
      setLookup(result)
      setJobUid(result.defaultJobUid)
      setQuantity('')
      idempotencyKey.current = undefined
    } catch (error) {
      if (!handleDeviceAuthError(error)) {
        toast.error(apiMessage(error, 'Karyawan tidak siap menerima setoran.'))
        window.setTimeout(() => barcodeRef.current?.focus(), 50)
      }
    }
  }

  const submitTransaction = async () => {
    if (!lookup || !selectedJob) return
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
          jobUid: selectedJob.uid,
          quantity: normalizeProductionQuantity(quantity),
          idempotencyKey: idempotencyKey.current,
        },
      })
      setRecent((items) =>
        [
          { ...result.transaction, duplicate: result.duplicate },
          ...items.filter((item) => item.uid !== result.transaction.uid),
        ].slice(0, 5)
      )
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
    <Main className='mx-auto w-full max-w-6xl p-3 sm:p-6'>
      <header className='mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0'>
          <p className='text-xs font-medium text-primary'>Terminal Produksi</p>
          <h1 className='truncate text-lg font-bold sm:text-xl'>
            {session.device.name}
          </h1>
          <div className='mt-1 flex flex-wrap gap-1.5'>
            <Badge>{session.device.siteName}</Badge>
            <Badge variant='outline'>{session.device.code}</Badge>
            <Badge variant='secondary'>
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

      <div className='grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]'>
        <Card>
          <CardContent className='space-y-5 p-4 sm:p-6'>
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
                      onChange={(event) => setBarcode(event.target.value)}
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
                className='space-y-5'
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitTransaction()
                }}
              >
                <div className='flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-start sm:justify-between'>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <ShieldCheck className='size-5 text-emerald-600' />
                      <p className='font-semibold'>
                        {lookup.employee.fullName}
                      </p>
                    </div>
                    <p className='mt-1 text-sm text-muted-foreground'>
                      {lookup.employee.employeeNumber} ·{' '}
                      {lookup.employee.productionSection?.name ??
                        'Bagian belum diatur'}
                    </p>
                    <p className='text-xs text-muted-foreground'>
                      Clock in {formatTime(lookup.attendance.clockInAt)} ·{' '}
                      {lookup.businessDate}
                    </p>
                  </div>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={clearLookup}
                  >
                    <RefreshCcw /> Ganti pekerja
                  </Button>
                </div>

                <div className='grid gap-4 sm:grid-cols-2'>
                  <div className='grid gap-2'>
                    <Label htmlFor='production-job'>Pekerjaan</Label>
                    <Select
                      value={jobUid}
                      onValueChange={(value) => {
                        setJobUid(value)
                        setQuantity('')
                        idempotencyKey.current = undefined
                      }}
                    >
                      <SelectTrigger id='production-job' className='w-full'>
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
                  <div className='grid gap-2'>
                    <Label htmlFor='production-quantity'>
                      Jumlah {selectedJob ? `(${selectedJob.unit.code})` : ''}
                    </Label>
                    <Input
                      ref={quantityRef}
                      id='production-quantity'
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
                    <p className='text-xs text-muted-foreground'>
                      Maksimal {selectedJob?.unit.decimalPrecision ?? 0} angka
                      di belakang koma.
                    </p>
                  </div>
                </div>

                <div className='grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-3'>
                  <div>
                    <p className='text-xs text-muted-foreground'>Tarif aktif</p>
                    <p className='font-medium'>
                      {formatCurrency(selectedJob?.rate.amount ?? '0')}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>Satuan</p>
                    <p className='font-medium'>
                      {selectedJob?.unit.name ?? '-'}
                    </p>
                  </div>
                  <div>
                    <p className='text-xs text-muted-foreground'>
                      Estimasi bruto
                    </p>
                    <p className='font-semibold text-primary'>
                      {formatCurrency(estimatedGross)}
                    </p>
                  </div>
                </div>

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
                <Button
                  className='h-12 w-full text-base'
                  disabled={
                    !selectedJob ||
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

        <Card>
          <CardContent className='p-4'>
            <div className='mb-3'>
              <h2 className='font-semibold'>5 setoran terakhir</h2>
              <p className='text-xs text-muted-foreground'>
                Riwayat sesi browser ini, bukan daftar transaksi lengkap.
              </p>
            </div>
            {!recent.length ? (
              <div className='rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground'>
                <PackageCheck className='mx-auto mb-2 size-6' />
                Belum ada setoran pada sesi ini.
              </div>
            ) : (
              <div className='space-y-2'>
                {recent.map((item) => (
                  <div key={item.uid} className='rounded-lg border p-3'>
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
                    <div className='mt-2 flex items-end justify-between gap-2'>
                      <p className='text-sm font-semibold'>
                        {formatQuantity(
                          item.quantity,
                          item.unit.decimalPrecision
                        )}{' '}
                        {item.unit.code}
                      </p>
                      <div className='text-right'>
                        <p className='text-sm font-semibold'>
                          {formatCurrency(item.grossAmount)}
                        </p>
                        <p className='text-[11px] text-muted-foreground'>
                          {formatTime(item.transactionAt)}
                        </p>
                      </div>
                    </div>
                    {item.duplicate && (
                      <Badge variant='secondary' className='mt-2'>
                        Hasil request sebelumnya
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
}

function apiMessage(error: unknown, fallback: string) {
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
