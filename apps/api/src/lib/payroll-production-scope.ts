/** SQL-only aliases are internal constants, never request input. */
export function pieceRateProductionScope(
  alias: 'pt' | 'posted' | 'source' | 'paid_production' | 'transaction_row',
  preserveInvalid = false
) {
  return `${preserveInvalid ? 'NOT ' : ''}EXISTS (
    SELECT 1 FROM employee_employment_histories production_payroll_history
    JOIN employee_types production_payroll_type
      ON production_payroll_type.id=production_payroll_history.employee_type_id
     AND ${preserveInvalid ? "production_payroll_type.code='TRAINING'" : "production_payroll_type.code='BORONGAN' AND production_payroll_type.payroll_basis='PIECE_RATE'"}
    WHERE production_payroll_history.employee_id=${alias}.employee_id
      AND production_payroll_history.site_id=${alias}.site_id
      AND production_payroll_history.status='ACTIVE'
      AND production_payroll_history.effective_from<=${alias}.business_date
      AND (production_payroll_history.effective_to IS NULL
           OR production_payroll_history.effective_to>=${alias}.business_date)
  )`
}
