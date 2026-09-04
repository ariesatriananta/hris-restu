import type { RequestHandler } from 'express'

type Entry = { count: number; resetAt: number }

export function createPublicRateLimit(input: {
  windowMs: number
  limit: number
  namespace: string
  now?: () => number
}): RequestHandler {
  const entries = new Map<string, Entry>()
  const now = input.now ?? Date.now

  return (req, res, next) => {
    const current = now()
    const key = `${input.namespace}:${req.ip || req.socket.remoteAddress || 'unknown'}`
    let entry = entries.get(key)
    if (!entry || entry.resetAt <= current) {
      entry = { count: 0, resetAt: current + input.windowMs }
      entries.set(key, entry)
    }
    entry.count += 1

    const remaining = Math.max(0, input.limit - entry.count)
    res.setHeader('RateLimit-Limit', String(input.limit))
    res.setHeader('RateLimit-Remaining', String(remaining))
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))

    if (entry.count > input.limit) {
      const retryAfter = Math.max(1, Math.ceil((entry.resetAt - current) / 1000))
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({
        message: 'Terlalu banyak percobaan. Silakan tunggu sebelum mencoba lagi.',
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
