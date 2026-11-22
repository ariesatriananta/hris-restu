# Rencana cleansing demo sebelum go-live

Audit kode/schema 22 November 2026. Owner menyetujui pembuatan SQL untuk
cleansing SELURUH SITE; eksekusi dilakukan Owner setelah review.
Metadata/FK dan referensi aset database target sudah diperiksa read-only.
Tidak ada perubahan data pada database aplikasi maupun objek R2 oleh agen.
Sumber: HRIS_PT_RESTU_SCHEMA_MYSQL.sql, HRIS_BUSINESS_RULES.md,
EMPLOYEE_BATCH_DELETE.md, dan cleanup di routes/employees.ts.

## Keputusan lanjutan Owner

- Persiapan import legacy: hanya kolom B Excel menjadi sumber Employee ID;
  kolom AQ diabaikan. ID kosong direncanakan memakai nomor khusus LEG-KLT,
  tanpa mengambil sequence registrasi normal. Mapping/import belum dieksekusi.
- Join date Borong mengikuti tanggal borong; Training mengikuti tanggal training.
  Dua tanggal sumber tetap dipertahankan. Untuk arsip legacy nonaktif/resign
  yang tidak memiliki tanggal, Owner menyetujui NULL, tanpa tanggal rekaan.
  Migration: `db/migrations/20261122_employee_legacy_nullable_join_date.sql`.
  Validasi tanggal wajib pada UI/API biasa tetap berlaku; unknown date ditampilkan
  sebagai tanda kosong. Sequence join_date tetap NOT NULL. Migration disiapkan,
  bukan dieksekusi oleh agen. Master LEGACY_UNKNOWN dan SQL import disiapkan
  terpisah setelah audit mapping; pengecualian nullable bukan izin aktivasi arsip.
  Hasil persiapan final 23 November: lihat
  [EMPLOYEE_KLATEN_IMPORT_RUNBOOK.md](EMPLOYEE_KLATEN_IMPORT_RUNBOOK.md).

- Rekrutmen demo ikut dihapus, termasuk kandidat, relasi file dan status events.
- Metadata files dan objek R2 demo juga ingin dibersihkan, dengan pengecualian
  logo/template/aset konfigurasi. Sebelum menghapus metadata, simpan manifest
  bucket + object key target dan daftar file yang wajib dipertahankan.
- Logo perusahaan dirujuk system_settings melalui JSON logoFileUid ke files.uid;
  uploader menaruhnya pada <R2_KEY_PREFIX>settings/company-logo/.
- File template dirujuk document_templates.template_file_id ke files.id.
  File upload umum bisa berada langsung pada root prefix, sehingga folder saja
  tidak cukup untuk membedakan template dari dokumen demo. Aset statis repo
  tidak menjadi target cleansing bucket/database.
- Sequence berada pada employee_number_sequences (site_id, join_date,
  last_sequence). Pertahankan sampai Excel diterima dan strategi nomor disepakati.
  Import harus merekonsiliasi sequence agar registrasi berikutnya tidak bentrok.
- Scope dikunci Owner: SELURUH SITE, termasuk rekrutmen demo. Setelah itu
  hanya data Klaten terbaru yang akan diimport untuk pilot awal.

## Batas target yang harus dikunci

- Seluruh data operasional lama dianggap demo sesuai persetujuan Owner.
- Dataset cutoff dari client berupa spreadsheet atau SQL? Nomor karyawan lama
  harus dipetakan sebelum import; jangan mengasumsikan ID database lama cocok.
- Konfirmasi schema database target melalui information_schema sebelum membuat
  SQL DELETE; schema repo belum membuktikan seluruh migrasi di server identik.

## SQL siap review

File: `db/maintenance/20261122_demo_cleansing_all_sites.sql`.
Ini maintenance sekali pakai, bukan migration/deployment otomatis.

1. Backup database lengkap dahulu. Gunakan koneksi baru pada SQL client dan
   pilih database target. Script membutuhkan izin CREATE ROUTINE.
2. Isi `@cleansing_expected_database` dengan nama persis database tersebut.
   Biarkan mode `PREVIEW`, lalu jalankan SELURUH file sebagai script.
3. Periksa jumlah tiap tabel. Ekspor hasil `DELETE_METADATA_ONLY` sebagai CSV
   untuk manifest file; simpan bersama backup di luar git. Hasil `KEEP_ASSET`
   menunjukkan file yang dilindungi. Jangan hapus R2 berdasarkan preview.
4. Tutup akses penulisan aplikasi, rekrutmen publik dan hentikan worker/cron.
   Pastikan tidak ada proses Payroll/Attendance/cron RUNNING/PROCESSING.
   Status lama yang tersangkut harus diperiksa, jangan otomatis diubah.
5. Ubah mode menjadi `EXECUTE`, kedua konfirmasi menjadi `1`, dan isi
   `@cleansing_expected_employees` dari jumlah employees hasil PREVIEW.
   Jalankan SELURUH file lagi. Berhasil ditandai `CLEANSING_COMMITTED`.
6. File otomatis COMMIT hanya setelah validasi berhasil; error di routine
   membatalkan perubahan data dengan ROLLBACK. Jangan menjalankan sebagian
   perintah DELETE di luar routine dan jangan mematikan FK checks.
7. Simpan hasil counts sesudah cleansing. Jangan jalankan EXECUTE lagi sesudah
   import; import Excel dibahas dan disiapkan terpisah bersama Owner.

SQL mencakup 53 tabel operasional dan cleanup selektif tabel files. Template,
referensi file dari tabel yang dipertahankan, referensi UID/path pada settings
dan konten/config template serta jalur aset/logo dilindungi. Seluruh master,
konfigurasi, sequence, audit lama dan cron log dipertahankan; satu audit reset
ditambahkan. Data pribadi demo dalam snapshot audit lama tetap ada.

Script tidak mengakses R2: semua objek, termasuk orphan yang tidak tercatat
di files, tetap ada. Manifest bukan perintah hapus bucket. Bucket lama dipakai
aplikasi lain dan tidak boleh dikosongkan. Cleanup R2 menjadi langkah terpisah
setelah hasil SQL committed dan kebutuhan restore diputuskan.

### Verifikasi SQL

- Routine dikompilasi dan diuji pada MariaDB 10.4.32 terisolasi dengan schema
  repo dan data sintetis, bukan data karyawan nyata.
- Preview mempertahankan data dan mengembalikan SQL_SAFE_UPDATES ke nilai awal.
- Salah database, konfirmasi belum lengkap, jumlah karyawan berubah, proses
  aktif, serta dependency baru di luar daftar diblokir.
- Error sintetis disisipkan di akhir routine uji: seluruh DELETE dan pemutusan
  current_run_id ter-rollback, termasuk file, kandidat, attendance dan produksi.
- Eksekusi sukses mengosongkan seluruh tabel operasional; lima file sintetis
  (logo, template FK, settings UID, konten template, FK tabel yang dipertahankan)
  tetap ada dan dua file demo dibersihkan. Sequence tetap dan audit reset tercatat.
- FK aktual database aplikasi diperiksa read-only; urutan rencana sesuai.
- MySQL 8 belum diuji pada server MySQL terpisah. SQL dijalankan oleh Owner,
  sehingga tidak ada klaim database aplikasi telah bersih.

## 1. Payroll: data hasil proses, bukan master/policy

Target data demo pada tabel berikut:

```text
payroll_periods
payroll_runs
payroll_employee_results
payroll_period_policy_snapshots
payroll_period_company_snapshots
payroll_period_manual_components
payroll_period_manual_component_revisions
payroll_bpjs_monthly_settlements
payroll_employee_bpjs_details
payroll_production_details
payroll_production_rate_details
payroll_time_details
payroll_monthly_summaries
payroll_monthly_daily_details
payroll_training_production_details
payroll_attendance_summaries
payroll_employee_component_details
payroll_approvals
payroll_workflow_actions
payroll_output_audits
```

Ini daftar inventaris, bukan urutan DELETE. Hapus anak sebelum induk;
payroll_periods.current_run_id harus dilepas untuk memutus siklus dengan
payroll_runs. payroll_employee_bpjs_details harus dibersihkan sebelum settlement.
Periode/run yang sedang diproses tidak boleh berlomba dengan cleansing.

## 2. Produksi: transaksi dan turunannya

```text
production_transactions
production_transaction_pairs
production_transaction_qc
production_transaction_qc_defects
production_transaction_rate_details
production_transaction_revisions
```

Hapus detail defect sebelum header QC, kemudian semua dependensi transaksi
sebelum transaksi. Revisi memiliki relasi transaksi asal dan pengganti;
pair memiliki relasi Linting dan Batil. Status VOID tetap termasuk data demo.

## 3. Attendance: fakta, permohonan, scan, dan hasil finalisasi

```text
attendance_records
attendance_scan_events
attendance_corrections
attendance_classification_requests
attendance_classification_details
attendance_daily_finalization_runs
```

Hapus detail klasifikasi sebelum request/record. Sertakan event scan gagal
yang employee_id/attendance_record_id-nya NULL menggunakan lingkup site yang
disepakati, bukan hanya join ke employees. Finalisasi terkait harus ikut reset
agar status proses demo tidak tertinggal.

## 4. Karyawan dan data administratif per orang

```text
employees
employee_employment_histories
scheduled_employee_mutations
scheduled_employee_status_changes
employee_contracts
employee_contract_lifecycle_events
employee_salary_histories
employee_salary_history_revisions
employee_daily_rate_histories
employee_daily_rate_revisions
employee_bpjs_enrollments
employee_bpjs_enrollment_revisions
employee_shift_assignments
employee_job_assignments
employee_job_assignment_revisions
employee_payroll_components
employee_documents
```

Semua merupakan data orang yang lama, termasuk assignment dan jadwal masa
depan. Jangan meninggalkan jadwal demo yang bisa dijalankan cron setelah import.
Hapus revisi/lifecycle/jadwal sebelum induknya. Histori kerja, shift dan pekerjaan
yang benar harus dibuat ulang melalui alur import/onboarding yang sesuai.

## 5. Data pendukung: perlu dipilah

| Tabel | Perlakuan |
| --- | --- |
| recruitment_candidates, recruitment_candidate_files, recruitment_status_events | Hapus hanya kandidat demo beserta dependensinya jika disetujui. Kandidat CONVERTED mengunci employees; batch-delete normal hanya melepas employee_id dan tetap menyimpan kandidat. Jika kandidat nyata dipertahankan, perlu rencana relasi yang jelas. |
| generated_documents | Bersihkan hasil generate demo, pertahankan template. Batch-delete karyawan normal hanya melepas employee_id. |
| files | Jangan kosongkan. Foto/dokumen demo dipilah lewat referensi; logo, template, lampiran kandidat nyata dan file lain yang masih dirujuk tetap ada. |
| audit_logs | Simpan untuk jejak migrasi/reset; jika arsip demo ingin dipisah, jadikan keputusan terpisah. Audit menyimpan snapshot, sehingga masih bisa berisi data demo setelah reset. |
| cron_runs | Boleh dipertahankan sebagai log teknis; bukan master dan bukan syarat reset fakta. |
| employee_number_sequences | Pertahankan dulu. Rekonsiliasi terhadap format dan nomor dataset client melalui mekanisme generator/import; jangan otomatis reset ke nol. |
| user_sessions | Tidak wajib dihapus; logout/relogin saat pembukaan kembali jika diperlukan. |

Penghapusan metadata files tidak menghapus objek R2 otomatis. Penghapusan R2
merupakan tahap terpisah setelah referensi dan backup diverifikasi; jangan hapus
seluruh prefix karena bisa berisi aset konfigurasi yang dipakai aplikasi.

## Yang dipertahankan

- sites, departments, positions, work_groups, employee_types, employee_statuses,
  contract_types.
- users, roles, permissions, role_permissions, user_roles, user_site_access,
  user_production_module_access, system_settings.
- production_modules, production_sections, production_module_sections,
  production_module_category_histories.
- production_jobs, work_units, production_job_rates, production_job_rate_tiers,
  production_job_rate_revisions, production_quantity_deduction_policies.
- production_brands, production_brand_category_histories, production_defects.
- shifts, scan_devices, attendance_calendar_events, attendance_calendar_site_rules.
- payroll_component_types, payroll_policy_versions, payroll_policy_revisions,
  payroll_bpjs_policies, payroll_bpjs_policy_revisions, site_minimum_wages,
  site_minimum_wage_revisions, site_bpjs_settings, site_bpjs_setting_revisions.
- document_templates dan file template/aset yang masih digunakan.

Jangan memakai wildcard DELETE/TRUNCATE payroll_* atau production_*: di dalamnya
ada master dan konfigurasi yang memang harus dipertahankan.

## Urutan pelaksanaan yang disarankan

1. Kunci scope dan periksa dataset client serta schema/count database target.
2. Backup database lengkap dan pertahankan objek R2 yang dirujuk backup.
3. Hentikan sementara penulisan pengguna, submit rekrutmen publik, dan cron
   yang bisa menulis data selama jendela cleansing/import.
4. Buat SQL preview jumlah target, dependency check dan DELETE eksplisit dengan
   transaksi. Payroll -> Produksi -> Attendance -> administratif Karyawan ->
   employees. Rekrutmen/generate document ditangani sebelum employees sesuai scope.
5. Tetap aktifkan FK checks; hentikan bila ada dependency yang belum dipetakan.
   Untuk scope site, pertimbangkan histori transfer dan relasi lintas site:
   current_site_id saja tidak cukup untuk menentukan seluruh target.
6. Verifikasi master/config tidak berubah, target habis sesuai preview dan tidak
   ada orphan. Import data Klaten terbaru melalui pemetaan master yang benar.
7. Cocokkan jumlah/NIK/nomor karyawan, jenis/status, tanggal masuk, penempatan,
   histori awal, kebutuhan kontrak, pekerjaan utama dan shift. Data Training
   jangan otomatis dianggap Borongan.
8. Uji alur minimum memakai karyawan yang disepakati, aktifkan kembali proses,
   lalu ambil backup baseline go-live. Jangan hapus ulang data nyata sesudah ini.

Fitur hapus batch normal memang memblokir dependensi Payroll/Attendance/Produksi.
Jangan melonggarkan validasi aplikasi hanya untuk cleansing demo satu kali.
