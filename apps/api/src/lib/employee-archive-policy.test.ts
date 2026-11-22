import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { actionableEmployeeSql, klatenLegacySourceHash, legacyArchiveOriginSql } from './employee-archive-policy.js'

describe('archive reminder SQL population', () => {
  it('keeps active imports and real rehire workflows while removing dormant archives before pagination', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.function('IF', (condition, yes, no) => condition ? yes : no)
      db.function('JSON_UNQUOTE', value => value)
      db.exec(`CREATE TABLE employees(id INTEGER PRIMARY KEY,notes TEXT,employee_type_id INTEGER,employee_status_id INTEGER);
        CREATE TABLE employee_types(id INTEGER PRIMARY KEY,code TEXT);
        CREATE TABLE employee_statuses(id INTEGER PRIMARY KEY,code TEXT);
        CREATE TABLE employee_contracts(id INTEGER PRIMARY KEY,employee_id INTEGER,status TEXT);
        INSERT INTO employee_types VALUES(1,'TRAINING'),(2,'LEGACY_UNKNOWN'),(3,'BORONGAN');
        INSERT INTO employee_statuses VALUES(1,'INACTIVE'),(2,'ACTIVE'),(3,'RESIGNED');`)
      const note = (status: string, hash = klatenLegacySourceHash) => JSON.stringify({ legacyImport: { sourceHash: hash,raw: { '12:STATUS (Aktif/Tidak Aktif)': status } } })
      const insert = db.prepare('INSERT INTO employees VALUES(?,?,?,?)')
      insert.run(1,note('NON AKTIF'),1,1) // archive Training
      insert.run(2,note('NON AKTIF'),2,1) // unknown archive
      insert.run(3,note('AKTIF'),3,2) // active import
      insert.run(4,'ordinary notes',1,1) // new registration
      insert.run(5,note('NON AKTIF'),1,1) // explicit rehire draft
      insert.run(6,'{invalid',1,1) // no silent exemption
      insert.run(7,note('RESIGN'),1,3)
      insert.run(8,note('NON AKTIF','untrusted'),1,1)
      insert.run(9,note('NON AKTIF'),2,2) // bad active unknown stays out of onboarding
      insert.run(10,note('AKTIF'),3,1) // original active is not a dormant source archive
      insert.run(11,note('NON AKTIF'),1,1) // actual active contract conflict remains actionable
      db.exec("INSERT INTO employee_contracts VALUES(1,5,'DRAFT'),(2,11,'ACTIVE'),(3,1,'CANCELLED')")
      const from = 'FROM employees e JOIN employee_types et ON et.id=e.employee_type_id JOIN employee_statuses es ON es.id=e.employee_status_id'
      const result = db.prepare(`SELECT e.id ${from} WHERE ${actionableEmployeeSql()} ORDER BY e.id`).all()
      expect(result.map(r => r.id)).toEqual([3,4,5,6,8,10,11])
      expect(db.prepare(`SELECT ${legacyArchiveOriginSql()} value FROM employees e WHERE e.id=1`).get()?.value).toBe(1)
      expect(db.prepare(`SELECT ${legacyArchiveOriginSql()} value FROM employees e WHERE e.id=10`).get()?.value).toBe(0)
    } finally { db.close() }
  })
})
