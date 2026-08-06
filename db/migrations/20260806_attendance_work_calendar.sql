-- Milestone 7A: kalender kerja/libur Attendance dan seed resmi tahun 2026.
-- Tidak memilih cuti bersama untuk site mana pun dan tidak melakukan backfill histori.

START TRANSACTION;

CREATE TABLE IF NOT EXISTS attendance_calendar_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  event_date DATE NOT NULL,
  event_type VARCHAR(30) NOT NULL,
  name VARCHAR(150) NOT NULL,
  source_document VARCHAR(255) NULL,
  source_url VARCHAR(500) NULL,
  cancelled_at DATETIME(3) NULL,
  cancelled_by BIGINT UNSIGNED NULL,
  cancellation_reason VARCHAR(500) NULL,
  active_key TINYINT GENERATED ALWAYS AS (IF(cancelled_at IS NULL,1,NULL)) STORED,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_calendar_events_uid (uid),
  UNIQUE KEY uq_attendance_calendar_event_active (event_date,event_type,active_key),
  KEY idx_attendance_calendar_event_date (event_date,event_type,cancelled_at),
  CONSTRAINT chk_attendance_calendar_event_type CHECK (event_type IN ('NATIONAL_HOLIDAY','COLLECTIVE_LEAVE')),
  CONSTRAINT fk_attendance_calendar_event_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS attendance_calendar_site_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  business_date DATE NOT NULL,
  rule_type VARCHAR(30) NOT NULL,
  calendar_event_id BIGINT UNSIGNED NULL,
  name VARCHAR(150) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  cancelled_at DATETIME(3) NULL,
  cancelled_by BIGINT UNSIGNED NULL,
  cancellation_reason VARCHAR(500) NULL,
  active_key TINYINT GENERATED ALWAYS AS (IF(cancelled_at IS NULL,1,NULL)) STORED,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_attendance_calendar_site_rules_uid (uid),
  UNIQUE KEY uq_attendance_calendar_site_rule_active (site_id,business_date,rule_type,active_key),
  KEY idx_attendance_calendar_site_date (site_id,business_date,cancelled_at),
  KEY idx_attendance_calendar_site_event (calendar_event_id),
  CONSTRAINT chk_attendance_calendar_site_rule_type CHECK (rule_type IN ('COLLECTIVE_LEAVE','SITE_HOLIDAY','WORKDAY_OVERRIDE')),
  CONSTRAINT fk_attendance_calendar_site_rule_site FOREIGN KEY (site_id) REFERENCES sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_calendar_site_rule_event FOREIGN KEY (calendar_event_id) REFERENCES attendance_calendar_events(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_attendance_calendar_site_rule_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO permissions (uid,code,module,name,description)
VALUES (UUID(),'attendance.manage_calendar','attendance','Kelola Kalender Attendance','Mengelola libur site, override hari kerja, dan pemilihan cuti bersama sesuai akses site.')
ON DUPLICATE KEY UPDATE module=VALUES(module),name=VALUES(name),description=VALUES(description);

INSERT INTO role_permissions (uid,role_id,permission_id)
SELECT UUID(),r.id,p.id FROM roles r JOIN permissions p ON p.code='attendance.manage_calendar'
WHERE r.code IN ('SUPER_ADMIN','HR_OFFICER')
ON DUPLICATE KEY UPDATE uid=role_permissions.uid;

INSERT INTO attendance_calendar_events
  (uid,event_date,event_type,name,source_document,source_url)
VALUES
  (UUID(),'2026-01-01','NATIONAL_HOLIDAY','Tahun Baru 2026 Masehi','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-01-16','NATIONAL_HOLIDAY','Isra Mikraj Nabi Muhammad SAW','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-02-17','NATIONAL_HOLIDAY','Tahun Baru Imlek 2577 Kongzili','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-03-19','NATIONAL_HOLIDAY','Hari Suci Nyepi Tahun Baru Saka 1948','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-03-21','NATIONAL_HOLIDAY','Hari Raya Idul Fitri 1447 H','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-03-22','NATIONAL_HOLIDAY','Hari Raya Idul Fitri 1447 H','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-04-03','NATIONAL_HOLIDAY','Wafat Yesus Kristus','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-04-05','NATIONAL_HOLIDAY','Kebangkitan Yesus Kristus (Paskah)','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-05-01','NATIONAL_HOLIDAY','Hari Buruh Internasional','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-05-14','NATIONAL_HOLIDAY','Kenaikan Yesus Kristus','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-05-27','NATIONAL_HOLIDAY','Hari Raya Idul Adha 1447 H','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-05-31','NATIONAL_HOLIDAY','Hari Raya Waisak 2570 BE','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-06-01','NATIONAL_HOLIDAY','Hari Lahir Pancasila','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-06-16','NATIONAL_HOLIDAY','1 Muharam 1448 H Tahun Baru Islam','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-08-17','NATIONAL_HOLIDAY','Hari Proklamasi Kemerdekaan RI','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-08-25','NATIONAL_HOLIDAY','Maulid Nabi Muhammad SAW','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-12-25','NATIONAL_HOLIDAY','Kelahiran Yesus Kristus','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-02-16','COLLECTIVE_LEAVE','Cuti Bersama Tahun Baru Imlek 2577 Kongzili','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-03-18','COLLECTIVE_LEAVE','Cuti Bersama Hari Suci Nyepi','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-03-20','COLLECTIVE_LEAVE','Cuti Bersama Hari Raya Idul Fitri 1447 H','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-03-23','COLLECTIVE_LEAVE','Cuti Bersama Hari Raya Idul Fitri 1447 H','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-03-24','COLLECTIVE_LEAVE','Cuti Bersama Hari Raya Idul Fitri 1447 H','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-05-15','COLLECTIVE_LEAVE','Cuti Bersama Kenaikan Yesus Kristus','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-05-28','COLLECTIVE_LEAVE','Cuti Bersama Hari Raya Idul Adha 1447 H','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045'),
  (UUID(),'2026-12-24','COLLECTIVE_LEAVE','Cuti Bersama Kelahiran Yesus Kristus','SKB 3 Menteri No. 1497/2025, 2/2025, dan 5/2025','https://jdih.menpan.go.id/dokumen-hukum/keputusan-bersama-menteri-agama-menteri-ketenagakerjaan-dan-menteri-pendayagunaan-aparatur-negara-2045')
ON DUPLICATE KEY UPDATE name=VALUES(name),source_document=VALUES(source_document),source_url=VALUES(source_url);

COMMIT;

DROP PROCEDURE IF EXISTS migrate_attendance_calendar_snapshots;
DELIMITER $$
CREATE PROCEDURE migrate_attendance_calendar_snapshots()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attendance_records' AND COLUMN_NAME='calendar_day_type') THEN
    ALTER TABLE attendance_records ADD COLUMN calendar_day_type VARCHAR(20) NULL AFTER attendance_status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attendance_records' AND COLUMN_NAME='calendar_reason_type') THEN
    ALTER TABLE attendance_records ADD COLUMN calendar_reason_type VARCHAR(30) NULL AFTER calendar_day_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attendance_records' AND COLUMN_NAME='calendar_event_id') THEN
    ALTER TABLE attendance_records ADD COLUMN calendar_event_id BIGINT UNSIGNED NULL AFTER calendar_reason_type;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='attendance_records' AND COLUMN_NAME='calendar_site_rule_id') THEN
    ALTER TABLE attendance_records ADD COLUMN calendar_site_rule_id BIGINT UNSIGNED NULL AFTER calendar_event_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='attendance_records' AND CONSTRAINT_NAME='fk_attendance_calendar_event') THEN
    ALTER TABLE attendance_records ADD CONSTRAINT fk_attendance_calendar_event FOREIGN KEY (calendar_event_id) REFERENCES attendance_calendar_events(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='attendance_records' AND CONSTRAINT_NAME='fk_attendance_calendar_site_rule') THEN
    ALTER TABLE attendance_records ADD CONSTRAINT fk_attendance_calendar_site_rule FOREIGN KEY (calendar_site_rule_id) REFERENCES attendance_calendar_site_rules(id) ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='attendance_records' AND CONSTRAINT_NAME='chk_attendance_calendar_day_type') THEN
    ALTER TABLE attendance_records ADD CONSTRAINT chk_attendance_calendar_day_type CHECK (calendar_day_type IN ('WORKDAY','HOLIDAY','NON_WORKDAY'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='attendance_records' AND CONSTRAINT_NAME='chk_attendance_calendar_reason_type') THEN
    ALTER TABLE attendance_records ADD CONSTRAINT chk_attendance_calendar_reason_type CHECK (calendar_reason_type IN ('SHIFT_WEEKDAY','WEEKLY_OFF','NATIONAL_HOLIDAY','COLLECTIVE_LEAVE','SITE_HOLIDAY','WORKDAY_OVERRIDE'));
  END IF;
  IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='attendance_classification_details' AND CONSTRAINT_NAME='chk_attendance_classification_outcome') THEN
    ALTER TABLE attendance_classification_details DROP CONSTRAINT chk_attendance_classification_outcome;
  END IF;
  ALTER TABLE attendance_classification_details ADD CONSTRAINT chk_attendance_classification_outcome CHECK (outcome IN ('PENDING','APPLIED','SKIPPED_NON_WORKDAY','SKIPPED_HOLIDAY'));
END$$
DELIMITER ;
CALL migrate_attendance_calendar_snapshots();
DROP PROCEDURE migrate_attendance_calendar_snapshots;

SELECT event_type,COUNT(*) total
FROM attendance_calendar_events
WHERE event_date BETWEEN '2026-01-01' AND '2026-12-31' AND cancelled_at IS NULL
GROUP BY event_type;

SELECT COUNT(*) collective_site_selections
FROM attendance_calendar_site_rules
WHERE rule_type='COLLECTIVE_LEAVE' AND cancelled_at IS NULL;
