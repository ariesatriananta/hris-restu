# UAT Pusat Laporan

Panduan ini dipakai untuk memeriksa seluruh menu Pusat Laporan tanpa mengubah
data. Pemeriksaan berjalan dalam transaksi **baca saja** dan memakai satu
snapshot database agar angka tidak berubah di tengah proses.

## Cara menjalankan

Gunakan database development atau staging yang sudah berisi data uji:

```bash
pnpm uat:reports -- --date-from=2026-01-01 --date-to=2026-08-31
```

Jika tanggal tidak diberikan, periode dimulai dari 1 Januari tahun berjalan
sampai tanggal hari ini menurut waktu Jakarta.

## Arti hasil

- `PASS`: angka atau hubungan data sesuai aturan laporan.
- `WARN`: laporan tetap dapat dibuka, tetapi ada data lama atau kondisi bisnis
  yang perlu diperiksa HR.
- `FAIL`: terdapat hubungan data yang rusak atau angka lintas laporan tidak
  dapat direkonsiliasi. Perbaiki penyebabnya sebelum laporan dipakai resmi.

## Pemeriksaan yang dilakukan

1. Kolom minimum untuk seluruh laporan tersedia.
2. Jumlah Aktif pada Laporan Karyawan direkonsiliasi dengan Laporan Perubahan
   Jumlah Karyawan dan Laporan Masa Kerja.
3. Karyawan masuk, aktif kembali, resign, dan nonaktif menjelaskan perubahan
   jumlah karyawan pada awal dan akhir periode.
4. Mutasi lintas site dibandingkan dengan histori bertipe Transfer.
5. Klasifikasi serta koreksi yang sudah diterapkan cocok dengan fakta
   Attendance.
6. Scan sukses terhubung pada karyawan dan site Attendance yang sama.
7. Setoran Produksi berstatus Posted memiliki fakta Hadir dan scan masuk sukses.
8. Payroll Closed memakai current run Final Completed dan tidak memiliki hasil
   karyawan ganda.
9. Status historis serta kontrak aktif yang bertumpuk ditandai untuk diperiksa.
10. Audit yang memiliki site hanya mengarah ke site yang valid.
11. Cakupan data Attendance, finalisasi, Produksi, Payroll, kontrak, shift,
    workflow, scan, dan audit dilaporkan. Data yang belum tersedia atau belum
    final ditampilkan sebagai `WARN`, bukan dianggap lulus diam-diam.

## UAT tampilan

Setelah pemeriksaan otomatis selesai, buka setiap menu laporan dan lakukan:

1. Pilih periode yang sama dengan perintah UAT.
2. Pastikan angka tanpa filter sama dengan hasil pemeriksaan otomatis.
3. Pilih satu site, satu jenis karyawan, dan satu bagian produksi secara
   bergantian. Pastikan filter tetap tersimpan setelah membuka rincian lalu
   kembali.
4. Periksa tampilan desktop dan layar sempit. Tabel tidak boleh memotong tombol,
   sedangkan rincian harus dapat digulir.
5. Ekspor Excel dan pastikan periode serta filter di lembar Informasi sama
   dengan layar. Gunakan akun yang mempunyai izin ekspor modul terkait.
6. Buka Audit Trail dan pastikan setiap ekspor tercatat pada site yang tercakup.

UAT ini tidak menjalankan migration, seed, finalisasi Attendance, closing
Payroll, atau perubahan data lainnya.
