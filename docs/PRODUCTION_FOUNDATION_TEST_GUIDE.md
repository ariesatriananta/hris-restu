# Panduan Uji — Fondasi Produksi Borongan

## 1. Persiapan database development/staging

Backup database terlebih dahulu. Jalankan berurutan:

1. `db/migrations/20260821_production_foundation.sql`
2. `db/seeds/20260821_production_foundation_demo.sql`

Seed sengaja berhenti bila sudah ada transaksi Produksi atau snapshot Produksi pada Payroll. Jangan menghapus guard tersebut untuk memaksa seed.

Hasil seed yang diharapkan:

- master satuan dan pekerjaan demo tersedia;
- 12 kombinasi tarif referensi tersedia bila sebelumnya belum dibuat;
- pekerja Borongan/Training eligible mendapat satu pekerjaan utama berdasarkan Bagian Produksi;
- tabel `production_transactions` tetap kosong.

Verifikasi SQL:

```sql
SELECT code,name,payroll_basis FROM employee_types
WHERE code IN ('BORONGAN','TRAINING');

SELECT status,COUNT(*) total
FROM production_job_rates
GROUP BY status;

SELECT s.code site,COUNT(*) active_primary_assignments
FROM employee_job_assignments a
JOIN sites s ON s.id=a.site_id
WHERE a.is_primary=1
  AND a.effective_from<='2026-08-01'
  AND (a.effective_to IS NULL OR a.effective_to>='2026-08-01')
GROUP BY s.code;

SELECT COUNT(*) production_transactions
FROM production_transactions;
```

Jalankan seed untuk kedua kalinya. Angka `production_jobs`, `production_rates`, dan `job_assignments` harus tetap sama. Bila bertambah, jangan lanjut ke uji transaksi dan laporkan output verifikasi seed.

## 2. Menjalankan aplikasi lokal

```powershell
pnpm dev
```

Logout lalu login kembali setelah migration permission agar session mengambil permission terbaru.

## 3. Skenario UI Super Admin

### Master Pekerjaan

1. Buka **Produksi Borongan → Master Pekerjaan**.
2. Pastikan kartu readiness Jepara, Semarang, dan Klaten tampil.
3. Tab **Pekerjaan** harus menampilkan pekerjaan demo dan satuan.
4. Tab **Satuan**: tambah satuan uji dengan kode unik, misalnya `TRAY_TEST`.
5. Tab **Penugasan**: filter site, cari karyawan, lalu buat assignment pada periode yang berada di histori kerja aktif.
6. Coba buat assignment utama kedua pada periode sama. API harus menolak overlap.
7. Klik blocker pekerja pada kartu readiness. Daftar harus otomatis membawa
   site, tanggal pemeriksaan, dan jenis masalah dari kartu yang diklik.
8. Uji filter **Jenis Karyawan** dan **Bagian Produksi**. Opsi harus tetap
   lengkap untuk site/tanggal yang dipilih walau hasil tabel sedang dicari atau
   difilter berdasarkan masalah.

### Tarif per Site

1. Buka **Produksi Borongan → Tarif per Site**.
2. Klik **Buat Draft Tarif**, pilih site/pekerjaan, isi tanggal dan nilai.
3. Setelah disimpan, status harus `DRAFT`.
4. Klik **Aktifkan**. Bila mengganti tarif lama, histori lama harus berakhir H-1 dari tanggal tarif baru.
5. Coba buat periode overlap yang ambigu. API harus menolak aktivasi.

## 4. Skenario permission

- `SUPER_ADMIN`: dapat melihat dan mengubah master/tarif/assignment.
- `PRODUCTION_ADMIN`: dapat melihat master/readiness dan mengakses Terminal Setoran, tetapi tombol tambah/aktivasi master tidak tampil dan API `production.manage_master` menolak.
- `HR_OFFICER`, `PAYROLL_FINANCE`, `SITE_SUPERVISOR`: akses baca sesuai site access.
- `DIRECTOR`: akses baca lintas site, tidak dapat mengubah master.
- User tanpa `production.view` tidak melihat menu baca Produksi dan route harus berakhir Forbidden.

## 5. Automated checks

```powershell
pnpm --dir apps/api exec vitest run src/routes/production-foundation.integration.test.ts
pnpm exec tsc -p apps/api/tsconfig.json --pretty false
pnpm exec tsc -b --pretty false
pnpm build
git diff --check
```

Integration test mencakup permission sebelum query database, scope site,
filter masalah/jenis/Bagian Produksi, facets, pemetaan hitungan pekerjaan utama,
akses baca Director, tarif selalu Draft, dan eligibility histori assignment
`PIECE_RATE`.

## 6. Uji Terminal Setoran Fase 2A

Persiapan satu karyawan uji:

1. histori employment hari ini tepat satu, site sesuai, `allows_production=1`,
   dan basis jenis karyawan `PIECE_RATE`;
2. memiliki tepat satu assignment pekerjaan utama aktif dan tarif `ACTIVE`;
3. lakukan scan Masuk Attendance melalui terminal sampai record berstatus
   `PRESENT` dan event `CLOCK_IN/SUCCESS` tersimpan;
4. perangkat Produksi bertipe `USB_SCANNER` atau `TERMINAL`, aktif, dan memiliki
   kode aktivasi yang belum kedaluwarsa.

Skenario UI/API:

1. Buka **Produksi Borongan → Terminal Setoran**, aktivasi perangkat, lalu scan
   barcode karyawan.
2. Pastikan pekerjaan utama terpilih otomatis dan pekerjaan tambahan aktif
   masih dapat dipilih.
3. Isi kuantitas sesuai presisi satuan dan kirim. Transaksi harus tampil di
   daftar terbaru dan halaman **Transaksi Produksi**.
4. Kirim ulang request dengan `idempotencyKey` dan payload sama. UID transaksi
   harus sama dan jumlah row tidak bertambah.
5. Kirim key sama dengan quantity atau pekerjaan berbeda. API harus `409`.
6. Kirim key baru untuk karyawan sama. Transaksi kedua harus berhasil.
7. Uji karyawan berstatus Hadir tanpa event raw `CLOCK_IN/SUCCESS`, lalu event
   raw ada tetapi status bukan `PRESENT`. Keduanya harus ditolak.
8. Uji user site Jepara terhadap perangkat atau transaksi site lain. API harus
   menolak atau tidak menampilkan data tersebut.

Verifikasi SQL setelah satu setoran berhasil:

```sql
SELECT
  pt.transaction_number,pt.business_date,pt.quantity,
  pt.rate_snapshot,pt.gross_amount,pt.status,pt.idempotency_key,
  ar.attendance_status,ase.event_type,ase.result_status
FROM production_transactions pt
JOIN attendance_records ar ON ar.id=pt.attendance_record_id
JOIN attendance_scan_events ase
  ON ase.attendance_record_id=ar.id
 AND ase.employee_id=pt.employee_id
 AND ase.site_id=pt.site_id
 AND ase.event_type='CLOCK_IN'
 AND ase.result_status='SUCCESS'
WHERE pt.uid='<UID_TRANSAKSI>';
```

Automated checks Fase 2A:

```powershell
pnpm --dir apps/api exec vitest run src/lib/production-transaction-policy.test.ts src/routes/production-transactions.integration.test.ts
pnpm exec tsc -p apps/api/tsconfig.json --pretty false
```

## 7. Batas Fase 2A

Koreksi/void, Rekap Produksi, dan Payroll Produksi belum termasuk Fase 2A.
Jangan mengubah row `production_transactions` langsung lewat SQL. Koreksi nanti
harus memakai endpoint Fase 2B agar histori revisi dan audit tetap utuh.
