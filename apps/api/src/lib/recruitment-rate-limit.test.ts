import express, { type Request, type Response } from 'express'
import type { AddressInfo } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { createPublicRateLimit } from './recruitment-rate-limit.js'

describe('recruitment public rate limit', () => {
  it('kuota identitas berlaku lintas IP, retry tidak memperpanjang masa batas, dan reset membersihkan kunci retry', () => {
    let now = 1_000
    const limiter = createPublicRateLimit({
      namespace: 'identity',
      windowMs: 60_000,
      limit: 1,
      now: () => now,
      key: () => 'synthetic-identity',
      attemptKey: (req) => req.get('attempt')!,
    })
    const call = (ip: string, attempt: string) => {
      const next = vi.fn()
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      }
      limiter(
        { ip, get: () => attempt } as unknown as Request,
        res as unknown as Response,
        next
      )
      return { next, res }
    }
    expect(call('192.0.2.1', 'first').next).toHaveBeenCalledOnce()
    expect(call('192.0.2.2', 'second').res.status).toHaveBeenCalledWith(429)
    now = 31_000
    const replay = call('192.0.2.2', 'first')
    expect(replay.next).toHaveBeenCalledOnce()
    expect(replay.res.setHeader).toHaveBeenCalledWith('RateLimit-Reset', '61')
    now = 61_000
    expect(call('192.0.2.2', 'second').next).toHaveBeenCalledOnce()
    // The previous window's retry key no longer bypasses the new window's quota.
    expect(call('192.0.2.1', 'first').res.status).toHaveBeenCalledWith(429)
  })

  it('membatasi jumlah identitas dalam memori tanpa mengusir kuota aktif dan membersihkan yang kedaluwarsa', () => {
    let now = 1_000
    const limiter = createPublicRateLimit({
      namespace: 'bounded',
      windowMs: 60_000,
      limit: 1,
      now: () => now,
      key: (req) => req.get('identity')!,
    })
    const call = (identity: string) => {
      const next = vi.fn()
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      }
      limiter(
        { get: () => identity } as unknown as Request,
        res as unknown as Response,
        next
      )
      return { next, res }
    }
    for (let index = 0; index < 10_000; index++) {
      expect(call(`synthetic-${index}`).next).toHaveBeenCalledOnce()
    }
    expect(call('synthetic-overflow').res.status).toHaveBeenCalledWith(429)
    expect(call('synthetic-0').res.status).toHaveBeenCalledWith(429)
    now = 61_000
    expect(call('synthetic-overflow').next).toHaveBeenCalledOnce()
  })

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
