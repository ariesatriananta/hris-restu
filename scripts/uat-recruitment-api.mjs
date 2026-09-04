import { app } from '../apps/api/src/app.ts'
import { pool } from '../apps/api/src/db.ts'

let tokenMap = {}
try {
  tokenMap = JSON.parse(process.env.RECRUITMENT_SITE_TOKENS_JSON || '{}')
} catch {
  throw new Error('RECRUITMENT_SITE_TOKENS_JSON tidak valid.')
}

const server = app.listen(0, '127.0.0.1')
await new Promise((resolve) => server.once('listening', resolve))
const failures = []

try {
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Port UAT API tidak tersedia.')
  }
  for (const [token, expectedSite] of Object.entries(tokenMap)) {
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/public/recruitment/${token}/config`
    )
    const body = await response.json()
    const serialized = JSON.stringify(body).toLowerCase()
    const passed =
      response.status === 200 &&
      body.site?.code === expectedSite &&
      Boolean(body.company?.name) &&
      !serialized.includes('storage_path') &&
      !serialized.includes('bucket')
    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] Konfigurasi Form Data Pelamar ${expectedSite} - HTTP ${response.status}; site ${body.site?.code ?? '-'}.`
    )
    if (!passed) failures.push(expectedSite)
  }
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  await pool.end()
}

if (failures.length) {
  throw new Error(`Konfigurasi API gagal untuk site: ${failures.join(', ')}.`)
}
