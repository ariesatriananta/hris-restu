# M1 - Pembatasan upah dan koreksi Produksi

Keputusan Bos, 9 November 2026. M1 hanya mengubah akses pada alur Produksi yang sudah ada. Halaman Ringkasan Produksi baru dikerjakan pada milestone berikutnya.

## Aturan yang disepakati

- Nilai tarif, rincian tarif bertingkat, upah/bruto dan dampak koreksi dalam Rupiah hanya tersedia bagi role `HR_OFFICER` atau `SUPER_ADMIN`.
- Pembatasan berlaku di API dan UI: scanner, daftar transaksi/KPI, detail, preview, hasil simpan/replay, histori koreksi, penugasan, rekap dan Laporan Produksi yang memakai rekap tersebut.
- Pengguna lainnya tetap boleh membaca data operasional sesuai permission, site dan modulnya: hasil setor, hasil dibayar dalam satuan produksi, adjustment/potongan persen, brand, berat dan defect. Field nominal tidak dikirim dalam JSON; bukan diganti nol atau sekadar disembunyikan dengan CSS.
- Endpoint tarif dan ekspor Produksi yang memuat nominal hanya tersedia bagi HR/Superadmin, dengan permission awal tetap wajib dipenuhi. Menu/form/ekspor terkait disembunyikan dari pengguna lain.
- Koreksi dan void transaksi dengan tanggal bisnis sebelum hari ini hanya boleh dilakukan HR/Superadmin. Hari ini ditentukan server dalam zona `Asia/Jakarta`, bukan jam perangkat. Preview, konteks koreksi dan pengulangan request juga mengikuti aturan ini. Detail transaksi lama tetap dapat dibaca tanpa nominal oleh pengguna yang memenuhi scope.
- Role `DIRECTOR`, `PRODUCTION_ADMIN`, `PAYROLL_FINANCE`, `SITE_SUPERVISOR` dan `QC` tidak mendapat pengecualian nominal maupun koreksi tanggal lampau hanya karena role tersebut. Jika pengguna memiliki role HR/Superadmin juga, pengecualian mengikuti role yang dimilikinya.

## Batas perubahan

Tidak ada migrasi, pengubahan data lama, atau perubahan perhitungan upah. Kalkulasi internal, snapshot dan audit tetap menyimpan nilai aslinya; redaksi dilakukan pada respons API. API Payroll dan hak aksesnya tidak diubah oleh M1.

Permission tetap berlaku: misalnya HR memerlukan `production.correct` untuk koreksi, `production.export` untuk ekspor, serta akses site yang sesuai. Seed HR pada schema awal hanya memberi `production.view`; M1 tidak otomatis menambah permission atau mengubah akun pengguna.

Validasi penguncian Payroll, pasangan Linting-Batil, scope site/modul QC, idempotensi dan koreksi append-only tetap berlaku. Input susulan/import adalah alur tersendiri dan tidak mendapat perubahan pembatasan tanggal melalui M1. Pembatasan pilihan tanggal khusus halaman Ringkasan baru belum diterapkan pada halaman lama.

## Uji operasional setelah deploy

1. Login QC/Admin Produksi. Scan dan simpan setoran hari ini: hasil, QC dan status tetap tampil; tarif/bruto tidak muncul pada layar maupun respons Network.
2. Buka transaksi lama: rincian operasional tetap terbaca; koreksi/void tidak tersedia. Request API langsung ke preview/apply tanggal lama harus ditolak tanpa perubahan data.
3. Koreksi/void transaksi hari ini dengan permission yang sesuai; pastikan hasilnya tetap benar, termasuk pasangan Linting-Batil dan replay idempotensi.
4. Login HR dengan permission koreksi serta site yang sesuai, lalu Superadmin: nominal terlihat; koreksi tanggal lama tetap harus lolos validasi Payroll dan pasangan.
5. Login Director/Finance/Supervisor: pastikan tidak memperoleh nominal Produksi hanya dari role tersebut. Rekap operasional tetap sesuai permission; tarif/ekspor nominal ditolak.
6. Cek rincian pekerjaan/penugasan, histori revisi, preview, hasil simpan dan Laporan Produksi; tidak ada jalur alternatif yang menampilkan nominal untuk role terbatas.
7. Coba transaksi terkunci Payroll dan pasangan di luar cakupan QC: tetap ditolak.

Pengujian otomatis memakai database mock; pengujian database/perangkat nyata dilakukan Owner. SQL dan deploy tidak dijalankan Jo.


## Verifikasi implementasi

- Build API (`pnpm run build:api`) dan pemeriksaan TypeScript frontend lulus.
- Tes backend mencakup redaksi respons/snapshot tanpa mengubah objek audit asli, role HR/Superadmin versus role lain, batas tengah malam WIB, larangan koreksi/void lampau termasuk preview dan replay, ekspor serta regresi pasangan/Payroll.
- Tes browser mencakup tampilan kuantitas/adjustment/status tanpa field nominal, kolom nominal HR/Superadmin, scanner dengan payload tanpa objek tarif, serta ekspor hasil validasi yang menyertakan nominal hanya ketika diizinkan.
- Pemeriksaan lint terarah dan diff digunakan untuk file yang berubah. Tes dengan database mock tidak menggantikan uji operasional Owner sesudah deploy.
