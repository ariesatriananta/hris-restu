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
- Karyawan `BORONGAN` dan `TRAINING` menggunakan basis payroll `PIECE_RATE`
  dan eligible untuk penugasan pekerjaan Produksi selama histori employment
  efektifnya mengizinkan Produksi. Penugasan Produksi wajib mengikuti periode
  histori tersebut dan tidak boleh menyeberangi periode inactive.
- Semua jenis karyawan wajib memiliki penempatan Modul dan Bagian produksi pada registrasi dan mutasi.
- Jenis kontrak `TRAINING`, `PKWT`, dan `PKWTT` dipilih sesuai kebijakan HR dan tidak ditentukan otomatis dari jenis karyawan.
- Cetak template kontrak produksi tahap pertama hanya untuk kombinasi karyawan `BORONGAN` dengan kontrak `PKWT`.
- Kontrak `ACTIVE` tidak dapat dikoreksi periodenya. Salah aktivasi hanya dapat dibatalkan menjadi `CANCELLED` bila belum memiliki tanda tangan/lampiran dan belum digunakan oleh attendance, produksi, payroll, histori lanjutan, atau status kerja terjadwal; selain itu gunakan Terminasi lalu buat kontrak baru.
- Aktivasi kontrak membuat status karyawan `ACTIVE` efektif sejak tanggal mulai kontrak, termasuk ketika HR terlambat menjalankan aktivasi. Aktivasi ditolak bila penyelarasan mundur akan melewati histori employment yang lebih baru.
- Penugasan Shift pertama boleh dimundurkan paling awal ke tanggal terbesar antara go-live Attendance dan awal histori employment `ACTIVE` yang eligible pada site Shift. Karyawan yang pernah memiliki assignment hanya dapat memakai form penugasan biasa mulai hari ini atau masa depan.
- Kesalahan assignment Shift yang sudah berlaku diperbaiki melalui Koreksi Penugasan Shift historis, bukan dengan menimpa atau menghapus histori. Koreksi diterapkan langsung oleh pengguna berizin `attendance.manage_shift`, wajib memiliki alasan dan preview dampak, menyusun ulang timeline tanpa overlap, merekonsiliasi snapshot Attendance tanpa mengubah scan mentah, serta menginvalidasi finalisasi terdampak. Koreksi diblokir untuk setoran produksi `POSTED`, payroll yang sudah dihitung/disetujui/ditutup, atau finalisasi yang sedang berjalan.
- Koreksi Penugasan Shift dapat dibuat berlaku seterusnya hanya untuk assignment paling akhir. Karyawan wajib masih `ACTIVE`, eligible Attendance, dan tetap berada pada site Shift; tidak boleh ada assignment, mutasi, atau perubahan status terjadwal setelahnya. Rentang terbuka disimpan dengan `effective_to=NULL`, sedangkan rekonsiliasi Attendance dan invalidasi finalisasi hanya diproses sampai tanggal hari ini.
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
- Implementasi Payroll pertama hanya untuk basis `PIECE_RATE`. Payroll
  `MONTHLY` baru dibangun setelah snapshot Attendance harian, formula prorata,
  pajak, dan BPJS dikunci.
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
- Karyawan `BORONGAN` dan `TRAINING` mengikuti Payroll `PIECE_RATE`; pada fase
  awal tarif Training mengikuti tarif pekerjaan Produksi biasa.
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
- Slip resmi hanya bersumber dari Payroll `CLOSED`. Hasil `CALCULATED` hanya
  boleh dipratinjau dengan penanda Simulasi; status `CLOSED` tidak menyatakan
  pembayaran atau transfer sudah dilakukan.
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
