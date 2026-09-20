-- Tambahkan Insentif sebagai komponen pendapatan manual Payroll.
-- Aman dijalankan ulang; tidak mengubah komponen dengan kode yang sudah ada.

INSERT INTO payroll_component_types (
  uid,code,name,component_category,calculation_method,is_taxable,is_active,description
) VALUES (
  UUID(),'INCENTIVE','Insentif','EARNING','MANUAL',0,1,
  'Insentif tambahan yang diinput manual per periode Payroll.'
)
ON DUPLICATE KEY UPDATE id=id;

SELECT code,name,component_category,calculation_method,is_active
FROM payroll_component_types
WHERE code='INCENTIVE';
