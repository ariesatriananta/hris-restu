// Offline generation only. Does not load .env, connect to DB or fetch attachments.
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { baseline, stableUid, isoDate, encodedNumber, contractChain, primaryNiks, sqlValue } from './klaten-legacy-import-core.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'apps/api/package.json'))
const ExcelJS = require('exceljs')
const input = path.join(root, 'docs/excel-source/DATABASE RSIA KLT 22.11.2026 - soft.xlsx')
const outputDir = path.join(root, 'artifacts/klaten-import')
const buffer = await fs.readFile(input)
const hash = createHash('sha256').update(buffer).digest('hex')
const uidFor = tag => stableUid(`klaten:${hash}:${tag}`)
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.load(buffer)
const sheet = workbook.worksheets[0]
const expectedHeaders = { 1: 'SITE', 2: 'ID', 3: 'NAMA LENGKAP (SESUAI KTP)', 5: 'STATUS KARYAWAN', 9: 'JOIN DATE TRAINING', 10: 'JOIN DATE BORONG', 12: 'STATUS (Aktif/Tidak Aktif)' }
for (const [col, label] of Object.entries(expectedHeaders)) {
  if (sheet.getRow(1).getCell(Number(col)).text.trim() !== label) throw new Error(`Unexpected header column ${col}`)
}
const rows = []
const adjustments = [] // Row/field/reason only, never log personal data.
const text = (row, col) => row.getCell(col).text.trim()
function limited(value, max, row, field, required = false) {
  if (!value) {
    if (required) throw new Error(`Missing required ${field}, source row ${row}`)
    return null
  }
  if ([...value].length > max) {
    if (required) throw new Error(`Overlength ${field}, source row ${row}`)
    adjustments.push({ row, field, reason: 'overlength_preserved_in_legacy_notes' })
    return null
  }
  return value
}
const education = { 'SMA/K': 'SENIOR_SECONDARY', SMA: 'SENIOR_SECONDARY', SMK: 'SENIOR_SECONDARY', SMP: 'JUNIOR_SECONDARY', SD: 'PRIMARY', 'TIDAK TAMAT SD': 'NOT_COMPLETED_PRIMARY', S1: 'DIPLOMA_IV_BACHELOR' }
let legacySequence = 0
for (let i = 2; i <= sheet.rowCount; i++) {
  const row = sheet.getRow(i)
  if (!text(row, 3)) throw new Error(`Unexpected blank name in source row ${i}`)
  if (text(row, 1).toUpperCase() !== 'KLATEN') throw new Error(`Unexpected site, source row ${i}`)
  const status = { AKTIF: 'ACTIVE', 'NON AKTIF': 'INACTIVE', RESIGN: 'RESIGNED' }[text(row, 12).toUpperCase()]
  const type = { BORONG: 'BORONGAN', TRAINING: 'TRAINING', '': 'LEGACY_UNKNOWN' }[text(row, 5).toUpperCase()]
  if (!status || !type) throw new Error(`Unknown type/status, source row ${i}`)
  const active = status === 'ACTIVE'
  const oldNumber = text(row, 2).toUpperCase()
  if (oldNumber && !encodedNumber(oldNumber)) throw new Error(`Invalid encoded ID date/sequence, source row ${i}`)
  if (!oldNumber && active) throw new Error(`Active employee missing source ID, row ${i}`)
  const number = oldNumber || `LEG-KLT-${String(++legacySequence).padStart(6, '0')}`
  const training = isoDate(row.getCell(9).value)
  const borong = isoDate(row.getCell(10).value)
  const join = type === 'BORONGAN' ? borong : type === 'TRAINING' ? training : null
  if (type !== 'LEGACY_UNKNOWN' && !join) throw new Error(`Missing selected join date, row ${i}`)
  if (join && join > baseline) throw new Error(`Join date after pilot, row ${i}`)
  if (training && borong && training > borong) throw new Error(`Reversed training/Borong phases, row ${i}`)
  const mod = text(row, 6).toUpperCase().match(/^MODUL ([A-E])$/)?.[1]
  const section = { LINTING: 'LINTING', BATIL: 'BATIL', PACKING: 'PACKING', SLOP: 'SLOP', 'KEMAS 1': 'KEMAS1', 'KEMAS 2': 'KEMAS2' }[text(row, 7).toUpperCase()] ?? null
  if (active && (!mod || !section)) throw new Error(`Active mapping missing, row ${i}`)
  const raw = {}
  // Preserve source values, including ambiguous archive fields, without using AQ.
  for (let col = 1; col <= 42; col++) {
    const cell = row.getCell(col)
    const date = [9, 10, 13, 18].includes(col) ? isoDate(cell.value) : null
    const value = cell.value
    raw[`${col}:${sheet.getRow(1).getCell(col).text}`] = date ??
      (value && typeof value === 'object' && 'hyperlink' in value ? { text: cell.text, hyperlink: value.hyperlink } : cell.text)
  }
  let resignDate = status === 'RESIGNED' ? isoDate(row.getCell(13).value) : null
  if (resignDate && join && resignDate < join) {
    resignDate = null
    adjustments.push({ row: i, field: 'resign_date', reason: 'pre_join_end_date_preserved_in_legacy_notes' })
  }
  const rtrwMatch = text(row, 22).replaceAll(' ', '').match(/^(\d{1,3})\/(\d{1,3})$/)
  const rtrw = rtrwMatch ? `${rtrwMatch[1].padStart(3, '0')}/${rtrwMatch[2].padStart(3, '0')}` :
    /^\d{6}$/.test(text(row, 22)) ? `${text(row, 22).slice(0, 3)}/${text(row, 22).slice(3)}` : null
  const gender = { 'LAKI-LAKI': 'MALE', PEREMPUAN: 'FEMALE' }[text(row, 20).toUpperCase()]
  if (!gender) throw new Error(`Unknown gender, row ${i}`)
  const edu = education[text(row, 27).toUpperCase()] ?? null
  if (text(row, 27) && !edu) adjustments.push({ row: i, field: 'education_level', reason: 'ambiguous_source_preserved_in_legacy_notes' })
  const notes = JSON.stringify({ legacyImport: { sourceHash: hash, sourceRow: i, baseline, unknownJoinDate: !join, generatedArchiveNumber: !oldNumber, raw } })
  if (Buffer.byteLength(notes, 'utf8') > 65000) throw new Error(`Notes too long, row ${i}`)
  rows.push({ row: i, uid: uidFor(`employee:${i}`), number, type, status, rawNik: text(row, 15),
    values: {
      source_row: i, uid: uidFor(`employee:${i}`), employee_number: number, type_code: type, status_code: status,
      module_code: mod ? `SLO-MOD-${mod}` : null, section_code: section,
      full_name: limited(text(row, 3), 150, i, 'full_name', true), nickname: limited(text(row, 4), 100, i, 'nickname'),
      national_id_number: null, family_card_number: limited(text(row, 16), 30, i, 'family_card_number'), gender,
      birth_place: limited(text(row, 17), 100, i, 'birth_place'), birth_date: isoDate(row.getCell(18).value),
      address: text(row, 21) || null, rtrw, kelurahan: limited(text(row, 23), 100, i, 'kelurahan'),
      kecamatan: limited(text(row, 24), 100, i, 'kecamatan'), city: limited(text(row, 25), 100, i, 'city'),
      education_level: edu, religion: limited(text(row, 28), 30, i, 'religion'), marital_status: null,
      phone: limited(text(row, 30), 30, i, 'phone'), email: limited(text(row, 31).toLowerCase(), 191, i, 'email'),
      bpjs_health_number: limited(text(row, 34), 30, i, 'bpjs_health_number'),
      bpjs_employment_number: limited(text(row, 35), 30, i, 'bpjs_employment_number'),
      join_date: join, join_date_training: training, join_date_borong: borong, resign_date: resignDate,
      resign_reason: status === 'RESIGNED' ? limited(text(row, 14), 255, i, 'resign_reason') : null, notes,
    } })
}
if (rows.length !== 3725 || rows.filter(r => r.status === 'ACTIVE').length !== 395 || legacySequence !== 685) {
  throw new Error('Unexpected dataset counts; do not silently generate against a different cutoff')
}
const niks = primaryNiks(rows)
const seenIds = new Set(), seenEmails = new Set()
for (const r of rows) {
  r.values.national_id_number = niks.get(r.row) ?? null
  if (r.status === 'ACTIVE' && !r.values.national_id_number) throw new Error(`Invalid active NIK, row ${r.row}`)
  if (seenIds.has(r.number)) throw new Error(`Duplicate employee ID, row ${r.row}`)
  seenIds.add(r.number)
  if (r.values.email) {
    if (seenEmails.has(r.values.email)) throw new Error(`Duplicate email, row ${r.row}`)
    seenEmails.add(r.values.email)
  }
}
const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const counters = new Map(), numbers = new Map(), contracts = []
for (const r of rows) {
  const encoded = encodedNumber(r.number)
  if (encoded) {
    const key = `${encoded.prefix}:${encoded.date}`
    const current = numbers.get(key)
    if (!current || current.last_sequence < encoded.sequence) numbers.set(key, { prefix: encoded.prefix, join_date: encoded.date, last_sequence: encoded.sequence })
  }
  if (r.status !== 'ACTIVE') continue
  for (const c of contractChain(r.values.join_date)) {
    const key = c.from.slice(0, 7)
    const seq = (counters.get(key) ?? 0) + 1
    counters.set(key, seq)
    const type = r.type === 'TRAINING' ? 'TRAINING' : 'PKWT'
    contracts.push({ uid: uidFor(`contract:${r.row}:${c.seq}`), employee_uid: r.uid,
      contract_number: `${type}/RSIASLO-HR/${String(seq).padStart(3, '0')}/${roman[Number(c.from.slice(5, 7)) - 1]}/${c.from.slice(0, 4)}`,
      type_code: type, sequence_number: c.seq, start_date: c.from, end_date: c.to, status: c.status })
  }
}
function inserts(table, items) {
  if (!items.length) return ''
  const cols = Object.keys(items[0])
  const result = []
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25)
    result.push(`INSERT INTO ${table}(${cols.join(',')}) VALUES\n${batch.map(r => `(${cols.map(c => sqlValue(r[c])).join(',')})`).join(',\n')};`)
  }
  return result.join('\n')
}
let sql = await fs.readFile(path.join(root, 'scripts/klaten-legacy-import.sql'), 'utf8')
sql = sql.replace('-- __PAYLOAD__', [inserts('_klt_source', rows.map(r => r.values)), inserts('_klt_contract_source', contracts), inserts('_klt_number_source', [...numbers.values()])].join('\n'))
for (const [key, value] of Object.entries({ SOURCE_HASH: hash, IMPORT_UID: uidFor('import-marker'), EMPLOYEE_COUNT: rows.length, ACTIVE_COUNT: 395, CONTRACT_COUNT: contracts.length })) {
  sql = sql.replaceAll(`__${key}__`, String(value))
}
await fs.mkdir(outputDir, { recursive: true })
await fs.writeFile(path.join(outputDir, '20261123_klaten_employee_import.sql'), sql, { mode: 0o600 })
const summary = {
  sourceSha256: hash, baseline, employees: rows.length, active: 395, archive: rows.length - 395,
  contracts: contracts.length, activeContracts: contracts.filter(c => c.status === 'ACTIVE').length,
  expiredContracts: contracts.filter(c => c.status === 'EXPIRED').length,
  unknownJoinDates: rows.filter(r => !r.values.join_date).length,
  archiveNumbersGenerated: legacySequence, primaryNiks: niks.size, sequenceDateGroups: numbers.size,
  adjustmentCounts: Object.fromEntries([...new Set(adjustments.map(a => a.reason))].map(k => [k, adjustments.filter(a => a.reason === k).length])),
  adjustments,
}
await fs.writeFile(path.join(outputDir, 'summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ generated: 'artifacts/klaten-import/20261123_klaten_employee_import.sql', employees: rows.length, active: 395, contracts: contracts.length, archive: rows.length - 395, privateDataNotLogged: true }))
