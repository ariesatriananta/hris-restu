import fs from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:4173'
const executablePath =
  process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined
const routes = [
  '/attendance/monitoring-harian',
  '/attendance/scan',
  '/attendance/rekap',
  '/attendance/koreksi',
  '/attendance/master-shift',
  '/produksi/terminal-setoran',
  '/produksi/transaksi',
  '/produksi/rekap',
  '/produksi/master-pekerjaan',
  '/produksi/tarif-site',
  '/payroll/periode',
  '/payroll/simulasi',
  '/payroll/approval-closing',
  '/payroll/riwayat',
  '/payroll/slip-gaji',
  '/laporan',
  '/administrasi/user-hak-akses',
  '/administrasi/template-dokumen',
  '/administrasi/audit-trail',
  '/administrasi/pengaturan',
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message))
page.on('console', (message) => {
  if (message.type() === 'error') console.error('BROWSER ERROR:', message.text())
})
await fs.mkdir('artifacts', { recursive: true })

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Masuk ke HRIS' }).click()
  await page.getByRole('heading', { name: 'Dashboard Operasional' }).waitFor()

  await page.goto(`${baseUrl}/karyawan/data-karyawan`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Data Karyawan' }).waitFor()
  await page.goto(`${baseUrl}/karyawan/data-karyawan/emp-adi-001`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Adi Pratama' }).waitFor()
  await page.goto(`${baseUrl}/karyawan/riwayat-mutasi`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Riwayat Mutasi' }).waitFor()
  await page.goto(`${baseUrl}/karyawan/pkwt-dokumen`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'PKWT & Dokumen' }).waitFor()
  await page.goto(`${baseUrl}/karyawan/cetak-id-card`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Cetak ID Card' }).waitFor()
  await page.getByLabel('Barcode RSTJPR001').waitFor()

  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' })
    await page.getByText('Akan dikembangkan pada tahap berikutnya').waitFor()
    assert(
      !(await page.getByText('Halaman tidak ditemukan').isVisible()),
      `Route gagal: ${route}`
    )
  }

  if (process.env.SMOKE_SKIP_MOCK_STATES !== '1') {
    await page.goto(`${baseUrl}/?site=ALL&mockState=error`, {
      waitUntil: 'networkidle',
    })
    await page.getByRole('heading', { name: 'Dashboard gagal dimuat' }).waitFor()
    await page.goto(`${baseUrl}/?site=ALL&mockState=empty`, {
      waitUntil: 'networkidle',
    })
    await page.getByRole('heading', { name: 'Belum ada data operasional' }).waitFor()
  }
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Dashboard Operasional' }).waitFor()
  await page.screenshot({ path: 'artifacts/dashboard-desktop.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('Karyawan aktif', { exact: true }).waitFor()
  await page.screenshot({ path: 'artifacts/dashboard-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Buka atau tutup navigasi' }).click()
  await page.getByText('Produksi Borongan', { exact: true }).waitFor()
  await page.waitForTimeout(350)
  await page.screenshot({ path: 'artifacts/navigation-mobile.png' })

  await page.goto(`${baseUrl}/401`, { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: 'Sesi diperlukan' }).waitFor()
  await page.goto(`${baseUrl}/route-yang-tidak-ada`, {
    waitUntil: 'networkidle',
  })
  await page.getByRole('heading', { name: 'Halaman tidak ditemukan' }).waitFor()

  console.log(
    `Smoke test lulus untuk ${routes.length} route placeholder, modul karyawan, dashboard, drawer mobile, 401, dan 404.`
  )
} catch (error) {
  console.error('Smoke gagal pada URL:', page.url())
  await page.screenshot({ path: 'artifacts/smoke-failure.png', fullPage: true })
  throw error
} finally {
  await browser.close()
}
