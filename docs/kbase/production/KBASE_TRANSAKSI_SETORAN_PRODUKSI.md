# Knowledge Base - Transaksi Setoran Produksi

> Modul: Produksi Borongan
>
> Bagian: Terminal Setoran dan Transaksi Produksi
>
> Audiens: Admin Produksi, operator terminal, pengguna yang menangani koreksi, dan Super Admin
>
> Terakhir diverifikasi: 7 September 2026

Panduan ini menjelaskan cara mencatat hasil kerja melalui Terminal Setoran, memantau transaksi, mencatat Setoran Susulan, serta menangani kesalahan tanpa menghilangkan histori.

## 1. Kapan panduan ini digunakan

Gunakan panduan ini untuk pekerjaan operasional berikut:

- menghubungkan browser dengan Terminal Produksi;
- scan label karyawan dan mencatat hasil kerja;
- mencari serta memeriksa transaksi yang sudah tercatat;
- mencatat hasil kerja yang terlewat melalui Setoran Susulan;
- mengoreksi karyawan, pekerjaan, atau kuantitas yang salah;
- membatalkan transaksi yang seharusnya tidak dihitung;
- membaca histori perubahan dan status kunci Payroll.

## 2. Siapa yang biasa menggunakan

- **Admin Produksi atau operator terminal** mencatat setoran harian melalui Terminal Setoran.
- **Pengguna yang memiliki hak koreksi Produksi** dapat membuat Setoran Susulan, melakukan koreksi, dan membatalkan transaksi sesuai site yang boleh diakses.
- **Super Admin** dapat menangani operasional lintas site.
- **Pengguna dengan akses lihat** dapat memantau transaksi dan membuka detail tanpa mengubahnya.

Tidak ada alur persetujuan terpisah untuk Setoran Susulan, koreksi, atau pembatalan. Tindakan langsung diterapkan setelah preview, alasan, dan seluruh pemeriksaan dinyatakan aman.

## 3. Persiapan sebelum menerima setoran

Pastikan hal berikut sudah siap:

- perangkat Scanner USB atau Terminal sudah aktif pada Master Perangkat;
- browser terhubung ke internet;
- akun operator memiliki akses ke site perangkat;
- kode aktivasi Terminal Produksi masih berlaku;
- karyawan membawa Label Setoran Produksi yang benar;
- master pekerjaan, penugasan, dan tarif pada site sudah siap;
- data Attendance tanggal tersebut sudah mencatat Hadir dan scan Masuk berhasil.

> Aktivasi Terminal Attendance dan Terminal Produksi disimpan terpisah. Perangkat yang sama tetap perlu diaktifkan khusus untuk Produksi sebelum dapat menerima setoran.

## 4. Syarat karyawan dapat mencatat hasil

Pada tanggal hasil kerja, sistem memastikan:

- karyawan mempunyai satu histori kerja yang sah;
- status dan jenis karyawan mengizinkan Produksi Borongan;
- site karyawan sama dengan site Terminal;
- Attendance berstatus **Hadir** pada site dan tanggal yang sama;
- terdapat scan **Masuk** yang berhasil;
- pekerjaan masih aktif dan termasuk dalam penugasan karyawan;
- terdapat tepat satu pekerjaan utama aktif;
- terdapat satu tarif aktif untuk site, pekerjaan, dan tanggal tersebut;
- periode belum dikunci oleh proses Payroll.

Status Hadir tanpa scan Masuk belum cukup. Scan Pulang saja atau koreksi manual yang tidak memiliki scan Masuk juga tidak memenuhi syarat setoran.

## 5. Mengaktifkan Terminal Setoran

Buka **Produksi Borongan → Terminal Setoran**.

Jika layar menampilkan **Aktivasi Terminal Produksi**:

1. dari Master Perangkat, pilih aksi **Aktivasi Produksi** pada perangkat
   bertipe Scanner USB atau Terminal;
2. masukkan kode pada kolom **Kode aktivasi**;
3. klik **Aktifkan terminal**;
4. pastikan nama perangkat, site, kode perangkat, dan jenis perangkat yang tampil sudah benar.

Aktivasi ditolak jika kode salah, sudah dipakai, sudah tidak berlaku, perangkat tidak mendukung Produksi, atau site perangkat tidak dapat diakses oleh akun yang sedang masuk.

Jangan membagikan kode aktivasi melalui chat atau screenshot. Jika browser berpindah perangkat atau data browser dihapus, aktivasi mungkin perlu dilakukan ulang.

### 5.1 Status Online dan Offline

- **Online** berarti Terminal siap melakukan pemeriksaan dan menyimpan setoran.
- **Offline** berarti setoran tidak dapat dilakukan.

Terminal tidak menyimpan antrean sementara saat internet putus. Sambungkan internet sebelum melanjutkan agar transaksi tidak dianggap sudah masuk padahal belum tersimpan.

### 5.2 Putuskan Terminal

Gunakan **Putuskan** jika browser tidak lagi dipakai sebagai Terminal Produksi. Setelah diputuskan, browser harus diaktifkan ulang sebelum dapat mencatat setoran.

## 6. Mencatat setoran melalui Terminal

### 6.1 Scan label pekerja

1. Pastikan kursor berada pada kolom **Barcode karyawan**.
2. Scan Label Setoran Produksi dengan Scanner USB.
3. Jika scanner tidak tersedia, nomor karyawan dapat diketik lalu klik **Cek**.
4. Tunggu sampai identitas karyawan tampil.
5. Cocokkan nama, nomor karyawan, Bagian Produksi, tanggal kerja, dan jam Masuk.

Barcode hanya memilih karyawan. Barcode tidak langsung menyimpan kuantitas atau nilai produksi.

Jika identitas yang tampil salah, klik **Ganti pekerja** dan scan label yang benar. Jangan melanjutkan dengan identitas yang tidak sesuai.

### 6.2 Pilih pekerjaan dan isi jumlah

1. Periksa pilihan **Pekerjaan**. Pekerjaan utama akan dipilih terlebih dahulu.
2. Jika hasil berasal dari pekerjaan tambahan yang sah, pilih pekerjaan tersebut.
3. Isi **Jumlah** sesuai satuan yang tampil.
4. Periksa **Tarif aktif**, **Satuan**, dan **Estimasi bruto**.
5. Klik tombol pencatatan setoran.
6. Tunggu pesan berhasil sebelum label berikutnya dipindai.

Satu karyawan boleh melakukan beberapa setoran pada hari yang sama. Setiap nampan atau hasil berikutnya dapat dicatat sebagai transaksi baru.

### 6.3 Cara membaca Estimasi bruto

Estimasi bruto adalah perkiraan awal:

**Jumlah hasil × tarif aktif pada tanggal setoran**

Contoh: 25 PCS dengan tarif Rp1.200 menghasilkan estimasi bruto Rp30.000.

Angka ini belum merupakan gaji bersih. Potongan, penyesuaian, perhitungan, dan persetujuan gaji berada pada proses Payroll.

### 6.4 Angka bulat dan pecahan

Jumlah harus mengikuti satuan pekerjaan:

- jika satuan memakai 0 desimal, isi angka bulat seperti 25;
- jika satuan mengizinkan pecahan, Anda dapat mengisi misalnya 12,5.

Jangan menambahkan angka pecahan jika hasil lapangan memang harus bulat. Sistem akan menolak jumlah dengan pecahan lebih banyak daripada yang diizinkan satuan.

### 6.5 Setelah setoran berhasil

Transaksi terbaru tampil pada bagian aktivitas terakhir. Periksa:

- nama karyawan;
- pekerjaan;
- kuantitas dan satuan;
- nilai bruto;
- waktu pencatatan.

Jika jaringan mengirim permintaan yang sama lebih dari sekali, sistem menjaga agar setoran yang sama tidak tercatat ganda. Tetap tunggu pesan hasil sebelum melakukan scan berikutnya.

## 7. Membaca halaman Transaksi Produksi

Buka **Produksi Borongan → Transaksi Produksi**.

### 7.1 Ringkasan

Kartu ringkasan menampilkan data sesuai periode dan filter:

| Kartu | Arti |
|---|---|
| Transaksi | Jumlah transaksi pada periode yang dipilih. |
| Pekerja | Jumlah karyawan berbeda yang memiliki transaksi. |
| Hasil per Satuan | Total hasil yang dipisahkan menurut satuan agar PCS, KG, BOX, dan satuan lain tidak tercampur. |
| Nilai Bruto | Jumlah nilai awal berdasarkan tarif yang tersimpan pada setiap transaksi. |

### 7.2 Pencarian dan filter

Anda dapat:

- memilih **Dari tanggal** dan **Sampai tanggal**;
- mencari nomor transaksi, nama, atau nomor karyawan;
- memfilter berdasarkan **Site**, **Pekerjaan**, dan **Status**;
- memilih kolom yang ingin ditampilkan melalui tombol **View**.

Status transaksi:

- **Tercatat** berarti transaksi masih dihitung sebagai hasil Produksi;
- **Dibatalkan** berarti transaksi tidak lagi dihitung, tetapi historinya tetap tersedia.

### 7.3 Membuka detail transaksi

Klik tombol lihat pada baris atau kartu transaksi. Drawer detail menampilkan:

- nomor dan status transaksi;
- nama, nomor karyawan, dan site;
- pekerjaan, kuantitas, satuan, tarif saat setoran, dan nilai bruto;
- tanggal hasil kerja dan waktu pencatatan;
- sumber pencatatan: Terminal Produksi, Setoran Susulan, atau Hasil Koreksi;
- perangkat yang digunakan jika berasal dari Terminal;
- hubungan dengan transaksi lama atau transaksi pengganti;
- alasan pembatalan;
- histori revisi;
- keterangan jika transaksi terkunci oleh Payroll.

Tarif yang terlihat pada detail adalah tarif yang dipakai saat transaksi dicatat. Tarif tersebut tidak ikut berubah ketika master tarif diperbarui kemudian.

## 8. Mencatat Setoran Susulan

Gunakan **Setoran Susulan** hanya untuk hasil kerja yang benar-benar terlewat dicatat melalui Terminal. Setoran Susulan tidak boleh dipakai untuk memperbaiki transaksi yang sudah ada; gunakan Koreksi untuk kasus tersebut.

### 8.1 Langkah Setoran Susulan

1. Buka halaman **Transaksi Produksi**.
2. Klik **Setoran Susulan**.
3. Pilih **Site**.
4. Pilih **Tanggal hasil kerja**. Tanggal masa depan tidak diperbolehkan.
5. Pilih **Karyawan** yang memenuhi syarat pada tanggal tersebut.
6. Pilih **Pekerjaan** aktif yang ditugaskan kepada karyawan.
7. Isi **Kuantitas hasil**.
8. Klik **Preview setoran**.
9. Periksa identitas, pekerjaan, kuantitas, estimasi bruto, dan hasil verifikasi.
10. Isi **Alasan setoran susulan** dengan penjelasan yang jelas, minimal lima karakter.
11. Klik **Catat Setoran**.

Setoran Susulan tetap menjalani pemeriksaan Attendance, scan Masuk, penugasan, tarif, site, dan kunci Payroll seperti setoran dari Terminal.

### 8.2 Karyawan eligible tidak ditemukan

Pesan ini berarti tidak ada karyawan yang memenuhi seluruh syarat pada kombinasi site dan tanggal yang dipilih, atau daftar gagal dimuat.

Periksa secara berurutan:

1. site dan tanggal hasil kerja;
2. status serta histori kerja karyawan;
3. Attendance Hadir pada tanggal tersebut;
4. scan Masuk yang berhasil;
5. penugasan pekerjaan aktif;
6. tarif aktif pekerjaan;
7. status proses Payroll.

Jika layar juga menampilkan pesan gangguan layanan, klik **Coba lagi**. Bila tetap gagal, catat site dan tanggal yang dipilih lalu hubungi tim support tanpa membagikan data sensitif.

## 9. Mengoreksi transaksi

Gunakan **Koreksi** jika transaksi sudah tercatat tetapi karyawan, pekerjaan, atau kuantitasnya salah.

### 9.1 Langkah koreksi

1. Buka detail transaksi berstatus **Tercatat**.
2. Klik **Koreksi**.
3. Pilih **Karyawan pengganti** jika hasil tercatat pada orang yang salah. Biarkan tetap sama jika karyawannya sudah benar.
4. Pilih **Pekerjaan pengganti**.
5. Isi **Kuantitas hasil** yang benar.
6. Klik **Preview perubahan**.
7. Bandingkan bagian **Sebelum** dan **Sesudah**, termasuk selisih kuantitas dan bruto.
8. Isi **Alasan koreksi** dengan jelas.
9. Klik **Terapkan koreksi**.

Setelah diterapkan:

- transaksi lama berubah menjadi **Dibatalkan**;
- sistem membuat transaksi pengganti berstatus **Tercatat**;
- tanggal hasil kerja dan waktu pencatatan tetap mengikuti transaksi lama;
- hubungan transaksi lama dan pengganti dapat dibuka dari drawer;
- alasan dan pengguna yang melakukan koreksi tersimpan pada **Histori Revisi**.

Cara ini menjaga transaksi awal tetap dapat ditelusuri. Jangan mencoba menghapus atau menimpa transaksi lama.

### 9.2 Koreksi karyawan

Karyawan pengganti tetap harus:

- berada pada site dan tanggal hasil kerja yang sama;
- memenuhi syarat Produksi;
- berstatus Hadir dan memiliki scan Masuk berhasil;
- memiliki penugasan pekerjaan serta tarif yang valid.

Koreksi tidak digunakan untuk memindahkan transaksi ke site atau tanggal lain. Jika site atau tanggal sejak awal salah, batalkan transaksi dan ikuti prosedur pencatatan yang sesuai.

## 10. Membatalkan transaksi

Gunakan **Batalkan** jika transaksi seharusnya tidak dihitung dan tidak perlu diganti.

1. Buka detail transaksi berstatus **Tercatat**.
2. Klik **Batalkan**.
3. Periksa dampak pengurangan kuantitas dan bruto.
4. Isi alasan pembatalan dengan jelas.
5. Klik **Ya, batalkan transaksi**.

Transaksi akan berstatus **Dibatalkan** dan tidak masuk perhitungan Rekap Produksi. Pembatalan tidak dapat dipulihkan langsung. Jika ternyata hasil tetap perlu dicatat, lakukan pencatatan baru melalui prosedur yang benar.

## 11. Kunci Payroll

Koreksi, pembatalan, dan Setoran Susulan dapat ditolak ketika data tanggal tersebut:

- sedang diproses oleh Payroll;
- sudah dihitung;
- sudah disetujui;
- sudah ditutup;
- sudah disalin sebagai dasar perhitungan Payroll.

Drawer menampilkan **Terkunci oleh Payroll** beserta alasannya. Jangan mengubah data Produksi secara paksa. Hubungi tim Payroll untuk memeriksa periode terkait. Payroll yang sudah ditutup tidak dapat dibuka dari modul Produksi.

## 12. Solusi masalah umum

| Kondisi | Yang perlu dilakukan |
|---|---|
| Kode aktivasi ditolak | Periksa masa berlaku kode, status perangkat, jenis perangkat, site, dan akses akun. Buat kode baru jika kode lama sudah dipakai atau tidak berlaku. |
| Terminal tersimpan tidak sesuai site | Putuskan Terminal lalu masuk dengan akun dan perangkat site yang benar. |
| Terminal Offline | Sambungkan internet. Setoran tidak disimpan sebagai antrean lokal. |
| Barcode tidak dikenal | Periksa label dan nomor karyawan. Jangan membuat nomor baru dari layar Terminal. |
| Karyawan tidak siap menerima setoran | Periksa status kerja, site, Attendance Hadir, scan Masuk, penugasan, dan tarif. |
| Pekerjaan tidak muncul | Periksa penugasan aktif karyawan pada tanggal tersebut. |
| Kuantitas ditolak | Sesuaikan angka dengan presisi satuan dan pastikan nilainya lebih dari nol. |
| Tarif tidak ditemukan atau ambigu | Periksa Tarif per Site dan pastikan hanya satu tarif aktif berlaku pada tanggal itu. |
| Setoran Susulan tidak dapat dipreview | Periksa kembali site, tanggal, karyawan, pekerjaan, kuantitas, dan Payroll. |
| Tombol Koreksi atau Batalkan tidak tampil | Transaksi bukan lagi Tercatat, sudah terkunci Payroll, berada di luar site akun, atau akun tidak memiliki hak koreksi. |
| Koreksi karyawan ditolak | Pastikan karyawan pengganti memenuhi syarat pada site dan tanggal transaksi lama. |
| Transaksi terkunci Payroll | Hentikan perubahan dan koordinasikan dengan tim Payroll. |
| Transaksi terlihat ganda | Bandingkan nomor dan waktu transaksi. Karyawan memang boleh menyetor beberapa kali sehari; batalkan hanya jika salah satu benar-benar keliru. |

## 13. Pemeriksaan akhir operasional

- [ ] Terminal menunjukkan site dan perangkat yang benar.
- [ ] Status Terminal Online.
- [ ] Nama karyawan selalu diperiksa setelah scan.
- [ ] Pekerjaan dan satuan sesuai hasil di lapangan.
- [ ] Kuantitas dan estimasi bruto diperiksa sebelum disimpan.
- [ ] Pesan berhasil muncul sebelum scan berikutnya.
- [ ] Setoran Susulan hanya dipakai untuk hasil yang terlewat.
- [ ] Koreksi dan pembatalan selalu melalui preview serta alasan yang jelas.
- [ ] Tidak ada transaksi terkunci Payroll yang dipaksa diubah.
- [ ] Transaksi harian diperiksa sebelum membuka Rekap Produksi.

## 14. Navigasi KBase Produksi

- Kembali ke [Indeks Produksi Borongan](../../KBASE_SETORAN_PRODUKSI.md).
- Buka [Master Produksi](./KBASE_MASTER_PRODUKSI.md) untuk pekerjaan, penugasan, satuan, dan tarif.
- Lanjut ke [Rekap Produksi](./KBASE_REKAP_PRODUKSI.md).
