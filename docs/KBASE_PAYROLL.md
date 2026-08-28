# Knowledge Base Payroll

> Status dokumen: Periode Payroll dan pemeriksaan kesiapan sudah operasional.
> Simulasi, persetujuan, closing, riwayat hasil, dan slip gaji dibuka pada tahap berikutnya.

## 1. Tujuan menu Payroll

Modul Payroll menyiapkan proses pembayaran hasil Produksi Borongan secara tertib
dan dapat ditelusuri. Tahap pertama digunakan untuk membuat periode per site dan
memeriksa apakah data Attendance, Produksi, karyawan, rekening, serta komponen
Payroll sudah cukup rapi sebelum perhitungan dimulai.

Membuat periode belum menghitung gaji dan belum mengunci data Attendance atau
Produksi.

## 2. Siapa yang dapat mengakses

- **Payroll Finance** dapat melihat, membuat, dan membatalkan periode pada site
  yang diberikan kepada akunnya.
- **Director** dapat melihat seluruh site, tetapi tidak membuat atau membatalkan
  periode.
- **Super Admin** dapat mengakses seluruh site dan seluruh fungsi Payroll.

Jika daftar site kosong, hubungi Administrator untuk memeriksa akses site akun.

## 3. Membuat periode Payroll

1. Buka **Payroll > Periode Payroll**.
2. Pilih site.
3. Isi tanggal awal dan tanggal akhir periode.
4. Isi tanggal pembayaran jika sudah diketahui.
5. Nama periode boleh dikosongkan; sistem akan membuat nama otomatis.
6. Simpan periode.

Ketentuannya:

- satu periode maksimal 31 hari;
- tanggal pembayaran tidak boleh sebelum tanggal akhir periode;
- periode yang belum dibatalkan tidak boleh bertumpang-tindih dengan periode
  lain pada site yang sama;
- site berbeda boleh memakai rentang tanggal yang sama;
- periode masa depan boleh disiapkan, tetapi belum dinyatakan siap dihitung.

## 4. Memahami status periode

| Status | Arti operasional |
| --- | --- |
| **Draft** | Periode baru disiapkan dan masih dapat dibatalkan. Belum ada perhitungan. |
| **Calculated** | Periode sudah memiliki hasil simulasi. Digunakan mulai tahap Simulasi Payroll. |
| **Approved** | Hasil perhitungan sudah disetujui. Digunakan mulai tahap Approval. |
| **Closed** | Hasil akhir sudah dikunci. Status ini belum berarti gaji sudah dibayarkan. |
| **Cancelled** | Periode dibatalkan dan tidak diproses lebih lanjut. |

Periode Draft tidak diedit. Jika site atau tanggal salah, batalkan dengan alasan
yang jelas lalu buat periode pengganti. Cara ini menjaga histori perubahan tetap
mudah diaudit.

## 5. Memahami kesiapan periode

Kesiapan dihitung dari kondisi data terbaru setiap kali halaman dibuka. Kesiapan
bukan hasil perhitungan dan tidak disimpan sebagai snapshot.

| Kesiapan | Arti |
| --- | --- |
| **Siap** | Tidak ditemukan masalah yang menghalangi tahap perhitungan. |
| **Perlu perhatian** | Ada informasi yang perlu diperiksa, tetapi belum menghalangi simulasi. |
| **Belum siap** | Ada masalah yang harus diselesaikan sebelum perhitungan dapat dimulai. |

### Kondisi yang membuat periode belum siap

- tanggal akhir periode belum lewat;
- finalisasi Attendance belum lengkap, gagal, atau masih berjalan;
- koreksi atau klasifikasi Attendance dalam periode masih menunggu keputusan;
- histori penempatan karyawan bertumpang-tindih;
- tidak ada karyawan atau transaksi yang dapat diproses;
- transaksi Produksi sudah dipakai oleh proses Payroll lain secara tidak sesuai;
- ada formula komponen Payroll yang belum didukung.

### Kondisi yang hanya perlu perhatian

- rekening karyawan belum lengkap;
- karyawan masuk populasi karena komponen tetapi tidak memiliki transaksi
  Produksi;
- terdapat informasi alpha, terlambat, atau pulang awal.

Informasi Attendance tersebut tidak otomatis memotong upah Borongan. Nilai
Produksi tetap memakai nominal bruto yang sudah tercatat pada transaksi Produksi
berstatus **Tercatat/POSTED**. Transaksi yang sudah dibatalkan tidak dihitung.

Karyawan yang sekarang sudah resign atau nonaktif tetap masuk bila memiliki
hasil Produksi yang sah dalam periode tersebut.

## 6. Membatalkan periode

Periode hanya dapat dibatalkan ketika masih berstatus **Draft**. Alasan minimal
lima karakter wajib diisi. Setelah dibatalkan, rentang tanggalnya dapat dipakai
untuk membuat periode baru.

Pembatalan tidak menghapus histori dan tidak menghapus data Attendance maupun
Produksi.

## 7. Batas tahap saat ini

Pada tahap Periode dan Kesiapan, sistem belum:

- menghitung pendapatan, potongan, atau gaji bersih;
- membuat snapshot transaksi Produksi dan Attendance;
- mengajukan hasil untuk persetujuan;
- melakukan closing;
- menerbitkan slip gaji.

Fungsi tersebut dibuka bertahap setelah pemeriksaan Periode Payroll dinyatakan
stabil.
