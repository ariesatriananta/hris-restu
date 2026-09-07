# Knowledge Base - Attendance

> Modul: Attendance
>
> Audiens: HR, administrator site, Site Supervisor, Super Admin, dan tim support HRIS
>
> Terakhir diverifikasi: 7 September 2026
>
> Status: indeks aktif; isi teknis dan operasional dibagi menjadi tiga panduan

Knowledge Base Attendance menjelaskan bagaimana perusahaan menyiapkan aturan kehadiran, menjalankan aktivitas harian, dan memastikan rekap siap dipakai oleh proses berikutnya. Gunakan halaman ini sebagai pintu masuk, lalu buka panduan sesuai pekerjaan yang sedang dilakukan.

## Pilih panduan

| Panduan | Gunakan ketika |
|---|---|
| [Pengaturan Attendance](./kbase/attendance/KBASE_PENGATURAN_ATTENDANCE.md) | Menyiapkan shift, penugasan shift, kalender kerja, perangkat, hak akses, atau kesiapan sebelum operasional. |
| [Operasional Harian Attendance](./kbase/attendance/KBASE_OPERASIONAL_HARIAN_ATTENDANCE.md) | Menjalankan scan Masuk/Pulang, memantau kehadiran, menangani abnormal, mengajukan koreksi atau klasifikasi, dan melakukan finalisasi. |
| [Rekap Attendance](./kbase/attendance/KBASE_REKAP_ATTENDANCE.md) | Membaca panel dan tabel rekap, memeriksa kelengkapan periode, mengekspor Excel, atau menyiapkan data Attendance untuk Payroll. |

Alur yang disarankan:

1. siapkan master dan aturan pada **Pengaturan Attendance**;
2. jalankan dan selesaikan pekerjaan tanggal berjalan pada **Operasional Harian Attendance**;
3. periksa periode dan hasil akhirnya pada **Rekap Attendance**.

## Prinsip utama

- Tanggal Attendance menggunakan **business date** dalam zona waktu `Asia/Jakarta`, bukan sekadar tanggal kalender perangkat pengguna.
- Shift, histori employment, kalender kerja, dan site menentukan apakah seorang karyawan dijadwalkan bekerja pada tanggal tertentu.
- Scan terminal adalah fakta mentah. Koreksi dan klasifikasi menggunakan workflow persetujuan dan tidak menghapus histori scan.
- Rekap resmi hanya dapat diekspor jika periode berada dalam cakupan go-live dan seluruh kombinasi tanggal-site sudah lengkap.
- Scope site selalu diperiksa kembali oleh backend. Hak menu di frontend bukan satu-satunya pengaman.

## Status implementasi saat ini

Shift, kalender kerja, perangkat, terminal scan, monitoring, koreksi, klasifikasi, finalisasi, rekap, dan ekspor Excel sudah memiliki implementasi aplikasi.

Integrasi Attendance sebagai gate Setoran Produksi Borongan sudah aktif. Karyawan
hanya dapat mencatat setoran jika mempunyai status Hadir dan **scan Masuk
terminal yang sukses** pada business date serta site yang sama. Status Hadir
hasil koreksi saja, scan Pulang saja, atau record tanpa event scan Masuk sukses
tidak memenuhi gate Produksi.

Monitoring Harian juga menyediakan aksi massal untuk mengajukan koreksi,
mengajukan klasifikasi, serta menyetujui request terpilih. Aksi ini tetap
memeriksa permission, satu site, batas 50 baris, go-live, dan kelayakan setiap
baris di backend.

## Aturan pembaruan

Dokumen ini dan tiga panduan turunannya diperbarui hanya ketika Bos meminta pembaruan KBase. Jika dokumentasi berbeda dengan perilaku aplikasi, schema dan kode aplikasi yang sedang berjalan tetap menjadi sumber kebenaran teknis.
