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
  Maximize2,
  Minimize2,
  ScanBarcode,
  ShieldAlert,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Main } from '@/components/layout/main'
import { useActivateAttendanceDevice, useAttendanceScan } from './data/queries'
import type {
  ActivatedAttendanceDevice,
  AttendanceDeviceType,
  AttendanceScanEventType,
  AttendanceScanSuccess,
} from './domain'

const storageKey = 'hris-rsia-attendance-device-v1'
const soundPreferenceKey = 'hris-rsia-attendance-sound-v1'

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
  const [cameraTestOpen, setCameraTestOpen] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(readSoundPreference)
  const [fullscreen, setFullscreen] = useState(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  )
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const browserOnline = useBrowserOnline()
  const submitting = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const scan = useAttendanceScan()
  const focusInput = useCallback(() => {
    window.setTimeout(() => inputRef.current?.focus(), 50)
  }, [])
  useEffect(focusInput, [focusInput, eventType])
  useEffect(() => {
    if (browserOnline) focusInput()
  }, [browserOnline, focusInput])
  useEffect(() => {
    const update = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', update)
    return () => document.removeEventListener('fullscreenchange', update)
  }, [])

  const toggleSound = () => {
    setSoundEnabled((current) => {
      const next = !current
      try {
        localStorage.setItem(soundPreferenceKey, String(next))
      } catch {
        // Preferensi tetap berlaku selama halaman aktif bila storage diblokir.
      }
      if (next) void playResultSound('success', true)
      return next
    })
    focusInput()
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      toast.error('Mode layar penuh tidak dapat dibuka oleh browser ini.')
    } finally {
      focusInput()
    }
  }

  const submitBarcode = useCallback(
    async (rawBarcode: string) => {
      const value = rawBarcode.trim()
      if (!value || submitting.current) return
      if (!browserOnline) {
        setCameraOpen(false)
        focusInput()
        return
      }
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
        vibrateForResult(item.severity)
        void playResultSound(item.severity, soundEnabled)
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
        vibrateForResult(item.severity)
        void playResultSound(item.severity, soundEnabled)
        setFeedback(item)
        setRecent((current) => [item, ...current].slice(0, 5))
        setBarcode('')
      } finally {
        submitting.current = false
        focusInput()
      }
    },
    [
      browserOnline,
      eventType,
      focusInput,
      onDeactivate,
      scan,
      session.deviceToken,
      soundEnabled,
    ]
  )

  return (
    <Main className='mx-auto w-full max-w-5xl p-3 sm:p-6'>
      <div className='mb-4 flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between'>
        <div className='min-w-0'>
          <p className='text-xs font-medium text-primary'>
            Terminal Attendance
          </p>
          <h1 className='truncate text-lg font-bold sm:text-xl'>
            {session.device.name}
          </h1>
          <div className='mt-1 flex flex-wrap items-center gap-1.5'>
            <Badge className='bg-primary text-primary-foreground'>
              Site {session.device.site}
            </Badge>
            <Badge variant='outline'>{session.device.code}</Badge>
            <Badge variant='secondary'>
              {deviceTypeLabel(session.device.deviceType)}
            </Badge>
          </div>
        </div>
        <div className='flex min-w-0 flex-col gap-2 sm:items-end'>
          <div
            role='status'
            title='Status jaringan browser. Koneksi server tetap diverifikasi saat scan.'
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${browserOnline ? 'border-positive/40 bg-positive/10 text-positive' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}
          >
            {browserOnline ? (
              <Wifi className='size-3.5' />
            ) : (
              <WifiOff className='size-3.5' />
            )}
            {browserOnline ? 'Browser online' : 'Browser offline'}
          </div>
          <span className='text-[10px] text-muted-foreground'>
            Server diverifikasi saat scan
          </span>
          <div className='flex flex-wrap gap-1.5 sm:justify-end'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              aria-pressed={soundEnabled}
              title={
                soundEnabled
                  ? 'Matikan suara feedback'
                  : 'Aktifkan suara feedback'
              }
              onClick={toggleSound}
            >
              {soundEnabled ? <Volume2 /> : <VolumeX />}
              {soundEnabled ? 'Suara aktif' : 'Suara mati'}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setCameraTestOpen(true)}
            >
              <Camera /> Uji kamera
            </Button>
            {document.fullscreenEnabled && (
              <Button
                type='button'
                variant='outline'
                size='sm'
                aria-pressed={fullscreen}
                onClick={() => void toggleFullscreen()}
              >
                {fullscreen ? <Minimize2 /> : <Maximize2 />}
                {fullscreen ? 'Keluar kiosk' : 'Mode kiosk'}
              </Button>
            )}
            <Button
              variant='outline'
              size='sm'
              onClick={() => setConfirmDeactivate(true)}
            >
              <LogOut /> Putuskan
            </Button>
          </div>
        </div>
      </div>

      {!browserOnline && (
        <div
          role='alert'
          className='mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive'
        >
          <WifiOff className='mt-0.5 size-4 shrink-0' />
          <div>
            <p className='font-medium'>Scan sementara dinonaktifkan</p>
            <p className='text-xs'>
              Browser mendeteksi perangkat sedang offline. Sambungkan jaringan;
              input barcode akan fokus kembali otomatis.
            </p>
          </div>
        </div>
      )}

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
            className='h-14 gap-2 border bg-card text-base text-positive data-[state=active]:border-positive data-[state=active]:bg-positive data-[state=active]:text-positive-foreground'
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

      <div
        role='status'
        className={`mt-2 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${eventType === 'CLOCK_IN' ? 'border-positive/40 bg-positive/10 text-positive' : 'border-primary/40 bg-primary/10 text-primary'}`}
      >
        {eventType === 'CLOCK_IN' ? (
          <ClockArrowDown className='size-4' />
        ) : (
          <ClockArrowUp className='size-4' />
        )}
        Mode aktif: {eventType === 'CLOCK_IN' ? 'Masuk' : 'Pulang'}
      </div>

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
                  disabled={scan.isPending || !browserOnline}
                  autoFocus
                />
                <Button
                  className='mt-3 h-12 w-full text-base'
                  disabled={scan.isPending || !browserOnline || !barcode.trim()}
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
                disabled={scan.isPending || !browserOnline}
              >
                {cameraOpen ? <CameraOff /> : <Camera />}{' '}
                {cameraOpen ? 'Tutup Kamera' : 'Scan dengan Kamera'}
              </Button>
              {cameraOpen && (
                <NativeBarcodeCamera
                  onDetected={submitBarcode}
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
            <div className='flex items-center justify-between gap-2'>
              <h2 className='font-semibold'>Aktivitas terbaru</h2>
              {recent.length > 0 && (
                <span className='text-xs text-muted-foreground'>
                  {recent.length} hasil
                </span>
              )}
            </div>
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
                  <div
                    key={item.id}
                    className={`border-l-2 py-2.5 pl-2 ${item.severity === 'success' ? 'border-l-positive' : item.severity === 'warning' ? 'border-l-warning' : 'border-l-destructive'}`}
                  >
                    <div className='flex items-start gap-2'>
                      {item.severity === 'success' ? (
                        <CheckCircle2 className='mt-0.5 size-4 shrink-0 text-positive' />
                      ) : item.severity === 'warning' ? (
                        <ShieldAlert className='mt-0.5 size-4 shrink-0 text-warning-foreground' />
                      ) : (
                        <XCircle className='mt-0.5 size-4 shrink-0 text-destructive' />
                      )}
                      <div className='min-w-0'>
                        <p className='truncate text-sm font-medium'>
                          {item.title}
                        </p>
                        <p className='text-xs break-words text-muted-foreground'>
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
      <Dialog open={cameraTestOpen} onOpenChange={setCameraTestOpen}>
        <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg'>
          <DialogHeader>
            <DialogTitle>Uji Kamera Terminal</DialogTitle>
            <DialogDescription>
              Memastikan browser dapat membuka kamera. Mode ini tidak membaca
              barcode dan tidak mengirim data scan.
            </DialogDescription>
          </DialogHeader>
          {cameraTestOpen && (
            <NativeBarcodeCamera
              testOnly
              onClose={() => setCameraTestOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
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
      aria-live={result.severity === 'error' ? 'assertive' : 'polite'}
      className={`rounded-xl border-2 p-5 text-center ${result.severity === 'success' ? 'border-positive/50 bg-positive/10' : result.severity === 'warning' ? 'border-warning/60 bg-warning/15' : 'border-destructive/50 bg-destructive/10'}`}
    >
      {result.severity === 'success' ? (
        <CheckCircle2 className='mx-auto mb-2 size-12 text-positive' />
      ) : result.severity === 'warning' ? (
        <ShieldAlert className='mx-auto mb-2 size-12 text-warning-foreground' />
      ) : (
        <XCircle className='mx-auto mb-2 size-12 text-destructive' />
      )}
      <p
        className={`text-xs font-semibold tracking-wide uppercase ${result.severity === 'success' ? 'text-positive' : result.severity === 'warning' ? 'text-warning-foreground' : 'text-destructive'}`}
      >
        {result.severity === 'success'
          ? 'Berhasil'
          : result.severity === 'warning'
            ? 'Berhasil dengan catatan'
            : 'Gagal'}
      </p>
      <p className='text-xl font-bold'>{result.title}</p>
      <p className='mt-1 text-sm'>{result.message}</p>
      <p className='mt-2 text-xs text-muted-foreground'>{result.time}</p>
    </div>
  )
}

function NativeBarcodeCamera({
  onDetected,
  onClose,
  testOnly = false,
}: {
  onDetected?: (value: string) => Promise<void>
  onClose: () => void
  testOnly?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | undefined>(undefined)
  const frameRef = useRef<number | undefined>(undefined)
  const detecting = useRef(false)
  const [error, setError] = useState<string>()
  const secureContext =
    typeof window !== 'undefined' && window.isSecureContext === true
  const cameraSupported = Boolean(
    secureContext && navigator.mediaDevices?.getUserMedia
  )
  useEffect(() => {
    let disposed = false
    let fallbackControls: { stop: () => void } | undefined
    const Detector = (
      window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
    ).BarcodeDetector
    if (!cameraSupported || !navigator.mediaDevices?.getUserMedia) return
    const stop = () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      fallbackControls?.stop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
    const detected = async (value: string) => {
      if (disposed || !onDetected) return
      disposed = true
      stop()
      await onDetected(value)
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
        const video = videoRef.current
        if (!video) {
          stop()
          return
        }
        video.srcObject = stream
        await video.play()
        if (testOnly) return
        if (Detector) {
          const detector = new Detector({
            formats: ['code_128', 'code_39', 'ean_13', 'qr_code'],
          })
          const detect = async () => {
            if (disposed || !videoRef.current) return
            if (!detecting.current && videoRef.current.readyState >= 2) {
              detecting.current = true
              try {
                const codes = await detector.detect(videoRef.current)
                const value = codes[0]?.rawValue?.trim()
                if (value) {
                  await detected(value)
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
          return
        }

        const { BarcodeFormat, BrowserMultiFormatReader } =
          await import('@zxing/browser')
        if (disposed) return stop()
        const reader = new BrowserMultiFormatReader()
        reader.possibleFormats = [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.QR_CODE,
        ]
        fallbackControls = await reader.decodeFromStream(
          stream,
          video,
          (result) => {
            const value = result?.getText().trim()
            if (value) void detected(value)
          }
        )
      } catch (cause) {
        stop()
        if (!disposed) setError(cameraErrorMessage(cause))
      }
    }
    void start()
    return () => {
      disposed = true
      stop()
    }
  }, [cameraSupported, onDetected, testOnly])
  if (!cameraSupported)
    return (
      <div
        role='alert'
        className='rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground'
      >
        <CameraOff className='mx-auto mb-2' />
        {secureContext
          ? 'Browser atau perangkat ini tidak menyediakan akses kamera.'
          : 'Kamera hanya dapat digunakan melalui HTTPS atau localhost.'}{' '}
        Gunakan scanner USB atau input manual bila kamera tidak tersedia.
        <Button variant='link' className='mt-2 block w-full' onClick={onClose}>
          {testOnly ? 'Tutup uji kamera' : 'Kembali ke input barcode'}
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
          {testOnly ? 'Tutup uji kamera' : 'Kembali ke input barcode'}
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
        aria-label={
          testOnly
            ? 'Pratinjau uji kamera'
            : 'Pratinjau kamera pemindai barcode'
        }
      />
      <p className='bg-black p-2 text-center text-xs text-white'>
        {testOnly
          ? 'Kamera aktif. Tidak ada foto atau barcode yang disimpan.'
          : 'Arahkan barcode ke tengah kamera. Tidak ada foto yang disimpan.'}
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

function cameraErrorMessage(cause: unknown) {
  const name = cause instanceof DOMException ? cause.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'Izin kamera ditolak. Izinkan akses kamera dari pengaturan situs browser, lalu coba lagi.'
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'Kamera tidak ditemukan pada perangkat ini.'
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'Kamera sedang dipakai aplikasi lain atau tidak dapat dibaca. Tutup aplikasi kamera lain lalu coba lagi.'
  return 'Kamera tidak dapat dibuka. Muat ulang halaman atau gunakan scanner USB.'
}

function useBrowserOnline() {
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine
  )
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

function vibrateForResult(severity: RecentResult['severity']) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  try {
    navigator.vibrate(
      severity === 'success'
        ? 60
        : severity === 'warning'
          ? [70, 50, 70]
          : [160, 70, 160]
    )
  } catch {
    // Getaran hanya enhancement; kegagalan perangkat tidak memengaruhi scan.
  }
}

let feedbackAudioContext: AudioContext | undefined

async function playResultSound(
  severity: RecentResult['severity'],
  enabled: boolean
) {
  if (!enabled || typeof window === 'undefined') return
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!AudioContextConstructor) return
  try {
    const context =
      feedbackAudioContext ??
      (feedbackAudioContext = new AudioContextConstructor())
    if (context.state === 'suspended') await context.resume()
    const pattern =
      severity === 'success'
        ? [
            { frequency: 660, offset: 0, duration: 0.08 },
            { frequency: 880, offset: 0.1, duration: 0.11 },
          ]
        : severity === 'warning'
          ? [
              { frequency: 480, offset: 0, duration: 0.1 },
              { frequency: 480, offset: 0.15, duration: 0.1 },
            ]
          : [
              { frequency: 220, offset: 0, duration: 0.15 },
              { frequency: 180, offset: 0.2, duration: 0.18 },
            ]
    const start = context.currentTime + 0.01
    pattern.forEach(({ frequency, offset, duration }) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const toneStart = start + offset
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, toneStart)
      gain.gain.setValueAtTime(0.0001, toneStart)
      gain.gain.exponentialRampToValueAtTime(0.025, toneStart + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, toneStart + duration)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(toneStart)
      oscillator.stop(toneStart + duration + 0.01)
    })
  } catch {
    // Audio hanya enhancement; kegagalan browser tidak boleh menghambat scan.
  }
}

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
function readSoundPreference() {
  if (typeof window === 'undefined') return true
  try {
    return localStorage.getItem(soundPreferenceKey) !== 'false'
  } catch {
    return true
  }
}
function deviceTypeLabel(value: AttendanceDeviceType) {
  return (
    {
      MOBILE_CAMERA: 'Kamera seluler',
      USB_SCANNER: 'Scanner USB',
      TERMINAL: 'Terminal',
      OTHER: 'Perangkat lain',
    }[value] ?? value
  )
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
