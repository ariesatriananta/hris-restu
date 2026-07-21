ALTER TABLE employees
  ADD COLUMN rtrw VARCHAR(7) NULL AFTER address,
  ADD COLUMN kelurahan VARCHAR(100) NULL AFTER rtrw,
  ADD COLUMN kecamatan VARCHAR(100) NULL AFTER kelurahan,
  ADD COLUMN email VARCHAR(191) NULL AFTER phone,
  ADD COLUMN join_date_training DATE NULL AFTER join_date,
  ADD COLUMN join_date_borong DATE NULL AFTER join_date_training,
  ADD CONSTRAINT chk_employees_rtrw
    CHECK (rtrw IS NULL OR rtrw REGEXP '^[0-9]{3}/[0-9]{3}$'),
  ADD CONSTRAINT chk_employees_training_join_date
    CHECK (join_date_training IS NULL OR join_date_training >= join_date),
  ADD CONSTRAINT chk_employees_borong_join_date
    CHECK (join_date_borong IS NULL OR join_date_borong >= join_date),
  ADD UNIQUE KEY uq_employees_email (email);
