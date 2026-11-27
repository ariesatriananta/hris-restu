// Offline only: no environment loading, database connections or attachment fetching.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import ExcelJS from 'exceljs'
import { stableUid, isoDate, sqlValue } from './klaten-legacy-import-core.mjs'
import { googleDriveDocument } from '../apps/api/src/lib/google-drive-document.ts'

// Workbook was opened/resaved without business-cell edits; Owner confirmed the new hash.
export const sourceHash = '23072fdc7ad10b231390dd2ba71c54407d56aefc2042e67c177757dbaf4613da'
export const heldRows = [4,10,11,86,179,298,317,348,402,498,499,643]
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const education = { 'SMA/K':'SENIOR_SECONDARY', SMA:'SENIOR_SECONDARY', SMK:'SENIOR_SECONDARY', SMP:'JUNIOR_SECONDARY', SD:'PRIMARY', 'TIDAK TAMAT SD':'NOT_COMPLETED_PRIMARY', S1:'DIPLOMA_IV_BACHELOR', D3:'DIPLOMA_III' }
const uidFor = tag => stableUid(`klaten-refresh:${sourceHash}:recruitment:${tag}`)
const text = (row,col) => row.getCell(col).text.trim()
export function normalizeRecruitment(sheet, held = heldRows) {
  const headers = { 1:'SITE', 2:'ID', 3:'NAMA LENGKAP (SESUAI KTP)', 15:'NIK', 16:'NOMOR KK', 36:'UPLOAD FOTO KTP', 37:'UPLOAD FOTO KK' }
  for (const [column,label] of Object.entries(headers)) if (text(sheet.getRow(1),+column)!==label) throw new Error(`Unexpected REKRUTMEN header ${column}`)
  const source = [], adjustments = []
  for (let i=2;i<=sheet.rowCount;i++) {
    const row=sheet.getRow(i)
    if (!text(row,3)) {
      if (Array.from({length:37},(_,j)=>text(row,j+1)).some(Boolean)) throw new Error(`Unnamed business row ${i}`)
      continue
    }
    if (text(row,1).toUpperCase()!=='KLATEN') throw new Error(`Unexpected site row ${i}`)
    if (text(row,2) || text(row,5) || text(row,12)) throw new Error(`Unexpected employee identity/type/status on candidate row ${i}`)
    source.push({row:i,excel:row})
  }
  const included=source.filter(r=>!held.includes(r.row)), counts=new Map()
  for (const {excel} of included) { const nik=text(excel,15); if (/^\d{16}$/.test(nik)) counts.set(nik,(counts.get(nik)||0)+1) }
  const limited=(value,max,row,field)=> {
    if (!value) return null
    if ([...value].length<=max) return value
    adjustments.push({row,field,reason:'overlength_preserved_in_source_snapshot'}); return null
  }
  const rows=included.map(({row:i,excel:row})=> {
    const raw={}
    for(let col=1;col<=43;col++) {
      const cell=row.getCell(col), v=cell.value
      raw[`${col}:${text(sheet.getRow(1),col)}`]=[9,10,13,18].includes(col) && isoDate(v) ? isoDate(v) : v && typeof v==='object' && 'hyperlink' in v ? {text:cell.text,hyperlink:v.hyperlink} : cell.text
    }
    const nik=text(row,15), kk=text(row,16), phone=text(row,30)
    const nationalId=/^\d{16}$/.test(nik) && counts.get(nik)===1 ? nik : null
    if (!nationalId) adjustments.push({row:i,field:'national_id_number',reason:counts.get(nik)>1?'duplicate_preserved_only_in_snapshot':'invalid_preserved_only_in_snapshot'})
    const familyCard=/^\d{16}$/.test(kk)?kk:null
    if(!familyCard) adjustments.push({row:i,field:'family_card_number',reason:'invalid_preserved_only_in_snapshot'})
    const gender={'LAKI-LAKI':'MALE',PEREMPUAN:'FEMALE'}[text(row,20).toUpperCase()]
    if (!gender || !text(row,3) || [...text(row,3)].length>150) throw new Error(`Invalid required candidate fields row ${i}`)
    const values={full_name:text(row,3),national_id_number:nationalId,family_card_number:familyCard,gender,
      birth_place:limited(text(row,17),100,i,'birth_place'),birth_date:isoDate(row.getCell(18).value),
      education_level:education[text(row,27).toUpperCase()]??null,address:text(row,21)||null,
      phone:phone.length>=8?limited(phone,30,i,'phone'):null,email:limited(text(row,31).toLowerCase(),191,i,'email')}
    const sourceEmployee={...values,employee_number:null,nickname:limited(text(row,4),100,i,'nickname'),
      rtrw:limited(text(row,22),10,i,'rtrw'),kelurahan:limited(text(row,23),100,i,'kelurahan'),kecamatan:limited(text(row,24),100,i,'kecamatan'),city:limited(text(row,25),100,i,'city'),
      religion:limited(text(row,28),30,i,'religion'),marital_status:({'BELUM KAWIN':'SINGLE',KAWIN:'MARRIED','CERAI HIDUP':'DIVORCED','CERAI MATI':'WIDOWED'})[text(row,29).toUpperCase()]??null,
      bpjs_health_number:limited(text(row,34),30,i,'bpjs_health_number'),bpjs_employment_number:limited(text(row,35),30,i,'bpjs_employment_number'),
      notes:JSON.stringify({legacyImport:{sourceHash,sourceSheet:'REKRUTMEN',sourceRow:i,raw}})}
    const meta=JSON.stringify({sourceHash,sourceSheet:'REKRUTMEN',sourceRow:i,sourceEmployee})
    const docs={}
    for(const [kind,col] of [['KTP',36],['KK',37]]) {
      const cell=row.getCell(col),input=cell.value?.hyperlink||text(row,col)
      if(input) { const doc=googleDriveDocument(input); if(!doc) throw new Error(`Unsupported ${kind} document URL row ${i}`);docs[kind]=doc.url }
    }
    return {row:i,uid:uidFor(`candidate:${i}`),application_number:`LEG-KLT-261126-${String(i).padStart(5,'0')}`,idempotency_key:`klt261126:candidate:${i}`,...values,meta,ktp:docs.KTP??null,kk:docs.KK??null}
  })
  return {sourceCount:source.length,rows,adjustments,documentCount:rows.reduce((n,r)=>n+Number(!!r.ktp)+Number(!!r.kk),0)}
}
export async function generate() {
  const buffer=await fs.readFile(path.join(root,'docs/excel-source/Database Klaten - 20261126.xlsx'))
  if(createHash('sha256').update(buffer).digest('hex')!==sourceHash) throw new Error('Source hash changed; review source again')
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer)
  const sheet=workbook.getWorksheet('REKRUTMEN');if(!sheet) throw new Error('Missing REKRUTMEN sheet')
  const result=normalizeRecruitment(sheet)
  if(result.sourceCount!==690 || result.rows.length!==678) throw new Error('Unexpected candidate scope')
  const columns=['source_row','uid','application_number','idempotency_key','full_name','national_id_number','family_card_number','gender','birth_place','birth_date','education_level','address','phone','email','meta','ktp','kk']
  const inserts=result.rows.map(r=>'('+columns.map(c=>sqlValue(c==='source_row'?r.row:r[c])).join(',')+')').join(',\n')
  let sql=await fs.readFile(path.join(root,'scripts/klaten-refresh-recruitment.sql'),'utf8')
  sql=sql.replaceAll('__SOURCE_HASH__',sourceHash).replaceAll('__DOC_COUNT__',String(result.documentCount)).replace('__SOURCE_INSERTS__',inserts)
  const dir=path.join(root,'artifacts/klaten-refresh');await fs.mkdir(dir,{recursive:true})
  await fs.writeFile(path.join(dir,'20261127_klaten_recruitment_import.sql'),sql)
  const summary={sourceHash,sourceSheet:'REKRUTMEN',sourceCount:result.sourceCount,imported:result.rows.length,heldRows,documentCount:result.documentCount,ktp:result.rows.filter(r=>r.ktp).length,kk:result.rows.filter(r=>r.kk).length,nullNik:result.rows.filter(r=>!r.national_id_number).length,adjustments:result.adjustments}
  await fs.writeFile(path.join(dir,'recruitment-summary.json'),JSON.stringify(summary,null,2)+'\n')
  console.log(JSON.stringify({sourceCount:summary.sourceCount,imported:summary.imported,held:heldRows.length,documents:summary.documentCount,nullNik:summary.nullNik,adjustments:summary.adjustments.length}))
  return summary
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await generate()
