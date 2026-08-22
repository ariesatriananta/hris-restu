import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const backendEntry = new URL('./dist-server/server.js', import.meta.url)

if (!existsSync(fileURLToPath(backendEntry))) {
  console.error(
    'Gagal menjalankan HRIS API: backend belum dikompilasi. Pastikan fase postinstall menjalankan npm run build.'
  )
  process.exit(1)
}

// LiteSpeed memuat entry ESM ini melalui require(). Dynamic import tanpa
// top-level await mengikuti pola deployment Logisya yang sudah berjalan.
import(backendEntry.href).catch((error) => {
  console.error('Gagal menjalankan HRIS API.', error)
  process.exit(1)
})
