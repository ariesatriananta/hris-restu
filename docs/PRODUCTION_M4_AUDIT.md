# M4 - Audit akhir Produksi

Tanggal audit: 9 November 2026. Cakupan: akses upah/koreksi M1, API Ringkasan harian M2 dan UI monitoring M3. Tidak ada perubahan schema, seed, data operasional, akun, session login database atau deployment.

## Hasil

Tidak ditemukan bug fungsional baru pada skenario yang diuji. Perubahan M4 berupa tes regresi tambahan, audit database lokal dan dokumentasi. Hasil ini tidak berarti jaminan bebas bug pada seluruh kemungkinan data/beban.

| Pemeriksaan | Hasil |
| --- | --- |
| API/policy/regresi Produksi | 329 tes lulus, 12 suite |
| Browser/policy/frontend | 94 kasus unik lulus, 7 suite; termasuk dua tes invalidasi yang dijalankan terpisah setelah suite utama |
| API terhadap MariaDB lokal nyata | 2 tes audit read-only lulus |
| Build API dan TypeScript frontend | Lulus |
| ESLint file tes yang berubah dan diff check | Lulus |

Tes tambahan meliputi pergantian hari dari tanggal efektif server, reset pagination/pekerjaan, jeda/resume polling ketika browser tersembunyi, serta pembaruan cache tab/karyawan/setoran/detail setelah koreksi atau void berhasil. Tes cache sebelumnya tetap memverifikasi isolasi akun dan perubahan scope akses.

## Database lokal

Host koneksi diverifikasi loopback sebelum koneksi dibuat; URL, user, password dan nama database tidak dicetak. Versi server adalah **MariaDB 10.4.32**. Pengujian memakai koneksi khusus dengan `SET SESSION TRANSACTION READ ONLY` dan `START TRANSACTION READ ONLY`, lalu `ROLLBACK` dan koneksi ditutup. Jalur query API pada harness hanya menerima `SELECT`.

Dataset yang tersedia:

- 17 transaksi: 15 POSTED dan 2 VOID.
- 4 tanggal bisnis, dari 8 Oktober sampai 6 November 2026.
- 5 modul, 5 relasi pasangan dan 2 revisi; 16 header QC dan 84 baris defect.
- Belum ada transaksi tanggal **9 November 2026**. Karena itu halaman QC hari ini kosong adalah hasil yang sesuai data.

Untuk menguji cabang QC yang berisi data tanpa menambah setoran baru, harness mengulang tanggal server sesuai empat tanggal dataset. Ini hanya mock tanggal di proses tes terisolasi, tidak mengubah jam server, aplikasi berjalan atau tanggal data. Jalur HR memakai pemilihan tanggal historis. Autentikasi pada harness diganti actor tes; tidak membuat/mengubah session atau mengklaim telah melakukan login UI dengan akun nyata.

### Rekonsiliasi angka

API dijalankan dengan SQL nyata. Hasil dibandingkan terhadap transaksi mentah dan baris defect yang dibaca terpisah, kemudian dijumlahkan independen menggunakan BigInt berskala desimal:

- Tab dan jumlah setoran hanya berasal dari POSTED, dengan VOID dikecualikan.
- Kuantitas, kuantitas dibayar dan nominal HR cocok per tanggal/pekerjaan/satuan.
- Defect cocok dengan jumlah kejadian dari baris detail tanpa menggandakan hasil produksi.
- Jumlah kelompok karyawan/site/satuan dan rincian setoran cocok meskipun pageSize daftar dibuat 1.
- QC memakai irisan modul, termasuk pengecualian ketika pasangan/peer revisi berada di luar scope; respons tanpa nominal.

### Query dan performa

Query juga dijalankan dengan `ONLY_FULL_GROUP_BY` pada session audit. Semuanya lulus di MariaDB 10.4. EXPLAIN diperiksa untuk sampel query ringkasan, daftar, modul dan rincian. Pada pengukuran lokal ini terdapat 119 SELECT API, waktu terlama sekitar 28 ms dan estimasi baris EXPLAIN maksimum 14 pada sampel yang diambil.

Dataset ini kecil: angka tersebut adalah pemeriksaan dasar terhadap query nyata, **bukan** uji beban produksi atau pembuktian performa jutaan transaksi. Tidak ada indeks tambahan yang dibuat. Laporan agregat tanpa identitas karyawan atau nilai upah disimpan pada `artifacts/production-summary-m4.json` (diabaikan Git).

## Mengulang audit lokal

Jalankan hanya ketika `.env` API memang menunjuk localhost dan data lokal sudah tersedia. Tanpa flag berikut, suite database nyata dilewati dan tidak membuka koneksi.

```powershell
$env:RUN_LOCAL_PRODUCTION_AUDIT='1'
node --env-file=apps/api/.env node_modules/vitest/vitest.mjs run --root apps/api --config vitest.config.ts src/routes/production-daily-summary.local.test.ts --maxWorkers=1
Remove-Item Env:RUN_LOCAL_PRODUCTION_AUDIT
```

## Uji singkat Bos

1. Login QC: pastikan Ringkasan mengikuti site/modul dan tidak menampilkan upah. Tanpa transaksi hari ini, hasil kosong memang diharapkan.
2. Login HR dengan permission/site sesuai, pilih salah satu tanggal 8 Oktober–6 November yang memiliki transaksi; bandingkan satu pekerja dengan rincian Setoran Produksi pada tanggal/job yang sama.
3. Cek kenyamanan di perangkat lapangan: geser tab, cari nama/NIK, buka rincian dan kembali. Tidak diperlukan reset/import data untuk audit ini.

Uji koreksi/void yang benar-benar menulis data dan pengujian beban server produksi tidak dijalankan. Mekanisme tulis, pasangan dan penguncian Payroll diuji melalui suite database mock agar data lokal operasional tetap utuh.
