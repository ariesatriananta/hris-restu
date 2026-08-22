# Knowledge Base - Rekap Produksi

> Modul: Produksi Borongan
>
> Bagian: Rekap Produksi
>
> Audiens: Admin Produksi, HR, Payroll, pimpinan, dan Super Admin
>
> Terakhir diperbarui: 22 Agustus 2026

Panduan ini membantu Anda membaca hasil Produksi Borongan per periode, karyawan, dan pekerjaan. Rekap menampilkan data yang masih aktif dihitung, sehingga transaksi yang sudah dibatalkan tidak ikut menambah hasil.

## 1. Kapan panduan ini digunakan

Gunakan Rekap Produksi ketika Anda perlu:

- memeriksa hasil Produksi sebelum diproses oleh Payroll;
- membandingkan jumlah karyawan, transaksi, pekerjaan, dan nilai bruto;
- melihat hasil per karyawan atau per pekerjaan;
- menelusuri rincian transaksi pada periode tertentu;
- memastikan kuantitas dari satuan berbeda tidak tercampur;
- mengunduh data sesuai filter ke Excel.

Rekap ini bersifat baca saja. Jika ditemukan kesalahan, buka Transaksi Produksi dan gunakan tindakan Koreksi atau Batalkan sesuai prosedur.

## 2. Siapa yang biasa menggunakan

- **Admin Produksi** memeriksa kelengkapan hasil dan transaksi pada site.
- **HR** membaca hasil bersama konteks jenis serta penempatan karyawan.
- **Payroll** memakai rekap sebagai pemeriksaan sebelum dan sesudah data produksi masuk proses gaji.
- **Pimpinan** melihat ringkasan hasil lintas site sesuai akses.
- **Super Admin** dapat melakukan pemeriksaan lintas site.

Data dan pilihan site tetap mengikuti hak akses akun. Tombol **Ekspor Excel** hanya tampil untuk pengguna yang diberi hak ekspor.

## 3. Hal penting sebelum membaca angka

Rekap Produksi menampilkan **Data live**, artinya angka dapat berubah ketika:

- ada setoran baru;
- Setoran Susulan dicatat;
- transaksi dikoreksi;
- transaksi dibatalkan;
- data masuk ke proses Payroll.

Hanya transaksi berstatus **Tercatat** yang dihitung. Transaksi **Dibatalkan** tidak ikut dihitung. Jika sebuah transaksi dikoreksi, transaksi lama tidak dihitung dan transaksi penggantinya yang masuk rekap.

Nilai bruto adalah nilai awal dari kuantitas dan tarif pada saat setoran dicatat. Nilai tersebut bukan gaji bersih dan belum menunjukkan bahwa gaji sudah dibayar.

## 4. Memilih periode rekap

Buka **Produksi Borongan → Rekap Produksi**.

1. Pilih **Dari tanggal**.
2. Pilih **Sampai tanggal**.
3. Tunggu sampai kartu dan daftar selesai diperbarui.

Satu kali pemeriksaan dibatasi maksimal 31 hari kalender. Jika perlu melihat periode lebih panjang, bagi pemeriksaan menjadi beberapa rentang agar data tetap cepat dan mudah dibaca.

Tanggal akhir tidak boleh lebih awal dari tanggal awal. Saat tanggal awal diubah, aplikasi membantu membatasi tanggal akhir agar tetap berada dalam rentang yang diperbolehkan.

## 5. Membaca kartu ringkasan

Bagian atas rekap menampilkan empat kartu:

| Kartu | Arti |
|---|---|
| Karyawan tercatat | Jumlah karyawan berbeda yang mempunyai transaksi Tercatat pada periode dan filter terpilih. |
| Transaksi tercatat | Jumlah seluruh transaksi yang masih dihitung. Satu karyawan dapat memiliki lebih dari satu transaksi dalam sehari. |
| Pekerjaan digunakan | Jumlah pekerjaan berbeda yang muncul pada transaksi. |
| Nilai bruto tercatat | Jumlah nilai awal dari seluruh transaksi yang sedang dihitung. |

Arahkan kursor ke kartu untuk membaca penjelasan singkatnya.

### 5.1 Hasil per satuan

Di bawah kartu terdapat bagian **Hasil per satuan**. Gunakan bagian ini untuk membaca total kuantitas dengan benar.

Contoh:

- 10.000 PCS;
- 250 KG;
- 80 BOX.

Ketiga angka tersebut tidak boleh dijumlahkan menjadi satu angka kuantitas karena arti satuannya berbeda. Rekap selalu memisahkannya. Nilai bruto tetap dapat dijumlahkan karena seluruh nominal menggunakan Rupiah.

## 6. Menggunakan pencarian dan filter

Filter yang tersedia:

- pencarian nama atau nomor karyawan;
- **Site**;
- **Pekerjaan**;
- **Jenis** karyawan;
- **Bagian produksi**.

Filter berlaku pada tampilan **Per Karyawan** dan **Per Pekerjaan**. Jika hasil kosong setelah filter dipilih, klik **Reset filter** untuk kembali melihat seluruh data dalam periode dan akses site Anda.

Tidak ada filter Kelompok Kerja pada halaman ini. Gunakan Site, Pekerjaan, Jenis, dan Bagian Produksi sebagai dasar pemeriksaan operasional.

## 7. Tampilan Per Karyawan

Tab **Per Karyawan** membantu Anda membaca kontribusi setiap pekerja.

Setiap baris atau kartu menampilkan:

- nama karyawan;
- site dan nomor karyawan;
- jenis karyawan dan jabatan;
- Bagian Produksi;
- pekerjaan serta hasil per satuan;
- jumlah transaksi;
- nilai bruto;
- status data terhadap proses Payroll.

Rekap membentuk baris berdasarkan karyawan dan site. Jika seorang karyawan mempunyai transaksi pada dua site dalam periode yang sama, datanya dapat tampil sebagai dua baris agar hasil per site tetap jelas.

### 7.1 Penempatan berubah

Label **Penempatan berubah** muncul jika jenis, jabatan, atau Bagian Produksi karyawan berubah di tengah periode rekap.

Label ini bukan kesalahan. Buka detail untuk melihat urutan penempatan dan tanggal berlakunya. Pastikan perubahan tersebut sesuai dengan histori kerja yang sebenarnya.

### 7.2 Membuka Detail Rekap Karyawan

Klik tombol lihat pada baris atau kartu karyawan. Drawer **Detail Rekap Karyawan** menyediakan:

- identitas karyawan dan site;
- nilai bruto dan status terhadap Payroll;
- jenis, jabatan, serta Bagian Produksi;
- jumlah transaksi;
- total hasil per satuan;
- rincian hasil per pekerjaan;
- urutan penempatan jika berubah dalam periode;
- daftar transaksi yang membentuk rekap.

Gunakan tab **Ringkasan** untuk membaca total dan tab **Transaksi** untuk menelusuri transaksi satu per satu.

## 8. Tampilan Per Pekerjaan

Tab **Per Pekerjaan** menyajikan kartu pekerjaan agar hasil mudah dibandingkan tanpa membaca tabel panjang.

Setiap kartu menampilkan:

- nama dan kode pekerjaan;
- satuan hasil;
- total hasil;
- jumlah pekerja;
- jumlah transaksi;
- nilai bruto;
- status data terhadap Payroll.

Klik **Lihat rincian** untuk membuka Drawer **Detail Rekap Pekerjaan**.

### 8.1 Membuka Detail Rekap Pekerjaan

Pada tab **Ringkasan**, Anda dapat melihat:

- total hasil per satuan;
- jumlah karyawan;
- jumlah transaksi;
- nilai bruto;
- kontribusi setiap karyawan.

Pada tab **Transaksi**, Anda dapat melihat waktu, kuantitas, nilai bruto, dan informasi jika transaksi merupakan pengganti hasil koreksi.

## 9. Memahami status terhadap Payroll

Status di Rekap Produksi menjelaskan apakah transaksi sudah disalin sebagai dasar proses Payroll. Status ini tidak menunjukkan pembayaran gaji.

| Status yang tampil | Arti |
|---|---|
| **Belum disnapshot** | Belum ada transaksi pada baris tersebut yang disalin ke proses Payroll. |
| **Sebagian disnapshot** | Sebagian transaksi sudah disalin ke proses Payroll, tetapi masih ada transaksi lain yang belum. |
| **Sudah disnapshot** | Seluruh transaksi yang dihitung pada baris tersebut sudah disalin ke proses Payroll. |

Istilah “disnapshot” pada layar berarti data transaksi disalin dan dipertahankan sebagai bahan perhitungan Payroll. Status tersebut bukan tanda bahwa Payroll sudah disetujui, ditutup, atau dibayar.

Jika status **Sebagian disnapshot** muncul, buka detail transaksi untuk menemukan data yang sudah dan belum masuk proses Payroll. Jangan langsung menyimpulkan ada selisih tanpa memeriksa tanggal dan transaksi penyusunnya.

## 10. Dampak koreksi dan pembatalan pada rekap

### 10.1 Transaksi dikoreksi

Saat koreksi diterapkan:

- transaksi lama menjadi Dibatalkan dan keluar dari perhitungan;
- transaksi pengganti menjadi Tercatat dan masuk perhitungan;
- nilai bruto dihitung dari data pengganti;
- detail transaksi menunjukkan hubungan dengan transaksi lama.

Setelah koreksi, muat ulang atau tunggu rekap selesai memperbarui data.

### 10.2 Transaksi dibatalkan

Transaksi yang dibatalkan tidak menambah jumlah transaksi, kuantitas, maupun nilai bruto pada rekap.

### 10.3 Data sudah masuk Payroll

Jika transaksi sudah dikunci oleh Payroll, perubahannya dapat ditolak. Koordinasikan dengan tim Payroll dan jangan memaksakan perubahan dari modul Produksi.

## 11. Mengunduh Rekap ke Excel

Jika tombol **Ekspor Excel** tersedia:

1. pilih periode;
2. terapkan pencarian dan filter yang dibutuhkan;
3. periksa ringkasan pada layar;
4. klik **Ekspor Excel**;
5. tunggu pesan bahwa unduhan berhasil.

File mengikuti:

- periode yang dipilih;
- pencarian dan filter aktif;
- site yang boleh diakses oleh akun;
- transaksi yang masih dihitung pada saat ekspor dilakukan.

File Excel berisi beberapa lembar untuk ringkasan karyawan, rincian pekerjaan, transaksi yang dihitung, dan riwayat revisi. Karena rekap bersifat live, waktu ekspor penting. Simpan file beserta periode pemeriksaannya jika akan dipakai sebagai bukti review.

## 12. Urutan pemeriksaan yang disarankan

1. Pilih periode dan site yang benar.
2. Periksa jumlah **Karyawan tercatat** dan **Transaksi tercatat**.
3. Periksa **Hasil per satuan** dan pastikan tidak ada satuan yang tidak dikenal.
4. Periksa nilai bruto secara umum.
5. Buka tab **Per Karyawan** dan cari pekerja yang perlu diperiksa.
6. Periksa label **Penempatan berubah** jika ada.
7. Buka tab **Per Pekerjaan** untuk membandingkan hasil antarpekerjaan.
8. Periksa status **Belum**, **Sebagian**, atau **Sudah disnapshot** terhadap proses Payroll.
9. Buka drawer detail jika angka terlihat tidak wajar.
10. Perbaiki kesalahan dari halaman Transaksi Produksi, lalu kembali ke rekap.
11. Ekspor Excel setelah hasil pemeriksaan dinyatakan sesuai.

## 13. Solusi masalah umum

| Kondisi | Yang perlu dilakukan |
|---|---|
| Rekap kosong | Periksa periode, site, filter, dan pastikan terdapat transaksi berstatus Tercatat. |
| Periode tidak valid | Pastikan tanggal akhir tidak lebih awal dan rentang tidak lebih dari 31 hari. |
| Angka lebih kecil dari daftar transaksi | Periksa apakah sebagian transaksi sudah Dibatalkan atau filter sedang aktif. |
| Angka berubah setelah halaman dibuka | Rekap bersifat live. Periksa apakah ada setoran, koreksi, pembatalan, atau proses Payroll terbaru. |
| Satu karyawan muncul dua kali | Periksa site. Baris dibedakan berdasarkan kombinasi karyawan dan site. |
| Ada label Penempatan berubah | Buka detail dan periksa urutan jenis, jabatan, serta Bagian Produksi selama periode. |
| Total kuantitas tidak terlihat sebagai satu angka | Ini benar jika ada beberapa satuan. Baca setiap satuan secara terpisah. |
| Status Sebagian disnapshot | Buka detail transaksi untuk melihat mana yang sudah masuk proses Payroll. |
| Drawer detail gagal dimuat | Klik **Coba lagi**. Jika tetap gagal, periksa koneksi dan ulangi dengan filter yang sama. |
| Tombol Ekspor Excel tidak terlihat | Akun tidak mempunyai hak ekspor. Hubungi pengelola hak akses. |
| Ekspor gagal | Periksa periode, koneksi, dan filter. Coba lagi tanpa mengubah periode agar hasil tetap sebanding. |
| Angka rekap salah | Temukan transaksi penyusunnya dari drawer, lalu koreksi atau batalkan melalui halaman Transaksi Produksi. |

## 14. Batas penggunaan Rekap Produksi

- Rekap tidak melakukan finalisasi harian.
- Rekap tidak mengubah transaksi.
- Rekap tidak menghitung gaji bersih.
- Rekap tidak menunjukkan status pembayaran.
- Rekap tidak mencampurkan kuantitas dengan satuan berbeda.
- Rekap tidak dapat membuka data yang sudah dikunci Payroll untuk dikoreksi.

Gunakan Rekap sebagai alat pemeriksaan operasional. Proses perhitungan, persetujuan, penutupan, dan pembayaran tetap dilakukan pada modul Payroll.

## 15. Navigasi KBase Produksi

- Kembali ke [Indeks Produksi Borongan](../../KBASE_SETORAN_PRODUKSI.md).
- Buka [Master Produksi](./KBASE_MASTER_PRODUKSI.md) untuk pekerjaan, penugasan, satuan, dan tarif.
- Buka [Transaksi Setoran Produksi](./KBASE_TRANSAKSI_SETORAN_PRODUKSI.md) untuk Terminal, Setoran Susulan, koreksi, dan pembatalan.
