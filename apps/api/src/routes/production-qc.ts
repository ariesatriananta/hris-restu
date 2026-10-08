import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { z } from 'zod'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { ApiError } from '../lib/errors.js'
import { booleanFilter, pageParams, productionSiteCode } from '../lib/production-foundation.js'
import { productionBrandInput, productionMasterUpdateInput, productionDefectInput } from '../lib/production-qc.js'
import { authenticate, requirePermission, type AuthContext } from '../middleware/authenticate.js'

function globalAccess(auth: AuthContext) {
  return auth.roles.some(role => role === 'SUPER_ADMIN' || role === 'DIRECTOR')
}
function enforceSite(auth: AuthContext, site: string) {
  if (!globalAccess(auth) && !auth.siteAccess.includes(site)) throw new ApiError(403, 'Akses site ditolak.')
}
async function siteId(connection: PoolConnection, site: string) {
  const [rows] = await connection.query<RowDataPacket[]>('SELECT id FROM sites WHERE code=? FOR UPDATE', [site])
  if (!rows[0]) throw new ApiError(422, 'Site tidak ditemukan.')
  return Number(rows[0].id)
}
const uidParam = (value: string | string[]) => z.string().uuid().parse(Array.isArray(value) ? value[0] : value)

export const productionQcRouter = Router()
productionQcRouter.use(authenticate)

productionQcRouter.get('/qc-options', requirePermission('production.view'), async (req, res, next) => {
  try {
    const site = productionSiteCode.parse(req.query.site)
    enforceSite(res.locals.auth as AuthContext, site)
    const [brands] = await pool.query<RowDataPacket[]>(
      'SELECT b.uid,b.code,b.name,b.sort_order sortOrder FROM production_brands b JOIN sites s ON s.id=b.site_id WHERE s.code=? AND b.is_active=1 ORDER BY b.sort_order,b.id', [site])
    const [defects] = await pool.query<RowDataPacket[]>(
      'SELECT uid,code,name,sort_order sortOrder FROM production_defects WHERE is_active=1 ORDER BY sort_order,id')
    res.json({ brands, defects })
  } catch (error) { next(error) }
})

// Fixed table names only; no request value is interpolated into SQL identifiers.
for (const kind of ['brands', 'defects'] as const) {
  const brand = kind === 'brands'
  const table = brand ? 'production_brands' : 'production_defects'
  productionQcRouter.get('/' + kind, requirePermission('production.view'), async (req, res, next) => {
    try {
      const auth = res.locals.auth as AuthContext
      const { page, pageSize } = pageParams(req.query.page, req.query.pageSize)
      const where = ['1=1']
      const params: unknown[] = []
      if (brand) {
        if (req.query.site) {
          const site = productionSiteCode.parse(req.query.site)
          enforceSite(auth, site)
          where.push('s.code=?'); params.push(site)
        } else if (!globalAccess(auth)) {
          where.push('s.code IN (' + (auth.siteAccess.map(() => '?').join(',') || "''") + ')')
          params.push(...auth.siteAccess)
        }
      }
      const query = z.string().max(150).parse(req.query.query ?? '').trim()
      if (query) { where.push('(m.name LIKE ? OR m.code LIKE ?)'); params.push('%'+query+'%', '%'+query+'%') }
      const active = booleanFilter(req.query.isActive)
      if (active !== undefined) { where.push('m.is_active=?'); params.push(active) }
      const from = table+' m'+(brand ? ' JOIN sites s ON s.id=m.site_id' : '')
      const clause = where.join(' AND ')
      const [count] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) total FROM '+from+' WHERE '+clause, params)
      const [items] = await pool.query<RowDataPacket[]>('SELECT m.uid,m.code,m.name,m.is_active=1 isActive,m.sort_order sortOrder'+(brand ? ',s.code site' : '')+' FROM '+from+' WHERE '+clause+' ORDER BY m.created_at DESC,m.id DESC LIMIT ? OFFSET ?', [...params,pageSize,(page-1)*pageSize])
      res.json({ items: items.map(item => ({ ...item,isActive:Boolean(Number(item.isActive)) })), total: Number(count[0]?.total ?? 0), page, pageSize })
    } catch (error) { next(error) }
  })

  productionQcRouter.post('/'+kind, requirePermission('production.manage_master'), async (req, res, next) => {
    let connection: PoolConnection | undefined
    try {
      const auth = res.locals.auth as AuthContext
      const input = brand ? productionBrandInput.parse(req.body) : productionDefectInput.parse(req.body)
      const site = brand ? productionSiteCode.parse(req.body.site) : undefined
      if (site) enforceSite(auth, site)
      connection = await pool.getConnection()
      await connection.beginTransaction()
      const sid = site ? await siteId(connection, site) : null
      const uid = randomUUID()
      const code = (brand ? 'BR-' : 'DF-')+uid.replaceAll('-', '').toUpperCase()
      const values = [uid,code,...(brand ? [sid] : []),input.name,input.isActive ? 1 : 0,input.sortOrder,auth.id,auth.id]
      await connection.execute('INSERT INTO '+table+'(uid,code,'+(brand ? 'site_id,' : '')+'name,is_active,sort_order,created_by,updated_by) VALUES('+values.map(() => '?').join(',')+')', values)
      await writeAudit({ auth, request: req, module: 'PRODUCTION', siteId: sid, action: 'CREATE', table, recordUid: uid,
        description: brand ? 'Menambah Brand Produksi.' : 'Menambah Defect Produksi.', afterData: { ...input,code } }, connection)
      await connection.commit()
      res.status(201).json({ uid,code })
    } catch (error) { if (connection) await connection.rollback(); next(error) }
    finally { connection?.release() }
  })

  productionQcRouter.patch('/'+kind+'/:uid', requirePermission('production.manage_master'), async (req, res, next) => {
    let connection: PoolConnection | undefined
    try {
      const changes = productionMasterUpdateInput.parse(req.body)
      const uid = uidParam(req.params.uid)
      const auth = res.locals.auth as AuthContext
      connection = await pool.getConnection()
      await connection.beginTransaction()
      const [rows] = await connection.query<RowDataPacket[]>('SELECT m.id,m.uid,m.code,m.name,m.is_active=1 isActive,m.sort_order sortOrder'+(brand ? ',m.site_id siteId,s.code site' : '')+' FROM '+table+' m'+(brand ? ' JOIN sites s ON s.id=m.site_id' : '')+' WHERE m.uid=? FOR UPDATE', [uid])
      const current = rows[0]
      if (!current) throw new ApiError(404, 'Master Produksi tidak ditemukan.')
      if (brand && !globalAccess(auth) && !auth.siteAccess.includes(String(current.site))) throw new ApiError(404, 'Master Produksi tidak ditemukan.')
      const input = {
        name:changes.name ?? String(current.name),
        isActive:changes.isActive ?? Boolean(Number(current.isActive)),
        sortOrder:changes.sortOrder ?? Number(current.sortOrder),
      }
      await connection.execute('UPDATE '+table+' SET name=?,is_active=?,sort_order=?,updated_by=? WHERE id=?',
        [input.name,input.isActive ? 1 : 0,input.sortOrder,auth.id,current.id])
      await writeAudit({ auth, request: req, module: 'PRODUCTION', siteId: brand ? Number(current.siteId) : null,
        action: 'UPDATE', table, recordId: Number(current.id), recordUid: uid,
        description: brand ? 'Memperbarui Brand Produksi.' : 'Memperbarui Defect Produksi.',
        beforeData: { code:current.code,name:current.name,isActive:Boolean(Number(current.isActive)),sortOrder:current.sortOrder },
        afterData: input }, connection)
      await connection.commit()
      res.status(204).end()
    } catch (error) { if (connection) await connection.rollback(); next(error) }
    finally { connection?.release() }
  })
}
