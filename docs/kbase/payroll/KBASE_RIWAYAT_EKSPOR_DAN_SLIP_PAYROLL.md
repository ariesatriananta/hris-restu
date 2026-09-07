# Knowledge Base - Riwayat, Ekspor, dan Slip Payroll

> Modul: Payroll dan Laporan
>
> Bagian: Riwayat Payroll, keluaran Excel, Slip Gaji, dan Payroll Final
>
> Audiens: Payroll Finance, Direksi, Super Admin, auditor, dan pengguna laporan
>
> Terakhir diverifikasi: 7 September 2026

Panduan ini menjelaskan cara menelusuri run, membandingkan hasil, mengunduh
rekap dan Daftar Pembayaran, melihat atau mencetak slip, serta membaca Laporan
Payroll Final.

## 1. Memahami jenis keluaran

| Keluaran | Lokasi | Syarat utama |
|---|---|---|
| Rekap Payroll | Payroll > Riwayat Payroll | Run `COMPLETED` dan hak ekspor Payroll |
| Daftar Pembayaran | Payroll > Riwayat Payroll | Current run `FINAL`, periode `CLOSED`, hak ekspor pembayaran, rekening lengkap |
| Preview Slip | Payroll > Slip Gaji | Run `COMPLETED` dan akses lihat Payroll |
| Cetak Slip | Payroll > Slip Gaji | Run `COMPLETED` dan hak cetak Payroll |
| Laporan Payroll Final | Laporan > Payroll Final | Current run final dari periode Closed dan hak laporan |

Tidak ada keluaran di atas yang menjadi bukti transfer atau penerimaan dana.

## 2. Menelusuri Riwayat Payroll

1. Buka **Payroll > Riwayat Payroll**.
2. Cari kode atau nama periode.
3. Gunakan filter site, status, atau rentang tanggal.
4. Pilih **Lihat histori**.
5. Periksa timeline seluruh run pada periode.

Run gagal tetap ditampilkan sebagai histori, tetapi tidak dapat digunakan untuk
rekap, slip, atau perbandingan hasil.

## 3. Memahami current run dan run lama

- Badge **Terbaru** menunjukkan current run periode.
- Hitung ulang membuat current run baru tanpa menghapus run lama.
- Sebelum closing, run selesai tetap berjenis `SIMULATION`.
- Saat closing, hanya current run yang berubah menjadi `FINAL`.
- Run lama tetap Simulasi walaupun periodenya sudah Closed.

Karena itu, memilih Run #1 pada periode yang ditutup dapat tetap menampilkan
SIMULASI jika Run #2 adalah current run saat closing.

## 4. Membandingkan dua run

1. Buka histori satu periode.
2. Centang tepat dua run berstatus **Selesai**.
3. Baca panel perbandingan.

Perbandingan menunjukkan perubahan jumlah karyawan, dasar upah, pendapatan
tambahan, potongan, neto, serta perubahan per karyawan. Perbandingan hanya dapat
dilakukan dalam periode yang sama.

Checkbox pada kartu run digunakan untuk **perbandingan**, bukan untuk memilih
karyawan pada file Daftar Pembayaran.

## 5. Mengekspor Rekap Payroll

Pilih **Rekap** pada kartu run yang sudah selesai. Rekap:

- dapat berasal dari run Simulasi atau Final;
- mencantumkan jenis hasil pada lembar informasi;
- memakai label dasar sesuai skema;
- selalu menyamarkan nomor rekening;
- memuat dasar upah, pendapatan lain, bruto, potongan, dan neto.

Jika run belum final, lembar informasi menandainya sebagai **SIMULASI**. Rekap
simulasi bukan slip resmi atau dasar bahwa Payroll sudah disahkan.

## 6. Mengekspor Daftar Pembayaran

Tombol **Daftar pembayaran** hanya muncul pada current run `FINAL` dari periode
`CLOSED` bagi pengguna yang memiliki hak ekspor pembayaran.

File ini memuat:

- nomor dan nama karyawan;
- nama bank;
- nomor rekening lengkap;
- nama pemilik rekening;
- nilai neto.

Karena halaman saat ini mengekspor seluruh hasil run, adanya satu atau lebih
snapshot rekening yang belum lengkap akan membuat ekspor ditolak. Lengkapi nama
bank, nomor rekening, dan nama pemilik rekening sebelum simulasi final, lalu
Hitung ulang sebelum submit dan closing.

Daftar Pembayaran adalah bahan kerja transfer, bukan bukti transfer. Perlakukan
file sebagai data sensitif dan jangan membagikannya melalui kanal yang tidak
disetujui perusahaan.

## 7. Melihat Slip Gaji

1. Buka **Payroll > Slip Gaji**.
2. Pilih periode berstatus Calculated, Approved, atau Closed.
3. Pilih run yang sudah selesai.
4. Cari nama atau nomor karyawan.
5. Klik **Preview** untuk membuka rincian individual.

Slip menampilkan identitas snapshot, periode, dasar upah, komponen, bruto,
potongan, neto, rekening yang disamarkan, dan ringkasan Attendance. Isi dasar
menyesuaikan skema Borongan, Harian/Training, atau Bulanan.

Pengguna dengan akses lihat boleh membuka preview. Tombol cetak individual,
dipilih, dan massal hanya tersedia bagi pengguna dengan hak cetak Payroll.
Pilihan cetak dibatasi maksimal 500 hasil per permintaan.

## 8. Menghilangkan tulisan SIMULASI pada slip

Tulisan **SIMULASI** hilang hanya jika ketiga kondisi berikut terpenuhi:

1. periode berstatus `CLOSED`;
2. run berjenis `FINAL`;
3. run tersebut adalah current run periode.

Selesaikan pengajuan, persetujuan, dan **Tutup Permanen**, lalu pada halaman Slip
Gaji pilih run berlabel **FINAL** dan **terbaru**. Run lama tetap menampilkan
watermark SIMULASI dan kalimat bahwa dokumen belum merupakan slip resmi.

## 9. Profil perusahaan pada slip

Saat closing, sistem menyimpan snapshot profil perusahaan untuk periode itu.
Nama dan alamat wajib tersedia; telepon, email, situs, NPWP, dan logo mengikuti
data yang tersedia. Perubahan profil setelah closing tidak mengubah slip resmi
lama.

Preview simulasi yang belum memiliki snapshot closing memakai profil saat ini
dan tidak boleh dianggap sebagai profil historis final.

## 10. Mencetak slip

- **Cetak** pada kartu mencetak satu slip.
- **Cetak dipilih** mencetak slip yang dicentang.
- **Cetak massal** mencetak seluruh hasil run yang dimuat.
- Layout cetak memakai A4 portrait dengan dua slip per lembar.

Sistem menyiapkan dokumen untuk fasilitas cetak browser. Binary PDF tidak
disimpan permanen oleh sistem pada tahap ini. Penerbitan dicatat pada audit,
tetapi catatan itu tidak memastikan kertas benar-benar tercetak.

## 11. Laporan Payroll Final

Buka **Laporan > Payroll Final** untuk analisis lintas periode yang sudah Closed.
Laporan hanya membaca hasil current run FINAL dan menggunakan snapshot identitas,
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
| Tombol Rekap tidak terlihat | Periksa status run Selesai dan hak ekspor Payroll. |
| Tombol Daftar pembayaran tidak terlihat | Pastikan periode Closed, run FINAL + terbaru, dan hak ekspor pembayaran tersedia. |
| Daftar Pembayaran ditolak | Ada snapshot rekening tidak lengkap; data final yang sudah Closed tidak dapat dihitung ulang. |
| Slip masih bertuliskan SIMULASI | Pilih current run FINAL pada periode Closed, bukan run lama. |
| Tombol cetak tidak terlihat | Akun hanya memiliki akses preview dan tidak memiliki hak cetak Payroll. |
| Profil slip salah pada simulasi | Simulasi memakai profil live; profil resmi disnapshot saat closing. |
| Hasil tidak muncul di Payroll Final | Periksa apakah periode sudah Closed dan current run benar-benar FINAL. |
| Status Closed dianggap sudah dibayar | Koreksi pemahaman operasional; sistem belum mencatat status transfer. |

## 15. Navigasi KBase Payroll

- Kembali ke [Indeks Payroll](../../KBASE_PAYROLL.md).
- Sebelumnya: [Approval dan Closing Payroll](./KBASE_APPROVAL_DAN_CLOSING_PAYROLL.md).
- Buka [Simulasi dan Komponen Payroll](./KBASE_SIMULASI_DAN_KOMPONEN_PAYROLL.md) untuk membaca sumber nominal.
