import type { RowDataPacket } from 'mysql2'
import { pool } from '../db.js'
const [rows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) total FROM roles WHERE code = ?', ['SUPER_ADMIN'])
if (Number(rows[0]?.total ?? 0) !== 1) throw new Error('Seed referensi belum diimpor dari db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql.')
// eslint-disable-next-line no-console
console.log('Seed referensi database tersedia. Akun admin tetap dibuat manual.')
await pool.end()
