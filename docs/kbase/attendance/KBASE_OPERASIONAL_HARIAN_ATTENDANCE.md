# Knowledge Base - Operasional Harian Attendance

> Modul: Attendance
>
> Domain: Scan, Monitoring, Koreksi, Klasifikasi, dan Finalisasi
>
> Audiens: Karyawan, operator terminal, HR Officer, Site Supervisor, Super Admin, dan tim support HRIS
>
> Terakhir diverifikasi: 7 Agustus 2026
>
> Status: aktif, sesuai perilaku aplikasi saat dokumen ini dibuat

Dokumen ini menjelaskan pekerjaan Attendance sehari-hari: cara karyawan melakukan scan, cara HR membaca Monitoring Harian, menangani catatan abnormal, memproses koreksi atau klasifikasi, dan memastikan setiap site selesai difinalisasi.

Prasyarat master dijelaskan pada [Pengaturan Attendance](./KBASE_PENGATURAN_ATTENDANCE.md). Hasil akhirnya dijelaskan pada [Rekap Attendance](./KBASE_REKAP_ATTENDANCE.md).

## 1. Alur harian ringkas

1. Operator memastikan terminal menampilkan site dan perangkat yang benar.
2. Karyawan memilih **Masuk** lalu memindai barcode saat mulai bekerja.
3. Karyawan memilih **Pulang** lalu memindai barcode saat selesai bekerja.
4. HR memantau status, jam, dan kualitas record pada Monitoring Harian.
5. HR mengajukan klasifikasi untuk Cuti/Sakit/Izin atau koreksi untuk jam/status yang salah.
6. Pengguna berwenang meninjau request yang masih `PENDING`.
7. Setelah shift melewati jam selesai ditambah grace 60 menit, HR menjalankan finalisasi manual untuk melengkapi Alpha/Libur.
8. HR memastikan tidak ada blocker sebelum menggunakan Rekap Attendance.

## 2. Fakta yang dicatat sistem

### 2.1 Record Attendance

Sistem menyimpan maksimal satu `attendance_records` per karyawan dan business date. Record dapat berisi:

- status Attendance;
- site dan shift;
- business date;
- konteks kalender;
- jam Masuk dan Pulang;
- perangkat dan sumber masing-masing jam;
- menit terlambat, menit pulang awal, dan menit kerja;
- tanda sudah dikoreksi dan catatan.

Status record yang tersimpan:

| Status | Label UI | Arti |
|---|---|---|
| `PRESENT` | Hadir | Ada fakta kehadiran atau status telah ditetapkan Hadir. |
| `ABSENT` | Alpha | Hari kerja tanpa kehadiran/klasifikasi setelah finalisasi. |
| `LEAVE` | Cuti | Klasifikasi Cuti disetujui. |
| `SICK` | Sakit | Klasifikasi Sakit disetujui. |
| `PERMISSION` | Izin | Klasifikasi Izin disetujui. |
| `HOLIDAY` | Libur | Hari libur kalender yang dibentuk finalisasi. |

`WEEKLY_OFF` tampil pada rekap sebagai baris virtual, bukan status yang disimpan pada `attendance_records`.

### 2.2 Event scan

Setiap percobaan scan disimpan terpisah sebagai `attendance_scan_events`, termasuk hasil:

- `SUCCESS`: fakta berhasil diterapkan ke record Attendance;
- `REJECTED`: request dapat dipahami tetapi melanggar aturan bisnis;
- `ERROR`: proses mengalami kegagalan teknis.

Event scan mempertahankan tipe Masuk/Pulang, waktu, barcode, site, perangkat, pesan hasil, metadata request, dan idempotency key. Karena itu, koreksi HR tidak menghapus fakta bahwa scan awal pernah terjadi.

## 3. Business date pada operasional

Semua jam server mengikuti `Asia/Jakarta`.

- Shift biasa memakai tanggal saat scan.
- Shift lintas tengah malam dapat memakai business date hari sebelumnya.
- Saat Pulang, sistem lebih dulu mencari record terbuka pada tanggal hari ini atau kemarin.
- Jika tidak ada record terbuka, sistem memilih akhir shift yang paling dekat dari assignment yang berlaku.
- Waktu koreksi hanya boleh berada pada business date atau satu hari sesudahnya agar shift lintas tengah malam tetap dapat ditangani.

Jangan menyamakan business date dengan tanggal yang terlihat pada jam lokal laptop jika perangkat atau browser menggunakan zona waktu berbeda.

## 4. Operasional Scan Attendance

Halaman `/attendance/scan` membutuhkan `attendance.scan`, autentikasi pengguna, akses ke site perangkat, terminal aktif, dan token perangkat yang valid.

### 4.1 Aktivasi terminal

Jika browser belum terhubung:

1. ambil kode dari Master Perangkat;
2. masukkan kode pada layar Aktivasi Terminal dalam 15 menit;
3. pastikan nama, kode, dan site terminal tampil dengan benar;
4. jangan bagikan kode/token melalui chat atau screenshot.

Terminal membutuhkan internet. Tidak ada antrean scan offline. Sistem tidak meminta foto atau geolocation. Kamera pada halaman terminal hanya dipakai untuk membaca barcode dan tidak menyimpan foto karyawan.

Setelah terminal aktif, bagian identitas menampilkan site, kode perangkat, dan tipe perangkat. Gunakan **Uji kamera** sebelum jam operasional untuk memastikan izin dan kamera browser bekerja tanpa mengirim scan. **Mode kiosk** membuka layar penuh, sedangkan tombol suara mengaktifkan atau mematikan bunyi pendek yang membedakan hasil berhasil, peringatan, dan gagal. Pilihan suara disimpan pada browser terminal tersebut.

### 4.2 Scan Masuk

1. Pilih tab **Masuk**. Pilihan ini eksplisit; sistem tidak menebak Masuk/Pulang dari urutan scan.
2. Pindai barcode kartu karyawan dengan scanner USB, kamera, atau ketik barcode lalu tekan Enter.
3. Tunggu panel hasil menampilkan berhasil atau ditolak.
4. Periksa nama karyawan pada hasil sebelum orang berikutnya memindai.

Scan Masuk yang sukses:

- membuat atau memperbarui record business date menjadi `PRESENT`;
- mengisi `clock_in_at`, perangkat, dan sumber `TERMINAL`;
- menghitung keterlambatan berdasarkan jam shift dan toleransi;
- menyimpan konteks kalender pada saat scan.

Scan Masuk ditolak antara lain jika barcode tidak dikenal, karyawan tidak aktif, site berbeda, tidak ada assignment aktif, assignment tumpang tindih, status sudah Cuti/Sakit/Izin, sudah Masuk, atau record perlu dikoreksi HR.

### 4.3 Scan Pulang

1. Pilih tab **Pulang**.
2. Pindai barcode karyawan.
3. Tunggu hasil dan periksa nama karyawan.

Scan Pulang yang sukses:

- mengisi `clock_out_at`, perangkat, dan sumber `TERMINAL`;
- menghitung pulang awal berdasarkan toleransi;
- menghitung durasi kerja jika jam Masuk tersedia.

Sistem saat ini mengizinkan scan Pulang tanpa jam Masuk. Record tersebut tetap `PRESENT`, tetapi kualitasnya menjadi **Abnormal - Tanpa jam masuk** dan harus ditindaklanjuti HR. Perilaku ini menjaga fakta scan Pulang agar tidak hilang.

### 4.4 Scan pada hari libur

Scan aktual pada hari libur kalender atau libur mingguan tetap dapat tercatat sebagai `PRESENT`. Keterlambatan dan pulang awal dibuat 0 karena hari tersebut bukan workday normal. Rekap menampilkannya sebagai **Hadir Hari Libur**, bukan mengubahnya menjadi Alpha atau Libur.

### 4.5 Scan duplikat dan idempotensi

Frontend membuat idempotency key unik untuk setiap request. Jika request yang sama terkirim ulang karena jaringan, server mengembalikan hasil event sebelumnya dan tidak menggandakan fakta Attendance. Key yang sama tidak boleh dipakai untuk barcode, perangkat, atau tipe event lain.

### 4.6 Putuskan terminal

Aksi **Putuskan** menghapus token dari browser. Aktivasi baru diperlukan untuk menghubungkan browser itu kembali. Jika kode dibuat ulang dari Master Perangkat, token lama juga langsung tidak berlaku.

## 5. Membaca Monitoring Harian

Halaman `/attendance/monitoring-harian` membutuhkan `attendance.view`. Data dibatasi berdasarkan satu business date, filter, dan scope site akun.

Gunakan tombol tanggal sebelumnya/berikutnya untuk pemeriksaan harian, tombol **Hari ini** untuk kembali ke tanggal berjalan, atau Date Picker untuk memilih tanggal tertentu. Sistem membatasi tanggal dari go-live Attendance sampai hari ini.

### 5.1 Kesiapan Attendance per site

Panel kesiapan merangkum kondisi operasional pada site yang sedang difilter:

- karyawan eligible tanpa assignment Shift atau assignment yang tumpang tindih;
- terminal aktif yang sudah atau belum siap dipakai;
- bukti konfigurasi kalender resmi tahun berjalan;
- finalisasi yang diinvalidasi dan harus dijalankan ulang;
- koreksi serta klasifikasi yang masih `PENDING`.

Angka tersebut adalah pemeriksaan kesiapan, bukan jumlah record Attendance hari yang sedang dibuka. Gunakan tombol tindakan pada setiap site untuk menuju Master Shift, Master Perangkat, Kalender Kerja, Tindak Lanjut, atau panel finalisasi. Status kalender **Belum dikonfigurasi** berarti sistem belum menemukan bukti master kalender resmi pada tahun tersebut; status ini tidak menebak apakah suatu tanggal adalah hari kerja.

### 5.2 Panel ringkasan

| Panel | Arti |
|---|---|
| Total | Jumlah record Attendance pada tanggal dan scope filter. |
| Hadir | Record berstatus `PRESENT`. |
| Alpha | Record `ABSENT`, biasanya dibentuk finalisasi hari kerja. |
| Cuti | Klasifikasi `LEAVE` yang sudah diterapkan. |
| Sakit | Klasifikasi `SICK` yang sudah diterapkan. |
| Izin | Klasifikasi `PERMISSION` yang sudah diterapkan. |
| Libur | Record `HOLIDAY` hasil kalender/finalisasi. |
| Abnormal | Record `PRESENT` tanpa salah satu jam yang seharusnya tersedia. |

Panel menghitung data pada tanggal dan scope site yang aktif. Filter kualitas pada tabel tidak mengubah ringkasan dasar status.

### 5.3 Kualitas record

Kualitas bukan status kehadiran.

| Kualitas | Kondisi |
|---|---|
| `NORMAL` | Tidak memenuhi aturan abnormal saat data dibaca. |
| `ABNORMAL` - `MISSING_CLOCK_IN` | Status `PRESENT`, jam Pulang ada, tetapi jam Masuk kosong. |
| `ABNORMAL` - `MISSING_CLOCK_OUT` | Status `PRESENT`, jam Masuk ada, jam Pulang kosong, dan waktu akhir shift sudah lewat. |

Record Masuk yang masih menunggu jam Pulang tidak langsung dianggap abnormal sebelum akhir shift. Terlambat dan pulang awal juga bukan kategori abnormal; keduanya metrik terpisah.

### 5.4 Aksi dan timeline dari Monitoring

- **Lihat timeline** menampilkan urutan terbaru scan, koreksi, klasifikasi, dan finalisasi yang membentuk record. Pada desktop, baris tabel juga dapat dibuka dengan klik, Enter, atau Spasi.
- **Ajukan koreksi** tersedia jika akun memiliki `attendance.correct`.
- **Ajukan klasifikasi** tersedia pada record Alpha bagi HR Officer/Super Admin yang memiliki permission terkait.
- Pengguna hanya dapat memproses record pada site yang dapat diakses.

### 5.5 Tindak Lanjut Attendance

Menu **Tindak Lanjut Attendance** menyatukan workflow Koreksi dan Klasifikasi dalam dua tab. Badge pada masing-masing tab menunjukkan jumlah request `PENDING` sesuai filter site. Angka `…` berarti pemeriksaan masih berjalan, sedangkan `?` berarti jumlah gagal dimuat; daftar tetap dapat dibuka dan dicoba ulang.

## 6. Koreksi Attendance

Koreksi dipakai ketika fakta jam atau status pada satu record perlu disesuaikan. Koreksi tidak mengedit record secara langsung saat diajukan.

### 6.1 Jenis koreksi

| Jenis | Fungsi |
|---|---|
| `CLOCK_IN` | Mengubah atau mengosongkan jam Masuk. |
| `CLOCK_OUT` | Mengubah atau mengosongkan jam Pulang. |
| `BOTH` | Mengubah jam Masuk dan Pulang bersamaan. |
| `STATUS` | Mengubah status Attendance. |

Alasan minimal 5 karakter dan maksimal 500 karakter. Nilai baru harus benar-benar mengubah data. Jam Pulang tidak boleh sebelum jam Masuk, dan waktu harus berada pada business date atau hari berikutnya.

### 6.2 Workflow koreksi

1. Pengguna dengan `attendance.correct` mengajukan koreksi.
2. Request berstatus `PENDING`; pada satu record tidak boleh ada dua koreksi pending.
3. Pengguna dengan `attendance.approve` membuka tab Koreksi pada Tindak Lanjut Attendance.
4. Reviewer memilih `APPROVED` atau `REJECTED`.
5. Catatan review wajib saat menolak.
6. Jika disetujui, server menerapkan perubahan secara atomik dan menghitung ulang menit terlambat, pulang awal, serta durasi.

Pada kebijakan sementara, HR Officer boleh menyetujui koreksi yang dia ajukan sendiri. Jejak pengaju, reviewer, waktu, dan alasan tetap disimpan untuk audit.

Saat jam dikoreksi, sumber jam menjadi `CORRECTION`, referensi perangkat untuk sisi tersebut dikosongkan, dan `is_corrected` menjadi 1. Event scan awal tetap tersimpan.

### 6.3 Perlindungan koreksi

- Request yang sudah ditinjau tidak dapat ditinjau ulang.
- Attendance dalam Payroll `CLOSED` tidak dapat dikoreksi.
- Status `PRESENT` tidak dapat diubah menjadi status lain jika record sudah dipakai transaksi Produksi berstatus `POSTED`.
- Scope site selalu diperiksa.

## 7. Klasifikasi Cuti, Sakit, dan Izin

Klasifikasi dipakai untuk mengubah hari kerja tanpa scan menjadi:

- `LEAVE` - Cuti;
- `SICK` - Sakit;
- `PERMISSION` - Izin.

Klasifikasi ini hanya memberi label Attendance yang telah disetujui. Modul saat ini belum menghitung atau mengurangi saldo cuti.

Halaman Klasifikasi hanya dapat dikelola oleh `HR_OFFICER` atau `SUPER_ADMIN` yang juga memiliki `attendance.correct`/`attendance.approve` sesuai aksi.

### 7.1 Membuat pengajuan

HR memilih karyawan, rentang tanggal, jenis, alasan, dan lampiran opsional. Syarat utamanya:

- karyawan aktif dan mengizinkan Attendance;
- site karyawan berada dalam scope akun;
- tanggal selesai tidak sebelum tanggal mulai;
- rentang maksimal 366 hari;
- tidak ada klasifikasi `PENDING` lain yang tumpang tindih;
- lampiran, jika ada, berupa PDF atau gambar yang diunggah khusus untuk klasifikasi Attendance.

Satu request membuat rincian per tanggal agar hasil penerapan setiap hari dapat dilihat.

### 7.2 Review dan penerapan

Reviewer dapat menyetujui atau menolak request `PENDING`. Catatan wajib untuk penolakan.

Saat disetujui, sistem memeriksa seluruh rentang secara atomik:

- tepat satu assignment shift harus tersedia pada setiap tanggal;
- site shift harus sama dengan site request;
- hari kerja shift harus terisi;
- periode tidak boleh menyentuh Payroll `CLOSED`;
- tanggal tidak boleh sudah mempunyai klasifikasi lain yang `APPLIED`;
- record dengan scan terminal, jam aktual, status Hadir, atau transaksi Produksi tidak boleh ditimpa.

Hari kerja menerima status Cuti/Sakit/Izin. Hari libur kalender menjadi `SKIPPED_HOLIDAY`, sedangkan libur mingguan menjadi `SKIPPED_NON_WORKDAY`. Hari yang dilewati tidak dibuat menjadi record klasifikasi palsu.

### 7.3 Status request dan outcome tanggal

| Status request | Arti |
|---|---|
| `PENDING` | Menunggu keputusan dan masih memblokir kelengkapan rekap. |
| `APPROVED` | Review disetujui; rincian tanggal sudah diterapkan atau dilewati sesuai kalender. |
| `REJECTED` | Ditolak dan tidak diterapkan. |
| `CANCELLED` | Dibatalkan saat masih pending. |

| Outcome tanggal | Arti |
|---|---|
| `PENDING` | Belum diproses reviewer. |
| `APPLIED` | Status diterapkan ke Attendance tanggal tersebut. |
| `SKIPPED_NON_WORKDAY` | Dilewati karena libur mingguan. |
| `SKIPPED_HOLIDAY` | Dilewati karena libur kalender. |

## 8. Finalisasi harian

Finalisasi melengkapi fakta yang belum ada setelah kesempatan scan berakhir. Sistem mempertahankan record hasil scan dan klasifikasi yang sudah ada.

### 8.1 Kapan finalisasi dapat berjalan

- Tanggal tidak boleh sebelum go-live Attendance environment.
- Tanggal tidak boleh berada di masa depan.
- Minimal satu shift yang relevan sudah melewati jam akhir ditambah grace 60 menit.
- Tidak ada finalisasi lain yang sedang berjalan untuk site dan tanggal yang sama.
- Tanggal memang membutuhkan finalisasi.

SOP versi saat ini adalah **finalisasi manual** dari Monitoring Harian. Backend memang sudah memiliki endpoint internal dan orkestrasi untuk otomatisasi, tetapi scheduler tersebut belum menjadi proses operasional aktif. Jangan menunggu cron atau menganggap tanggal sudah final tanpa memeriksa panel finalisasi.

Finalisasi boleh dilakukan pada H+1 atau lebih lambat selama syarat di atas terpenuhi dan Payroll belum mengunci periode. Grace 60 menit adalah waktu paling awal, bukan batas akhir finalisasi.

### 8.2 Hasil per karyawan

| Kondisi | Keputusan finalisasi |
|---|---|
| Record Attendance sudah ada | Dipertahankan. |
| Hari kerja tanpa record | Membuat `ABSENT`/Alpha. |
| Hari libur kalender tanpa record | Membuat `HOLIDAY`. |
| Libur mingguan tanpa scan | Tidak membuat record; rekap menampilkan `WEEKLY_OFF` virtual. |

### 8.3 Status panel finalisasi

| Status UI | Arti |
|---|---|
| `NOT_STARTED` | Belum ada run yang dapat dianggap selesai. |
| `PARTIAL` | Run ada tetapi masih berjalan, terlewat, atau memiliki blocker. |
| `FINALIZED` | Run sukses dan tidak memiliki blocker. |
| `FAILED` | Run terakhir gagal. |
| `NOT_REQUIRED` | Semua target terselesaikan sebagai hari nonkerja; Alpha/Libur tidak perlu dibentuk. |

Panel menampilkan:

- **Eligible**: target karyawan yang memenuhi histori employment;
- **Alpha**: record Alpha yang dibuat;
- **Libur**: record libur kalender yang dibuat;
- **Fakta lama**: record yang sudah ada dan dipertahankan;
- **Libur pekan**: target yang diselesaikan sebagai weekly off virtual;
- **Tertunda**: shift yang belum melewati waktu finalisasi.

Blocker juga dapat berasal dari assignment hilang, assignment ambigu, atau histori employment ambigu.

### 8.4 Finalisasi manual dan finalisasi ulang

Pengguna dengan `attendance.finalize` dapat menjalankan finalisasi dari Monitoring Harian setelah mengisi alasan 3-500 karakter. Finalisasi ulang tetap mempertahankan fakta yang sudah ada dan melengkapi target yang belum selesai.

Jangan menjalankan ulang hanya untuk menghilangkan badge. Baca warning, perbaiki assignment/histori/workflow pending, lalu jalankan ulang dengan alasan yang dapat diaudit.

Attendance versi ini belum menghitung lembur. Scan pada hari libur atau di luar jam shift tetap disimpan sebagai fakta aktual, tetapi tidak otomatis menjadi transaksi atau nilai lembur.

## 9. SOP akhir hari untuk HR

- [ ] Pilih business date dan site yang benar.
- [ ] Pastikan jumlah Hadir, Alpha, Cuti, Sakit, Izin, dan Libur masuk akal.
- [ ] Filter kualitas `ABNORMAL`.
- [ ] Ajukan koreksi untuk jam yang hilang atau salah.
- [ ] Ajukan klasifikasi untuk Alpha yang seharusnya Cuti/Sakit/Izin.
- [ ] Selesaikan seluruh koreksi dan klasifikasi `PENDING`.
- [ ] Tunggu setiap shift melewati grace 60 menit.
- [ ] Jalankan finalisasi manual dari Monitoring Harian jika berwenang.
- [ ] Periksa warning assignment dan histori employment.
- [ ] Jalankan finalisasi ulang setelah blocker diperbaiki.
- [ ] Buka Rekap Attendance dan pastikan periode lengkap.

## 10. Troubleshooting operasional

| Pesan/kondisi | Tindakan |
|---|---|
| Barcode tidak dikenali | Periksa barcode pada data karyawan; jangan membuat barcode pengganti di terminal. |
| Karyawan tidak aktif untuk Attendance | Periksa status karyawan dan histori employment. |
| Site karyawan berbeda dari terminal | Gunakan terminal site yang benar atau selesaikan mutasi/histori secara resmi. |
| Tidak ada assignment aktif | Buat assignment efektif melalui Master Shift; jangan mengubah record langsung lewat SQL. |
| Assignment tumpang tindih/ambigu | Periksa periode assignment dan histori legacy sebelum scan berikutnya. |
| Sudah clock in/clock out | Pastikan tab Masuk/Pulang benar dan lihat Monitoring sebelum mengajukan koreksi. |
| Pulang sukses tetapi Tanpa jam masuk | Fakta Pulang dipertahankan; ajukan koreksi jam Masuk. |
| Terminal kembali ke layar aktivasi | Token tidak valid, perangkat nonaktif, regenerate dilakukan, atau akses site ditolak. |
| Kamera tidak dapat dipakai | Gunakan scanner USB/input manual dan periksa dukungan serta izin kamera browser. |
| Klasifikasi gagal disetujui | Periksa assignment setiap tanggal, kalender, scan yang sudah ada, klasifikasi lain, Produksi, dan Payroll `CLOSED`. |
| Koreksi ditolak karena Payroll closing | Data periode sudah dikunci; eskalasi sesuai prosedur Payroll, bukan mengubah database. |
| Finalisasi tetap Partial | Selesaikan Tertunda, assignment hilang/ambigu, histori ambigu, koreksi pending, dan klasifikasi pending. |
| Tanggal belum final | Pastikan waktu due sudah lewat, lalu jalankan finalisasi manual dari Monitoring Harian. |

## 11. Keputusan rencana Milestone 9

Gate Attendance untuk Setoran Produksi Borongan **belum aktif**. Keputusan bisnis untuk implementasi Milestone 9 adalah:

- wajib ada scan **Masuk** terminal yang sukses;
- status harus Hadir;
- business date harus sama dengan tanggal setoran;
- site Attendance harus sama dengan site setoran.

Scan Pulang saja, koreksi manual saja, atau status Hadir tanpa scan Masuk tidak akan memenuhi gate yang direncanakan. Sampai Milestone 9 benar-benar dibangun dan diuji, jangan menganggap Attendance sudah menolak transaksi Produksi.

## 12. Referensi teknis untuk support dan developer

### 12.1 Tabel utama

| Tabel | Peran |
|---|---|
| `attendance_records` | Fakta akhir per karyawan-business date. |
| `attendance_scan_events` | Histori semua percobaan scan sukses, ditolak, atau error. |
| `attendance_corrections` | Request, review, dan waktu penerapan koreksi. |
| `attendance_classification_requests` | Header request Cuti/Sakit/Izin. |
| `attendance_classification_details` | Outcome per tanggal dalam rentang klasifikasi. |
| `attendance_daily_finalization_runs` | Run finalisasi per site dan business date. |
| `cron_runs` | Jejak pemanggilan endpoint otomatis bila kelak scheduler diaktifkan; bukan bukti cron sedang operasional. |
| `audit_logs` | Jejak tindakan pengguna dan sistem. |

### 12.2 Endpoint utama

| Method dan path | Fungsi |
|---|---|
| `POST /api/attendance/terminal/scan` | Mencatat scan Masuk/Pulang dengan token perangkat. |
| `GET /api/attendance/monitoring` | Data dan ringkasan Monitoring Harian. |
| `GET /api/attendance/readiness` | Ringkasan kesiapan Shift, perangkat, kalender, finalisasi, dan workflow per site. |
| `GET /api/attendance/records/:uid/timeline` | Timeline audit satu record Attendance berdasarkan UID publik. |
| `GET/POST /api/attendance/corrections` | Daftar dan pengajuan koreksi. |
| `POST /api/attendance/corrections/:uid/review` | Menyetujui atau menolak koreksi. |
| `GET/POST /api/attendance/classifications` | Daftar dan pengajuan klasifikasi. |
| `POST /api/attendance/classifications/:uid/cancel` | Membatalkan klasifikasi pending. |
| `POST /api/attendance/classifications/:uid/review` | Menyetujui atau menolak klasifikasi. |
| `GET /api/attendance/finalizations` | Status finalisasi per site/tanggal. |
| `POST /api/attendance/finalizations/run` | Menjalankan finalisasi manual. |
| `POST /api/internal/attendance/finalize` | Jalur internal yang tersedia untuk otomatisasi mendatang; belum menjadi SOP aktif. |

### 12.3 File sumber perilaku

| File | Tanggung jawab |
|---|---|
| `apps/api/src/routes/attendance-terminal.ts` | Transaksi scan dan event mentah. |
| `apps/api/src/routes/attendance-insights.ts` | Readiness per site dan timeline record Attendance. |
| `apps/api/src/lib/attendance-device-policy.ts` | Input scan, idempotensi, dan business date lintas tengah malam. |
| `apps/api/src/lib/attendance-correction-policy.ts` | Validasi koreksi dan derivasi abnormal. |
| `apps/api/src/routes/attendance-corrections.ts` | Workflow koreksi dan penerapannya. |
| `apps/api/src/routes/attendance-classifications.ts` | Workflow Cuti/Sakit/Izin per tanggal. |
| `apps/api/src/lib/attendance-finalization.ts` | Resolusi target dan transaksi finalisasi. |
| `apps/api/src/lib/attendance-finalization-policy.ts` | Grace, status, dan blocker finalisasi. |
| `apps/api/src/lib/attendance-finalization-cron.ts` | Orkestrasi teknis untuk otomatisasi mendatang; SOP saat ini tetap manual. |
| `src/features/attendance/terminal-scan-page.tsx` | UI aktivasi dan terminal scan. |
| `src/features/attendance/monitoring-page.tsx` | UI Monitoring Harian dan aksi lanjutan. |

## 13. Navigasi KBase

- Kembali ke [Indeks Attendance](../../KBASE_ATTENDANCE.md).
- Kembali ke [Pengaturan Attendance](./KBASE_PENGATURAN_ATTENDANCE.md) untuk master dan readiness.
- Lanjut ke [Rekap Attendance](./KBASE_REKAP_ATTENDANCE.md).
