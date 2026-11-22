// Offline only. No environment, database, Drive downloads or R2 writes.
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { stableUid, sqlValue } from './klaten-legacy-import-core.mjs'
import { googleDriveDocument } from '../apps/api/src/lib/google-drive-document.ts'
const require = createRequire(new URL('../apps/api/package.json', import.meta.url))
const ExcelJS = require('exceljs')
const root = new URL('../', import.meta.url)
const bytes = await fs.readFile(new URL('docs/excel-source/DATABASE RSIA KLT 22.11.2026 - soft.xlsx', root))
const hash = createHash('sha256').update(bytes).digest('hex')
if (hash !== 'f5b8dd224012b1f3f439e8bbed65f15146784ef2e0ec0b7e14a8af28fdf55afc') throw new Error('Source Excel hash changed; review mapping first')
const book = new ExcelJS.Workbook()
await book.xlsx.load(bytes)
const sheet = book.worksheets[0]
if (sheet.rowCount !== 3726 || sheet.getRow(1).getCell(36).text !== 'UPLOAD FOTO KTP' || sheet.getRow(1).getCell(37).text !== 'UPLOAD FOTO KK') throw new Error('Unexpected source structure')
const payload = []
const summary = { KTP: 0, KK: 0, activeKTP: 0, activeKK: 0 }
for (let row = 2; row <= sheet.rowCount; row++) {
  const employeeUid = stableUid(`klaten:${hash}:employee:${row}`)
  for (const [col, type] of [[36, 'KTP'], [37, 'KK']]) {
    const cell = sheet.getRow(row).getCell(col)
    const value = cell.value
    const raw = value && typeof value === 'object' && 'hyperlink' in value ? value.hyperlink : cell.text
    if (!raw?.trim()) continue
    const link = googleDriveDocument(raw.trim())
    if (!link) throw new Error(`Unsupported Drive file URL at source row ${row}, column ${col}; no URL logged`)
    const uid = stableUid(`klaten:${hash}:document:${row}:${type}`)
    payload.push(`INSERT INTO _klt_doc_source(uid,employee_uid,document_type,external_url) VALUES(${[uid,employeeUid,type,link.url].map(sqlValue).join(',')});`)
    summary[type]++
    if (sheet.getRow(row).getCell(12).text.trim().toUpperCase() === 'AKTIF') summary[`active${type}`]++
  }
}
let sql = await fs.readFile(new URL('scripts/klaten-document-links.sql', root), 'utf8')
for (const [key, value] of Object.entries({ SOURCE_HASH: hash, IMPORT_UID: stableUid(`klaten:${hash}:import-marker`), DOCUMENT_COUNT: payload.length })) sql = sql.replaceAll(`__${key}__`, String(value))
if (stableUid(`klaten:${hash}:import-marker`) !== '939e1c2b-dda6-56c2-8558-dcf5409bad6e') throw new Error('Import marker identity changed')
sql = sql.replace('-- __PAYLOAD__', payload.join('\n'))
const out = new URL('artifacts/klaten-import/', root)
await fs.mkdir(out, { recursive: true })
await fs.writeFile(new URL('20261123_klaten_document_links.sql', out), sql)
await fs.writeFile(new URL('document-links-summary.json', out), JSON.stringify({ sourceHash: hash, ...summary, total: payload.length }, null, 2))
console.log(JSON.stringify({ ...summary, total: payload.length, generated: 'artifacts/klaten-import/20261123_klaten_document_links.sql' }))
