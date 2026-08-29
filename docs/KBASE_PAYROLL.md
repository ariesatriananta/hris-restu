# Knowledge Base Payroll

> Status dokumen: Payroll Borongan, HARIAN, TRAINING, dan BULANAN sudah memakai
> alur pemeriksaan, simulasi, persetujuan, closing, ekspor, dan slip yang sama.
> Sumber serta rincian perhitungannya menyesuaikan skema masing-masing.

## 1. Tujuan menu Payroll

Modul Payroll menyiapkan perhitungan upah secara tertib dan dapat ditelusuri.
Upah Borongan berasal dari hasil Produksi, upah HARIAN dan TRAINING berasal dari
hari hadir dan tarif harian, sedangkan upah BULANAN berasal dari gaji pokok yang
dapat diprorata serta dikurangi Alpha/Izin. Sistem terlebih dahulu memeriksa
apakah Attendance, penempatan, shift, kalender, tarif atau gaji pokok, rekening,
dan komponen Payroll sudah cukup rapi sebelum perhitungan dimulai.

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

Pada Payroll Borongan, komponen tetap yang tanggal berlakunya mengenai periode
dibayarkan penuh satu kali. Untuk simulasi HARIAN/TRAINING saat ini hanya
komponen manual periode yang digunakan; komponen tetap/berulang belum diterapkan
agar nominal mingguan tidak terbayar berulang tanpa aturan yang jelas.

## 8. Menjalankan simulasi

1. Pilih periode pada halaman **Simulasi Payroll**.
2. Periksa pesan kesiapan.
3. Jika statusnya **Belum siap**, selesaikan blocker melalui menu yang
   ditunjukkan.
4. Jika statusnya **Siap** atau **Perlu perhatian**, pilih **Hitung**.
5. Tunggu sampai proses selesai. Halaman akan memperbarui status proses secara
   otomatis.
6. Periksa KPI dan daftar hasil per karyawan.

Untuk Payroll Borongan, perhitungan memakai rumus:

**Neto = hasil Produksi + komponen pendapatan - komponen potongan**

Nilai hasil Produksi disalin dari transaksi berstatus Tercatat/POSTED. Sistem
tidak menghitung ulang menggunakan tarif pekerjaan terbaru. Attendance disalin
sebagai informasi dan tidak otomatis menambah atau memotong nominal.

Jika data sumber atau komponen berubah, pilih **Hitung ulang**. Sistem membuat
versi run baru dan tidak menghapus versi sebelumnya.

Untuk Payroll HARIAN dan TRAINING mingguan, rumusnya:

**Neto simulasi = jumlah tarif pada hari hadir + komponen manual pendapatan - komponen manual potongan**

Hanya Attendance final berstatus **Hadir/PRESENT** yang dibayar. Karyawan yang
eligible tetapi tidak hadir tetap ditampilkan dengan upah dasar Rp0. Kehadiran
aktual pada hari nonkerja tetap dihitung dan diberi tanda perhatian. Produksi
karyawan TRAINING hanya ditampilkan sebagai informasi jumlah hasil dan tidak
menambah nominal upah.

## 9. Membaca hasil simulasi

Ringkasan menampilkan:

- jumlah karyawan yang dihitung;
- nilai hasil Produksi untuk Borongan, atau hari dibayar dan upah dasar untuk
  HARIAN/TRAINING;
- tambahan pendapatan;
- total potongan; dan
- nilai neto.

Pilih salah satu karyawan untuk melihat rincian transaksi Produksi atau ledger
harian, ringkasan Attendance, komponen pendapatan/potongan, status rekening, dan
jejak rumus. Ledger HARIAN/TRAINING menjelaskan tanggal, status Attendance,
tipe hari, tarif, apakah hari tersebut dibayar, dan nominalnya.
Informasi rekening mengikuti kewenangan akun dan dapat disamarkan untuk pengguna
read-only.

Neto negatif tetap ditampilkan agar masalah dapat ditelusuri. Kondisi tersebut
tidak menggagalkan simulasi, tetapi wajib diperbaiki sebelum tahap persetujuan
dan closing.

Semua hasil pada halaman ini masih berstatus **SIMULASI** dan belum merupakan
slip gaji resmi atau bukti pembayaran.

Payroll HARIAN, TRAINING, dan BULANAN dapat diajukan setelah hasil simulasi dan
seluruh sumbernya lolos pemeriksaan integritas. Jika tarif, gaji pokok,
Attendance, penempatan, shift, kalender, policy, komponen, atau rekening berubah
setelah simulasi, sistem meminta hitung ulang sebelum proses dilanjutkan.

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

## 15. Membaca riwayat dan membandingkan perhitungan

1. Buka **Payroll > Riwayat Payroll**.
2. Gunakan site, status, atau rentang tanggal untuk menemukan periode.
3. Pilih **Lihat histori** untuk membuka seluruh proses hitung pada periode itu.
4. Centang dua run berstatus **Selesai** untuk melihat perbedaannya.

Perbandingan menunjukkan perubahan jumlah karyawan dan selisih hasil Produksi,
pendapatan, potongan, serta neto. Run gagal tetap ditampilkan sebagai histori,
tetapi tidak dapat dibandingkan atau digunakan untuk slip.

Perbandingan hanya dilakukan dalam periode yang sama. Fitur ini membantu
menjawab pertanyaan seperti "apa yang berubah setelah hitung ulang?", bukan
untuk membandingkan performa antarbulan.

## 16. Mengekspor rekap dan daftar pembayaran

Pada detail histori, pilih:

- **Rekap** untuk mengunduh hasil Payroll. Nomor rekening selalu disamarkan.
  Jika sumbernya belum final, file diberi keterangan **SIMULASI**.
- **Daftar pembayaran** untuk menyiapkan nama bank, rekening lengkap, dan neto.
  Pilihan ini hanya muncul pada hasil `FINAL` dari periode **Ditutup** dan hanya
  untuk Payroll Finance atau Super Admin yang berwenang.

Daftar pembayaran adalah bahan kerja untuk proses transfer. File tersebut bukan
bukti bahwa transfer sudah dilakukan. Simpan dan kirim file dengan hati-hati
karena memuat data rekening karyawan.

## 17. Melihat dan mencetak slip

1. Buka **Payroll > Slip Gaji**.
2. Pilih periode, lalu pilih run yang sudah selesai.
3. Cari nama atau nomor karyawan.
4. Pilih **Preview** untuk membaca slip individual.
5. Pengguna berizin dapat mencetak satu slip, beberapa slip yang dipilih, atau
   seluruh slip pada run tersebut.

Preview dari hasil yang belum ditutup memiliki watermark **SIMULASI** dan belum
merupakan slip resmi. Slip tanpa watermark hanya tersedia dari current run
`FINAL` pada periode **Ditutup**.

Slip menampilkan hasil Produksi, pendapatan, potongan, neto, rekening yang
disamarkan, dan ringkasan Attendance. Attendance tersebut bersifat informasi
dan bukan pengali otomatis upah borongan. Cetak massal memakai kertas A4 portrait
dengan dua slip per lembar.

Profil perusahaan pada slip resmi mengikuti snapshot saat closing. Karena itu,
slip lama tidak berubah ketika profil perusahaan diperbarui kemudian.

## 18. Jika menu atau tombol tidak tersedia

- Site yang tampil mengikuti akses akun.
- Director dapat melihat preview dan rekap dengan rekening disamarkan, tetapi
  tidak mencetak massal atau mengunduh Daftar Pembayaran secara default.
- Payroll Finance dapat mencetak dan mengunduh Daftar Pembayaran untuk site
  yang diberikan kepada akunnya.
- Super Admin dapat menjalankan seluruh fungsi lintas site.

Jika closing ditolak karena profil perusahaan belum lengkap, lengkapi nama dan
alamat perusahaan melalui **Administrasi Sistem > Pengaturan**, lalu ulangi
closing.

## 19. Mengatur skema upah dan master tarif

Buka **Payroll > Skema Upah & Tarif** untuk melihat empat jenis skema:

- **Borongan** dihitung dari hasil Produksi dan dibayar mingguan.
- **Harian** dihitung dari tarif per hari dan hari Attendance **Hadir**.
- **Training** dihitung dari tarif per hari dan hari Attendance **Hadir**.
  Hasil Produksi Training tetap dicatat sebagai informasi kinerja, tetapi tidak
  menjadi sumber nominal upah.
- **Bulanan** menggunakan gaji pokok bulanan. Pengaturan cutoff awal memakai
  akhir bulan.

Halaman ini juga menyediakan daftar tarif harian, histori gaji pokok, dan hasil
pemeriksaan data Training lama. Nominal hanya terlihat bagi pengguna yang
berwenang. Director menerima nilai yang disamarkan.

Perubahan gaji pokok berikutnya harus dimulai pada awal periode Payroll.
Khusus gaji pokok pertama karyawan baru, tanggal efektif boleh mengikuti
tanggal mulai bekerja agar prorata tetap dapat dihitung dengan benar.

Kebijakan Payroll hanya dapat diubah Super Admin. Payroll Finance dapat melihat
kebijakan sesuai site dan mengelola tarif bila memiliki kewenangan. Setiap
koreksi atau pembatalan tarif wajib diberi alasan dan tetap tersimpan dalam
histori.

Pemeriksaan Training berstatus **Terblokir** berarti ada hasil Payroll lama yang
sudah disetujui atau ditutup dan masih memperlakukan Training sebagai upah
hasil. Jangan menghapus atau mengubah data tersebut secara manual; laporkan
kepada Administrator untuk remediasi historis.

## 20. Membuat dan memeriksa periode berbasis waktu

Pada **Payroll > Periode Payroll**, pilih site, jenis Payroll, dan satu tanggal
acuan di dalam periode yang ingin diproses. Sistem menentukan tanggal mulai dan
akhir dari policy yang berlaku saat itu. Harian dan Training dibuat sebagai
periode terpisah, walaupun sama-sama memakai periode Senin-Minggu.

Pilih **Periksa kesiapan** sebelum membuat periode. Pemeriksaan menampilkan:

- karyawan yang masuk periode berdasarkan histori penempatan dan kontrak;
- cakupan tarif harian atau gaji pokok;
- hari Hadir, Alpha, Izin, serta hari kerja terjadwal;
- estimasi bruto, potongan, dan neto; serta
- masalah yang harus diperbaiki beserta menu tindak lanjutnya, termasuk periode
  yang belum selesai atau Attendance yang belum difinalisasi.

Kehadiran nyata pada hari nonkerja tetap dihitung untuk karyawan Harian atau
Training, tetapi ditandai sebagai perhatian agar HR dapat memeriksanya. Estimasi
ini hanya untuk pemeriksaan data dan belum menjadi hasil Payroll resmi.

## 21. Memeriksa simulasi Payroll Bulanan

Buka **Payroll > Simulasi Payroll**, lalu pilih periode karyawan **Bulanan**.
Pilih **Hitung** setelah kesiapan periode tidak lagi berstatus **Terblokir**.
Hasil simulasi menampilkan gaji prorata, potongan Alpha, potongan Izin, bruto,
dan neto. Angka tersebut adalah snapshot pada saat perhitungan dijalankan;
perubahan master setelahnya tidak mengubah run yang sudah selesai.

Pilih ikon detail pada karyawan untuk melihat dasar perhitungannya:

- gaji pokok penuh yang berlaku;
- jumlah hari kalender karyawan masih eligible dibandingkan seluruh hari dalam
  periode;
- gaji pokok setelah prorata join atau resign;
- jumlah hari kerja terjadwal sebagai pembagi potongan;
- jumlah dan nominal potongan Alpha serta Izin secara terpisah; dan
- ledger Attendance per tanggal beserta dampaknya terhadap potongan.

Sakit dan Cuti tidak otomatis mengurangi gaji pokok pada tahap ini. Komponen
tambahan atau potongan lain harus dicatat sebagai komponen manual yang dapat
diaudit. Jika neto menjadi negatif, hasil tetap terlihat agar sumber masalah
dapat diperbaiki.

Setelah hasil diperiksa dan tidak memiliki blocker, Payroll Bulanan dapat
mengikuti proses pengajuan, persetujuan, dan closing yang sama dengan Payroll
Borongan. Perubahan sumber setelah simulasi mengharuskan HR menghitung ulang
agar hasil resmi tetap sesuai data terbaru.

## 22. Batas tahap saat ini

Pada tahap saat ini, sistem belum:

- menghitung pajak atau BPJS otomatis;
- mencatat status transfer atau pembayaran sebagai proses tersendiri;
- menyimpan file PDF slip secara permanen; atau
- menggunakan tanda tangan elektronik pada slip.

Hasil simulasi dapat diajukan dan ditutup setelah seluruh pemeriksaan lolos.
Rekap dan slip menyesuaikan jenis Payroll: hasil produksi untuk Borongan, upah
harian untuk Harian/Training, serta gaji pokok prorata untuk Bulanan. Walaupun
sudah ditutup atau dicetak, hasil tersebut belum berarti gaji sudah ditransfer
atau dibayarkan.
