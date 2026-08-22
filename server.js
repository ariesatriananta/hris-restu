// LiteSpeed Hostinger memuat entry melalui require(). Hindari top-level await
// supaya graph ESM ini tetap dapat di-require, lalu bootstrap API secara async.
void import('tsx/esm/api')
  .then(({ register }) => {
    register()
    return import('./apps/api/src/server.ts')
  })
  .catch((error) => {
    // Pastikan kegagalan bootstrap muncul jelas pada Runtime Log Hostinger.
    console.error('Gagal menjalankan HRIS API.', error)
    process.exitCode = 1
  })
