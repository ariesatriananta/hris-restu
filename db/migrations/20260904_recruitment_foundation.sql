-- Fondasi Rekrutmen - Form Data Pelamar dan pengelolaan kandidat.
--
-- Migration ini hanya menyiapkan struktur data dan hak akses. Belum membuka
-- endpoint publik, belum menerima upload, dan tidak mengubah data karyawan.
-- CREATE TABLE IF NOT EXISTS serta upsert permission membuat migration aman
-- dilanjutkan apabila eksekusi sebelumnya berhenti setelah sebagian DDL.

CREATE TABLE IF NOT EXISTS recruitment_candidates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  application_number VARCHAR(40) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  site_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  national_id_number CHAR(16) NOT NULL,
  family_card_number CHAR(16) NOT NULL,
  gender VARCHAR(10) NOT NULL,
  birth_place VARCHAR(100) NOT NULL,
  birth_date DATE NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(30) NOT NULL,
  email VARCHAR(191) NULL,
  privacy_consent_at DATETIME(3) NOT NULL,
  privacy_notice_version VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'NEW',
  active_national_id_number CHAR(16) GENERATED ALWAYS AS (
    CASE
      WHEN status IN ('NEW','IN_PROGRESS','PASSED','CONVERTED')
        THEN national_id_number
      ELSE NULL
    END
  ) STORED,
  applicant_rejection_reason VARCHAR(500) NULL,
  internal_notes TEXT NULL,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  status_changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  employee_id BIGINT UNSIGNED NULL,
  converted_at DATETIME(3) NULL,
  converted_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recruitment_candidates_uid (uid),
  UNIQUE KEY uq_recruitment_candidates_application_number (application_number),
  UNIQUE KEY uq_recruitment_candidates_idempotency (idempotency_key),
  UNIQUE KEY uq_recruitment_candidates_active_nik (active_national_id_number),
  UNIQUE KEY uq_recruitment_candidates_employee (employee_id),
  KEY idx_recruitment_candidates_site_status_submitted (site_id,status,submitted_at),
  KEY idx_recruitment_candidates_nik_history (national_id_number,submitted_at),
  KEY idx_recruitment_candidates_name (full_name),
  CONSTRAINT chk_recruitment_candidates_nik CHECK (national_id_number REGEXP '^[0-9]{16}$'),
  CONSTRAINT chk_recruitment_candidates_kk CHECK (family_card_number REGEXP '^[0-9]{16}$'),
  CONSTRAINT chk_recruitment_candidates_gender CHECK (gender IN ('MALE','FEMALE')),
  CONSTRAINT chk_recruitment_candidates_phone CHECK (CHAR_LENGTH(TRIM(phone))>=8),
  CONSTRAINT chk_recruitment_candidates_privacy_version CHECK (CHAR_LENGTH(TRIM(privacy_notice_version))>=1),
  CONSTRAINT chk_recruitment_candidates_status CHECK (status IN ('NEW','IN_PROGRESS','PASSED','REJECTED','CONVERTED')),
  CONSTRAINT chk_recruitment_candidates_rejection CHECK (
    (status='REJECTED' AND applicant_rejection_reason IS NOT NULL
      AND CHAR_LENGTH(TRIM(applicant_rejection_reason))>=5)
    OR
    (status<>'REJECTED' AND applicant_rejection_reason IS NULL)
  ),
  CONSTRAINT chk_recruitment_candidates_conversion CHECK (
    (status='CONVERTED' AND converted_at IS NOT NULL)
    OR
    (status<>'CONVERTED' AND converted_at IS NULL)
  ),
  CONSTRAINT fk_recruitment_candidates_site FOREIGN KEY (site_id) REFERENCES sites(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_recruitment_candidates_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_recruitment_candidates_converted_by FOREIGN KEY (converted_by) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recruitment_candidate_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  candidate_id BIGINT UNSIGNED NOT NULL,
  file_id BIGINT UNSIGNED NOT NULL,
  file_kind VARCHAR(20) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recruitment_candidate_files_uid (uid),
  UNIQUE KEY uq_recruitment_candidate_files_kind (candidate_id,file_kind),
  UNIQUE KEY uq_recruitment_candidate_files_file (file_id),
  KEY idx_recruitment_candidate_files_candidate (candidate_id),
  CONSTRAINT chk_recruitment_candidate_files_kind CHECK (file_kind IN ('PHOTO','KTP','KK')),
  CONSTRAINT fk_recruitment_candidate_files_candidate FOREIGN KEY (candidate_id) REFERENCES recruitment_candidates(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_recruitment_candidate_files_file FOREIGN KEY (file_id) REFERENCES files(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tidak memiliki kolom updated_* karena tabel ini menjadi jejak status yang
-- append-only. Perubahan kandidat selalu menambahkan event baru.
CREATE TABLE IF NOT EXISTS recruitment_status_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  uid CHAR(36) NOT NULL,
  candidate_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(20) NULL,
  to_status VARCHAR(20) NOT NULL,
  event_source VARCHAR(20) NOT NULL,
  applicant_reason VARCHAR(500) NULL,
  internal_notes TEXT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_recruitment_status_events_uid (uid),
  UNIQUE KEY uq_recruitment_status_events_idempotency (idempotency_key),
  KEY idx_recruitment_status_events_candidate (candidate_id,occurred_at),
  KEY idx_recruitment_status_events_actor (actor_user_id,occurred_at),
  CONSTRAINT chk_recruitment_status_events_from CHECK (from_status IS NULL OR from_status IN ('NEW','IN_PROGRESS','PASSED','REJECTED','CONVERTED')),
  CONSTRAINT chk_recruitment_status_events_to CHECK (to_status IN ('NEW','IN_PROGRESS','PASSED','REJECTED','CONVERTED')),
  CONSTRAINT chk_recruitment_status_events_source CHECK (event_source IN ('PUBLIC_SUBMISSION','HR_USER','SYSTEM')),
  CONSTRAINT chk_recruitment_status_events_rejection CHECK (
    (to_status='REJECTED' AND applicant_reason IS NOT NULL AND CHAR_LENGTH(TRIM(applicant_reason))>=5)
    OR to_status<>'REJECTED'
  ),
  CONSTRAINT fk_recruitment_status_events_candidate FOREIGN KEY (candidate_id) REFERENCES recruitment_candidates(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_recruitment_status_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

START TRANSACTION;

INSERT INTO permissions(uid,code,module,name,description) VALUES
  (UUID(),'recruitment.view','recruitment','Lihat Rekrutmen','Lihat daftar, detail, status, dan dokumen kandidat sesuai cakupan site.'),
  (UUID(),'recruitment.manage','recruitment','Kelola Rekrutmen','Kelola proses kandidat dan lanjutkan kandidat yang lolos ke Master Karyawan.')
ON DUPLICATE KEY UPDATE
  module=VALUES(module),
  name=VALUES(name),
  description=VALUES(description);

INSERT INTO role_permissions(uid,role_id,permission_id)
SELECT UUID(),r.id,p.id
FROM roles r
JOIN permissions p ON p.module='recruitment'
WHERE r.code IN ('SUPER_ADMIN','HR_OFFICER')
ON DUPLICATE KEY UPDATE uid=role_permissions.uid;

COMMIT;

SELECT table_name
FROM information_schema.tables
WHERE table_schema=DATABASE()
  AND table_name IN (
    'recruitment_candidates',
    'recruitment_candidate_files',
    'recruitment_status_events'
  )
ORDER BY table_name;

SELECT r.code role_code,GROUP_CONCAT(p.code ORDER BY p.code SEPARATOR ', ') recruitment_permissions
FROM roles r
LEFT JOIN role_permissions rp ON rp.role_id=r.id
LEFT JOIN permissions p ON p.id=rp.permission_id AND p.module='recruitment'
WHERE r.code IN ('SUPER_ADMIN','HR_OFFICER')
GROUP BY r.id,r.code
ORDER BY r.code;
