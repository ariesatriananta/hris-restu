# Milestone Implementasi Payroll

Dokumen ini menjadi urutan implementasi Payroll HRIS RSIA. Scope pertama adalah
Payroll Borongan berbasis hasil Produksi (`PIECE_RATE`). Setiap milestone harus
lulus test dan exit criteria sebelum milestone berikutnya dimulai.

## Keputusan produk yang sudah dikunci

- Skema upah memisahkan basis kalkulasi dari frekuensi pembayaran:
  `BORONGAN = PIECE_RATE/WEEKLY`, `HARIAN = TIME_BASED/WEEKLY`,
  `TRAINING = TIME_BASED/WEEKLY`, dan `BULANAN = TIME_BASED/MONTHLY`.
- Periode `PIECE_RATE/WEEKLY` fleksibel per site, maksimal 31 hari, dan tidak
  boleh overlap. Periode `TIME_BASED/WEEKLY` selalu Senin-Minggu, sedangkan
  periode `TIME_BASED/MONTHLY` mengikuti policy cutoff efektif.
- Sumber nominal Produksi adalah snapshot `gross_amount` transaksi `POSTED`.
- Attendance menjadi syarat kesiapan dan informasi, bukan pengali upah.
- Karyawan resign tetap dibayar atas fakta Produksi historis dalam periode.
- Hasil Produksi karyawan `TRAINING` tetap dicatat untuk monitoring, tetapi
  tidak menjadi sumber nominal Payroll.
- Komponen tambahan dikelola eksplisit per periode; pajak dan BPJS otomatis
  belum termasuk scope awal.
- Net negatif memblokir approval dan closing.
- Slip resmi hanya berasal dari periode `CLOSED`; closed bukan berarti dibayar.

## Milestone 0 - Integrity hardening

### 0A. Source lock bersama

- Satukan policy lock Payroll untuk Attendance dan Produksi.
- Blokir mutasi sumber saat run `PROCESSING`, periode `CALCULATED`, `APPROVED`,
  atau `CLOSED`, maupun ketika snapshot terkait sudah tersedia.
- Pertahankan mutasi normal pada periode `DRAFT`.

### 0B. Schema dan permission

- Approval menunjuk `payroll_run_id` tertentu.
- Run memiliki idempotency key dan proteksi satu proses aktif per periode.
- Tambahkan index/constraint pendukung dan mapping permission
  `PAYROLL_FINANCE`, `DIRECTOR`, serta `SUPER_ADMIN`.
- Seluruh migration harus rerun-safe sesuai kemampuan MySQL target.

### 0C. State machine

- Terapkan transisi `DRAFT -> CALCULATED -> APPROVED -> CLOSED`.
- Batalkan hanya dari `DRAFT`.
- Hitung ulang membuat run baru dan mempertahankan histori run lama.
- Cegah periode non-cancelled yang overlap pada site dan basis sama.

### 0D. Frontend foundation

- Menu dan route Payroll mengikuti `payroll.view`.
- Jangan menampilkan kalkulasi atau status palsu sebelum API tersedia.
- Gunakan pola shadcn-admin, aksesibel, responsif, dan site-aware.

### Exit criteria Milestone 0

- Test policy/state machine dan integration guard lulus.
- Typecheck frontend/backend, lint terfokus, dan production build lulus.
- Migration dan query verifikasi tersedia, tetapi tidak dijalankan otomatis ke
  database aktif.

## Milestone 1 - Periode dan readiness

- Daftar, buat, lihat, dan batalkan periode `DRAFT` per site.
- Validasi rentang maksimal 31 hari dan overlap.
- Readiness menunjukkan finalisasi Attendance, workflow tertunda, transaksi
  Produksi, rekening karyawan, dan komponen yang belum siap.
- Belum menghitung nominal Payroll.

Keputusan implementasi:

- Readiness dihitung live dengan status `READY`, `ATTENTION`, atau `BLOCKED`;
  tidak membuat run maupun snapshot.
- Periode boleh dibuat untuk masa depan, tetapi belum siap sampai tanggal
  akhirnya sudah lewat.
- Rekening tidak lengkap menjadi perhatian pada Milestone 1 dan baru menjadi
  blocker approval/closing pada Milestone 3.
- Periode `DRAFT` tidak diedit. Kesalahan diperbaiki dengan membatalkan periode
  disertai alasan, lalu membuat periode baru.
- Kode periode dibuat server dan nama periode dapat diisi opsional.
- Tanggal pembayaran opsional dan tidak boleh sebelum akhir periode.
- Populasi mengambil transaksi Produksi `POSTED` historis dan komponen efektif,
  sehingga karyawan yang kini resign/nonaktif tetap dapat dibayar.
- Komponen manual per periode baru dibuka bersama Milestone 2.

### Exit criteria Milestone 1

- Pembuatan periode aman terhadap request paralel dan menolak overlap pada site
  yang sama.
- Pembatalan hanya berlaku pada `DRAFT`, beralasan, dan tercatat dalam audit.
- Readiness mengikuti site/rentang periode dan tidak mengunci sumber data.
- Permission dan site scope ditegakkan API, bukan hanya disembunyikan di UI.
- Halaman desktop/mobile memiliki loading, error, empty state, filter URL, detail
  kesiapan, serta aksi sesuai permission.
- Test, typecheck, lint, dan production build lulus.

## Milestone 2 - Simulasi `PIECE_RATE`

- Jalankan kalkulasi transactional dan idempotent.
- Snapshot transaksi Produksi, identitas historis, rekening, komponen, dan
  ringkasan Attendance.
- Tampilkan ringkasan periode dan detail per karyawan/transaksi.
- Hitung ulang menghasilkan run baru; run lama tetap dapat ditelusuri.

Keputusan implementasi:

- Simulasi dapat dijalankan ketika readiness `READY` atau `ATTENTION`; status
  `BLOCKED` wajib diselesaikan terlebih dahulu.
- Nominal Produksi memakai `gross_amount` transaksi `POSTED` apa adanya dan
  tidak dihitung ulang menggunakan tarif master terbaru.
- Komponen `FIXED` yang efektifnya bersinggungan dengan periode diterapkan penuh
  satu kali tanpa prorata.
- Komponen manual dikelola per periode dan karyawan. Satu jenis komponen hanya
  boleh memiliki satu baris aktif, sedangkan koreksi atau pembatalannya wajib
  beralasan dan dapat diaudit.
- Rumus awal adalah bruto Produksi ditambah komponen pendapatan dikurangi
  komponen potongan. Pajak dan BPJS belum dihitung otomatis.
- Nilai neto negatif tetap disimpan dan ditampilkan pada simulasi. Kondisi ini
  baru memblokir pengajuan serta closing dan tidak boleh diubah diam-diam
  menjadi nol.
- Kalkulasi memakai run `PROCESSING` yang durable, idempotency key, dan polling.
  Retry dengan key yang sama tidak membuat run baru; hitung ulang memakai key
  baru dan mempertahankan seluruh run sebelumnya.
- Run gagal tidak boleh meninggalkan snapshot atau lock sumber. Run sebelumnya
  tetap menjadi `current_run_id` sampai run baru selesai dengan sukses.
- Nominal disimpan dengan presisi dua desimal. UI menyembunyikan pecahan nol dan
  tetap menampilkan pecahan ketika memang ada nilainya.
- Detail rekening hanya diberikan kepada pengguna berizin `payroll.calculate`
  dan `SUPER_ADMIN`; pengguna read-only menerima informasi yang disamarkan.

### Exit criteria Milestone 2

- Snapshot Produksi identik dengan transaksi sumber, transaksi `VOID` tidak
  ikut, karyawan resign tetap masuk berdasarkan fakta historis, dan tidak ada
  repricing.
- Snapshot identitas, rekening, Attendance, serta komponen tidak berubah ketika
  data master atau sumber diperbarui setelah run selesai.
- Request paralel hanya menghasilkan satu run `PROCESSING` per periode dan
  retry idempotent tidak menggandakan hasil.
- Hitung ulang menghasilkan run baru tanpa menghapus run lama.
- Kegagalan kalkulasi tidak meninggalkan snapshot, lock, atau status periode
  setengah jadi.
- Total run sama dengan agregasi hasil karyawan dan rincian Produksi.
- Nilai neto negatif tersimpan, terlihat jelas, dan tidak menyebabkan kalkulasi
  gagal.
- Permission, pembatasan site, masking rekening, audit, rollback, konkurensi,
  test, typecheck, lint, dan production build lulus.

## Milestone 3 - Approval dan closing

- Ajukan run tertentu untuk approval.
- `PAYROLL_FINANCE` menghitung/mengajukan, `DIRECTOR` menyetujui, dan pengguna
  berizin melakukan closing.
- Terapkan separation of duties, reject dengan alasan, audit trail, dan closing
  atomik yang immutable.

Keputusan implementasi:

- Pengajuan hanya boleh menunjuk `current_run_id` yang masih menjadi hasil
  terbaru, berstatus `COMPLETED`, dan lolos pemeriksaan integritas snapshot.
  Periode tetap `CALCULATED` selama approval berstatus `PENDING`.
- `PAYROLL_FINANCE` dapat mengajukan, menarik pengajuan, dan melakukan closing
  sesuai akses site. `DIRECTOR` dapat menyetujui atau menolak lintas site.
- `SUPER_ADMIN` memiliki seluruh aksi di seluruh site, termasuk menghitung,
  mengajukan, menyetujui hasil hitungannya sendiri, menolak, menarik pengajuan,
  dan closing. Self-approval ditandai sebagai override pada audit trail.
- Separation of duties berlaku bagi pengguna selain `SUPER_ADMIN`: pembuat run
  atau pengaju tidak boleh menjadi penyetuju run yang sama.
- Approval tahap awal hanya satu tingkat, yaitu Direksi. Struktur data tetap
  mempertahankan level approval agar dapat diperluas tanpa mengubah histori.
- Neto negatif, rekening snapshot tidak lengkap, populasi kosong, total run
  yang tidak sama dengan agregasi detail, readiness `BLOCKED`, atau sumber yang
  berubah setelah simulasi memblokir pengajuan, approval, dan closing. Readiness
  `ATTENTION` lain boleh lanjut.
- Pengajuan `PENDING` dapat ditarik oleh pihak berwenang dengan alasan minimal
  lima karakter. Penolakan juga wajib memiliki alasan minimal lima karakter.
- Run yang ditolak atau ditarik bersifat terminal untuk workflow approval.
  Pengajuan ulang wajib memakai run baru hasil hitung ulang agar histori lama
  tidak ditimpa atau dipakai ulang.
- Closing hanya berlaku pada `current_run_id` yang telah disetujui. Transaksi
  atomik mengubah periode menjadi `CLOSED` dan run menjadi `FINAL`.
- Periode `CLOSED` tidak dapat dibuka kembali. Status ini mengunci hasil resmi,
  tetapi tidak menyatakan dana sudah ditransfer atau diterima karyawan.
- Semua mutation memakai idempotency key, row lock, conditional status update,
  serta audit trail agar klik ganda atau request paralel tidak menggandakan aksi.

### Exit criteria Milestone 3

- Run stale, bukan current, belum selesai, neto negatif, kosong, atau tidak
  konsisten tidak dapat diajukan, disetujui, maupun ditutup.
- Submit, withdraw, approve, reject, dan close aman terhadap retry serta request
  paralel dan tidak menghasilkan approval atau audit ganda.
- Reject/withdraw mempertahankan histori dan hanya dapat dilanjutkan melalui run
  baru hasil hitung ulang.
- Separation of duties, pengecualian `SUPER_ADMIN`, permission, dan site scope
  ditegakkan API serta tercermin jujur pada UI.
- Closing mengesahkan tepat satu current run secara atomik, bersifat immutable,
  dan tetap dibedakan dari status pembayaran.
- Halaman approval memiliki tracker proses, blocker yang dapat ditindaklanjuti,
  aksi sesuai role, histori persetujuan, serta state desktop/mobile yang layak.
- Migration, test backend/frontend, typecheck, lint, dan production build lulus.

## Milestone 4 - Riwayat, export, dan slip

- Riwayat periode dan run, termasuk perbandingan hasil simulasi.
- Export sesuai filter dan site access.
- Preview slip simulasi memakai watermark; slip resmi hanya untuk `CLOSED`.
- Cetak individual dan massal tanpa mengartikan closed sebagai sudah dibayar.

Keputusan implementasi:

- Riwayat menampilkan seluruh run, termasuk run gagal, tanpa menghapus atau
  menimpa versi sebelumnya. Pesan teknis internal tidak dibuka kepada pengguna
  operasional.
- Perbandingan hanya berlaku untuk tepat dua run `COMPLETED` dalam periode yang
  sama. Perubahan karyawan dan nominal dihitung dari snapshot kedua run.
- Rekap Payroll dapat diekspor oleh pengguna berizin sesuai akses site. Nomor
  rekening pada rekap selalu disamarkan dan hasil simulasi diberi label
  `SIMULASI`.
- Daftar Pembayaran merupakan export terpisah yang memuat rekening lengkap.
  Dokumen ini hanya tersedia dari current run `FINAL` pada periode `CLOSED`
  untuk Payroll Finance sesuai site dan `SUPER_ADMIN` lintas site.
- Preview slip dapat dibaca oleh pengguna `payroll.view`, tetapi nomor rekening
  tetap disamarkan. Cetak individual dan massal membutuhkan `payroll.print`.
- Slip simulasi memakai watermark besar `SIMULASI`. Slip resmi hanya berasal
  dari current run `FINAL` pada periode `CLOSED`.
- Identitas perusahaan disnapshot secara atomik ketika closing. Nama dan alamat
  wajib tersedia, logo bersifat opsional, dan periode `CLOSED` lama dibackfill
  dengan penanda `LEGACY_BACKFILL` yang jujur.
- Cetak massal memakai A4 portrait dengan dua slip per lembar. Sistem tidak
  menyimpan binary PDF; tampilan cetak dibentuk kembali dari snapshot Payroll.
- Export dan penerbitan data cetak dicatat secara idempotent pada audit trail.
  Catatan tersebut tidak menyatakan dokumen benar-benar sudah dicetak atau dana
  telah dibayarkan.

### Exit criteria Milestone 4

- Site scope, permission export sensitif, masking rekening, dan aturan
  `CLOSED/FINAL` ditegakkan API.
- Perbandingan menolak run yang sama, belum selesai, atau berasal dari periode
  berbeda.
- Rekap simulasi dan final dapat dibedakan dengan jelas; Daftar Pembayaran tidak
  dapat diterbitkan dari simulasi.
- Slip resmi reproducible dari snapshot identitas perusahaan, karyawan,
  Produksi, Attendance, serta komponen run final.
- Preview, drawer, loading, error, empty state, filter URL, cetak individual,
  dan cetak massal layak pada desktop maupun mobile.
- Migration, test backend/frontend, typecheck, lint, dan production build lulus.

## Milestone 5 - Payroll berbasis waktu

Milestone ini memperluas engine yang sudah dibangun tanpa menduplikasi workflow
approval, closing, riwayat, export, dan slip pada Milestone 1-4. Implementasi
dibagi agar perubahan skema tidak menulis ulang histori Payroll Borongan.

### Matriks skema yang dikunci

| Jenis karyawan | Basis kalkulasi | Frekuensi | Sumber nominal utama |
| --- | --- | --- | --- |
| `BORONGAN` | `PIECE_RATE` | `WEEKLY` | Produksi `POSTED` |
| `HARIAN` | `TIME_BASED` | `WEEKLY` | Tarif harian x hari `PRESENT` |
| `TRAINING` | `TIME_BASED` | `WEEKLY` | Tarif harian x hari `PRESENT` |
| `BULANAN` | `TIME_BASED` | `MONTHLY` | Gaji pokok dan prorata kalender |

Kombinasi kontrak berlaku ketat: jenis karyawan `TRAINING` hanya memakai
kontrak `TRAINING`, sedangkan `BORONGAN`, `HARIAN`, dan `BULANAN` hanya memakai
`PKWT` atau `PKWTT`.

### Milestone 5A1 - Skema upah, policy, dan master tarif

- Normalisasi basis kalkulasi menjadi `PIECE_RATE` atau `TIME_BASED` dan simpan
  frekuensi `WEEKLY` atau `MONTHLY` secara terpisah serta effective-dated.
- Pertahankan riwayat gaji pokok untuk `BULANAN` dan sediakan riwayat tarif
  harian khusus `HARIAN`/`TRAINING`. Tarif wajib positif, IDR, tidak overlap,
  tidak dihapus, dan setiap koreksi atau pembatalan memiliki revision serta
  alasan.
- Policy Payroll menggunakan pilihan bertipe dan tervalidasi, bukan formula
  SQL/JavaScript bebas. Pada M5A1 setiap policy wajib dimiliki satu site agar
  resolusinya deterministik; policy memiliki versi, tanggal efektif, status,
  alasan, audit, serta snapshot pada periode dan run. Inheritance global/site
  belum dibuka.
- Policy awal `TIME_BASED/MONTHLY` memakai cutoff `LAST_DAY`. Perubahan cutoff
  hanya berlaku ke depan melalui versi baru, menampilkan preview minimal tiga
  periode berikutnya, dan ditolak jika menimbulkan overlap atau gap.
- Perubahan gaji pokok hanya boleh efektif tepat pada awal periode Payroll yang
  terbentuk dari policy cutoff. Perubahan di tengah periode ditolak agar tidak
  menghasilkan segmen nominal yang ambigu.
- Gaji pokok pertama untuk karyawan yang join di tengah periode boleh efektif
  pada tanggal awal eligibility/join. Pengecualian ini hanya berlaku untuk
  initial salary, bukan perubahan nominal dari histori gaji sebelumnya.
- Policy awal hanya dapat dikelola `SUPER_ADMIN`. `PAYROLL_FINANCE` dapat
  melihat policy sesuai akses site, tetapi tidak mengubahnya tanpa permission
  eksplisit pada pengembangan selanjutnya.
- Perhitungan uang memakai DECIMAL dan dibulatkan `HALF_UP` ke Rp1 per komponen
  per karyawan. Policy pembulatan disnapshot dan tidak berlaku retroaktif.
- Migrasi `TRAINING` wajib didahului preflight terhadap histori employment,
  assignment/transaksi Produksi, serta period/run/snapshot Payroll. Transaksi
  Produksi tetap dipertahankan sebagai fakta monitoring, tetapi dikeluarkan
  dari nominal `PIECE_RATE` berdasarkan skema historis.
- Migration utama tidak menghapus atau menulis ulang hasil `SUBMITTED`,
  `APPROVED`, atau `CLOSED`. Data immutable yang masih mengandung upah Training
  berbasis hasil menjadi blocker yang harus dilaporkan untuk remediasi owner.

### Milestone 5A2 - Readiness dan preview segmentasi

- Periode mingguan `HARIAN` dan `TRAINING` dibuat terpisah agar policy,
  populasi, snapshot, dan audit tetap deterministik.
- Pembuatan periode memakai tanggal acuan. Server menyelesaikan tepat satu
  policy historis, memvalidasi batas periode, lalu menyimpan identitas jenis,
  basis, frekuensi, dan snapshot policy secara atomik bersama periode Draft.
- Periode `TIME_BASED/WEEKLY` selalu Senin-Minggu selama tujuh hari dan boleh
  melintasi bulan. Periode `TIME_BASED/MONTHLY` dibentuk dari policy cutoff;
  default awal adalah tanggal 1 sampai akhir bulan.
- Populasi memakai intersection periode, histori employment, kontrak, site,
  jenis karyawan, policy, dan histori tarif/gaji yang efektif; data master saat
  ini tidak boleh menggantikan fakta historis.
- `HARIAN` dan `TRAINING` hanya membayar tanggal Attendance final berstatus
  `PRESENT`. Status lain bernilai nol, termasuk Alpha, Izin, Sakit, Cuti, dan
  hari libur tanpa kehadiran aktual.
- `PRESENT` final pada hari nonkerja tetap masuk estimasi satu hari bayar dan
  selalu ditampilkan sebagai warning untuk ditinjau.
- `BULANAN` diprorata untuk join/resign berdasarkan hari kalender eligible.
  Alpha dan Izin menjadi potongan eksplisit dengan rumus default:
  `gaji pokok / hari kerja terjadwal dalam periode x jumlah hari Alpha/Izin`.
- Bila policy cutoff berubah, pembagi potongan selalu memakai seluruh hari
  kerja terjadwal dalam periode. Perubahan gaji tengah periode sudah diblokir
  pada master sehingga hanya ada satu gaji pokok efektif per periode.
- Readiness memblokir overlap/gap histori, kombinasi kontrak yang salah, policy
  tidak tunggal, tarif/gaji tidak tercakup, currency tidak didukung, periode
  overlap, Attendance belum final/ambigu, maupun formula komponen yang belum
  didukung.
- Preview menampilkan karyawan, rentang eligible, policy, coverage tarif/gaji,
  jumlah hari kerja/PRESENT/Alpha/Izin, serta alasan dan tujuan tindakan. M5A
  belum membuat payroll run atau snapshot hasil finansial permanen.
- Preview juga menjalankan preflight global yang sama dengan periode Draft:
  akhir periode, finalisasi Attendance, workflow Attendance tertunda, konsistensi
  snapshot policy, mata uang, dan perubahan gaji Bulanan di tengah periode.
- Komponen manual tetap dapat digunakan oleh periode `TIME_BASED`, tetapi tidak
  boleh menyamarkan policy, tarif harian, gaji pokok, kontrak, atau Attendance
  yang hilang dan tetap menjadi blocker readiness.

### Milestone 5B - Simulasi waktu mingguan

- Perluas run engine yang sama dengan strategy `TIME_BASED/WEEKLY`; jangan
  membuat endpoint, state machine, atau histori run paralel.
- Hitung `HARIAN` dan `TRAINING` berdasarkan tarif harian efektif pada setiap
  tanggal Attendance final `PRESENT`. Tanggal selain `PRESENT` disnapshot
  dengan nominal nol agar hasil dapat diaudit dari hari ke hari.
- Karyawan yang eligible tetap dibuatkan hasil walaupun tidak memiliki
  `PRESENT`; upah dasarnya menjadi Rp0 dan komponen manual tetap terlihat.
- Jumlahkan nominal harian per karyawan menggunakan DECIMAL, kemudian bulatkan
  total upah dasar satu kali dengan `HALF_UP` ke Rp1 sesuai policy snapshot.
- Simpan snapshot harian terpisah dari detail Produksi. Snapshot minimal memuat
  tanggal, Attendance, tipe hari, tarif dan sumber tarif, status dibayar,
  nominal, serta penanda `PRESENT` pada hari nonkerja.
- Pada M5B hanya komponen manual periode yang boleh memengaruhi hasil
  `TIME_BASED`. Komponen berulang menjadi blocker sampai aturan frekuensi dan
  proratanya dikunci.
- Pertahankan transaksi Produksi Training sebagai informasi monitoring berupa
  jumlah transaksi dan kuantitas per pekerjaan/satuan. Nilai bruto Produksi
  tidak boleh masuk ke upah dasar, gross, atau neto.
- Gunakan idempotency, snapshot, histori run, permission, recovery, dan guard
  sumber yang sama dengan simulasi `PIECE_RATE`. Hitung ulang membuat run baru
  dan tidak mengubah snapshot run sukses sebelumnya.
- UI simulasi adaptif: Borongan menampilkan sumber Produksi, sedangkan
  HARIAN/TRAINING menampilkan hari dibayar, upah dasar, warning hari nonkerja,
  dan ledger harian dalam drawer.
- Pada tahap M5B, run `TIME_BASED` masih dibatasi sebagai simulasi. Pembatasan
  workflow dan output tersebut telah dibuka secara terkendali melalui M5D.

### Milestone 5C - Simulasi waktu bulanan

- Hitung gaji pokok `BULANAN`, prorata kalender join/resign, serta potongan
  Alpha/Izin berdasarkan policy yang disnapshot.
- Gaji dasar diprorata per karyawan dengan rumus
  `ROUND(gaji pokok x hari kalender eligible / seluruh hari kalender periode, 0)`.
- Pembagi potongan memakai seluruh hari kerja terjadwal dalam periode. Pola
  shift historis diekstrapolasi untuk join/resign parsial, hari libur efektif
  dikeluarkan, dan `WORKDAY_OVERRIDE` tetap dihitung sebagai hari kerja.
- Alpha dan Izin hanya dihitung pada tanggal eligible yang terjadwal. Keduanya
  menjadi komponen `SYSTEM` terpisah dan masing-masing dibulatkan `HALF_UP` ke
  Rp1 sebelum dijumlahkan dengan komponen manual.
- Simpan summary formula dan ledger tanggal eligible pada tabel snapshot khusus
  bulanan. Histori gaji dikunci bersama Attendance, shift, employment, komponen,
  dan policy sebelum snapshot dibuat; retry selalu membuat run baru tanpa
  mengubah run sukses sebelumnya.
- Komponen berulang tetap menjadi blocker. Komponen manual periode tetap boleh
  digunakan, sedangkan neto negatif tetap terlihat sebagai exception simulasi.
- Pajak, BPJS, lembur, THR, dan bonus tahunan belum dihitung otomatis sampai
  kebijakan regulasinya dikunci; penyesuaian awal tetap berupa komponen
  eksplisit yang dapat diaudit.
- Pada tahap M5C, workflow dan output resmi `TIME_BASED` masih ditolak backend.
  M5D kemudian membukanya setelah pemeriksaan integritas lintas sumber lulus.

### Milestone 5D - Workflow dan output

- Reuse approval/closing Milestone 3 dan riwayat/export/slip Milestone 4 untuk
  seluruh skema. Jangan membuat state machine atau format dokumen paralel.
- Pemeriksaan integritas wajib strategy-aware. `PIECE_RATE` memeriksa snapshot
  Produksi, HARIAN/TRAINING memeriksa ledger dan tarif harian, sedangkan
  BULANAN memeriksa summary, ledger, histori gaji, prorata, serta potongan
  Alpha/Izin. Seluruh skema tetap memeriksa Attendance, employment, shift,
  kalender, policy, komponen, populasi, rekening, dan agregat run yang relevan.
- Terapkan aturan M3 tanpa pengecualian baru: hanya current run `COMPLETED` yang
  konsisten dapat diajukan; reject/withdraw wajib beralasan dan membutuhkan run
  baru; closing atomik menghasilkan run `FINAL` serta periode `CLOSED` yang
  immutable. `SUPER_ADMIN` tetap dapat self-approval dengan override audit.
- Riwayat dan perbandingan run memakai label dasar yang adaptif: Hasil Produksi,
  Upah Harian, atau Gaji Pokok Prorata. Perbandingan tetap menampilkan
  pendapatan lain, bruto, potongan, dan neto dari snapshot masing-masing run.
- Rekap simulasi diberi identitas `SIMULASI` dan menyamarkan rekening. Daftar
  Pembayaran dengan rekening lengkap hanya tersedia dari current run `FINAL`
  pada periode `CLOSED` bagi pengguna berizin sesuai site.
- Slip HARIAN/TRAINING menampilkan tarif harian, hari dibayar, dan upah dasar.
  Slip BULANAN menampilkan gaji pokok, prorata kalender, potongan Alpha, dan
  potongan Izin. Ledger harian lengkap tetap berada di detail aplikasi agar
  slip cetak ringkas dan mudah dibaca.
- M5D tidak mencatat status transfer, rekonsiliasi bank, jurnal Finance, pajak,
  BPJS, THR, lembur, atau bonus otomatis. Closing tetap berarti hasil Payroll
  disahkan, bukan bukti pembayaran.

### Exit criteria Milestone 5D

- HARIAN, TRAINING, dan BULANAN dapat submit, approve/reject, withdraw, dan
  close melalui workflow yang sama dengan Borongan tanpa melemahkan site scope
  maupun separation of duties.
- Drift tarif/gaji, Attendance, shift, kalender, employment, policy, komponen,
  populasi, rekening, atau total snapshot memblokir workflow dan meminta hitung
  ulang dengan pesan operasional yang jelas.
- Riwayat, perbandingan, export, serta slip menyajikan label dan nilai dasar
  sesuai skema; output resmi hanya berasal dari current run `FINAL/CLOSED`.
- Regression seluruh skema Payroll, unit/integration test, typecheck, lint, dan
  production build lulus tanpa mengubah rumus M5B/M5C.

### Exit criteria Milestone 5A

- Matriks jenis karyawan-kontrak-skema ditegakkan oleh API dan readiness.
- Tidak ada overlap/gap policy maupun histori tarif/gaji dan retry tidak
  menggandakan baris atau revision.
- Cutoff menghasilkan periode deterministik tanpa overlap/gap, termasuk bulan
  28/29/30/31 hari dan perubahan policy future-effective.
- Segmentasi benar untuk join, resign, transfer site, perubahan jenis/kontrak,
  serta periode mingguan lintas bulan.
- Data Training lama dilaporkan secara aman; fakta Produksi tidak dihapus dan
  tidak lagi membentuk upah `PIECE_RATE`.
- Site scope, masking nominal, permission, audit, dan snapshot policy
  ditegakkan backend.
- Seluruh regression Milestone 1-4 `PIECE_RATE` tetap lulus bersama migration,
  unit/integration test, typecheck, lint, dan production build.
