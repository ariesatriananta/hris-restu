# Import legacy Klaten — pilot 23 November 2026

## Hasil persiapan

SQL pribadi hasil generate berada di:
`artifacts/klaten-import/20261123_klaten_employee_import.sql` (sekitar 15 MB).
Folder artifacts diabaikan Git. Jangan commit, kirim ke log, atau sertakan
identitas dari file ini pada screenshot. `summary.json` berisi agregat dan
nomor baris adjustment, tanpa nilai identitas.

| Data | Jumlah |
| --- | ---: |
| Karyawan | 3.725 |
| Aktif / arsip | 395 / 3.330 |
| Nomor arsip LEG-KLT | 685 |
| Tanggal masuk tidak diketahui (NULL) | 685 |
| Kontrak PKWT aktif / expired | 395 / 190 |
| Total kontrak dan event snapshot lifecycle | 585 masing-masing |
| Snapshot employment baseline | 395 |
| Shift / pekerjaan utama | 395 masing-masing |
| Kelompok tanggal sequence nomor lama | 388 |

Seluruh karyawan aktif merupakan Borongan. Sumber ID hanya kolom B, AQ diabaikan.
Nomor historis dipertahankan; LEG-KLT tidak memakai generator nomor biasa.
NIK aktif diprioritaskan. Pada kelompok NIK konflik yang hanya berisi arsip,
field NIK utama semua anggota dikosongkan; nilai sumber tetap pada notes legacy.
Field NIK utama total terisi 3.192 record setelah validasi/penanganan konflik.

Shift BORONGAN_DEFAULT 06:00–15:00 berlaku mulai 2026-11-23, work_days_json
`[1,2,3,4,5]` (Senin–Jumat). Assignment tidak memiliki tanggal akhir.
Sabtu/Minggu tetap bisa hadir melalui mekanisme scanner non-workday yang sudah
ada; status kerja, waktu terminal, assignment dan kalender tetap divalidasi.
Setoran memerlukan Attendance PRESENT serta pekerjaan/tarif efektif.

Pekerjaan utama sesuai bagian; pasangan Linting–Batil dipilih pada transaksi,
bukan pasangan karyawan permanen. Tidak dibuatkan assignment tambahan.

Kontrak dibuat berantai dari join_date: 12 bulan, akhir sehari sebelum kontrak
berikutnya. Yang mencakup 23 November 2026 ACTIVE, sebelumnya EXPIRED. Nomor
kontrak mengikuti format aplikasi `PKWT/RSIASLO-HR/NNN/ROMAWI/TAHUN` dan memakai
urutan bersama per site/bulan. Kontrak diberi notes/terms_json rekonstruksi
disetujui Owner, signed_date dan issued_file_id tetap NULL. Tidak dibuat
snapshot dokumen siap cetak/tanda tangan secara fiktif; cetak membutuhkan
snapshot melalui workflow yang berlaku.

Employment, shift dan pekerjaan mulai baseline pilot, bukan mundur ke tanggal
masuk atau kontrak lama. Ini keputusan cutover import satu kali, bukan perubahan
aturan onboarding normal. Arsip tidak mendapat kontrak/assignment/histori
employment bertanggal karangan dan tidak eligible absensi/setoran.

## Jalankan oleh Owner

1. Backup DB lengkap setelah cleansing, simpan bersama sumber Excel dan SQL.
2. Deploy perbaikan kode yang menyertai import: nullable read model, aturan fase
   Training -> Borong dan generator nomor lintas tanggal/site historis. UI/API
   biasa tetap wajib join date. Pastikan environment SERVER
   `ATTENDANCE_GO_LIVE_DATE=2026-11-23`; environment lokal sudah terverifikasi.
3. Migration nullable join_date sebelumnya sudah terverifikasi YES. Jalankan
   SEKALI `db/migrations/20261123_employee_legacy_import_prerequisites.sql`
   untuk CHECK fase tanggal dan master LEGACY_UNKNOWN nonaktif. Ini ditujukan
   database MariaDB 10.4 existing, bukan menjalankan ulang schema utama.
4. Buka SQL pribadi hasil generate. Pilih DB target pada koneksi baru, isi
   `@klt_expected_database` dengan nama persis. Biarkan `@klt_mode='PREVIEW'`.
   Jalankan SELURUH file sebagai SCRIPT agar DELIMITER dan staging termuat.
   Membutuhkan CREATE ROUTINE, temporary tables dan hak tulis saat EXECUTE.
5. Periksa hasil agregat sesuai tabel di atas. PREVIEW tidak mengubah data
   aplikasi (hanya routine sementara dan temp tables). Tutup koneksi bila
   selesai untuk menghapus staging pribadi dari sesi.
6. Hentikan writer aplikasi/rekrutmen, worker dan semua cron. Jangan menjalankan
   import berbarengan dengan registrasi/scan atau lifecycle cron.
7. Edit variabel DI FILE yang sama: `@klt_mode='EXECUTE'`,
   `@klt_backup_confirmed=1`, `@klt_writers_stopped=1`. Jalankan SELURUH file lagi.
   Marker sukses `KLATEN_IMPORT_COMMITTED` berarti COMMIT selesai. Error pada
   routine me-ROLLBACK seluruh insert karyawan, kontrak, assignment dan sequence.
8. File yang sama aman terhadap replay: marker hash sumber mengembalikan
   `ALREADY_IMPORTED_NO_CHANGES`. Data yang diubah manual tidak ditimpa.
   Jika marker ada tetapi data baseline hilang, script berhenti untuk review.
   Tidak ada mode merge/upsert employee. Jangan cleansing ulang setelah import.
9. Periksa hasil di bawah. Aktifkan kembali proses, lalu uji satu alur nyata
   karyawan aktif yang disepakati: scan masuk -> setoran -> scan pulang.
   Test di browser/perangkat live baru dinyatakan lulus setelah langkah ini.

Tidak ada file R2/foto yang diunduh atau disalin. Tidak ada attendance/setoran/
payroll yang di-seed oleh import ini. Master/tarif/config lain tidak diperbarui.

## Verifikasi setelah eksekusi (read-only)

```sql
SELECT es.code,COUNT(*) total FROM employees e
JOIN employee_statuses es ON es.id=e.employee_status_id GROUP BY es.code;
-- ACTIVE 395, INACTIVE 722, RESIGNED 2608.
SELECT status,COUNT(*) total FROM employee_contracts GROUP BY status;
-- ACTIVE 395, EXPIRED 190.
SELECT COUNT(*) total FROM employee_shift_assignments; -- 395
SELECT COUNT(*) total FROM employee_job_assignments;   -- 395
SELECT COUNT(*) total FROM employee_employment_histories; -- 395
SELECT COUNT(*) total FROM employees WHERE join_date IS NULL; -- 685
SELECT code,name,is_active FROM employee_types WHERE code='LEGACY_UNKNOWN';
-- LEGACY_UNKNOWN / - / 0. Jangan diaktifkan.
SELECT COUNT(*) blank_barcode FROM employees
WHERE barcode IS NULL OR barcode<>employee_number; -- 0
```

Pada UI periksa label jenis arsip `-`, tanggal unknown `—`, 395 aktif memiliki
modul/bagian, kontrak aktif, shift dan pekerjaan utama. Opsi jenis operasional
tetap empat jenis lama; LEGACY_UNKNOWN tidak ditambahkan ke pilihan UI/API.
Form biasa tidak bisa menyimpan arsip yang tanggal/jenisnya belum lengkap;
lengkapi lewat rencana koreksi terpisah, jangan mengisi tanggal rekaan.

26 pendidikan `D1/D3` tidak ditentukan D1 atau D3; field utama NULL dengan nilai
asli tersimpan di notes. Pada 56 arsip, END DATE sebelum join_date sehingga
resign_date utama NULL dan nilai asli tetap tersimpan. Bagian `KEMAS` pada 22
arsip juga tidak ditebak sebagai Kemas 1/2. Notes memuat sumber kolom 1–42 dan
baris Excel agar keputusan normalisasi bisa ditelusuri, termasuk field sumber
yang tidak mempunyai kolom aplikasi. Jangan membuka notes pada screenshot publik.

## Generate dan pengujian ulang oleh developer

```text
pnpm exec node scripts/klaten-legacy-import-core.test.mjs
pnpm exec node scripts/generate-klaten-legacy-import.mjs
```

Generator offline tidak memuat .env, menghubungi database, atau mengambil URL
lampiran Excel. UID, marker, payload dan nomor kontrak deterministik untuk hash
file sumber yang sama. Regenerate mengembalikan mode PREVIEW dan nama DB kosong;
jangan regenerate file yang sedang direview/akan dieksekusi tanpa memeriksa ulang.

Uji integrasi SQL: `scripts/test-klaten-legacy-import.mjs` pada MariaDB disposable
127.0.0.1:33479, database khusus `hris_klaten_import_scratch`, data SINTETIS saja.
Jangan arahkan test server/skrip ke DB aplikasi. Script mengabaikan DATABASE_URL.
Varian `--trigger-barcode` menguji barcode berbasis trigger seperti DB existing;
tanpa flag memakai generated column. Tidak memakai data pribadi sebagai fixture.

Teruji: migration fase, preview tanpa insert, pengembalian SQL_SAFE_UPDATES,
guard database/backup/tarif, late error rollback, commit, arsip tanpa assignment,
kontrak tanpa jeda, weekdays, replay tanpa duplikasi dan generator nomor yang
tetap menghindari ID lama setelah karyawan pindah site/berbeda join_date.
Kompilasi frontend/API, lint dan regresi API terkait juga dijalankan.
Database aplikasi belum diimport oleh agen.

## Perapian dept/posisi setelah import

Setelah Owner menjalankan import dan mengisi dept/posisi langsung di `employees`,
gunakan `db/maintenance/20261123_klaten_import_placement_cleanup.sql` sebagai
follow-up terpisah. Jangan jalankan ulang import untuk merapikan penempatan.

Kesepakatan: 395 aktif memakai Produksi/Operator Produksi; 3.330 arsip memiliki
dept/posisi NULL karena sumber Excel tidak menyediakan data tersebut. Selaraskan
395 histori INITIAL baseline dan lengkapi snapshot jabatan 585 kontrak rekonstruksi.
Tidak menambah histori/kontrak baru. Modul/bagian sumber, shift, pekerjaan, nomor,
tanggal, status dan isi sumber legacy tetap dipertahankan.

1. Backup database dan gunakan koneksi baru, tanpa transaksi lain yang terbuka.
2. Isi `@klt_cleanup_database` dengan nama database target persis.
3. Biarkan mode `PREVIEW` dan jalankan **seluruh file sebagai script**.
4. Untuk kondisi setelah update manual Owner, ekspektasi preview:
   `active_profiles_to_update=0`, `archive_profiles_to_clear=3330`,
   `baseline_histories_to_update=395`, `contract_snapshots_to_fill=585`.
   Master yang ditampilkan harus Produksi/Operator Produksi; identifikasi memakai
   kode master, bukan mengandalkan angka ID yang kebetulan sama.
5. Jika cocok, hentikan writer aplikasi/cron. Ganti mode menjadi `EXECUTE`,
   `@klt_cleanup_backup_confirmed=1` dan `@klt_cleanup_writers_stopped=1`.
   Jalankan seluruh file lagi. Sukses: `KLATEN_PLACEMENT_CLEANUP_COMMITTED`.
6. Jalankan PREVIEW lagi: empat angka perubahan harus 0. Eksekusi ulang pada
   kondisi yang sama menghasilkan `ALREADY_TIDY_NO_CHANGES`.

Script menolak scope/status/histori yang berubah, penempatan lain, kontrak yang
sudah ditandatangani/dicetak, snapshot bertentangan, serta data attendance,
produksi atau payroll yang sudah dipakai. Jika ditolak, jangan menghapus guard;
perlu review kondisi terbaru. PREVIEW membuat routine/temporary table untuk
pemeriksaan, tetapi tidak mengubah data aplikasi. EXECUTE memakai transaksi dan
menambah satu audit agregat tanpa identitas karyawan bila ada perubahan.

Teruji dengan data sintetis pada MariaDB 10.4.32 terpisah melalui
`node scripts/test-klaten-placement-cleanup.mjs`: preview tanpa perubahan,
guard database/konfirmasi/snapshot, rollback error di akhir, hasil penempatan,
snapshot kontrak, replay tanpa perubahan, dan pemulihan SQL_SAFE_UPDATES.
Test hanya memakai server disposable 127.0.0.1:33479; tidak membaca DATABASE_URL.

## Dokumen KTP/KK dari Drive

Follow-up pengaitan link Excel tanpa migrasi file fisik tersedia di
[EMPLOYEE_LEGACY_DRIVE_DOCUMENTS.md](EMPLOYEE_LEGACY_DRIVE_DOCUMENTS.md).
Jalankan migration sumber dokumen dulu, lalu owner-run SQL link dalam mode
PREVIEW sebelum EXECUTE. Tidak perlu menjalankan import karyawan ulang.

## Koreksi Nonaktif menjadi calon Rekrutmen — 25 November 2026

Client mengonfirmasi 722 sumber NON AKTIF belum pernah bekerja. Ini mengoreksi
klasifikasi sebelumnya; 395 Aktif dan 2.608 Resign tetap menjadi karyawan.
Jangan memakai kondisi seluruh non-ACTIVE atau seluruh LEGACY_UNKNOWN.

Preflight read-only menemukan 621 LEGACY_UNKNOWN + 101 Training; tidak ada
kontrak, histori employment, shift, pekerjaan, attendance, produksi atau payroll
pada kelompok tersebut. Ada 1.436 dokumen Drive (718 KTP + 718 KK), milik 718
orang. Empat calon belum memiliki dokumen. Semua belum mempunyai foto profil.
NIK field utama 140 kosong/tidak valid; 127 di antaranya masih punya nilai valid
pada sumber asli yang dahulu dikarantina karena konflik. Tidak memulihkannya
otomatis: ada 26 kelompok NIK sumber berulang (63 calon), dan NIK enam calon
beririsan dengan karyawan aktif. Identitas wajib diverifikasi sebelum konversi.

Urutan Owner:

1. Backup DB dan hentikan semua API writer serta cron. Gunakan koneksi baru
   dengan autocommit=1, FK aktif, tanpa transaksi lain yang terbuka.
2. Jalankan `db/migrations/20261125_recruitment_legacy_candidates.sql` seluruhnya.
   DDL autocommit; migration menambah dukungan snapshot legacy, field nullable
   khusus legacy dan dokumen Drive. Tidak memindahkan data karyawan.
3. Deploy API/frontend yang mendukungnya, tetapi writer tetap dihentikan sampai
   SQL pemindahan selesai. Jangan membuka versi API lama ke schema baru.
4. Di `db/maintenance/20261125_klaten_inactive_to_recruitment.sql`, isi
   `@klt_move_database` dengan nama database persis. Biarkan mode PREVIEW dan
   jalankan seluruh file. Hasil harus 722 calon dan 1.436 dokumen. PREVIEW tidak
   mengubah data aplikasi, tetapi memerlukan izin routine/temporary table.
5. Jika cocok, ubah mode EXECUTE, backup_confirmed=1 dan writers_stopped=1.
   Jalankan seluruh file lagi. Transaksi memverifikasi snapshot lengkap,
   kandidat NEW, dokumen dan event sebelum menghapus sumber karyawan/dokumen.
   Error menggulung seluruh DML; tidak mematikan FK atau menghapus transaksi.
6. Hasil sukses `KLATEN_INACTIVE_MOVED_TO_RECRUITMENT_COMMITTED`. Replay setelah
   sukses menghasilkan `ALREADY_MOVED_NO_CHANGES`. Bila ditolak, jangan menghapus
   guard atau mengubah angka scope supaya lolos; periksa perubahan sumber.
7. Aktifkan API/cron lalu cek Rekrutmen: 722 kandidat Baru berlabel Data migrasi;
   tanggal pengajuan yang tidak diketahui kosong, bukan tanggal migrasi.
   Master karyawan sumber tersisa 3.003 (395 Aktif + 2.608 Resign), di luar
   pendaftaran operasional baru setelah cutoff. Dokumen dan transaksi kelompok
   yang dipertahankan tidak berubah.

HR dapat melengkapi/mengganti tautan KTP/KK legacy melalui detail kandidat.
Tautan harus file Google Drive yang valid; tidak menimpa berkas R2. Lanjutkan
status seperti alur normal hingga Lolos, kemudian lengkapi data inti, tanggal
mulai kerja dan penempatan pada form konversi. Foto profil tidak wajib khusus
legacy; tambahkan melalui Ubah data karyawan setelah konversi jika diperlukan.
Karyawan hasil konversi berstatus Nonaktif dan menjalani kontrak/onboarding
normal, bukan mendapat pengecualian arsip dari metadata import lama.

Snapshot berisi seluruh kolom asli employee dan employee_documents. Tidak
memalsukan NIK, nomor KK, HP, consent, tanggal pengajuan, atau file R2. Rollback
setelah COMMIT membutuhkan backup atau SQL pemulihan yang direview tersendiri;
jangan menghapus kandidat yang sudah diproses untuk mengulang migrasi.

Verifikasi implementasi 25 November: uji MariaDB 10.4.32 terpisah memakai data
sintetis lulus untuk fresh schema, upgrade/replay migration, validasi kandidat
normal, snapshot immutable, preview, perubahan scope/relasi, rollback setelah
delete, pemindahan 722/1.436, sequence, replay pemindahan serta DOWN yang aman.
Server uji sudah dihentikan; DB aplikasi tidak dimutasi.

Kompilasi frontend/API dan lint lulus; 8 tes utils serta 3 tes render halaman
konversi lulus. Regresi API: 1.356 tes lulus dan 2 dilewati; satu tes stress rate
limiter 10.000 identitas melewati deadline default 5 detik. Ketiga tes limiter
lulus saat dijalankan ulang dengan `--testTimeout=30000`, tanpa perubahan pada
implementasi limiter, kuota, Turnstile atau asersi pengujian.
