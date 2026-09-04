import mysql from 'mysql2/promise'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tidak tersedia.')

const results = []
const metrics = {}

function check(code, label, status, detail) {
  results.push({ code, label, status, detail })
}

function configured(name) {
  return Boolean(process.env[name]?.trim())
}

let tokenEntries = []
try {
  const parsed = JSON.parse(process.env.RECRUITMENT_SITE_TOKENS_JSON || '{}')
  if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
    tokenEntries = Object.entries(parsed)
  }
} catch {
  tokenEntries = []
}

const expectedSites = ['JEPARA', 'KLATEN', 'SEMARANG']
const validTokenEntries = tokenEntries.filter(
  ([token, site]) =>
    /^[A-Za-z0-9_-]{24,100}$/.test(token) &&
    typeof site === 'string' &&
    /^[A-Z0-9_-]{2,20}$/.test(site)
)
const tokenSites = [...new Set(validTokenEntries.map(([, site]) => site))].sort()
check(
  'ENV_SITE_TOKENS',
  'Tautan publik tersedia untuk ketiga site',
  validTokenEntries.length === 3 &&
    JSON.stringify(tokenSites) === JSON.stringify(expectedSites)
    ? 'PASS'
    : 'FAIL',
  `${validTokenEntries.length}/3 token valid; site: ${tokenSites.join(', ') || '-'}.`
)

const turnstileKeys = [
  'RECRUITMENT_TURNSTILE_SITE_KEY',
  'RECRUITMENT_TURNSTILE_SECRET_KEY',
  'RECRUITMENT_TURNSTILE_EXPECTED_HOSTNAME',
]
const missingTurnstile = turnstileKeys.filter((key) => !configured(key))
check(
  'ENV_TURNSTILE',
  'Perlindungan bot sudah dikonfigurasi',
  missingTurnstile.length ? 'FAIL' : 'PASS',
  missingTurnstile.length
    ? `Belum terisi: ${missingTurnstile.join(', ')}.`
    : 'Site key, secret key, dan hostname sudah terisi.'
)

const privateBucketReady =
  configured('RECRUITMENT_R2_BUCKET_NAME') &&
  process.env.RECRUITMENT_R2_BUCKET_NAME !== process.env.R2_BUCKET_NAME
check(
  'ENV_PRIVATE_STORAGE',
  'Penyimpanan Rekrutmen terpisah dari berkas umum',
  privateBucketReady ? 'PASS' : 'FAIL',
  privateBucketReady
    ? 'Bucket privat dan awalan folder sudah disiapkan.'
    : 'Bucket Rekrutmen belum terisi atau masih sama dengan bucket umum.'
)

const connection = await mysql.createConnection(process.env.DATABASE_URL)

async function rows(sql, values = []) {
  const [result] = await connection.query(sql, values)
  return result
}

async function scalar(sql, values = [], field = 'total') {
  const result = await rows(sql, values)
  return Number(result[0]?.[field] ?? 0)
}

try {
  await connection.query('SET TRANSACTION READ ONLY')
  await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT')

  const requiredTables = [
    'recruitment_candidates',
    'recruitment_candidate_files',
    'recruitment_status_events',
  ]
  const availableTables = await rows(
    `SELECT table_name tableName
       FROM information_schema.tables
      WHERE table_schema=DATABASE()
        AND table_name IN (?,?,?)`,
    requiredTables
  )
  const tableSet = new Set(availableTables.map((row) => String(row.tableName)))
  const missingTables = requiredTables.filter((table) => !tableSet.has(table))
  check(
    'DB_RECRUITMENT_TABLES',
    'Tabel Rekrutmen tersedia',
    missingTables.length ? 'FAIL' : 'PASS',
    missingTables.length
      ? `Tidak ditemukan: ${missingTables.join(', ')}.`
      : 'Tiga tabel utama tersedia.'
  )

  const requiredColumns = [
    ['recruitment_candidates', 'active_national_id_number'],
    ['recruitment_candidates', 'employee_id'],
    ['recruitment_candidates', 'converted_at'],
    ['recruitment_candidates', 'converted_by'],
    ['recruitment_candidate_files', 'file_kind'],
    ['recruitment_status_events', 'idempotency_key'],
  ]
  const availableColumns = await rows(
    `SELECT table_name tableName,column_name columnName
       FROM information_schema.columns
      WHERE table_schema=DATABASE()
        AND table_name IN (?,?,?)`,
    requiredTables
  )
  const columnSet = new Set(
    availableColumns.map((row) => `${row.tableName}.${row.columnName}`)
  )
  const missingColumns = requiredColumns
    .map(([table, column]) => `${table}.${column}`)
    .filter((column) => !columnSet.has(column))
  check(
    'DB_RECRUITMENT_COLUMNS',
    'Kolom pengamanan Rekrutmen tersedia',
    missingColumns.length ? 'FAIL' : 'PASS',
    missingColumns.length
      ? `Tidak ditemukan: ${missingColumns.join(', ')}.`
      : 'Kolom identitas aktif, konversi, berkas, dan idempotensi lengkap.'
  )

  const activeSites = await rows(
    `SELECT code FROM sites
      WHERE is_active=1 AND code IN ('JEPARA','KLATEN','SEMARANG')
      ORDER BY code`
  )
  const activeSiteCodes = activeSites.map((row) => String(row.code))
  check(
    'DB_RECRUITMENT_SITES',
    'Ketiga site tujuan aktif',
    JSON.stringify(activeSiteCodes) === JSON.stringify(expectedSites)
      ? 'PASS'
      : 'FAIL',
    `Site aktif: ${activeSiteCodes.join(', ') || '-'}.`
  )

  const permissionRows = await rows(
    `SELECT p.code,
            COUNT(DISTINCT CASE
              WHEN r.code IN ('SUPER_ADMIN','HR_OFFICER') THEN r.code
            END) roleCount
       FROM permissions p
       LEFT JOIN role_permissions rp ON rp.permission_id=p.id
       LEFT JOIN roles r ON r.id=rp.role_id
      WHERE p.code IN ('recruitment.view','recruitment.manage')
      GROUP BY p.id,p.code
      ORDER BY p.code`
  )
  const permissionMap = new Map(
    permissionRows.map((row) => [String(row.code), Number(row.roleCount)])
  )
  const permissionsReady = ['recruitment.view', 'recruitment.manage'].every(
    (code) => permissionMap.get(code) === 2
  )
  check(
    'DB_RECRUITMENT_PERMISSIONS',
    'Hak akses awal Rekrutmen tersedia',
    permissionsReady ? 'PASS' : 'FAIL',
    `Lihat: ${permissionMap.get('recruitment.view') ?? 0}/2 peran; kelola: ${permissionMap.get('recruitment.manage') ?? 0}/2 peran.`
  )

  const candidateCount = await scalar(
    'SELECT COUNT(*) total FROM recruitment_candidates'
  )
  const convertedCount = await scalar(
    "SELECT COUNT(*) total FROM recruitment_candidates WHERE status='CONVERTED'"
  )
  metrics.candidates = { total: candidateCount, converted: convertedCount }
  check(
    'DB_RECRUITMENT_DATA_COVERAGE',
    'Tersedia data nyata untuk UAT operasional',
    candidateCount ? 'PASS' : 'WARN',
    candidateCount
      ? `${candidateCount} kandidat tersedia; ${convertedCount} sudah menjadi karyawan.`
      : 'Belum ada kandidat. Uji alur nyata perlu satu pendaftaran percobaan.'
  )

  const conversionMismatch = await scalar(
    `SELECT COUNT(*) total
       FROM recruitment_candidates
      WHERE NOT (
        (status='CONVERTED' AND employee_id IS NOT NULL
          AND converted_at IS NOT NULL AND converted_by IS NOT NULL)
        OR
        (status<>'CONVERTED' AND employee_id IS NULL AND converted_at IS NULL)
      )`
  )
  check(
    'DB_CONVERSION_INTEGRITY',
    'Status kandidat cocok dengan hasil konversi',
    conversionMismatch ? 'FAIL' : 'PASS',
    `${conversionMismatch} kandidat tidak konsisten.`
  )

  const duplicateActiveNik = await scalar(
    `SELECT COUNT(*) total FROM (
       SELECT national_id_number
         FROM recruitment_candidates
        WHERE status IN ('NEW','IN_PROGRESS','PASSED','CONVERTED')
        GROUP BY national_id_number HAVING COUNT(*)>1
     ) duplicate_nik`
  )
  check(
    'DB_ACTIVE_NIK_UNIQUE',
    'Tidak ada lamaran aktif ganda untuk NIK yang sama',
    duplicateActiveNik ? 'FAIL' : 'PASS',
    `${duplicateActiveNik} NIK memiliki lebih dari satu lamaran aktif.`
  )

  const fileMismatch = await scalar(
    `SELECT COUNT(*) total FROM (
       SELECT rc.id,
         COUNT(rcf.id) fileCount,
         COUNT(DISTINCT rcf.file_kind) kindCount,
         COALESCE(SUM(f.id IS NULL OR f.visibility<>'INTERNAL'),0) unsafeCount
       FROM recruitment_candidates rc
       LEFT JOIN recruitment_candidate_files rcf ON rcf.candidate_id=rc.id
       LEFT JOIN files f ON f.id=rcf.file_id
       GROUP BY rc.id
       HAVING fileCount<>3 OR kindCount<>3 OR unsafeCount<>0
     ) invalid_files`
  )
  check(
    'DB_PRIVATE_FILE_INTEGRITY',
    'Setiap kandidat memiliki tiga dokumen privat',
    fileMismatch ? 'FAIL' : 'PASS',
    `${fileMismatch} kandidat memiliki paket dokumen tidak lengkap atau tidak privat.`
  )

  const eventMismatch = await scalar(
    `SELECT COUNT(*) total
       FROM recruitment_candidates rc
       LEFT JOIN recruitment_status_events latest ON latest.id=(
         SELECT event.id FROM recruitment_status_events event
          WHERE event.candidate_id=rc.id
          ORDER BY event.occurred_at DESC,event.id DESC LIMIT 1
       )
      WHERE latest.id IS NULL OR latest.to_status<>rc.status`
  )
  check(
    'DB_STATUS_EVENT_INTEGRITY',
    'Status kandidat cocok dengan histori terakhir',
    eventMismatch ? 'FAIL' : 'PASS',
    `${eventMismatch} kandidat tidak memiliki histori terakhir yang sesuai.`
  )

  const convertedEmployeeMismatch = await scalar(
    `SELECT COUNT(*) total
       FROM recruitment_candidates rc
       LEFT JOIN employees e ON e.id=rc.employee_id
      WHERE rc.status='CONVERTED'
        AND (
          e.id IS NULL OR e.photo_file_id IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM employee_employment_histories history
             WHERE history.employee_id=e.id AND history.change_type='INITIAL'
          )
          OR (
            SELECT COUNT(DISTINCT document.document_type)
              FROM employee_documents document
             WHERE document.employee_id=e.id
               AND document.document_type IN ('KTP','KK')
               AND document.file_id IS NOT NULL
          )<>2
        )`
  )
  check(
    'DB_CONVERTED_EMPLOYEE_INTEGRITY',
    'Karyawan hasil Rekrutmen memiliki histori dan dokumen awal',
    convertedEmployeeMismatch ? 'FAIL' : 'PASS',
    `${convertedEmployeeMismatch} hasil konversi belum lengkap.`
  )

  await connection.rollback()
} catch (error) {
  try {
    await connection.rollback()
  } catch {}
  throw error
} finally {
  await connection.end()
}

const totals = {
  pass: results.filter((result) => result.status === 'PASS').length,
  warn: results.filter((result) => result.status === 'WARN').length,
  fail: results.filter((result) => result.status === 'FAIL').length,
}

console.log('UAT Rekrutmen - preflight environment dan database baca-saja')
for (const result of results) {
  console.log(`[${result.status}] ${result.label} - ${result.detail}`)
}
console.log(
  `Ringkasan: ${totals.pass} PASS, ${totals.warn} WARN, ${totals.fail} FAIL`
)
console.log(`UAT_RECRUITMENT_JSON=${JSON.stringify({ totals, results, metrics })}`)
if (totals.fail) process.exitCode = 1
