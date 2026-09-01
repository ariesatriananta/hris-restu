## Konteks produk
Project ini adalah HRIS internal PT Restu Sejati Inti Abadi untuk tiga site operasional: Jepara, Semarang, dan Klaten. Fokus utama sesuai PRD:
- master dan histori karyawan;
- PKWT, ID card, dan dokumen karyawan;
- attendance masuk/pulang melalui scan barcode di browser HP;
- setoran produksi borongan melalui scanner barcode USB;
- tarif pekerjaan borongan yang berbeda dan memiliki histori per site;
- payroll borongan, simulasi, approval, closing, snapshot, slip gaji, dan histori;
- fondasi shift dan payroll bulanan untuk staff/non-produksi;
- role-based access, site-based access, dan audit trail.
Jumlah pekerja borongan diperkirakan sekitar 400 orang per site. Halaman operasional harus cepat, jelas, tahan terhadap input berulang, dan nyaman digunakan pada jam kerja.

## Aturan bisnis penting
- Jenis karyawan operasional: `BORONGAN`, `HARIAN`, `BULANAN`, dan `TRAINING`.
- Skema upah memisahkan basis kalkulasi dan frekuensi pembayaran:
  `BORONGAN = PIECE_RATE/WEEKLY`, `HARIAN = TIME_BASED/WEEKLY`,
  `TRAINING = TIME_BASED/WEEKLY`, dan `BULANAN = TIME_BASED/MONTHLY`.
- Karyawan `BORONGAN` dan `TRAINING` tetap eligible untuk penugasan dan
  pencatatan Produksi selama histori employment efektifnya mengizinkan
  Produksi. Hasil Produksi Training hanya menjadi fakta monitoring dan tidak
  menjadi sumber nominal Payroll.
- Semua jenis karyawan wajib memiliki penempatan Modul dan Bagian produksi pada registrasi dan mutasi.
- Kombinasi jenis kontrak dan jenis karyawan berlaku ketat: kontrak `TRAINING`
  hanya untuk jenis karyawan `TRAINING`, sedangkan `PKWT`/`PKWTT` hanya untuk
  `BORONGAN`, `HARIAN`, atau `BULANAN`.
- Cetak template kontrak produksi tahap pertama hanya untuk kombinasi karyawan `BORONGAN` dengan kontrak `PKWT`.
- Kontrak `ACTIVE` tidak dapat dikoreksi periodenya. Salah aktivasi hanya dapat dibatalkan menjadi `CANCELLED` bila belum memiliki tanda tangan/lampiran dan belum digunakan oleh attendance, produksi, payroll, histori lanjutan, atau status kerja terjadwal; selain itu gunakan Terminasi lalu buat kontrak baru.
- Aktivasi kontrak membuat status karyawan `ACTIVE` efektif sejak tanggal mulai kontrak, termasuk ketika HR terlambat menjalankan aktivasi. Aktivasi ditolak bila penyelarasan mundur akan melewati histori employment yang lebih baru.
- Penugasan Shift pertama boleh dimundurkan paling awal ke tanggal terbesar antara go-live Attendance dan awal histori employment `ACTIVE` yang eligible pada site Shift. Karyawan yang pernah memiliki assignment hanya dapat memakai form penugasan biasa mulai hari ini atau masa depan.
- Kesalahan assignment Shift yang sudah berlaku diperbaiki melalui Koreksi Penugasan Shift historis, bukan dengan menimpa atau menghapus histori. Koreksi diterapkan langsung oleh pengguna berizin `attendance.manage_shift`, wajib memiliki alasan dan preview dampak, menyusun ulang timeline tanpa overlap, merekonsiliasi snapshot Attendance tanpa mengubah scan mentah, serta menginvalidasi finalisasi terdampak. Koreksi diblokir untuk setoran produksi `POSTED`, payroll yang sudah dihitung/disetujui/ditutup, atau finalisasi yang sedang berjalan.
- Koreksi Penugasan Shift dapat dibuat berlaku seterusnya hanya untuk assignment paling akhir. Karyawan wajib masih `ACTIVE`, eligible Attendance, dan tetap berada pada site Shift; tidak boleh ada assignment, mutasi, atau perubahan status terjadwal setelahnya. Rentang terbuka disimpan dengan `effective_to=NULL`, sedangkan rekonsiliasi Attendance dan invalidasi finalisasi hanya diproses sampai tanggal hari ini.
- Laporan Penugasan Shift merupakan snapshot baca-saja per tanggal acuan untuk
  seluruh karyawan yang eligible Attendance. Laporan memilih penugasan efektif
  secara deterministik; bila tidak ada, penugasan terakhir atau terdekat tetap
  ditampilkan agar kondisi berakhir atau belum mulai dapat dipahami. Riwayat
  kerja atau penugasan efektif yang bertumpang-tindih, site Shift yang berbeda,
  Shift nonaktif, serta hari kerja kosong wajib ditandai sebagai kondisi yang
  perlu diperiksa dan tidak boleh disamarkan sebagai penugasan siap.
- Laporan Perangkat dan Aktivitas Scan merupakan ringkasan baca-saja per
  perangkat dan periode. Kondisi aktivitas hanya dihitung dari
  `attendance_scan_events`; perangkat nonaktif, belum diaktivasi untuk
  Attendance, tanpa aktivitas, atau memiliki scan `REJECTED`/`ERROR` wajib
  dibedakan dengan bahasa yang mudah dipahami. `scan_devices.last_seen_at`
  dapat diperbarui oleh Attendance maupun Produksi sehingga hanya boleh
  ditampilkan sebagai waktu koneksi umum, bukan bukti kesehatan Attendance.
- Laporan Audit Aktivitas Pengguna membutuhkan `reports.view` dan `audit.view`,
  memakai rentang maksimal 366 hari, serta mengikuti cakupan site akun di API.
  Pengguna non-Super Admin tidak boleh melihat aktivitas global atau site di
  luar aksesnya. Ringkasan hanya menghitung tindakan yang benar-benar tersimpan
  pada `audit_logs`; laporan tidak boleh menebak status berhasil atau gagal
  karena status tersebut tidak tersedia pada sumber data.
- Ekspor Laporan Audit Aktivitas Pengguna memakai filter yang sama dengan layar
  dan tidak boleh memuat alamat IP, user agent, maupun isi `before_data` dan
  `after_data`. Ekspor tetap mencatat identitas permintaan, jumlah baris, dan
  checksum berkas pada Audit Trail.
- Klasifikasi Attendance `APPROVED` yang salah dibatalkan melalui reversal oleh pengguna berizin `attendance.approve`, bukan melalui Koreksi Attendance. Reversal wajib memiliki alasan, mempertahankan histori detail sebagai `REVERSED`, mengembalikan hari yang pernah diterapkan menjadi `ABSENT`, dan menginvalidasi finalisasi terkait. Reversal ditolak bila fakta Attendance sudah berubah, memiliki scan sukses atau setoran produksi `POSTED`, maupun sudah masuk perhitungan atau snapshot Payroll.
- Attendance merupakan syarat setoran produksi pada business date yang sama.
- Pekerja borongan dibayar berdasarkan hasil produksi, bukan durasi kerja.
- Satu karyawan dapat melakukan setoran produksi lebih dari satu kali dalam sehari.
- Tarif pekerjaan berbeda per site dan memiliki periode berlaku.
- Tarif Produksi baru selalu dibuat sebagai `DRAFT` dan baru dipakai setelah
  aktivasi eksplisit. Tarif aktif untuk site dan pekerjaan yang sama tidak boleh
  overlap; penggantian tarif menutup histori lama pada H-1.
- Penugasan pekerjaan Produksi disimpan sebagai histori, tidak dihapus atau
  ditimpa. Satu pekerja maksimal memiliki satu pekerjaan utama efektif pada
  tanggal yang sama.
- Transaksi produksi menyimpan snapshot tarif agar histori tidak berubah saat tarif diperbarui.
- Koreksi transaksi Produksi bersifat append-only dan dapat diterapkan langsung
  oleh pengguna dengan permission `production.correct` atau `SUPER_ADMIN`, tanpa
  approval. Koreksi hanya mengganti pekerjaan dan kuantitas: transaksi sumber
  menjadi `VOID`, transaksi pengganti mempertahankan karyawan, site, tanggal,
  waktu transaksi, Attendance, perangkat, dan kelompok kerja sumber, sedangkan
  revision menyimpan snapshot before/after serta alasan. Void tanpa pengganti
  juga wajib dicatat sebagai revision.
- Koreksi dan void Produksi diblokir ketika transaksi sudah dikunci atau masuk
  snapshot Payroll, berada pada periode `CALCULATED`, `APPROVED`, atau `CLOSED`,
  maupun ketika run Payroll terkait sedang berjalan. Payroll `CLOSED` tidak
  dapat dibuka dari modul Produksi.
- Rekap Produksi bersifat live dan read-only sampai transaksi disnapshot ke
  Payroll. Rekap hanya menghitung transaksi `POSTED`; transaksi `VOID` tidak
  dihitung dan transaksi pengganti hasil koreksi dihitung sebagai fakta baru.
  Kuantitas wajib diagregasi per satuan dan tidak boleh menjumlahkan `PCS`,
  `KG`, `BOX`, atau satuan berbeda menjadi satu total. Nilai bruto boleh
  dijumlahkan lintas pekerjaan karena seluruh transaksi memakai mata uang IDR.
- Baris utama Rekap Produksi dibentuk per karyawan dan site. Identitas
  penempatan dibaca dari histori employment efektif pada tanggal transaksi,
  sedangkan kelompok kerja mengikuti snapshot `production_transactions`.
  Status Payroll pada rekap berarti belum, sebagian, atau seluruh transaksi
  sudah disnapshot; status tersebut tidak menyatakan gaji sudah dibayar.
- Payroll draft/simulasi dapat dihitung ulang. Payroll yang sudah closing bersifat immutable.
- Koreksi setelah payroll closing tidak termasuk scope saat ini.
- Implementasi Payroll pertama hanya untuk `PIECE_RATE/WEEKLY`. Perluasan
  berikutnya mencakup `TIME_BASED/WEEKLY` untuk HARIAN/TRAINING dan
  `TIME_BASED/MONTHLY` untuk BULANAN dengan policy effective-dated yang
  disnapshot pada periode serta run.
- Periode Payroll `PIECE_RATE` dibuat fleksibel per site dengan rentang maksimal
  31 hari dan tidak boleh overlap dengan periode non-cancelled pada site serta
  basis Payroll yang sama.
- Nilai produksi Payroll merupakan penjumlahan snapshot
  `production_transactions.gross_amount` berstatus `POSTED`; Payroll tidak
  menghitung ulang kuantitas menggunakan tarif master terbaru.
- Populasi Payroll mengikuti fakta historis dalam periode. Karyawan yang sudah
  resign tetap dibayar bila memiliki transaksi Produksi eligible, sedangkan
  karyawan tanpa transaksi hanya disertakan bila mempunyai bonus atau
  adjustment manual pada periode tersebut.
- Attendance pada Payroll Borongan berfungsi sebagai readiness dan snapshot
  informasi, bukan pengali otomatis upah. Alpha, keterlambatan, dan pulang awal
  hanya memengaruhi nominal melalui komponen potongan eksplisit yang dapat
  diaudit.
- Hanya `BORONGAN` yang mengikuti Payroll `PIECE_RATE`. `TRAINING` tetap boleh
  memiliki assignment dan transaksi Produksi untuk monitoring, tetapi dibayar
  melalui tarif harian dan hanya Attendance final `PRESENT` yang menjadi hari
  bayar.
- Periode `TIME_BASED/WEEKLY` selalu Senin-Minggu dan boleh melintasi bulan.
  Periode `TIME_BASED/MONTHLY` mengikuti policy cutoff; default awal adalah
  `LAST_DAY` sehingga periodenya tanggal 1 sampai akhir bulan.
- Periode mingguan `HARIAN` dan `TRAINING` dibuat terpisah. Pembuatan periode
  memakai tanggal acuan, menyelesaikan tepat satu policy historis, dan menyimpan
  snapshot policy secara atomik bersama periode Draft.
- Kehadiran final `PRESENT` pada hari nonkerja untuk HARIAN/TRAINING tetap
  dihitung sebagai satu hari bayar dan ditandai sebagai warning operasional.
- Preview kesiapan berbasis waktu tidak membuat run atau hasil finansial
  permanen. Policy, kontrak, histori tarif/gaji, Attendance, dan currency yang
  tidak lengkap tetap menjadi blocker walaupun ada komponen manual.
- Simulasi mingguan HARIAN/TRAINING menyertakan seluruh karyawan eligible,
  termasuk karyawan tanpa Attendance `PRESENT`; upah dasar karyawan tersebut
  bernilai nol. Nominal harian dijumlahkan per karyawan lalu dibulatkan satu
  kali menggunakan `HALF_UP` ke Rp1 sesuai policy snapshot.
- Snapshot waktu disimpan per karyawan dan tanggal eligible. Hari nonkerja
  hanya dibayar apabila Attendance final benar-benar `PRESENT` dan wajib
  ditandai sebagai perhatian untuk pengguna.
- Pada simulasi mingguan HARIAN/TRAINING hanya komponen manual periode yang
  diterapkan. Komponen berulang diblokir sampai aturan frekuensi dan proratanya
  ditetapkan.
- Produksi karyawan TRAINING hanya menjadi informasi monitoring kuantitas per
  pekerjaan dan satuan. Nilai bruto Produksi tidak boleh menambah upah dasar,
  gross, maupun neto Payroll berbasis waktu.
- Run `TIME_BASED` memakai workflow resmi yang sama dengan `PIECE_RATE` setelah
  lolos pemeriksaan integritas snapshot sesuai skemanya. Submit, approval,
  closing, export, dan slip tidak boleh melewati blocker readiness, perubahan
  sumber, neto negatif, rekening tidak lengkap, atau current run yang stale.
- Closing mengesahkan hasil Payroll dan membuat current run menjadi `FINAL`,
  tetapi tidak menyatakan gaji sudah ditransfer atau diterima karyawan.
- Perubahan gaji pokok Bulanan di tengah periode atau snapshot policy yang tidak
  cocok dengan identitas periode menjadi blocker dan wajib diperbaiki sebelum
  perhitungan resmi.
- Policy Payroll bersifat versioned, effective-dated, wajib per site,
  tervalidasi, dan disnapshot. Inheritance policy global/site belum digunakan
  pada M5A1 agar resolusi policy tetap tunggal. Perubahan hanya berlaku ke
  periode baru dan tidak boleh mengubah Payroll yang sudah diajukan,
  disetujui, atau ditutup.
- Perubahan gaji pokok BULANAN hanya boleh efektif tepat pada awal periode
  Payroll. Gaji pokok pertama karyawan yang join di tengah periode boleh mulai
  pada tanggal awal eligibility; pengecualian ini tidak berlaku untuk perubahan
  nominal lanjutan. Join/resign diprorata memakai hari kalender eligible.
- Alpha dan Izin karyawan BULANAN dicatat sebagai potongan eksplisit dengan
  rumus default `gaji pokok / jumlah hari kerja terjadwal dalam periode x
  jumlah hari Alpha/Izin`. Kalkulasi dibulatkan `HALF_UP` ke Rp1 per komponen
  karyawan.
- Pembagi potongan BULANAN memakai seluruh hari kerja terjadwal dalam periode,
  bukan hanya hari setelah join atau sebelum resign. Jadwal mengikuti histori
  shift; hari libur resmi/site dikeluarkan, sedangkan `WORKDAY_OVERRIDE`
  dimasukkan walaupun jatuh pada hari yang biasanya libur. Pembilang Alpha dan
  Izin tetap hanya memakai tanggal eligible karyawan.
- `SICK`, `LEAVE`, hari libur, dan hari nonkerja tidak membentuk potongan
  otomatis BULANAN. Alpha dan Izin disnapshot sebagai dua komponen sistem
  terpisah agar formula dan pembulatannya dapat diaudit.
- Policy Payroll tahap awal hanya dapat dikelola `SUPER_ADMIN`.
  `PAYROLL_FINANCE` hanya melihat policy sesuai akses site; pembatasan ini
  wajib ditegakkan API.
- Bonus, tunjangan, penalti, pinjaman, dan potongan lain dikelola sebagai
  komponen eksplisit per periode. Pajak dan BPJS belum dihitung otomatis pada
  fase awal.
- Jika total potongan melebihi pendapatan, approval dan closing diblokir sampai
  komponen diperbaiki; sistem tidak boleh diam-diam membulatkan net pay menjadi
  nol.
- Simulasi Payroll tetap menyimpan dan menampilkan nilai neto negatif agar
  sumber masalah dapat diperiksa. Run simulasi boleh selesai, tetapi hasil
  tersebut tidak boleh diajukan atau ditutup sebelum komponennya diperbaiki.
- Komponen Payroll `FIXED` yang efektif pada minimal satu hari dalam periode
  `PIECE_RATE` diterapkan penuh satu kali tanpa prorata. Penyesuaian khusus
  dilakukan melalui komponen manual per periode.
- Dalam satu periode, satu karyawan hanya boleh memiliki satu komponen manual
  aktif untuk jenis komponen yang sama. Koreksi atau pembatalan wajib beralasan,
  tercatat dalam audit, dan tidak mengubah snapshot run yang sudah selesai.
- Simulasi hanya dapat dimulai ketika readiness tidak `BLOCKED`. Status
  `ATTENTION` tetap dapat dihitung setelah pengguna meninjau peringatannya.
- Kalkulasi Payroll wajib idempotent dan mempertahankan histori run. Hitung
  ulang membuat run baru, sedangkan kegagalan tidak boleh meninggalkan snapshot
  atau lock sumber dan tidak boleh mengganti run sukses sebelumnya.
- Nominal Payroll disimpan dengan presisi dua desimal. Tampilan tidak perlu
  menunjukkan pecahan nol, tetapi pecahan yang benar-benar ada tidak boleh
  dibuang.
- Workflow periode adalah `DRAFT -> CALCULATED -> APPROVED -> CLOSED`.
  `CANCELLED` hanya boleh dari `DRAFT`; hitung ulang hanya boleh pada
  `CALCULATED` yang belum memiliki approval pending/approved dan menghasilkan
  run baru tanpa menghapus histori run sebelumnya.
- Approval wajib menunjuk run perhitungan tertentu. Pembuat run tidak boleh
  menyetujui run miliknya sendiri, kecuali `SUPER_ADMIN` untuk recovery yang
  tetap dicatat pada audit trail.
- Pengajuan approval hanya boleh memakai current run `COMPLETED` yang masih
  konsisten dengan snapshot dan sumbernya. Periode tetap `CALCULATED` selama
  pengajuan menunggu keputusan. Readiness `ATTENTION` boleh diajukan, tetapi
  readiness `BLOCKED`, rekening snapshot tidak lengkap, neto negatif, hasil
  kosong, atau total tidak konsisten memblokir pengajuan, approval, dan closing.
- Approval awal hanya satu tingkat oleh Direksi. Pengguna selain `SUPER_ADMIN`
  tidak boleh menyetujui run yang dibuat atau diajukannya sendiri.
  `SUPER_ADMIN` boleh menghitung, mengajukan, self-approve, menolak, menarik,
  dan menutup Payroll lintas site; self-approval wajib ditandai sebagai override
  pada audit trail.
- Pengajuan `PENDING` dapat ditarik dengan alasan, sedangkan penolakan juga wajib
  beralasan. Run yang ditolak atau ditarik tidak boleh diajukan ulang; pengguna
  wajib menghitung ulang dan mengajukan run baru agar histori tetap immutable.
- Closing hanya dapat dilakukan terhadap current run yang sudah disetujui dan
  secara atomik mengubah periode menjadi `CLOSED` serta run menjadi `FINAL`.
  Payroll `CLOSED` tidak dapat dibuka kembali dan tidak berarti pembayaran atau
  transfer dana sudah dilakukan.
- Slip resmi hanya bersumber dari Payroll `CLOSED`. Hasil `CALCULATED` hanya
  boleh dipratinjau dengan penanda Simulasi; status `CLOSED` tidak menyatakan
  pembayaran atau transfer sudah dilakukan.
- Riwayat Payroll mempertahankan seluruh run. Perbandingan hanya boleh dilakukan
  terhadap tepat dua run `COMPLETED` dalam periode yang sama dan seluruh angka
  harus berasal dari snapshot masing-masing run.
- Rekap Payroll selalu menyamarkan rekening. Rekening lengkap hanya boleh ada
  pada Daftar Pembayaran dari current run `FINAL` pada periode `CLOSED`, untuk
  Payroll Finance sesuai akses site dan `SUPER_ADMIN` lintas site.
- Pengguna `payroll.view` boleh melihat preview slip dengan rekening
  disamarkan. Cetak individual dan massal hanya untuk pengguna berizin
  `payroll.print`; Direksi tidak mendapat akses cetak massal secara default.
- Identitas perusahaan pada slip resmi disnapshot saat closing. Nama dan alamat
  wajib tersedia, logo opsional, sedangkan snapshot periode lama harus ditandai
  sebagai backfill legacy dan tidak boleh diklaim sebagai profil historis asli.
- Export dan penerbitan data cetak wajib idempotent dan tercatat pada audit.
  Sistem tidak menyimpan binary PDF pada fase awal dan catatan penerbitan tidak
  berarti kertas sudah dicetak atau pembayaran telah dilakukan.
- Semua aksi penting dan koreksi harus dapat ditelusuri melalui audit trail.
- Exception Produksi wajib memakai preview lalu apply, alasan, idempotency,
  audit trail, pembatasan site, dan guard Payroll.
- Setoran susulan tidak boleh bertanggal masa depan dan tetap wajib mempunyai
  Attendance Hadir serta scan Masuk sukses pada tanggal tersebut.
- Snapshot Produksi tidak pernah di-reprice. Koreksi membuat transaksi
  pengganti; perubahan nilai setelah snapshot ditangani sebagai adjustment
  Payroll.
- Assignment pekerjaan mengikuti timeline employment. Perubahan employment
  menutup atau membatalkan assignment yang tidak lagi eligible.
- Identitas global perusahaan bersumber dari pengaturan `company.profile`. Nama
  dan alamat pada pengaturan Kontrak mengikuti profil tersebut, sedangkan nama
  serta jabatan direktur tetap menjadi konfigurasi pihak penandatangan PKWT.
  Snapshot kontrak yang sudah dibuat tidak berubah ketika profil diperbarui.
- Pengaturan Attendance tidak menduplikasi Master Shift, Perangkat, dan Kalender
  Kerja. Tanggal go-live, timezone efektif, dan grace finalisasi ditampilkan
  sebagai kebijakan read-only selama source engine-nya masih environment atau
  kebijakan tetap; toggle hanya boleh ditampilkan setelah benar-benar dipakai
  oleh engine operasional.
- Halaman User & Hak Akses hanya dapat dibuka dan digunakan oleh `SUPER_ADMIN`.
  Pembatasan wajib berlaku pada menu, halaman, dan API; menyembunyikan menu saja
  tidak dianggap cukup.
- Setiap akun wajib memiliki minimal satu role aktif. Role operasional selain
  `SUPER_ADMIN` dan `DIRECTOR` wajib memiliki minimal satu akses site, dan site
  utama wajib termasuk di dalam daftar akses site akun tersebut.
- Identitas role bawaan sistem, seperti kode dan nama role, tidak dapat diubah
  dari halaman User & Hak Akses. Hak akses `SUPER_ADMIN` selalu penuh dan tidak
  dapat dikurangi, sedangkan permission role sistem lainnya dapat disesuaikan
  oleh `SUPER_ADMIN` serta wajib tercatat pada audit trail.
- `SUPER_ADMIN` tidak boleh menonaktifkan, mengunci, atau mencabut role
  `SUPER_ADMIN` dari akun yang sedang digunakannya. Sistem juga wajib menjaga
  agar selalu tersedia minimal satu akun `SUPER_ADMIN` aktif.
- Pembuatan akun dan reset kata sandi oleh administrator memakai kata sandi
  sementara. Seluruh sesi lama akun tujuan dicabut dan pengguna wajib mengganti
  kata sandi tersebut melalui Profil Saya sebelum memakai modul lain. Kata
  sandi asli maupun hash kata sandi tidak boleh disimpan dalam audit trail.
- Perubahan status, role, akses site, dan permission mencabut sesi yang sudah
  tidak layak memakai akses lama. Jika `SUPER_ADMIN` mengubah akses akunnya
  sendiri tanpa melanggar aturan pengaman, sesi yang sedang dipakai tetap
  dipertahankan agar proses tidak terputus, sedangkan sesi lainnya dicabut.
- Audit Trail hanya dapat dilihat oleh pengguna dengan permission `audit.view`.
  `SUPER_ADMIN` dapat melihat catatan lintas site dan catatan sistem yang tidak
  terikat site. Pengguna lain yang diberi permission tersebut hanya dapat
  melihat catatan pada site yang termasuk aksesnya; catatan global tanpa site
  tidak boleh ditampilkan.
- Audit Trail bersifat baca saja dan diurutkan dari aktivitas terbaru. Respons
  daftar maupun detail memakai UID publik serta tidak boleh mengekspos ID
  internal. Kata sandi, hash, token, cookie, secret, credential, API key, dan
  data sesi wajib disamarkan secara rekursif sebelum dikirim oleh API.
- Filter atau pencarian Audit Trail tidak boleh mengubah maupun membuat catatan
  baru. Catatan yang berada di luar cakupan site pengguna harus diperlakukan
  sebagai tidak ditemukan, termasuk ketika UID catatan diminta langsung.
- Pusat Laporan hanya dapat dibuka oleh pengguna dengan permission
  `reports.view`. Setiap laporan tetap wajib memeriksa permission modul sumber;
  Laporan Karyawan membutuhkan `employees.view` dan Laporan Attendance
  membutuhkan `attendance.view`.
- Cakupan site pada laporan wajib dibatasi oleh `user_site_access` di API.
  Menyembunyikan pilihan site pada tampilan tidak dianggap sebagai pengamanan.
- Laporan Karyawan per tanggal menggunakan histori employment yang efektif pada
  tanggal pilihan. Site, jenis, status, jabatan, serta bagian produksi saat ini
  tidak boleh dipakai untuk menggantikan kondisi historis tersebut.
- Laporan Attendance menggunakan proyeksi dan aturan yang sama dengan Rekap
  Attendance. Laporan hanya berstatus `Resmi` bila seluruh kombinasi site dan
  tanggal dalam periode telah memenuhi syarat finalisasi; selain itu harus
  ditampilkan sebagai `Sementara` beserta alasan ketidaklengkapannya.
- Laporan Cuti, Sakit & Izin membutuhkan `reports.view` dan `attendance.view`.
  Periode pilihan maksimal 366 hari dan memuat pengajuan yang rentang
  tanggalnya bersinggungan dengan periode pilihan. Site mengikuti site pada
  pengajuan, sedangkan jenis karyawan dan bagian produksi mengikuti tepat satu
  histori kerja yang efektif pada tanggal mulai pengajuan. Histori yang hilang
  atau tumpang-tindih harus ditandai untuk diperiksa dan tidak boleh
  menggandakan baris pengajuan.
- Laporan Cuti, Sakit & Izin hanya menampilkan status alur dan ringkasan hasil
  penerapan per hari. Alasan pengajuan, catatan pemeriksaan, catatan detail,
  serta metadata atau berkas lampiran tidak boleh dikirim oleh API maupun
  dimasukkan ke Excel karena dapat memuat informasi pribadi atau kesehatan.
  Ekspor membutuhkan `attendance.export`, memakai filter dan cakupan site yang
  sama dengan hasil layar, serta dicatat pada audit trail per site.
- Laporan Koreksi Attendance membutuhkan `reports.view` dan `attendance.view`.
  Periode pilihan maksimal 366 hari berdasarkan tanggal kerja pada record
  Attendance, bukan tanggal pengajuan koreksi. Setiap pengajuan koreksi hanya
  boleh muncul satu kali. Site mengikuti record Attendance, sedangkan jenis
  karyawan dan bagian produksi mengikuti histori kerja yang efektif pada
  tanggal kerja. Histori yang hilang, berbeda site, atau tumpang-tindih harus
  ditandai untuk diperiksa dan tidak boleh menggandakan baris koreksi.
- Laporan Koreksi Attendance menampilkan nilai sebelum dan sesudah, status
  pemeriksaan, pengaju, pemeriksa, dan waktu penerapan. Alasan koreksi serta
  catatan pemeriksaan tidak boleh dikirim oleh API maupun dimasukkan ke Excel
  karena dapat memuat informasi pribadi. Ekspor membutuhkan
  `attendance.export`, memakai filter dan cakupan site yang sama dengan hasil
  layar, serta dicatat pada audit trail per site dengan checksum berkas.
- Laporan Produksi Borongan membutuhkan `reports.view` dan `production.view`,
  serta wajib memakai proyeksi resmi Rekap Produksi. Laporan bersifat live,
  hanya menghitung transaksi `POSTED`, dan periode pilihan maksimal 31 hari.
  Kuantitas tetap dipisahkan per satuan, sedangkan nilai bruto boleh
  dijumlahkan lintas pekerjaan karena menggunakan IDR.
- Identitas penempatan pada Laporan Produksi mengikuti histori kerja yang
  efektif pada tanggal transaksi. Kelompok kerja mengikuti snapshot transaksi,
  sehingga mutasi atau perubahan kelompok setelah setoran tidak mengubah fakta
  laporan lama.
- Laporan Payroll Final membutuhkan `reports.view` dan `payroll.view`. Laporan
  hanya memuat periode `CLOSED` beserta current run `FINAL` yang berstatus
  `COMPLETED`; run simulasi, run lama, dan periode yang belum ditutup tidak
  boleh dicampurkan sebagai hasil resmi. Rentang tanggal akhir periode yang
  dipilih maksimal 366 hari.
- Identitas, penempatan, skema, dan nominal Laporan Payroll Final wajib memakai
  snapshot `payroll_employee_results` pada current run tersebut. Laporan tidak
  boleh menghitung ulang nominal dari master terbaru, tidak boleh menampilkan
  ID internal, dan nomor rekening hanya boleh ditampilkan sebagai nama bank
  beserta empat digit terakhir. Status `CLOSED` tetap tidak menyatakan gaji
  sudah dibayar atau diterima karyawan.
- Ekspor Laporan Payroll Final membutuhkan `payroll.export`, memakai filter dan
  cakupan site yang sama dengan hasil di layar, mempertahankan penyamaran nomor
  rekening, serta dicatat pada audit trail per site yang tercakup.
- Laporan umum tidak boleh memuat NIK, nomor rekening, rincian gaji, atau data
  pribadi sensitif lain yang tidak diperlukan untuk tujuan laporan.
- Laporan Kontrak membutuhkan `reports.view` dan `employees.view`. Site kontrak
  diambil dari snapshot kontrak; bila snapshot lama belum dapat dikenali, sistem
  boleh memakai histori kerja yang efektif pada tanggal mulai kontrak. Site
  karyawan saat ini tidak boleh menggantikan kedua sumber historis tersebut.
- Status kontrak pada Laporan Kontrak harus mengikuti riwayat status yang sudah
  berlaku sampai tanggal acuan. Kontrak lama yang tidak mempunyai riwayat yang
  dapat dipastikan harus ditandai `Belum dapat ditentukan`, bukan ditebak dari
  status kontrak saat ini.
- Laporan Mutasi Karyawan membutuhkan `reports.view` dan `employees.view`.
  Periode pilihan maksimal 366 hari dan selalu memakai tanggal efektif
  perubahan, bukan tanggal data dicatat atau diproses.
- Mutasi yang sudah berlaku bersumber dari `employee_employment_histories`
  selain histori awal. Mutasi terjadwal, gagal, atau dibatalkan bersumber dari
  `scheduled_employee_mutations`; jadwal berstatus `APPLIED` tidak ditampilkan
  lagi karena hasilnya sudah menjadi histori kerja dan akan menyebabkan data
  ganda.
- Kondisi sebelum mutasi wajib memakai histori kerja sebelumnya atau histori
  dasar jadwal, sedangkan kondisi sesudah memakai histori atau target jadwal.
  Data current pada tabel karyawan tidak boleh menggantikan kedua sumber
  historis tersebut. Cakupan akses laporan mengikuti site tujuan mutasi.
- Status `STATUS_CHANGE` pada Laporan Mutasi hanya menunjukkan riwayat status
  yang tercatat sebagai baris histori tersendiri; angka tersebut tidak boleh
  dianggap sebagai seluruh perubahan status karyawan.
- Ekspor Excel Laporan Karyawan dan Laporan Kontrak wajib memakai filter serta
  cakupan site yang sama dengan hasil di layar. Ekspor Attendance hanya boleh
  memakai ekspor Rekap Attendance resmi dan membutuhkan permission
  `attendance.export`; data yang belum memenuhi syarat finalisasi tidak boleh
  diekspor sebagai laporan resmi.
- Ekspor Laporan Produksi memakai ekspor resmi Rekap Produksi, membutuhkan
  `production.export`, mengikuti filter dan cakupan site yang sama dengan hasil
  di layar, serta mempertahankan riwayat koreksi dan void untuk keperluan audit.
- Ekspor Laporan Mutasi wajib memakai filter dan cakupan site yang sama dengan
  hasil di layar serta menampilkan kondisi sebelum dan sesudah dengan bahasa
  yang mudah dipahami pengguna.
- Laporan Perubahan Jumlah Karyawan membutuhkan `reports.view` dan
  `employees.view`. Periode pilihan maksimal 366 hari. Jumlah aktif awal
  memakai kondisi sehari sebelum tanggal mulai, sedangkan jumlah aktif akhir
  memakai kondisi pada tanggal akhir. Hanya karyawan dengan tepat satu histori
  kerja efektif berstatus Aktif yang dihitung; histori yang hilang atau
  tumpang-tindih wajib ditandai dan tidak boleh masuk ke jumlah aktif.
- Karyawan masuk hanya berasal dari histori awal berstatus Aktif. Perpindahan
  site dihitung sebagai Mutasi Keluar pada site asal dan Mutasi Masuk pada site
  tujuan, sehingga tidak dihitung sebagai karyawan baru. Resign dipisahkan dari
  perubahan status lainnya. Filter site pada detail mengikuti site tempat
  perubahan tersebut dihitung.
- Laporan Perubahan Jumlah Karyawan hanya memakai histori kerja yang sudah
  berlaku. Perubahan yang masih terjadwal, gagal, atau dibatalkan tidak boleh
  masuk sebelum benar-benar menghasilkan histori kerja. Jumlah aktif mengikuti
  filter site, jenis karyawan, dan bagian produksi; filter pencarian dan jenis
  perubahan hanya menyaring rincian perubahannya.
- Ekspor Laporan Perubahan Jumlah Karyawan wajib memakai filter dan cakupan
  site yang sama dengan hasil layar, tidak memuat alasan atau catatan pribadi,
  serta dicatat pada audit trail per site dengan checksum berkas.
- Laporan Masa Kerja & Turnover membutuhkan `reports.view` dan
  `employees.view`. Masa kerja memakai `join_date` sebagai tanggal mulai dan
  dihitung sampai tanggal akhir periode untuk karyawan yang masih Aktif, atau
  sampai tanggal resign untuk karyawan yang keluar dalam periode.
- Jumlah aktif awal memakai kondisi sehari sebelum tanggal mulai dan jumlah
  aktif akhir memakai kondisi pada tanggal akhir. Hanya karyawan dengan tepat
  satu histori kerja efektif berstatus Aktif yang dihitung. Histori yang hilang
  atau tumpang-tindih wajib ditandai dan dikeluarkan dari jumlah aktif.
- Turnover hanya menghitung perubahan histori dari Aktif menjadi Resign yang
  sudah berlaku. Rumus turnover adalah jumlah kejadian resign dalam periode
  dibagi rata-rata jumlah karyawan aktif awal dan akhir, lalu dikali 100 persen.
  Nonaktif sementara, jadwal yang belum berlaku, jadwal gagal, dan jadwal
  dibatalkan tidak dihitung sebagai turnover.
- Site dan jenis karyawan pada kejadian resign mengikuti penempatan terakhir
  sebelum resign. Ekspor memuat lembar Masa Kerja Aktif dan Karyawan Resign,
  memakai filter serta cakupan site yang sama dengan layar, tidak memuat alasan
  resign atau catatan pribadi, dan dicatat pada audit trail per site.
- Setiap ekspor laporan wajib dicatat pada audit trail per site yang tercakup,
  disertai identitas permintaan dan checksum berkas. Berkas ekspor tidak boleh
  memuat data sensitif yang tidak ditampilkan pada laporan sumber.
