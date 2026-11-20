import type { Request, RequestHandler, Response } from 'express'
import { createHmac, randomBytes } from 'node:crypto'

type Entry = { count: number; resetAt: number; attempts: Set<string> }
// A process-local salt keeps applicant identifiers out of limiter keys.
const keySalt = randomBytes(32)

export function createPublicRateLimit(input: {
  windowMs: number
  limit: number
  namespace: string
  now?: () => number
  key?: (req: Request, res: Response) => string
  attemptKey?: (req: Request, res: Response) => string
}): RequestHandler {
  const entries = new Map<string, Entry>()
  const now = input.now ?? (() => Date.now())

  return (req, res, next) => {
    const current = now()
    const identity =
      input.key?.(req, res) ?? req.ip ?? req.socket.remoteAddress ?? 'unknown'
    const key = createHmac('sha256', keySalt)
      .update(`${input.namespace}:${identity}`)
      .digest('hex')
    const attempt = input.attemptKey?.(req, res)
    // Bound memory even when many different identities reach the public form.
    if (entries.size >= 10_000) {
      for (const [entryKey, value] of entries) {
        if (value.resetAt <= current) entries.delete(entryKey)
      }
      if (!entries.has(key) && entries.size >= 10_000) {
        res.setHeader('Retry-After', '60')
        return res
          .status(429)
          .json({
            message: 'Form sedang sibuk. Silakan coba kembali sebentar lagi.',
          })
      }
    }
    let entry = entries.get(key)
    if (!entry || entry.resetAt <= current) {
      entry = {
        count: 0,
        resetAt: current + input.windowMs,
        attempts: new Set(),
      }
      entries.set(key, entry)
    }
    const replay = attempt !== undefined && entry.attempts.has(attempt)
    const blocked = !replay && entry.count >= input.limit
    if (!replay && !blocked) {
      entry.count += 1
      if (attempt !== undefined) entry.attempts.add(attempt)
    }

    const remaining = Math.max(0, input.limit - entry.count)
    res.setHeader('RateLimit-Limit', String(input.limit))
    res.setHeader('RateLimit-Remaining', String(remaining))
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

    if (blocked) {
      const retryAfter = Math.max(
        1,
        Math.ceil((entry.resetAt - current) / 1000)
      )
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({
        message:
          'Terlalu banyak percobaan. Silakan tunggu sebelum mencoba lagi.',
      })
    }

    if (entries.size > 5_000) {
      for (const [entryKey, value] of entries) {
        if (value.resetAt <= current) entries.delete(entryKey)
      }
    }
    next()
  }
}
