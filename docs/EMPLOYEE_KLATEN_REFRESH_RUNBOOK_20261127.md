# Refresh Klaten cutoff 26 November 2026

Status: paket SQL selesai digenerate dan lolos rehearsal utuh pada MariaDB lokal terisolasi. Belum dijalankan pada DB aplikasi.
Gender kosong pada sheet DATABASE KARYAWAN baris 3096 dikonfirmasi Owner sebagai Perempuan. Mapping mencatat override, tanpa mengubah Excel atau menghilangkan nilai sumber aslinya.

## Keputusan

- Sumber: `docs/excel-source/Database Klaten - 20261126.xlsx` versi SHA256 `23072fdc7ad10b231390dd2ba71c54407d56aefc2042e67c177757dbaf4613da`.
- Master karyawan: 3.095, terdiri dari 543 ACTIVE, 2.544 INACTIVE, 8 RESIGNED.
- Rekrutmen: 678 NEW; 12 baris ditahan. Daftar baris dan penyesuaian ada di audit serta summary lokal.
- Join: Training memakai J, Borong K, Harian/Bulanan L. ID/barcode memakai B; kolom helper AS diabaikan.
- Baseline employment/shift/pekerjaan 23 November 2026. Semua 543 aktif memakai 06:00-15:00 Senin-Jumat.
- 518 Borong/Training mendapat pekerjaan produksi utama; 25 staf memakai jabatan sumber dan tidak mendapat modul/pekerjaan produksi.
- Produksi SKT dipetakan ke departemen Produksi. Kantor & Umum/Kantor dan Umum disatukan ke Kantor & Umum. Jabatan staf dibuat sebagai master baru jika belum tersedia; master existing tidak ditimpa.
- Borong PKWT dan Training TRAINING, durasi 12 bulan berantai hingga periode yang mencakup cutoff 26 November. Sebanyak 22 staf PKWT dengan durasi sama; 3 PKWTT tanpa tanggal akhir.
- Dokumen KTP/KK tetap berupa tautan Drive. Tidak menyalin, mengunduh atau menghapus file R2.
- Metadata sumber utuh disimpan pada provenance. Kontrak import bukan file dokumen bertanda tangan. Tanggal/identitas yang unknown tidak dibuat-buat.

## Jumlah hasil yang diverifikasi

| Kelompok | Jumlah |
| --- | ---: |
| Karyawan | 3.095 |
| Aktif / Nonaktif / Resign | 543 / 2.544 / 8 |
| Kontrak aktif / expired | 543 / 217 |
| Total kontrak | 760 |
| Employment / shift aktif | 543 / 543 |
| Pekerjaan produksi utama | 518 |
| Dokumen karyawan Drive | 5.443 |
| Kandidat NEW | 678 |
| Kandidat ditahan | 12 |
| Dokumen kandidat Drive | 1.224 |

Paket import menambah 14 jabatan staf dan satu departemen Kantor & Umum jika belum ada; profil aktif, histori baseline dan snapshot jabatan kontrak langsung selaras. Tidak perlu mengulang SQL perapian import lama.

## Urutan eksekusi Owner

1. Backup DB sudah dikonfirmasi Owner. Simpan backup sampai UAT selesai. Pertahankan master, user, konfigurasi, file/aset, sequence, audit dan cron log.
2. Deploy API pendukung provenance baru. Build/test tidak menjalankan SQL refresh otomatis. Hentikan semua writer API, form publik, worker dan cron selama cleansing hingga verifikasi akhir. Jangan gunakan scan saat refresh berlangsung.
3. Buka `db/maintenance/20261127_klaten_refresh_cleansing.sql` pada koneksi database target yang tepat. Isi `@klt_refresh_database`; mode tetap PREVIEW. Jalankan SELURUH file sebagai script (mendukung DELIMITER), dengan koneksi baru, autocommit=1 dan FK checks aktif.
4. Periksa preview 53 tabel operasional seluruh site. Snapshot pemeriksaan awal: employees 3.003, candidates 722, attendance 1, scans 1. Gunakan jumlah dari preview terbaru, bukan menyalin angka lama jika sudah berubah.
5. Isi empat `@klt_refresh_expected_*` sesuai preview, backup/stopped menjadi 1 dan mode EXECUTE. Jalankan seluruh file. Hasil harus `KLATEN_REFRESH_CLEANSING_COMMITTED`. Jangan lanjut saat error. Marker mencegah reset dipakai ulang setelah sukses.
6. Buka artifact lokal `artifacts/klaten-refresh/20261127_klaten_employee_import.sql` SETELAH paket lengkap siap. Isi database target; jalankan PREVIEW. Cek jumlah dan master/tarif, baru EXECUTE dengan dua konfirmasi bernilai 1. SQL menambah master staf dalam transaksi; PREVIEW mengembalikannya.
7. Buka `artifacts/klaten-refresh/20261127_klaten_recruitment_import.sql`. Isi database target, jalankan PREVIEW lalu EXECUTE dengan konfirmasi backup/stopped=1. Target 678 kandidat dan 1.224 dokumen Drive.
8. Jika ada error, hentikan urutan dan periksa pesan. Jangan menonaktifkan constraint/FK atau menjalankan ulang cleansing setelah import. SQL import memakai marker dan tidak menimpa data existing.
9. Verifikasi jumlah dan beberapa detail aktif/arsip/staf/kandidat sebelum menyalakan writer kembali. Periksa nomor/barcode, join date, jenis karyawan, kontrak, penempatan, pekerjaan utama, shift, serta preview Drive.

## Pemeriksaan aplikasi setelah import

- Data Karyawan: default aktif menampilkan 543; filter Nonaktif 2.544 dan Resign 8. Arsip tidak masuk antrean onboarding hanya karena tidak memiliki kontrak/penempatan.
- Staf Harian/Bulanan: jabatan/departemen benar; tanpa modul produksi; shift sudah terpasang. Tidak mendapat pekerjaan produksi rekaan.
- Borong/Training: modul/bagian sumber benar, tepat satu pekerjaan utama, shift Senin-Jumat. Sabtu/Minggu bukan jadwal reguler; alur scan hari libur mengikuti aturan aplikasi yang ada.
- Kontrak: tepat satu kontrak aktif per aktif pada cutoff; PKWT/TRAINING 12 bulan dan riwayat berantai tanpa overlap. PKWTT tidak memiliki akhir kontrak.
- Rekrutmen: 678 NEW. Kandidat dengan NIK/KK tidak diketahui atau duplikat harus dilengkapi/diperiksa sebelum konversi; sumber asal tetap tersedia. Jangan menebak NIK berdasarkan nama.
- KTP/KK: buka preview Drive serta tombol buka langsung. Permission berbagi Drive tetap dikelola pemilik file.
- Attendance/Produksi/Payroll kosong setelah refresh; tidak membuat scan percobaan tanpa mencatat scope pembersihannya.
- Timestamp teknis UTC, tampilan dan tanggal operasional WIB. Tidak menggeser kolom DATE join/kontrak/assignment.

## Generasi ulang offline dan pengujian

Generated SQL berisi data pribadi dan berada di `/artifacts` yang diabaikan Git. Jangan mengunggahnya ke repository publik atau menyalin isi snapshot ke log.

```powershell
pnpm exec tsx scripts/generate-klaten-refresh-employees.mjs
pnpm exec tsx scripts/generate-klaten-refresh-recruitment.mjs
```

Generator menolak sumber berbeda hash. Konfirmasi perubahan Excel dan ulangi audit sebelum mengubah hash yang dipercaya.
Kedua generator wajib selesai exit code 0 pada sumber yang sama sebelum cleansing. Generator gagal berarti paket belum siap; jangan memakai artifact sisa generasi sebelumnya. Cocokkan sourceHash pada summary dan header kedua SQL.
Tes database hanya menyentuh database scratch khusus pada localhost:33479; tidak memakai DATABASE_URL/.env aplikasi:

```powershell
pnpm exec tsx scripts/test-klaten-refresh-cleansing.mjs
pnpm exec tsx scripts/test-klaten-refresh-employees.mjs
pnpm exec tsx scripts/test-klaten-refresh-employees.mjs --trigger-barcode
pnpm exec tsx scripts/test-klaten-refresh-recruitment.mjs
pnpm exec tsx scripts/test-klaten-refresh-artifacts.mjs
```

Pemeriksaan master live secara read-only sudah lolos untuk 21 pasangan modul/bagian, 6 pekerjaan/tarif produksi, shift Klaten, jenis karyawan/kontrak dan prasyarat schema legacy. Tidak ada data DB aplikasi yang diubah selama persiapan.
Rehearsal artifact menggunakan payload SQL aktual di database scratch khusus, lalu menghapus dataset rehearsal saat selesai. Lolos PREVIEW/EXECUTE kedua import, jumlah hasil, seluruh provenance kandidat, override gender + sumber asli, penempatan staf tanpa modul, sequence tidak diturunkan, dan replay tanpa duplikasi. Tidak ada kontrak berstatus ACTIVE yang sudah berakhir sebelum 27 November pada hasil rehearsal.
