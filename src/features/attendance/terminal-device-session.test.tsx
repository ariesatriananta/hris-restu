import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { TerminalScanPage } from './terminal-scan-page'

const { scan } = vi.hoisted(() => ({ scan: vi.fn() }))
vi.mock('@/features/attendance/data/queries', () => ({
  useAttendanceScan: () => ({ mutateAsync: scan, isPending: false }),
  useActivateAttendanceDevice: () => ({ isPending: false }),
}))

const storageKey = 'hris-rsia-attendance-device-v1'
beforeEach(() => {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      deviceToken: 'synthetic-token',
      device: {
        uid: 'test-device',
        name: 'Perangkat uji',
        code: 'TEST',
        deviceType: 'USB_SCANNER',
        site: 'JEPARA',
        siteName: 'Jepara',
      },
    })
  )
  localStorage.setItem('hris-rsia-attendance-sound-v1', 'false')
})
afterEach(() => {
  localStorage.removeItem(storageKey)
  localStorage.removeItem('hris-rsia-attendance-sound-v1')
  vi.clearAllMocks()
})

describe('attendance activation retention', () => {
  it.each([
    [401, undefined, false],
    [403, undefined, false],
    [500, undefined, false],
    [401, 'DEVICE_SESSION_INVALID', true],
  ])(
    'only discards explicitly invalid device: %s %s',
    async (status, code, disconnected) => {
      scan.mockRejectedValueOnce({
        isAxiosError: true,
        response: { status, data: { code, message: 'Penolakan uji' } },
      })
      const screen = await render(<TerminalScanPage />)
      await screen.getByLabelText('Barcode karyawan').fill('TEST-001')
      await screen.getByRole('button', { name: 'Proses Masuk' }).click()
      if (disconnected) {
        await expect
          .element(screen.getByLabelText('Kode aktivasi'))
          .toBeVisible()
        expect(localStorage.getItem(storageKey)).toBeNull()
      } else {
        await expect
          .element(screen.getByLabelText('Barcode karyawan'))
          .toBeVisible()
        expect(localStorage.getItem(storageKey)).not.toBeNull()
      }
    }
  )
})
