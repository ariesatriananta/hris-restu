# Dokumen KTP/KK legacy Google Drive

Dokumen karyawan mendukung satu dari dua sumber: file upload R2 (`file_id`)
atau tautan file Google Drive (`external_url`). Tidak ada file Drive yang
diunduh, disalin ke R2, atau dibuatkan metadata file rekaan. Record `files`
dan seluruh upload R2 existing tetap dipertahankan.

## Urutan pemasangan oleh Owner

1. Backup database, hentikan writer aplikasi/cron sampai migration selesai. Jalankan
   `db/migrations/20261123_employee_document_external_url.sql` **sekali**,
   sebelum menjalankan versi API yang baru. DDL implicitly commits. File terbaru
   aman dijalankan ulang setelah error 1901 atau jika kolom sudah terlanjur ada.
2. Deploy/restart API dan frontend terbaru.
3. Buka `artifacts/klaten-import/20261123_klaten_document_links.sql`.
   File berisi tautan pribadi, disimpan di folder ignored; jangan commit/share.
4. Isi `@klt_docs_database` sesuai nama database, biarkan `PREVIEW`.
   Jalankan seluruh file sebagai script pada koneksi baru.
5. Sumber berjumlah **6.635** tautan: KTP **3.318**, KK **3.317**.
   Masing-masing **388** tautan milik karyawan aktif. Jika belum ada dokumen
   existing, `documents_to_insert=6635`, `existing_documents_preserved=0`.
   Dokumen ACTIVE yang sudah ada dengan tipe/pemilik sama dipertahankan dan
   mengurangi jumlah insert; periksa angka preview sebelum melanjutkan.
6. Hentikan writer aplikasi/cron sementara. Ubah mode ke `EXECUTE`,
   `@klt_docs_backup=1`, `@klt_docs_stopped=1`, lalu jalankan seluruh file.
   Sukses: `KLATEN_DOCUMENT_LINKS_COMMITTED`.
7. Preview ulang harus menunjukkan insert 0. Jalankan aplikasi kembali.

Tidak perlu menjalankan ulang import karyawan atau SQL perapian penempatan.
Pengaitan memakai UID deterministik dari hash file Excel dan baris sumber,
bukan nama/NIK/nomor karyawan yang dapat kosong atau berubah. Termasuk arsip
nonaktif/resign. Tanggal terbit/expiry/nomor dokumen tidak direka.

UID dokumen deterministik mencegah duplikasi saat replay. Dokumen existing,
termasuk yang sudah diedit, diganti attachment-nya, atau diarsipkan setelah
import, tidak ditimpa/diaktifkan ulang. Audit hanya memuat jumlah dan hash
sumber, tanpa URL/nama/NIK. Insert dan audit berada dalam satu transaksi.

## Pemakaian

- Detail Karyawan → Identitas: kartu Foto KTP/KK menunjukkan sumber Google Drive
  dan tombol **Preview**. Tab Dokumen juga memiliki Preview.
- Preview Drive baru dimuat setelah tombol diklik. Tombol **Buka di Google
  Drive** selalu tersedia, termasuk bila browser/izin Drive menghalangi iframe.
- Tambah/Ubah Dokumen: pilih **Upload file** atau **Tautan Google Drive**.
  Mengganti sumber memperbarui dokumen yang sama, bukan menggandakan record.
- Edit nomor NIK/KK melalui form karyawan tetap mempertahankan sumber Drive.
  Upload pengganti akan mengubah sumber dokumen tersebut ke R2.
- File R2 gambar/PDF tetap memakai preview file; tipe lain dibuka langsung.
- Hak akses API dan pembatasan site tetap memakai aturan dokumen yang ada.

Link yang diterima hanya HTTPS `drive.google.com` untuk file (`/file/d/...`,
`/open?id=...`, `/uc?id=...`); folder/domain lain ditolak. Parameter resourcekey
dipertahankan. Akses publik dan keberadaan file tetap dikendalikan pemilik Drive.
Implementasi tidak memverifikasi isi/izin 6.635 file satu per satu.

## Verifikasi

1. Buka karyawan dengan link KTP/KK dari Excel. Pastikan sumber Google Drive,
   preview dan buka langsung bekerja dengan izin Drive aslinya.
2. Cek arsip dengan link yang tersedia; dokumen tetap dapat dibuka HR berizin.
3. Cek karyawan tanpa link: tidak muncul attachment palsu.
4. Cek dokumen upload R2 lama, tambah dokumen R2 baru, dan ubah metadata tanpa
   upload ulang. URL tetap menuju konfigurasi R2 yang sama.
5. Coba ganti satu dokumen dari Drive ke upload dan sebaliknya lewat form.

Generator offline: `node scripts/generate-klaten-document-links.mjs`.
Generator memverifikasi hash/header Excel dan menolak URL file tak dikenal;
tidak menghubungi DB, Drive atau R2. Regenerate mengembalikan mode PREVIEW.

Test integrasi SQL: `node scripts/test-klaten-document-links.mjs`, hanya pada
MariaDB disposable 127.0.0.1:33479 dan DB sintetis `hris_klaten_import_scratch`.
Mengabaikan DATABASE_URL. Mencakup migration atas tabel lama dengan file R2,
preview, guard, rollback akhir, import aktif/arsip, constraint sumber, replay
dan pelestarian keputusan manual. Uji API mencakup permission/site, pembacaan
LEFT JOIN tanpa file, normalisasi URL, replay, dan penggantian kedua sumber.

Kompatibilitas MariaDB: FK `employee_documents.file_id` memakai `ON UPDATE
RESTRICT`, karena `ON UPDATE CASCADE` ditolak bersama CHECK atas kolom itu
pada versi server tertentu (error 1901). ID internal file tidak diubah oleh
aplikasi. FK/delete restriction tetap aktif; migration tidak mengubah data/file.
Pengujian lokal MariaDB 10.4 sebelumnya belum menangkap penolakan versi tersebut.
