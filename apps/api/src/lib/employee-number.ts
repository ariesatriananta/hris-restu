import type { PoolConnection, RowDataPacket } from 'mysql2/promise'

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/

export class EmployeeNumberSequenceExhaustedError extends Error {
  constructor() {
    super('Nomor urut Employee ID untuk site dan tanggal bergabung ini sudah penuh.')
  }
}

export function formatEmployeeNumber(
  prefix: string,
  joinDate: string,
  sequence: number
) {
  const match = datePattern.exec(joinDate)
  if (!match) throw new Error('Tanggal bergabung tidak valid.')

  const [, year, month, day] = match
  const parsed = new Date(`${joinDate}T00:00:00.000Z`)
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error('Tanggal bergabung tidak valid.')
  }
  if (!/^[A-Z]{3}$/.test(prefix)) {
    throw new Error('Prefix Employee ID site tidak valid.')
  }
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw new EmployeeNumberSequenceExhaustedError()
  }

  return `P${prefix}-${year.slice(2)}${month}-${day}${String(sequence).padStart(3, '0')}`
}

export async function reserveEmployeeNumber(
  connection: PoolConnection,
  input: { siteId: number; prefix: string; joinDate: string }
) {
  const formattedPrefix = employeeNumberPrefix(input.prefix, input.joinDate)
  await connection.execute(
    `INSERT INTO employee_number_sequences(site_id, join_date, last_sequence)
     VALUES (?, ?, 0)
     ON DUPLICATE KEY UPDATE last_sequence = last_sequence`,
    [input.siteId, input.joinDate]
  )
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT last_sequence lastSequence
     FROM employee_number_sequences
     WHERE site_id = ? AND join_date = ?
     FOR UPDATE`,
    [input.siteId, input.joinDate]
  )
  const [existingRows] = await connection.query<RowDataPacket[]>(
    `SELECT COALESCE(MAX(CAST(RIGHT(employee_number, 3) AS UNSIGNED)), 0) maxSequence
     FROM employees
     WHERE current_site_id = ?
       AND join_date = ?
       AND employee_number LIKE ?`,
    [input.siteId, input.joinDate, `${formattedPrefix}%`]
  )
  const lastSequence = Math.max(
    Number(rows[0]?.lastSequence ?? 0),
    Number(existingRows[0]?.maxSequence ?? 0)
  )
  const nextSequence = lastSequence + 1
  if (nextSequence > 999) throw new EmployeeNumberSequenceExhaustedError()

  await connection.execute(
    `UPDATE employee_number_sequences
     SET last_sequence = ?
     WHERE site_id = ? AND join_date = ?`,
    [nextSequence, input.siteId, input.joinDate]
  )

  return formatEmployeeNumber(input.prefix, input.joinDate, nextSequence)
}

function employeeNumberPrefix(prefix: string, joinDate: string) {
  const match = datePattern.exec(joinDate)
  if (!match) throw new Error('Tanggal bergabung tidak valid.')
  const [, year, month, day] = match
  return `P${prefix}-${year.slice(2)}${month}-${day}`
}
