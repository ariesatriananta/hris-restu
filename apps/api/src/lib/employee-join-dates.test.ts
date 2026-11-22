import { describe, expect, it } from 'vitest'
import { employeeJoinDateIssue } from './employee-join-dates.js'

describe('employee join phases', () => {
  it('preserves earlier training when Borong start is the join date', () => {
    expect(employeeJoinDateIssue({ employeeType: 'BORONGAN', joinDate: '2026-02-05', joinDateTraining: '2026-01-01', joinDateBorong: '2026-02-05' })).toBeUndefined()
  })
  it('keeps the existing earliest-join registration flow', () => {
    expect(employeeJoinDateIssue({ employeeType: 'BORONGAN', joinDate: '2026-01-01', joinDateTraining: '2026-01-01', joinDateBorong: '2026-02-05' })).toBeUndefined()
  })
  it('rejects reversed phases or an unrelated earlier training date', () => {
    expect(employeeJoinDateIssue({ employeeType: 'BORONGAN', joinDate: '2026-02-05', joinDateTraining: '2026-03-01', joinDateBorong: '2026-02-05' })?.field).toBe('joinDateBorong')
    expect(employeeJoinDateIssue({ employeeType: 'TRAINING', joinDate: '2026-02-05', joinDateTraining: '2026-01-01' })?.field).toBe('joinDateTraining')
    expect(employeeJoinDateIssue({ employeeType: 'BORONGAN', joinDate: '2026-02-05', joinDateTraining: '2026-01-01', joinDateBorong: '2026-03-01' })?.field).toBe('joinDateTraining')
  })
})
