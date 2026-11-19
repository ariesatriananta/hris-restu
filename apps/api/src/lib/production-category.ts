import { z } from 'zod'
import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { randomUUID } from 'node:crypto'
import { ApiError } from './errors.js'

export const productionCategory = z.enum(['REGULER', 'PREMIUM'])
export type ProductionCategory = z.infer<typeof productionCategory>
export type ProductionCategoryKind = 'MODULE' | 'BRAND'
const sources = {
  MODULE: {
    master: 'production_modules',
    history: 'production_module_category_histories',
    foreign: 'module_id',
  },
  BRAND: {
    master: 'production_brands',
    history: 'production_brand_category_histories',
    foreign: 'brand_id',
  },
} as const
export function productionCategoryToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
export const categoryEffectiveDate = z
  .string()
  .date()
  .refine((value) => value >= '1000-01-01', 'Tanggal berlaku tidak valid.')

// Called inside the owning master transaction. Never infer a historical category
// from today's master, or seed historical classifications from module names.
export async function setProductionCategory(
  conn: PoolConnection,
  input: {
    kind: ProductionCategoryKind
    entityId: number
    category: ProductionCategory
    effectiveFrom?: string
    actorId: number
  }
) {
  const source = sources[input.kind]
  const category = productionCategory.parse(input.category)
  const today = productionCategoryToday()
  if (
    input.effectiveFrom &&
    categoryEffectiveDate.parse(input.effectiveFrom) > today
  )
    throw new ApiError(
      422,
      'Tanggal berlaku kategori tidak boleh di masa depan.'
    )
  const [masters] = await conn.query<RowDataPacket[]>(
    `SELECT id,production_category productionCategory FROM ${source.master} WHERE id=? FOR UPDATE`,
    [input.entityId]
  )
  if (!masters[0]) throw new ApiError(404, 'Master Produksi tidak ditemukan.')
  const [histories] = await conn.query<RowDataPacket[]>(
    `SELECT id,category,DATE_FORMAT(effective_from,'%Y-%m-%d') effectiveFrom,
      DATE_FORMAT(effective_to,'%Y-%m-%d') effectiveTo FROM ${source.history}
     WHERE ${source.foreign}=? ORDER BY effective_from DESC,id DESC FOR UPDATE`,
    [input.entityId]
  )
  const latest = histories[0]
  // Omitted date on an unchanged category preserves its original start.
  const effectiveFrom = categoryEffectiveDate.parse(
    input.effectiveFrom ??
      (latest?.category === category ? String(latest.effectiveFrom) : today)
  )
  if (!latest) {
    // A DB-default category is allowed only when its first history agrees.
    if (
      masters[0].productionCategory != null &&
      masters[0].productionCategory !== category
    )
      throw new ApiError(
        409,
        'Kategori master belum memiliki histori yang sesuai. Periksa pemetaan master.'
      )
  } else {
    if (
      latest.effectiveTo != null ||
      String(latest.effectiveFrom) > today ||
      histories.filter((row) => row.effectiveTo == null).length !== 1 ||
      masters[0].productionCategory !== latest.category
    )
      throw new ApiError(
        409,
        'Histori kategori tidak konsisten. Periksa pemetaan master.'
      )
    if (
      latest.category === category &&
      effectiveFrom === String(latest.effectiveFrom)
    )
      return { category, effectiveFrom, changed: false }

    if (
      latest.category === category ||
      effectiveFrom <= String(latest.effectiveFrom)
    ) {
      // Correct the latest mapping (including a same-day setup mistake).
      // Older category periods cannot be removed or overlapped by this editor.
      const previous = histories[1]
      if (previous && effectiveFrom <= String(previous.effectiveFrom))
        throw new ApiError(
          422,
          'Tanggal berlaku harus setelah awal periode kategori sebelumnya.'
        )
      if (
        previous &&
        previous.effectiveTo !==
          new Date(
            Date.parse(String(latest.effectiveFrom) + 'T00:00:00Z') - 86400000
          )
            .toISOString()
            .slice(0, 10)
      )
        throw new ApiError(
          409,
          'Batas histori kategori tidak konsisten. Periksa pemetaan master.'
        )
      if (previous)
        await conn.execute(
          `UPDATE ${source.history} SET effective_to=DATE_SUB(?,INTERVAL 1 DAY),updated_by=? WHERE id=?`,
          [effectiveFrom, input.actorId, previous.id]
        )
      await conn.execute(
        `UPDATE ${source.history} SET category=?,effective_from=?,updated_by=? WHERE id=?`,
        [category, effectiveFrom, input.actorId, latest.id]
      )
      await conn.execute(
        `UPDATE ${source.master} SET production_category=?,updated_by=? WHERE id=?`,
        [category, input.actorId, input.entityId]
      )
      return { category, effectiveFrom, changed: true }
    }
    // A category change starting later creates a new period, even when backdated.
    await conn.execute(
      `UPDATE ${source.history} SET effective_to=DATE_SUB(?,INTERVAL 1 DAY),updated_by=? WHERE id=?`,
      [effectiveFrom, input.actorId, latest.id]
    )
  }
  await conn.execute(
    `INSERT INTO ${source.history}(uid,${source.foreign},category,effective_from,created_by,updated_by) VALUES(?,?,?,?,?,?)`,
    [
      randomUUID(),
      input.entityId,
      category,
      effectiveFrom,
      input.actorId,
      input.actorId,
    ]
  )
  await conn.execute(
    `UPDATE ${source.master} SET production_category=?,updated_by=? WHERE id=?`,
    [category, input.actorId, input.entityId]
  )
  return { category, effectiveFrom, changed: true }
}

export async function readProductionCategory(
  conn: Pick<PoolConnection, 'query'>,
  kind: ProductionCategoryKind,
  entityId: number,
  date: string
): Promise<ProductionCategory | null> {
  const source = sources[kind]
  const day = categoryEffectiveDate.parse(date)
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT category FROM ${source.history}
    WHERE ${source.foreign}=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from DESC`,
    [entityId, day, day]
  )
  if (rows.length > 1)
    throw new ApiError(
      409,
      'Histori kategori bertumpang-tindih pada tanggal terpilih.'
    )
  return rows[0] ? productionCategory.parse(rows[0].category) : null
}
