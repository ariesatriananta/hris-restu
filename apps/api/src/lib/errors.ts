import type { NextFunction, Request, Response } from 'express'
export class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) { const known = error instanceof ApiError; res.status(known ? error.status : 500).json({ message: known ? error.message : 'Terjadi gangguan pada layanan.' }) }
