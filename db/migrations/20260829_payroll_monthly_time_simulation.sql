-- Payroll M5C - Simulasi TIME_BASED bulanan untuk karyawan BULANAN.
-- Jalankan setelah 20260829_payroll_weekly_time_simulation.sql.
-- Migration hanya menyiapkan master komponen dan snapshot immutable;
-- tidak membuat maupun menghitung run Payroll.

START TRANSACTION;

INSERT INTO payroll_component_types(
  uid,code,name,component_category,calculation_method,is_taxable,is_active,description
) VALUES
  (UUID(),'MONTHLY_ALPHA_DEDUCTION','Potongan Alpha Bulanan','DEDUCTION','FORMULA',0,1,
   'Potongan otomatis Alpha berdasarkan gaji pokok dan hari kerja terjadwal periode.'),
  (UUID(),'MONTHLY_PERMISSION_DEDUCTION','Potongan Izin Bulanan','DEDUCTION','FORMULA',0,1,
   'Potongan otomatis Izin berdasarkan gaji pokok dan hari kerja terjadwal periode.')
ON DUPLICATE KEY UPDATE
  name=VALUES(name),component_category=VALUES(component_category),
  calculation_method=VALUES(calculation_method),is_active=1,
  description=VALUES(description);

CREATE TABLE IF NOT EXISTS payroll_monthly_summaries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_employee_result_id BIGINT UNSIGNED NOT NULL,
  employee_salary_history_id BIGINT UNSIGNED NOT NULL,
  full_basic_salary_snapshot DECIMAL(18,2) NOT NULL,
  currency_snapshot CHAR(3) NOT NULL,
  period_calendar_days SMALLINT UNSIGNED NOT NULL,
  eligible_calendar_days SMALLINT UNSIGNED NOT NULL,
  prorated_basic_salary DECIMAL(18,2) NOT NULL,
  scheduled_work_days SMALLINT UNSIGNED NOT NULL,
  alpha_days SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  permission_days SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  alpha_deduction DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  permission_deduction DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_monthly_summaries_uid (uid),
  UNIQUE KEY uq_payroll_monthly_summary_result (payroll_employee_result_id),
  KEY idx_payroll_monthly_summary_salary (employee_salary_history_id),
  CONSTRAINT chk_payroll_monthly_summary_days CHECK (
    period_calendar_days>0
    AND eligible_calendar_days BETWEEN 1 AND period_calendar_days
    AND scheduled_work_days>=alpha_days+permission_days
  ),
  CONSTRAINT chk_payroll_monthly_summary_amounts CHECK (
    full_basic_salary_snapshot>0 AND prorated_basic_salary>=0
    AND alpha_deduction>=0 AND permission_deduction>=0
  ),
  CONSTRAINT chk_payroll_monthly_summary_currency CHECK (currency_snapshot='IDR'),
  CONSTRAINT fk_payroll_monthly_summary_result FOREIGN KEY (payroll_employee_result_id)
    REFERENCES payroll_employee_results(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_monthly_summary_salary FOREIGN KEY (employee_salary_history_id)
    REFERENCES employee_salary_histories(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_monthly_daily_details (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  payroll_employee_result_id BIGINT UNSIGNED NOT NULL,
  attendance_record_id BIGINT UNSIGNED NULL,
  employee_salary_history_id BIGINT UNSIGNED NOT NULL,
  business_date DATE NOT NULL,
  attendance_status_snapshot VARCHAR(30) NOT NULL,
  calendar_day_type_snapshot VARCHAR(30) NOT NULL,
  calendar_reason_type_snapshot VARCHAR(30) NOT NULL,
  is_scheduled TINYINT(1) NOT NULL DEFAULT 0,
  deduction_type VARCHAR(20) NOT NULL DEFAULT 'NONE',
  full_basic_salary_snapshot DECIMAL(18,2) NOT NULL,
  currency_snapshot CHAR(3) NOT NULL,
  worked_minutes_snapshot INT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payroll_monthly_daily_uid (uid),
  UNIQUE KEY uq_payroll_monthly_daily_result_date (payroll_employee_result_id,business_date),
  KEY idx_payroll_monthly_daily_attendance (attendance_record_id),
  KEY idx_payroll_monthly_daily_salary (employee_salary_history_id),
  KEY idx_payroll_monthly_daily_date (business_date),
  CONSTRAINT chk_payroll_monthly_daily_scheduled CHECK (is_scheduled IN (0,1)),
  CONSTRAINT chk_payroll_monthly_daily_deduction CHECK (
    (deduction_type='NONE')
    OR (deduction_type='ALPHA' AND is_scheduled=1 AND attendance_status_snapshot='ABSENT')
    OR (deduction_type='PERMISSION' AND is_scheduled=1 AND attendance_status_snapshot='PERMISSION')
  ),
  CONSTRAINT chk_payroll_monthly_daily_salary_amount CHECK (full_basic_salary_snapshot>0),
  CONSTRAINT chk_payroll_monthly_daily_currency CHECK (currency_snapshot='IDR'),
  CONSTRAINT fk_payroll_monthly_daily_result FOREIGN KEY (payroll_employee_result_id)
    REFERENCES payroll_employee_results(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_monthly_daily_attendance FOREIGN KEY (attendance_record_id)
    REFERENCES attendance_records(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_payroll_monthly_daily_salary FOREIGN KEY (employee_salary_history_id)
    REFERENCES employee_salary_histories(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMIT;

SELECT table_name
FROM information_schema.tables
WHERE table_schema=DATABASE()
  AND table_name IN ('payroll_monthly_summaries','payroll_monthly_daily_details')
ORDER BY table_name;
