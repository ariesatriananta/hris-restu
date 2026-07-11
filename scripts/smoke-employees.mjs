import fs from 'node:fs/promises'
import { chromium } from 'playwright'

const baseUrl = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:4174'
const executablePath =
  process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined
const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.setDefaultTimeout(12_000)
await fs.mkdir('artifacts', { recursive: true })

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Masuk ke HRIS' }).click()
  await page.getByRole('heading', { name: 'Dashboard Operasional' }).waitFor()

  await page.goto(`${baseUrl}/karyawan/data-karyawan`, {
    waitUntil: 'networkidle',
  })
  await page.getByRole('heading', { name: 'Data Karyawan' }).waitFor()
  await page.getByText('Adi Pratama', { exact: true }).first().waitFor()
  await page.screenshot({ path: 'artifacts/karyawan-desktop.png', fullPage: true })

  await page.getByRole('button', { name: 'Tambah karyawan' }).click()
  await page.getByLabel('Nomor karyawan').fill('RST-QA-001')
  await page.getByLabel('Barcode').fill('RSTQA001')
  await page.getByLabel('Nama lengkap').fill('Karyawan QA Fiktif')
  await page.getByLabel('Tanggal bergabung').fill('2026-07-11')
  await page.getByRole('button', { name: 'Tambah karyawan' }).last().click()
  await page
    .getByRole('link', { name: 'Karyawan QA Fiktif', exact: true })
    .first()
    .waitFor()

  await page.goto(`${baseUrl}/karyawan/data-karyawan/emp-adi-001`, {
    waitUntil: 'networkidle',
  })
  await page.getByRole('heading', { name: 'Adi Pratama' }).waitFor()
  await page.getByRole('tab', { name: 'Data pribadi' }).click()
  await page.getByText('Data sensitif', { exact: true }).waitFor()
  await page.screenshot({
    path: 'artifacts/karyawan-detail-desktop.png',
    fullPage: true,
  })

  await page.goto(`${baseUrl}/karyawan/riwayat-mutasi`, {
    waitUntil: 'networkidle',
  })
  await page.getByRole('heading', { name: 'Riwayat Mutasi' }).waitFor()
  await page.goto(`${baseUrl}/karyawan/pkwt-dokumen`, {
    waitUntil: 'networkidle',
  })
  await page.getByRole('heading', { name: 'PKWT & Dokumen' }).waitFor()
  await page.screenshot({
    path: 'artifacts/pkwt-dokumen-desktop.png',
    fullPage: true,
  })

  await page.goto(`${baseUrl}/karyawan/cetak-id-card`, {
    waitUntil: 'networkidle',
  })
  await page.getByLabel('Barcode RSTJPR001').waitFor()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Unduh SVG' }).click()
  const download = await downloadPromise
  assert(
    download.suggestedFilename() === 'id-card-RST-JPR-001.svg',
    'Nama file ID card tidak sesuai.'
  )
  await page.screenshot({ path: 'artifacts/id-card-desktop.png', fullPage: true })

  await page.goto(`${baseUrl}/karyawan/data-karyawan?mockState=error`, {
    waitUntil: 'networkidle',
  })
  await page.getByText('Data gagal dimuat.').waitFor()
  await page.goto(`${baseUrl}/karyawan/data-karyawan?mockState=empty`, {
    waitUntil: 'networkidle',
  })
  await page.getByText('Tidak ada karyawan yang sesuai filter.').waitFor()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${baseUrl}/karyawan/data-karyawan`, {
    waitUntil: 'networkidle',
  })
  await page.getByText('Adi Pratama', { exact: true }).last().waitFor()
  await page.screenshot({ path: 'artifacts/karyawan-mobile.png', fullPage: true })

  console.log(
    'Smoke Eksekusi 2 lulus: CRUD karyawan, detail, mutasi, PKWT/dokumen, ID card SVG, state mock, dan mobile.'
  )
} catch (error) {
  console.error('Smoke Eksekusi 2 gagal pada URL:', page.url())
  await page.screenshot({
    path: 'artifacts/smoke-employees-failure.png',
    fullPage: true,
  })
  throw error
} finally {
  await browser.close()
}
