# Ringkasan Produksi harian - M2

M2 menyediakan API baca untuk halaman Ringkasan Produksi yang disepakati Bos. Menu, tab, daftar mobile dan panel rincian UI dikerjakan pada M3. Tidak ada tabel, migrasi, pengubahan data, atau kalkulasi ulang upah melalui API ini.

## Aturan data dan akses

- Membutuhkan login dan permission `production.view`. Tidak membutuhkan token perangkat scanner.
- Satu tanggal bisnis, default hari ini menurut server `Asia/Jakarta`. Hanya `HR_OFFICER` dan `SUPER_ADMIN` boleh memilih tanggal lain; role lain yang mengirim tanggal lampau maupun mendatang ditolak API.
- Akses site mengikuti aturan Produksi lama. HR tetap terbatas site yang diberikan. QC wajib memenuhi irisan site dan snapshot modul transaksi yang diberikan, termasuk akses terhadap pasangan serta transaksi terkait revisi.
- Data hanya berasal dari transaksi `POSTED`. Transaksi `VOID` dikecualikan; pengganti hasil koreksi dihitung sebagai transaksi valid.
- Nilai nominal hanya tersedia untuk HR/Superadmin sesuai M1. Pembatasan berlaku pada seluruh respons bertingkat.
- Tab berasal dari jenis pekerjaan dalam transaksi yang terlihat pada tanggal/site/modul terpilih. Tab tidak berasal dari seluruh master pekerjaan. Pencarian nama/NIK tidak menghilangkan tab lainnya.
- Daftar dikelompokkan per karyawan, site, pekerjaan dan satuan. Transaksi lintas modul yang masih dalam akses pengguna dapat berada pada satu kelompok; identitas modul berupa daftar snapshot, tidak ditebak menjadi satu modul sekarang.
- Kuantitas selalu dipisahkan per satuan. Hasil Linting dan Batil tidak dijumlahkan sebagai total batang produk fisik.
- `rejectOccurrences` adalah jumlah kuantitas detail defect (kejadian defect), bukan jumlah batang rusak unik. Defect diagregasi per transaksi dahulu sehingga tidak menggandakan hasil setor, upah, maupun jumlah transaksi.
- Berat 1/2 dan brand ditampilkan per setoran pada rincian. Berat tidak dijumlahkan untuk menggantikan hasil produksi.
- Koreksi/void tetap menggunakan API transaksi lama dengan seluruh validasi tanggal M1, Payroll dan pasangan. Ringkasan tidak mengubah angka agregat secara langsung.

## Endpoint untuk M3

Prefix: `/api/production`.

| GET | Kegunaan |
| --- | --- |
| `/daily-summary` | Daftar tab pekerjaan beserta jumlah pekerja/setoran dan total per satuan |
| `/daily-summary/employees` | Daftar hasil per karyawan untuk satu pekerjaan, dengan pagination |
| `/daily-summary/employees/:uid/transactions` | Setoran individual karyawan pada pekerjaan/filter terpilih |

Filter bersama: `date` (`YYYY-MM-DD`), `site` (kode site), `moduleUid` (UID publik modul). Filter multi-nilai mengikuti parsing CSV/array pada implementasi. `jobUid` wajib untuk daftar karyawan dan rincian. `unitUid` dapat mempersempit satuan pada daftar/rincian ketika satu pekerjaan memiliki beberapa satuan. Daftar memakai `query` untuk nama/nomor karyawan, `page` dan `pageSize`; default 50, maksimum 500. Identifier route karyawan adalah UID publik.

Respons memuat `effectiveDate`, `serverToday`, `canChangeDate` dan `canViewWages`. M3 wajib memakai tanggal efektif dan capability server untuk kontrol tanggal/upah; aturan keamanan tetap ditetapkan API. Respons daftar memakai `items`, `total`, `page`, `pageSize`.

Tab mengirim `jobUid`, `jobCode`, `jobName`, `employeeCount`, `transactionCount` dan `units` (total per satuan). Setiap item daftar memuat `employee` (`uid`, `employeeNumber`, `fullName`), `site`, `job`, `unit` beserta `decimalPrecision`, `quantity`, `payableQuantity`, `transactionCount`, `lastSubmittedAt`, `rejectOccurrences` dan `modules` dari snapshot yang terlihat. Respons daftar juga menyediakan `summary.units` dari seluruh hasil pencarian, sebelum pagination. `total` menghitung kelompok karyawan/site/pekerjaan/satuan, sehingga bukan jumlah orang unik lintas satuan.

Rincian mengirim UID transaksi yang dapat dibuka melalui API detail transaksi lama untuk koreksi. Timestamp menggunakan ISO dengan offset `+07:00`. Data QC mengikuti snapshot brand/berat/defect per transaksi; transaksi tanpa QC mengirim `qc: null`. Field nominal hadir hanya untuk role berwenang, sedangkan capability `canViewWages: false` tetap dikirim untuk role lain.

Total dan pagination dihitung di database, bukan dari sebagian baris yang sudah dimuat pada frontend. Pilihan tab dan daftar memakai urutan stabil. Data kosong menghasilkan daftar kosong; rincian karyawan tanpa transaksi dalam cakupan tidak membuka identitas dari luar akses.

## Perilaku UI yang direncanakan pada M3

Menu sesudah Transaksi Produksi. Header ringkas berisi tanggal, site/modul, pencarian dan refresh. Tab pekerjaan bergeser horizontal pada HP. Ringkasan mengikuti pekerjaan aktif; daftar desktop berbentuk tabel dan mobile berupa kartu tipis. Ketuk karyawan membuka rincian setorannya.

Refresh otomatis moderat (rencana 60 detik) hanya ketika halaman aktif, berhenti saat browser tersembunyi, dengan indikator waktu pembaruan. Jangan memuat rincian seluruh pekerjaan/karyawan sekaligus.

## Verifikasi

**Hasil M2:** 30 tes API lulus, ESLint file baru dan integrasi app lulus, serta `pnpm run build:api` lulus. SQL tidak dieksekusi dan tidak ada migrasi baru.

Pengujian API memakai mock database untuk batas role/tanggal, scope site/modul, pengikatan parameter SQL, satuan terpisah, preagregasi defect, pagination dan redaksi nominal. Uji database nyata, konsistensi angka dengan transaksi lapangan dan `EXPLAIN` query tetap dilakukan setelah tersedia lingkungan Owner yang diizinkan. Tidak menambahkan indeks berdasarkan asumsi tanpa pengukuran.
