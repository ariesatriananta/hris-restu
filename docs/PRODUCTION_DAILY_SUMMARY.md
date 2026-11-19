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

Rincian mengirim UID transaksi yang dapat dibuka melalui API detail transaksi lama untuk koreksi. Timestamp menggunakan ISO dengan offset `+07:00`. Data QC mengikuti snapshot brand/berat/defect per transaksi; transaksi tanpa QC mengirim `qc: null`. Field nominal, `payableQuantity` (Hasil Dibayar), dan jumlah potongan PCS hadir hanya untuk HR_OFFICER/SUPER_ADMIN, termasuk total per satuan, daftar karyawan dan rincian; hasil setor tetap operasional; persentase adjustment/potongan juga hanya tersedia untuk HR_OFFICER/SUPER_ADMIN, sedangkan capability `canViewWages: false` tetap dikirim untuk role lain.

Total dan pagination dihitung di database, bukan dari sebagian baris yang sudah dimuat pada frontend. Pilihan tab dan daftar memakai urutan stabil. Data kosong menghasilkan daftar kosong; rincian karyawan tanpa transaksi dalam cakupan tidak membuka identitas dari luar akses.

## Halaman Ringkasan Produksi (M3)

Menu **Produksi Borongan > Ringkasan Produksi**, sesudah Transaksi Produksi, pada `/produksi/ringkasan`. Header ringkas berisi tanggal, site/modul, pencarian dan refresh. Tab pekerjaan bergeser horizontal pada HP. Daftar mengikuti pekerjaan aktif tanpa tiga kartu KPI (Pekerja, Hasil Setoran, Jumlah Setoran); desktop berbentuk tabel dan mobile berupa kartu tipis. Setelah kolom Setoran terdapat Defect Tercatat (jumlah kejadian defect, bukan PCS rusak unik; kosong ditampilkan sebagai tanda pisah) dan Rata-rata / Setoran (hasil setor mentah dibagi jumlah transaksi, per satuan). Rata-rata memakai format Indonesia dengan maksimal dua desimal atau presisi satuan jika lebih tinggi; jumlah transaksi nol atau data tidak valid menghasilkan tanda pisah. Kedua informasi juga tersedia ringkas pada kartu mobile. Ketuk karyawan membuka rincian setorannya.

Refresh otomatis setiap 60 detik ketika halaman aktif, berhenti saat browser tersembunyi atau panel rincian/koreksi dibuka, tanpa baris informasi waktu pembaruan atau interval polling di halaman. Rincian hanya dimuat saat karyawan dipilih, dengan pagination sendiri; tidak memuat seluruh pekerjaan/karyawan sekaligus.

Tab pekerjaan sekaligus menyediakan ringkasan operasional yang dapat dibuka/ditutup bersama melalui tombol panah kecil di sebelah kanan deretan tab. Default tertutup setiap halaman dibuka, tanpa penyimpanan preferensi. Saat terbuka, setiap tab menjadi kartu compact: badge jumlah pekerja pada header, Hasil Setoran per satuan, Jumlah Setoran, dan Defect Tercatat (kejadian defect dijumlahkan; nol ditampilkan sebagai tanda pisah). Tidak ada nominal, Hasil Dibayar atau persentase potongan pada kartu ini, termasuk untuk HR/Superadmin. Klik header tetap memilih pekerjaan; ringkasan bukan tombol tambahan. Navigasi keyboard tab tetap memakai primitive Tabs bawaan. Pada HP, kartu bergeser horizontal sementara tombol buka/tutup tetap tersedia di luar area geser tanpa memperlebar halaman.

Angka kartu memakai agregat tab dari seluruh transaksi POSTED dalam tanggal/site/modul dan akses pengguna. Pencarian nama/NIK maupun pagination daftar tidak membatasi ringkasan kartu; satuan berbeda tetap ditampilkan terpisah. Membuka ringkasan tidak memuat daftar karyawan atau setoran setiap pekerjaan dan tidak menambahkan request API.

Tanggal, site, modul, pekerjaan terpilih, pencarian dan pagination tersimpan di URL. Pencarian ditunda singkat agar tidak mengirim request tiap penekanan tombol. Pilihan modul menyesuaikan site; modul yang sudah tidak tersedia dibersihkan. Pergantian tanggal efektif server menutup rincian dan mereset halaman/pekerjaan, sehingga data kemarin tidak tercampur dengan hari baru.

Cache ringkasan, opsi modul dan detail yang dipakai halaman ini dipisahkan berdasarkan akun serta cakupan akses. Logout/login atau perubahan role/site/modul tidak memakai respons akun sebelumnya. Query ringkasan berada dalam cakupan invalidasi transaksi, sehingga koreksi/void dari rincian memperbarui ringkasan sesuai data server.

### Uji halaman oleh Owner

1. Login QC, buka Ringkasan Produksi. Tanggal berupa hari ini dan tidak dapat diubah. Nominal upah tidak tampil.
2. Pilih site/modul yang diizinkan. Coba tab Linting dan Batil; jumlah orang/setoran serta satuan tetap terpisah.
3. Cari nama/NIK dan ubah halaman; tab pekerjaan tetap ada. Ubah filter dan pastikan pagination kembali ke awal.
4. Gunakan HP: daftar tampil sebagai kartu tipis tanpa scroll horizontal isi daftar. Tab pekerjaan boleh digeser.
5. Ketuk pekerja, periksa jumlah setoran, brand dan QC per transaksi. Buka Detail untuk koreksi/void; aturan M1 dan Payroll tetap berlaku.
6. Saat panel ditutup, periksa refresh manual memperbarui daftar. Kartu KPI dan baris waktu pembaruan tidak ditampilkan. Beralih ke tab browser lain atau membuka rincian menjeda polling.
7. Login HR dengan permission/site sesuai: pilihan tanggal tersedia dan nominal mengikuti akses. Berganti akun harus menghilangkan data akun sebelumnya.
8. Tekan tombol panah di kanan tab: seluruh ringkasan pekerjaan terbuka bersama tanpa mengganti pekerjaan aktif. Pilih pekerjaan lain, lakukan pencarian dan ganti halaman; ringkasan tetap terbuka dengan angka agregat seluruh cakupan. Tekan kembali untuk menutup. Uji juga dengan keyboard dan HP; tombol tetap terlihat saat tab digeser.

## Verifikasi

**M4 selesai:** audit lintas role, regresi dan rekonsiliasi menggunakan MariaDB lokal read-only. Lihat [PRODUCTION_M4_AUDIT.md](PRODUCTION_M4_AUDIT.md) untuk hasil, batas pengujian dan langkah uji singkat. Dataset lokal belum memiliki transaksi hari ini (9 November 2026), sehingga hasil QC kosong saat audit adalah sesuai data.

**Hasil M2:** 30 tes API lulus, ESLint file baru dan integrasi app lulus, serta `pnpm run build:api` lulus. SQL tidak dieksekusi dan tidak ada migrasi baru.

**Hasil pengujian M3:** 8 tes browser halaman, 3 tes cache query, dan 54 tes regresi Produksi lulus. Build frontend lengkap (`pnpm run build:frontend`, TypeScript dan Vite) lulus. Tampilan mobile 390px diperiksa tanpa overflow daftar. Lint terarah tidak memiliki error; peringatan standar TanStack Table tetap ada. Route tree dibuat melalui generator TanStack, tidak diedit manual.

Pengujian API memakai mock database untuk batas role/tanggal, scope site/modul, pengikatan parameter SQL, satuan terpisah, preagregasi defect, pagination dan redaksi nominal. Uji database nyata, konsistensi angka dengan transaksi lapangan dan `EXPLAIN` query tetap dilakukan setelah tersedia lingkungan Owner yang diizinkan. Tidak menambahkan indeks berdasarkan asumsi tanpa pengukuran.


QC dan Admin Produksi memakai Terminal Setoran serta Ringkasan Produksi sebagai akses operasional. Menu dan halaman daftar Transaksi Produksi disembunyikan/diblokir untuk kedua role tersebut. Detail, koreksi dan void tetap dapat dibuka dari Ringkasan sesuai permission, tanggal, site/modul dan kunci Payroll; API pendukungnya tidak dinonaktifkan. Role HR/Superadmin tetap mendapat akses daftar dengan permission terkait.
