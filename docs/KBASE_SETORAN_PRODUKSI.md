# Knowledge Base — Produksi Borongan

> Status: Fase 1 Fondasi & Readiness, Fase 2A Terminal Setoran & Transaksi Harian,
> Fase 2B Koreksi/Void, dan Fase 2C Rekap Produksi sudah tersedia. Proses
> perhitungan, approval, dan closing Payroll Produksi dikerjakan pada fase
> berikutnya.

## Cakupan Fase 1

- Master Satuan Produksi.
- Master Pekerjaan Produksi.
- Histori Tarif pekerjaan per site.
- Histori Penugasan pekerjaan per karyawan.
- Readiness operasional per site.
- Permission dan pembatasan data per site.
- Seed demo yang dapat dijalankan ulang tanpa menghapus master atau assignment manual.

## Eligibility pekerja

Karyawan boleh mendapat penugasan pekerjaan ketika tepat satu histori employment mencakup seluruh periode penugasan dan memenuhi:

- status employment mengizinkan Produksi (`allows_production=1`);
- basis payroll jenis karyawan adalah `PIECE_RATE`;
- site histori sama dengan site penugasan.

Pada fase ini `BORONGAN` dan `TRAINING` memakai basis `PIECE_RATE`. Penugasan terbuka hanya boleh dibuat ketika histori employment juga terbuka.

## Tarif per site

1. Tarif baru selalu dibuat berstatus `DRAFT`.
2. Draft belum digunakan oleh transaksi.
3. Aktivasi harus dilakukan eksplisit setelah nilai dan periode diperiksa.
4. Hanya satu tarif `ACTIVE` yang boleh berlaku untuk kombinasi site, pekerjaan, dan tanggal yang sama.
5. Ketika mengganti tarif aktif, tarif lama ditutup pada H-1 tarif baru.
6. Aktivasi retroaktif ditolak bila rentangnya sudah memiliki transaksi Produksi `POSTED`.
7. Tarif aktif tidak diedit langsung; buat histori tarif baru.

## Penugasan pekerjaan

- Satu karyawan dapat memiliki beberapa pekerjaan, tetapi maksimal satu pekerjaan utama pada tanggal yang sama.
- Kombinasi karyawan, pekerjaan, dan site tidak boleh memiliki periode yang overlap.
- Histori tidak dihapus. Akhiri penugasan dengan tanggal efektif selesai.
- Penutupan ditolak bila ada transaksi `POSTED` setelah tanggal selesai yang dipilih.

## Readiness per site

Site berstatus siap bila tidak memiliki blocker berikut:

- pekerja eligible tanpa penugasan;
- pekerja tanpa pekerjaan utama atau memiliki pekerjaan utama ambigu;
- pekerjaan yang digunakan tanpa tarif aktif atau memiliki tarif aktif overlap;
- belum ada akun `PRODUCTION_ADMIN` aktif pada site.

Readiness hanya menghitung pekerjaan yang benar-benar dipakai assignment aktif, bukan seluruh master pekerjaan global.

Detail pekerja dapat dibuka melalui daftar readiness penugasan. Filter masalah
memakai arti berikut:

- `UNASSIGNED`: tidak memiliki penugasan aktif;
- `MISSING_PRIMARY`: tidak memiliki pekerjaan utama aktif, termasuk pekerja
  yang belum ditugaskan;
- `AMBIGUOUS_PRIMARY`: memiliki lebih dari satu pekerjaan utama aktif;
- `READY`: memiliki penugasan dan tepat satu pekerjaan utama aktif.

Populasi eligible harus memiliki tepat satu histori employment efektif pada
tanggal pemeriksaan, status yang mengizinkan Produksi, dan basis upah
`PIECE_RATE`.

## Permission

- `production.view`: melihat master, tarif, assignment, readiness, transaksi, dan rekap.
- `production.scan`: mengakses Terminal Setoran.
- `production.correct`: koreksi transaksi Produksi pada fase transaksi.
- `production.export`: mengekspor Rekap Produksi sesuai filter dan akses site.
- `production.manage_master`: mengelola satuan, pekerjaan, tarif, dan assignment.

`SUPER_ADMIN` mendapat seluruh permission. `PRODUCTION_ADMIN` mendapat view/scan/correct tetapi tidak mengubah master. HR, Payroll, Site Supervisor, dan Director mendapat akses baca sesuai cakupan role/site.

## Seed demo

File: `db/seeds/20260821_production_foundation_demo.sql`.

Seed membuat master referensi, 12 tarif demo, dan pekerjaan utama berdasarkan Bagian Produksi efektif pada `@seed_as_of`. Seed:

- tidak membuat transaksi Produksi;
- batal bila transaksi atau snapshot Payroll Produksi sudah ada;
- tidak menghapus atau menimpa assignment manual;
- menolak tarif aktif overlap;
- dapat dijalankan ulang dengan hasil stabil.

## Endpoint Fase 1

- `GET|POST /api/production-structure/work-units`
- `PATCH /api/production-structure/work-units/:uid`
- `GET|POST /api/production-structure/jobs`
- `PATCH /api/production-structure/jobs/:uid`
- `GET|POST /api/production-structure/rates`
- `PATCH /api/production-structure/rates/:uid`
- `POST /api/production-structure/rates/:uid/activate`
- `GET|POST /api/production-structure/assignments`
- `POST /api/production-structure/assignments/:uid/close`
- `GET /api/production-structure/assignment-readiness`
- `GET /api/production-structure/readiness`

Identifier route/API menggunakan `uid`, bukan ID internal.

## Fase 2A — Terminal Setoran dan transaksi harian

Terminal memakai perangkat `USB_SCANNER` atau `TERMINAL` aktif dari master
`scan_devices`. Aktivasi dan request operasional membutuhkan user login dengan
permission `production.scan`, akses ke site perangkat, serta token perangkat
yang dikirim melalui header `X-Production-Device-Token`.

Barcode hanya mengidentifikasi karyawan. Operator tetap memilih pekerjaan yang
ditugaskan dan memasukkan kuantitas. Sistem memilih pekerjaan utama sebagai
default, tetapi pekerjaan tambahan yang aktif tetap dapat dipilih. Tepat satu
pekerjaan utama aktif wajib tersedia.

Setiap setoran divalidasi ulang secara atomik oleh backend. Setoran hanya dapat
dibuat bila pada business date server `Asia/Jakarta` yang sama:

- tepat satu histori employment efektif mengizinkan Produksi;
- jenis karyawan memakai basis `PIECE_RATE` dan site sesuai perangkat;
- Attendance berstatus `PRESENT`;
- terdapat event mentah `CLOCK_IN` berstatus `SUCCESS` yang terkait ke record
  Attendance karyawan, site, dan tanggal tersebut;
- pekerjaan aktif dan merupakan assignment aktif karyawan tanpa overlap;
- tepat satu tarif `ACTIVE` berlaku untuk site, pekerjaan, dan tanggal tersebut.

Kuantitas mengikuti presisi satuan. Tarif dan bruto disimpan sebagai snapshot
di transaksi. `idempotencyKey` yang sama dengan payload sama mengembalikan
transaksi lama, sedangkan key sama dengan payload berbeda ditolak. Key baru
boleh membuat setoran berikutnya untuk karyawan yang sama pada hari yang sama.

Endpoint Fase 2A:

- `POST /api/production/terminal/activate`
- `POST /api/production/terminal/lookup`
- `POST /api/production/terminal/post`
- `GET /api/production/transactions`
- `GET /api/production/transactions/:uid`

## Fase 2B — Koreksi, void, histori revisi, dan Payroll lock

Pengguna dengan permission `production.correct` dapat menerapkan koreksi atau
void langsung tanpa workflow persetujuan. `SUPER_ADMIN` selalu dapat mengakses
aksi tersebut. Pengguna non-global tetap dibatasi ke site yang tercantum pada
akses user.

Transaksi `POSTED` tidak diedit atau dihapus langsung:

- koreksi hanya dapat mengubah pekerjaan dan kuantitas;
- karyawan, site, tanggal bisnis, waktu transaksi, Attendance, perangkat, dan
  kelompok kerja tetap mengikuti transaksi sumber;
- koreksi mengubah transaksi sumber menjadi `VOID`, membuat transaksi pengganti
  `POSTED`, lalu menyimpan snapshot before/after pada revision secara atomik;
- void tanpa koreksi mengubah transaksi sumber menjadi `VOID` tanpa membuat
  transaksi pengganti;
- koreksi dan void wajib memiliki alasan minimal lima karakter;
- setiap mutasi memakai idempotency key. Replay key dengan payload sama
  mengembalikan hasil sebelumnya, sedangkan key yang dipakai payload lain
  ditolak;
- preview bersifat read-only. Endpoint penerapan selalu mengunci row dan
  memvalidasi ulang status, site, pekerjaan, tarif, serta Payroll lock.

Koreksi dan void diblokir bila transaksi sudah memiliki `payroll_locked_at`,
telah masuk `payroll_production_details`, berada dalam periode Payroll
`CALCULATED`, `APPROVED`, atau `CLOSED`, maupun ketika run Payroll terkait sedang
`PROCESSING`. Payroll `CLOSED` immutable dan tidak dapat dibuka dari modul
Produksi.

Migration Fase 2B menambah relasi eksplisit transaksi pengganti dan idempotensi
revision:

- `db/migrations/20260821_production_transaction_revisions.sql`

Endpoint Fase 2B:

- `GET /api/production/transactions/:uid/correction-context`
- `POST /api/production/transactions/:uid/correction-preview`
- `POST /api/production/transactions/:uid/correct`
- `POST /api/production/transactions/:uid/void-preview`
- `POST /api/production/transactions/:uid/void`

Detail transaksi menampilkan status Payroll lock, metadata void, transaksi
sumber/pengganti, dan timeline revision.

## Fase 2C — Rekap Produksi operasional

Rekap Produksi bersifat live dan read-only. Hanya transaksi `POSTED` pada
periode maksimal 31 hari yang dihitung. Transaksi `VOID` dikecualikan dan
transaksi pengganti hasil koreksi dihitung sebagai transaksi baru.

Tampilan rekap menyediakan:

- ringkasan karyawan, transaksi, pekerjaan, dan nilai bruto tercatat;
- hasil yang selalu dipisahkan per satuan;
- ledger karyawan per kombinasi karyawan dan site;
- card pekerjaan serta drawer rincian karyawan/pekerjaan;
- filter site, pekerjaan, jenis karyawan, Bagian Produksi, kelompok kerja, dan
  pencarian karyawan;
- status `NONE`, `PARTIAL`, atau `SNAPSHOTTED` yang hanya menjelaskan apakah
  transaksi sudah masuk snapshot Payroll, bukan status pembayaran.

Kelompok kerja pada rekap mengikuti snapshot transaksi. Jenis karyawan,
jabatan, dan Bagian Produksi dibaca dari histori employment efektif pada
tanggal transaksi. Jika penempatan berubah dalam periode, rekap menandainya dan
drawer menampilkan timeline penempatan.

Pengguna dengan `production.export` dapat mengunduh Excel empat sheet:
Ringkasan Karyawan, Rincian Pekerjaan, Transaksi POSTED, dan Riwayat Revisi.
Ekspor tetap mengikuti pembatasan site dan dicatat pada audit log.

Endpoint Fase 2C:

- `GET /api/production/recaps`
- `GET /api/production/recaps/employees/:employeeUid`
- `GET /api/production/recaps/jobs/:jobUid`
- `POST /api/production/recaps/export`

Migration permission:

- `db/migrations/20260821_production_recap_export_permission.sql`

Rekap tidak melakukan finalisasi Produksi dan tidak membuat snapshot Payroll.
Angka dapat berubah sampai transaksi masuk proses Payroll.

## Fase 2D — Exception & Integrity

- Setoran susulan dibuat pemilik izin `production.correct`, tidak boleh
  bertanggal masa depan, dan wajib memiliki alasan serta idempotency key.
- Eligibility, Attendance Hadir dengan scan Masuk sukses, assignment, job,
  satuan, dan tarif dievaluasi ulang pada tanggal yang dicatat.
- Payroll `PROCESSING`, `CALCULATED`, `APPROVED`, atau `CLOSED` menolak setoran
  baru, setoran susulan, koreksi, dan void.
- Koreksi salah karyawan tetap append-only: sumber menjadi `VOID`, transaksi
  pengganti `POSTED`, dan revisi menyimpan snapshot sebelum/sesudah.
- Mutasi site/jenis/status menutup assignment lama. Assignment masa depan yang
  kehilangan employment eligible menjadi `CANCELLED` agar tidak hidup kembali.
- Tarif Aktif hanya dapat dikoreksi/dibatalkan bila belum pernah direferensikan
  transaksi. Snapshot transaksi tidak di-reprice; selisih menjadi adjustment
  Payroll pada fase Payroll.
- Credential Attendance dan Produksi dipisahkan pada perangkat yang sama.
