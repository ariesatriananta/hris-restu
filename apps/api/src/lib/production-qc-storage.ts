import type { z } from 'zod'
import type { RowDataPacket, ResultSetHeader } from 'mysql2'
import type { Pool, PoolConnection } from 'mysql2/promise'
import { randomUUID } from 'node:crypto'
import { ApiError } from './errors.js'
import { productionQcInput } from './production-qc.js'
import { LINTING_JOB_CODE } from './production-quantity-deduction.js'

type Executor = Pool | PoolConnection
export async function lastProductionDeviceBrand(conn: Executor, deviceId: number, siteId: number) {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT brand.uid FROM production_transactions transaction_record
     JOIN production_transaction_qc qc ON qc.production_transaction_id=transaction_record.id
     JOIN production_brands brand ON brand.id=qc.brand_id
     WHERE transaction_record.scan_device_id=? AND transaction_record.site_id=?
       AND transaction_record.status='POSTED'
     ORDER BY transaction_record.transaction_at DESC,transaction_record.id DESC LIMIT 1`,
    [deviceId, siteId]
  )
  return rows[0] ? String(rows[0].uid) : null
}
type QcInput = z.output<typeof productionQcInput>
type QcMaster = { id: number; uid: string; code: string; name: string }
export type ProductionImportQc = {
  brandCode?: string | null
  weight1Grams?: string | number | null
  weight2Grams?: string | number | null
  defects: { defectCode: string; quantity: number }[]
}
export type ResolvedProductionQc = {
  brand: QcMaster | null
  weight1Grams: string | null
  weight2Grams: string | null
  defects: (QcMaster & { sortOrder: number; quantity: number })[]
}

export async function loadProductionQcOptions(conn: Executor, siteId: number) {
  const [brands] = await conn.query<RowDataPacket[]>(
    `SELECT uid,code,name,sort_order sortOrder FROM production_brands
      WHERE site_id=? AND is_active=1 ORDER BY sort_order,id`,
    [siteId]
  )
  const [defects] = await conn.query<RowDataPacket[]>(
    `SELECT uid,code,name,sort_order sortOrder FROM production_defects
      WHERE is_active=1 ORDER BY sort_order,id`
  )
  return { brands, defects }
}

// Optional API metadata: empty QC is not a claim that QC was performed.
export async function resolveProductionQc(
  conn: Executor,
  input: QcInput | undefined,
  siteId: number,
  jobCode: string,
  lock = false
): Promise<ResolvedProductionQc | null> {
  if (!input) return null
  const qc = productionQcInput.parse(input)
  if (
    !qc.brandUid &&
    !qc.weight1Grams &&
    !qc.weight2Grams &&
    !qc.defects.length
  )
    return null
  if (jobCode !== LINTING_JOB_CODE)
    throw new ApiError(422, 'Informasi QC hanya untuk pekerjaan Linting.')
  let brand: QcMaster | null = null
  if (qc.brandUid) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id,uid,code,name FROM production_brands WHERE uid=? AND site_id=? AND is_active=1 ${lock ? 'FOR UPDATE' : ''}`,
      [qc.brandUid, siteId]
    )
    if (!rows[0])
      throw new ApiError(
        422,
        'Brand tidak aktif atau tidak tersedia pada site setoran.'
      )
    brand = {
      id: Number(rows[0].id),
      uid: String(rows[0].uid),
      code: String(rows[0].code),
      name: String(rows[0].name),
    }
  }
  let defects: ResolvedProductionQc['defects'] = []
  if (qc.defects.length) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id,uid,code,name,sort_order sortOrder FROM production_defects
        WHERE is_active=1 AND uid IN (${qc.defects.map(() => '?').join(',')}) ORDER BY id ${lock ? 'FOR UPDATE' : ''}`,
      qc.defects.map((item) => item.defectUid)
    )
    if (rows.length !== qc.defects.length)
      throw new ApiError(
        422,
        'Jenis defect tidak ditemukan atau sudah tidak aktif.'
      )
    const quantities = new Map(
      qc.defects.map((item) => [item.defectUid, item.quantity])
    )
    defects = rows.map((row) => ({
      id: Number(row.id),
      uid: String(row.uid),
      code: String(row.code),
      name: String(row.name),
      sortOrder: Number(row.sortOrder),
      quantity: quantities.get(String(row.uid))!,
    }))
  }
  return {
    brand,
    weight1Grams: qc.weight1Grams ?? null,
    weight2Grams: qc.weight2Grams ?? null,
    defects,
  }
}

export async function saveProductionQc(
  conn: Executor,
  transactionId: number,
  qc: ResolvedProductionQc | null,
  actorId: number
) {
  if (!qc) return
  const [result] = await conn.execute<ResultSetHeader>(
    `INSERT INTO production_transaction_qc(uid,production_transaction_id,brand_id,brand_code_snapshot,brand_name_snapshot,
       weight_1_grams,weight_2_grams,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?)`,
    [
      randomUUID(),
      transactionId,
      qc.brand?.id ?? null,
      qc.brand?.code ?? null,
      qc.brand?.name ?? null,
      qc.weight1Grams,
      qc.weight2Grams,
      actorId,
      actorId,
    ]
  )
  if (qc.defects.length) {
    const values = qc.defects.flatMap((item) => [
      randomUUID(),
      result.insertId,
      item.id,
      item.code,
      item.name,
      item.sortOrder,
      item.quantity,
      actorId,
      actorId,
    ])
    await conn.execute(
      `INSERT INTO production_transaction_qc_defects(uid,production_transaction_qc_id,defect_id,
         defect_code_snapshot,defect_name_snapshot,sort_order_snapshot,quantity,created_by,updated_by)
       VALUES ${qc.defects.map(() => '(?,?,?,?,?,?,?,?,?)').join(',')}`,
      values
    )
  }
}

function replaySignature(qc: QcInput | undefined) {
  return JSON.stringify({
    brandUid: qc?.brandUid ?? null,
    weight1Grams: qc?.weight1Grams ?? null,
    weight2Grams: qc?.weight2Grams ?? null,
    defects: (qc?.defects ?? [])
      .filter((item) => item.quantity > 0)
      .map((item) => [item.defectUid, item.quantity])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  })
}

// Legacy clients may omit QC. Provided QC must match the original snapshots;
// never revalidate against today's master or update an idempotent replay.
export async function assertProductionQcReplay(
  conn: Executor,
  transactionId: number,
  input: QcInput | undefined
) {
  if (input === undefined) return
  const qc = productionQcInput.parse(input)
  const [headers] = await conn.query<RowDataPacket[]>(
    `SELECT qc.id,brand.uid brandUid,CAST(qc.weight_1_grams AS CHAR) weight1Grams,
            CAST(qc.weight_2_grams AS CHAR) weight2Grams
       FROM production_transaction_qc qc LEFT JOIN production_brands brand ON brand.id=qc.brand_id
      WHERE qc.production_transaction_id=?`,
    [transactionId]
  )
  let original: QcInput | undefined
  if (headers[0]) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT defect.uid defectUid,detail.quantity FROM production_transaction_qc_defects detail
        JOIN production_defects defect ON defect.id=detail.defect_id WHERE detail.production_transaction_qc_id=?`,
      [headers[0].id]
    )
    original = productionQcInput.parse({
      brandUid: headers[0].brandUid ?? null,
      weight1Grams: headers[0].weight1Grams ?? null,
      weight2Grams: headers[0].weight2Grams ?? null,
      defects: rows.map((row) => ({
        defectUid: String(row.defectUid),
        quantity: Number(row.quantity),
      })),
    })
  }
  if (replaySignature(original) !== replaySignature(qc))
    throw new ApiError(
      409,
      'Idempotency key sudah dipakai untuk informasi QC lain.'
    )
}

// Read snapshot labels, not mutable master names/status/order.
export async function readProductionQc(conn: Executor, transactionId: number) {
  const [headers] = await conn.query<RowDataPacket[]>(
    `SELECT qc.id,brand.uid brandUid,qc.brand_code_snapshot brandCode,qc.brand_name_snapshot brandName,
      CAST(qc.weight_1_grams AS CHAR) weight1Grams,CAST(qc.weight_2_grams AS CHAR) weight2Grams
     FROM production_transaction_qc qc LEFT JOIN production_brands brand ON brand.id=qc.brand_id
     WHERE qc.production_transaction_id=?`,
    [transactionId]
  )
  if (!headers[0]) return null
  const header = headers[0]
  const [items] = await conn.query<RowDataPacket[]>(
    `SELECT defect.uid,detail.defect_code_snapshot code,detail.defect_name_snapshot name,
      detail.sort_order_snapshot sortOrder,detail.quantity FROM production_transaction_qc_defects detail
     JOIN production_defects defect ON defect.id=detail.defect_id
     WHERE detail.production_transaction_qc_id=? ORDER BY detail.sort_order_snapshot,detail.id`,
    [header.id]
  )
  return {
    brand: header.brandUid
      ? {
          uid: String(header.brandUid),
          code: String(header.brandCode),
          name: String(header.brandName),
        }
      : null,
    weight1Grams: header.weight1Grams ?? null,
    weight2Grams: header.weight2Grams ?? null,
    defects: items.map((item) => ({
      uid: String(item.uid),
      code: String(item.code),
      name: String(item.name),
      sortOrder: Number(item.sortOrder),
      quantity: Number(item.quantity),
    })),
  }
}

export async function cloneProductionQc(
  conn: Executor,
  sourceId: number,
  targetId: number,
  targetJobCode: string,
  actorId: number
) {
  if (targetJobCode !== LINTING_JOB_CODE) return
  const [result] = await conn.execute<ResultSetHeader>(
    `INSERT INTO production_transaction_qc(uid,production_transaction_id,brand_id,brand_code_snapshot,brand_name_snapshot,
      weight_1_grams,weight_2_grams,created_by,updated_by)
     SELECT ?,?,brand_id,brand_code_snapshot,brand_name_snapshot,weight_1_grams,weight_2_grams,?,?
     FROM production_transaction_qc WHERE production_transaction_id=?`,
    [randomUUID(), targetId, actorId, actorId, sourceId]
  )
  if (!result.affectedRows) return
  await conn.execute(
    `INSERT INTO production_transaction_qc_defects(uid,production_transaction_qc_id,defect_id,defect_code_snapshot,
      defect_name_snapshot,sort_order_snapshot,quantity,created_by,updated_by)
     SELECT UUID(),?,detail.defect_id,detail.defect_code_snapshot,detail.defect_name_snapshot,
      detail.sort_order_snapshot,detail.quantity,?,? FROM production_transaction_qc_defects detail
     JOIN production_transaction_qc header ON header.id=detail.production_transaction_qc_id
     WHERE header.production_transaction_id=?`,
    [result.insertId, actorId, actorId, sourceId]
  )
}

export async function loadProductionImportQcMasters(
  conn: Executor,
  siteIds: number[],
  lock = false
) {
  const [brands] = await conn.query<RowDataPacket[]>(
    `SELECT id,uid,code,name,site_id siteId FROM production_brands WHERE is_active=1
      AND site_id IN (${siteIds.map(() => '?').join(',') || 'NULL'}) ORDER BY id ${lock ? 'FOR UPDATE' : ''}`,
    siteIds
  )
  const [defects] = await conn.query<RowDataPacket[]>(
    `SELECT id,uid,code,name,sort_order sortOrder FROM production_defects WHERE is_active=1 ORDER BY id ${lock ? 'FOR UPDATE' : ''}`
  )
  return { brands, defects }
}

const importMasterIndex = new WeakMap<
  object,
  { brands: Map<string, RowDataPacket>; defects: Map<string, RowDataPacket> }
>()

export function resolveProductionImportQc(
  input: ProductionImportQc | undefined,
  siteId: number,
  jobCode: string,
  masters: Awaited<ReturnType<typeof loadProductionImportQcMasters>>
): ResolvedProductionQc | null {
  const hasWeight = (value: unknown) =>
    value !== null && value !== undefined && value !== ''
  if (
    !input ||
    (!input.brandCode &&
      !hasWeight(input.weight1Grams) &&
      !hasWeight(input.weight2Grams) &&
      !input.defects.length)
  )
    return null
  if (jobCode !== LINTING_JOB_CODE)
    throw new ApiError(422, 'Informasi QC hanya untuk pekerjaan Linting.')
  let index = importMasterIndex.get(masters)
  if (!index) {
    index = {
      brands: new Map(
        masters.brands.map((row) => [
          `${Number(row.siteId)}:${String(row.code)}`,
          row,
        ])
      ),
      defects: new Map(masters.defects.map((row) => [String(row.code), row])),
    }
    importMasterIndex.set(masters, index)
  }
  const brand = input.brandCode
    ? index.brands.get(`${siteId}:${input.brandCode}`)
    : null
  if (input.brandCode && !brand)
    throw new ApiError(
      422,
      'Kode brand tidak aktif atau tidak tersedia pada site setoran.'
    )
  const defects = input.defects.map((item) => {
    const row = index.defects.get(item.defectCode)
    if (!row)
      throw new ApiError(
        422,
        'Kode defect tidak ditemukan atau sudah tidak aktif.'
      )
    return {
      id: Number(row.id),
      uid: String(row.uid),
      code: String(row.code),
      name: String(row.name),
      sortOrder: Number(row.sortOrder),
      quantity: item.quantity,
    }
  })
  const parsed = productionQcInput.safeParse({
    brandUid: brand?.uid ?? null,
    weight1Grams: input.weight1Grams ?? null,
    weight2Grams: input.weight2Grams ?? null,
    defects: defects.map((row) => ({
      defectUid: row.uid,
      quantity: row.quantity,
    })),
  })
  if (!parsed.success) throw new ApiError(422, parsed.error.issues[0].message)
  return {
    brand: brand
      ? {
          id: Number(brand.id),
          uid: String(brand.uid),
          code: String(brand.code),
          name: String(brand.name),
        }
      : null,
    weight1Grams: parsed.data.weight1Grams ?? null,
    weight2Grams: parsed.data.weight2Grams ?? null,
    defects: defects.map((row) => ({
      id: Number(row.id),
      uid: String(row.uid),
      code: String(row.code),
      name: String(row.name),
      sortOrder: Number(row.sortOrder),
      quantity: Number(row.quantity),
    })),
  }
}

export async function saveProductionImportQc(
  conn: Executor,
  entries: { transactionId: number; qc: ResolvedProductionQc | null }[],
  actorId: number
) {
  const populated = entries.filter(
    (entry): entry is { transactionId: number; qc: ResolvedProductionQc } =>
      Boolean(entry.qc)
  )
  for (let offset = 0; offset < populated.length; offset += 250) {
    const chunk = populated.slice(offset, offset + 250)
    await conn.execute(
      `INSERT INTO production_transaction_qc(uid,production_transaction_id,brand_id,brand_code_snapshot,
      brand_name_snapshot,weight_1_grams,weight_2_grams,created_by,updated_by) VALUES ${chunk.map(() => '(?,?,?,?,?,?,?,?,?)').join(',')}`,
      chunk.flatMap(({ transactionId, qc }) => [
        randomUUID(),
        transactionId,
        qc.brand?.id ?? null,
        qc.brand?.code ?? null,
        qc.brand?.name ?? null,
        qc.weight1Grams,
        qc.weight2Grams,
        actorId,
        actorId,
      ])
    )
    const [headers] = await conn.query<RowDataPacket[]>(
      `SELECT id,production_transaction_id transactionId FROM production_transaction_qc
      WHERE production_transaction_id IN (${chunk.map(() => '?').join(',')})`,
      chunk.map((item) => item.transactionId)
    )
    const ids = new Map(
      headers.map((header) => [Number(header.transactionId), Number(header.id)])
    )
    if (ids.size !== chunk.length)
      throw new ApiError(
        500,
        'Informasi QC hasil import tidak dapat diverifikasi.'
      )
    const details = chunk.flatMap(({ transactionId, qc }) =>
      qc.defects.map((defect) => ({
        headerId: ids.get(transactionId)!,
        defect,
      }))
    )
    for (let position = 0; position < details.length; position += 250) {
      const group = details.slice(position, position + 250)
      await conn.execute(
        `INSERT INTO production_transaction_qc_defects(uid,production_transaction_qc_id,defect_id,
        defect_code_snapshot,defect_name_snapshot,sort_order_snapshot,quantity,created_by,updated_by)
        VALUES ${group.map(() => '(?,?,?,?,?,?,?,?,?)').join(',')}`,
        group.flatMap(({ headerId, defect }) => [
          randomUUID(),
          headerId,
          defect.id,
          defect.code,
          defect.name,
          defect.sortOrder,
          defect.quantity,
          actorId,
          actorId,
        ])
      )
    }
  }
}

function importSignature(input: ProductionImportQc | undefined) {
  const defects = input?.defects ?? []
  if (
    new Set(defects.map((item) => item.defectCode)).size !== defects.length ||
    defects.some(
      (item) =>
        !Number.isInteger(item.quantity) ||
        item.quantity < 0 ||
        item.quantity > 4294967295
    )
  ) {
    throw new ApiError(409, 'Informasi defect import tidak valid.')
  }
  const weights = productionQcInput.safeParse({
    weight1Grams: input?.weight1Grams ?? null,
    weight2Grams: input?.weight2Grams ?? null,
  })
  if (!weights.success)
    throw new ApiError(
      409,
      'Kunci import sudah digunakan untuk informasi QC lain.'
    )
  return JSON.stringify({
    brandCode: input?.brandCode || null,
    weight1Grams: weights.data.weight1Grams ?? null,
    weight2Grams: weights.data.weight2Grams ?? null,
    defects: defects
      .filter((item) => item.quantity !== 0)
      .map((item) => [item.defectCode, item.quantity])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  })
}

export async function assertProductionImportQcReplay(
  conn: Executor,
  entries: { transactionId: number; qc: ProductionImportQc | undefined }[]
) {
  const supplied = entries.filter((item) => item.qc !== undefined)
  for (let offset = 0; offset < supplied.length; offset += 250) {
    const chunk = supplied.slice(offset, offset + 250)
    const [headers] = await conn.query<RowDataPacket[]>(
      `SELECT id,production_transaction_id transactionId,brand_code_snapshot brandCode,
      CAST(weight_1_grams AS CHAR) weight1Grams,CAST(weight_2_grams AS CHAR) weight2Grams FROM production_transaction_qc
      WHERE production_transaction_id IN (${chunk.map(() => '?').join(',')})`,
      chunk.map((item) => item.transactionId)
    )
    const [details] = await conn.query<RowDataPacket[]>(
      `SELECT header.production_transaction_id transactionId,
      detail.defect_code_snapshot defectCode,detail.quantity FROM production_transaction_qc_defects detail
      JOIN production_transaction_qc header ON header.id=detail.production_transaction_qc_id
      WHERE header.production_transaction_id IN (${chunk.map(() => '?').join(',')})`,
      chunk.map((item) => item.transactionId)
    )
    for (const entry of chunk) {
      const header = headers.find(
        (item) => Number(item.transactionId) === entry.transactionId
      )
      const original = header
        ? {
            brandCode: header.brandCode,
            weight1Grams: header.weight1Grams,
            weight2Grams: header.weight2Grams,
            defects: details
              .filter(
                (item) => Number(item.transactionId) === entry.transactionId
              )
              .map((item) => ({
                defectCode: String(item.defectCode),
                quantity: Number(item.quantity),
              })),
          }
        : undefined
      if (importSignature(original) !== importSignature(entry.qc))
        throw new ApiError(
          409,
          'Kunci import sudah digunakan untuk informasi QC lain.'
        )
    }
  }
}
