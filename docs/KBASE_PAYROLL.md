# Knowledge Base Payroll

> Status dokumen: Periode, pemeriksaan kesiapan, Simulasi, Persetujuan, dan
> Closing Payroll Borongan sudah operasional. Riwayat lanjutan, ekspor, dan slip
> gaji dibuka pada tahap berikutnya.

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

## 7. Menyiapkan komponen manual

Komponen manual digunakan untuk bonus, pendapatan lain, penalti, pinjaman, atau
potongan lain yang hanya berlaku pada periode tertentu.

1. Buka **Payroll > Simulasi Payroll**.
2. Pilih periode Draft atau Calculated.
3. Pilih **Komponen manual**.
4. Pilih karyawan dan jenis komponen.
5. Isi nominal dan catatan yang cukup jelas.
6. Simpan komponen, lalu jalankan atau hitung ulang simulasi.

Satu karyawan hanya dapat memiliki satu komponen manual aktif untuk jenis yang
sama dalam satu periode. Gunakan **Koreksi** untuk memperbaiki nominal atau
catatan dan gunakan **Batalkan** jika komponennya tidak lagi berlaku. Kedua aksi
wajib disertai alasan. Perubahan tidak mengubah hasil run lama dan baru masuk
setelah simulasi dihitung ulang.

Komponen tetap yang tanggal berlakunya mengenai periode dibayarkan penuh satu
kali. Sistem belum melakukan prorata otomatis.

## 8. Menjalankan simulasi

1. Pilih periode pada halaman **Simulasi Payroll**.
2. Periksa pesan kesiapan.
3. Jika statusnya **Belum siap**, selesaikan blocker melalui menu yang
   ditunjukkan.
4. Jika statusnya **Siap** atau **Perlu perhatian**, pilih **Hitung**.
5. Tunggu sampai proses selesai. Halaman akan memperbarui status proses secara
   otomatis.
6. Periksa KPI dan daftar hasil per karyawan.

Perhitungan memakai rumus awal berikut:

**Neto = hasil Produksi + komponen pendapatan - komponen potongan**

Nilai hasil Produksi disalin dari transaksi berstatus Tercatat/POSTED. Sistem
tidak menghitung ulang menggunakan tarif pekerjaan terbaru. Attendance disalin
sebagai informasi dan tidak otomatis menambah atau memotong nominal.

Jika data sumber atau komponen berubah, pilih **Hitung ulang**. Sistem membuat
versi run baru dan tidak menghapus versi sebelumnya.

## 9. Membaca hasil simulasi

Ringkasan menampilkan:

- jumlah karyawan yang dihitung;
- nilai hasil Produksi;
- tambahan pendapatan;
- total potongan; dan
- nilai neto.

Pilih salah satu karyawan untuk melihat rincian transaksi Produksi, ringkasan
Attendance, komponen pendapatan/potongan, status rekening, dan jejak rumus.
Informasi rekening mengikuti kewenangan akun dan dapat disamarkan untuk pengguna
read-only.

Neto negatif tetap ditampilkan agar masalah dapat ditelusuri. Kondisi tersebut
tidak menggagalkan simulasi, tetapi wajib diperbaiki sebelum tahap persetujuan
dan closing.

Semua hasil pada halaman ini masih berstatus **SIMULASI** dan belum merupakan
slip gaji resmi atau bukti pembayaran.

## 10. Jika proses terputus

Sistem mencatat setiap proses hitung sebagai run tersendiri. Jika koneksi browser
terputus, buka kembali periode yang sama untuk memeriksa status run. Jangan
menekan Hitung berulang-ulang ketika status masih **Processing**.

Run yang gagal tidak digunakan sebagai hasil aktif dan tidak meninggalkan
snapshot setengah jadi. Jika run terlihat Processing terlalu lama, pengguna
berizin dapat menjalankan pemulihan lalu mencoba kembali.

## 11. Mengajukan hasil simulasi

1. Buka **Payroll > Approval & Closing**.
2. Pilih periode yang sudah dihitung.
3. Periksa run, jumlah karyawan, pendapatan, potongan, neto, dan pesan kesiapan.
4. Jika muncul **Perlu hitung ulang**, kembali ke Simulasi Payroll dan hitung
   ulang sebelum mengajukan.
5. Pilih **Ajukan persetujuan** lalu pastikan ringkasannya benar.

Pengajuan tidak dapat dilanjutkan jika hasil kosong, neto negatif, rekening
snapshot belum lengkap, data belum siap, atau hasil simulasi sudah tertinggal
dari perubahan sumber. Status periode tetap **Calculated** selama menunggu
keputusan Direksi.

Pengajuan yang masih menunggu dapat ditarik kembali dengan alasan. Setelah
ditarik, simulasi wajib dihitung ulang sebelum diajukan lagi.

## 12. Menyetujui atau menolak

Direksi memeriksa pengajuan melalui halaman **Approval & Closing**. Detail
menampilkan run yang diajukan, ringkasan nominal, kesiapan, dan histori tindakan.

- Pilih **Setujui** jika hasil sudah benar.
- Pilih **Tolak** jika masih perlu perbaikan. Alasan penolakan wajib diisi.

Hasil yang ditolak tidak diajukan ulang secara langsung. Payroll Finance harus
memperbaiki sumber atau komponen, menjalankan hitung ulang, lalu mengajukan run
baru. Cara ini menjaga hasil dan keputusan lama tetap dapat ditelusuri.

Super Admin dapat menjalankan seluruh proses, termasuk menyetujui pengajuannya
sendiri untuk kebutuhan pemulihan operasional. Tindakan tersebut diberi penanda
khusus pada histori agar tetap transparan.

## 13. Melakukan closing

Closing dilakukan setelah current run disetujui.

1. Periksa kembali site, periode, nomor run, jumlah karyawan, dan nilai neto.
2. Pastikan tidak ada blocker atau perubahan data yang membutuhkan hitung ulang.
3. Pilih **Tutup Payroll** dan konfirmasi peringatan yang ditampilkan.

Setelah closing, hasil menjadi final dan tidak dapat dibuka kembali. Closing
tidak berarti dana sudah ditransfer atau diterima karyawan; status pembayaran
akan dikelola pada proses tersendiri.

## 14. Memahami tahapan proses

| Tahap | Arti |
| --- | --- |
| **Simulasi** | Hasil sudah dihitung dan masih dapat dihitung ulang. |
| **Diajukan** | Current run sedang menunggu keputusan Direksi. |
| **Disetujui** | Current run sudah disetujui dan siap ditutup. |
| **Ditutup** | Hasil telah menjadi final dan tidak dapat dibuka kembali. |

Gunakan histori persetujuan untuk melihat siapa yang mengajukan, menyetujui,
menolak, menarik, atau menutup beserta waktu dan alasannya.

## 15. Batas tahap saat ini

Pada tahap saat ini, sistem belum:

- menghitung pajak atau BPJS otomatis;
- menerbitkan slip gaji.

Hasil simulasi maupun closing belum berarti gaji sudah ditransfer atau
dibayarkan.
