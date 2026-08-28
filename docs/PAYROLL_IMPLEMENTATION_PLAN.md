# Milestone Implementasi Payroll

Dokumen ini menjadi urutan implementasi Payroll HRIS RSIA. Scope pertama adalah
Payroll Borongan berbasis hasil Produksi (`PIECE_RATE`). Setiap milestone harus
lulus test dan exit criteria sebelum milestone berikutnya dimulai.

## Keputusan produk yang sudah dikunci

- Periode fleksibel per site, maksimal 31 hari, dan tidak boleh overlap.
- Sumber nominal Produksi adalah snapshot `gross_amount` transaksi `POSTED`.
- Attendance menjadi syarat kesiapan dan informasi, bukan pengali upah.
- Karyawan resign tetap dibayar atas fakta Produksi historis dalam periode.
- `BORONGAN` dan `TRAINING` masuk Payroll `PIECE_RATE`; tarif Training sementara
  mengikuti tarif pekerjaan biasa.
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

## Milestone 5 - Payroll bulanan

Milestone ini baru dimulai setelah formula gaji pokok, prorata join/resign,
snapshot Attendance harian, pajak, BPJS, serta kebijakan potongan disetujui.
