import { randomUUID } from 'node:crypto'
import argon2 from 'argon2'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import { z } from 'zod'
import { env } from '../config.js'
import { pool } from '../db.js'
import { authenticate, type AuthContext } from '../middleware/authenticate.js'
import { ApiError } from '../lib/errors.js'
import { REFRESH_COOKIE, clearAuthCookies, clientInfo, hashToken, newRefreshToken, setAuthCookies, signAccessToken } from '../lib/auth.js'

const loginSchema = z.object({ email: z.string().min(1), password: z.string().min(1) })
async function issue(req: Parameters<typeof clientInfo>[0], res: Parameters<typeof setAuthCookies>[0], user: { id: number; uid: string }) {
  const refresh = newRefreshToken(), sessionUid = randomUUID(), info = clientInfo(req)
  await pool.execute(`INSERT INTO user_sessions(uid,user_id,refresh_token_hash,device_name,ip_address,user_agent,expires_at) VALUES(?,?,?,?,?,?,DATE_ADD(NOW(3), INTERVAL ? DAY))`, [sessionUid,user.id,hashToken(refresh),info.device ?? null,info.ip ?? null,info.userAgent ?? null,env.REFRESH_TOKEN_TTL_DAYS])
  setAuthCookies(res, await signAccessToken(user.uid, sessionUid), refresh)
}
export const authRouter = Router()
authRouter.post('/sign-in', async (req, res, next) => { try { const input = loginSchema.parse(req.body); const [rows] = await pool.query<RowDataPacket[]>("SELECT id,uid,email,username,password_hash,status,(locked_until IS NOT NULL AND locked_until > NOW(3)) is_locked FROM users WHERE email=? OR username=? LIMIT 1",[input.email.toLowerCase(),input.email]); const user=rows[0]; if (!user || user.status !== 'ACTIVE' || user.is_locked || !(await argon2.verify(user.password_hash,input.password))) throw new ApiError(401,'Email atau kata sandi tidak sesuai.'); await issue(req,res,{id:user.id,uid:user.uid}); await pool.execute('UPDATE users SET failed_login_attempts=0,last_login_at=NOW(3) WHERE id=?',[user.id]); res.status(204).end() } catch(e){ next(e) } })
authRouter.post('/refresh', async (req,res,next)=>{ try { const token=req.cookies?.[REFRESH_COOKIE] as string|undefined; if(!token) throw new ApiError(401,'Refresh session tidak tersedia.'); const [rows]=await pool.query<RowDataPacket[]>('SELECT us.id session_id,u.id user_id,u.uid user_uid,u.status FROM user_sessions us JOIN users u ON u.id=us.user_id WHERE us.refresh_token_hash=? AND us.revoked_at IS NULL AND us.expires_at>NOW(3) LIMIT 1',[hashToken(token)]); const row=rows[0]; if(!row || row.status!=='ACTIVE') throw new ApiError(401,'Refresh session tidak valid.'); await pool.execute('UPDATE user_sessions SET revoked_at=NOW(3),revoke_reason=? WHERE id=?',['ROTATED',row.session_id]); await issue(req,res,{id:row.user_id,uid:row.user_uid}); res.status(204).end() } catch(e){ clearAuthCookies(res); next(e) } })
authRouter.post('/sign-out', async (req,res,next)=>{ try { const token=req.cookies?.[REFRESH_COOKIE] as string|undefined; if(token) await pool.execute('UPDATE user_sessions SET revoked_at=NOW(3),revoke_reason=? WHERE refresh_token_hash=? AND revoked_at IS NULL',['LOGOUT',hashToken(token)]); clearAuthCookies(res); res.status(204).end() } catch(e){ next(e) } })
authRouter.get('/me',authenticate,(_req,res)=>{ const auth=res.locals.auth as AuthContext; res.json({ user:{ uid:auth.uid,name:auth.name,email:auth.email,role:auth.roles[0]??'USER',roleLabel:auth.roles.includes('SUPER_ADMIN')?'Super Admin':auth.roles[0]??'User',siteAccess:auth.siteAccess },permissions:auth.permissions }) })
