# Knowledge Base - Monitoring Cron

> Modul: Administrasi Sistem
>
> Bagian: Monitoring Cron
>
> Audiens: Super Admin, HR, auditor internal, dan tim support HRIS
>
> Terakhir diverifikasi: 8 September 2026
>
> Status: aktif; fokus pada rekonsiliasi lifecycle karyawan

Panduan ini menjelaskan cara membaca riwayat rekonsiliasi kontrak dan proses
status karyawan terjadwal melalui **Administrasi Sistem > Monitoring Cron**.

## 1. Proses yang dipantau

Satu eksekusi **Rekonsiliasi kontrak** menjalankan tiga kelompok pekerjaan:

1. menerapkan perubahan status kerja yang sudah jatuh tempo;
2. menerapkan mutasi karyawan yang sudah jatuh tempo;
3. merekonsiliasi lifecycle kontrak, termasuk aktivasi dan masa berakhir.

Ringkasan dapat memuat jumlah kontrak aktif atau berakhir, karyawan diaktifkan
atau dinonaktifkan, konflik legacy, konflik yang dilewati, serta mutasi atau
perubahan status yang diterapkan, gagal, atau dilewati.

Halaman ini tidak menampilkan seluruh background job aplikasi. Finalisasi
Attendance terjadwal dan pengaturan jadwal cron tidak dikelola dari halaman ini.

## 2. Hak akses

- Membaca riwayat Monitoring Cron memerlukan `audit.view`.
- Tombol **Jalankan sekarang** hanya terlihat bagi Super Admin.
- Eksekusi manual juga diperiksa backend dan memerlukan `employees.manage`
  serta role Super Admin.

Permission membaca riwayat tidak otomatis memberi hak menjalankan proses.

## 3. Ringkasan halaman

Kartu ringkasan menampilkan:

| Kartu | Arti |
|---|---|
| Eksekusi terakhir | Status run paling baru. |
| Berhasil terakhir | Waktu run terakhir yang selesai dengan status Berhasil. |
| Sedang berjalan | Jumlah run yang masih berstatus RUNNING. |
| Gagal 24 jam | Jumlah run gagal selama 24 jam terakhir. |

Klik **Muat ulang** untuk mengambil kondisi terbaru. Halaman tidak melakukan
polling terus-menerus selama run berlangsung.

## 4. Status eksekusi

| Status | Label aplikasi | Arti operasional |
|---|---|---|
| `RUNNING` | Sedang berjalan | Lock berhasil diperoleh dan proses belum menulis hasil akhir. |
| `SUCCEEDED` | Berhasil | Seluruh tahap eksekusi selesai. Ringkasan tetap perlu diperiksa karena dapat memuat konflik atau item gagal per tahap. |
| `FAILED` | Gagal | Eksekusi berhenti karena error. Pesan aman ditampilkan; detail internal diperiksa pada log dan Audit Trail oleh pihak berwenang. |
| `SKIPPED` | Dilewati | Rekonsiliasi lain masih memegang lock sehingga run baru sengaja tidak dijalankan. |

Status Berhasil bukan jaminan bahwa tidak ada konflik bisnis. Periksa angka
`gagal`, `dilewati`, `konflik legacy`, dan `konflik dilewati` pada kolom Hasil.

## 5. Membaca riwayat

Riwayat diurutkan dari eksekusi terbaru dan menampilkan:

- nama proses;
- tanggal bisnis dalam zona waktu `Asia/Jakarta`;
- status;
- waktu mulai;
- durasi;
- ringkasan hasil atau pesan error.

Gunakan filter status untuk fokus pada run Gagal atau Dilewati. Pagination
mendukung 50 sampai 500 baris per halaman.

## 6. Menjalankan rekonsiliasi manual

Gunakan eksekusi manual ketika perubahan lifecycle sudah jatuh tempo tetapi
belum diterapkan, setelah memperbaiki penyebab kegagalan, atau ketika tim
support perlu memverifikasi proses tanpa menunggu scheduler berikutnya.

1. Pastikan tidak ada rekonsiliasi yang masih berjalan.
2. Klik **Jalankan sekarang**.
3. Baca penjelasan dampak pada dialog konfirmasi.
4. Konfirmasi eksekusi.
5. Klik **Muat ulang** dan periksa status serta ringkasan run terbaru.
6. Verifikasi karyawan atau kontrak terkait pada modul Karyawan.

Eksekusi manual berlaku untuk seluruh site. Tombol ini bukan cara memproses satu
karyawan atau satu site saja.

## 7. Perlindungan proses paralel

Sistem menggunakan lock rekonsiliasi tunggal. Jika scheduler atau pengguna lain
sedang menjalankan proses, permintaan berikutnya dicatat sebagai `SKIPPED`
dengan alasan bahwa rekonsiliasi lain masih berjalan.

Jangan menekan tombol berulang kali untuk memaksa proses. Tunggu run aktif
selesai, muat ulang, lalu jalankan kembali hanya jika masih diperlukan.

## 8. Menindaklanjuti hasil

| Hasil | Tindakan |
|---|---|
| Kontrak diaktifkan/berakhir | Periksa status kontrak dan karyawan terkait. |
| Mutasi diterapkan | Periksa current placement dan histori employment. |
| Perubahan status diterapkan | Periksa status kerja dan tanggal efektif. |
| Konflik legacy | Periksa kontrak lama atau data karyawan yang tidak konsisten; jangan koreksi langsung dari database. |
| Item gagal | Buka workflow sumber, perbaiki datanya, lalu jalankan rekonsiliasi kembali. |
| Item dilewati | Periksa apakah kondisi target sudah berubah atau berbenturan dengan transaksi lain. |

Gunakan [Audit Trail](./KBASE_AUDIT_TRAIL.md) untuk menelusuri eksekusi manual
dan perubahan yang dihasilkan sistem.

## 9. Run macet atau gagal

Jika `RUNNING` tidak selesai dalam waktu yang wajar:

1. jangan menjalankan permintaan manual berulang;
2. muat ulang halaman untuk memastikan status terbaru;
3. periksa kesehatan API dan database;
4. periksa log aplikasi dengan akses yang sesuai;
5. cocokkan waktu serta request pada Audit Trail;
6. eskalasi ke tim teknis sebelum mengubah status run secara manual.

Jika status `FAILED`, selesaikan penyebab pada data atau layanan terlebih
dahulu. Menjalankan ulang tanpa perbaikan biasanya hanya membuat run gagal baru.

## 10. Batas operasional

- Halaman tidak mengubah jadwal scheduler atau secret cron.
- Halaman tidak menyediakan retry untuk satu item di dalam run.
- Halaman tidak menyediakan pembatalan run yang sedang berjalan.
- Riwayat run bukan pengganti histori kontrak, mutasi, atau status karyawan.
- Pesan error disanitasi sehingga detail teknis penuh tidak selalu tampil di UI.

## 11. Checklist setelah rekonsiliasi

- [ ] Run terbaru tidak lagi berstatus Sedang berjalan.
- [ ] Status akhir dan tanggal bisnis benar.
- [ ] Angka gagal, dilewati, dan konflik sudah diperiksa.
- [ ] Karyawan atau kontrak sampel sudah diverifikasi.
- [ ] Kegagalan ditelusuri melalui log dan Audit Trail bila perlu.
- [ ] Rekonsiliasi ulang hanya dijalankan setelah penyebab diperbaiki.

## 12. Navigasi KBase Administrasi Sistem

- Kembali ke [Indeks Administrasi Sistem](../../KBASE_ADMINISTRASI_SISTEM.md).
- Sebelumnya: [Audit Trail](./KBASE_AUDIT_TRAIL.md).
- Lanjut ke [Pengaturan Sistem](./KBASE_PENGATURAN_SISTEM.md).
- Lihat juga [Pengelolaan Kontrak](../karyawan/KBASE_PENGELOLAAN_KONTRAK.md).

