-- Read-only preflight sebelum mengaktifkan M5A1.
-- Semua angka immutable_payroll_rows wajib 0. Fakta Produksi Training sengaja
-- hanya dilaporkan dan tidak boleh dihapus.
SELECT 'training_employment_histories' metric,COUNT(*) total
FROM employee_employment_histories eh JOIN employee_types et ON et.id=eh.employee_type_id
WHERE et.code='TRAINING'
UNION ALL
SELECT 'training_production_transactions',COUNT(*)
FROM production_transactions pt
JOIN employee_employment_histories eh ON eh.employee_id=pt.employee_id
 AND eh.effective_from<=pt.business_date AND (eh.effective_to IS NULL OR eh.effective_to>=pt.business_date)
JOIN employee_types et ON et.id=eh.employee_type_id AND et.code='TRAINING'
UNION ALL
SELECT 'training_immutable_payroll_rows',COUNT(*)
FROM payroll_production_details ppd
JOIN payroll_employee_results per ON per.id=ppd.payroll_employee_result_id
JOIN payroll_runs pr ON pr.id=per.payroll_run_id
JOIN payroll_periods pp ON pp.id=pr.payroll_period_id
WHERE per.employee_type_snapshot='TRAINING'
  AND (pp.status IN ('APPROVED','CLOSED') OR pr.run_type='FINAL');
