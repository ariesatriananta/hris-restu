# Input Setoran Produksi Batch (demo)

Fitur ini membuat **transaksi Produksi sungguhan**, bukan simulasi tampilan.
Tidak ada migration, seed atau perubahan data lama. Jangan mengaktifkannya
sebagai alur operasional rutin.

## Akses dan batas

- Hanya `SUPER_ADMIN`, izin `production.scan`, dan bukan akun yang juga mempunyai
  role QC. Pemeriksaan berlaku di backend, termasuk preview.
- Aktifkan `PRODUCTION_BATCH_TOOLS_ENABLED=true` di environment API lalu restart.
  Default `false`. Tidak mengikuti flag Attendance Batch.
- Menu tersedia melalui `...` pada Transaksi Setoran ketika respons daftar
  mengembalikan `batchInputEnabled=true`.
- Pilih satu site atau ALL dan rentang maksimal tujuh hari, tanpa tanggal masa
  depan. Maksimal **1.000 kandidat karyawan/tanggal per proses**, dijumlahkan
  untuk seluruh site dan tanggal; jumlah diperiksa sebelum validasi individual.
  Contoh 400 orang x 3 hari = 1.200 kandidat, sehingga perlu dipecah.
- Mulai demo dari satu site dan satu hari. Jumlah kandidat bukan jumlah
  karyawan unik dan dapat mencakup target yang akhirnya tidak eligible.

## Kelayakan dan pembentukan data

Generator menggunakan `historicalProposal`, `attendanceContext`,
`availableJobs`, resolver QC, snapshot modul, dan `repriceProductionDay` yang
sama dengan setoran yang sudah berjalan. Tidak memintas validasi tersebut.

- Karyawan harus mempunyai tepat satu histori employment ACTIVE pada tanggal
  tersebut, site yang cocok, status mengizinkan produksi, dan payroll basis
  PIECE_RATE sesuai validator setoran historis saat ini. TRAINING dengan basis
  TIME_BASED masih ditolak validator existing meski aturan bisnis mengizinkan
  monitoring Produksi Training; ini gap existing untuk tindak lanjut terpisah,
  bukan perubahan kebijakan melalui tool demo ini.
- Modul historis wajib ada, aktif, dan milik site tersebut.
- Attendance harus PRESENT dengan scan Masuk SUCCESS atau koreksi Masuk
  APPROVED yang telah diterapkan. Jam Masuk harus tersedia dan valid.
- Penugasan utama dan tarif/unit aktif wajib tunggal pada tanggal tersebut;
  assignment/rate yang bertumpang tindih tetap diblokir.
- Generator membuat satu setoran untuk **pekerjaan utama** per karyawan/tanggal.
  Assignment pekerjaan tambahan tidak dipilih. Ini batas generator demo;
  kemampuan input operasional yang sudah ada tidak diubah.
- Adanya transaksi employee/site/job/tanggal yang sama, termasuk VOID,
  menyebabkan kandidat dilewati, bukan diganti atau ditambahkan lagi.
- Payroll PROCESSING, CALCULATED, APPROVED, atau CLOSED tetap memblokir sesuai
  validator normal. Proteksi snapshot/lock Payroll diperiksa ulang saat repricing.
- Brand harus tersedia dan aktif. Jumlah acak 300–900 satuan, brand acak,
  berat Linting 70.00–79.99 gram, serta setiap defect aktif 0–3.
  Berat/defect hanya untuk Linting; pekerjaan lain menyimpan brand saja.
- Tarif, potongan, hasil dibayar, tier dan bruto **bukan acak**: dihitung ulang
  oleh kalkulator Produksi normal. QC tetap metadata seperti alur yang ada.
- Waktu setoran berada di tanggal historis, setelah jam Masuk, sebelum akhir
  tanggal tersebut dan tidak melewati waktu preview. Waktu dibekukan dalam
  rencana sehingga run tidak mengubah hasil acak atau jam setoran.

### Linting/Batil Klaten

Hanya Klaten sesuai hardcode pair yang sudah ada. Pekerja utama Linting
dipasangkan satu lawan satu dengan pekerja utama Batil yang eligible, berbeda
orang, mempunyai modul sama dan satuan PCS sama. Raw PCS dan waktu transaksi
kedua pasangan sama; masing-masing memakai tarif dan potongannya sendiri.
Brand mengikuti Linting, sedangkan berat/defect hanya disimpan di Linting.
Tidak ada Batil Klaten yang dibuat sendirian. Kandidat tanpa pasangan dicatat
sebagai dilewati beserta alasan. Assignment Batil sekunder belum dipakai oleh
generator ini; setoran scanner operasional tetap mendukung alur sebelumnya.

## Kontrak API

`POST /api/production/transactions/batch-input/preview`

```json
{"dateFrom":"2026-11-01","dateTo":"2026-11-01","site":"KLATEN"}
```

Respons `{data}` berisi filter, `previewToken`, `expiresAt`, `canCreate`,
`summary:{employees,planned,blocked,pairs}` dan
`items:[{businessDate,site,eligible,planned,blocked,pairs,blockers:[{reason,count}]}]`.
`employees` adalah seluruh target karyawan/tanggal; `eligible` dan `planned`
adalah target yang benar-benar siap dibuat setelah pairing.

`POST /api/production/transactions/batch-input/run`

```json
{
  "dateFrom":"2026-11-01",
  "dateTo":"2026-11-01",
  "site":"KLATEN",
  "previewToken":"token-dari-preview",
  "idempotencyKey":"11111111-1111-4111-8111-111111111111",
  "reason":"Pembuatan data demo",
  "confirmation":"PROSES"
}
```

Alasan 10–400 karakter. Respons `{data:{total,created,replayed,pairs}}`.
403 jika akses/flag tidak memenuhi, 422 jika payload/rentang/batas tidak valid,
409 jika preview berubah/kedaluwarsa atau batch lain sedang berjalan.

## Konsistensi dan retry

- Preview hanya membaca dan mengakhiri transaksi dengan rollback. Seed acak,
  hash seluruh proposal/masters/QC, jumlah, aktor dan masa berlaku 15 menit
  ditandatangani HMAC memakai secret autentikasi server. Token tidak memuat
  nama karyawan atau nominal transaksi.
- Run membangun ulang rencana yang sama dan mengunci ulang fakta terkait.
  Perubahan kelayakan, tarif, attendance, brand/defect, modul, atau transaksi
  yang mengubah rencana membatalkan seluruh batch; user harus Periksa ulang.
- Named lock MySQL menyerialkan tool batch; row lock karyawan menyelaraskan
  dengan posting normal. Key per baris menggunakan idempotency key request
  dan indeks baris, dilindungi unique key database yang sudah ada.
- Seluruh transaksi, QC, pair, snapshot, repricing, dan audit berada dalam satu
  transaksi database. Satu kegagalan mengembalikan semuanya.
- Timeout setelah commit dapat diulang dengan token, idempotency key, alasan
  dan filter yang persis sama. Replay dicek sebelum expiry/validasi ulang dan
  tidak membuat baris lagi. Jika batch hanya tersisa sebagian setelah tindakan
  lain, replay ditolak agar tidak mengisi ulang data diam-diam.
- Entry source memakai HISTORICAL sesuai constraint existing; notes dan audit
  menandai sumber `Demo batch`. Tidak ada kolom atau status baru.

## Verifikasi dan batas pengujian

Tes API memakai database mock: eligibility, pairing, equal PCS, waktu historis,
flag/role, batas awal, stale preview, concurrent lock, rollback dan replay
sesudah expiry. Kalkulator dan pair existing tetap diuji lewat suite regresi.
Tidak menjalankan batch, seed, migration atau write pada database lokal/live.
Kapasitas batas atas belum menjadi benchmark beban produksi; validasi memakai
helper existing per kandidat, sehingga demo besar sebaiknya dipecah per site/hari.
