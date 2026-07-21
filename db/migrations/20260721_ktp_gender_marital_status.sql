ALTER TABLE employees
  DROP CONSTRAINT chk_employees_gender,
  DROP CONSTRAINT chk_employees_marital,
  ADD CONSTRAINT chk_employees_gender
    CHECK (gender IN ('MALE', 'FEMALE', 'LAKI-LAKI', 'PEREMPUAN')),
  ADD CONSTRAINT chk_employees_marital
    CHECK (
      marital_status IS NULL
      OR marital_status IN (
        'SINGLE',
        'MARRIED',
        'DIVORCED',
        'WIDOWED',
        'BELUM_KAWIN',
        'KAWIN',
        'CERAI_HIDUP',
        'CERAI_MATI'
      )
    );
