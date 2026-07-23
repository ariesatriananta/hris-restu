# Knowledge Base — Pengelolaan Karyawan

> Status dokumen: aktif. Perbarui dokumen ini setiap kali ada perubahan alur, status, validasi, endpoint, halaman, atau dampak ke modul lain.

## 1. Tujuan modul

Modul Pengelolaan Karyawan adalah pusat data tenaga kerja HRIS RSIA untuk site Jepara, Semarang, dan Klaten. Modul ini menyimpan identitas kerja, data pribadi, penempatan, riwayat mutasi, kontrak/PKWT, dokumen, foto, serta ID Card.

Prinsip utama yang sedang berlaku adalah: **tidak ada karyawan Aktif tanpa dasar kontrak aktif yang masih berlaku.** Status kerja tidak diubah melalui Mutasi. Status kerja ditentukan oleh lifecycle kontrak.

## 2. Menu dan halaman yang tersedia

| Menu | Fungsi saat ini |
|---|---|
| Karyawan → Data Karyawan | Daftar, cari, filter, tambah, ubah, dan buka detail karyawan. |
| Detail Karyawan | Melihat ringkasan, data pribadi, foto identitas, penempatan/mutasi, PKWT, dokumen, dan ID Card per orang. |
| Karyawan → Riwayat Mutasi | Daftar seluruh mutasi/penempatan dan drawer detail mutasi. |
| Karyawan → PKWT & Dokumen | Daftar global kontrak dan dokumen, lifecycle kontrak, serta alert konflik lifecycle. |
| Karyawan → Cetak ID Card | Memilih karyawan dan menghasilkan tampilan ID Card dengan barcode Code128. |

Semua daftar operasional memakai pencarian/filter/pagination berbasis URL. Default tampilan adalah 100 baris per halaman dengan pilihan 100, 200, 300, 400, dan 500.

## 3. Data karyawan dan Employee ID

Saat membuat karyawan, HR mengisi identitas kerja, penempatan awal, tanggal bergabung, data pribadi, data kontak, informasi legal, serta foto bila tersedia. Karyawan baru **selalu dibuat Nonaktif**.

Untuk data identitas baru, Jenis Kelamin mengikuti kode KTP: `LAKI-LAKI` atau `PEREMPUAN`. Status Perkawinan mengikuti `BELUM_KAWIN`, `KAWIN`, `CERAI_HIDUP`, atau `CERAI_MATI`. Data lama dengan kode sebelumnya tetap dipertahankan sebagai data legacy dan masih dapat dibuka atau disimpan tanpa dipaksa dikonversi.

Employee ID dibuat server secara otomatis dan tidak dapat diedit. Formatnya:

`P{prefix-site}-{YYMM}-{DD}{urut-3-digit}`

Contoh: `PSMG-2604-01002` berarti karyawan site Semarang, tanggal bergabung 1 April 2026, urutan ketiga pada tanggal tersebut. Prefix site saat ini: Jepara `KDS`, Semarang `SMG`, Klaten `SLO`. Urutan reset per site dan per tanggal bergabung.

Barcode selalu sama persis dengan Employee ID. Barcode tidak dapat diisi atau diubah manual.

### Data alamat, kontak, dan tanggal bergabung tambahan

Alamat karyawan dapat mencatat **RT/RW**, Kelurahan, Kecamatan, Kota, Provinsi, dan Kode Pos. RT/RW bersifat opsional, tetapi bila diisi wajib memakai format `001/002`. Email pribadi juga opsional, wajib memakai format email yang benar, dan tidak boleh dipakai oleh lebih dari satu karyawan.

`join_date` adalah tanggal bergabung resmi. Field ini tetap menjadi dasar Employee ID dan validasi awal kontrak. Sistem juga menyimpan `join_date_training` dan `join_date_borong` sebagai tanggal tambahan nullable untuk kebutuhan HR berikutnya. Kedua field tersebut belum ditampilkan di UI atau memengaruhi workflow apa pun, tetapi nilainya tidak boleh lebih awal daripada tanggal bergabung resmi.

### Status karyawan

| Status | Makna | Cara terjadi |
|---|---|---|
| `ACTIVE` / Aktif | Karyawan boleh bekerja. Kelak menjadi dasar Attendance dan Produksi. | Kontrak yang berlaku diaktifkan, atau cron menemukan satu kontrak aktif yang valid. |
| `INACTIVE` / Nonaktif | Karyawan belum/ tidak lagi aktif bekerja. | Karyawan baru, kontrak habis, kontrak diterminasi, atau tidak ada kontrak aktif yang berlaku. |
| `RESIGNED` / Resign | Karyawan berhenti atas pengunduran diri sendiri. | Aksi **Catat resign** pada kontrak aktif, wajib alasan dan tanggal efektif. |
| `LEAVE` / Cuti legacy | Nilai lama untuk kompatibilitas histori. | Tidak dipilih pada alur Master Karyawan baru; cuti operasional nantinya menjadi domain Attendance. |

Status `ACTIVE`, `INACTIVE`, dan `RESIGNED` tidak boleh diubah dari form edit biasa atau Catat Mutasi.

## 4. Penempatan dan Mutasi

Penempatan awal dibuat saat karyawan dibuat. Catat Mutasi dipakai untuk perubahan site, departemen, jabatan, atau jenis karyawan. Kelompok Kerja disimpan untuk kompatibilitas data, tetapi sementara disembunyikan dari seluruh UI Master Karyawan dan tidak dapat diubah dari aplikasi. `TRAINING` adalah jenis karyawan resmi dan, untuk penempatan produksi, berlaku sama seperti `BORONGAN`: Modul dan Bagian wajib dipilih.

Jenis perubahan yang tersedia: `TRANSFER` (mutasi site), `PROMOTION`, `DEMOTION`, `DEPARTMENT_CHANGE`, `TYPE_CHANGE`, dan `PRODUCTION_ASSIGNMENT_CHANGE`. Form hanya membuka field yang relevan: Transfer membuka Site, Departemen, dan Modul-Bagian untuk Borongan; Promosi/Demosi hanya Jabatan; Perubahan Departemen hanya Departemen; Perubahan Jenis hanya Jenis Karyawan beserta Modul-Bagian bila menjadi Borongan; dan Perubahan Penempatan Produksi hanya Modul-Bagian. `GROUP_CHANGE` dan `OTHER` tetap ada sebagai nilai histori/compatibility, namun tidak ditawarkan pada UI mutasi baru.

Mutasi berlaku menurut tanggal bisnis WIB. Jika tanggal efektif **hari ini**, sistem langsung menutup histori aktif sehari sebelumnya, membuat histori baru, lalu memperbarui penempatan utama secara atomik. Jika tanggal efektif **masa depan**, sistem hanya membuat antrean mutasi; data karyawan dan histori penempatan belum berubah sampai cron menerapkannya pada tanggal efektif. Tanggal lampau tidak didukung dari alur normal. Mutasi tidak mengubah status kerja. Perubahan jenis (`TYPE_CHANGE`) ditolak selama karyawan masih memiliki kontrak `DRAFT`, `SCHEDULED`, atau `ACTIVE`; HR harus menyelesaikan kontrak lama lebih dahulu.

Halaman **Riwayat Mutasi** juga menyediakan **Catat Mutasi Batch** untuk perpindahan beberapa orang sekaligus. HR dapat memilih maksimal 25 karyawan, lalu menentukan target dan tanggal efektif pada setiap baris. Satu batch dapat memuat mutasi langsung hari ini dan jadwal masa depan. Sebelum simpan, sistem menampilkan ringkasan seluruh perubahan. Batch bersifat **all-or-nothing**: jika satu karyawan tidak valid, tidak ada baris yang disimpan.

### Mutasi Terjadwal

Halaman **Karyawan → Riwayat Mutasi** memiliki dua tab:

- **Riwayat Diterapkan** hanya berisi histori penempatan yang sudah benar-benar berlaku.
- **Mutasi Terjadwal** berisi perubahan masa depan berikut statusnya: `Dijadwalkan`, `Diterapkan`, `Gagal`, atau `Dibatalkan`.

Satu karyawan hanya boleh memiliki satu jadwal yang belum selesai. Sebelum tanggal efektif, HR dapat mengubah atau membatalkan jadwal. Saat cron menjalankannya, sistem memeriksa ulang bahwa histori aktif sumber belum berubah serta seluruh master tujuan masih aktif. Jika tidak valid, jadwal menjadi **Gagal**, tidak mengubah karyawan, dan HR perlu memperbaiki lalu menjadwalkan ulang. Ringkasan jadwal yang masih terbuka juga tampil pada tab **Penempatan & Mutasi** di detail karyawan.

Setiap riwayat memiliki drawer Detail untuk melihat penempatan, alasan, catatan, tanggal berlaku, dan jenis perubahan.

### Modul dan Bagian Produksi

Penempatan produksi hanya berlaku untuk karyawan `BORONGAN`. Strukturnya adalah **Site → Modul Produksi → Bagian yang diizinkan**.

- **Modul Produksi** adalah line atau area produksi pada satu site, misalnya Modul A atau Modul Packing. Modul Site Jepara tidak otomatis berlaku di Semarang atau Klaten.
- **Bagian Produksi** adalah proses kerja yang dapat dipakai ulang, misalnya Linting, Packing, Kemas, atau Slop.
- **Mapping Modul & Bagian** menentukan pasangan yang sah. Bagian tidak dapat dipilih pada Modul tertentu bila belum dipetakan oleh HR.

Saat membuat karyawan Borongan baru, HR wajib memilih Modul lalu Bagian. Karyawan Bulanan tidak mempunyai penempatan Modul/Bagian dan nilainya kosong. Data legacy yang belum memiliki penempatan produksi tetap dapat dilihat, tetapi penempatan Borongan baru wajib lengkap.

Perubahan Modul, Bagian, atau perpindahan site dilakukan melalui **Catat Mutasi**, bukan Edit Data Karyawan. Saat Site diganti, pilihan Modul dan Bagian direset karena harus mengikuti struktur site tujuan. Sistem menyimpan perubahan tersebut sebagai `PRODUCTION_ASSIGNMENT_CHANGE` atau jenis mutasi yang dipilih HR.

Master dikelola di **Administrasi Sistem → Master Data** pada tiga tab: Modul Produksi, Bagian Produksi, dan Mapping Modul & Bagian. Data yang belum pernah dipakai boleh **dihapus permanen**. Bila sudah dipakai oleh pemetaan, data karyawan, atau histori, sistem menolak penghapusan agar jejak lama tetap utuh; gunakan status Nonaktif. Master nonaktif tidak dapat dipilih untuk penempatan baru namun tetap terlihat pada histori lama.

### Departemen

Departemen adalah struktur organisasi per site yang dapat dipakai oleh karyawan `BORONGAN` maupun `BULANAN`. HR mengelolanya melalui **Administrasi Sistem → Master Data → Departemen**.

- Setiap Departemen memiliki Site, kode manual yang unik dalam Site tersebut, nama, keterangan, dan status aktif.
- Saat membuat atau mengubah penempatan karyawan, hanya Departemen aktif pada Site terkait yang dapat dipilih.
- Perubahan penempatan Departemen dilakukan lewat **Catat Mutasi** agar histori penempatan tetap utuh.
- Departemen yang belum pernah dipakai dapat dihapus permanen. Jika sudah menjadi referensi karyawan, histori penempatan, atau Kelompok Kerja, gunakan Nonaktif agar relasi dan histori tidak rusak.
- Departemen yang masih dipakai oleh karyawan berstatus Aktif tidak dapat dinonaktifkan. Karyawan Aktif harus dimutasikan lebih dahulu ke Departemen lain.

### Jabatan

Jabatan adalah master global yang dapat digunakan lintas site untuk karyawan `BORONGAN` maupun `BULANAN`. HR memakai Jabatan saat membuat penempatan awal dan saat **Catat Mutasi**.

- Setiap Jabatan memiliki kode unik global, nama, kategori, keterangan, dan status aktif.
- Kategori Jabatan saat ini adalah `PRODUCTION`, `STAFF`, dan `MANAGEMENT` untuk membedakan konteks organisasi, bukan untuk membatasi jenis karyawan secara otomatis.
- Master Jabatan dikelola melalui **Administrasi Sistem → Master Data → Jabatan** dan hanya dapat ditambah, diubah, atau dinonaktifkan oleh Super Admin.
- Jabatan yang belum pernah dipakai dapat dihapus permanen oleh Super Admin. Jabatan yang sudah menjadi referensi karyawan atau histori harus dikelola melalui Nonaktif; jabatan yang masih dipakai karyawan Aktif harus diganti melalui Mutasi sebelum dapat dinonaktifkan.

## 5. PKWT dan lifecycle kontrak

Kontrak dibuat dalam status `DRAFT`. Nomor kontrak dan urutannya dibuat server; HR tidak menginputnya manual. Untuk kontrak baru, tipe kontrak dikunci menurut jenis karyawan: **Borongan → PKWT**, **Training → TRAINING**, dan **Bulanan → PKWTT**. `PROJECT`, `RETAIN`, dan `OTHER` tetap dibaca bila berasal dari data legacy, tetapi tidak tersedia untuk kontrak baru.

Tanggal akhir wajib untuk `PKWT`, `TRAINING`, `PROJECT`, dan `RETAIN`; opsional untuk `PKWTT` dan `OTHER`. Tanggal akhir tidak boleh sebelum tanggal mulai. Tanggal mulai tidak boleh sebelum tanggal bergabung karyawan. Kontrak `DRAFT`, `SCHEDULED`, dan `ACTIVE` tidak boleh memiliki periode yang bertumpang tindih untuk karyawan yang sama.

### Status kontrak

Dropdown tipe kontrak menampilkan seluruh master tipe untuk memberi konteks, tetapi hanya pilihan yang sesuai jenis karyawan yang dapat dipilih: `BORONGAN` memakai `PKWT`, `TRAINING` memakai `TRAINING`, dan `BULANAN` memakai `PKWTT`. Opsi `PROJECT`, `RETAIN`, dan `OTHER` tetap terlihat sebagai referensi legacy, tetapi nonaktif untuk kontrak baru.

| Status | Makna | Aksi yang tersedia |
|---|---|---|
| `DRAFT` | Kontrak baru, belum dijalankan. | Ubah, Jadwalkan bila tanggal mulai masa depan, Aktifkan bila mulai hari ini/lampau, atau Batalkan. |
| `SCHEDULED` | Kontrak sudah dijadwalkan menunggu tanggal mulai. | Batalkan; Aktifkan hanya saat tanggal mulai telah tiba. |
| `ACTIVE` | Kontrak sedang berlaku. | Ubah terbatas, Terminasi, atau Catat resign. |
| `EXPIRED` | Kontrak habis karena melewati tanggal akhir. | Final/read-only; bila ini kontrak terakhir dan karyawan masih Aktif, tersedia penutupan status karyawan. |
| `TERMINATED` | Kontrak dihentikan, baik terminasi perusahaan maupun resign. | Final/read-only. Alasan dan tanggal akhir tersimpan. |
| `CANCELLED` | Draft/jadwal dibatalkan sebelum berlaku. | Final/read-only. |

Kontrak final (`EXPIRED`, `TERMINATED`, `CANCELLED`) tidak dapat diedit. Kontrak aktif hanya boleh mengubah tanggal mulai/akhir, tanggal tanda tangan, lampiran, dan catatan; jenis, nomor, serta urutan kontrak terkunci.

### Aksi lifecycle

- **Jadwalkan**: `DRAFT → SCHEDULED` untuk kontrak yang mulai di masa depan.
- **Aktifkan**: `DRAFT/SCHEDULED → ACTIVE`. Karyawan Nonaktif berubah menjadi Aktif. Karyawan Resign tidak dapat diaktifkan melalui kontrak.
- **Terminasi**: `ACTIVE → TERMINATED`; wajib alasan dan tanggal efektif antara tanggal mulai kontrak sampai hari ini. Karyawan menjadi Nonaktif bila tidak ada kontrak aktif lain yang valid.
- **Catat resign**: `ACTIVE → TERMINATED`; wajib alasan dan tanggal efektif. Karyawan menjadi Resign.
- **Batalkan**: `DRAFT/SCHEDULED → CANCELLED`; tidak mengubah status karyawan.

Tanggal efektif Terminasi/Resign dapat dipilih melalui datepicker. Lampiran kontrak opsional; sistem memberi peringatan tetapi tidak memblokir aksi lifecycle.

Untuk kontrak `EXPIRED` terakhir milik karyawan yang masih `ACTIVE`, tersedia aksi **Terminasi karyawan** dan **Catat resign**. Kedua aksi ini tidak mengubah kontrak menjadi `TERMINATED`: kontrak tetap `EXPIRED`, sedangkan status employee menjadi `INACTIVE` atau `RESIGNED`. Alasan wajib diisi dan tanggal efektif dapat dipilih dari tanggal akhir kontrak sampai hari ini. Sistem menulis histori `STATUS_CHANGE` dan audit trail.

### Status Kerja Terjadwal

Di halaman **PKWT & Dokumen** terdapat tab **Status Kerja Terjadwal**. HR dapat menjadwalkan Terminasi atau Resign dari kontrak Aktif terakhir, maupun kontrak Expired terakhir untuk employee yang masih Aktif. Jadwal hanya boleh memakai tanggal setelah hari ini dan alasan wajib diisi.

Satu karyawan hanya dapat memiliki satu jadwal yang belum selesai. Jadwal status kerja tidak dapat berjalan bersamaan dengan Mutasi Terjadwal. Selama jadwal ini belum selesai, aksi Terminasi atau Catat resign langsung diblok agar keputusan status HR tidak saling bertabrakan. Sebelum efektif, HR dapat mengubah atau membatalkan jadwal; jadwal gagal dapat diperbaiki lalu dijadwalkan ulang.

Pada tanggal efektif, cron menghentikan seluruh kontrak yang masih Aktif lalu mengubah status employee menjadi Nonaktif atau Resign. Kontrak yang sudah Expired tetap Expired. Jika cron gagal menerapkan jadwal, statusnya menjadi `FAILED` agar HR meninjau ulang; cron tidak mencoba ulang secara otomatis.

### Perpanjangan PKWT

Filter multi-pilihan **Status kontrak aktif** juga memiliki pilihan **Berakhir ≤ 7 hari**. Pilihan ini menampilkan kontrak `ACTIVE` dengan tanggal akhir dari hari bisnis WIB ini sampai tujuh hari berikutnya, sama seperti kartu KPI. Pilihan ini dapat digabung dengan **Karyawan aktif tanpa kontrak aktif**; hasilnya adalah gabungan kedua kondisi.

Kontrak `ACTIVE` yang merupakan kontrak terakhir seorang karyawan dan berakhir dalam tujuh hari juga mendapatkan aksi ikon **Perpanjang kontrak**, sama seperti kontrak `EXPIRED` terakhir.

Halaman **PKWT & Dokumen** memiliki filter **Status kontrak aktif → Karyawan aktif tanpa kontrak aktif**. Filter ini menampilkan satu baris terakhir per karyawan Aktif yang tidak memiliki kontrak Aktif berlaku, termasuk karyawan yang kontrak terakhirnya sudah berakhir atau yang belum memiliki kontrak tercatat. Tujuannya agar HR dapat langsung menindaklanjuti pembuatan atau perpanjangan kontrak tanpa mencampur data arsip lain.

Pada tabel PKWT, kontrak `EXPIRED` yang merupakan kontrak paling baru milik seorang karyawan memiliki aksi ikon **Perpanjang kontrak**. Aksi ini membuka form kontrak baru dengan karyawan tersebut sudah terkunci terpilih. Kontrak expired yang lebih lama tidak memiliki aksi ini, sehingga HR tidak tanpa sengaja memperpanjang arsip lama.

Ada dua model. Untuk addendum atas kontrak yang sama, ubah tanggal akhir kontrak aktif. Untuk perpanjangan sebagai dokumen/nomor kontrak baru, buat kontrak baru tanpa overlap: bila kontrak lama berakhir 31 Juli, kontrak baru dimulai 1 Agustus, lalu Jadwalkan. Cron akan mengaktifkan kontrak baru dan mengakhiri kontrak lama tanpa membuat karyawan sempat Nonaktif.

## 6. Cron reconcile kontrak

Server cron memanggil `POST /api/internal/contracts/reconcile` setiap hari pukul 00:05 WIB dengan header `X-Cron-Secret`. Endpoint ini bukan endpoint browser. Tanggal yang dipakai selalu tanggal bisnis **WIB**. Sebelum bekerja, endpoint mengambil advisory lock MySQL; bila proses lain masih berjalan, request baru dicatat `SKIPPED` dan tidak memproses data kedua kali.

### Urutan proses cron saat ini

1. Mengaktifkan kontrak `SCHEDULED` yang tanggal mulainya sudah tiba dan masih berada dalam masa berlaku. Dalam transaksi yang sama, karyawan non-resign disinkronkan menjadi `ACTIVE` dan histori status dibuat atau diselaraskan dengan sumber `CRON`.
2. Mengubah kontrak `ACTIVE` yang tanggal akhirnya telah lewat menjadi `EXPIRED`.
3. Menyinkronkan status master karyawan berdasarkan jumlah kontrak `ACTIVE` yang masih berlaku pada hari bisnis tersebut.
4. Menerapkan antrean mutasi penempatan yang tanggal efektifnya sudah tiba.
5. Menerapkan antrean Status Kerja Terjadwal yang tanggal efektifnya sudah tiba: kontrak yang masih Aktif dihentikan, lalu employee menjadi Nonaktif atau Resign sesuai keputusan HR. Kontrak yang sudah Expired tidak diubah kembali.

Kegagalan mutasi terjadwal tidak dicoba ulang otomatis agar perubahan yang sudah tidak relevan tidak masuk diam-diam. Status jadwal menjadi `FAILED` dan HR harus memperbaikinya dari tab **Mutasi Terjadwal**.

### Aturan sinkronisasi status karyawan saat ini

| Kondisi karyawan pada tanggal bisnis | Perlakuan cron saat ini |
|---|---|
| Tepat satu kontrak `ACTIVE` yang masih berlaku | Karyawan disinkronkan menjadi `ACTIVE` bila sebelumnya bukan `ACTIVE` atau `RESIGNED`. |
| Tidak ada kontrak aktif berlaku dan karyawan `INACTIVE` | Tetap `INACTIVE`. |
| Kontrak `SCHEDULED` mulai hari ini | Kontrak diaktifkan; karyawan kemudian disinkronkan menjadi `ACTIVE`. |
| Kontrak `ACTIVE` sudah melewati tanggal akhir | Kontrak menjadi `EXPIRED`; status master karyawan tidak diubah. Bila karyawan masih `ACTIVE` tanpa kontrak aktif berlaku, sistem menampilkannya sebagai konflik agar HR membuat kontrak pengganti. |
| Karyawan `RESIGNED` atau legacy `LEAVE` | Tidak diaktifkan otomatis walaupun terdapat kontrak aktif; dicatat sebagai konflik bila kondisi tersebut terjadi. |
| Lebih dari satu kontrak aktif berlaku | Ditandai konflik; cron tidak memilih atau menutup salah satu kontrak. |
| Karyawan `ACTIVE` tanpa kontrak aktif berlaku | Ditandai konflik; cron tidak mengubahnya otomatis. Ini melindungi data legacy, termasuk empat Borongan migrasi yang belum memiliki kontrak. |

Cron bersifat idempoten: pemanggilan ulang pada keadaan yang sudah sesuai tidak membuat histori/audit ganda. Setiap run dicatat pada `cron_runs` dengan status `RUNNING`, `SUCCEEDED`, `FAILED`, atau `SKIPPED`. Konflik tidak diperbaiki secara spekulatif. Contoh konflik: lebih dari satu kontrak aktif valid, karyawan Resign/legacy Leave masih memiliki kontrak aktif, atau karyawan Aktif tanpa kontrak aktif berlaku karena kontraknya telah berakhir. Empat Borongan legacy tanpa kontrak saat migrasi juga ditandai sebagai konflik; cron tidak mengubah status maupun histori mereka otomatis.

Kontrak `SCHEDULED` tidak diaktifkan bila tipe kontraknya tidak sesuai jenis karyawan, karyawan sudah `RESIGNED`, atau terdapat kontrak aktif lain yang masih berlaku. Kontrak tersebut tetap `SCHEDULED`, tidak ada perubahan parsial, dan kegagalannya masuk ke `failures` pada respons cron serta audit trail. Kontrak terjadwal yang sudah melewati tanggal akhirnya tidak diaktifkan secara retroaktif; HR perlu meninjaunya.

Konflik dapat dilihat oleh admin pada **Karyawan → PKWT & Dokumen → PKWT & Kontrak**. Alert konflik menampilkan nomor/nama karyawan, site, nomor kontrak terkait, alasan, dan tautan ke Detail Karyawan.

### Menjalankan rekonsiliasi manual

Super Admin dapat menjalankan rekonsiliasi tanpa menunggu jadwal server melalui tombol **Jalankan rekonsiliasi** di halaman **PKWT & Dokumen** pada tab **PKWT & Kontrak**, di samping tombol **Tambah kontrak**. Sistem meminta konfirmasi karena proses mencakup seluruh site, bukan hanya data yang sedang terfilter di tabel.

Tombol ini tidak mengekspos secret cron ke browser. Aplikasi memakai sesi Super Admin untuk memanggil endpoint terautentikasi, lalu backend menjalankan proses yang sama persis dengan webhook cron, termasuk advisory lock, `cron_runs`, audit trail, dan refresh data halaman. Bila rekonsiliasi lain masih berjalan, hasilnya `SKIPPED` dan tidak ada data diproses dua kali.

## 7. Dokumen dan foto

Dokumen karyawan memiliki status berikut:

| Status | Makna |
|---|---|
| `ACTIVE` | Dokumen masih berlaku. |
| `EXPIRED` | Masa berlaku dokumen berakhir. |
| `REVOKED` | Dokumen dicabut/tidak lagi digunakan. |
| `ARCHIVED` | Dokumen disimpan sebagai arsip. |

Foto karyawan disimpan sebagai file terkait karyawan. Foto KTP dan KK saat ini dibaca dari dokumen bertipe `KTP` dan `KK`. Semua file diunggah ke R2 dengan folder per `employeeUid`; URL CDN saat ini bersifat publik sesuai keputusan produk. Jangan mengunggah data yang tidak semestinya dibuka oleh pihak yang memperoleh URL.

## 8. Detail Karyawan dan ID Card

Halaman detail menyajikan tab Ringkasan, Data Pribadi, Foto Identitas, Penempatan & Mutasi, PKWT, Dokumen, dan ID Card. Ringkasan status kerja menjelaskan dasar status saat ini, misalnya kontrak aktif, kontrak dihentikan, kontrak berakhir, atau tidak ada kontrak aktif.

Drawer PKWT memperlihatkan nomor, tipe, status, urutan, masa berlaku, snapshot penempatan, catatan, lampiran preview PDF/gambar, serta aksi lifecycle sesuai status. ID Card memakai data karyawan dan barcode Employee ID.

## 9. Audit, akses, dan batasan

Semua aksi tulis penting—buat/ubah karyawan, mutasi, kontrak, lifecycle, dokumen, upload, dan sinkronisasi cron—mencatat audit trail. API memeriksa permission dan scope site; Super Admin mempunyai akses seluruh site.

Modul ini belum menerapkan dampak bisnis ke Attendance, Setoran Produksi, atau Payroll. Perubahan contract/status hari ini hanya mengelola Master Karyawan dan histori.

## 10. Checklist pembaruan knowledge base

Perbarui dokumen ini ketika menambah/menghapus field, status, menu, validasi, role/permission, endpoint, scheduler, integrasi file, atau dampak lintas modul. Tulis juga keputusan bisnis dan skenario pengecualian agar operator baru dapat bekerja tanpa menebak.
