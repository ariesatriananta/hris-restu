import type { z } from 'zod'
import type { PoolConnection, RowDataPacket } from 'mysql2/promise'
import { ApiError } from './errors.js'
import {
  readProductionQc,
  loadProductionQcOptions,
  resolveProductionQc,
  type ResolvedProductionQc,
} from './production-qc-storage.js'
import { productionQcInput } from './production-qc.js'

type Input = z.output<typeof productionQcInput>
export function correctionQcSignature(input: Input) {
  const qc = productionQcInput.parse(input)
  return JSON.stringify({
    brandUid: qc.brandUid ?? null,
    weight1Grams: qc.weight1Grams ?? null,
    weight2Grams: qc.weight2Grams ?? null,
    defects: qc.defects
      .filter((item) => item.quantity !== 0)
      .map((item) => ({ defectUid: item.defectUid, quantity: item.quantity }))
      .sort((a, b) => a.defectUid.localeCompare(b.defectUid)),
  })
}
export function publicCorrectionQc(qc: ResolvedProductionQc | null) {
  if (!qc) return null
  const master = ({
    uid,
    code,
    name,
  }: {
    uid: string
    code: string
    name: string
  }) => ({ uid, code, name })
  return {
    brand: qc.brand ? master(qc.brand) : null,
    weight1Grams: qc.weight1Grams,
    weight2Grams: qc.weight2Grams,
    defects: qc.defects.map((item) => ({
      ...master(item),
      sortOrder: item.sortOrder,
      quantity: item.quantity,
    })),
  }
}
export async function correctionQcOptions(
  conn: PoolConnection,
  sourceId: number,
  siteId: number
) {
  const options = await loadProductionQcOptions(conn, siteId)
  const saved = await readProductionQc(conn, sourceId)
  // Snapshot labels take precedence for retained masters, including inactive ones.
  return {
    brands: [
      ...(saved?.brand ? [{ ...saved.brand, sortOrder: 0 }] : []),
      ...options.brands.filter((item) => item.uid !== saved?.brand?.uid),
    ],
    defects: [
      ...(saved?.defects ?? []),
      ...options.defects.filter(
        (item) => !saved?.defects.some((old) => old.uid === item.uid)
      ),
    ],
  }
}
export async function resolveCorrectionQc(
  conn: PoolConnection,
  sourceId: number,
  siteId: number,
  jobCode: string,
  input: Input,
  lock = false
) {
  const qc = productionQcInput.parse(input)
  const before = await readProductionQc(conn, sourceId)
  if (
    jobCode !== 'BORONGAN-LINTING' &&
    (qc.weight1Grams || qc.weight2Grams || qc.defects.length)
  )
    throw new ApiError(422, 'Berat dan defect hanya untuk pekerjaan Linting.')
  const sameBrand = Boolean(qc.brandUid && qc.brandUid === before?.brand?.uid)
  const oldDefects = new Map(
    (before?.defects ?? []).map((item) => [item.uid, item])
  )
  // New selections must be active; existing source masters may be retained after deactivation.
  const fresh = await resolveProductionQc(
    conn,
    {
      ...qc,
      brandUid: sameBrand ? null : qc.brandUid,
      defects: qc.defects.filter((item) => !oldDefects.has(item.defectUid)),
    },
    siteId,
    jobCode,
    lock
  )
  let brand = fresh?.brand ?? null
  if (sameBrand) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT brand.id FROM production_transaction_qc qc JOIN production_brands brand ON brand.id=qc.brand_id
       WHERE qc.production_transaction_id=? AND brand.uid=? AND brand.site_id=? ${lock ? 'FOR UPDATE' : ''}`,
      [sourceId, qc.brandUid, siteId]
    )
    if (!rows[0])
      throw new ApiError(422, 'Brand asal tidak tersedia pada site transaksi.')
    brand = { ...before!.brand!, id: Number(rows[0].id) }
  }
  const retained = qc.defects.filter((item) => oldDefects.has(item.defectUid))
  let existing: RowDataPacket[] = []
  if (retained.length) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT defect.id,defect.uid FROM production_transaction_qc_defects detail
       JOIN production_transaction_qc qc ON qc.id=detail.production_transaction_qc_id
       JOIN production_defects defect ON defect.id=detail.defect_id
       WHERE qc.production_transaction_id=? ${lock ? 'FOR UPDATE' : ''}`,
      [sourceId]
    )
    existing = rows
  }
  const defects = qc.defects.map((item) => {
    const old = oldDefects.get(item.defectUid)
    const id = existing.find((row) => row.uid === item.defectUid)?.id
    if (old) {
      if (!id)
        throw new ApiError(
          409,
          'Snapshot defect asal berubah. Muat ulang transaksi.'
        )
      return { ...old, id: Number(id), quantity: item.quantity }
    }
    return fresh!.defects.find((row) => row.uid === item.defectUid)!
  })
  const resolved: ResolvedProductionQc | null =
    !brand && !qc.weight1Grams && !qc.weight2Grams && !defects.length
      ? null
      : {
          brand,
          weight1Grams: qc.weight1Grams ?? null,
          weight2Grams: qc.weight2Grams ?? null,
          defects,
        }
  const original = productionQcInput.parse({
    brandUid: before?.brand?.uid ?? null,
    weight1Grams: before?.weight1Grams ?? null,
    weight2Grams: before?.weight2Grams ?? null,
    defects:
      before?.defects.map((item) => ({
        defectUid: item.uid,
        quantity: item.quantity,
      })) ?? [],
  })
  return {
    resolved,
    before,
    changed: correctionQcSignature(original) !== correctionQcSignature(qc),
  }
}
