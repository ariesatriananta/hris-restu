# Ringkasan Produksi harian - M2/M3

M2 menyediakan API baca, dan M3 menyediakan halaman Ringkasan Produksi yang disepakati Bos. Tidak ada tabel, migrasi, pengubahan data, atau kalkulasi ulang upah melalui API ini.

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

## Halaman Ringkasan Produksi (M3)

Menu **Produksi Borongan > Ringkasan Produksi**, sesudah Transaksi Produksi, pada `/produksi/ringkasan`. Header ringkas berisi tanggal, site/modul, pencarian dan refresh. Tab pekerjaan bergeser horizontal pada HP. Ringkasan mengikuti pekerjaan aktif; daftar desktop berbentuk tabel dan mobile berupa kartu tipis. Ketuk karyawan membuka rincian setorannya.

Refresh otomatis setiap 60 detik ketika halaman aktif, berhenti saat browser tersembunyi atau panel rincian/koreksi dibuka, dengan indikator waktu pembaruan. Rincian hanya dimuat saat karyawan dipilih, dengan pagination sendiri; tidak memuat seluruh pekerjaan/karyawan sekaligus.

Tanggal, site, modul, pekerjaan terpilih, pencarian dan pagination tersimpan di URL. Pencarian ditunda singkat agar tidak mengirim request tiap penekanan tombol. Pilihan modul menyesuaikan site; modul yang sudah tidak tersedia dibersihkan. Pergantian tanggal efektif server menutup rincian dan mereset halaman/pekerjaan, sehingga data kemarin tidak tercampur dengan hari baru.

Cache ringkasan, opsi modul dan detail yang dipakai halaman ini dipisahkan berdasarkan akun serta cakupan akses. Logout/login atau perubahan role/site/modul tidak memakai respons akun sebelumnya. Query ringkasan berada dalam cakupan invalidasi transaksi, sehingga koreksi/void dari rincian memperbarui ringkasan sesuai data server.

### Uji halaman oleh Owner

1. Login QC, buka Ringkasan Produksi. Tanggal berupa hari ini dan tidak dapat diubah. Nominal upah tidak tampil.
2. Pilih site/modul yang diizinkan. Coba tab Linting dan Batil; jumlah orang/setoran serta satuan tetap terpisah.
3. Cari nama/NIK dan ubah halaman; tab pekerjaan tetap ada. Ubah filter dan pastikan pagination kembali ke awal.
4. Gunakan HP: daftar tampil sebagai kartu tipis tanpa scroll horizontal isi daftar. Tab pekerjaan boleh digeser.
5. Ketuk pekerja, periksa jumlah setoran, brand dan QC per transaksi. Buka Detail untuk koreksi/void; aturan M1 dan Payroll tetap berlaku.
6. Saat panel ditutup, periksa refresh manual dan waktu pembaruan. Beralih ke tab browser lain atau membuka rincian menjeda polling.
7. Login HR dengan permission/site sesuai: pilihan tanggal tersedia dan nominal mengikuti akses. Berganti akun harus menghilangkan data akun sebelumnya.

## Verifikasi

**Hasil M2:** 30 tes API lulus, ESLint file baru dan integrasi app lulus, serta `pnpm run build:api` lulus. SQL tidak dieksekusi dan tidak ada migrasi baru.

**Hasil pengujian M3:** 8 tes browser halaman, 3 tes cache query, dan 54 tes regresi Produksi lulus. Build frontend lengkap (`pnpm run build:frontend`, TypeScript dan Vite) lulus. Tampilan mobile 390px diperiksa tanpa overflow daftar. Lint terarah tidak memiliki error; peringatan standar TanStack Table tetap ada. Route tree dibuat melalui generator TanStack, tidak diedit manual.

Pengujian API memakai mock database untuk batas role/tanggal, scope site/modul, pengikatan parameter SQL, satuan terpisah, preagregasi defect, pagination dan redaksi nominal. Uji database nyata, konsistensi angka dengan transaksi lapangan dan `EXPLAIN` query tetap dilakukan setelah tersedia lingkungan Owner yang diizinkan. Tidak menambahkan indeks berdasarkan asumsi tanpa pengukuran.
