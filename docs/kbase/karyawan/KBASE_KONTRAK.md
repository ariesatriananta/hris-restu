# Knowledge Base - Kontrak Karyawan

> Modul: Karyawan  
> Domain: Kontrak Karyawan  
> Audiens: HR, administrator site, Super Admin, dan tim support HRIS  
> Terakhir diverifikasi: 5 Agustus 2026  
> Status: aktif, sesuai perilaku aplikasi saat dokumen ini dibuat

Dokumen ini menjelaskan penggunaan dan aturan bisnis kontrak karyawan pada HRIS PT Restu Sejati Inti Abadi. Fokusnya adalah apa yang perlu dipahami pengguna: cara membuat kontrak, validasi periode, status, tindakan lifecycle, dokumen kontrak, pencetakan template, penjadwalan, rekonsiliasi, serta penanganan kasus yang sering terjadi.

Dokumen ini diperbarui hanya ketika Bos meminta pembaruan KBase. Jika isi dokumen berbeda dengan perilaku aplikasi, schema dan kode aplikasi yang sedang berjalan tetap menjadi sumber kebenaran teknis.

## 1. Tujuan domain kontrak

Domain kontrak dipakai untuk:

- mencatat hubungan kontrak setiap karyawan;
- menghasilkan nomor dan urutan kontrak secara otomatis;
- menjaga agar periode kontrak seorang karyawan tidak bertumpang tindih;
- mengendalikan perubahan status kerja karyawan melalui lifecycle kontrak;
- menjadwalkan kontrak yang mulai pada masa depan;
- mencetak template kontrak produksi yang sudah terisi;
- menyimpan scan kontrak asli yang sudah ditandatangani;
- mengingatkan HR atas kontrak yang akan berakhir atau karyawan yang belum memiliki kontrak;
- menyimpan histori lifecycle dan audit trail agar keputusan HR dapat ditelusuri.

Prinsip pentingnya adalah kontrak tidak hanya berfungsi sebagai arsip dokumen. Kontrak juga menjadi salah satu dasar status kerja karyawan.

## 2. Istilah yang perlu dibedakan

### 2.1 Jenis karyawan

Jenis karyawan menjelaskan kelompok atau basis hubungan kerja yang digunakan perusahaan. Nilai operasional saat ini:

- `BORONGAN`;
- `HARIAN`;
- `BULANAN`;
- `TRAINING`.

Jenis karyawan bukan status kontrak dan bukan jenis kontrak.

### 2.2 Jenis kontrak

Jenis kontrak menjelaskan bentuk perjanjian kerja. Jenis yang dapat dipilih pada pembuatan kontrak baru saat ini:

| Kode | Nama | Tanggal berakhir |
|---|---|---|
| `TRAINING` | Training | Wajib |
| `PKWT` | Perjanjian Kerja Waktu Tertentu | Wajib |
| `PKWTT` | Perjanjian Kerja Waktu Tidak Tertentu | Opsional |

Jenis kontrak tidak lagi ditentukan otomatis dari jenis karyawan. HR dapat memilih `TRAINING`, `PKWT`, atau `PKWTT` sesuai kebijakan bisnis yang berlaku.

Contoh kombinasi yang dimungkinkan sistem:

- karyawan `TRAINING` dengan kontrak `TRAINING`;
- karyawan `BORONGAN` dengan kontrak `PKWT`;
- karyawan `HARIAN` dengan kontrak `PKWT` atau `PKWTT`;
- karyawan `BULANAN` dengan kontrak `PKWT` atau `PKWTT`.

Master masih dapat menyimpan tipe legacy seperti `PROJECT`, `RETAIN`, dan `OTHER`. Data lama dengan tipe tersebut tetap dapat dibaca, tetapi tipe tersebut tidak tersedia untuk pembuatan atau perubahan kontrak melalui UI saat ini.

### 2.3 Status karyawan

Status karyawan menjelaskan apakah orang tersebut dapat bekerja di sistem, misalnya `ACTIVE`, `INACTIVE`, atau `RESIGNED`. Status ini berbeda dari status kontrak.

Contoh:

- kontrak dapat berstatus `DRAFT` ketika karyawan masih `INACTIVE`;
- aktivasi kontrak dapat mengubah karyawan menjadi `ACTIVE`;
- kontrak dapat menjadi `EXPIRED` sementara status karyawan masih `ACTIVE` dan perlu ditindaklanjuti HR.

### 2.4 Status kontrak

Status kontrak menjelaskan posisi kontrak dalam workflow. Nilai resminya:

- `DRAFT`;
- `SCHEDULED`;
- `ACTIVE`;
- `EXPIRED`;
- `TERMINATED`;
- `CANCELLED`.

Label `MISSING` atau **Belum ada kontrak** hanya merupakan kondisi tampilan untuk karyawan yang perlu dibuatkan kontrak. Nilai tersebut bukan record atau status yang disimpan pada tabel kontrak.

## 3. Halaman dan akses pengguna

### 3.1 Halaman PKWT & Dokumen

Menu **Karyawan -> PKWT & Dokumen** membuka halaman `/karyawan/pkwt-dokumen`. Domain kontrak menggunakan dua tab:

- **PKWT & Kontrak** untuk daftar kontrak, KPI, filter, tindakan kontrak, dan alert konflik;
- **Status Kerja Terjadwal** untuk jadwal terminasi atau resign di masa depan.

### 3.2 Tab PKWT pada Detail Karyawan

Detail karyawan memiliki tab **PKWT** yang menampilkan seluruh kontrak milik satu karyawan. Daftar ini diurutkan berdasarkan **Kontrak ke** secara descending, sehingga kontrak dengan urutan terbesar tampil paling atas.

Setiap item menampilkan:

- nomor kontrak;
- badge status;
- jenis kontrak;
- tanggal mulai dan tanggal berakhir;
- urutan kontrak;
- aksi Detail;
- aksi Edit jika status kontrak masih mengizinkan perubahan.

Aksi lifecycle seperti terminasi, resign, pembatalan, dan penjadwalan ditempatkan di drawer Detail kontrak agar keputusan penting tidak tersebar di banyak tempat.

### 3.3 Hak akses dan scope site

- Membaca daftar dan detail membutuhkan hak `employees.view`.
- Membuat, mengubah, menjalankan lifecycle, membuat snapshot cetak, dan mengelola jadwal membutuhkan hak `employees.manage`.
- Pengguna biasa hanya dapat bekerja pada site yang diberikan kepadanya.
- Super Admin dapat mengakses seluruh site.
- Rekonsiliasi manual hanya dapat dijalankan oleh Super Admin.

Sistem selalu memeriksa scope site kembali di backend. Mengetik URL secara manual tidak dapat digunakan untuk melewati akses site.

## 4. Informasi yang disimpan pada kontrak

Satu kontrak menyimpan informasi utama berikut:

| Informasi | Penjelasan |
|---|---|
| Karyawan | Pemilik kontrak. Tidak dapat diganti setelah record dibuat. |
| Nomor kontrak | Dibuat otomatis oleh server. |
| Jenis kontrak | `TRAINING`, `PKWT`, atau `PKWTT` untuk alur baru. |
| Kontrak ke | Nomor urut kontrak milik karyawan. Dibuat otomatis. |
| Tanggal mulai | Awal periode kontrak. |
| Tanggal berakhir | Akhir periode; wajib untuk Training dan PKWT. |
| Tanggal tanda tangan | Metadata tanggal tanda tangan jika tersedia pada data. |
| Status | Posisi kontrak dalam lifecycle. |
| Tanggal terminasi | Tanggal efektif ketika kontrak dihentikan. |
| Alasan terminasi | Alasan terminasi atau resign. |
| Snapshot jabatan | Nama jabatan saat kontrak dibuat. |
| Snapshot site | Nama site saat kontrak dibuat. |
| Catatan | Catatan internal HR. |
| Scan kontrak asli | File PDF/JPG/PNG yang sudah ditandatangani. |
| Snapshot cetak | Salinan data template dan tarif yang disimpan di `terms_json`. |

Nomor internal database tidak dipakai sebagai identifier publik. Halaman dan komunikasi frontend menggunakan UID kontrak.

Snapshot site dan jabatan pada record kontrak diambil saat kontrak dibuat untuk menjaga konteks historis. Perubahan penempatan karyawan setelahnya tidak mengubah snapshot tersebut. Khusus pencetakan template, sistem mencari histori site dan jabatan yang berlaku tepat pada tanggal mulai kontrak.

## 5. Nomor dan urutan kontrak

Nomor kontrak dibuat otomatis dengan pola:

`{JENIS-KONTRAK}-{EMPLOYEE-ID}-{URUTAN-2-DIGIT}`

Contoh:

`PKWT-PKDS-2608-01001-01`

Artinya:

- jenis kontrak: `PKWT`;
- Employee ID: `PKDS-2608-01001`;
- kontrak ke: `01`.

Aturannya:

- HR tidak mengisi nomor kontrak manual;
- urutan dihitung dari urutan terbesar milik karyawan lalu ditambah satu;
- kontrak yang dibatalkan tetap menjadi bagian histori urutan;
- nomor yang pernah dipakai tidak digunakan ulang;
- saat jenis kontrak pada `DRAFT` atau `SCHEDULED` diubah, prefix nomor kontrak ikut disesuaikan, tetapi urutannya tetap;
- nomor kontrak `ACTIVE` tidak berubah.

## 6. Membuat Single Kontrak

Gunakan **Tambah kontrak -> Single Kontrak** untuk membuat satu kontrak.

### 6.1 Langkah penggunaan

1. Pilih karyawan.
2. Pilih jenis kontrak.
3. Isi tanggal mulai.
4. Pilih periode bantu atau isi tanggal akhir secara custom.
5. Periksa peringatan overlap.
6. Isi catatan bila diperlukan.
7. Unggah scan kontrak bila sudah tersedia. Pada proses awal biasanya file belum tersedia dan boleh dikosongkan.
8. Klik **Simpan kontrak**.

Kontrak baru selalu disimpan sebagai `DRAFT`. Menyimpan form tidak langsung mengaktifkan kontrak atau karyawan.

### 6.2 Field periode kontrak

Field **Periode kontrak** merupakan field bantu UI, bukan kolom baru pada database. Pilihannya:

- 1 bulan;
- 3 bulan;
- 12 bulan;
- Custom.

Untuk pilihan 1, 3, atau 12 bulan, tanggal akhir dihitung dengan rumus:

`tanggal mulai + N bulan - 1 hari`

Contoh:

| Tanggal mulai | Pilihan | Tanggal akhir |
|---|---:|---|
| 1 Agustus 2026 | 1 bulan | 31 Agustus 2026 |
| 1 Agustus 2026 | 3 bulan | 31 Oktober 2026 |
| 1 Agustus 2026 | 12 bulan | 31 Juli 2027 |

Memilih **Custom** memungkinkan HR menentukan tanggal akhir secara manual. Mengubah tanggal akhir manual juga membuat pilihan periode menjadi Custom.

## 7. Membuat Multiple Kontrak

Gunakan **Tambah kontrak -> Multiple Kontrak** untuk membuat beberapa kontrak dalam satu proses.

### 7.1 Batas dan perilaku

- maksimal 25 karyawan dalam satu batch;
- satu karyawan tidak boleh muncul dua kali dalam batch yang sama;
- jenis kontrak dipilih per baris dan tidak ditentukan otomatis dari jenis karyawan;
- nilai awal jenis kontrak pada baris baru adalah `PKWT`, sehingga HR tetap wajib memeriksanya;
- tanggal mulai dan akhir divalidasi per baris;
- overlap diperiksa terhadap kontrak milik masing-masing karyawan;
- catatan bersifat opsional;
- upload scan kontrak tidak tersedia pada create multiple;
- seluruh hasil disimpan sebagai `DRAFT`;
- nomor dan urutan dibuat server untuk setiap karyawan.

### 7.2 Transaksi all-or-nothing

Create multiple bersifat atomik:

- jika semua baris valid, semua kontrak disimpan;
- jika satu baris gagal validasi backend, seluruh batch dibatalkan;
- tidak ada sebagian kontrak yang tertinggal di database.

Sebelum menyimpan, halaman menampilkan review seluruh baris. Tombol simpan tidak aktif selama masih ada error frontend.

### 7.3 Create multiple dari pilihan tabel

Pada tabel kontrak, HR dapat memilih beberapa row lalu memakai **Create Multiple Kontrak**. Sistem mengambil karyawan unik dari row terpilih dan membuka halaman multiple dengan data tersebut.

Validasi awalnya:

- minimal ada satu karyawan;
- maksimal 25 karyawan unik;
- duplikasi karyawan dari beberapa row kontrak akan disatukan.

Pemilihan ini hanya membantu mengisi daftar karyawan. Seluruh aturan tanggal, jenis kontrak, overlap, scope site, dan transaksi tetap diperiksa lagi.

## 8. Validasi pembuatan dan perubahan kontrak

Backend adalah sumber validasi final. Validasi frontend berfungsi memberi peringatan lebih cepat, tetapi tidak menggantikan pemeriksaan backend.

### 8.1 Validasi dasar

- karyawan wajib tersedia;
- jenis kontrak harus aktif dan termasuk jenis yang didukung UI saat ini;
- tanggal mulai wajib diisi;
- tanggal mulai tidak boleh sebelum tanggal bergabung karyawan;
- tanggal akhir tidak boleh sebelum tanggal mulai;
- tanggal akhir wajib untuk `TRAINING` dan `PKWT`;
- tanggal akhir boleh kosong untuk `PKWTT`;
- pengguna harus memiliki akses ke site karyawan;
- periode tidak boleh bertumpang tindih dengan kontrak lain.

### 8.2 Aturan overlap

Semua kontrak milik karyawan dihitung sebagai konflik kecuali kontrak berstatus `CANCELLED`.

Artinya, overlap diperiksa terhadap:

- `DRAFT`;
- `SCHEDULED`;
- `ACTIVE`;
- `EXPIRED`;
- `TERMINATED`.

Untuk kontrak `TERMINATED`, batas akhir efektif memakai `terminated_at`. Jika tanggal terminasi tidak tersedia, sistem memakai tanggal akhir kontrak. Dengan demikian, sisa periode setelah tanggal terminasi dapat dipakai untuk kontrak baru.

Perbandingan tanggal bersifat inklusif. Contoh:

- kontrak lama berakhir atau diterminasi pada 5 Agustus;
- kontrak baru mulai 5 Agustus;
- hasil: overlap, karena tanggal 5 Agustus masih menjadi bagian periode kontrak lama;
- tanggal mulai paling awal yang aman adalah 6 Agustus.

Kontrak tanpa tanggal akhir dianggap terbuka sampai masa depan. Kontrak tersebut akan menghalangi kontrak baru sampai diselesaikan sesuai prosedur.

`CANCELLED` tidak dihitung sebagai konflik karena kontrak tersebut dinyatakan tidak berlaku.

### 8.3 Contoh overlap

| Kontrak lama | Kontrak baru | Hasil |
|---|---|---|
| 1 Jan - 31 Mar, `EXPIRED` | Mulai 1 Apr | Diizinkan |
| 1 Jan - 31 Mar, `EXPIRED` | Mulai 31 Mar | Ditolak |
| 1 Jan - 31 Des, terminasi 5 Agu | Mulai 6 Agu | Diizinkan |
| 1 Jan - 31 Des, terminasi 5 Agu | Mulai 5 Agu | Ditolak |
| 1 Jan - tanpa akhir, `ACTIVE` | Mulai tanggal apa pun setelahnya | Ditolak |
| Kontrak `CANCELLED` pada periode yang sama | Periode yang sama | Diizinkan |

## 9. Mengubah kontrak

### 9.1 DRAFT dan SCHEDULED

Kontrak `DRAFT` dan `SCHEDULED` dapat diubah selama seluruh validasi tetap terpenuhi. HR dapat memperbaiki:

- jenis kontrak;
- tanggal mulai;
- tanggal akhir;
- catatan;
- scan kontrak asli.

Perubahan jenis kontrak akan menghitung ulang prefix nomor kontrak tanpa mengganti urutan kontrak.

### 9.2 ACTIVE

Kontrak `ACTIVE` tidak dapat mengubah:

- jenis kontrak;
- nomor kontrak;
- urutan kontrak;
- tanggal mulai;
- tanggal berakhir.

Form edit mengunci periode kontrak aktif. Ini mencegah histori kerja berubah diam-diam setelah kontrak dipakai.

Metadata yang masih dapat diperbarui adalah catatan dan lampiran kontrak. Jika periode kontrak aktif ternyata salah input, jangan mengubah tanggal secara langsung. Gunakan prosedur pada bagian **Salah aktivasi atau salah periode**.

### 9.3 Status final

Kontrak `EXPIRED`, `TERMINATED`, dan `CANCELLED` bersifat final/read-only serta tidak dapat diedit melalui alur normal.

Kontrak tidak dihapus dari UI. Pembatalan dan terminasi dipakai agar jejak historinya tetap tersedia.

## 10. Status dan lifecycle kontrak

### 10.1 Ringkasan status

| Status | Arti bagi HR | Aksi utama |
|---|---|---|
| `DRAFT` | Kontrak sudah dicatat tetapi belum berlaku. | Edit, Jadwalkan/Aktifkan, Batalkan. |
| `SCHEDULED` | Kontrak menunggu tanggal mulai. | Aktifkan saat waktunya tiba, Batalkan. |
| `ACTIVE` | Kontrak sedang berlaku. | Terminasi, Catat resign, Jadwalkan status kerja, atau Batalkan aktivasi bila memenuhi syarat ketat. |
| `EXPIRED` | Tanggal akhir kontrak sudah lewat. | Arsip; untuk kontrak terakhir milik karyawan Aktif tersedia penutupan status atau perpanjangan. |
| `TERMINATED` | Kontrak dihentikan sebelum/ketika periodenya berjalan. | Arsip final. |
| `CANCELLED` | Kontrak dinyatakan tidak berlaku. | Arsip final dan tidak dihitung dalam overlap. |

### 10.2 Diagram lifecycle utama

```text
DRAFT --jadwalkan--> SCHEDULED --tanggal mulai/aktifkan--> ACTIVE
  |                       |                                  |
  +----batalkan-----------+------------------------------> CANCELLED
                                                             ^
ACTIVE --batalkan aktivasi, jika belum dipakai operasional----+
ACTIVE --tanggal akhir lewat-------------------------------> EXPIRED
ACTIVE --terminasi/resign----------------------------------> TERMINATED
```

Tidak semua perpindahan dapat dilakukan bebas. Sistem memeriksa status awal, tanggal, konflik kontrak, status karyawan, jadwal terbuka, dan scope site.

## 11. Aksi lifecycle dan dampaknya

### 11.1 Jadwalkan kontrak

Perubahan: `DRAFT -> SCHEDULED`.

Syarat:

- kontrak masih `DRAFT`;
- tanggal mulai berada setelah tanggal bisnis hari ini.

Dampak:

- status karyawan belum berubah;
- kontrak menunggu rekonsiliasi pada tanggal mulai;
- kontrak masih dapat dibatalkan sebelum aktif.

### 11.2 Aktifkan kontrak

Perubahan: `DRAFT/SCHEDULED -> ACTIVE`.

Syarat utama:

- tanggal mulai sudah tiba atau sudah lewat;
- tidak ada kontrak `ACTIVE` lain yang masih berlaku pada hari aktivasi;
- karyawan bukan berstatus `RESIGNED`;
- histori kerja dapat diselaraskan pada tanggal efektif.

Dampak:

- kontrak menjadi `ACTIVE`;
- karyawan menjadi `ACTIVE`;
- histori status kerja dan lifecycle kontrak dicatat;
- audit trail dibuat.

Jika periode kontrak sudah lewat seluruhnya, jangan aktifkan kontrak tersebut. Perbaiki kontrak ketika masih `DRAFT`, atau batalkan dan buat kontrak yang benar.

Kontrak `SCHEDULED` yang tanggal akhirnya sudah lewat tidak diaktifkan secara retroaktif oleh rekonsiliasi. Kontrak tersebut harus ditinjau HR karena periode yang direncanakan sudah tidak berlaku.

### 11.3 Batalkan kontrak sebelum aktif

Perubahan: `DRAFT/SCHEDULED -> CANCELLED`.

Dampak:

- kontrak menjadi arsip final;
- status karyawan tidak berubah;
- kontrak tidak lagi dihitung sebagai konflik overlap;
- nomor dan urutan kontrak tetap tersimpan dan tidak dipakai ulang.

Gunakan aksi ini untuk draft yang salah, kontrak yang tidak jadi digunakan, atau jadwal kontrak yang dibatalkan sebelum berlaku.

### 11.4 Terminasi kontrak

Perubahan: `ACTIVE -> TERMINATED`.

Syarat:

- kontrak sedang `ACTIVE`;
- alasan wajib diisi;
- tanggal efektif tidak boleh sebelum tanggal mulai;
- tanggal efektif tidak boleh setelah hari ini;
- tidak ada kontrak aktif lain pada tanggal efektif;
- tidak ada Status Kerja Terjadwal berstatus `SCHEDULED` atau `FAILED` yang masih terbuka.

Dampak:

- `terminated_at` diisi dengan tanggal efektif;
- alasan disimpan;
- karyawan menjadi `INACTIVE`;
- histori status, lifecycle, dan audit dicatat;
- kontrak baru dapat dimulai paling cepat satu hari setelah tanggal terminasi.

### 11.5 Catat resign

Perubahan kontrak: `ACTIVE -> TERMINATED`.

Perubahan karyawan: menjadi `RESIGNED`.

Syarat tanggal dan jadwal sama dengan terminasi. Alasan resign wajib diisi. Tanggal dan alasan resign juga disimpan pada data karyawan.

Gunakan **Catat resign** hanya untuk pengunduran diri karyawan. Untuk penghentian oleh perusahaan gunakan **Terminasi**.

### 11.6 Batalkan aktivasi

Perubahan: `ACTIVE -> CANCELLED`.

Fitur ini khusus untuk membatalkan aktivasi yang salah dan belum menghasilkan dampak operasional. Ini bukan pengganti terminasi.

Syarat:

- kontrak berstatus `ACTIVE`;
- status karyawan masih konsisten sebagai `ACTIVE`;
- tersedia event aktivasi yang dapat ditelusuri;
- alasan minimal lima karakter;
- kontrak belum mempunyai tanggal tanda tangan atau scan kontrak asli;
- belum ada attendance sejak aktivasi;
- belum ada transaksi produksi sejak aktivasi;
- belum masuk proses payroll sejak aktivasi;
- belum ada histori kerja yang lebih baru;
- belum ada lifecycle lanjutan;
- tidak ada Status Kerja Terjadwal `SCHEDULED` atau `FAILED`.

Jika salah satu bukti penggunaan tersebut ditemukan, sistem menolak pembatalan aktivasi. Prosedur yang benar adalah **Terminasi kontrak lama lalu buat kontrak baru**.

Dampak pembatalan aktivasi yang berhasil:

- kontrak menjadi `CANCELLED`;
- status karyawan kembali `INACTIVE` jika tidak ada kontrak aktif valid lain;
- histori status kerja dikoreksi melalui lifecycle yang tercatat;
- alasan, kondisi sebelum/sesudah, pengguna, waktu, IP, dan user agent dicatat pada audit log.

### 11.7 Kontrak berakhir otomatis

Perubahan: `ACTIVE -> EXPIRED` ketika tanggal akhir sudah lewat.

Proses ini dijalankan oleh rekonsiliasi. Kontrak mendapat event lifecycle dan audit sistem.

Perhatian: proses expiry tidak otomatis memaksa karyawan menjadi `INACTIVE`. Jika karyawan masih `ACTIVE` tetapi tidak lagi mempunyai kontrak aktif berlaku, sistem menampilkannya sebagai konflik agar HR menentukan tindak lanjut yang benar.

### 11.8 Menutup status setelah kontrak EXPIRED

Untuk kontrak `EXPIRED` terakhir milik karyawan yang masih `ACTIVE`, tersedia:

- **Terminasi karyawan** -> status karyawan menjadi `INACTIVE`;
- **Catat resign karyawan** -> status karyawan menjadi `RESIGNED`.

Kontrak tetap `EXPIRED`, bukan diubah menjadi `TERMINATED`.

Syarat:

- kontrak adalah kontrak terakhir karyawan;
- karyawan masih `ACTIVE`;
- alasan wajib diisi;
- tanggal efektif berada antara tanggal akhir kontrak dan hari ini;
- tidak ada kontrak aktif lain pada tanggal efektif;
- tidak ada Status Kerja Terjadwal terbuka.

## 12. Salah aktivasi atau salah periode

Gunakan keputusan berikut:

| Kondisi | Tindakan |
|---|---|
| Kontrak masih `DRAFT` atau `SCHEDULED` | Edit tanggal/jenis kontrak, atau Batalkan bila tidak jadi digunakan. |
| Kontrak `ACTIVE`, salah input, dan benar-benar belum dipakai | Gunakan **Batalkan aktivasi**, lalu buat kontrak baru yang benar. |
| Kontrak `ACTIVE` sudah memiliki scan/tanda tangan atau data operasional | Gunakan **Terminasi**, lalu buat kontrak baru mulai hari berikutnya. |
| Kontrak sudah `EXPIRED`, `TERMINATED`, atau `CANCELLED` | Jangan ubah arsip. Buat kontrak baru bila diperlukan. |

Tidak ada fitur **Koreksi Periode Kontrak Aktif**. Keputusan ini sengaja dibuat agar periode yang sudah menjadi dasar operasional tidak berubah tanpa jejak lifecycle yang benar.

## 13. Perpanjangan kontrak

Perpanjangan yang menghasilkan dokumen atau nomor kontrak baru dilakukan dengan membuat kontrak baru.

Contoh:

- kontrak lama berakhir 31 Agustus;
- kontrak baru dimulai 1 September;
- simpan sebagai `DRAFT`;
- jadwalkan karena tanggal mulai masih di masa depan;
- rekonsiliasi akan mengaktifkannya saat tanggal mulai tiba.

Tabel menyediakan aksi **Perpanjang kontrak** pada kontrak terakhir yang:

- berstatus `EXPIRED`; atau
- masih `ACTIVE` dan berakhir dalam tujuh hari.

Aksi tersebut membuka form Single Kontrak dengan karyawan sudah terpilih. HR tetap wajib memeriksa jenis dan periodenya.

Kontrak lama dan baru tidak boleh memakai tanggal yang sama pada batas pergantian karena validasi overlap bersifat inklusif.

## 14. Status Kerja Terjadwal

Status Kerja Terjadwal digunakan ketika terminasi atau resign baru boleh berlaku pada tanggal mendatang.

### 14.1 Jenis tindakan

- `TERMINATE`: mengubah karyawan menjadi `INACTIVE` saat diterapkan;
- `RESIGN`: mengubah karyawan menjadi `RESIGNED` saat diterapkan.

### 14.2 Status jadwal

| Status | Makna |
|---|---|
| `SCHEDULED` | Menunggu tanggal efektif. |
| `APPLIED` | Berhasil diterapkan. |
| `FAILED` | Gagal dan perlu diperiksa/diperbaiki HR. |
| `CANCELLED` | Dibatalkan sebelum diterapkan. |

### 14.3 Syarat membuat jadwal

- dibuat dari kontrak `ACTIVE`, atau kontrak `EXPIRED` terakhir milik karyawan yang masih `ACTIVE`;
- kontrak harus merupakan kontrak terakhir karyawan;
- tanggal efektif harus setelah hari ini;
- alasan wajib diisi;
- satu karyawan hanya boleh mempunyai satu jadwal status terbuka (`SCHEDULED` atau `FAILED`);
- karyawan tidak boleh mempunyai Mutasi Terjadwal yang masih terbuka.

### 14.4 Mengubah dan membatalkan jadwal

Jadwal dengan status `SCHEDULED` atau `FAILED` dapat:

- diubah tanggal, tindakan, dan alasannya;
- dijadwalkan ulang;
- dibatalkan.

Jadwal `APPLIED` dan `CANCELLED` tidak dapat diubah lagi.

### 14.5 Ketika jadwal diterapkan

Pada tanggal efektif, sistem:

1. memeriksa karyawan masih `ACTIVE`;
2. menghentikan seluruh kontrak karyawan yang masih `ACTIVE`;
3. mengisi tanggal dan alasan terminasi;
4. mengubah status karyawan menjadi `INACTIVE` atau `RESIGNED`;
5. mencatat lifecycle dan audit;
6. mengubah jadwal menjadi `APPLIED`.

Kontrak yang sudah `EXPIRED` tetap `EXPIRED`.

Jika kondisi tidak lagi valid, jadwal menjadi `FAILED`. Sistem tidak menerapkan perubahan sebagian dan HR harus meninjau pesan kegagalannya.

## 15. Daftar kontrak, filter, dan KPI

### 15.1 Data tabel

Tabel kontrak menampilkan informasi utama:

- nomor kontrak yang dapat diklik untuk membuka Detail;
- nama karyawan dan site;
- jenis karyawan dan jabatan;
- modul dan bagian produksi;
- jenis kontrak dan urutan;
- periode kontrak;
- badge status;
- Dokumen Kontrak;
- aksi sesuai kondisi row.

Pencarian, filter, pagination, dan jumlah baris tersimpan pada URL sehingga konteks daftar dapat dipertahankan ketika pengguna membuka detail lalu kembali.

Default jumlah baris adalah 50 dengan pilihan 50, 100, 200, 300, dan 500.

### 15.2 Filter

Filter yang tersedia:

- Site;
- Status;
- Status kontrak aktif;
- Modul Produksi;
- Bagian Produksi.

Pilihan **Status kontrak aktif**:

- **Perlu dibuatkan kontrak**;
- **Berakhir <= 7 hari**.

Filter **Perlu dibuatkan kontrak** mencakup:

- karyawan `ACTIVE` yang tidak mempunyai kontrak `ACTIVE` berlaku pada hari ini;
- karyawan `INACTIVE`, belum resign, dan sama sekali belum mempunyai kontrak selain kontrak `CANCELLED`.

Baris karyawan tanpa record kontrak ditampilkan dengan status visual `MISSING`/Belum ada kontrak. Ini adalah alert operasional, bukan kontrak palsu yang disimpan ke database.

### 15.3 KPI

Kartu KPI:

| KPI | Arti |
|---|---|
| Kontrak aktif berlaku | Kontrak `ACTIVE` yang periodenya mencakup hari ini. |
| Berakhir <= 7 hari | Kontrak `ACTIVE` yang berakhir dari hari ini sampai tujuh hari ke depan. |
| Perlu kontrak | Karyawan Aktif tanpa kontrak aktif berlaku dan karyawan Nonaktif baru yang belum mempunyai kontrak. |
| Draft perlu diproses | Jumlah kontrak `DRAFT`. |
| Terjadwal menunggu mulai | Jumlah kontrak `SCHEDULED`. |
| Total kontrak tercatat | Seluruh record kontrak dalam scope. |

KPI mengikuti scope akses serta filter Site, Modul Produksi, dan Bagian Produksi. Pencarian teks dan filter status tabel tidak mengubah KPI.

### 15.4 Warna badge

| Status | Warna tampilan |
|---|---|
| `ACTIVE` | Biru navy/primary |
| `SCHEDULED` | Biru navy/primary |
| `DRAFT` | Abu-abu |
| `EXPIRED` | Merah/danger |
| `TERMINATED` | Merah/danger |
| `CANCELLED` | Kuning/warning |
| `MISSING` | Merah/danger |

## 16. Konflik lifecycle dan alert

Alert konflik muncul ketika sistem menemukan kondisi berikut:

- lebih dari satu kontrak aktif yang masih berlaku untuk satu karyawan;
- karyawan `RESIGNED` atau status legacy `LEAVE` masih memiliki kontrak aktif;
- karyawan `ACTIVE` tidak memiliki kontrak aktif yang berlaku;
- karyawan `INACTIVE`, belum resign, dan belum mempunyai kontrak selain kontrak `CANCELLED`.

Alert menampilkan Employee ID, nama, site, alasan, nomor kontrak terkait, dan tautan ke detail karyawan.

Konflik tidak diperbaiki otomatis secara spekulatif. HR perlu memeriksa dokumen dan menentukan apakah harus membuat kontrak, menutup status karyawan, membatalkan draft, atau menyelesaikan kontrak yang salah.

Jumlah detail konflik yang ditampilkan dalam satu respons dibatasi 50 item. Gunakan filter dan Detail Karyawan untuk investigasi lanjutan bila jumlah kasus lebih banyak.

## 17. Rekonsiliasi kontrak

Rekonsiliasi berjalan menggunakan tanggal bisnis `Asia/Jakarta`.

### 17.1 Tugas rekonsiliasi

Urutan proses saat ini:

1. mengaktifkan kontrak `SCHEDULED` yang tanggal mulainya sudah tiba dan periodenya masih berlaku;
2. mengubah kontrak `ACTIVE` yang tanggal akhirnya sudah lewat menjadi `EXPIRED`;
3. memeriksa konsistensi kontrak aktif dan status karyawan;
4. memproses Mutasi Terjadwal yang jatuh tempo;
5. memproses Status Kerja Terjadwal yang jatuh tempo.

### 17.2 Perlindungan proses

- rekonsiliasi memakai advisory lock MySQL;
- hanya satu proses yang boleh berjalan pada satu waktu;
- pemanggilan kedua ketika proses masih berjalan menghasilkan status `SKIPPED`;
- setiap run dicatat sebagai `RUNNING`, `SUCCEEDED`, `FAILED`, atau `SKIPPED`;
- proses dirancang idempoten agar pemanggilan ulang tidak menggandakan histori yang sudah benar.

### 17.3 Rekonsiliasi manual

Super Admin dapat memakai tombol **Jalankan rekonsiliasi**. Tindakan ini menjalankan proses yang sama dengan cron untuk seluruh site, bukan hanya data yang sedang tampil pada filter.

Jalankan manual ketika:

- cron server terlambat atau baru diperbaiki;
- kontrak terjadwal belum berubah padahal tanggal mulai sudah tiba;
- HR perlu memproses ulang setelah memperbaiki data referensi.

Jangan menjalankan rekonsiliasi sebagai cara untuk menebak atau memperbaiki periode kontrak yang salah. Rekonsiliasi mengikuti data yang sudah tersimpan.

## 18. Cetak Template Kontrak

### 18.1 Cakupan tahap saat ini

Cetak template hanya tersedia untuk kombinasi:

- jenis karyawan `BORONGAN`; dan
- jenis kontrak `PKWT`.

Kombinasi lain tetap dapat memiliki record kontrak dan scan dokumen, tetapi belum dapat memakai template cetak internal.

### 18.2 Data wajib sebelum mencetak

Preview ditolak jika salah satu data berikut belum tersedia:

- NIK karyawan;
- alamat karyawan;
- alamat site;
- jabatan karyawan yang berlaku pada tanggal mulai kontrak;
- pekerjaan produksi aktif untuk jabatan tersebut;
- tarif aktif pada site dan tanggal mulai kontrak;
- satuan pekerjaan.

Pekerjaan kontrak diambil dari `production_jobs.position_id`, bukan dari `employee_job_assignments`.

### 18.3 Sumber data snapshot

Ketika **Cetak Template Kontrak** pertama kali dipilih, sistem menyimpan snapshot yang berisi:

- versi template;
- waktu pembuatan snapshot;
- nomor, tipe, dan periode kontrak;
- nama perusahaan;
- nama dan alamat site pada tanggal mulai;
- nama, Employee ID, NIK, dan alamat karyawan;
- jabatan pada tanggal mulai;
- seluruh pekerjaan aktif untuk jabatan tersebut;
- satuan dan tarif per hasil yang aktif pada site dan tanggal mulai;
- jadwal pembayaran setiap dua minggu;
- jabatan penandatangan perusahaan: Kepala Produksi Site.

Snapshot disimpan di kontrak agar perubahan tarif master setelahnya tidak mengubah kontrak lama.

Identitas pribadi seperti nama, NIK, dan alamat dibaca dari data karyawan ketika snapshot pertama kali dibuat. Site dan jabatan diambil dari histori penempatan pada tanggal mulai kontrak, sedangkan pekerjaan dan tarif diambil dari master yang efektif pada site dan tanggal tersebut.

Jika kontrak yang masih dapat diedit diubah, snapshot cetaknya dibatalkan dan harus dibuat ulang. Preview berikutnya menggunakan snapshot baru yang sesuai data kontrak terbaru.

### 18.4 Proses cetak

1. Klik **Cetak Template Kontrak**.
2. Sistem memvalidasi data dan membuat snapshot jika belum ada.
3. Preview dibuka pada tab browser baru.
4. Klik **Cetak**.
5. Pilih printer atau **Save as PDF** pada dialog browser.
6. Minta tanda tangan pihak terkait.
7. Scan dokumen asli.
8. Unggah hasil scan kembali ke kontrak.

Sistem tidak membuat file PDF server dan tidak membuat record generated document. Hasil akhir mengikuti dialog print browser.

### 18.5 Bulk cetak

Tabel mendukung **Cetak Template** untuk beberapa kontrak terpilih.

Aturannya:

- maksimal 50 kontrak sekali proses;
- seluruh pilihan harus berupa karyawan `BORONGAN` dengan kontrak `PKWT`;
- row **Belum ada kontrak** tidak ikut dicetak;
- snapshot seluruh kontrak dibuat dalam satu transaksi;
- bila satu kontrak gagal validasi, preview bulk tidak dilanjutkan;
- dokumen ditampilkan berurutan pada halaman print dengan page break antar kontrak.

## 19. Scan kontrak asli

Kolom **Dokumen Kontrak** memperlihatkan file yang sudah diunggah.

Jika file tersedia, dialog preview menyediakan:

- preview PDF atau gambar;
- **Buka File**;
- **Download**.

Jika file belum tersedia, tabel menampilkan label **Belum ada**. Dialog menyediakan:

- **Upload Dokumen** untuk menuju form edit kontrak;
- **Cetak Template Kontrak** jika kombinasi kontrak mendukung pencetakan.

Format upload yang diterima oleh form kontrak:

- PDF;
- JPG/JPEG;
- PNG.

Upload scan bersifat opsional pada saat create karena dokumen biasanya baru ditandatangani setelah template dicetak. Namun, keberadaan scan dianggap bukti kontrak telah dipakai sehingga **Batalkan aktivasi** tidak lagi diizinkan.

File kontrak merupakan dokumen sensitif. Pengguna harus memastikan file hanya dibagikan kepada pihak yang berwenang dan tidak menyalin URL file ke kanal publik.

## 20. Audit dan histori

Sistem mencatat aksi penting berikut:

- membuat kontrak;
- mengubah kontrak;
- membuat snapshot cetak;
- menjadwalkan atau menjalankan lifecycle;
- membatalkan aktivasi;
- membuat, mengubah, menerapkan, atau membatalkan Status Kerja Terjadwal;
- menjalankan rekonsiliasi manual maupun sistem.

Histori lifecycle kontrak menyimpan:

- status asal;
- status tujuan;
- tanggal efektif;
- alasan;
- sumber `MANUAL` atau `CRON`;
- pengguna pelaksana bila aksi manual;
- waktu pencatatan.

Audit log menyimpan konteks aksi, record terkait, site, deskripsi, pengguna, dan pada aksi tertentu kondisi sebelum/sesudah. Data final tidak boleh dihapus hanya untuk merapikan tampilan karena akan menghilangkan jejak bisnis.

## 21. Skenario operasional yang disarankan

### 21.1 Karyawan baru belum memiliki kontrak

1. Karyawan baru tercatat sebagai `INACTIVE`.
2. Alert **Perlu kontrak** akan memasukkannya bila belum ada kontrak non-cancelled.
3. HR membuat Single atau Multiple Kontrak.
4. Kontrak tersimpan sebagai `DRAFT`.
5. Aktifkan jika mulai hari ini/lampau, atau Jadwalkan jika mulai di masa depan.

### 21.2 Kontrak akan berakhir tujuh hari lagi

1. Periksa KPI **Berakhir <= 7 hari**.
2. Filter daftar dengan pilihan yang sama.
3. Buka aksi **Perpanjang kontrak**.
4. Buat kontrak baru mulai satu hari setelah kontrak lama berakhir.
5. Jadwalkan kontrak baru.

### 21.3 Draft salah total

Jika belum pernah berlaku:

- edit bila nomor/jenis/periode masih ingin dipertahankan; atau
- batalkan kontrak lalu buat kontrak baru.

### 21.4 Kontrak aktif salah periode dan belum dipakai

1. Buka Detail kontrak.
2. Pilih **Batalkan aktivasi**.
3. Isi alasan kesalahan minimal lima karakter.
4. Jika sistem menerima, kontrak menjadi `CANCELLED`.
5. Buat kontrak baru dengan periode yang benar.

### 21.5 Kontrak aktif salah periode tetapi sudah dipakai

1. Jangan mencoba membatalkan aktivasi atau mengubah tanggal.
2. Pilih **Terminasi** dengan tanggal efektif yang benar dan alasan jelas.
3. Buat kontrak baru mulai satu hari setelah tanggal terminasi.
4. Cetak dan unggah dokumen kontrak yang benar.

### 21.6 Karyawan resign pada tanggal mendatang

1. Buka Detail kontrak terakhir.
2. Pilih **Jadwalkan resign**.
3. Isi tanggal setelah hari ini dan alasan.
4. Pantau tab **Status Kerja Terjadwal**.
5. Pada tanggal efektif, sistem menghentikan kontrak aktif dan mengubah status karyawan menjadi `RESIGNED`.

## 22. Pesan penolakan yang umum

| Pesan/kondisi | Arti dan tindakan |
|---|---|
| Tanggal mulai sebelum tanggal bergabung | Sesuaikan tanggal mulai minimal sama dengan tanggal bergabung. |
| Tanggal berakhir wajib | Isi tanggal akhir untuk Training atau PKWT. |
| Periode bertumpang tindih | Periksa kontrak yang disebutkan; mulai kontrak baru satu hari setelah akhir efektif kontrak lama. |
| Ditemukan kontrak aktif lain | Selesaikan konflik kontrak aktif terlebih dahulu. |
| Kontrak final tidak dapat diubah | Buat kontrak baru; jangan mengubah arsip final. |
| Periode kontrak aktif tidak dapat diubah | Terminasi/batalkan aktivasi sesuai kondisi, lalu buat kontrak baru. |
| Karyawan resign tidak dapat diaktifkan | Periksa status dan prosedur rehire sebelum membuat lifecycle baru. |
| Status kerja terjadwal belum diselesaikan | Batalkan/perbaiki jadwal pada tab Status Kerja Terjadwal. |
| NIK/alamat belum tersedia | Lengkapi Data Karyawan sebelum cetak. |
| Alamat site belum tersedia | Lengkapi master site. |
| Posisi/pekerjaan/tarif belum tersedia | Lengkapi penempatan dan master produksi yang berlaku pada tanggal mulai. |
| Preview belum dibuat | Gunakan Cetak Template Kontrak agar snapshot dibuat terlebih dahulu. |
| Akses site ditolak | Gunakan akun dengan scope site yang sesuai atau hubungi Super Admin. |

## 23. Batasan versi saat ini

- Jenis kontrak baru hanya `TRAINING`, `PKWT`, dan `PKWTT`.
- Cetak template hanya untuk karyawan `BORONGAN` dengan kontrak `PKWT`.
- Template cetak merupakan format internal versi tetap, bukan editor template bebas.
- PDF tidak dibuat dan disimpan otomatis oleh server.
- Upload scan tidak tersedia pada create multiple.
- Tidak ada koreksi periode untuk kontrak aktif.
- Tidak ada penghapusan kontrak dari UI.
- `MISSING` hanya indikator tampilan, bukan status database.
- Rekonsiliasi tidak mengambil keputusan HR secara otomatis untuk konflik data legacy.

## 24. Checklist HR sebelum mengaktifkan kontrak

- [ ] Karyawan yang dipilih sudah benar.
- [ ] Jenis kontrak sesuai keputusan HR.
- [ ] Tanggal mulai tidak sebelum tanggal bergabung.
- [ ] Tanggal akhir sesuai dokumen dan rumus periode.
- [ ] Tidak ada peringatan overlap.
- [ ] Nomor dan urutan kontrak sudah terbentuk otomatis.
- [ ] Site dan jabatan karyawan sudah benar.
- [ ] NIK dan alamat lengkap jika template akan dicetak.
- [ ] Master pekerjaan dan tarif tersedia jika template akan dicetak.
- [ ] Tidak ada jadwal mutasi/status yang bertentangan.
- [ ] Dokumen sudah direview sebelum klik Aktifkan.

## 25. Checklist setelah kontrak ditandatangani

- [ ] Scan kontrak asli dalam PDF/JPG/PNG.
- [ ] Unggah melalui Edit kontrak atau dialog Dokumen Kontrak.
- [ ] Buka kembali preview file untuk memastikan file tidak rusak.
- [ ] Pastikan kontrak yang aktif adalah kontrak dengan periode yang benar.
- [ ] Pastikan status karyawan sudah sesuai.
- [ ] Pantau KPI kontrak mendekati akhir secara berkala.
