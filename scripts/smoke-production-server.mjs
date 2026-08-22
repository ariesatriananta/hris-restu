import assert from 'node:assert/strict'
import { once } from 'node:events'

process.env.NODE_ENV = 'production'
process.env.TRUST_PROXY = '1'
process.env.FRONTEND_ORIGIN = 'http://127.0.0.1'

const { app } = await import('../dist/api/app.js')
const server = app.listen(0, '127.0.0.1')

try {
  await once(server, 'listening')
  const address = server.address()
  assert(address && typeof address !== 'string')
  const baseUrl = `http://127.0.0.1:${address.port}`

  const health = await fetch(`${baseUrl}/api/health`)
  assert.equal(health.status, 200)
  assert.deepEqual(await health.json(), { status: 'ok' })

  const deepLink = await fetch(`${baseUrl}/attendance/monitoring-harian`, {
    headers: { accept: 'text/html' },
  })
  assert.equal(deepLink.status, 200)
  assert.match(await deepLink.text(), /id=["']root["']/)

  const missingApi = await fetch(`${baseUrl}/api/tidak-ada`, {
    headers: { accept: 'text/html' },
  })
  assert.equal(missingApi.status, 404)
  assert.match(missingApi.headers.get('content-type') ?? '', /application\/json/)
  assert.deepEqual(await missingApi.json(), {
    message: 'Endpoint API tidak ditemukan.',
  })

  assert.equal(app.get('trust proxy'), 1)
  console.log('Production smoke passed: health, SPA deep-link, API 404, trust proxy.')
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
}
