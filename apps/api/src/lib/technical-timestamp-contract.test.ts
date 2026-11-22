import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const route = (name: string) => readFileSync(new URL(`../routes/${name}.ts`, import.meta.url), 'utf8')

// DATETIME metadata is written by the UTC SQL session. Keep the API's offset
// truthful; operational wall clocks intentionally follow a different contract.
describe('UTC technical timestamp API contract', () => {
  it.each([
    'attendance-classifications', 'attendance-corrections', 'attendance-finalizations',
    'attendance-insights', 'system', 'dashboard', 'payroll-approvals', 'payroll-history',
    'payroll-periods', 'payroll-simulations', 'payroll-bpjs', 'production-transactions',
    'production-recaps', 'reports',
  ])('%s marks SQL-generated metadata as UTC', (name) => {
    const source = route(name)
    const metadata = /DATE_FORMAT\((?:[^,\n]*\.)?(?:created_at|updated_at|requested_at|reviewed_at|applied_at|cancelled_at|voided_at|revised_at|payroll_locked_at|performed_at|started_at|finished_at|closed_at|calculation_started_at|calculation_finished_at|occurred_at),[^\n]+/g
    const formats = [...source.matchAll(metadata)].map(([line]) => line)
    // A checked route must really contain metadata: avoid vacuous passes if
    // a serializer is moved or renamed during a later change.
    expect(formats.length).toBeGreaterThan(0)
    for (const line of formats) {
      expect(line).not.toContain('+07:00')
      expect(line).toMatch(/(?:%sZ|%s\.000'\),'Z'|%s\.%f'\),'Z')/)
    }
  })

  it('preserves WIB operational clocks alongside UTC metadata', () => {
    const corrections = route('attendance-corrections')
    expect(corrections).toContain("DATE_FORMAT(ac.old_clock_in_at,'%Y-%m-%dT%H:%i:%s+07:00')")
    expect(corrections).toContain("DATE_FORMAT(ac.new_clock_out_at,'%Y-%m-%dT%H:%i:%s+07:00')")
    expect(route('production-transactions')).toContain("DATE_FORMAT(pt.transaction_at,'%Y-%m-%dT%H:%i:%s+07:00')")
  })

  it('renders a UTC technical event on the correct WIB day', () => {
    const event = new Date('2026-11-24T23:30:00.000Z')
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(event)
    const value = (type: string) => parts.find((part) => part.type === type)?.value
    expect(`${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}`)
      .toBe('2026-11-25 06:30')
  })
})
