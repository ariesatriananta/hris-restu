-- Seed demo transaksi Produksi Borongan untuk SATU tanggal bisnis.
--
-- Ubah @target_date sebelum menjalankan script. @max_setoran_per_employee
-- menentukan batas setoran demo per pekerja; jumlah aktual 1..batas tersebut
-- ditentukan secara stabil dengan CRC32.
--
-- Hanya pekerja yang lolos aturan Terminal Produksi yang dibuatkan transaksi:
--   1. Attendance berstatus PRESENT pada tanggal dan site yang sama;
--   2. memiliki scan CLOCK_IN SUCCESS yang terhubung ke record Attendance;
--   3. memiliki tepat satu histori employment efektif, allows_production=1,
--      dan basis payroll PIECE_RATE;
--   4. memiliki tepat satu pekerjaan utama aktif tanpa assignment ambigu;
--   5. pekerjaan utama memiliki tepat satu tarif aktif dan satuan aktif;
--   6. site memiliki perangkat USB_SCANNER/TERMINAL aktif dan teraktivasi.
--
-- Script tidak menghapus atau mengubah transaksi manual. Seed aman dijalankan
-- ulang: idempotency_key stabil dan transaksi yang sudah sama tidak diduplikasi.
-- Jika payload seed lama berbeda, script berhenti agar fakta tidak ditimpa.
-- Jalankan hanya pada environment development/uji.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @target_date = DATE('2026-08-07');
SET @max_setoran_per_employee = 3;
SET @seed_version = 'production-demo-one-date-v1';

DROP PROCEDURE IF EXISTS seed_production_one_date;
DELIMITER $$
CREATE PROCEDURE seed_production_one_date()
BEGIN
  DECLARE seed_user_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE inserted_transactions BIGINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_production_one_day_expected;
    DROP TEMPORARY TABLE IF EXISTS tmp_production_one_day_sequences;
    DROP TEMPORARY TABLE IF EXISTS tmp_production_one_day_candidates;
    DROP TEMPORARY TABLE IF EXISTS tmp_production_one_day_attendance;
    RESIGNAL;
  END;

  IF @target_date IS NULL
     OR @seed_version IS NULL
     OR TRIM(@seed_version)=''
     OR @max_setoran_per_employee IS NULL
     OR @max_setoran_per_employee NOT BETWEEN 1 AND 5 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: tanggal, versi, dan batas setoran 1-5 wajib valid.';
  END IF;

  IF @target_date>CURRENT_DATE() THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: tanggal target tidak boleh berada di masa depan.';
  END IF;

  -- Jangan menambah fakta Produksi setelah periode terkait dihitung atau
  -- memiliki snapshot. DRAFT tanpa snapshot masih aman untuk seed demo.
  IF EXISTS (
    SELECT 1
    FROM payroll_periods pp
    WHERE @target_date BETWEEN pp.period_start AND pp.period_end
      AND pp.status NOT IN ('DRAFT','CANCELLED')
  ) OR EXISTS (
    SELECT 1
    FROM payroll_production_details ppd
    WHERE ppd.business_date=@target_date
  ) OR EXISTS (
    SELECT 1
    FROM production_transactions pt
    WHERE pt.business_date=@target_date
      AND pt.payroll_locked_at IS NOT NULL
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: tanggal target sudah dihitung, disnapshot, atau dikunci Payroll.';
  END IF;

  SELECT MIN(u.id) INTO seed_user_id
  FROM users u
  JOIN user_roles ur ON ur.user_id=u.id
  JOIN roles r ON r.id=ur.role_id AND r.code='SUPER_ADMIN'
  WHERE u.status='ACTIVE';

  IF seed_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: Super Admin aktif untuk audit seed tidak ditemukan.';
  END IF;

  START TRANSACTION;

  -- Populasi awal: fakta Hadir dengan bukti scan masuk mentah yang sama persis
  -- dengan gate attendanceContext pada endpoint Terminal Produksi.
  DROP TEMPORARY TABLE IF EXISTS tmp_production_one_day_attendance;
  CREATE TEMPORARY TABLE tmp_production_one_day_attendance AS
  SELECT
    ar.id attendance_record_id,
    ar.employee_id,
    ar.site_id,
    ar.clock_in_at
  FROM attendance_records ar
  WHERE ar.business_date=@target_date
    AND ar.attendance_status='PRESENT'
    AND EXISTS (
      SELECT 1
      FROM attendance_scan_events ase
      WHERE ase.attendance_record_id=ar.id
        AND ase.employee_id=ar.employee_id
        AND ase.site_id=ar.site_id
        AND ase.event_type='CLOCK_IN'
        AND ase.result_status='SUCCESS'
        AND ase.scanned_at>=TIMESTAMP(@target_date)
        AND ase.scanned_at<DATE_ADD(TIMESTAMP(@target_date),INTERVAL 1 DAY)
    );

  ALTER TABLE tmp_production_one_day_attendance
    ADD PRIMARY KEY(attendance_record_id),
    ADD UNIQUE KEY uq_tmp_production_one_day_employee(employee_id),
    ADD KEY idx_tmp_production_one_day_site(site_id);

  -- Kandidat hanya berisi pekerja yang dapat diproses oleh Terminal Produksi.
  -- Pekerjaan yang dipakai adalah pekerjaan utama efektif pada tanggal target.
  DROP TEMPORARY TABLE IF EXISTS tmp_production_one_day_candidates;
  CREATE TEMPORARY TABLE tmp_production_one_day_candidates AS
  SELECT
    e.id employee_id,
    e.uid employee_uid,
    e.employee_number,
    e.full_name employee_name,
    eh.site_id,
    s.code site_code,
    eh.work_group_id,
    attendance.attendance_record_id,
    attendance.clock_in_at,
    assignment.production_job_id,
    job.code job_code,
    job.name job_name,
    rate.id job_rate_id,
    rate.unit_id,
    rate.rate_amount,
    unit.code unit_code,
    unit.decimal_precision,
    device.id device_id,
    1+MOD(
      CRC32(CONCAT(@seed_version,'|count|',e.uid,'|',@target_date)),
      @max_setoran_per_employee
    ) setoran_count
  FROM tmp_production_one_day_attendance attendance
  JOIN employees e ON e.id=attendance.employee_id
  JOIN employee_employment_histories eh
    ON eh.employee_id=e.id
   AND eh.site_id=attendance.site_id
   AND eh.effective_from<=@target_date
   AND (eh.effective_to IS NULL OR eh.effective_to>=@target_date)
  JOIN employee_statuses employee_status
    ON employee_status.id=eh.employee_status_id
   AND employee_status.allows_production=1
  JOIN employee_types employee_type
    ON employee_type.id=eh.employee_type_id
   AND employee_type.payroll_basis='PIECE_RATE'
  JOIN sites s ON s.id=eh.site_id AND s.is_active=1
  JOIN employee_job_assignments assignment
    ON assignment.employee_id=e.id
   AND assignment.site_id=eh.site_id
   AND assignment.is_primary=1
   AND assignment.effective_from<=@target_date
   AND (assignment.effective_to IS NULL OR assignment.effective_to>=@target_date)
  JOIN production_jobs job
    ON job.id=assignment.production_job_id AND job.is_active=1
  JOIN production_job_rates rate
    ON rate.site_id=eh.site_id
   AND rate.production_job_id=assignment.production_job_id
   AND rate.status='ACTIVE'
   AND rate.effective_from<=@target_date
   AND (rate.effective_to IS NULL OR rate.effective_to>=@target_date)
  JOIN work_units unit ON unit.id=rate.unit_id AND unit.is_active=1
  JOIN scan_devices device
    ON device.id=(
      SELECT MIN(active_device.id)
      FROM scan_devices active_device
      WHERE active_device.site_id=eh.site_id
        AND active_device.device_type IN ('USB_SCANNER','TERMINAL')
        AND active_device.is_active=1
        AND active_device.production_activated_at IS NOT NULL
        AND active_device.production_token_hash IS NOT NULL
    )
  WHERE (
    SELECT COUNT(*)
    FROM employee_employment_histories effective_history
    WHERE effective_history.employee_id=e.id
      AND effective_history.effective_from<=@target_date
      AND (effective_history.effective_to IS NULL OR effective_history.effective_to>=@target_date)
  )=1
    AND (
      SELECT COUNT(*)
      FROM employee_job_assignments primary_assignment
      JOIN production_jobs primary_job
        ON primary_job.id=primary_assignment.production_job_id
       AND primary_job.is_active=1
      WHERE primary_assignment.employee_id=e.id
        AND primary_assignment.site_id=eh.site_id
        AND primary_assignment.is_primary=1
        AND primary_assignment.effective_from<=@target_date
        AND (primary_assignment.effective_to IS NULL OR primary_assignment.effective_to>=@target_date)
    )=1
    AND NOT EXISTS (
      SELECT duplicate_assignment.production_job_id
      FROM employee_job_assignments duplicate_assignment
      JOIN production_jobs assigned_job
        ON assigned_job.id=duplicate_assignment.production_job_id
       AND assigned_job.is_active=1
      WHERE duplicate_assignment.employee_id=e.id
        AND duplicate_assignment.site_id=eh.site_id
        AND duplicate_assignment.effective_from<=@target_date
        AND (duplicate_assignment.effective_to IS NULL OR duplicate_assignment.effective_to>=@target_date)
      GROUP BY duplicate_assignment.production_job_id
      HAVING COUNT(*)>1
    )
    AND (
      SELECT COUNT(*)
      FROM production_job_rates effective_rate
      JOIN work_units effective_unit
        ON effective_unit.id=effective_rate.unit_id
       AND effective_unit.is_active=1
      WHERE effective_rate.site_id=eh.site_id
        AND effective_rate.production_job_id=assignment.production_job_id
        AND effective_rate.status='ACTIVE'
        AND effective_rate.effective_from<=@target_date
        AND (effective_rate.effective_to IS NULL OR effective_rate.effective_to>=@target_date)
    )=1;

  ALTER TABLE tmp_production_one_day_candidates
    ADD PRIMARY KEY(employee_id),
    ADD KEY idx_tmp_production_candidate_site(site_id),
    ADD KEY idx_tmp_production_candidate_job(production_job_id);

  DROP TEMPORARY TABLE IF EXISTS tmp_production_one_day_sequences;
  CREATE TEMPORARY TABLE tmp_production_one_day_sequences(
    sequence_no TINYINT UNSIGNED NOT NULL PRIMARY KEY
  ) ENGINE=InnoDB;

  INSERT INTO tmp_production_one_day_sequences(sequence_no)
  VALUES (1),(2),(3),(4),(5);

  DROP TEMPORARY TABLE IF EXISTS tmp_production_one_day_expected;
  CREATE TEMPORARY TABLE tmp_production_one_day_expected AS
  SELECT
    candidate.*,
    sequence.sequence_no,
    CONCAT(
      'PRD-',DATE_FORMAT(@target_date,'%Y%m%d'),'-SEED-',
      UPPER(REPLACE(candidate.employee_uid,'-','')),
      '-',LPAD(sequence.sequence_no,2,'0')
    ) transaction_number,
    CONCAT(
      'SEED-PRD-',DATE_FORMAT(@target_date,'%Y%m%d'),'-',
      candidate.employee_uid,'-',sequence.sequence_no
    ) idempotency_key,
    CAST(NULL AS DATETIME(3)) transaction_at,
    CAST(NULL AS DECIMAL(18,4)) quantity,
    CAST(NULL AS DECIMAL(18,2)) gross_amount
  FROM tmp_production_one_day_candidates candidate
  JOIN tmp_production_one_day_sequences sequence
    ON sequence.sequence_no<=candidate.setoran_count;

  ALTER TABLE tmp_production_one_day_expected
    ADD PRIMARY KEY(employee_id,sequence_no),
    ADD UNIQUE KEY uq_tmp_production_expected_number(transaction_number),
    ADD UNIQUE KEY uq_tmp_production_expected_idempotency(idempotency_key);

  UPDATE tmp_production_one_day_expected expected
  SET
    expected.transaction_at=LEAST(
      DATE_ADD(
        GREATEST(
          COALESCE(expected.clock_in_at,TIMESTAMP(@target_date,'08:00:00')),
          TIMESTAMP(@target_date,'08:00:00')
        ),
        INTERVAL (
          30+((expected.sequence_no-1)*120)+MOD(
            CRC32(CONCAT(
              @seed_version,'|time|',expected.employee_uid,'|',
              @target_date,'|',expected.sequence_no
            )),60
          )
        ) MINUTE
      ),
      TIMESTAMP(@target_date,'23:59:00')
    ),
    expected.quantity=CAST(
      ROUND(
        (
          (25*POW(10,expected.decimal_precision))+
          MOD(
            CRC32(CONCAT(
              @seed_version,'|quantity|',expected.employee_uid,'|',
              @target_date,'|',expected.sequence_no
            )),
            CAST(101*POW(10,expected.decimal_precision) AS UNSIGNED)
          )
        )/POW(10,expected.decimal_precision),
        expected.decimal_precision
      ) AS DECIMAL(18,4)
    );

  UPDATE tmp_production_one_day_expected
  SET gross_amount=ROUND(quantity*rate_amount,2);

  -- Idempotency key boleh mengembalikan transaksi lama hanya bila payload inti
  -- identik. Perbedaan berarti konfigurasi/fakta berubah dan harus diperiksa.
  IF EXISTS (
    SELECT 1
    FROM tmp_production_one_day_expected expected
    JOIN production_transactions existing
      ON existing.idempotency_key=expected.idempotency_key
    WHERE existing.transaction_number<>expected.transaction_number
       OR existing.employee_id<>expected.employee_id
       OR existing.site_id<>expected.site_id
       OR NOT (existing.work_group_id <=> expected.work_group_id)
       OR existing.production_job_id<>expected.production_job_id
       OR existing.unit_id<>expected.unit_id
       OR existing.job_rate_id<>expected.job_rate_id
       OR existing.attendance_record_id<>expected.attendance_record_id
       OR NOT (existing.scan_device_id <=> expected.device_id)
       OR existing.business_date<>@target_date
       OR existing.quantity<>expected.quantity
       OR existing.rate_snapshot<>expected.rate_amount
       OR existing.gross_amount<>expected.gross_amount
       OR existing.status<>'POSTED'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: idempotency key sudah ada dengan payload Produksi berbeda.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_production_one_day_expected expected
    JOIN production_transactions existing
      ON existing.transaction_number=expected.transaction_number
    WHERE existing.idempotency_key IS NULL
       OR existing.idempotency_key<>expected.idempotency_key
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Seed dibatalkan: nomor transaksi seed sudah digunakan transaksi lain.';
  END IF;

  INSERT INTO production_transactions(
    uid,transaction_number,employee_id,site_id,work_group_id,
    production_job_id,unit_id,job_rate_id,attendance_record_id,
    scan_device_id,business_date,transaction_at,quantity,rate_snapshot,
    gross_amount,status,idempotency_key,notes,created_by,updated_by
  )
  SELECT
    UUID(),expected.transaction_number,expected.employee_id,expected.site_id,
    expected.work_group_id,expected.production_job_id,expected.unit_id,
    expected.job_rate_id,expected.attendance_record_id,expected.device_id,
    @target_date,expected.transaction_at,expected.quantity,
    expected.rate_amount,expected.gross_amount,'POSTED',
    expected.idempotency_key,
    'Setoran demo Produksi satu tanggal.',seed_user_id,seed_user_id
  FROM tmp_production_one_day_expected expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM production_transactions existing
    WHERE existing.idempotency_key=expected.idempotency_key
  );

  SET inserted_transactions=ROW_COUNT();

  COMMIT;

  -- Ringkasan utama. Selisih dua metrik Attendance menunjukkan pekerja Hadir
  -- yang belum mempunyai bukti scan masuk sukses dan memang harus ditolak.
  SELECT 'attendance_present' metric,COUNT(*) total
  FROM attendance_records
  WHERE business_date=@target_date AND attendance_status='PRESENT'
  UNION ALL
  SELECT 'attendance_with_successful_clock_in',COUNT(*)
  FROM tmp_production_one_day_attendance
  UNION ALL
  SELECT 'production_ready_employees',COUNT(*)
  FROM tmp_production_one_day_candidates
  UNION ALL
  SELECT 'expected_seed_transactions',COUNT(*)
  FROM tmp_production_one_day_expected
  UNION ALL
  SELECT 'inserted_this_run',inserted_transactions
  UNION ALL
  SELECT 'seed_transactions_after_run',COUNT(*)
  FROM production_transactions
  WHERE idempotency_key LIKE CONCAT(
    'SEED-PRD-',DATE_FORMAT(@target_date,'%Y%m%d'),'-%'
  );

  SELECT
    expected.site_code site,
    expected.job_name pekerjaan,
    COUNT(DISTINCT expected.employee_id) pekerja,
    COUNT(*) setoran,
    SUM(expected.quantity) total_quantity,
    SUM(expected.gross_amount) estimasi_bruto
  FROM tmp_production_one_day_expected expected
  GROUP BY expected.site_code,expected.job_name
  ORDER BY expected.site_code,expected.job_name;

  -- Daftar ini hanya memuat pekerja yang sudah Hadir + scan masuk, tetapi belum
  -- lolos kesiapan Produksi. Hasil kosong berarti semua fakta dasar siap.
  SELECT
    site.code site,
    employee.employee_number,
    employee.full_name,
    CASE
      WHEN (
        SELECT COUNT(*)
        FROM employee_employment_histories history
        WHERE history.employee_id=attendance.employee_id
          AND history.effective_from<=@target_date
          AND (history.effective_to IS NULL OR history.effective_to>=@target_date)
      )<>1 THEN 'Histori employment efektif hilang atau bertumpang-tindih'
      WHEN NOT EXISTS (
        SELECT 1
        FROM employee_employment_histories history
        JOIN employee_statuses status ON status.id=history.employee_status_id
        JOIN employee_types type ON type.id=history.employee_type_id
        WHERE history.employee_id=attendance.employee_id
          AND history.site_id=attendance.site_id
          AND history.effective_from<=@target_date
          AND (history.effective_to IS NULL OR history.effective_to>=@target_date)
          AND status.allows_production=1
          AND type.payroll_basis='PIECE_RATE'
      ) THEN 'Status atau jenis karyawan tidak eligible Produksi Borongan'
      WHEN (
        SELECT COUNT(*)
        FROM employee_job_assignments assignment
        JOIN production_jobs job
          ON job.id=assignment.production_job_id AND job.is_active=1
        WHERE assignment.employee_id=attendance.employee_id
          AND assignment.site_id=attendance.site_id
          AND assignment.is_primary=1
          AND assignment.effective_from<=@target_date
          AND (assignment.effective_to IS NULL OR assignment.effective_to>=@target_date)
      )<>1 THEN 'Pekerjaan utama aktif hilang atau lebih dari satu'
      WHEN EXISTS (
        SELECT duplicate_assignment.production_job_id
        FROM employee_job_assignments duplicate_assignment
        JOIN production_jobs job
          ON job.id=duplicate_assignment.production_job_id AND job.is_active=1
        WHERE duplicate_assignment.employee_id=attendance.employee_id
          AND duplicate_assignment.site_id=attendance.site_id
          AND duplicate_assignment.effective_from<=@target_date
          AND (duplicate_assignment.effective_to IS NULL OR duplicate_assignment.effective_to>=@target_date)
        GROUP BY duplicate_assignment.production_job_id
        HAVING COUNT(*)>1
      ) THEN 'Penugasan pekerjaan aktif bertumpang-tindih'
      WHEN NOT EXISTS (
        SELECT 1
        FROM scan_devices device
        WHERE device.site_id=attendance.site_id
          AND device.device_type IN ('USB_SCANNER','TERMINAL')
          AND device.is_active=1
          AND device.production_activated_at IS NOT NULL
          AND device.production_token_hash IS NOT NULL
      ) THEN 'Perangkat Produksi aktif dan teraktivasi belum tersedia'
      ELSE 'Pekerjaan utama belum memiliki tepat satu tarif aktif dan satuan aktif'
    END alasan_tidak_diproses
  FROM tmp_production_one_day_attendance attendance
  JOIN employees employee ON employee.id=attendance.employee_id
  JOIN sites site ON site.id=attendance.site_id
  LEFT JOIN tmp_production_one_day_candidates candidate
    ON candidate.employee_id=attendance.employee_id
  WHERE candidate.employee_id IS NULL
  ORDER BY site.code,employee.full_name;

  DROP TEMPORARY TABLE IF EXISTS tmp_production_one_day_expected;
  DROP TEMPORARY TABLE IF EXISTS tmp_production_one_day_sequences;
  DROP TEMPORARY TABLE IF EXISTS tmp_production_one_day_candidates;
  DROP TEMPORARY TABLE IF EXISTS tmp_production_one_day_attendance;
END$$
DELIMITER ;

CALL seed_production_one_date();
DROP PROCEDURE seed_production_one_date;
