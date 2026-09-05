-- Selesaikan SELURUH koreksi dan klasifikasi Attendance berstatus PENDING
-- untuk SATU tanggal bisnis dengan hasil demo acak yang stabil.
-- Jalankan hanya pada environment development/uji.
--
-- Keputusan berasal dari UID + tanggal + @seed_version. Kandidat yang tidak
-- aman diterapkan otomatis ditolak. Setelah berhasil, finalisasi ulang tanggal
-- ini dari Monitoring Harian.
-- PERHATIAN: sesuai tujuan percepatan demo, seluruh PENDING pada tanggal target
-- diproses, termasuk data yang dibuat lewat UI; gunakan hanya pada DB demo/uji.

SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

SET @target_date = DATE('2026-08-07');
SET @approval_percent = 75;
SET @seed_version = 'attendance-resolve-pending-one-date-v1';

DROP PROCEDURE IF EXISTS resolve_attendance_pending_one_date;
DELIMITER $$
CREATE PROCEDURE resolve_attendance_pending_one_date()
BEGIN
  DECLARE reviewer_user_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE corrections_found BIGINT DEFAULT 0;
  DECLARE corrections_approved BIGINT DEFAULT 0;
  DECLARE classifications_found BIGINT DEFAULT 0;
  DECLARE classifications_approved BIGINT DEFAULT 0;
  DECLARE invalidated_finalizations BIGINT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    DROP TEMPORARY TABLE IF EXISTS tmp_attendance_pending_sites;
    DROP TEMPORARY TABLE IF EXISTS tmp_attendance_pending_classifications;
    DROP TEMPORARY TABLE IF EXISTS tmp_attendance_pending_corrections;
    RESIGNAL;
  END;

  IF @target_date IS NULL
     OR @approval_percent IS NULL
     OR @approval_percent NOT BETWEEN 0 AND 100
     OR @seed_version IS NULL
     OR TRIM(@seed_version)='' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Penyelesaian dibatalkan: tanggal, approval 0-100, dan versi seed wajib valid.';
  END IF;

  IF @target_date>CURRENT_DATE() THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Penyelesaian dibatalkan: tanggal target tidak boleh berada di masa depan.';
  END IF;

  SELECT MIN(u.id) INTO reviewer_user_id
  FROM users u
  JOIN user_roles ur ON ur.user_id=u.id
  JOIN roles r ON r.id=ur.role_id AND r.code='SUPER_ADMIN'
  WHERE u.status='ACTIVE';

  IF reviewer_user_id IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Penyelesaian dibatalkan: Super Admin aktif untuk audit seed tidak ditemukan.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM attendance_daily_finalization_runs latest
    WHERE latest.business_date=@target_date
      AND latest.id=(
        SELECT MAX(candidate.id)
        FROM attendance_daily_finalization_runs candidate
        WHERE candidate.site_id=latest.site_id
          AND candidate.business_date=latest.business_date
      )
      AND latest.status='RUNNING'
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Penyelesaian dibatalkan: finalisasi Attendance tanggal target sedang berjalan.';
  END IF;

  -- Fakta yang sudah masuk Payroll tidak boleh diubah oleh seed demo.
  IF EXISTS (
    SELECT 1 FROM payroll_periods pp
    WHERE @target_date BETWEEN pp.period_start AND pp.period_end
      AND pp.status NOT IN ('DRAFT','CANCELLED')
  ) OR EXISTS (
    SELECT 1
    FROM payroll_runs run
    JOIN payroll_periods pp ON pp.id=run.payroll_period_id
    WHERE @target_date BETWEEN pp.period_start AND pp.period_end
      AND run.status='PROCESSING'
  ) OR EXISTS (
    SELECT 1
    FROM payroll_attendance_summaries summary
    JOIN payroll_employee_results result
      ON result.id=summary.payroll_employee_result_id
    JOIN payroll_periods pp ON pp.id=result.payroll_period_id
    WHERE @target_date BETWEEN pp.period_start AND pp.period_end
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT='Penyelesaian dibatalkan: tanggal target sedang atau sudah disnapshot Payroll.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS tmp_attendance_pending_corrections;
  CREATE TEMPORARY TABLE tmp_attendance_pending_corrections AS
  SELECT
    correction.id correction_id,
    correction.uid correction_uid,
    correction.attendance_record_id,
    correction.correction_type,
    correction.reason correction_reason,
    record.site_id,
    record.attendance_status old_attendance_status,
    record.clock_in_at old_clock_in_at,
    record.clock_out_at old_clock_out_at,
    CASE WHEN correction.correction_type IN ('CLOCK_IN','BOTH')
      THEN correction.new_clock_in_at ELSE record.clock_in_at END proposed_clock_in_at,
    CASE WHEN correction.correction_type IN ('CLOCK_OUT','BOTH')
      THEN correction.new_clock_out_at ELSE record.clock_out_at END proposed_clock_out_at,
    CASE
      WHEN correction.correction_type='STATUS'
        THEN COALESCE(correction.new_status,record.attendance_status)
      WHEN record.attendance_status='ABSENT'
       AND (correction.new_clock_in_at IS NOT NULL OR correction.new_clock_out_at IS NOT NULL)
        THEN 'PRESENT'
      ELSE record.attendance_status
    END proposed_attendance_status,
    shift.start_time,shift.end_time,shift.crosses_midnight,
    shift.late_tolerance_minutes,shift.early_leave_tolerance_minutes,
    CAST(0 AS SIGNED) calculated_late_minutes,
    CAST(0 AS SIGNED) calculated_early_leave_minutes,
    CAST(NULL AS SIGNED) calculated_worked_minutes,
    CAST(CASE WHEN MOD(CRC32(CONCAT(
      @seed_version,'|correction|',correction.uid,'|',@target_date
    )),100)<@approval_percent THEN 'APPROVED' ELSE 'REJECTED' END AS CHAR(20)) decision,
    CAST(NULL AS CHAR(255)) forced_rejection_reason
  FROM attendance_corrections correction
  JOIN attendance_records record ON record.id=correction.attendance_record_id
  LEFT JOIN shifts shift ON shift.id=record.shift_id AND shift.site_id=record.site_id
  WHERE record.business_date=@target_date
    AND correction.approval_status='PENDING';

  ALTER TABLE tmp_attendance_pending_corrections
    ADD PRIMARY KEY (correction_id),
    ADD KEY idx_tmp_pending_correction_record (attendance_record_id),
    ADD KEY idx_tmp_pending_correction_site (site_id),
    ADD KEY idx_tmp_pending_correction_decision (decision);

  SELECT COUNT(*) INTO corrections_found FROM tmp_attendance_pending_corrections;

  -- Kandidat approval yang melanggar invariant endpoint dipaksa REJECTED.
  UPDATE tmp_attendance_pending_corrections candidate
  SET decision='REJECTED',forced_rejection_reason='Usulan jam masuk/pulang tidak valid.'
  WHERE decision='APPROVED'
    AND proposed_clock_in_at IS NOT NULL
    AND proposed_clock_out_at IS NOT NULL
    AND proposed_clock_out_at<proposed_clock_in_at;

  UPDATE tmp_attendance_pending_corrections candidate
  SET decision='REJECTED',forced_rejection_reason='Attendance sudah memiliki klasifikasi terapan.'
  WHERE decision='APPROVED' AND EXISTS (
    SELECT 1 FROM attendance_classification_details detail
    WHERE detail.attendance_record_id=candidate.attendance_record_id
      AND detail.outcome='APPLIED'
  );

  UPDATE tmp_attendance_pending_corrections candidate
  SET decision='REJECTED',
      forced_rejection_reason='Status sudah dipakai setoran produksi dan tidak boleh diubah.'
  WHERE decision='APPROVED'
    AND proposed_attendance_status<>'PRESENT'
    AND EXISTS (
      SELECT 1 FROM production_transactions production
      WHERE production.attendance_record_id=candidate.attendance_record_id
        AND production.status='POSTED'
    );

  -- Bila ada data ambigu, hanya koreksi ber-ID terkecil yang boleh diterapkan.
  UPDATE tmp_attendance_pending_corrections candidate
  SET decision='REJECTED',forced_rejection_reason='Ada koreksi PENDING lain pada record yang sama.'
  WHERE decision='APPROVED' AND EXISTS (
    SELECT 1 FROM attendance_corrections other
    WHERE other.attendance_record_id=candidate.attendance_record_id
      AND other.approval_status='PENDING'
      AND other.id<candidate.correction_id
  );

  UPDATE tmp_attendance_pending_corrections candidate
  SET
    calculated_late_minutes=CASE
      WHEN start_time IS NULL OR proposed_clock_in_at IS NULL THEN 0
      WHEN TIMESTAMPDIFF(MINUTE,TIMESTAMP(@target_date,start_time),proposed_clock_in_at)
           >late_tolerance_minutes
        THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,TIMESTAMP(@target_date,start_time),proposed_clock_in_at))
      ELSE 0 END,
    calculated_early_leave_minutes=CASE
      WHEN end_time IS NULL OR proposed_clock_out_at IS NULL THEN 0
      WHEN TIMESTAMPDIFF(MINUTE,proposed_clock_out_at,
        CASE WHEN crosses_midnight=1
          THEN DATE_ADD(TIMESTAMP(@target_date,end_time),INTERVAL 1 DAY)
          ELSE TIMESTAMP(@target_date,end_time) END
      )>early_leave_tolerance_minutes
        THEN GREATEST(0,TIMESTAMPDIFF(MINUTE,proposed_clock_out_at,
          CASE WHEN crosses_midnight=1
            THEN DATE_ADD(TIMESTAMP(@target_date,end_time),INTERVAL 1 DAY)
            ELSE TIMESTAMP(@target_date,end_time) END))
      ELSE 0 END,
    calculated_worked_minutes=CASE
      WHEN proposed_clock_in_at IS NULL OR proposed_clock_out_at IS NULL THEN NULL
      ELSE GREATEST(0,TIMESTAMPDIFF(MINUTE,proposed_clock_in_at,proposed_clock_out_at)) END
  WHERE decision='APPROVED';

  DROP TEMPORARY TABLE IF EXISTS tmp_attendance_pending_classifications;
  CREATE TEMPORARY TABLE tmp_attendance_pending_classifications AS
  SELECT
    request.id request_id,request.uid request_uid,request.employee_id,
    request.site_id,request.start_date,request.end_date,request.classification_type,
    request.reason classification_reason,detail.id detail_id,shift.id shift_id,
    CAST(CASE WHEN JSON_CONTAINS(
      COALESCE(assignment.work_days_json,JSON_ARRAY()),
      CONCAT(WEEKDAY(@target_date)+1),'$'
    )=1 THEN 'WORKDAY' ELSE 'NON_WORKDAY' END AS CHAR(20)) calendar_day_type,
    CAST(CASE WHEN JSON_CONTAINS(
      COALESCE(assignment.work_days_json,JSON_ARRAY()),
      CONCAT(WEEKDAY(@target_date)+1),'$'
    )=1 THEN 'SHIFT_WEEKDAY' ELSE 'WEEKLY_OFF' END AS CHAR(30)) calendar_reason_type,
    CAST(NULL AS UNSIGNED) calendar_event_id,
    CAST(NULL AS UNSIGNED) calendar_site_rule_id,
    CAST(CASE WHEN MOD(CRC32(CONCAT(
      @seed_version,'|classification|',request.uid,'|',@target_date
    )),100)<@approval_percent THEN 'APPROVED' ELSE 'REJECTED' END AS CHAR(20)) decision,
    CAST(NULL AS CHAR(255)) forced_rejection_reason
  FROM attendance_classification_requests request
  LEFT JOIN attendance_classification_details detail
    ON detail.request_id=request.id AND detail.business_date=@target_date
  LEFT JOIN employee_shift_assignments assignment
    ON assignment.id=detail.shift_assignment_id
   AND assignment.employee_id=request.employee_id
   AND assignment.effective_from<=@target_date
   AND (assignment.effective_to IS NULL OR assignment.effective_to>=@target_date)
  LEFT JOIN shifts shift
    ON shift.id=assignment.shift_id
   AND shift.site_id=request.site_id
   AND shift.is_active=1
  WHERE request.start_date<=@target_date
    AND request.end_date>=@target_date
    AND request.approval_status='PENDING';

  ALTER TABLE tmp_attendance_pending_classifications
    ADD PRIMARY KEY (request_id),
    ADD KEY idx_tmp_pending_classification_site (site_id),
    ADD KEY idx_tmp_pending_classification_decision (decision);

  SELECT COUNT(*) INTO classifications_found
  FROM tmp_attendance_pending_classifications;

  -- Seed ini hanya boleh menerapkan satu tanggal. Request rentang tetap ditutup
  -- sebagai REJECTED agar finalisasi tanggal target tidak lagi terblokir.
  UPDATE tmp_attendance_pending_classifications
  SET decision='REJECTED',
      forced_rejection_reason='Request rentang tanggal tidak diterapkan oleh seed satu tanggal.'
  WHERE start_date<>@target_date OR end_date<>@target_date;

  -- Precedence kalender: nasional, cuti bersama, libur site, override kerja.
  UPDATE tmp_attendance_pending_classifications candidate
  JOIN attendance_calendar_events event
    ON event.event_date=@target_date
   AND event.event_type='NATIONAL_HOLIDAY' AND event.cancelled_at IS NULL
  SET candidate.calendar_day_type='HOLIDAY',
      candidate.calendar_reason_type='NATIONAL_HOLIDAY',
      candidate.calendar_event_id=event.id,
      candidate.calendar_site_rule_id=NULL;

  UPDATE tmp_attendance_pending_classifications candidate
  JOIN attendance_calendar_site_rules rule
    ON rule.site_id=candidate.site_id AND rule.business_date=@target_date
   AND rule.rule_type='COLLECTIVE_LEAVE' AND rule.cancelled_at IS NULL
  SET candidate.calendar_day_type='HOLIDAY',
      candidate.calendar_reason_type='COLLECTIVE_LEAVE',
      candidate.calendar_event_id=rule.calendar_event_id,
      candidate.calendar_site_rule_id=rule.id;

  UPDATE tmp_attendance_pending_classifications candidate
  JOIN attendance_calendar_site_rules rule
    ON rule.site_id=candidate.site_id AND rule.business_date=@target_date
   AND rule.rule_type='SITE_HOLIDAY' AND rule.cancelled_at IS NULL
  SET candidate.calendar_day_type='HOLIDAY',
      candidate.calendar_reason_type='SITE_HOLIDAY',
      candidate.calendar_event_id=rule.calendar_event_id,
      candidate.calendar_site_rule_id=rule.id;

  UPDATE tmp_attendance_pending_classifications candidate
  JOIN attendance_calendar_site_rules rule
    ON rule.site_id=candidate.site_id AND rule.business_date=@target_date
   AND rule.rule_type='WORKDAY_OVERRIDE' AND rule.cancelled_at IS NULL
  SET candidate.calendar_day_type='WORKDAY',
      candidate.calendar_reason_type='WORKDAY_OVERRIDE',
      candidate.calendar_event_id=rule.calendar_event_id,
      candidate.calendar_site_rule_id=rule.id;

  UPDATE tmp_attendance_pending_classifications candidate
  SET decision='REJECTED',
      forced_rejection_reason='Detail, shift, atau hari kerja klasifikasi tidak valid.'
  WHERE decision='APPROVED'
    AND (detail_id IS NULL OR shift_id IS NULL OR calendar_day_type<>'WORKDAY');

  UPDATE tmp_attendance_pending_classifications candidate
  SET decision='REJECTED',
      forced_rejection_reason='Karyawan sudah memiliki fakta Attendance tanggal target.'
  WHERE decision='APPROVED' AND EXISTS (
    SELECT 1 FROM attendance_records record
    WHERE record.employee_id=candidate.employee_id
      AND record.business_date=@target_date
  );

  UPDATE tmp_attendance_pending_classifications candidate
  SET decision='REJECTED',
      forced_rejection_reason='Karyawan sudah memiliki klasifikasi terapan tanggal target.'
  WHERE decision='APPROVED' AND EXISTS (
    SELECT 1 FROM attendance_classification_details applied
    WHERE applied.employee_id=candidate.employee_id
      AND applied.business_date=@target_date
      AND applied.outcome='APPLIED'
  );

  UPDATE tmp_attendance_pending_classifications candidate
  SET decision='REJECTED',
      forced_rejection_reason='Ada klasifikasi PENDING lain untuk karyawan yang sama.'
  WHERE decision='APPROVED' AND EXISTS (
    SELECT 1 FROM attendance_classification_requests other
    WHERE other.employee_id=candidate.employee_id
      AND other.start_date=@target_date AND other.end_date=@target_date
      AND other.approval_status='PENDING' AND other.id<candidate.request_id
  );

  DROP TEMPORARY TABLE IF EXISTS tmp_attendance_pending_sites;
  CREATE TEMPORARY TABLE tmp_attendance_pending_sites (
    site_id BIGINT UNSIGNED NOT NULL PRIMARY KEY
  ) ENGINE=InnoDB;

  INSERT IGNORE INTO tmp_attendance_pending_sites (site_id)
  SELECT site_id FROM tmp_attendance_pending_corrections
  UNION
  SELECT site_id FROM tmp_attendance_pending_classifications;

  START TRANSACTION;

  UPDATE attendance_records record
  JOIN tmp_attendance_pending_corrections candidate
    ON candidate.attendance_record_id=record.id AND candidate.decision='APPROVED'
  SET
    record.attendance_status=candidate.proposed_attendance_status,
    record.clock_in_at=candidate.proposed_clock_in_at,
    record.clock_out_at=candidate.proposed_clock_out_at,
    record.late_minutes=candidate.calculated_late_minutes,
    record.early_leave_minutes=candidate.calculated_early_leave_minutes,
    record.worked_minutes=candidate.calculated_worked_minutes,
    record.clock_in_device_id=CASE WHEN candidate.correction_type IN ('CLOCK_IN','BOTH') THEN NULL ELSE record.clock_in_device_id END,
    record.clock_in_source=CASE WHEN candidate.correction_type IN ('CLOCK_IN','BOTH') THEN 'CORRECTION' ELSE record.clock_in_source END,
    record.clock_out_device_id=CASE WHEN candidate.correction_type IN ('CLOCK_OUT','BOTH') THEN NULL ELSE record.clock_out_device_id END,
    record.clock_out_source=CASE WHEN candidate.correction_type IN ('CLOCK_OUT','BOTH') THEN 'CORRECTION' ELSE record.clock_out_source END,
    record.is_corrected=1,record.updated_by=reviewer_user_id;

  UPDATE attendance_corrections correction
  JOIN tmp_attendance_pending_corrections candidate
    ON candidate.correction_id=correction.id
  SET correction.approval_status=candidate.decision,
      correction.reviewed_by=reviewer_user_id,
      correction.reviewed_at=CURRENT_TIMESTAMP(3),
      correction.review_notes=CASE WHEN candidate.decision='APPROVED'
        THEN 'Disetujui otomatis untuk percepatan demo satu tanggal.'
        ELSE COALESCE(candidate.forced_rejection_reason,
          'Ditolak otomatis sebagai variasi hasil demo satu tanggal.') END,
      correction.applied_at=CASE WHEN candidate.decision='APPROVED'
        THEN CURRENT_TIMESTAMP(3) ELSE NULL END,
      correction.updated_by=reviewer_user_id;

  SELECT COUNT(*) INTO corrections_approved
  FROM tmp_attendance_pending_corrections WHERE decision='APPROVED';

  INSERT INTO attendance_records (
    uid,employee_id,site_id,shift_id,business_date,attendance_status,
    calendar_day_type,calendar_reason_type,calendar_event_id,
    calendar_site_rule_id,notes,created_by,updated_by
  )
  SELECT UUID(),employee_id,site_id,shift_id,@target_date,classification_type,
    calendar_day_type,calendar_reason_type,calendar_event_id,
    calendar_site_rule_id,classification_reason,reviewer_user_id,reviewer_user_id
  FROM tmp_attendance_pending_classifications
  WHERE decision='APPROVED';

  UPDATE attendance_classification_details detail
  JOIN tmp_attendance_pending_classifications candidate
    ON candidate.detail_id=detail.id AND candidate.decision='APPROVED'
  JOIN attendance_records record
    ON record.employee_id=candidate.employee_id
   AND record.business_date=@target_date
  SET detail.attendance_record_id=record.id,detail.outcome='APPLIED',
      detail.notes=NULL,detail.updated_by=reviewer_user_id;

  UPDATE attendance_classification_requests request
  JOIN tmp_attendance_pending_classifications candidate
    ON candidate.request_id=request.id
  SET request.approval_status=candidate.decision,
      request.reviewed_by=reviewer_user_id,
      request.reviewed_at=CURRENT_TIMESTAMP(3),
      request.review_notes=CASE WHEN candidate.decision='APPROVED'
        THEN 'Disetujui otomatis untuk percepatan demo satu tanggal.'
        ELSE COALESCE(candidate.forced_rejection_reason,
          'Ditolak otomatis sebagai variasi hasil demo satu tanggal.') END,
      request.updated_by=reviewer_user_id;

  SELECT COUNT(*) INTO classifications_approved
  FROM tmp_attendance_pending_classifications WHERE decision='APPROVED';

  -- Jejak audit setara keputusan review dari UI.
  INSERT INTO audit_logs (
    uid,user_id,site_id,module,action,table_name,record_id,record_uid,
    description,reason,before_data,after_data,request_id,ip_address,
    user_agent,created_by,updated_by
  )
  SELECT UUID(),reviewer_user_id,site_id,'ATTENDANCE',
    CASE WHEN decision='APPROVED' THEN 'APPROVE' ELSE 'REJECT' END,
    'attendance_corrections',correction_id,correction_uid,
    CASE WHEN decision='APPROVED' THEN 'Menerapkan koreksi Attendance demo.'
      ELSE 'Menolak koreksi Attendance demo.' END,
    COALESCE(forced_rejection_reason,correction_reason),
    JSON_OBJECT('approvalStatus','PENDING'),JSON_OBJECT('approvalStatus',decision),
    CONCAT('SEED-ATT-RESOLVE-',DATE_FORMAT(@target_date,'%Y%m%d')),
    '127.0.0.1','HRIS Attendance Resolve Pending One Day Seed',
    reviewer_user_id,reviewer_user_id
  FROM tmp_attendance_pending_corrections;

  INSERT INTO audit_logs (
    uid,user_id,site_id,module,action,table_name,record_id,record_uid,
    description,reason,before_data,after_data,request_id,ip_address,
    user_agent,created_by,updated_by
  )
  SELECT UUID(),reviewer_user_id,site_id,'ATTENDANCE',
    CASE WHEN decision='APPROVED' THEN 'APPROVE' ELSE 'REJECT' END,
    'attendance_classification_requests',request_id,request_uid,
    CASE WHEN decision='APPROVED' THEN 'Menerapkan klasifikasi Attendance demo.'
      ELSE 'Menolak klasifikasi Attendance demo.' END,
    COALESCE(forced_rejection_reason,classification_reason),
    JSON_OBJECT('approvalStatus','PENDING'),JSON_OBJECT('approvalStatus',decision),
    CONCAT('SEED-ATT-RESOLVE-',DATE_FORMAT(@target_date,'%Y%m%d')),
    '127.0.0.1','HRIS Attendance Resolve Pending One Day Seed',
    reviewer_user_id,reviewer_user_id
  FROM tmp_attendance_pending_classifications;

  -- Tandai hasil finalisasi lama tidak berlaku untuk seluruh site terdampak.
  INSERT INTO attendance_daily_finalization_runs (
    uid,site_id,business_date,trigger_type,status,grace_minutes,reason,
    summary,warnings,requested_by,started_at,finished_at,created_by,updated_by
  )
  SELECT UUID(),latest.site_id,latest.business_date,'MANUAL','SKIPPED',60,
    'Workflow PENDING Attendance diselesaikan untuk demo satu tanggal.',
    JSON_OBJECT('invalidatedByDemoPendingResolution',TRUE),
    JSON_ARRAY('Finalisasi perlu dijalankan ulang setelah workflow diselesaikan.'),
    reviewer_user_id,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3),
    reviewer_user_id,reviewer_user_id
  FROM attendance_daily_finalization_runs latest
  JOIN tmp_attendance_pending_sites target ON target.site_id=latest.site_id
  WHERE latest.business_date=@target_date
    AND latest.id=(
      SELECT MAX(previous.id)
      FROM attendance_daily_finalization_runs previous
      WHERE previous.site_id=latest.site_id
        AND previous.business_date=latest.business_date
    )
    AND latest.status='SUCCEEDED';
  SET invalidated_finalizations=ROW_COUNT();

  COMMIT;

  DROP TEMPORARY TABLE tmp_attendance_pending_sites;
  DROP TEMPORARY TABLE tmp_attendance_pending_classifications;
  DROP TEMPORARY TABLE tmp_attendance_pending_corrections;

  SELECT
    @target_date target_date,
    corrections_found,
    corrections_approved,
    corrections_found-corrections_approved corrections_rejected,
    classifications_found,
    classifications_approved,
    classifications_found-classifications_approved classifications_rejected,
    invalidated_finalizations finalizations_invalidated,
    (SELECT COUNT(*)
       FROM attendance_corrections correction
       JOIN attendance_records record ON record.id=correction.attendance_record_id
      WHERE record.business_date=@target_date
        AND correction.approval_status='PENDING') pending_corrections_remaining,
    (SELECT COUNT(*)
       FROM attendance_classification_requests request
      WHERE request.start_date<=@target_date AND request.end_date>=@target_date
        AND request.approval_status='PENDING') pending_classifications_remaining,
    'Lanjutkan finalisasi ulang dari Monitoring Harian.' next_action;
END$$
DELIMITER ;

CALL resolve_attendance_pending_one_date();
DROP PROCEDURE resolve_attendance_pending_one_date;
