import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { NativeBarcodeCamera } from './native-barcode-camera'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('shared barcode camera lifecycle', () => {
  it('reports denied permission and allows returning to manual input', async () => {
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockRejectedValue(
      new DOMException('Denied', 'NotAllowedError')
    )
    const close = vi.fn()
    const detected = vi.fn()
    const screen = await render(
      <NativeBarcodeCamera onClose={close} onDetected={detected} />
    )
    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Izin kamera ditolak')
    await screen
      .getByRole('button', { name: 'Kembali ke input barcode' })
      .click()
    expect(close).toHaveBeenCalledOnce()
    expect(detected).not.toHaveBeenCalled()
  })

  it('stops a stream that resolves after the scanner has been closed', async () => {
    let finish!: (stream: MediaStream) => void
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const stream = new MediaStream()
    const stop = vi.fn()
    vi.spyOn(stream, 'getTracks').mockReturnValue([
      { stop } as unknown as MediaStreamTrack,
    ])
    const screen = await render(
      <NativeBarcodeCamera onClose={vi.fn()} onDetected={vi.fn()} />
    )
    await expect
      .poll(() => navigator.mediaDevices.getUserMedia)
      .toHaveBeenCalledOnce()
    await screen.unmount()
    finish(stream)
    await expect.poll(() => stop.mock.calls.length).toBe(1)
  })

  it('detects a barcode only once and releases camera tracks before lookup', async () => {
    const stream = new MediaStream()
    const stop = vi.fn()
    vi.spyOn(stream, 'getTracks').mockReturnValue([
      { stop } as unknown as MediaStreamTrack,
    ])
    vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(stream)
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'readyState', 'get').mockReturnValue(4)
    vi.stubGlobal(
      'BarcodeDetector',
      class {
        async detect() {
          return [{ rawValue: 'TEST-001' }]
        }
      }
    )
    const detected = vi.fn(async () => {
      expect(stop).toHaveBeenCalled()
    })
    const screen = await render(
      <NativeBarcodeCamera onClose={vi.fn()} onDetected={detected} />
    )
    await expect.poll(() => detected.mock.calls.length).toBe(1)
    expect(detected).toHaveBeenCalledWith('TEST-001')
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(detected).toHaveBeenCalledOnce()
    await screen.unmount()
  })
})
