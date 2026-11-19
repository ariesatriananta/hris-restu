import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { pieceRateProductionScope } from './payroll-production-scope.js'

describe('Payroll production employment scope', () => {
  it('excludes Training wages when the employee becomes Borongan in the same week', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(`
        CREATE TABLE employee_types(id INTEGER,code TEXT,payroll_basis TEXT);
        CREATE TABLE employee_employment_histories(employee_id INTEGER,site_id INTEGER,employee_type_id INTEGER,status TEXT,effective_from TEXT,effective_to TEXT);
        CREATE TABLE production_transactions(id INTEGER,employee_id INTEGER,site_id INTEGER,business_date TEXT,gross_amount INTEGER);
        INSERT INTO employee_types VALUES(1,'TRAINING','TIME_BASED'),(2,'BORONGAN','PIECE_RATE');
        INSERT INTO employee_employment_histories VALUES
          (7,1,1,'ACTIVE','2026-11-16','2026-11-18'),
          (7,1,2,'ACTIVE','2026-11-19',NULL),
          (8,1,1,'ACTIVE','2026-11-01',NULL),
          (9,1,2,'CANCELLED','2026-11-01',NULL),
          (10,2,2,'ACTIVE','2026-11-01',NULL);
        INSERT INTO production_transactions VALUES
          (1,7,1,'2026-11-18',999),(2,7,1,'2026-11-19',100),
          (3,8,1,'2026-11-19',888),(4,9,1,'2026-11-19',777),
          (5,10,1,'2026-11-19',666);
      `)
      const wages = db
        .prepare(
          `SELECT COUNT(*) count,SUM(pt.gross_amount) amount FROM production_transactions pt WHERE ${pieceRateProductionScope('pt')}`
        )
        .get()
      expect({ ...wages }).toEqual({ count: 1, amount: 100 })
      // Invalid facts remain readiness candidates; valid Training facts do not.
      const candidates = db
        .prepare(
          `SELECT pt.id FROM production_transactions pt WHERE ${pieceRateProductionScope('pt', true)} ORDER BY pt.id`
        )
        .all()
      expect(candidates.map((row) => row.id)).toEqual([2, 4, 5])
    } finally {
      db.close()
    }
  })
})
