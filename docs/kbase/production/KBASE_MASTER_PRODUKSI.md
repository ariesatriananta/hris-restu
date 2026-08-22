# Knowledge Base - Master Produksi

> Modul: Produksi Borongan
>
> Bagian: Master Pekerjaan dan Tarif per Site
>
> Audiens: pengelola master Produksi, HR terkait, dan Super Admin
>
> Terakhir diperbarui: 22 Agustus 2026

Panduan ini membantu Anda menyiapkan dasar operasional Produksi Borongan. Setelah selesai, setiap pekerja memiliki pekerjaan yang sesuai dan setiap pekerjaan yang dipakai memiliki tarif aktif pada site serta tanggal yang benar.

## 1. Kapan panduan ini digunakan

Gunakan panduan ini ketika Anda perlu:

- menambah pekerjaan atau satuan hasil produksi;
- menugaskan pekerjaan utama atau tambahan kepada karyawan;
- memperbaiki histori penugasan yang salah;
- membuat dan mengaktifkan tarif per site;
- memeriksa alasan suatu site berstatus **Perlu dilengkapi**.

Master sebaiknya diperiksa sebelum Terminal Setoran mulai digunakan dan setiap kali ada pekerjaan, tarif, kontrak, penempatan, atau mutasi karyawan yang berubah.

## 2. Siapa yang biasa menggunakan

- **Pengelola master Produksi** menyiapkan pekerjaan, satuan, penugasan, dan tarif.
- **Admin Produksi** memeriksa kesiapan operasional site dan melaporkan data yang perlu dilengkapi.
- **HR** memastikan status kerja, jenis karyawan, site, dan Bagian Produksi sudah benar.
- **Super Admin** dapat membantu lintas site sesuai kebutuhan.

Jika Anda hanya memiliki akses lihat, daftar dan kartu kesiapan tetap dapat dibaca, tetapi tombol tambah atau koreksi tidak ditampilkan.

## 3. Hubungan antar data

Urutan yang paling mudah dipahami adalah:

1. **Satuan** menjelaskan cara hasil dihitung, misalnya PCS, KG, PACK, atau BOX.
2. **Pekerjaan** menjelaskan jenis hasil yang dikerjakan, misalnya Linting atau Packing.
3. **Penugasan** menentukan pekerjaan yang boleh disetorkan oleh seorang karyawan pada periode tertentu.
4. **Tarif per Site** menentukan nilai per satuan untuk pekerjaan, site, dan periode tertentu.

Keempatnya harus sesuai. Pekerjaan tanpa satuan, karyawan tanpa penugasan, atau pekerjaan tanpa tarif aktif akan menghambat pencatatan setoran.

## 4. Memeriksa Kesiapan Produksi per site

Buka **Produksi Borongan → Master Pekerjaan**. Bagian atas halaman menampilkan kartu untuk Jepara, Klaten, dan Semarang sesuai akses Anda.

### 4.1 Status Siap

Status **Siap** berarti pemeriksaan dasar pada site tersebut tidak menemukan masalah berikut:

- pekerja yang memenuhi syarat tetapi belum ditugaskan;
- pekerja tanpa satu pekerjaan utama yang jelas;
- pekerjaan yang dipakai tetapi belum mempunyai tarif aktif;
- pekerjaan atau satuan yang sudah tidak aktif tetapi masih dipakai;
- Terminal Produksi yang belum aktif;
- Admin Produksi aktif yang belum tersedia untuk site tersebut.

Status Siap menunjukkan kesiapan master pada saat diperiksa. Status ini bukan jaminan bahwa setiap karyawan pasti dapat menyetor, karena kehadiran dan scan Masuk tetap diperiksa saat transaksi dilakukan.

### 4.2 Status Perlu dilengkapi

Klik pesan masalah pada kartu untuk menuju daftar yang perlu ditangani. Gunakan **Lihat semua pekerja eligible** untuk melihat seluruh pekerja yang memenuhi syarat pada tanggal pemeriksaan.

Arti pesan yang umum:

| Pesan | Arti dan tindakan |
|---|---|
| Pekerja belum memiliki penugasan | Karyawan belum mempunyai pekerjaan aktif. Buka tab **Penugasan**, lalu atur pekerjaan. |
| Pekerja belum memiliki pekerjaan utama | Karyawan mungkin sudah mempunyai pekerjaan tambahan, tetapi belum mempunyai satu pekerjaan utama. Tetapkan salah satu sebagai pekerjaan utama. |
| Lebih dari satu pekerjaan utama | Ada periode pekerjaan utama yang bertumpang tindih. Periksa **Histori Penugasan**, lalu koreksi periodenya. |
| Pekerjaan belum mempunyai tarif aktif | Buka **Tarif per Site**, buat tarif, periksa nilainya, lalu aktifkan. |
| Tarif aktif bertumpang tindih | Ada lebih dari satu tarif aktif untuk pekerjaan dan tanggal yang sama. Hentikan dan periksa histori tarif sebelum operasional dilanjutkan. |
| Pekerjaan atau satuan tidak aktif masih dipakai | Pindahkan penugasan ke master yang aktif atau aktifkan kembali hanya jika memang masih sah digunakan. |
| Terminal Produksi belum aktif | Siapkan perangkat melalui Master Perangkat, lalu lakukan aktivasi dari **Terminal Setoran**. |
| Admin Produksi belum tersedia | Minta pengelola akun menyiapkan Admin Produksi aktif dengan akses ke site tersebut. |

## 5. Mengelola Satuan Produksi

Buka tab **Satuan** pada halaman Master Pekerjaan.

### 5.1 Menambah satuan

1. Klik **Tambah Satuan**.
2. Isi **Kode**, misalnya PCS atau KG.
3. Isi **Nama Satuan** yang mudah dipahami pengguna.
4. Tentukan **Jumlah desimal** dari 0 sampai 4.
5. Klik **Simpan**.

Gunakan 0 desimal untuk hasil yang harus bulat, misalnya batang atau pcs. Gunakan desimal hanya jika hasil memang dapat berupa pecahan, misalnya kilogram.

> Periksa presisi dengan teliti. Setelah satuan dipakai oleh tarif, presisinya tidak boleh diubah sembarangan karena dapat membuat cara membaca kuantitas menjadi tidak konsisten.

## 6. Mengelola Pekerjaan Produksi

Buka tab **Pekerjaan** pada halaman Master Pekerjaan.

### 6.1 Menambah pekerjaan

1. Klik **Tambah Pekerjaan**.
2. Isi **Kode** dan **Nama** pekerjaan.
3. Pilih **Satuan default**.
4. Pilih **Jabatan produksi** jika pekerjaan hanya relevan untuk jabatan tertentu. Pilih tanpa jabatan khusus jika dapat digunakan oleh semua jabatan produksi.
5. Isi **Kategori** dan **Deskripsi** bila diperlukan.
6. Klik **Simpan**.

Gunakan nama yang pendek dan sama dengan istilah yang dipakai di area produksi. Hindari membuat dua pekerjaan berbeda untuk kegiatan yang sebenarnya sama.

### 6.2 Sebelum pekerjaan digunakan

Pastikan pekerjaan:

- berstatus aktif;
- memakai satuan yang benar dan aktif;
- sudah memiliki tarif aktif pada site terkait;
- sudah diberikan kepada pekerja yang memang menjalankannya.

Pekerjaan yang masih digunakan pada penugasan aktif atau mendatang tidak dapat dinonaktifkan begitu saja. Rapikan penugasannya lebih dahulu.

## 7. Mengatur Penugasan Pekerjaan Karyawan

Buka tab **Penugasan**. Di dalamnya tersedia dua tampilan:

- **Kesiapan Pekerja** untuk menemukan pekerja yang belum siap;
- **Histori Penugasan** untuk melihat perjalanan pekerjaan setiap karyawan.

### 7.1 Syarat karyawan dapat ditugaskan

Karyawan hanya muncul sebagai pilihan jika pada tanggal yang dipilih:

- status kerjanya mengizinkan Produksi;
- jenis karyawannya memakai perhitungan berdasarkan hasil kerja;
- site penempatan sama dengan site penugasan;
- periode penugasan masih berada dalam satu periode kerja yang sah.

Jika nama tidak muncul, jangan membuat data pengganti. Periksa status kerja, kontrak, jenis karyawan, site, dan histori penempatannya bersama HR.

### 7.2 Membuat penugasan

1. Klik **Atur Pekerjaan**.
2. Pilih **Site**.
3. Pilih **Tanggal mulai**.
4. Pilih **Karyawan**.
5. Pilih **Pekerjaan**.
6. Tentukan jenis penugasan:
   - **Pekerjaan utama** menjadi pilihan awal di Terminal Setoran;
   - **Pekerjaan tambahan** tetap dapat dipilih, tetapi tidak menjadi pilihan awal.
7. Isi **Tanggal selesai** jika penugasan hanya berlaku sementara. Kosongkan jika berlaku seterusnya.
8. Periksa kembali, lalu klik **Simpan Penugasan**.

Satu karyawan boleh memiliki beberapa pekerjaan aktif, tetapi hanya boleh memiliki satu pekerjaan utama pada tanggal yang sama.

### 7.3 Mengakhiri penugasan

Gunakan **Akhiri Penugasan** jika pekerjaan memang selesai sejak tanggal tertentu.

1. Buka **Histori Penugasan**.
2. Cari karyawan dan pekerjaan.
3. Pilih tindakan **Akhiri Penugasan**.
4. Isi tanggal selesai dan alasan.
5. Simpan setelah periode diperiksa.

Tanggal selesai tidak boleh lebih awal dari tanggal mulai. Penutupan juga ditolak jika masih ada transaksi tercatat setelah tanggal selesai yang dipilih.

### 7.4 Mengoreksi histori penugasan

Gunakan **Koreksi Histori Penugasan** jika pekerjaan, periode, atau jenis penugasan sejak awal memang salah.

1. Buka penugasan dari **Histori Penugasan**.
2. Pilih tindakan koreksi.
3. Atur pekerjaan, periode, dan status utama yang benar.
4. Klik **Preview perubahan**.
5. Periksa kondisi sebelum dan sesudah serta jumlah transaksi yang terdampak.
6. Isi alasan koreksi yang jelas.
7. Terapkan koreksi hanya jika hasil preview sudah benar.

Koreksi dapat ditolak jika:

- periode baru bertumpang tindih dengan penugasan lain;
- hasil koreksi membuat lebih dari satu pekerjaan utama;
- periode tidak sesuai dengan histori kerja karyawan;
- pekerjaan lama sudah dipakai transaksi dan hendak diganti;
- ada transaksi di luar periode baru;
- periode sudah masuk atau sedang diproses oleh Payroll.

Jika pekerjaan yang salah sudah dipakai transaksi, koreksi atau batalkan transaksi tersebut terlebih dahulu. Jangan mengubah histori secara paksa.

## 8. Mengelola Tarif Produksi per Site

Buka **Produksi Borongan → Tarif per Site**.

Tarif ditentukan berdasarkan tiga hal: site, pekerjaan, dan tanggal berlaku. Tarif pekerjaan yang sama dapat berbeda antara Jepara, Klaten, dan Semarang.

### 8.1 Arti status tarif

| Status | Arti |
|---|---|
| **Draft** | Tarif baru disimpan dan belum dipakai untuk menghitung setoran. |
| **Aktif** | Tarif digunakan untuk setoran yang tanggalnya masuk dalam periode tarif. |
| **Tidak aktif** | Tarif tidak lagi dipakai untuk setoran baru, tetapi historinya tetap tersimpan. |

### 8.2 Membuat tarif baru

1. Klik **Buat Draft Tarif**.
2. Pilih **Site** dan **Pekerjaan**.
3. Isi tanggal mulai dan tanggal selesai bila ada.
4. Isi nominal tarif sesuai satuan pekerjaan.
5. Isi nomor referensi dan catatan agar dasar penetapan tarif mudah ditemukan.
6. Simpan sebagai Draft.
7. Periksa kembali site, pekerjaan, satuan, periode, dan nominal.
8. Klik **Aktifkan** jika semuanya benar.

Tarif Draft belum memengaruhi transaksi. Jangan lupa mengaktifkannya sebelum tanggal operasional dimulai.

### 8.3 Mengganti tarif aktif

Buat Draft baru jika tarif berubah mulai tanggal tertentu. Saat tarif baru diaktifkan untuk menggantikan tarif lama, periode tarif lama ditutup pada satu hari sebelum tarif baru berlaku.

Contoh: tarif baru mulai 10 Agustus. Tarif lama akan berakhir pada 9 Agustus. Transaksi tanggal 10 Agustus dan setelahnya memakai tarif baru.

Aktivasi dapat ditolak jika periode tarif bertumpang tindih atau tanggal yang dipilih sudah memiliki transaksi. Perbaiki periodenya; jangan mengubah nilai transaksi lama.

### 8.4 Koreksi atau pembatalan tarif aktif

Tindakan **Koreksi Tarif Aktif** dan **Batalkan Tarif** hanya tersedia untuk tarif aktif yang belum pernah dipakai transaksi.

Sebelum menerapkan:

1. buka tindakan yang sesuai;
2. periksa preview perubahan;
3. isi alasan yang jelas;
4. pastikan periode tidak bertumpang tindih;
5. terapkan setelah seluruh informasi benar.

Jika tarif sudah pernah dipakai, nilai pada transaksi lama tetap dipertahankan. Buat tarif baru untuk periode berikutnya. Selisih terhadap proses Payroll ditangani melalui prosedur Payroll, bukan dengan mengubah transaksi lama.

## 9. Pemeriksaan sebelum operasional

- [ ] Pekerjaan dan satuan yang digunakan berstatus aktif.
- [ ] Presisi satuan sesuai cara hasil dihitung di lapangan.
- [ ] Setiap pekerja memiliki penugasan pada periode yang benar.
- [ ] Setiap pekerja memiliki tepat satu pekerjaan utama.
- [ ] Setiap pekerjaan yang digunakan memiliki satu tarif aktif per site dan tanggal.
- [ ] Tidak ada tarif atau penugasan yang bertumpang tindih.
- [ ] Terminal Produksi sudah aktif pada site.
- [ ] Admin Produksi aktif tersedia pada site.
- [ ] Kartu kesiapan site menampilkan **Siap**.

## 10. Solusi masalah umum

| Kondisi | Yang perlu dilakukan |
|---|---|
| Karyawan tidak muncul saat mengatur pekerjaan | Periksa tanggal, site, status kerja, kontrak, jenis karyawan, dan histori penempatan. |
| Penugasan bertumpang tindih | Buka Histori Penugasan dan rapikan tanggal mulai/selesai. |
| Tidak dapat membuat pekerjaan utama | Pastikan tidak ada pekerjaan utama lain pada periode yang sama. |
| Penugasan tidak dapat diakhiri | Periksa transaksi yang tercatat setelah tanggal selesai. |
| Koreksi penugasan ditolak | Periksa dampak transaksi dan status proses Payroll pada periode tersebut. |
| Tarif tidak dapat diaktifkan | Periksa tarif aktif lain pada site, pekerjaan, dan periode yang sama. |
| Tarif aktif tidak dapat dikoreksi | Tarif sudah dipakai transaksi; buat tarif baru untuk periode berikutnya. |
| Kartu tetap Perlu dilengkapi | Buka setiap pesan pada kartu dan selesaikan masalah satu per satu, lalu muat ulang halaman. |
| Tombol tambah atau koreksi tidak terlihat | Akun Anda hanya memiliki akses lihat. Hubungi pengelola hak akses. |

## 11. Navigasi KBase Produksi

- Kembali ke [Indeks Produksi Borongan](../../KBASE_SETORAN_PRODUKSI.md).
- Lanjut ke [Transaksi Setoran Produksi](./KBASE_TRANSAKSI_SETORAN_PRODUKSI.md).
- Lihat [Rekap Produksi](./KBASE_REKAP_PRODUKSI.md).
