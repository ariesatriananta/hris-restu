// Offline generation only. Does not load .env, connect to DB or fetch attachments.
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { stableUid, isoDate, encodedNumber, contractChain, primaryNiks, sqlValue } from './klaten-legacy-import-core.mjs'
import { googleDriveDocument } from '../apps/api/src/lib/google-drive-document.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(path.join(root, 'apps/api/package.json'))
const ExcelJS = require('exceljs')
const input = path.join(root, 'docs/excel-source/Database Klaten - 20261126.xlsx')
const outputDir = path.join(root, 'artifacts/klaten-refresh')
const buffer = await fs.readFile(input)
const hash = createHash('sha256').update(buffer).digest('hex')
if (hash !== '23072fdc7ad10b231390dd2ba71c54407d56aefc2042e67c177757dbaf4613da') throw new Error('Source hash changed; review first')
const cutoff = '2026-11-26'
const baseline = '2026-11-23'
const uidFor = tag => stableUid(`klaten:${hash}:${tag}`)
const workbook = new ExcelJS.Workbook()
await workbook.xlsx.load(buffer)
const sheet = workbook.getWorksheet('DATABASE KARYAWAN')
const expectedHeaders = { 1: 'SITE', 2: 'ID', 3: 'NAMA LENGKAP (SESUAI KTP)', 5: 'STATUS KARYAWAN', 10: 'JOIN DATE TRAINING', 11: 'JOIN DATE BORONG', 12: 'JOIN DATE', 14: 'STATUS (Aktif/Tidak Aktif)' }
for (const [col, label] of Object.entries(expectedHeaders)) {
  if (sheet.getRow(1).getCell(Number(col)).text.trim() !== label) throw new Error(`Unexpected header column ${col}`)
}
const rows = []
const documents = []
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
const positionSources = new Map()
for (let i = 2; i <= sheet.rowCount; i++) {
  const row = sheet.getRow(i)
  if (!text(row, 3)) throw new Error(`Unexpected blank name in source row ${i}`)
  if (text(row, 1).toUpperCase() !== 'KLATEN') throw new Error(`Unexpected site, source row ${i}`)
  const status = { AKTIF: 'ACTIVE', 'TIDAK AKTIF': 'INACTIVE', RESIGN: 'RESIGNED' }[text(row, 14).toUpperCase()]
  const type = { BORONG: 'BORONGAN', TRAINING: 'TRAINING', BULANAN: 'BULANAN', HARIAN: 'HARIAN' }[text(row, 5).toUpperCase()]
  if (!status || !type) throw new Error(`Unknown type/status, source row ${i}`)
  const active = status === 'ACTIVE'
  const oldNumber = text(row, 2).toUpperCase()
  if (!oldNumber || (!encodedNumber(oldNumber) && !/^\d{6,8}$/.test(oldNumber))) throw new Error(`Invalid source employee ID, row ${i}`)
  if (!oldNumber && active) throw new Error(`Active employee missing source ID, row ${i}`)
  const number = oldNumber
  let training = isoDate(row.getCell(10).value)
  let borong = isoDate(row.getCell(11).value)
  const join = type === 'BORONGAN' ? borong : type === 'TRAINING' ? training : isoDate(row.getCell(12).value)
  if (active && !join) throw new Error(`Missing selected join date, row ${i}`)
  if (join && join > cutoff) throw new Error(`Join date after pilot, row ${i}`)
  if (training && borong && training > borong) {
    if (active) throw new Error(`Reversed active phases row ${i}`)
    training = null
    adjustments.push({ row:i, field:'join_date_training', reason:'phase_conflict_in_snapshot_only' })
  }
  const mod = text(row, 6).toUpperCase().match(/^MODUL ([A-E])$/)?.[1]
  const section = { LINTING: 'LINTING', BATIL: 'BATIL', PACKING: 'PACKING', SLOP: 'SLOP', 'KEMAS 1': 'KEMAS1', 'KEMAS 2': 'KEMAS2' }[text(row, 7).toUpperCase()] ?? null
  if (active && ['BORONGAN','TRAINING'].includes(type) && (!mod || !section)) throw new Error(`Active mapping missing, row ${i}`)
  const raw = {}
  // Preserve source columns; AS is a helper ID, never an operational identifier.
  for (let col = 1; col <= 44; col++) {
    const cell = row.getCell(col)
    const date = [10, 11, 12, 15, 20].includes(col) ? isoDate(cell.value) : null
    const value = cell.value
    raw[`${col}:${sheet.getRow(1).getCell(col).text}`] = date ??
      (value && typeof value === 'object' && 'hyperlink' in value ? { text: cell.text, hyperlink: value.hyperlink } : cell.text)
  }
  let resignDate = status === 'RESIGNED' ? isoDate(row.getCell(15).value) : null
  if (resignDate && join && resignDate < join) {
    resignDate = null
    adjustments.push({ row: i, field: 'resign_date', reason: 'pre_join_end_date_preserved_in_legacy_notes' })
  }
  const rtrwMatch = text(row, 24).replaceAll(' ', '').match(/^(\d{1,3})\/(\d{1,3})$/)
  const rtrw = rtrwMatch ? `${rtrwMatch[1].padStart(3, '0')}/${rtrwMatch[2].padStart(3, '0')}` :
    /^\d{6}$/.test(text(row, 24)) ? `${text(row, 24).slice(0, 3)}/${text(row, 24).slice(3)}` : null
  const sourceGender = text(row,22).toUpperCase()
  // Owner confirmed the one missing field. Source hash and row pin the override.
  const gender = !sourceGender && i===3096 ? 'FEMALE' : { 'LAKI-LAKI': 'MALE', PEREMPUAN: 'FEMALE' }[sourceGender]
  if (!sourceGender && i===3096) adjustments.push({row:i,field:'gender',reason:'owner_confirmed_female_20261127'})
  if (!gender) throw new Error(`Unknown gender, row ${i}`)
  const edu = education[text(row, 29).toUpperCase()] ?? null
  if (text(row, 29) && !edu) adjustments.push({ row: i, field: 'education_level', reason: 'ambiguous_source_preserved_in_legacy_notes' })
  const notes = JSON.stringify({ legacyImport: { sourceHash: hash, sourceSheet: 'DATABASE KARYAWAN', sourceRow: i, baseline, cutoff, unknownJoinDate: !join, generatedArchiveNumber: false,
    ...(i===3096 && !sourceGender ? {approvedOverrides:{gender:{value:'FEMALE',confirmedOn:'2026-11-27'}}} : {}),raw } })
  if (Buffer.byteLength(notes, 'utf8') > 65000) throw new Error(`Notes too long, row ${i}`)
  const production = ['BORONGAN','TRAINING'].includes(type)
  const sourceJob = text(row,7)
  const positionCode = active ? (production ? 'OPERATOR' : `KLT_${sourceJob.toUpperCase().replace(/[^A-Z0-9]+/g,'_').slice(0,26)}`) : null
  if (active && !production) {
    if (positionSources.has(positionCode) && positionSources.get(positionCode).name !== sourceJob) throw new Error(`Position code collision row ${i}`)
    positionSources.set(positionCode, {code:positionCode,name:sourceJob,category:'STAFF'})
  }
  const departmentCode = active ? (production || text(row,9)==='Produksi SKT' ? 'PROD' : 'KLT_OFFICE') : null
  if (active && !production && !['Produksi SKT','Kantor & Umum','Kantor dan Umum'].includes(text(row,9))) throw new Error(`Unknown staff department row ${i}`)
  rows.push({ row: i, uid: uidFor(`employee:${i}`), number, type, status, rawNik: text(row, 17),
    values: {
      source_row: i, uid: uidFor(`employee:${i}`), employee_number: number, type_code: type, status_code: status,
      position_code:positionCode,department_code:departmentCode,
      module_code: active && production && mod ? `SLO-MOD-${mod}` : null, section_code: active && production ? section : null,
      full_name: limited(text(row, 3), 150, i, 'full_name', true), nickname: limited(text(row, 4), 100, i, 'nickname'),
      national_id_number: null, family_card_number: limited(text(row, 18), 30, i, 'family_card_number'), gender,
      birth_place: limited(text(row, 19), 100, i, 'birth_place'), birth_date: isoDate(row.getCell(20).value),
      address: text(row, 23) || null, rtrw, kelurahan: limited(text(row, 25), 100, i, 'kelurahan'),
      kecamatan: limited(text(row, 26), 100, i, 'kecamatan'), city: limited(text(row, 27), 100, i, 'city'),
      education_level: edu, religion: limited(text(row, 30), 30, i, 'religion'),
      marital_status: ({'BELUM KAWIN':'SINGLE',KAWIN:'MARRIED','CERAI HIDUP':'DIVORCED','CERAI MATI':'WIDOWED'})[text(row,31).toUpperCase()] ?? null,
      phone: limited(text(row, 32), 30, i, 'phone'), email: limited(text(row, 33).toLowerCase(), 191, i, 'email'),
      bpjs_health_number: limited(text(row, 36), 30, i, 'bpjs_health_number'),
      bpjs_employment_number: limited(text(row, 37), 30, i, 'bpjs_employment_number'),
      join_date: join, join_date_training: training, join_date_borong: borong, resign_date: resignDate,
      resign_reason: status === 'RESIGNED' ? limited(text(row, 16), 255, i, 'resign_reason') : null, notes,
    } })
  for (const [col, kind] of [[38,'KTP'],[39,'KK']]) {
    const cell = row.getCell(col)
    const value = cell.value
    const url = value && typeof value === 'object' && 'hyperlink' in value ? value.hyperlink : cell.text
    if (!url?.trim()) continue
    const drive = googleDriveDocument(url.trim())
    if (!drive) throw new Error(`Invalid Drive document row ${i} col ${col}`)
    documents.push({uid:uidFor(`document:${i}:${kind}`),employee_uid:uidFor(`employee:${i}`),document_type:kind,external_url:drive.url})
  }
}
if (rows.length !== 3095 || rows.filter(r => r.status === 'ACTIVE').length !== 543) {
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
  const contractType = r.type === 'TRAINING' ? 'TRAINING' : (text(sheet.getRow(r.row),8).toUpperCase()==='PKWTT' ? 'PKWTT' : 'PKWT')
  const periods = contractType==='PKWTT' ? [{seq:1,from:r.values.join_date,to:null,status:'ACTIVE'}] : contractChain(r.values.join_date,cutoff)
  for (const c of periods) {
    const key = c.from.slice(0, 7)
    const seq = (counters.get(key) ?? 0) + 1
    counters.set(key, seq)
    const type = contractType
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
let sql = await fs.readFile(path.join(root, 'scripts/klaten-refresh-employees.sql'), 'utf8')
sql = sql.replace('-- __PAYLOAD__', [inserts('_klt_source', rows.map(r => r.values)), inserts('_klt_contract_source', contracts), inserts('_klt_number_source', [...numbers.values()]), inserts('_klt_position_source',[...positionSources.values()]),inserts('_klt_doc_source',documents)].join('\n'))
for (const [key, value] of Object.entries({ SOURCE_HASH: hash, IMPORT_UID: uidFor('import-marker'), EMPLOYEE_COUNT: rows.length, ACTIVE_COUNT: 543, CONTRACT_COUNT: contracts.length,DOCUMENT_COUNT:documents.length,JOB_COUNT:518 })) {
  sql = sql.replaceAll(`__${key}__`, String(value))
}
await fs.mkdir(outputDir, { recursive: true })
await fs.writeFile(path.join(outputDir, '20261127_klaten_employee_import.sql'), sql, { mode: 0o600 })
const summary = {
  sourceSha256: hash, baseline, employees: rows.length, active: 543, archive: rows.length - 543,
  contracts: contracts.length, activeContracts: contracts.filter(c => c.status === 'ACTIVE').length,
  expiredContracts: contracts.filter(c => c.status === 'EXPIRED').length,
  unknownJoinDates: rows.filter(r => !r.values.join_date).length,
  archiveNumbersGenerated: 0, primaryNiks: niks.size, sequenceDateGroups: numbers.size,
  documents:documents.length, newStaffPositions:[...positionSources.values()], productionPrimaryJobs:518,
  adjustmentCounts: Object.fromEntries([...new Set(adjustments.map(a => a.reason))].map(k => [k, adjustments.filter(a => a.reason === k).length])),
  adjustments,
}
await fs.writeFile(path.join(outputDir, 'employee-summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 })
console.log(JSON.stringify({ generated: 'artifacts/klaten-refresh/20261127_klaten_employee_import.sql', employees: rows.length, active: 543, contracts: contracts.length, archive: rows.length - 543, privateDataNotLogged: true }))
