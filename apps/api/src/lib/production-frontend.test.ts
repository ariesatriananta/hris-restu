import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterEach, describe, expect, it } from 'vitest'
import { registerProductionFrontend } from './production-frontend.js'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

async function createFrontendBuild() {
  const directory = await mkdtemp(join(tmpdir(), 'hris-frontend-'))
  temporaryDirectories.push(directory)
  await mkdir(join(directory, 'assets'))
  await writeFile(join(directory, 'index.html'), '<html>HRIS SPA</html>')
  await writeFile(join(directory, 'assets', 'app.js'), 'window.HRIS = true')
  return directory
}

async function withServer<T>(
  app: express.Express,
  run: (baseUrl: string) => Promise<T>
) {
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const { port } = server.address() as AddressInfo
  try {
    return await run(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  }
}

describe('production frontend adapter', () => {
  it('melayani asset dan deep-link SPA tanpa menelan endpoint API', async () => {
    const distPath = await createFrontendBuild()
    const app = express()
    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
    app.use('/api', (_req, res) =>
      res.status(404).json({ message: 'Endpoint API tidak ditemukan.' })
    )
    registerProductionFrontend(app, distPath)

    await withServer(app, async (baseUrl) => {
      const health = await fetch(`${baseUrl}/api/health`)
      expect(await health.json()).toEqual({ status: 'ok' })

      const deepLink = await fetch(
        `${baseUrl}/attendance/monitoring-harian`,
        { headers: { accept: 'text/html' } }
      )
      expect(deepLink.status).toBe(200)
      expect(await deepLink.text()).toContain('HRIS SPA')

      const asset = await fetch(`${baseUrl}/assets/app.js`)
      expect(asset.status).toBe(200)
      expect(await asset.text()).toContain('window.HRIS')

      const missingApi = await fetch(`${baseUrl}/api/tidak-ada`, {
        headers: { accept: 'text/html' },
      })
      expect(missingApi.status).toBe(404)
      expect(missingApi.headers.get('content-type')).toContain(
        'application/json'
      )
      expect(await missingApi.text()).not.toContain('HRIS SPA')
    })
  })

  it('gagal cepat jika build frontend belum tersedia', () => {
    expect(() =>
      registerProductionFrontend(express(), join(tmpdir(), 'tidak-ada'))
    ).toThrow('Build frontend tidak ditemukan')
  })
})
