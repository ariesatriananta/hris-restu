# Knowledge Base - Rekap Attendance

> Modul: Attendance
>
> Domain: Rekap Periode, Ekspor Excel, dan Payroll Readiness
>
> Audiens: HR Officer, Site Supervisor, Super Admin, Payroll Officer, dan tim support HRIS
>
> Terakhir diverifikasi: 7 September 2026
>
> Status: aktif, sesuai perilaku aplikasi saat dokumen ini dibuat

Dokumen ini menjelaskan cara membaca Rekap Attendance, arti panel dan kolom UI, pemeriksaan kelengkapan periode, ekspor Excel, serta syarat agar keluaran Attendance siap diserahkan ke proses Payroll.

Dokumen ini tidak menjelaskan formula gaji, simulasi, approval, atau closing Payroll. Area tersebut tetap menjadi milik [Knowledge Base Payroll](../../KBASE_PAYROLL.md).

## 1. Tujuan Rekap Attendance

Rekap Attendance menggabungkan fakta per hari menjadi ringkasan per:

- karyawan;
- site historis;
- jenis karyawan historis;
- periode yang dipilih.

Rekap dipakai untuk pemeriksaan operasional dan persiapan data. Rekap bukan alat untuk mengedit Attendance. Jika ada data salah, kembali ke [Operasional Harian Attendance](./KBASE_OPERASIONAL_HARIAN_ATTENDANCE.md), selesaikan workflow, finalisasi ulang bila diperlukan, lalu muat ulang rekap.

## 2. Sumber dan prinsip data

Rekap membangun proyeksi tanggal demi tanggal berdasarkan:

- histori employment yang efektif pada tanggal tersebut;
- status employment yang mengizinkan Attendance;
- site dan jenis karyawan historis;
- assignment shift dan hari kerja;
- Kalender Kerja yang sudah di-resolve;
- `attendance_records` yang tersimpan;
- status koreksi dan klasifikasi yang masih pending;
- run finalisasi per site dan tanggal.

Karena menggunakan histori efektif, seorang karyawan dapat muncul dalam lebih dari satu grup jika site atau jenis karyawannya berubah di tengah periode. Ini bukan duplikasi otomatis; setiap grup mempertahankan konteks historisnya.

## 3. Membuka dan memfilter rekap

Halaman `/attendance/rekap` membutuhkan `attendance.view`. Akses site mengikuti scope akun.

### 3.1 Periode

- Periode default adalah tanggal 1 bulan berjalan sampai hari ini.
- Rentang minimal satu hari dan maksimal 31 hari kalender.
- Tanggal akhir tidak boleh sebelum tanggal awal.
- Rentang dihitung inklusif, sehingga 1-31 Agustus adalah 31 hari.

### 3.2 Filter

Filter yang tersedia:

- pencarian nama atau nomor karyawan;
- site;
- jenis karyawan: Borongan, Harian, Bulanan, atau Training;
- status Attendance: Hadir, Alpha, Cuti, Sakit, Izin, Libur Kalender, atau Libur Mingguan;
- pagination dan jumlah baris.

Filter aktif juga diteruskan ke ekspor. Simpan bukti filter melalui sheet Metadata Export, bukan dengan menebak dari nama file.

## 4. Panel Kelengkapan Periode

Kelengkapan diperiksa untuk setiap kombinasi tanggal-site dalam scope rekap.

### 4.1 Badge tingkat periode

| Badge | Arti |
|---|---|
| **Lengkap** | Periode official dan semua kombinasi tanggal-site `FINALIZED` atau `NOT_REQUIRED`. Ekspor dapat tersedia jika akun punya permission. |
| **Belum lengkap** | Ada tanggal-site yang belum dimulai, partial, atau gagal; atau ada blocker workflow/data. |
| **Sebelum go-live** | Tanggal awal periode berada sebelum konfigurasi go-live finalisasi Attendance. Periode tidak dianggap official. |

Panel menampilkan jumlah kombinasi tanggal-site yang selesai dan jumlah yang gagal. Buka **Lihat rincian status** untuk mengetahui tanggal dan site yang perlu ditangani.

### 4.2 Status per tanggal-site

| Status | Label UI | Arti |
|---|---|---|
| `NOT_STARTED` | Belum dimulai | Finalisasi diperlukan tetapi belum mempunyai run yang memenuhi. Tanggal masa depan juga berada pada kondisi belum dapat resmi. |
| `PRE_GO_LIVE` | Sebelum go-live | Tanggal lebih awal daripada go-live Attendance environment. |
| `NOT_REQUIRED` | Tidak perlu finalisasi | Semua target valid pada tanggal tersebut adalah hari nonkerja dan tidak perlu record Alpha/Libur. |
| `PARTIAL` | Sebagian | Run ada, tetapi masih ada blocker atau data yang diharapkan belum lengkap. |
| `FINALIZED` | Selesai | Run sukses dan tidak ada blocker. |
| `FAILED` | Gagal | Run terakhir gagal. |

### 4.3 Penyebab ekspor diblokir

Rekap belum siap diekspor resmi jika terdapat salah satu kondisi berikut:

- periode dimulai sebelum go-live;
- mencakup tanggal masa depan;
- finalisasi belum dijalankan atau gagal;
- shift belum melewati grace finalisasi;
- assignment shift hilang atau tumpang tindih;
- histori employment ambigu;
- record yang diharapkan masih belum terbentuk;
- koreksi `PENDING`;
- klasifikasi `PENDING`.

Alasan yang tampil pada panel berasal dari pemeriksaan server. Jangan menghilangkan warning dengan mengubah filter site secara sengaja jika periode Payroll sebenarnya mencakup site tersebut.

## 5. Arti panel ringkasan

| Panel | Arti |
|---|---|
| Grup karyawan | Jumlah kombinasi karyawan-site historis-jenis karyawan yang terbentuk. |
| Hari kerja | Jumlah detail dengan jenis hari `WORKDAY`. Hint menampilkan jumlah libur kalender dan libur mingguan. |
| Hadir kerja | Status `PRESENT` pada hari kerja. |
| Hadir hari libur | Status `PRESENT` pada hari kalender libur atau non-workday. |
| Alpha | Status `ABSENT`. |
| Cuti / Sakit / Izin | Jumlah `LEAVE` / `SICK` / `PERMISSION` dalam urutan tersebut. |
| Abnormal | Jumlah detail `PRESENT` yang kehilangan jam Masuk atau Pulang menurut aturan kualitas. |
| Total durasi | Penjumlahan menit kerja yang tersedia. Ini informasi operasional, bukan dasar upah Borongan. |

Panel menghitung seluruh grup hasil query yang sesuai filter, bukan hanya baris pada halaman pagination saat ini.

## 6. Arti kolom tabel ringkasan

| Kolom | Arti |
|---|---|
| Karyawan | Nama dan nomor karyawan. |
| Site | Site historis untuk grup tersebut. |
| Jenis | Jenis karyawan historis. |
| Shift | Daftar nama shift yang muncul selama periode. |
| Hari kerja | Jumlah tanggal terjadwal sebagai workday. |
| Hadir kerja | Jumlah Hadir pada workday. |
| Hadir libur | Jumlah Hadir di luar workday. |
| Alpha | Jumlah hari `ABSENT`. |
| C / S / I | Cuti / Sakit / Izin. |
| Libur | Libur kalender ditambah keterangan jumlah libur mingguan. |
| Terlambat | Total durasi terlambat dan jumlah hari yang memiliki menit terlambat. |
| Pulang awal | Total durasi pulang awal dan jumlah hari yang memiliki menit pulang awal. |
| Durasi | Total menit kerja yang dapat dihitung. |
| Abnormal | Jumlah hari berkualitas abnormal. |

Satu baris tidak selalu berarti satu karyawan unik untuk seluruh periode. Jika histori site atau jenis karyawan berubah, konteksnya dapat terpisah menjadi beberapa baris.

## 7. Rincian Attendance Harian

Klik aksi detail pada baris untuk membuka tanggal-tanggal penyusunnya.

Rincian menampilkan:

- tanggal dan nama hari;
- status;
- shift dan jam shift;
- jam Masuk/Pulang;
- keterlambatan dan pulang awal;
- kalender dan penempatan historis;
- catatan;
- badge `Hanya di rekap`, `Dikoreksi`, atau `Abnormal`.

### 7.1 Libur mingguan yang hanya tampil di rekap

Jika hari tidak termasuk hari kerja assignment dan tidak ada scan aktual, sistem tetap menampilkan `WEEKLY_OFF` agar kalender rekap lengkap. Baris berlabel **Hanya di rekap** ini tidak mempunyai `attendance_records` dan bukan transaksi Attendance yang hilang.

Jika karyawan benar-benar scan pada hari tersebut, rekap menampilkan fakta `PRESENT` sebagai **Hadir Hari Libur**, bukan baris otomatis.

### 7.2 Sumber jam

Pada data detail/export:

| Sumber | Arti |
|---|---|
| `TERMINAL` | Jam berasal dari scan terminal yang sukses. |
| `CORRECTION` | Sisi jam tersebut diterapkan melalui koreksi yang disetujui. |
| kosong | Tidak ada jam/sumber yang berlaku. |

Status `Dikoreksi` tidak menghapus event terminal asli. Tim support dapat menelusuri keduanya.

### 7.3 Abnormal pada rekap

- Tanpa jam Masuk: status Hadir dan jam Pulang tersedia, tetapi jam Masuk kosong.
- Tanpa jam Pulang: status Hadir, jam Masuk tersedia, jam Pulang kosong, dan akhir shift telah lewat.

Abnormal harus ditinjau sebelum Payroll readiness. Namun, keberadaan abnormal dan kesiapan bisnis final tetap merupakan keputusan HR; sistem memblokir ekspor terutama berdasarkan kelengkapan/finalisasi dan workflow pending.

## 8. Ekspor Excel

Ekspor membutuhkan:

- permission `attendance.export`;
- periode valid maksimal 31 hari;
- periode official, yaitu tanggal mulai tidak sebelum go-live;
- seluruh tanggal-site selesai atau tidak memerlukan finalisasi;
- tidak ada alasan blokir kelengkapan.

Jika rekap belum lengkap, server mengembalikan konflik `ATTENDANCE_RECAP_INCOMPLETE` dan UI menonaktifkan ekspor.

### 8.1 Sheet Ringkasan

Berisi satu baris per grup karyawan-site-jenis, termasuk:

- NIK, nama, site, jenis karyawan, dan shift;
- hari terjadwal;
- total Hadir, Hadir Hari Kerja, dan Hadir Hari Libur;
- Alpha, Cuti, Sakit, Izin, Libur Resmi, dan Libur Mingguan;
- hari/menit terlambat;
- hari/menit pulang cepat;
- menit kerja dan anomali.

### 8.2 Sheet Detail Harian

Berisi satu baris per tanggal-karyawan yang diproyeksikan, termasuk:

- site dan jenis karyawan historis;
- departemen, modul, bagian, dan grup kerja;
- kode/nama/jam shift;
- status dan konteks kalender;
- jam, metrik, dan sumber Masuk/Pulang;
- penanda Dikoreksi dan Baris Otomatis;
- catatan.

### 8.3 Sheet Metadata Export

Berisi:

- periode dan timezone;
- waktu ekspor dan pengguna yang mengekspor;
- status official dan izin ekspor;
- jumlah baris ringkasan/detail;
- jumlah libur mingguan otomatis;
- filter yang digunakan;
- alasan blokir jika ada;
- status kelengkapan setiap tanggal-site.

Ketiga sheet mempunyai header beku, filter Excel, dan lebar kolom otomatis. Simpan sheet Metadata bersama file; jangan mengirim hanya sheet Ringkasan karena konteks auditnya akan hilang.

## 9. Payroll readiness

Payroll readiness berarti keluaran Attendance sudah konsisten untuk diserahkan ke proses Payroll. Ini bukan berarti Payroll sudah dihitung atau disetujui.

### 9.1 Data Attendance yang disiapkan

Schema Payroll menyediakan snapshot ringkasan yang dapat menampung:

- hari terjadwal;
- hari Hadir;
- Alpha;
- Cuti;
- Sakit;
- Izin;
- Libur;
- menit terlambat;
- menit pulang awal;
- menit kerja.

Penggunaan snapshot tersebut mengikuti skema Payroll: Borongan memakai hasil
Produksi, Harian/Training memakai Attendance final untuk hari bayar, dan
Bulanan memakai Attendance antara lain untuk potongan Alpha/Izin sesuai policy.
Total durasi kerja tetap merupakan informasi operasional dan bukan dasar upah
Borongan.

### 9.2 Checklist sebelum menyerahkan periode

- [ ] Periode Payroll dan site sudah dipilih dengan benar.
- [ ] Tanggal awal tidak sebelum go-live Attendance.
- [ ] Panel Kelengkapan berstatus **Lengkap**.
- [ ] Seluruh tanggal-site `FINALIZED` atau `NOT_REQUIRED`.
- [ ] Tidak ada koreksi `PENDING`.
- [ ] Tidak ada klasifikasi `PENDING`.
- [ ] Semua abnormal sudah diperiksa dan keputusan HR dicatat.
- [ ] Jumlah Alpha, Cuti, Sakit, Izin, dan Hadir Hari Libur telah direview.
- [ ] Perubahan histori employment/site di tengah periode sudah benar.
- [ ] File Excel berhasil diekspor dan sheet Metadata disimpan.
- [ ] Belum ada Payroll `CLOSED` yang perlu diubah.

### 9.3 Setelah Payroll closing

Koreksi Attendance dan klasifikasi yang menyentuh Payroll `CLOSED` ditolak oleh server. Jangan mengubah record langsung melalui SQL untuk melewati pengaman. Jika ada insiden, lakukan investigasi terkontrol dan ikuti kebijakan Payroll.

## 10. Hubungan dengan Produksi Borongan

Attendance sudah menjadi gate Setoran Produksi. Terminal Produksi memerlukan
record berstatus Hadir dan event **scan Masuk terminal sukses** pada business
date serta site yang sama. Status Hadir dari koreksi saja, scan Pulang saja,
atau record tanpa event scan Masuk sukses tidak cukup.

Rekap Attendance tetap bukan sumber nominal Produksi. Transaksi Produksi yang
lolos gate disimpan dan dihitung pada modul Produksi, kemudian disnapshot oleh
Payroll sesuai periode terkait.

## 11. Troubleshooting rekap

| Masalah | Pemeriksaan dan tindakan |
|---|---|
| Karyawan tidak muncul | Periksa histori employment, status yang mengizinkan Attendance, site, jenis karyawan, periode, dan filter. |
| Satu karyawan muncul dua baris | Periksa perubahan site/jenis karyawan historis; pemisahan grup dapat memang benar. |
| Hari kerja kurang/lebih | Periksa periode assignment, hari kerja ISO, dan kalender/override. |
| Libur mingguan tidak ada di `attendance_records` | Ini normal; libur mingguan tanpa scan hanya ditampilkan otomatis di rekap. |
| Hadir hari libur muncul | Ada record scan/fakta `PRESENT` pada hari libur; periksa detail dan event scan. |
| Abnormal tetap ada setelah koreksi | Pastikan koreksi `APPROVED`, jam benar-benar diterapkan, dan muat ulang data. |
| Status Partial | Buka alasan tanggal-site, selesaikan blocker, lalu finalisasi ulang. |
| Ekspor nonaktif | Periksa permission, periode maksimal 31 hari, go-live, finalisasi, tanggal masa depan, dan workflow pending. |
| Periode sebelum go-live tidak bisa diekspor | Itu perlindungan ekspor official; data dapat dilihat tetapi tidak diterbitkan sebagai rekap resmi. |
| Angka Excel berbeda dari UI | Pastikan filter dan periode sama, lalu lihat sheet Metadata Export. |
| Payroll sudah closing | Attendance pada periode itu tidak dapat dikoreksi melalui workflow normal. |

## 12. Batasan versi saat ini

- Rentang rekap dan ekspor maksimal 31 hari kalender.
- Ekspor official tidak tersedia untuk periode yang dimulai sebelum go-live.
- Weekly off tanpa scan hanya berupa proyeksi rekap, bukan record database.
- Durasi kerja bukan dasar upah Borongan.
- Modul Payroll masih memiliki KBase tersendiri dan tidak dijelaskan seolah sudah menghitung data Attendance secara otomatis.
- Gate scan Masuk untuk Produksi Borongan sudah aktif; Rekap Attendance tetap
  tidak membuat atau menghitung transaksi Produksi.

## 13. Referensi teknis untuk support dan developer

### 13.1 Endpoint utama

| Method dan path | Fungsi |
|---|---|
| `GET /api/attendance/recaps` | Ringkasan, summary panel, dan kelengkapan periode. |
| `GET /api/attendance/recaps/:employeeUid/days` | Rincian harian satu karyawan/grup. |
| `POST /api/attendance/recaps/export` | Membuat workbook official sesuai filter. |
| `GET /api/attendance/finalizations` | Status finalisasi yang menjadi bagian dari kelengkapan. |

### 13.2 Tabel dan proyeksi utama

| Sumber | Peran |
|---|---|
| `employee_employment_histories` | Eligibility, site, jenis karyawan, dan penempatan historis. |
| `employee_shift_assignments` dan `shifts` | Jadwal, hari kerja, dan konteks shift. |
| `attendance_records` | Fakta Attendance tersimpan. |
| `attendance_calendar_events` dan `attendance_calendar_site_rules` | Resolusi hari kerja/libur. |
| `attendance_daily_finalization_runs` | Bukti finalisasi per site-tanggal. |
| `attendance_corrections` dan `attendance_classification_requests` | Workflow pending yang memblokir kelengkapan. |
| `payroll_attendance_summaries` | Struktur snapshot downstream Payroll; bukan bukti Payroll sudah berjalan. |

### 13.3 File sumber perilaku

| File | Tanggung jawab |
|---|---|
| `apps/api/src/lib/attendance-recap.ts` | Membangun proyeksi historis, kelengkapan, agregasi, dan workbook. |
| `apps/api/src/lib/attendance-recap-policy.ts` | Status rekap, batas 31 hari, dan official period. |
| `apps/api/src/routes/attendance-recaps.ts` | API list, detail, dan ekspor. |
| `src/features/attendance/recap-page.tsx` | Panel kelengkapan, ringkasan, periode, dan tombol ekspor. |
| `src/features/attendance/recap-columns.tsx` | Definisi kolom ringkasan. |
| `src/features/attendance/recap-detail-sheet.tsx` | Rincian harian dan label hanya-di-rekap/koreksi/abnormal. |
| `db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql` | Sumber kebenaran struktur database. |

## 14. Navigasi KBase

- Kembali ke [Indeks Attendance](../../KBASE_ATTENDANCE.md).
- Buka [Pengaturan Attendance](./KBASE_PENGATURAN_ATTENDANCE.md) untuk shift, kalender, dan perangkat.
- Buka [Operasional Harian Attendance](./KBASE_OPERASIONAL_HARIAN_ATTENDANCE.md) untuk memperbaiki data periode.
- Lanjutkan ke [Knowledge Base Payroll](../../KBASE_PAYROLL.md) hanya untuk aturan Payroll, formula, approval, dan closing.
