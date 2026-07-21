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

Employee ID dibuat server secara otomatis dan tidak dapat diedit. Formatnya:

`P{prefix-site}-{YYMM}-{DD}{urut-3-digit}`

Contoh: `PSMG-2604-01002` berarti karyawan site Semarang, tanggal bergabung 1 April 2026, urutan ketiga pada tanggal tersebut. Prefix site saat ini: Jepara `KDS`, Semarang `SMG`, Klaten `SLO`. Urutan reset per site dan per tanggal bergabung.

Barcode selalu sama persis dengan Employee ID. Barcode tidak dapat diisi atau diubah manual.

### Status karyawan

| Status | Makna | Cara terjadi |
|---|---|---|
| `ACTIVE` / Aktif | Karyawan boleh bekerja. Kelak menjadi dasar Attendance dan Produksi. | Kontrak yang berlaku diaktifkan, atau cron menemukan satu kontrak aktif yang valid. |
| `INACTIVE` / Nonaktif | Karyawan belum/ tidak lagi aktif bekerja. | Karyawan baru, kontrak habis, kontrak diterminasi, atau tidak ada kontrak aktif yang berlaku. |
| `RESIGNED` / Resign | Karyawan berhenti atas pengunduran diri sendiri. | Aksi **Catat resign** pada kontrak aktif, wajib alasan dan tanggal efektif. |
| `LEAVE` / Cuti legacy | Nilai lama untuk kompatibilitas histori. | Tidak dipilih pada alur Master Karyawan baru; cuti operasional nantinya menjadi domain Attendance. |

Status `ACTIVE`, `INACTIVE`, dan `RESIGNED` tidak boleh diubah dari form edit biasa atau Catat Mutasi.

## 4. Penempatan dan Mutasi

Penempatan awal dibuat saat karyawan dibuat. Catat Mutasi dipakai untuk perubahan site, departemen, jabatan, atau jenis karyawan. Kelompok Kerja disimpan untuk kompatibilitas data, tetapi sementara disembunyikan dari seluruh UI Master Karyawan dan tidak dapat diubah dari aplikasi.

Jenis perubahan yang tersedia: `TRANSFER` (mutasi site), `PROMOTION`, `DEMOTION`, `TYPE_CHANGE`, `PRODUCTION_ASSIGNMENT_CHANGE`, dan `OTHER`. `GROUP_CHANGE` tetap ada sebagai nilai histori/compatibility namun tidak ditawarkan pada UI selama Kelompok Kerja disembunyikan.

Saat mutasi disimpan, sistem menutup histori aktif sehari sebelum tanggal efektif, membuat histori baru, lalu memperbarui penempatan utama secara atomik. Tanggal efektif wajib setelah histori aktif sebelumnya. Mutasi tidak mengubah status kerja.

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

Kontrak dibuat dalam status `DRAFT`. Nomor kontrak dan urutannya dibuat server; HR tidak menginputnya manual. Jenis kontrak mengikuti master aktif: `PKWT`, `PKWTT`, `OTHER`, `TRAINING`, `PROJECT`, dan `RETAIN`.

Tanggal akhir wajib untuk `PKWT`, `TRAINING`, `PROJECT`, dan `RETAIN`; opsional untuk `PKWTT` dan `OTHER`. Tanggal akhir tidak boleh sebelum tanggal mulai. Tanggal mulai tidak boleh sebelum tanggal bergabung karyawan. Kontrak `DRAFT`, `SCHEDULED`, dan `ACTIVE` tidak boleh memiliki periode yang bertumpang tindih untuk karyawan yang sama.

### Status kontrak

| Status | Makna | Aksi yang tersedia |
|---|---|---|
| `DRAFT` | Kontrak baru, belum dijalankan. | Ubah, Jadwalkan bila tanggal mulai masa depan, Aktifkan bila mulai hari ini/lampau, atau Batalkan. |
| `SCHEDULED` | Kontrak sudah dijadwalkan menunggu tanggal mulai. | Batalkan; Aktifkan hanya saat tanggal mulai telah tiba. |
| `ACTIVE` | Kontrak sedang berlaku. | Ubah terbatas, Terminasi, atau Catat resign. |
| `EXPIRED` | Kontrak habis karena melewati tanggal akhir. | Final/read-only. |
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

### Perpanjangan PKWT

Ada dua model. Untuk addendum atas kontrak yang sama, ubah tanggal akhir kontrak aktif. Untuk perpanjangan sebagai dokumen/nomor kontrak baru, buat kontrak baru tanpa overlap: bila kontrak lama berakhir 31 Juli, kontrak baru dimulai 1 Agustus, lalu Jadwalkan. Cron akan mengaktifkan kontrak baru dan mengakhiri kontrak lama tanpa membuat karyawan sempat Nonaktif.

## 6. Cron reconcile kontrak

Server cron memanggil `POST /api/internal/contracts/reconcile` setiap hari pukul 00:05 WIB dengan header `X-Cron-Secret`. Endpoint ini bukan endpoint browser.

Cron melakukan tiga hal: mengaktifkan kontrak `SCHEDULED` yang sudah mulai, mengubah kontrak `ACTIVE` yang melewati tanggal akhir menjadi `EXPIRED`, dan menyinkronkan seluruh status karyawan terhadap kontrak aktif yang berlaku.

Cron bersifat idempoten: pemanggilan ulang pada keadaan yang sudah sesuai tidak membuat histori/audit ganda. Konflik tidak diperbaiki secara spekulatif. Contoh konflik: lebih dari satu kontrak aktif valid, atau karyawan Resign/legacy Leave masih memiliki kontrak aktif.

Konflik dapat dilihat oleh admin pada **Karyawan → PKWT & Dokumen → PKWT & Kontrak**. Alert konflik menampilkan nomor/nama karyawan, site, nomor kontrak terkait, alasan, dan tautan ke Detail Karyawan.

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
