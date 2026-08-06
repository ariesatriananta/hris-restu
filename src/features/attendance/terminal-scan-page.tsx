import { useCallback, useEffect, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  Camera,
  CameraOff,
  CheckCircle2,
  ClockArrowDown,
  ClockArrowUp,
  Keyboard,
  LoaderCircle,
  LogOut,
  ScanBarcode,
  ShieldAlert,
  XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Main } from '@/components/layout/main'
import { useActivateAttendanceDevice, useAttendanceScan } from './data/queries'
import type {
  ActivatedAttendanceDevice,
  AttendanceScanEventType,
  AttendanceScanSuccess,
} from './domain'

const storageKey = 'hris-rsia-attendance-device-v1'

type TerminalSession = ActivatedAttendanceDevice
type RecentResult = {
  id: string
  severity: 'success' | 'warning' | 'error'
  title: string
  message: string
  time: string
}

export function TerminalScanPage() {
  const [session, setSession] = useState<TerminalSession | null>(readSession)
  if (!session)
    return (
      <ActivationScreen
        onActivated={(value) => {
          localStorage.setItem(storageKey, JSON.stringify(value))
          setSession(value)
        }}
      />
    )
  return (
    <ScanTerminal
      session={session}
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
  onActivated: (session: TerminalSession) => void
}) {
  const [activationCode, setActivationCode] = useState('')
  const activate = useActivateAttendanceDevice()
  return (
    <Main className='flex min-h-[calc(100vh-4rem)] items-center justify-center p-4'>
      <Card className='w-full max-w-md'>
        <CardContent className='space-y-6 p-6 sm:p-8'>
          <div className='text-center'>
            <div className='mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary'>
              <ScanBarcode className='size-8' />
            </div>
            <h1 className='text-2xl font-bold'>Aktivasi Terminal</h1>
            <p className='mt-2 text-sm text-muted-foreground'>
              Masukkan kode satu kali dari Master Perangkat untuk menghubungkan
              browser ini.
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
              <Label htmlFor='activation-code'>Kode aktivasi</Label>
              <Input
                id='activation-code'
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
                  'Kode aktivasi tidak valid atau sudah kedaluwarsa.'
                )}
              </p>
            )}
            <Button
              className='h-12 w-full'
              disabled={activate.isPending || !activationCode.trim()}
            >
              {activate.isPending && <LoaderCircle className='animate-spin' />}{' '}
              Aktivasi perangkat
            </Button>
          </form>
          <p className='text-center text-xs text-muted-foreground'>
            Terminal membutuhkan koneksi internet. Mode offline tidak tersedia.
          </p>
        </CardContent>
      </Card>
    </Main>
  )
}

function ScanTerminal({
  session,
  onDeactivate,
}: {
  session: TerminalSession
  onDeactivate: () => void
}) {
  const [eventType, setEventType] =
    useState<AttendanceScanEventType>('CLOCK_IN')
  const [barcode, setBarcode] = useState('')
  const [feedback, setFeedback] = useState<RecentResult>()
  const [recent, setRecent] = useState<RecentResult[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const submitting = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const scan = useAttendanceScan()
  const focusInput = useCallback(() => {
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }, [])
  useEffect(focusInput, [focusInput, eventType])

  const submitBarcode = useCallback(
    async (rawBarcode: string) => {
      const value = rawBarcode.trim()
      if (!value || submitting.current) return
      submitting.current = true
      setCameraOpen(false)
      try {
        const result = await scan.mutateAsync({
          deviceToken: session.deviceToken,
          input: {
            eventType,
            barcode: value,
            idempotencyKey: crypto.randomUUID(),
          },
        })
        const item = successResult(result)
        setFeedback(item)
        setRecent((current) => [item, ...current].slice(0, 5))
        setBarcode('')
      } catch (error) {
        const status = isAxiosError(error) ? error.response?.status : undefined
        if (status === 401 || status === 403) {
          localStorage.removeItem(storageKey)
          onDeactivate()
          return
        }
        const item = rejectedResult(error, eventType)
        setFeedback(item)
        setRecent((current) => [item, ...current].slice(0, 5))
        setBarcode('')
      } finally {
        submitting.current = false
        focusInput()
      }
    },
    [eventType, focusInput, onDeactivate, scan, session.deviceToken]
  )

  return (
    <Main className='mx-auto w-full max-w-5xl p-3 sm:p-6'>
      <div className='mb-4 flex items-start justify-between gap-3 rounded-xl border bg-card p-4'>
        <div className='min-w-0'>
          <p className='text-xs font-medium text-primary'>
            Terminal Attendance
          </p>
          <h1 className='truncate text-lg font-bold sm:text-xl'>
            {session.device.name}
          </h1>
          <p className='text-xs text-muted-foreground'>
            {session.device.code} · {session.device.site} · Online
          </p>
        </div>
        <Button
          variant='outline'
          size='sm'
          onClick={() => setConfirmDeactivate(true)}
        >
          <LogOut /> <span className='hidden sm:inline'>Putuskan</span>
        </Button>
      </div>

      <Tabs
        value={eventType}
        onValueChange={(value) => {
          setEventType(value as AttendanceScanEventType)
          setFeedback(undefined)
        }}
      >
        <TabsList className='grid h-auto w-full grid-cols-2 gap-2 bg-transparent p-0'>
          <TabsTrigger
            value='CLOCK_IN'
            className='h-14 gap-2 border bg-card text-base data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
          >
            <ClockArrowDown className='size-5' /> Masuk
          </TabsTrigger>
          <TabsTrigger
            value='CLOCK_OUT'
            className='h-14 gap-2 border bg-card text-base data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground'
          >
            <ClockArrowUp className='size-5' /> Pulang
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className='mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]'>
        <div className='space-y-4'>
          <Card>
            <CardContent className='space-y-4 p-4 sm:p-6'>
              <div className='text-center'>
                <Keyboard className='mx-auto mb-2 size-8 text-primary' />
                <h2 className='text-lg font-semibold'>Scan barcode karyawan</h2>
                <p className='text-sm text-muted-foreground'>
                  Arahkan scanner USB atau ketik barcode lalu tekan Enter.
                </p>
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void submitBarcode(barcode)
                }}
              >
                <Label htmlFor='employee-barcode' className='sr-only'>
                  Barcode karyawan
                </Label>
                <Input
                  ref={inputRef}
                  id='employee-barcode'
                  className='h-16 text-center text-xl font-semibold'
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  placeholder='Scan barcode di sini'
                  autoComplete='off'
                  autoCapitalize='off'
                  spellCheck={false}
                  disabled={scan.isPending}
                  autoFocus
                />
                <Button
                  className='mt-3 h-12 w-full text-base'
                  disabled={scan.isPending || !barcode.trim()}
                >
                  {scan.isPending ? (
                    <LoaderCircle className='animate-spin' />
                  ) : (
                    <ScanBarcode />
                  )}{' '}
                  Proses {eventType === 'CLOCK_IN' ? 'Masuk' : 'Pulang'}
                </Button>
              </form>
              <Button
                type='button'
                variant='outline'
                className='h-11 w-full'
                onClick={() => setCameraOpen((open) => !open)}
                disabled={scan.isPending}
              >
                {cameraOpen ? <CameraOff /> : <Camera />}{' '}
                {cameraOpen ? 'Tutup Kamera' : 'Scan dengan Kamera'}
              </Button>
              {cameraOpen && (
                <NativeBarcodeCamera
                  onDetected={(value) => submitBarcode(value)}
                  onClose={() => {
                    setCameraOpen(false)
                    focusInput()
                  }}
                />
              )}
            </CardContent>
          </Card>
          {feedback && <FeedbackPanel result={feedback} />}
        </div>
        <Card className='h-fit'>
          <CardContent className='p-4'>
            <h2 className='font-semibold'>Hasil terbaru</h2>
            <p className='mb-3 text-xs text-muted-foreground'>
              Hanya tersimpan selama halaman ini terbuka.
            </p>
            {!recent.length ? (
              <p className='py-6 text-center text-sm text-muted-foreground'>
                Belum ada scan.
              </p>
            ) : (
              <div className='divide-y'>
                {recent.map((item) => (
                  <div key={item.id} className='py-3'>
                    <div className='flex items-start gap-2'>
                      {item.severity === 'success' ? (
                        <CheckCircle2 className='mt-0.5 size-4 shrink-0 text-positive' />
                      ) : item.severity === 'warning' ? (
                        <ShieldAlert className='mt-0.5 size-4 shrink-0 text-warning-foreground' />
                      ) : (
                        <XCircle className='mt-0.5 size-4 shrink-0 text-destructive' />
                      )}
                      <div>
                        <p className='text-sm font-medium'>{item.title}</p>
                        <p className='text-xs text-muted-foreground'>
                          {item.message}
                        </p>
                        <p className='mt-1 text-[11px] text-muted-foreground'>
                          {item.time}
                        </p>
                      </div>
                    </div>
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
        title='Putuskan terminal ini?'
        desc='Token perangkat akan dihapus dari browser ini. Kode aktivasi baru diperlukan untuk menghubungkannya kembali.'
        confirmText='Putuskan terminal'
        destructive
        handleConfirm={onDeactivate}
      />
    </Main>
  )
}

function FeedbackPanel({ result }: { result: RecentResult }) {
  return (
    <div
      role={result.severity === 'success' ? 'status' : 'alert'}
      className={`rounded-xl border-2 p-5 text-center ${result.severity === 'success' ? 'border-positive/50 bg-positive/10' : result.severity === 'warning' ? 'border-warning/60 bg-warning/15' : 'border-destructive/50 bg-destructive/10'}`}
    >
      {result.severity === 'success' ? (
        <CheckCircle2 className='mx-auto mb-2 size-12 text-positive' />
      ) : result.severity === 'warning' ? (
        <ShieldAlert className='mx-auto mb-2 size-12 text-warning-foreground' />
      ) : (
        <ShieldAlert className='mx-auto mb-2 size-12 text-destructive' />
      )}
      <p className='text-xl font-bold'>{result.title}</p>
      <p className='mt-1 text-sm'>{result.message}</p>
      <p className='mt-2 text-xs text-muted-foreground'>{result.time}</p>
    </div>
  )
}

function NativeBarcodeCamera({
  onDetected,
  onClose,
}: {
  onDetected: (value: string) => Promise<void>
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | undefined>(undefined)
  const frameRef = useRef<number | undefined>(undefined)
  const detecting = useRef(false)
  const [error, setError] = useState<string>()
  const supported = Boolean(
    typeof window !== 'undefined' &&
    (
      window as unknown as {
        BarcodeDetector?: BarcodeDetectorConstructor
      }
    ).BarcodeDetector &&
    navigator.mediaDevices?.getUserMedia
  )
  useEffect(() => {
    let disposed = false
    const Detector = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector
    if (!Detector || !navigator.mediaDevices?.getUserMedia) return
    const detector = new Detector({
      formats: ['code_128', 'code_39', 'ean_13', 'qr_code'],
    })
    const stop = () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        const detect = async () => {
          if (disposed || !videoRef.current) return
          if (!detecting.current && videoRef.current.readyState >= 2) {
            detecting.current = true
            try {
              const codes = await detector.detect(videoRef.current)
              const value = codes[0]?.rawValue?.trim()
              if (value) {
                stop()
                await onDetected(value)
                return
              }
            } catch {
              /* frame berikutnya */
            } finally {
              detecting.current = false
            }
          }
          frameRef.current = requestAnimationFrame(() => void detect())
        }
        void detect()
      } catch {
        setError(
          'Kamera tidak dapat dibuka. Periksa izin browser atau gunakan scanner USB.'
        )
      }
    }
    void start()
    return () => {
      disposed = true
      stop()
    }
  }, [onDetected, supported])
  if (!supported)
    return (
      <div
        role='alert'
        className='rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground'
      >
        <CameraOff className='mx-auto mb-2' />
        Kamera barcode native tidak didukung browser ini. Gunakan scanner USB
        atau input manual.
        <Button variant='link' className='mt-2 block w-full' onClick={onClose}>
          Kembali ke input barcode
        </Button>
      </div>
    )
  if (error)
    return (
      <div
        role='alert'
        className='rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground'
      >
        <CameraOff className='mx-auto mb-2' />
        {error}
        <Button variant='link' className='mt-2 block w-full' onClick={onClose}>
          Kembali ke input barcode
        </Button>
      </div>
    )
  return (
    <div className='overflow-hidden rounded-xl border bg-black'>
      <video
        ref={videoRef}
        className='aspect-[4/3] w-full object-cover'
        muted
        playsInline
        aria-label='Pratinjau kamera pemindai barcode'
      />
      <p className='bg-black p-2 text-center text-xs text-white'>
        Arahkan barcode ke tengah kamera. Tidak ada foto yang disimpan.
      </p>
    </div>
  )
}

type DetectedBarcode = { rawValue?: string }
type BarcodeDetectorInstance = {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>
}
type BarcodeDetectorConstructor = new (options?: {
  formats?: string[]
}) => BarcodeDetectorInstance

function successResult(result: AttendanceScanSuccess): RecentResult {
  const warning = result.warnings?.[0]
  return {
    id: crypto.randomUUID(),
    severity:
      result.attendance.qualityStatus === 'ABNORMAL' || result.warnings?.length
        ? 'warning'
        : 'success',
    title: result.employee.fullName,
    message:
      warning?.message ??
      `${result.eventType === 'CLOCK_IN' ? 'Masuk' : 'Pulang'} berhasil · ${result.businessDate}${result.duplicate ? ' (hasil scan sebelumnya)' : ''}`,
    time: formatServerTime(result.scannedAt),
  }
}
function rejectedResult(
  error: unknown,
  eventType: AttendanceScanEventType
): RecentResult {
  const response = isAxiosError<{ message?: string; result?: string }>(error)
    ? error.response
    : undefined
  const data = response?.data
  return {
    id: crypto.randomUUID(),
    severity: 'error',
    title:
      response?.status === 422
        ? `${eventType === 'CLOCK_IN' ? 'Masuk' : 'Pulang'} ditolak`
        : 'Scan gagal diproses',
    message:
      data?.message ??
      (isAxiosError(error) && !error.response
        ? 'Tidak dapat terhubung ke server. Periksa koneksi internet.'
        : 'Scan gagal diproses.'),
    time: new Intl.DateTimeFormat('id-ID', { timeStyle: 'medium' }).format(
      new Date()
    ),
  }
}
function formatServerTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
}
function readSession(): TerminalSession | null {
  if (typeof window === 'undefined') return null
  try {
    const value = localStorage.getItem(storageKey)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<TerminalSession>
    return parsed.deviceToken && parsed.device?.uid
      ? (parsed as TerminalSession)
      : null
  } catch {
    localStorage.removeItem(storageKey)
    return null
  }
}
function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data.message ?? fallback)
    : fallback
}
