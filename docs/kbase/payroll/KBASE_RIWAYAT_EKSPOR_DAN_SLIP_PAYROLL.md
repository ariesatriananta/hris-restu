# Knowledge Base - Riwayat, Ekspor, dan Slip Payroll

> Modul: Payroll dan Laporan
>
> Bagian: Riwayat Payroll, keluaran Excel, Slip Gaji, dan Payroll Final
>
> Audiens: Payroll Finance, Direksi, Super Admin, auditor, dan pengguna laporan
>
> Terakhir diverifikasi: 17 September 2026

Panduan ini menjelaskan cara menelusuri perhitungan, membandingkan hasil, mengunduh
rekap dan Daftar Pembayaran, melihat atau mencetak slip, serta membaca Laporan
Payroll Final.

## 1. Memahami jenis keluaran

| Keluaran | Lokasi | Syarat utama |
|---|---|---|
| Rekap Payroll | Payroll > Riwayat Payroll | Perhitungan `COMPLETED` dan hak ekspor Payroll |
| Daftar Pembayaran | Payroll > Riwayat Payroll | Perhitungan terbaru `FINAL`, periode `CLOSED`, hak ekspor pembayaran, rekening lengkap |
| Preview Slip resmi | Payroll > Slip Gaji | Periode `CLOSED`, perhitungan terbaru `FINAL`, dan akses lihat Payroll |
| Cetak Slip resmi | Payroll > Slip Gaji | Syarat slip resmi terpenuhi dan ada hak cetak Payroll |
| Laporan Payroll Final | Laporan > Payroll Final | Perhitungan terbaru FINAL dari periode Ditutup dan hak laporan |

Tidak ada keluaran di atas yang menjadi bukti transfer atau penerimaan dana.

## 2. Menelusuri Riwayat Payroll

1. Buka **Payroll > Riwayat Payroll**.
2. Cari kode atau nama periode.
3. Gunakan filter site, status, atau rentang tanggal.
4. Pilih **Lihat histori**.
5. Periksa urutan seluruh perhitungan pada periode.

Perhitungan gagal tetap ditampilkan sebagai histori, tetapi tidak dapat digunakan untuk
rekap, slip, atau perbandingan hasil.

## 3. Memahami hasil terbaru dan hasil lama

- Badge **Terbaru** menunjukkan perhitungan yang dipakai periode.
- Hitung ulang membuat hasil terbaru baru tanpa menghapus hasil lama.
- Sebelum ditutup, hasil yang selesai tetap berjenis `SIMULATION`.
- Saat ditutup, hanya hasil terbaru yang berubah menjadi `FINAL`.
- Hasil lama tetap Simulasi walaupun periodenya sudah Ditutup.

Contoh: jika Perhitungan #2 yang ditutup, Perhitungan #1 tetap merupakan hasil
simulasi historis. Menu Slip Gaji tidak menyediakan pilihan perhitungan lama.

## 4. Membandingkan dua perhitungan

1. Buka histori satu periode.
2. Centang tepat dua perhitungan berstatus **Selesai**.
3. Baca panel perbandingan.

Perbandingan menunjukkan perubahan jumlah karyawan, dasar upah, pendapatan
tambahan, potongan, neto, serta perubahan per karyawan. Perbandingan hanya dapat
dilakukan dalam periode yang sama.

Checkbox pada kartu perhitungan digunakan untuk **perbandingan**, bukan untuk memilih
karyawan pada file Daftar Pembayaran.

## 5. Mengekspor Rekap Payroll

Pilih **Rekap** pada kartu perhitungan yang sudah selesai. Rekap:

- dapat berasal dari perhitungan Simulasi atau Final;
- mencantumkan jenis hasil pada lembar informasi;
- memakai label dasar sesuai skema;
- selalu menyamarkan nomor rekening;
- memuat dasar upah, pendapatan lain, bruto, potongan, dan neto.

Jika perhitungan belum final, lembar informasi menandainya sebagai **SIMULASI**. Rekap
simulasi bukan slip resmi atau dasar bahwa Payroll sudah disahkan.

## 6. Mengekspor Daftar Pembayaran

Tombol **Daftar pembayaran** hanya muncul pada perhitungan terbaru `FINAL` dari periode
`CLOSED` bagi pengguna yang memiliki hak ekspor pembayaran.

File ini memuat:

- nomor dan nama karyawan;
- nama bank;
- nomor rekening lengkap;
- nama pemilik rekening;
- nilai neto.

Karena halaman saat ini mengekspor seluruh hasil perhitungan, adanya satu atau lebih
snapshot rekening yang belum lengkap akan membuat ekspor ditolak. Lengkapi nama
bank, nomor rekening, dan nama pemilik rekening sebelum hasil disahkan, lalu
Hitung ulang sebelum pengajuan dan penutupan.

Daftar Pembayaran adalah bahan kerja transfer, bukan bukti transfer. Perlakukan
file sebagai data sensitif dan jangan membagikannya melalui kanal yang tidak
disetujui perusahaan.

## 7. Melihat Slip Gaji

1. Buka **Payroll > Slip Gaji**.
2. Pilih periode berstatus **Ditutup**. Periode lain tidak ditawarkan di halaman ini.
3. Sistem otomatis memakai perhitungan terbaru yang `FINAL`; tidak ada pemilih perhitungan.
4. Cari nama atau nomor karyawan.
5. Klik **Preview** untuk membuka rincian individual.

Slip menampilkan identitas snapshot, periode, dasar upah, komponen, bruto,
potongan, neto, rekening yang disamarkan, dan ringkasan Attendance. Isi dasar
menyesuaikan skema Borongan, Harian/Training, atau Bulanan.
Untuk periode Borongan yang memotong BPJS, slip juga menampilkan bulan iuran,
total potongan karyawan, dan total kontribusi perusahaan. Kontribusi perusahaan
bersifat informasi biaya perusahaan dan tidak mengurangi neto.

Pengguna dengan akses lihat boleh membuka preview. Tombol cetak individual,
dipilih, dan massal hanya tersedia bagi pengguna dengan hak cetak Payroll.
Pilihan cetak dibatasi maksimal 500 hasil per permintaan.

## 8. Mengapa slip resmi tidak bertuliskan SIMULASI

Tulisan **SIMULASI** hilang hanya jika ketiga kondisi berikut terpenuhi:

1. periode berstatus `CLOSED`;
2. run berjenis `FINAL`;
3. perhitungan tersebut adalah hasil terbaru periode.

Selesaikan pengajuan, persetujuan, dan **Tutup Permanen**. Pada halaman Slip
Gaji, pilih periodenya; sistem otomatis memakai hasil FINAL terbaru. Jika
periode belum Ditutup, halaman ini tidak menampilkan slip resmi. Perhitungan
lama hanya dapat ditelusuri sebagai histori/rekap simulasi, bukan dipilih untuk
slip resmi.

## 9. Profil perusahaan pada slip

Saat closing, sistem menyimpan snapshot profil perusahaan untuk periode itu.
Nama dan alamat wajib tersedia; telepon, email, situs, NPWP, dan logo mengikuti
data yang tersedia. Perubahan profil setelah closing tidak mengubah slip resmi
lama.

Hasil simulasi tidak muncul sebagai pilihan slip resmi pada halaman Slip Gaji.

## 10. Mencetak slip

- **Cetak** pada kartu mencetak satu slip.
- **Cetak dipilih** mencetak slip yang dicentang.
- **Cetak massal** mencetak seluruh hasil perhitungan resmi yang dimuat.
- Layout cetak memakai A4 portrait dengan dua slip per lembar.

Sistem menyiapkan dokumen untuk fasilitas cetak browser. Binary PDF tidak
disimpan permanen oleh sistem pada tahap ini. Penerbitan dicatat pada audit,
tetapi catatan itu tidak memastikan kertas benar-benar tercetak.

## 11. Laporan Payroll Final

Buka **Laporan > Payroll Final** untuk analisis lintas periode yang sudah Closed.
Laporan hanya membaca hasil perhitungan terbaru FINAL dan menggunakan salinan identitas,
penempatan, skema, rekening tersamarkan, serta nominal Payroll.

Anda dapat:

- memilih rentang tanggal akhir periode maksimal 366 hari;
- mencari karyawan atau periode;
- memfilter site, jenis karyawan, dasar upah, dan frekuensi;
- membuka rincian hasil final;
- mengekspor Excel jika memiliki hak ekspor Payroll.

Laporan Payroll Final berbeda dari Daftar Pembayaran: rekening tetap disamarkan
dan tujuannya adalah pelaporan, bukan instruksi transfer.

## 12. Hak akses ringkas

- Akses lihat Payroll: riwayat dan preview slip sesuai site.
- Hak ekspor Payroll: Rekap dan ekspor Laporan Payroll Final.
- Hak ekspor pembayaran: Daftar Pembayaran dengan rekening lengkap.
- Hak cetak Payroll: cetak slip individual atau massal.
- Laporan Payroll Final juga memerlukan akses Pusat Laporan.
- Direksi dapat melihat lintas site, tetapi tidak memperoleh cetak massal atau
  Daftar Pembayaran secara default.
- Super Admin dapat bekerja lintas site dan melewati pembatasan role standar.

## 13. Audit dan keamanan

Ekspor dan penerbitan slip memakai idempotency key dan dicatat pada audit output.
Rekap menyamarkan rekening, sedangkan Daftar Pembayaran memuat rekening lengkap.
Jangan menyalin data rekening ke log, screenshot, tiket, atau pesan dukungan.

## 14. Solusi masalah umum

| Kondisi | Tindakan |
|---|---|
| Tombol Rekap tidak terlihat | Periksa status perhitungan Selesai dan hak ekspor Payroll. |
| Tombol Daftar pembayaran tidak terlihat | Pastikan periode Ditutup, hasil FINAL + terbaru, dan hak ekspor pembayaran tersedia. |
| Daftar Pembayaran ditolak | Ada data rekening yang belum lengkap pada hasil FINAL; perbaikan memerlukan peninjauan periode, bukan edit hasil final. |
| Periode tidak muncul di Slip Gaji | Pastikan periode Ditutup dan perhitungan terbaru FINAL berstatus Selesai. |
| Tombol cetak tidak terlihat | Akun hanya memiliki akses preview dan tidak memiliki hak cetak Payroll. |
| Profil slip salah pada simulasi | Simulasi memakai profil live; profil resmi disnapshot saat closing. |
| Hasil tidak muncul di Payroll Final | Periksa apakah periode sudah Ditutup dan perhitungan terbaru benar-benar FINAL. |
| Status Closed dianggap sudah dibayar | Koreksi pemahaman operasional; sistem belum mencatat status transfer. |

## 15. Navigasi KBase Payroll

- Kembali ke [Indeks Payroll](../../KBASE_PAYROLL.md).
- Sebelumnya: [Persetujuan dan Penutupan Payroll](./KBASE_APPROVAL_DAN_CLOSING_PAYROLL.md).
- Buka [Perhitungan dan Komponen Payroll](./KBASE_SIMULASI_DAN_KOMPONEN_PAYROLL.md) untuk membaca sumber nominal.
