# Hapus batch Master Karyawan

Disetujui Bos pada 10 Oktober 2026 untuk membersihkan data lama yang salah atau
data uji sebelum registrasi/import data yang sesuai kondisi lapangan.

## Cara penggunaan

1. Super Admin membuka Daftar Karyawan, menu `...`, **Hapus Karyawan Batch**.
2. Filter Site, Jenis, Status, dan pencarian, lalu muat ringkasan.
3. Periksa daftar siap dihapus/terblokir serta dependensi administratifnya.
4. Pilih karyawan yang siap pada halaman tersebut, maksimal 200 per eksekusi.
5. Isi alasan minimal 5 karakter, ketik `HAPUS`, lalu konfirmasi.

Pilihan tidak berarti seluruh hasil filter. Saat filter atau halaman berganti,
pilihan dan konfirmasi dibersihkan agar target tidak tertukar. Tidak ada hapus
otomatis terhadap karyawan yang tidak dipilih.

Tombol **Download halaman ini** mengunduh Excel hasil pemeriksaan pada halaman
preview yang sudah dimuat, termasuk karyawan siap dan terblokir beserta dampak
administratifnya. Sheet Informasi mencantumkan filter, halaman, dan jumlah baris;
file ini bukan ekspor seluruh hasil filter. Kesiapan tetap diperiksa ulang saat
penghapusan.

## Pengaman dan dampak

- Wajib `SUPER_ADMIN` dan izin `employees.manage`, diperiksa di API dan UI.
- UID target harus unik dan masih tersedia. Seluruh target diperiksa ulang;
  satu target terblokir atau hilang membatalkan seluruh batch. Cleanup dan audit
  menggunakan satu transaksi database, bukan DELETE individual dari browser.
- Attendance, scan, koreksi/klasifikasi, semua setoran Produksi (termasuk VOID),
  komponen manual Payroll, hasil/snapshot Payroll, dan settlement BPJS tetap
  memblokir. Proses Payroll/finalisasi Attendance terkait yang sedang berjalan
  juga memblokir. Riwayat penempatan di site sebelumnya ikut diperhitungkan.
- Bila aman, kontrak **termasuk ACTIVE**, lifecycle, histori employment,
  jadwal mutasi/status, assignment shift/pekerjaan, gaji/tarif/BPJS beserta
  revisinya, komponen Payroll master, dan dokumen karyawan ikut dibersihkan.
- Kandidat rekrutmen dan dokumen hasil generate tetap disimpan dengan relasi
  karyawan dilepas. Audit, file fisik, dan sequence nomor karyawan dipertahankan.
  Registrasi baru tidak otomatis menyambung ke histori/Employee ID yang lama.
- Tidak ada perubahan schema, migrasi, maupun backfill untuk fitur ini.

Jika data uji masih memiliki transaksi, reset Setoran terlebih dahulu, lalu
Attendance, lalu muat ulang preview Karyawan. Pengaman masing-masing fitur
tetap berlaku; klasifikasi Attendance multi-hari dan fakta Payroll bisa
menghalangi reset. Fitur ini tidak menghapus transaksi operasional secara otomatis.

## Peta kode

- API: `apps/api/src/routes/employees.ts`, endpoint
  `POST /employees/batch-delete/preview` dan `POST /employees/batch-delete`.
- UI: `src/features/employees/components/employee-batch-delete-dialog.tsx`.
- Kontrak/hook: `src/features/employees/domain.ts` dan `data/queries.ts`.
