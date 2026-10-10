# Pasangan Linting–Batil Klaten

Keputusan Bos, 10 Oktober 2026: perluas Scanner yang sudah ada supaya operator
cukup scan karyawan Linting, scan Batil opsional, lalu input PCS sekali.
Contoh yang disepakati: **Linting 500 PCS → Batil 500 PCS**, tanpa konversi.

## Hardcode sementara — jangan terlewat saat memperluas cakupan

Fitur pasangan hanya boleh digunakan jika site perangkat adalah `KLATEN` dan
pekerjaan utama memiliki kode `BORONGAN-LINTING`. Pekerjaan pasangan harus
`BORONGAN-BATIL`. Pembatasan berlaku di API sekaligus UI; site berasal dari
perangkat terautentikasi, bukan pilihan bebas dari payload.

Belum ada menu konfigurasi pasangan, versioning kebijakan, atau pasangan tetap
pada master karyawan. Jika Jepara/Semarang ikut memakai fitur ini, ubah aturan
di kedua lapisan beserta pengujian dan dokumen ini. Jangan mengubah kode master
untuk mengakali pembatasan.

## Input dan fakta transaksi

- Field Batil hanya muncul saat Linting dipilih pada perangkat Klaten.
- Scanner Klaten memblokir setoran Batil mandiri di UI, termasuk ketika Batil
  di-scan pertama. Operator diarahkan scan Linting dahulu lalu isi field Batil.
  Pembatasan ini hanya UI scanner; API dan alur input lain belum diubah.
  Pasangan dengan karyawan yang sama masih ditolak API dan UI.
- Batil kosong mempertahankan alur setoran tunggal; Batil yang diisi tetapi
  belum valid tidak boleh diam-diam diabaikan.
- Nama Batil otomatis muncul dari scan. Operator tidak memilih tarif atau
  mengetik ulang PCS. Kedua karyawan harus berbeda dan eligible pada site/tanggal
  yang sama, termasuk Attendance, assignment, pekerjaan aktif, dan tarif unik.
- Sekali simpan menghasilkan dua transaksi dan satu relasi pasangan dalam
  satu transaksi database. Kegagalan salah satu membatalkan seluruh penyimpanan.
- Idempotency/retry memeriksa identitas pasangan dan isi setoran, lalu
  mengembalikan hasil sebelumnya tanpa membuat setoran Batil tambahan.
- Kuantitas mentah sama. Setiap anggota memakai tarif dan hasil dibayar sendiri;
  potongan standar Linting tetap khusus Linting. Brand dibawa sebagai snapshot,
  sedangkan berat dan defect tetap hanya pada transaksi Linting.
- Payroll mengambil bruto per karyawan seperti sebelumnya. Dua hasil kerja
  tersebut tidak boleh disajikan sebagai dua kali jumlah batang produk fisik;
  tampilkan hasil per pekerjaan atau label total hasil kerja secara eksplisit.

## Koreksi, void, dan reset

Koreksi kuantitas atau void harus mempertimbangkan kedua transaksi. Preview
menampilkan pasangan yang terdampak; pemeriksaan kunci Payroll mencakup kedua
anggota dan seluruh grup harian yang harus dihitung ulang. Koreksi dilakukan
append-only dan menghasilkan pasangan pengganti, sementara relasi lama tetap
menjelaskan histori.
Pada implementasi awal, koreksi pasangan hanya mengubah jumlah; karyawan dan
pekerjaan tidak dapat diganti. Jika salah memilih partner, void pasangan lalu
scan ulang (selama belum terkunci Payroll). Koreksi setoran mandiri tetap
mengikuti kemampuan yang sudah ada.

Void tidak mensyaratkan karyawan masih eligible untuk setoran baru saat ini;
yang diperiksa adalah fakta transaksi dan kunci operasional/Payroll. Reset batch
harus mencakup kedua anggota beserta rantai revisinya; relasi pasangan dihapus
sebelum transaksi induk, dalam transaksi yang sama dan tetap diaudit.

Setoran Batil mandiri, setoran tanpa pasangan, serta histori lama dipertahankan.
Import dan setoran susulan tidak menebak pasangan dari nama, tanggal, Brand,
jumlah PCS, atau kelompok kerja. Tidak ada backfill.

## Database dan penerapan

Relasi menggunakan tabel tambahan `production_transaction_pairs`, bukan kolom
catatan atau kelompok kerja. SQL disiapkan di
`db/migrations/20261010_production_linting_batil_pairs.sql`; schema acuan ikut
mencantumkan tabel tersebut. **Migrasi dijalankan manual oleh Owner sebelum
menerapkan kode fitur; Jo tidak menjalankan migrasi atau mengubah data live.**

Foreign key pasangan memakai `ON UPDATE RESTRICT ON DELETE RESTRICT`; ID internal
transaksi tidak diubah. Pertahankan aturan ini bersama `CHECK` dua transaksi
berbeda: `ON UPDATE CASCADE` pada kolom tersebut menyebabkan error 1901 di MariaDB.

## Peta kode dan verifikasi

- API/policy: `apps/api/src/routes/production-transactions.ts`,
  `apps/api/src/lib/production-transaction-policy.ts`, dan
  `apps/api/src/lib/production-transaction-pairs.ts`.
- UI scanner: `src/features/production/production-terminal-page.tsx`.
- Kontrak: `src/features/production/domain.ts` dan `data/queries.ts`.
- Koreksi/void/detail: `src/features/production/production-transactions-page.tsx`.
- Ringkasan: agregat Setoran/Rekap Produksi mempertahankan hasil kerja tiap
  karyawan/pekerjaan; tampilan lintas pekerjaan tidak menyatakan produk fisik.

Pengujian wajib mencakup Klaten vs site lain, Batil opsional/invalid, karyawan
yang sama, Attendance/assignment/tarif, rollback atomik, retry tanpa duplikasi,
snapshot QC, kunci Payroll salah satu anggota, koreksi/void bersama, kelengkapan
reset batch, serta hitungan dan label hasil kerja pada rekap.
