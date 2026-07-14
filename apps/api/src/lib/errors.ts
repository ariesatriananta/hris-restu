import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import type { QueryError } from 'mysql2'
export class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ApiError) return res.status(error.status).json({ message: error.message })
  if (error instanceof ZodError) return res.status(422).json({ message: 'Data yang dikirim belum valid.', issues: error.flatten() })
  const databaseError = error as QueryError
  if (databaseError.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Data unik sudah digunakan.' })
  if (databaseError.code?.startsWith('ER_NO_REFERENCED_ROW')) return res.status(422).json({ message: 'Referensi data tidak valid.' })
  return res.status(500).json({ message: 'Terjadi gangguan pada layanan.' })
}
