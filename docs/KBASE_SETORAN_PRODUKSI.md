# Knowledge Base — Produksi Borongan

> Status: Fase 1 Fondasi & Readiness dan Fase 2A Terminal Setoran & Transaksi Harian sudah tersedia. Koreksi/void, rekap, dan integrasi Payroll dikerjakan pada fase berikutnya.

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

## Fase berikutnya

Fase 2B mengerjakan koreksi/void append-only. Transaksi `POSTED` tidak diedit
langsung: transaksi lama menjadi `VOID`, revisi menyimpan before/after, dan
koreksi membuat transaksi pengganti. Rekap serta integrasi Payroll tetap belum
aktif sampai alur koreksi/void selesai diuji.
