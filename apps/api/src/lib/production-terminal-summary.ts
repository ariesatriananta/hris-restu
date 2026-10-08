// Shared attendance membership for the cards and their employee drill-down.
// Parameter order: history start/end, attendance day/site, overlap start/end.
export function productionTerminalSummaryAttendanceSql(
  hasHistoryStatus: boolean,
  extraJoin = ''
) {
  return `FROM attendance_records attendance
    JOIN employee_employment_histories history
      ON history.employee_id=attendance.employee_id
     AND history.site_id=attendance.site_id
     ${hasHistoryStatus ? "AND history.status='ACTIVE'" : ''}
     AND history.effective_from<=?
     AND (history.effective_to IS NULL OR history.effective_to>=?)
    JOIN employee_statuses employment_status
      ON employment_status.id=history.employee_status_id
     AND employment_status.allows_production=1
    JOIN production_module_sections mapping
      ON mapping.id=history.production_module_section_id
    JOIN production_sections employee_section
      ON employee_section.id=mapping.production_section_id
    JOIN production_modules employee_module
      ON employee_module.id=mapping.production_module_id
    JOIN employees employee ON employee.id=attendance.employee_id
    ${extraJoin}
   WHERE attendance.business_date=? AND attendance.site_id=?
     AND attendance.attendance_status='PRESENT'
     AND employee_section.is_active=1
     AND NOT EXISTS (
       SELECT 1 FROM employee_employment_histories other_history
        WHERE other_history.employee_id=history.employee_id
          AND other_history.id<>history.id
          ${hasHistoryStatus ? "AND other_history.status='ACTIVE'" : ''}
          AND other_history.effective_from<=?
          AND (other_history.effective_to IS NULL OR other_history.effective_to>=?)
     )`
}

export const productionTerminalSummaryPostedSql = `EXISTS (
  SELECT 1 FROM production_transactions transaction_row
   WHERE transaction_row.employee_id=attendance.employee_id
     AND transaction_row.site_id=attendance.site_id
     AND transaction_row.business_date=attendance.business_date
     AND transaction_row.status='POSTED'
)`
