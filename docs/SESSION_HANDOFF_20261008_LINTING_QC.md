# Linting QC — rencana 3 turn

## Keputusan Bos

- Berat dan defect QC hanya untuk pekerjaan `BORONGAN-LINTING`, bukan bagian
  karyawan. Brand berlaku untuk seluruh pekerjaan (revisi terakhir Bos).
- Satu setoran satu brand; master brand per site, current-state tanpa tanggal berlaku.
- Master defect global: nama jenis, aktif/nonaktif, urutan; tanpa alasan tambahan.
- Brand wajib pada seluruh UI setoran baru/susulan; dua berat hanya wajib
  untuk Linting. Backend dan Excel tetap opsional.
- Berat 1/2 masing-masing satu sampel batang, gram positif maksimal dua desimal;
  input koma atau titik diterima.
- Defect bilangan bulat tidak negatif; satu batang boleh punya beberapa defect,
  sehingga jumlah defect tidak dibatasi oleh PCS setoran.
- Excel lama tanpa QC tetap diterima. Net Batang/Gendel hanya ringkasan UI
  sesuai revisi UX terakhir, bukan perubahan penyimpanan atau kalkulasi upah.
- QC tidak mengubah quantity, payable quantity, tarif/tier, potongan standar, atau
  Payroll. Contoh 500 PCS + defect 10 tetap quantity 500; potongan standar 3%
  (jika berlaku) tetap menghasilkan payable 485, terpisah dari QC.

## Turn 1 — fondasi database dan API master

- Migration owner-run: `db/migrations/20261008_production_linting_qc.sql`.
  Additive empat tabel, tanpa seed/backfill dan tanpa mengubah tabel Payroll.
- Master `production_brands` dan `production_defects`: UID publik, kode otomatis
  immutable, nama, aktif/nonaktif, urutan. Brand terkait site.
- `production_transaction_qc`: satu header per transaksi, brand/snapshot dan dua
  berat nullable untuk kompatibilitas backend. Detail defect memiliki snapshot
  kode/nama/urutan dan kuantitas. Tidak ada trigger penghitungan produksi.
- Router `apps/api/src/routes/production-qc.ts` dipasang pada
  `/api/production-structure` di `apps/api/src/app.ts`.
- Endpoint `/brands`, `/defects`, `/qc-options`; kelola melalui permission
  `production.manage_master`, baca melalui `production.view`; brand/options
  tetap dibatasi akses site. Tidak ada penghapusan master.
- List master menggunakan pagination repo (default 50, maksimum 500), filter
  query/isActive; brand menerima filter site. QC options membutuhkan site dan
  hanya mengembalikan master aktif, urut sortOrder lalu ID deterministik.
- POST master menerima nama/isActive/sortOrder (brand juga site); kode dibuat
  server. PATCH menerima field yang berubah saja, tanpa mengganti kode/site
  atau mereset status/urutan yang tidak dikirim.
- Kontrak QC: `brandUid`, `weight1Grams`, `weight2Grams`,
  `defects: [{ defectUid, quantity }]`; field header optional/nullable, defect
  default array kosong. Payload defect duplikat ditolak.
- Kontrak validasi QC disiapkan tetapi BELUM disambungkan ke penyimpanan
  transaksi. Form setoran, import, koreksi, dan Payroll belum diubah.
- SQL belum dieksekusi oleh Jo. Jangan menyatakan fitur QC siap operasional hanya
  karena fondasi/master API selesai.

### Verifikasi turn 1

- 19 test baru kontrak QC dan API master lulus.
- 140 test regresi pada 10 suite Produksi/Payroll lulus.
- Lint focused dan `git diff --check` lulus.
- `pnpm build:api` lulus (exit 0).
- Empat blok CREATE TABLE migration cocok dengan schema kanonik.
- Belum menguji migration pada database karena eksekusi SQL owner-controlled.

## Turn 2 — QC pada setoran dan form (diimplementasikan)

- Bos melaporkan migration QC sudah dijalankan pada 8 Oktober 2026; Jo tidak
  mengulang eksekusinya. Laporan Bos bukan audit database pada turn ini.
- Master Pekerjaan memiliki tab `brands` / `defects`, form tambah/ubah dan tabel
  standar repo. Filter QC menggunakan parameter
  qcFilter/qcStatus/qcSite/qcPage/qcPageSize.
- Frontend: `production-qc-fields.tsx`, `production-qc-form-policy.ts`,
  `production-qc-master.tsx` dan `production-qc-master-queries.ts`.
- API terminal lookup mengembalikan `qcOptions` ketika pekerjaan Linting tersedia;
  opsi mengikuti site perangkat yang telah diverifikasi, tanpa permission
  tambahan baca master bagi petugas scan.
- Terminal post dan historical preview/post menerima `qc` opsional. Validasi dan
  penyimpanan berada di `apps/api/src/lib/production-qc-storage.ts`.
- UI terminal dan Setoran Susulan mewajibkan QC lengkap untuk Linting dan
  meresetnya saat ganti karyawan/pekerjaan. Preview susulan tidak membutuhkan QC;
  kewajiban QC berlaku saat simpan di UI, bukan pada kontrak backend.
- Header/detail dimasukkan dalam transaksi database yang sama dengan setoran.
  Replay dengan QC membandingkan data asli tanpa validasi ulang master terbaru.
  Klien lama yang tidak mengirim QC tidak menimpa QC pada replay.
- Pada akhir turn 2, Excel, detail, penyalinan koreksi dan dependensi penghapusan
  masih menunggu turn 3; implementasinya dicatat di bagian berikut.

### Verifikasi turn 2

- 190 test backend QC, Produksi dan Payroll lulus pada 14 suite.
- 18 test frontend validasi/regresi dan 6 test browser form/master
  lulus. TypeScript dan lint focused tanpa error; warning umum TanStack
  `incompatible-library` pada komponen master.
- `pnpm build` lulus: frontend, API, dan pemeriksaan paket production (exit 0).

### Checklist original

- Bangun UI master menggunakan primitive/pola tabel repo; kode otomatis tidak
  perlu diketik pengguna. Sediakan brand per site dan defect global.
- Hubungkan QC opsional pada kontrak API terminal dan setoran historis/manual.
  Validasi brand sesuai site/aktif dan defect aktif ketika input baru diberikan.
- Opsi QC terminal harus mengikuti site perangkat/hasil lookup yang diverifikasi
  server, bukan mempercayai site dari browser; jangan menambahkan persyaratan
  `production.view` ke petugas terminal bila akses terminal sekarang berbeda.
- Penyimpanan header/detail QC harus atomik bersama setoran; duplicate submit
  tidak boleh membuat atau menimpa QC kedua.
- UI Linting: brand wajib, dua berat wajib, grid defect default 0 dan total hanya
  informasi. Brand kosong menampilkan arahan pengaturan master, tanpa brand
  fallback otomatis. Pekerjaan lain tidak diblokir QC.
- Reset QC saat ganti karyawan/pekerjaan/sukses setoran; mutasi payload harus
  menginvalidasi idempotency key seperti kuantitas sekarang.
- Jangan memaksa transaksi lama tanpa QC melengkapi QC hanya untuk koreksi
  jumlah. Pertahankan batas/permission/kunci koreksi Payroll yang ada.

## Turn 3 — Excel, detail/koreksi, regresi (diimplementasikan)

- Kontrak import `row.qc` menggunakan `brandCode`, `weight1Grams`,
  `weight2Grams`, dan `defects: [{ defectCode, quantity }]`. Backend tetap
  opsional, memvalidasi master aktif/site/pekerjaan sebelum menyimpan batch.
- Header tambahan Excel: `QC_BRAND_CODE`, `QC_BERAT_1_GRAM`,
  `QC_BERAT_2_GRAM`, `QC_DEFECT_<kode stabil defect>`. Empat kolom wajib lama
  tetap di awal; kolom QC dibaca berdasarkan header, bukan posisi. Header
  duplikat/tidak dikenal dan defect bukan bilangan bulat tidak diabaikan.
- Template menyediakan `Referensi QC` (nama, site dan kode), komentar nama
  defect pada header, serta panduan; tidak memilih brand otomatis. Berat koma
  atau titik didukung. Defect kosong/0 tidak dikirim untuk menjaga payload
  ringkas; jumlah defect positif tidak dibatasi PCS. Export hasil validasi
  mempertahankan metadata QC dan bisa langsung diunggah ulang.
- Resolusi master import memakai dua query batch dengan indeks Map, bukan
  query per baris. Header/detail QC ditulis dalam chunk maksimum 250 item
  di transaksi yang sama dengan seluruh setoran. Replay memeriksa snapshot
  kode/berat/defect asli tanpa menulis ulang atau tergantung master terbaru.
- Detail transaksi memuat panel QC compact dengan snapshot brand, dua berat,
  defect dan total informasi. Linting lama tanpa QC ditandai belum dicatat.
  Tabel utama tidak ditambah kolom lebar.
- Koreksi menyalin snapshot QC melalui INSERT SELECT hanya ketika pekerjaan
  pengganti Linting; legacy tanpa QC tetap kosong. Kegagalan clone membatalkan
  seluruh koreksi. Void mempertahankan QC transaksi asli.
- Reset batch menghapus QC detail lalu header sebelum transaksi induk setelah
  pemeriksaan existing. Tidak melonggarkan permission, blocker revisi atau
  kunci Payroll. Script owner-run lama tidak diubah; FK RESTRICT dapat menolak
  rollback lama untuk transaksi yang sekarang memiliki QC.
- Tidak mengubah migration yang sudah dieksekusi, schema Payroll, nominal,
  raw/payable quantity, snapshot potongan, perhitungan tier, atau limit JSON
  global 5MB. Payload 3.000 baris dengan 14 jenis defect positif diuji di bawah
  5MB; volume metadata jauh lebih besar tetap tunduk pada limit request.

### Checklist pengujian turn 3

- Template Excel menambah brand, dua berat dan kolom defect menggunakan kode
  stabil; jangan mengandalkan posisi kolom/nama master yang bisa berubah.
- Parser, preview, penyimpanan dan export-validation/reimport harus konsisten.
  File lama tanpa QC tetap valid; batas 3.000 baris, batch writes dan atomisitas
  tetap dijaga. QC hanya pada pekerjaan Linting hasil resolusi server.
- Detail transaksi menampilkan QC tanpa memperlebar tabel utama berlebihan.
  Koreksi append-only mempertahankan/menyalin snapshot QC yang sesuai; pekerjaan
  non-Linting tidak boleh secara keliru membawa QC Linting.
- Periksa seluruh alur penghapusan/rollback yang menyentuh transaksi: FK QC
  `RESTRICT` sengaja melindungi histori; jangan membuat cascade baru atau
  mengubah skrip owner-run lama diam-diam.
- Regresi: comma/dot dan dua desimal, brand lintas site, master rename/reorder/
  deactivate, overlapping defects, transaksi legacy, old Excel, duplicate
  submit, rollback batch, quantities/gross/payroll identik dengan QC atau tanpa.

## Verifikasi akhir turn 3

- 220 test backend lulus pada 15 suite QC, Produksi, dan Payroll. Termasuk
  endpoint salah-site, kegagalan tulis QC import, kegagalan clone koreksi,
  kegagalan delete QC, replay dan cakupan site master template.
- 50 test frontend Produksi lulus pada 10 suite. Termasuk pembacaan header
  QC berdasarkan kode, comma grams, defect overlap, ekspor validasi/reimport,
  kompatibilitas legacy, template referensi dan panel snapshot QC.
- TypeScript frontend, build API, lint focused backend/frontend serta
  `git diff --check` lulus (exit 0).
- `pnpm build` final lulus (exit 0): frontend, API dan verifikasi paket
  production `dist/index.html` / `dist-server/server.js`.
- Tests memakai mock database; tidak menggantikan UAT terhadap database Bos.
  Sebelum operasional, atur Brand aktif per site dan Defect global, unduh
  template terbaru, lalu uji setoran Linting, import, detail dan koreksi.

## Penyempurnaan UX terminal setoran

- Form terminal dibuat compact untuk HP/tablet: padding kartu bawaan
  dikurangi secara lokal, header/identitas/jarak diringkas, pekerjaan dan
  kuantitas sejajar. Tidak menerapkan tinggi paksa atau memotong isi.
- Hint presisi dan panel tarif/estimasi bruto dihapus dari form; validasi
  presisi kuantitas serta nominal server tetap seperti sebelumnya.
- Brand memakai RadioGroup standar dengan label yang bisa diklik, tanpa
  pilihan otomatis. Shared QC fields juga dipakai pada setoran susulan.
- Defect selalu dua kolom, termasuk lebar 320px. Nol hilang saat fokus;
  kosong dipulihkan ke nol saat blur. Nilai nonzero tidak dihapus. Draft
  defect kosong bermakna nol saat validasi/payload, bukan memblokir simpan;
  berat kosong dan jumlah tidak valid tetap ditolak.
- Regresi frontend Produksi: 56 test pada 11 suite lulus. Browser test
  mencakup input nol menjadi 5, radio/disabled dan dua kolom tanpa overflow.
  TypeScript, lint focused dan build frontend lulus. Full terminal browser test
  dengan 14 defect pada lebar 320px juga lulus tanpa overflow horizontal.
  Tidak ada perubahan API atau database.

## Tambahan UX setoran: stepper, default Brand, format gram

- Defect memiliki tombol minus/plus di kiri-kanan input sempit. Minus berhenti
  di nol; field tetap bisa diketik dan tetap dua kolom pada HP.
- Bos mengonfirmasi default Brand mengikuti terminal/perangkat yang sama.
  Terminal lookup membaca Brand dari setoran POSTED terakhir yang memiliki QC
  pada device dan site yang telah diverifikasi server. Brand aktif itu dipilih
  saat lookup/reset pekerjaan; jika tidak tersedia, pilih opsi aktif pertama.
  Ini menggantikan keputusan lama tanpa default khusus pada terminal, bukan
  mengubah snapshot transaksi yang sudah tersimpan.
- Berat mulai `00,00`, nilai nol kosong saat fokus, dan blur memformat dua
  desimal koma (`71` menjadi `71,00`). Presisi berlebih tidak dibulatkan diam-diam;
  nol/kosong tetap tidak valid untuk menyimpan sampel. Payload tetap desimal API
  seperti sebelumnya. Tidak ada migration atau perubahan kalkulasi Payroll.
- Pemformatan berat dan perubahan nol/kosong saat fokus tidak mengganti kunci
  retry terminal bila isi QC semantiknya tetap sama. Perubahan Brand, berat
  nyata atau jumlah defect tetap menginvalidasi kunci seperti sebelumnya.
- Verifikasi tambahan: 68 test frontend pada 11 suite dan 90 test backend
  storage/route transaksi lulus; termasuk scope device/site, fallback Brand,
  stepper, mask blur, mobile layout dan kunci retry setelah fokus field nol.

## Revisi UX tambahan: mask tetap dan ringkasan operasional

- Berat tidak ditandai merah saat form pertama muncul; validasi visual baru
  tampil setelah field disentuh. UI memakai mask tetap dua digit dan dua
  desimal, maksimal 99,99: mengetik `8132` langsung menjadi `81,32`.
  Ini menggantikan format sebelumnya yang mengubah `71` menjadi `71,00`;
  Revisi berikutnya memakai input dari kiri: `71` tetap `71` saat mengetik
  dan menjadi `71,00` saat blur; `8132` tetap langsung menjadi `81,32`.
- Brand selalu tiga kolom termasuk HP, nama panjang dipotong ellipsis dengan
  nama lengkap pada title. Defect tetap dua kolom, stepper melekat ke input,
  dan setiap baris visual ganjil diberi latar primary tipis.
- Ringkasan tiga kolom bergradasi primary: Net Batang = PCS mentah - jumlah
  defect, Total Reject = jumlah defect, Gendel = PCS mentah / 20 (dua desimal).
  Nilai negatif Net Batang tetap ditampilkan jika defect tumpang tindih;
  semuanya informasi UI saja tanpa perubahan quantity, Payroll, atau schema.
- Verifikasi: 74 test frontend pada 11 suite lulus; TypeScript, lint focused,
  dan build frontend lulus. Tidak menjalankan transaksi atau migration database.

## Perluasan Brand seluruh pekerjaan dan perapihan template

- Lookup terminal selalu memuat opsi Brand site bila ada pekerjaan tersedia,
  tetap mengikuti default Brand terakhir perangkat/site atau opsi pertama.
- Form scan dan susulan mewajibkan Brand untuk seluruh pekerjaan; form selain
  Linting tidak menampilkan atau mengirim berat, defect, dan ringkasan Linting.
- API/Excel menerima Brand saja untuk pekerjaan lain, tetap memvalidasi Brand
  aktif pada site efektif. Berat/defect ditolak untuk pekerjaan non-Linting;
  API/Excel lama tanpa metadata tetap diterima.
- Koreksi append-only mempertahankan snapshot Brand; berat dan defect hanya
  disalin ke pekerjaan Linting. Detail non-Linting hanya menampilkan Brand.
- Komentar pada header defect template dihapus karena WPS menampilkannya sebagai
  panel mengambang di area input. Nama/kode defect dan panduan tetap tersedia
  pada sheet Referensi QC/Panduan. Unduh ulang template untuk mendapat revisi;
  file lama di komputer tidak berubah otomatis.
- Tidak ada migration, backfill, perubahan kuantitas/tarif/potongan/Payroll,
  transaksi database, atau deploy pada perubahan ini.
- Verifikasi perluasan: 83 test frontend Produksi pada 11 suite dan 749 test
  backend pada 96 suite lulus. Backend diuji berurutan dengan environment dummy,
  bukan koneksi database operasional; lint focused, format frontend, build
  frontend, dan build API lulus.

## Riwayat 5 setoran per perangkat

- Riwayat terminal kini dibaca dari transaksi tersimpan melalui
  `GET /api/production/terminal/recent`, bukan state sesi browser.
- Endpoint membutuhkan `production.scan`, token perangkat Produksi aktif, dan
  akses site perangkat. Query dibatasi `scan_device_id`, site, status POSTED,
  urutan tanggal transaksi/id terbaru, maksimal lima transaksi. Bukan filter
  pengguna atau hari tertentu, sehingga tetap tersedia setelah refresh.
- Respons hanya identitas operasional, pekerjaan, satuan/PCS, waktu, dan
  snapshot Brand. Tidak mengirim nominal upah, tarif, atau jumlah dibayar.
- Frontend mengambil ulang saat mount/refresh dan setelah simpan berhasil;
  loading/error/retry tersedia tanpa mengubah data setoran. Token tidak dimuat
  dalam query cache key. Endpoint bersifat read-only, tanpa migration.
- Regresi: 86 test frontend Produksi dan 73 test route transaksi lulus;
  TypeScript frontend, build API, serta lint focused lulus.

## Drawer detail setoran terminal

- Card riwayat adalah tombol aksesibel yang membuka Sheet standar repo,
  full-width di HP dan scroll vertikal aman, tanpa action bisnis.
- Detail baca-saja menampilkan identitas pekerja, PCS mentah, status, nomor,
  tanggal/waktu, pekerjaan, perangkat, sumber, dan snapshot Brand/QC.
- API khusus `GET /api/production/terminal/transactions/:uid` memvalidasi
  permission scan, token perangkat aktif, akses site, serta kepemilikan UID
  transaksi pada perangkat/site. Transaksi VOID boleh dibaca sebagai Dibatalkan.
- Query/respons detail tidak memuat upah, tarif, potongan, Payroll, atau action
  permissions. QC tetap snapshot; setoran lama tanpa QC diberi informasi kosong.
- Tidak memakai endpoint detail admin dan tidak mengubah transaksi database.
- Regresi: 87 test frontend Produksi dan 80 test route transaksi lulus,
  termasuk akses perangkat/site, snapshot QC, drawer mobile tanpa upah/action.

## Ringkasan QC pada card riwayat Linting

- Card Linting menambah satu baris compact: total defect serta berat sampel
  1/2 dalam gram dua desimal. Card pekerjaan lain tidak mendapat baris ini.
- Endpoint recent membaca berat tersimpan dan SUM jumlah detail defect dalam
  query yang sama, bukan dari master/draft terbaru. QC lama yang tidak tersedia
  ditampilkan sebagai tanda kosong, bukan dianggap berat/defect nol.
- Tidak mengubah PCS, upah, scope perangkat, atau drawer baca-saja.

## Ringkasan harian terminal dan panel riwayat

- `GET /api/production/terminal/daily-summary` bersifat read-only, memerlukan
  permission scan, token perangkat aktif, dan akses site perangkat.
- Hari mengikuti waktu server Asia/Jakarta. Ringkasan seluruh site, bukan hanya
  perangkat: hadir = karyawan PRESENT per bagian dari histori efektif; sudah
  input = karyawan hadir dengan minimal satu transaksi POSTED pada site/hari
  tersebut; belum input = hadir dikurangi sudah input. Setoran berulang dihitung
  satu orang, VOID tidak dihitung, histori batal/bertumpang tindih tidak dipilih.
- Satu baris tiga card per bagian produksi aktif, termasuk bagian bernilai nol.
  Hanya tampil saat barcode kosong dan tidak sedang input setoran. Memuat ulang
  saat kembali idle dan setiap 60 detik; kegagalan summary tidak memblokir scan.
- Panel lima setoran perangkat dapat dilipat. Preferensi buka/tutup disimpan
  lokal browser, default terbuka; kegagalan storage tidak memblokir operasional.
- Tidak mengubah Attendance, transaksi, QC, tarif, atau Payroll; tanpa migration.

## Daftar karyawan dari card ringkasan

- Setiap card membuka dialog baca-saja dengan pencarian nama/nomor dan
  pagination server, default 50 dan maksimum 500. Daftar memuat bagian/modul
  efektif, jam masuk/pulang, dan khusus Sudah Input: jumlah transaksi POSTED,
  total PCS mentah serta waktu setoran terakhir. Tidak mengirim upah/tarif.
- Endpoint `GET /api/production/terminal/daily-summary/employees` memakai token
  perangkat aktif, permission scan, dan akses site. Site/hari berasal dari
  perangkat/server; frontend hanya memilih UID bagian dan kondisi card.
- Summary dan daftar memakai SQL membership bersama. Schema histori lama tanpa
  kolom `status` didukung; schema baru tetap mengecualikan histori CANCELLED.
- State tabel sementara berada di dialog, bukan URL scanner. Menutup dialog
  mengembalikan fokus ke barcode. Tidak ada action bisnis atau mutation data.

## Batas penerapan akhir ringkasan

Tidak mengeksekusi migration/seed, tidak deploy, dan tidak commit tanpa permintaan
Bos. Pertahankan perubahan user lain pada working tree.
