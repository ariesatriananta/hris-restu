import { useEffect, useRef, useState } from 'react'
import { CameraOff } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NativeBarcodeCamera({
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
  const detectedCallback = useRef(onDetected)
  useEffect(() => {
    detectedCallback.current = onDetected
  }, [onDetected])
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
      if (disposed || !detectedCallback.current) return
      disposed = true
      stop()
      await detectedCallback.current(value)
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
        if (disposed) fallbackControls.stop()
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
  }, [cameraSupported, testOnly])
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
