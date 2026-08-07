# Knowledge Base - Pengaturan Attendance

> Modul: Attendance
>
> Domain: Shift, Kalender Kerja, dan Perangkat
>
> Audiens: HR Officer, Super Admin, administrator site, dan tim support HRIS
>
> Terakhir diverifikasi: 7 Agustus 2026
>
> Status: aktif, sesuai perilaku aplikasi saat dokumen ini dibuat

Dokumen ini menjelaskan persiapan yang harus selesai sebelum Attendance dipakai setiap hari. Fokusnya adalah Master Shift, penugasan shift karyawan, Kalender Kerja, Master Perangkat, hak akses, dan pemeriksaan kesiapan operasional.

Untuk proses setelah pengaturan selesai, lanjutkan ke [Operasional Harian Attendance](./KBASE_OPERASIONAL_HARIAN_ATTENDANCE.md). Untuk hasil periode, buka [Rekap Attendance](./KBASE_REKAP_ATTENDANCE.md).

## 1. Tujuan pengaturan Attendance

Pengaturan Attendance dipakai untuk memastikan sistem mengetahui:

- siapa yang aktif dan diizinkan menggunakan Attendance;
- karyawan bekerja di site mana;
- shift dan hari kerja yang berlaku pada suatu tanggal;
- apakah tanggal tersebut hari kerja, libur, atau hari kerja pengganti;
- perangkat mana yang sah untuk mencatat scan pada setiap site;
- pengguna mana yang boleh melihat atau mengubah konfigurasi.

Attendance tidak cukup disiapkan hanya dengan membuat satu shift. Karyawan harus mempunyai histori employment yang konsisten, assignment shift yang berlaku, kalender yang benar, dan terminal aktif pada site yang sama.

## 2. Istilah dasar

### 2.1 Business date

**Business date** adalah tanggal bisnis yang menjadi kunci satu record Attendance per karyawan. Sistem menggunakan zona waktu `Asia/Jakarta`.

Untuk shift biasa, business date umumnya sama dengan tanggal saat scan. Untuk shift lintas tengah malam, scan setelah tengah malam sampai jam akhir shift tetap dapat masuk ke business date hari sebelumnya.

Contoh: shift mulai Senin 22:00 dan selesai Selasa 06:00. Scan Pulang pada Selasa 05:45 tetap merupakan Attendance hari Senin.

### 2.2 Histori efektif

Rekap dan finalisasi mengikuti histori employment serta assignment shift yang berlaku pada setiap tanggal. Data current karyawan membantu operasi saat ini, tetapi tidak boleh dipakai untuk menulis ulang konteks historis.

### 2.3 Toleransi dan jumlah menit

Toleransi adalah ambang sebelum keterlambatan atau pulang awal dihitung.

- Jika selisih belum melewati toleransi, metrik yang disimpan adalah `0`.
- Jika selisih melewati toleransi, sistem menyimpan seluruh selisih dari jam shift, bukan hanya menit setelah toleransi.

Contoh: shift 06:00 dengan toleransi 15 menit. Scan 06:15 menghasilkan 0 menit terlambat, sedangkan scan 06:16 menghasilkan 16 menit terlambat.

## 3. Halaman dan hak akses

| Halaman | Route | Permission utama |
|---|---|---|
| Master Shift | `/attendance/master-shift` | `attendance.manage_shift` |
| Kalender Kerja | `/attendance/kalender-kerja` | `attendance.view`; perubahan membutuhkan `attendance.manage_calendar` |
| Master Perangkat | `/attendance/master-perangkat` | `attendance.manage_device` |
| Scan Attendance | `/attendance/scan` | `attendance.scan` |

Matriks role awal:

| Role | Cakupan pengaturan |
|---|---|
| `SUPER_ADMIN` | Seluruh permission Attendance dan seluruh site. |
| `HR_OFFICER` | Melihat Attendance serta mengelola shift, kalender, perangkat, koreksi, approval, finalisasi, dan ekspor sesuai konfigurasi permission. |
| `SITE_SUPERVISOR` | Pada konfigurasi awal hanya melihat, scan, dan ekspor sesuai site; tidak mengelola master. |

Backend selalu memeriksa permission dan scope site. Pengguna non-Super Admin hanya dapat membaca atau mengubah site yang terdapat pada akses akunnya.

## 4. Master Shift

Satu shift dimiliki oleh satu site dan menyimpan:

| Field | Arti |
|---|---|
| Site | Site tempat shift berlaku; tidak dapat diganti setelah shift dibuat. |
| Kode | Kode unik di dalam site, maksimal 30 karakter. |
| Nama | Nama yang dibaca HR dan tampil pada operasional. |
| Jam masuk | Awal jadwal shift. |
| Jam pulang | Akhir jadwal shift. |
| Lintas tengah malam | Ditentukan otomatis ketika jam pulang lebih kecil daripada jam masuk. |
| Toleransi terlambat | Ambang keterlambatan, 0 sampai 720 menit. |
| Toleransi pulang awal | Ambang pulang awal, 0 sampai 720 menit. |
| Status aktif | Menentukan apakah shift dapat dipakai untuk penugasan dan scan baru. |

Jam masuk dan jam pulang tidak boleh sama. Sistem menerima format jam 24 jam.

### 4.1 Shift awal Borongan

Migration awal menyediakan `BORONGAN_DEFAULT` atau **Shift Borongan** per site dengan jadwal 06:00-15:00 dan toleransi 15 menit untuk masuk maupun pulang. Ini merupakan nilai awal, bukan alasan untuk mengabaikan pemeriksaan konfigurasi aktual.

### 4.2 Mengubah shift

- Kode dan nama dapat disesuaikan selama tetap valid dan unik.
- Site shift tidak dapat dipindahkan.
- Jam atau toleransi shift yang sudah dipakai Attendance tidak dapat diubah.
- Jika jadwal historis sudah dipakai, nonaktifkan shift lama dan buat shift baru untuk periode berikutnya.
- Shift tidak dapat dinonaktifkan jika masih mempunyai assignment aktif atau masa depan.

### 4.3 Menghapus shift

Penghapusan hanya untuk master yang aman dibuang. Shift tidak dapat dihapus jika sudah dipakai Attendance. Penugasan yang belum pernah dipakai dapat ikut dibersihkan oleh proses server, tetapi histori operasional tidak boleh dihapus untuk merapikan tampilan.

## 5. Penugasan shift karyawan

Assignment menghubungkan satu karyawan dengan satu shift untuk sebuah periode dan kumpulan hari kerja.

Informasi assignment:

- karyawan;
- shift;
- tanggal mulai efektif;
- tanggal selesai opsional;
- hari kerja ISO, yaitu 1=Senin sampai 7=Minggu.

### 5.1 Syarat penugasan

- Tanggal mulai hanya boleh hari ini atau masa depan.
- Tanggal selesai tidak boleh sebelum tanggal mulai.
- Minimal satu hari kerja harus dipilih dan tidak boleh duplikat.
- Satu batch dapat memuat maksimal 500 karyawan.
- Karyawan harus berstatus `ACTIVE` dan statusnya mengizinkan Attendance.
- Current site karyawan harus sama dengan site shift.
- Shift harus aktif.
- Assignment seorang karyawan tidak boleh tumpang tindih.

Jika ada tepat satu assignment lama yang masih terbuka pada tanggal assignment baru, sistem menutup assignment lama pada satu hari sebelum tanggal mulai baru. Jika data legacy memiliki lebih dari satu assignment yang tumpang tindih, proses ditolak agar HR memperbaiki konflik terlebih dahulu.

### 5.2 Menghapus assignment

Hanya assignment yang mulai pada masa depan dan belum dipakai Attendance yang dapat dihapus. Assignment berjalan atau historis dipertahankan sebagai bagian dari konteks rekap.

### 5.3 Kesalahan yang perlu dihindari

- Memberi dua assignment pada periode yang sama.
- Memilih hari kerja kosong karena mengira kalender akan mengisinya.
- Menugaskan shift site lain sebelum mutasi/site karyawan efektif.
- Mengubah current site tanpa memastikan histori employment dan assignment berikutnya konsisten.

## 6. Kalender Kerja

Kalender Kerja memutuskan jenis hari setelah sistem mengetahui apakah hari tersebut dijadwalkan oleh assignment shift.

| Jenis | Cakupan | Perilaku |
|---|---|---|
| `NATIONAL_HOLIDAY` | Global | Libur nasional berlaku untuk seluruh site. |
| `COLLECTIVE_LEAVE` | Katalog, lalu dipilih per site | Cuti bersama tidak otomatis berlaku pada semua site. HR memilih site yang menerapkannya. |
| `SITE_HOLIDAY` | Satu site | Menjadikan tanggal tersebut libur pada site terpilih. |
| `WORKDAY_OVERRIDE` | Satu site | Menjadikan tanggal tersebut hari kerja walaupun ada aturan libur lain atau hari tidak dijadwalkan. |

Data kalender resmi tahun 2026 sudah disediakan melalui migration. Cuti bersama hanya menjadi efektif pada site yang dipilih.

### 6.1 Urutan prioritas kalender

Jika beberapa aturan menyentuh site dan tanggal yang sama, sistem memilih dengan urutan:

1. `WORKDAY_OVERRIDE`;
2. `SITE_HOLIDAY`;
3. `COLLECTIVE_LEAVE`;
4. `NATIONAL_HOLIDAY`;
5. jika tidak ada aturan kalender, gunakan hari kerja assignment atau `WEEKLY_OFF`.

Artinya, hari kerja pengganti adalah keputusan paling kuat. Jangan membuat override hanya untuk mempercantik kalender; dampaknya masuk ke finalisasi dan rekap.

### 6.2 Status hari hasil resolusi

| Hasil | Arti |
|---|---|
| `WORKDAY` | Hari kerja berdasarkan assignment atau `WORKDAY_OVERRIDE`. |
| `HOLIDAY` | Libur resmi karena aturan kalender. |
| `NON_WORKDAY` | Libur mingguan karena hari tidak termasuk hari kerja assignment dan tidak dioverride. |

### 6.3 Membuat dan mengubah aturan

- Aturan site hanya dapat dibuat untuk hari ini atau masa depan.
- Nama dan alasan wajib jelas untuk audit.
- Aturan historis tidak dapat diubah.
- Aturan tidak dapat diubah atau dibatalkan setelah dipakai Attendance, klasifikasi Attendance, atau menyentuh Payroll yang sudah `CLOSED`.
- Cuti bersama dikelola melalui pemilihan site pada item katalog, bukan melalui edit aturan site biasa.
- Pembatalan menyimpan waktu, pelaksana, dan alasan; record tidak dihapus diam-diam.

## 7. Master Perangkat

Master Perangkat mendaftarkan browser/terminal yang berhak mengirim scan untuk satu site.

| Field | Arti |
|---|---|
| Site | Site perangkat; tidak dapat dipindahkan setelah dibuat. |
| Kode | Kode unik perangkat di dalam site. |
| Nama | Nama operasional terminal. |
| Tipe | `MOBILE_CAMERA`, `USB_SCANNER`, `TERMINAL`, atau `OTHER`. |
| Lokasi | Keterangan fisik perangkat, opsional. |
| Status aktif | Terminal nonaktif ditolak oleh server. |
| Aktivasi | Menunjukkan apakah browser pernah memperoleh token perangkat. |
| Terakhir aktif | Waktu terakhir terminal berkomunikasi dengan server. |
| Scan | Jumlah event scan yang tercatat. |

### 7.1 Siklus aktivasi

1. Pengelola membuat perangkat dari Master Perangkat.
2. Sistem menampilkan kode aktivasi satu kali.
3. Kode berlaku selama 15 menit.
4. Operator membuka halaman Scan Attendance pada browser terminal.
5. Operator memasukkan kode aktivasi.
6. Server menukar kode dengan token perangkat dan browser menyimpannya secara lokal.
7. Scan berikutnya harus membawa token tersebut dan tetap melewati autentikasi pengguna serta scope site.

Kode aktivasi dan token disimpan server dalam bentuk hash. Kode yang sudah ditukar tidak dapat dipakai kembali.

### 7.2 Membuat ulang aktivasi

Membuat ulang kode aktivasi:

- hanya tersedia untuk perangkat aktif;
- langsung membatalkan token terminal lama;
- mengembalikan perangkat ke kondisi perlu diaktivasi;
- menghasilkan kode baru yang berlaku 15 menit.

Gunakan tindakan ini jika browser diganti, local storage terhapus, perangkat dipindahkan secara fisik dalam site yang sama, atau token diduga bocor.

### 7.3 Nonaktifkan atau hapus

- Nonaktifkan perangkat yang pernah dipakai tetapi tidak boleh menerima scan lagi.
- Perangkat yang sudah mempunyai event scan atau direferensikan Attendance tidak dapat dihapus.
- Penghapusan hanya untuk perangkat salah buat yang benar-benar belum dipakai.

### 7.4 Batasan terminal saat ini

- Terminal membutuhkan koneksi internet; mode offline tidak tersedia.
- Sesi perangkat tersimpan pada browser yang diaktivasi. Membersihkan local storage memutus sesi lokal.
- Dukungan scan kamera bergantung pada kemampuan browser/perangkat. Scanner USB atau input barcode manual tetap tersedia.
- Master perangkat tidak mengubah barcode karyawan. Barcode berasal dari data karyawan.

## 8. Checklist kesiapan sebelum go-live

- [ ] Zona waktu bisnis aplikasi adalah `Asia/Jakarta`.
- [ ] Tanggal go-live Attendance pada environment sudah benar.
- [ ] Seluruh site aktif memiliki shift yang benar.
- [ ] Jam dan toleransi shift sudah disetujui HR/operasional.
- [ ] Shift lintas tengah malam sudah terdeteksi dengan benar.
- [ ] Setiap karyawan aktif memiliki tepat satu assignment yang berlaku.
- [ ] Hari kerja assignment sudah benar.
- [ ] Histori employment tidak tumpang tindih dan site historis konsisten.
- [ ] Libur nasional, cuti bersama terpilih, libur site, dan override sudah diperiksa.
- [ ] Setiap site memiliki perangkat aktif dan teraktivasi.
- [ ] Operator terminal memiliki `attendance.scan` dan akses ke site perangkat.
- [ ] Uji scan Masuk dan Pulang berhasil untuk satu karyawan per site.
- [ ] HR memahami cara melihat abnormal dan menjalankan finalisasi.

## 9. Troubleshooting pengaturan

| Masalah | Pemeriksaan dan tindakan |
|---|---|
| Karyawan tidak muncul sebagai kandidat assignment | Pastikan status `ACTIVE`, status mengizinkan Attendance, dan current site sama dengan site shift. |
| Assignment ditolak tumpang tindih | Periksa assignment berjalan dan masa depan. Konflik legacy lebih dari satu harus ditangani sebelum membuat assignment baru. |
| Shift tidak dapat diubah | Jadwal/toleransi mungkin sudah dipakai Attendance. Buat shift baru untuk periode berikutnya. |
| Shift tidak dapat dinonaktifkan | Masih ada assignment aktif atau masa depan. Siapkan pengganti dan tutup periodenya lebih dahulu. |
| Aturan kalender tidak dapat diubah | Tanggal historis, sudah dipakai Attendance/klasifikasi, atau menyentuh Payroll `CLOSED`. |
| Cuti bersama tidak berlaku di site | Pastikan site dipilih pada katalog cuti bersama. Item katalog saja belum cukup. |
| Kode aktivasi gagal | Pastikan belum lewat 15 menit, perangkat aktif, akun memiliki `attendance.scan`, dan site termasuk scope akun. |
| Terminal tiba-tiba kembali ke aktivasi | Token mungkin dibatalkan melalui regenerate, perangkat dinonaktifkan, local storage dibersihkan, atau akun kehilangan akses site. |
| Perangkat tidak dapat dihapus | Nonaktifkan perangkat; perangkat yang pernah dipakai memang dipertahankan untuk histori. |

## 10. Batasan dan rencana

- Kalender resmi yang disediakan migration saat ini adalah tahun 2026. Tahun berikutnya perlu sumber resmi dan pembaruan data tersendiri.
- Mode scan offline belum tersedia.
- Penghapusan histori shift, assignment, kalender terpakai, dan perangkat terpakai sengaja dibatasi.
- Attendance sebagai gate Setoran Produksi Borongan belum aktif. Milestone 9 direncanakan mewajibkan **scan Masuk terminal sukses**, bukan sekadar status Hadir atau hanya scan Pulang.

## 11. Referensi teknis untuk support dan developer

### 11.1 Tabel utama

| Tabel | Peran |
|---|---|
| `shifts` | Master jam dan toleransi shift per site. |
| `employee_shift_assignments` | Periode dan hari kerja shift karyawan. |
| `attendance_calendar_events` | Katalog libur nasional dan cuti bersama. |
| `attendance_calendar_site_rules` | Pemilihan cuti bersama, libur site, dan override hari kerja. |
| `scan_devices` | Perangkat, hash token, hash kode aktivasi, dan status aktivitas. |
| `employee_employment_histories` | Eligibility, status, dan site historis per tanggal. |
| `audit_logs` | Jejak perubahan konfigurasi. |

### 11.2 Endpoint utama

| Method dan path | Fungsi |
|---|---|
| `GET/POST /api/attendance/shifts` | Daftar dan membuat shift. |
| `PATCH/DELETE /api/attendance/shifts/:uid` | Mengubah atau menghapus shift yang masih aman. |
| `GET /api/attendance/shift-assignments` | Daftar assignment shift. |
| `POST /api/attendance/shift-assignments/batch` | Menugaskan shift maksimal 500 karyawan secara atomik. |
| `DELETE /api/attendance/shift-assignments/:uid` | Menghapus assignment masa depan yang belum dipakai. |
| `GET /api/attendance/work-calendar` | Daftar kalender sesuai scope site. |
| `POST/PATCH /api/attendance/work-calendar` | Membuat atau mengubah aturan site. |
| `POST /api/attendance/work-calendar/:uid/cancel` | Membatalkan aturan site dengan alasan. |
| `PUT /api/attendance/work-calendar/collective-leave/:eventUid/sites` | Memilih site untuk cuti bersama. |
| `GET/POST /api/attendance/devices` | Daftar dan membuat perangkat. |
| `POST /api/attendance/devices/activate` | Menukar kode aktivasi dengan token perangkat. |
| `POST /api/attendance/devices/:uid/regenerate-activation` | Membatalkan token lama dan membuat kode baru. |

### 11.3 File sumber perilaku

| File | Tanggung jawab |
|---|---|
| `apps/api/src/lib/attendance-shift-policy.ts` | Validasi shift, assignment, business date, dan lintas tengah malam. |
| `apps/api/src/lib/attendance-calendar-policy.ts` | Jenis kalender dan urutan prioritas resolusi hari. |
| `apps/api/src/lib/attendance-device-policy.ts` | Aktivasi, token, input scan, dan pemilihan business date shift. |
| `apps/api/src/routes/attendance.ts` | API shift dan assignment. |
| `apps/api/src/routes/attendance-calendar.ts` | API Kalender Kerja. |
| `apps/api/src/routes/attendance-devices.ts` | API perangkat dan aktivasi. |
| `src/features/attendance/master-shift-page.tsx` | UI Master Shift dan Penugasan. |
| `src/features/attendance/work-calendar-page.tsx` | UI kalender dan daftar aturan. |
| `src/features/attendance/device-page.tsx` | UI Master Perangkat. |
| `db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql` | Sumber kebenaran struktur database. |

## 12. Navigasi KBase

- Kembali ke [Indeks Attendance](../../KBASE_ATTENDANCE.md).
- Lanjut ke [Operasional Harian Attendance](./KBASE_OPERASIONAL_HARIAN_ATTENDANCE.md).
- Buka [Rekap Attendance](./KBASE_REKAP_ATTENDANCE.md) untuk hasil periode.
- Lihat [KBase Kontrak Karyawan](../karyawan/KBASE_KONTRAK.md) jika eligibility terganggu oleh status atau histori kerja.
