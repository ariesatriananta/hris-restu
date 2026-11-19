import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { TerminalScanPage } from './terminal-scan-page'

const { scan } = vi.hoisted(() => ({ scan: vi.fn() }))
vi.mock('@/features/attendance/data/queries', () => ({
  useAttendanceScan: () => ({ mutateAsync: scan, isPending: false }),
  useActivateAttendanceDevice: () => ({ isPending: false }),
}))

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))
const rejectScan = {
  isAxiosError: true,
  response: { status: 422, data: { message: 'Penolakan uji' } },
}

beforeEach(() => {
  localStorage.setItem(
    'hris-rsia-attendance-device-v1',
    JSON.stringify({
      deviceToken: 'synthetic-token',
      device: {
        uid: 'test-device',
        name: 'Perangkat uji',
        code: 'TEST',
        site: 'JEPARA',
        deviceType: 'USB_SCANNER',
      },
    })
  )
  localStorage.setItem('hris-rsia-attendance-sound-v1', 'false')
  scan.mockRejectedValue(rejectScan)
})

afterEach(() => {
  localStorage.removeItem('hris-rsia-attendance-device-v1')
  localStorage.removeItem('hris-rsia-attendance-sound-v1')
  vi.restoreAllMocks()
  vi.resetAllMocks()
})

describe('attendance automatic barcode submission', () => {
  it('clears successful input, focuses it again, and accepts the next employee', async () => {
    scan.mockResolvedValue({
      result: 'SUCCESS',
      duplicate: false,
      eventType: 'CLOCK_IN',
      businessDate: '2026-11-19',
      scannedAt: '2026-11-19T07:00:00+07:00',
      employee: { fullName: 'Karyawan Uji' },
      attendance: { qualityStatus: 'NORMAL' },
      warnings: [],
    })
    const screen = await render(<TerminalScanPage />)
    const input = screen.getByLabelText('Barcode karyawan')
    await input.fill('TEST-001')
    await expect.poll(() => scan.mock.calls.length).toBe(1)
    await expect.element(input).toHaveValue('')
    await expect.element(input).toHaveFocus()
    await input.fill('TEST-002')
    await expect.poll(() => scan.mock.calls.length).toBe(2)
    expect(scan.mock.calls[1][0].input.barcode).toBe('TEST-002')
  })

  it('waits 800 ms after the last edit, submits only the latest barcode, and never retries an error', async () => {
    const screen = await render(<TerminalScanPage />)
    const input = screen.getByLabelText('Barcode karyawan')
    await input.fill('TEST-0')
    await wait(400)
    await input.fill('TEST-001')
    await wait(450)
    expect(scan).not.toHaveBeenCalled()
    await expect.poll(() => scan.mock.calls.length).toBe(1)
    expect(scan.mock.calls[0][0].input).toMatchObject({
      barcode: 'TEST-001',
      eventType: 'CLOCK_IN',
    })
    await expect.element(input).toHaveValue('')
    await wait(900)
    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('submits the form immediately and cancels its pending automatic scan', async () => {
    const screen = await render(<TerminalScanPage />)
    await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
    // Native form submission is the same path used by the scanner Enter suffix.
    await act(async () => {
      document.querySelector('form')!.requestSubmit()
    })
    expect(scan).toHaveBeenCalledTimes(1)
    await wait(900)
    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('blocks overlapping submissions even before mutation pending state renders', async () => {
    scan.mockReturnValue(new Promise(() => {}))
    const screen = await render(<TerminalScanPage />)
    await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
    await act(async () => {
      const form = document.querySelector('form')!
      form.requestSubmit()
      form.requestSubmit()
    })
    await wait(900)
    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('cancels input when changing between Masuk and Pulang', async () => {
    const screen = await render(<TerminalScanPage />)
    await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
    await screen.getByRole('tab', { name: 'Pulang' }).click()
    await wait(900)
    expect(scan).not.toHaveBeenCalled()
    await expect
      .element(screen.getByLabelText('Barcode karyawan'))
      .toHaveValue('')
    await screen.getByLabelText('Barcode karyawan').fill('TEST-002')
    await expect.poll(() => scan.mock.calls.length).toBe(1)
    expect(scan.mock.calls[0][0].input.eventType).toBe('CLOCK_OUT')
  })

  it('cancels on offline and does not automatically replay on reconnect', async () => {
    const screen = await render(<TerminalScanPage />)
    await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await act(async () => {
      window.dispatchEvent(new Event('offline'))
    })
    await wait(900)
    expect(scan).not.toHaveBeenCalled()
    online.mockReturnValue(true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    await wait(900)
    expect(scan).not.toHaveBeenCalled()
    await screen.getByRole('button', { name: 'Proses Masuk' }).click()
    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('removes the pending timeout when unmounted', async () => {
    const screen = await render(<TerminalScanPage />)
    await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
    await screen.unmount()
    await wait(900)
    expect(scan).not.toHaveBeenCalled()
  })
})
