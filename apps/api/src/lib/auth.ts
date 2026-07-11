import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { Request, Response } from 'express'
import { env } from '../config.js'

export const ACCESS_COOKIE = 'hris_access'
export const REFRESH_COOKIE = 'hris_refresh'
const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET)
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const newRefreshToken = () => `${randomUUID()}.${randomBytes(32).toString('base64url')}`
export async function signAccessToken(userUid: string, sessionUid: string) { return new SignJWT({ sid: sessionUid }).setProtectedHeader({ alg: 'HS256' }).setSubject(userUid).setIssuedAt().setExpirationTime(`${env.JWT_ACCESS_TTL_MINUTES}m`).sign(secret) }
export async function verifyAccessToken(token: string) { return jwtVerify(token, secret, { algorithms: ['HS256'] }) }
const cookieBase = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' }
export function setAuthCookies(res: Response, access: string, refresh: string) { res.cookie(ACCESS_COOKIE, access, { ...cookieBase, maxAge: env.JWT_ACCESS_TTL_MINUTES * 60_000 }); res.cookie(REFRESH_COOKIE, refresh, { ...cookieBase, maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000 }) }
export function clearAuthCookies(res: Response) { res.clearCookie(ACCESS_COOKIE, cookieBase); res.clearCookie(REFRESH_COOKIE, cookieBase) }
export const clientInfo = (req: Request) => ({ ip: req.ip?.slice(0, 45), userAgent: req.get('user-agent')?.slice(0, 500), device: req.get('user-agent')?.slice(0, 150) })
