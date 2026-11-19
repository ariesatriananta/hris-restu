import mysql from 'mysql2/promise'
import assert from 'node:assert/strict'
import { loadAttendanceRateSource } from '../apps/api/src/lib/attendance-rate-source.ts'
import {
  attendanceRateDate,
  attendanceRateWindow,
  buildAttendanceRate,
} from '../apps/api/src/lib/attendance-rate.ts'

// Owner-authorized audit: SELECT only inside a database-enforced READ ONLY snapshot.
// Never prints credentials, employee identifiers, names, transactions, or SQL errors.
const arg = (name) =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
const today = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date())
const selectedDate = arg('date')
if (selectedDate) {
  attendanceRateDate.parse(selectedDate)
  assert.ok(selectedDate <= today)
}
const selectedSite = arg('site')
if (selectedSite)
  assert.ok(['JEPARA', 'SEMARANG', 'KLATEN'].includes(selectedSite))
const destination = new URL(process.env.DATABASE_URL)
// Avoid accidental auditing of another server with the local UAT command.
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(destination.hostname))
  throw new Error('Audit ini hanya untuk database lokal.')
let connection
const results = []
try {
  connection = await mysql.createConnection(process.env.DATABASE_URL)
  await connection.query("SET time_zone='+07:00'")
  await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ')
  await connection.query(
    'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY'
  )
  const [sites] = await connection.query(
    `SELECT id,uid,code,name FROM sites WHERE is_active=1 ${selectedSite ? 'AND code=?' : ''} ORDER BY code`,
    selectedSite ? [selectedSite] : []
  )
  assert.ok(sites.length, 'Site aktif tidak ditemukan.')
  for (const site of sites) {
    const [latest] = await connection.query(
      "SELECT DATE_FORMAT(MAX(business_date),'%Y-%m-%d') day FROM production_transactions WHERE site_id=? AND business_date<=?",
      [site.id, today]
    )
    const [weeks] = await connection.query(
      "SELECT DISTINCT DATE_FORMAT(DATE_ADD(business_date, INTERVAL (7-WEEKDAY(business_date)) DAY),'%Y-%m-%d') day FROM production_transactions WHERE site_id=? AND status='POSTED' AND business_date<=?",
      [site.id, today]
    )
    const dates = [
      ...new Set(
        selectedDate
          ? [selectedDate]
          : [
              today,
              attendanceRateWindow(today).to,
              ...(latest[0].day ? [latest[0].day] : []),
              ...weeks.map((row) => row.day).filter((day) => day <= today),
            ]
      ),
    ]
    for (const date of dates) {
      const window = attendanceRateWindow(date)
      const started = performance.now()
      const source = await loadAttendanceRateSource(connection, site, date)
      const report = buildAttendanceRate(source, date)
      const days = [...window.dates, date]
      const cte = `WITH days AS (${days.map(() => 'SELECT CAST(? AS DATE) day').join(' UNION ALL ')}),
    roster AS (
      SELECT d.day,h.employee_id employeeId,t.code employeeType,pm.id moduleId,
        (SELECT COUNT(*) FROM employee_job_assignments a WHERE a.employee_id=h.employee_id AND a.status='ACTIVE' AND a.is_primary=1 AND a.effective_from<=d.day AND (a.effective_to IS NULL OR a.effective_to>=d.day)) jobMatches,
        (SELECT MIN(a.production_job_id) FROM employee_job_assignments a WHERE a.employee_id=h.employee_id AND a.site_id=h.site_id AND a.status='ACTIVE' AND a.is_primary=1 AND a.effective_from<=d.day AND (a.effective_to IS NULL OR a.effective_to>=d.day)) jobId,
        (SELECT COUNT(*) FROM production_module_category_histories mc WHERE mc.module_id=pm.id AND mc.effective_from<=d.day AND (mc.effective_to IS NULL OR mc.effective_to>=d.day)) categoryMatches,
        (SELECT MIN(mc.category) FROM production_module_category_histories mc WHERE mc.module_id=pm.id AND mc.effective_from<=d.day AND (mc.effective_to IS NULL OR mc.effective_to>=d.day)) category,
        EXISTS(SELECT 1 FROM attendance_records ar WHERE ar.employee_id=h.employee_id AND ar.site_id=h.site_id AND ar.business_date=d.day AND ar.attendance_status='PRESENT') present
      FROM days d JOIN employee_employment_histories h ON h.status='ACTIVE' AND h.effective_from<=d.day AND (h.effective_to IS NULL OR h.effective_to>=d.day)
      JOIN employee_types t ON t.id=h.employee_type_id AND t.code IN ('TRAINING','BORONGAN')
      JOIN employee_statuses es ON es.id=h.employee_status_id AND es.code='ACTIVE'
      LEFT JOIN production_module_sections pms ON pms.id=h.production_module_section_id
      LEFT JOIN production_modules pm ON pm.id=pms.production_module_id AND pm.site_id=h.site_id
      WHERE h.site_id=? AND NOT EXISTS(SELECT 1 FROM employee_employment_histories other WHERE other.employee_id=h.employee_id AND other.id<>h.id AND other.status='ACTIVE' AND other.effective_from<=d.day AND (other.effective_to IS NULL OR other.effective_to>=d.day))
    )`
      const baseParams = [...days, site.id]
      const [roster] = await connection.query(
        cte +
          ` SELECT employeeType,COUNT(*) roster,COALESCE(SUM(present),0) present FROM roster WHERE day=? GROUP BY employeeType`,
        [...baseParams, date]
      )
      for (const type of ['TRAINING', 'BORONGAN']) {
        const expected = roster.find((row) => row.employeeType === type)
        const total = report.totals.find((row) => row.employeeType === type)
        assert.equal(
          total.roster,
          Number(expected?.roster ?? 0),
          'Roster mismatch'
        )
        assert.equal(
          total.present,
          Number(expected?.present ?? 0),
          'Attendance mismatch'
        )
      }
      const [breakdown] = await connection.query(
        cte +
          ` SELECT employeeType,category,jobId,COUNT(*) roster,COALESCE(SUM(present),0) present FROM roster WHERE day=? AND categoryMatches=1 AND jobMatches=1 GROUP BY employeeType,category,jobId`,
        [...baseParams, date]
      )
      for (const group of report.groups)
        for (const job of group.jobs) {
          const jobId = source.jobs.find((row) => row.uid === job.job.uid)?.id
          const expected = breakdown.find(
            (row) =>
              row.employeeType === group.employeeType &&
              row.category === group.category &&
              Number(row.jobId) === jobId
          )
          assert.equal(
            job.roster,
            Number(expected?.roster ?? 0),
            'Job roster mismatch'
          )
          assert.equal(
            job.present,
            Number(expected?.present ?? 0),
            'Job attendance mismatch'
          )
        }
      const [denominators] = await connection.query(
        cte +
          ` SELECT r.employeeType,r.category,j.code jobCode,COUNT(*) presentDays FROM roster r JOIN production_jobs j ON j.id=r.jobId WHERE r.day BETWEEN ? AND ? AND r.present=1 AND r.jobMatches=1 AND r.categoryMatches=1 GROUP BY r.employeeType,r.category,j.code`,
        [...baseParams, window.from, window.to]
      )
      const [numerators] = await connection.query(
        cte +
          ` SELECT r.employeeType,r.category,j.code jobCode,CAST(SUM(pt.quantity) AS CHAR) quantity,COUNT(*) transactions
     FROM roster r JOIN production_transactions pt ON pt.employee_id=r.employeeId AND pt.site_id=? AND pt.business_date=r.day AND pt.production_job_id=r.jobId
     JOIN production_jobs j ON j.id=pt.production_job_id JOIN work_units u ON u.id=pt.unit_id
     LEFT JOIN production_transaction_qc qc ON qc.production_transaction_id=pt.id
     LEFT JOIN production_brands b ON b.id=qc.brand_id
     WHERE r.day BETWEEN ? AND ? AND r.present=1 AND r.jobMatches=1 AND r.categoryMatches=1 AND pt.status='POSTED' AND u.code='PCS' AND pt.quantity>0
     AND (pt.production_module_id IS NULL OR pt.production_module_id=r.moduleId)
     AND (qc.brand_id IS NULL OR (b.site_id=? AND (SELECT COUNT(*) FROM production_brand_category_histories bc WHERE bc.brand_id=qc.brand_id AND bc.effective_from<=r.day AND (bc.effective_to IS NULL OR bc.effective_to>=r.day))=1 AND EXISTS(SELECT 1 FROM production_brand_category_histories bc WHERE bc.brand_id=qc.brand_id AND bc.category=r.category AND bc.effective_from<=r.day AND (bc.effective_to IS NULL OR bc.effective_to>=r.day))))
     GROUP BY r.employeeType,r.category,j.code`,
        [...baseParams, site.id, window.from, window.to, site.id]
      )
      const units = (raw) => {
        const [a, b = ''] = String(raw).split('.')
        return BigInt(a) * 10000n + BigInt(b.padEnd(4, '0'))
      }
      for (const avg of report.averages.filter(
        (row) => row.category !== 'TOTAL'
      )) {
        const matches = (row) =>
          row.employeeType === avg.employeeType &&
          row.category === avg.category &&
          row.jobCode === avg.job.code
        const denominator = denominators.find(matches),
          numerator = numerators.find(matches)
        assert.equal(
          avg.presentDays,
          Number(denominator?.presentDays ?? 0),
          'Person days mismatch'
        )
        assert.equal(
          avg.transactions,
          Number(numerator?.transactions ?? 0),
          'Production count mismatch'
        )
        assert.equal(
          units(avg.quantityPcs),
          units(numerator?.quantity ?? 0),
          'Raw PCS mismatch'
        )
        if (avg.averagePcs !== null) {
          const expected =
            (units(numerator.quantity) * 2n + BigInt(avg.presentDays)) /
            (2n * BigInt(avg.presentDays))
          assert.equal(units(avg.averagePcs), expected, 'AVG mismatch')
        }
      }
      // Current-day headcounts and independently reconciled numerator/denominator drive box rational checks.
      const round = (n, d) => (n * 100n * 2n + d) / (d * 2n)
      for (const estimate of report.estimates) {
        let totalN = 0n,
          totalD = 1n,
          all = true
        for (const cell of estimate.categories.filter(
          (row) => row.category !== 'TOTAL'
        )) {
          if (cell.boxes === null) {
            all = false
            continue
          }
          let n = 0n,
            d = 1n
          for (const type of ['TRAINING', 'BORONGAN']) {
            const group = report.groups.find(
              (row) =>
                row.employeeType === type && row.category === cell.category
            )
            const people =
              group.jobs.find((row) => row.job.code === estimate.job.code)
                ?.present ?? 0
            if (!people) continue
            const match = (row) =>
              row.employeeType === type &&
              row.category === cell.category &&
              row.jobCode === estimate.job.code
            const numerator = numerators.find(match),
              denominator = denominators.find(match)
            assert.ok(numerator && denominator, 'Missing capacity source')
            const addN = units(numerator.quantity) * BigInt(people),
              addD = BigInt(denominator.presentDays) * 10000n
            n = n * addD + addN * d
            d *= addD
          }
          assert.equal(
            round(n, d * BigInt(estimate.pcsPerBox)),
            BigInt(cell.boxes.replace('.', '')),
            'Boxes mismatch'
          )
          totalN = totalN * d + n * totalD
          totalD *= d
        }
        const total = estimate.categories.find(
          (row) => row.category === 'TOTAL'
        )
        if (all)
          assert.equal(
            round(totalN, totalD * BigInt(estimate.pcsPerBox)),
            BigInt(total.boxes.replace('.', '')),
            'Total boxes mismatch'
          )
      }
      // Every chosen day in this same week must use the same reference AVG.
      const sameWeek = attendanceRateWindow(date).to
      const shiftedDate = new Date(`${sameWeek}T00:00:00Z`)
      shiftedDate.setUTCDate(shiftedDate.getUTCDate() + 1)
      const monday = shiftedDate.toISOString().slice(0, 10)
      const again = buildAttendanceRate(source, monday)
      assert.deepEqual(
        again.averages,
        report.averages,
        'Weekly AVG instability'
      )
      results.push({
        site: site.code,
        date,
        referenceWeek: report.referenceWeek,
        total: report.totals.at(-1),
        availableAverages: report.averages.filter(
          (row) => row.averagePcs !== null
        ).length,
        warnings: report.warnings.map(({ code, scope, count }) => ({
          code,
          scope,
          count,
        })),
        durationMs: Math.round(performance.now() - started),
        status: 'PASS',
      })
    }
  }
  await connection.rollback()
  console.log(
    JSON.stringify({ readOnly: true, checks: results.length, results }, null, 2)
  )
} catch (error) {
  await connection?.rollback().catch(() => {})
  console.error(
    JSON.stringify({
      status: 'FAILED',
      code: error.code ?? 'AUDIT_FAILED',
      check: error.code === 'ERR_ASSERTION' ? error.message : undefined,
    })
  )
  process.exitCode = 1
} finally {
  await connection?.end()
}
