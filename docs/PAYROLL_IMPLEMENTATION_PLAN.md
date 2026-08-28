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

## Milestone 4 - Riwayat, export, dan slip

- Riwayat periode dan run, termasuk perbandingan hasil simulasi.
- Export sesuai filter dan site access.
- Preview slip simulasi memakai watermark; slip resmi hanya untuk `CLOSED`.
- Cetak individual dan massal tanpa mengartikan closed sebagai sudah dibayar.

## Milestone 5 - Payroll bulanan

Milestone ini baru dimulai setelah formula gaji pokok, prorata join/resign,
snapshot Attendance harian, pajak, BPJS, serta kebijakan potongan disetujui.
