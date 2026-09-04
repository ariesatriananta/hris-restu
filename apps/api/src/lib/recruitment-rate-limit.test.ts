import express from 'express'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createPublicRateLimit } from './recruitment-rate-limit.js'

describe('recruitment public rate limit', () => {
  it('menolak request setelah batas tercapai dan memberi Retry-After', async () => {
    const app = express()
    app.use(
      createPublicRateLimit({
        namespace: 'test',
        windowMs: 60_000,
        limit: 1,
        now: () => 1_000,
      })
    )
    app.get('/', (_req, res) => res.json({ ok: true }))
    const server = app.listen(0)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    try {
      const port = (server.address() as AddressInfo).port
      const first = await fetch(`http://127.0.0.1:${port}`)
      const second = await fetch(`http://127.0.0.1:${port}`)
      expect(first.status).toBe(200)
      expect(second.status).toBe(429)
      expect(second.headers.get('retry-after')).toBe('60')
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      )
    }
  })
})
