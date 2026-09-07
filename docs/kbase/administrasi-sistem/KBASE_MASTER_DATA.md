# Knowledge Base - Master Data Administrasi Sistem

> Modul: Administrasi Sistem
>
> Bagian: Master Data
>
> Audiens: Super Admin, HR Officer, dan administrator site yang berwenang
>
> Terakhir diverifikasi: 8 September 2026
>
> Status: aktif; mencakup struktur organisasi dan penempatan produksi

Panduan ini menjelaskan pengelolaan **Departemen**, **Jabatan**, **Modul
Produksi**, **Bagian Produksi**, serta **Mapping Modul & Bagian** melalui
**Administrasi Sistem > Master Data**.

## 1. Hubungan antar-master

Struktur yang dibentuk halaman ini dapat dibaca sebagai berikut:

**Site -> Departemen**

**Site -> Modul Produksi -> Mapping Modul & Bagian -> Bagian Produksi**

Jabatan dan Bagian Produksi bersifat global. Departemen serta Modul Produksi
terikat ke satu site. Mapping mewarisi site dari Modul Produksi yang dipilih.

Data ini dipakai oleh Master Karyawan, Rekrutmen, Mutasi, kontrak, dan
penempatan Produksi. Karena itu, perubahan master dapat memengaruhi pilihan
yang tersedia pada workflow lain.

## 2. Hak akses dan scope

- Membaca daftar memerlukan `employees.view`.
- Menambah, mengubah, atau menghapus memerlukan `employees.manage`.
- Departemen, Modul Produksi, dan mapping tetap dibatasi oleh akses site akun.
- Pembuatan dan perubahan **Jabatan** dibatasi untuk Super Admin karena Jabatan
  adalah master global lintas site.
- Bagian Produksi adalah master global yang dikelola pengguna dengan
  `employees.manage` pada implementasi saat ini.

Backend memeriksa aturan tersebut walaupun tombol terlihat pada antarmuka.

## 3. Aturan umum pengisian

Seluruh master menggunakan kode, nama, deskripsi opsional, dan status aktif.

| Field | Aturan |
|---|---|
| Kode | Wajib, maksimal 30 karakter, dan disimpan dalam huruf kapital. |
| Nama | Wajib, maksimal 100 karakter. |
| Deskripsi | Opsional, maksimal 255 karakter. |
| Status | Aktif atau Nonaktif. |

Gunakan kode yang stabil. Mengganti kode yang sudah dipakai dapat membingungkan
rekonsiliasi manual, ekspor lama, dan komunikasi operasional walaupun relasi
database memakai identifier internal.

## 4. Departemen

Departemen adalah struktur organisasi per site untuk penempatan karyawan
Borongan dan Bulanan.

Saat membuat Departemen:

1. buka tab **Departemen**;
2. klik **Tambah**;
3. pilih site;
4. isi kode, nama, dan deskripsi;
5. tentukan status lalu simpan.

Site Departemen tidak dapat diganti setelah data dibuat. Jika pilihan site
salah dan data belum dipakai, hapus lalu buat ulang pada site yang benar.

Departemen aktif tidak dapat dinonaktifkan saat masih dipakai karyawan Aktif.
Mutasikan seluruh karyawan aktif ke Departemen lain terlebih dahulu. Penghapusan
juga ditolak ketika Departemen masih direferensikan data Karyawan, histori
penempatan, atau Kelompok Kerja.

## 5. Jabatan

Jabatan adalah master global yang dapat dipakai lintas site. Selain kode, nama,
dan status, Jabatan mempunyai kategori:

| Kategori | Label aplikasi |
|---|---|
| `PRODUCTION` | Produksi |
| `STAFF` | Staff |
| `MANAGEMENT` | Manajemen |

Pembuatan, perubahan, dan penghapusan Jabatan hanya untuk Super Admin.
Jabatan aktif tidak dapat dinonaktifkan ketika masih dipakai karyawan Aktif.
Penghapusan ditolak jika masih digunakan data Karyawan atau histori penempatan.

## 6. Modul Produksi

Modul Produksi mewakili line atau area produksi yang spesifik untuk satu site.

1. Buka tab **Modul Produksi**.
2. Klik **Tambah**.
3. Pilih site dan isi identitas Modul.
4. Simpan sebagai Aktif bila siap dipakai.
5. Hubungkan Modul dengan Bagian melalui tab **Mapping Modul & Bagian**.

Site Modul tidak dapat diubah setelah data dibuat. Modul tidak dapat dihapus
selama masih memiliki mapping ke Bagian Produksi.

## 7. Bagian Produksi

Bagian Produksi adalah proses kerja yang dapat dipakai ulang pada beberapa
Modul, misalnya Linting atau Packing. Data ini tidak memiliki site secara
langsung.

Setelah membuat Bagian, Anda tetap harus membuat mapping agar Bagian dapat
dipilih dalam Modul tertentu. Bagian tidak dapat dihapus selama masih memiliki
mapping ke Modul.

## 8. Mapping Modul & Bagian

Mapping menentukan Bagian mana yang tersedia dalam setiap Modul Produksi.

1. Buka tab **Mapping Modul & Bagian**.
2. Klik **Tambah**.
3. Pilih Modul Produksi.
4. Pilih Bagian Produksi.
5. Tentukan status lalu simpan.

Mapping hanya dapat diaktifkan atau dinonaktifkan setelah dibuat; pasangan
Modul dan Bagian tidak diedit menjadi pasangan lain. Buat mapping baru bila
hubungan yang dibutuhkan berbeda.

Penghapusan mapping ditolak jika masih dipakai pada current data Karyawan atau
histori penempatan. Gunakan status Nonaktif untuk menghentikan pemakaian baru
tanpa merusak histori.

## 9. Memilih antara Nonaktif dan Hapus

| Kondisi | Tindakan yang disarankan |
|---|---|
| Data salah, belum pernah dipakai | Hapus lalu buat ulang jika validasi mengizinkan. |
| Data pernah atau masih dipakai | Mutasikan referensi aktif bila diperlukan, lalu Nonaktifkan. |
| Data harus tetap muncul pada histori | Jangan hapus; gunakan Nonaktif. |
| Site salah pada Departemen/Modul | Jika belum dipakai, hapus dan buat ulang karena site tidak dapat diedit. |

Status Nonaktif mencegah pemakaian operasional baru, tetapi tidak menghapus
referensi historis.

## 10. Pencarian dan filter

Setiap tab menyediakan pencarian berdasarkan kode atau nama. Data yang memiliki
site dapat difilter berdasarkan site. Semua daftar juga dapat difilter dengan
status Aktif atau Nonaktif dan menggunakan pagination.

Filter halaman tersimpan di URL. Tautan hasil filter dapat dibagikan kepada
pengguna lain yang mempunyai hak akses sesuai.

## 11. Dampak ke modul lain

Periksa modul berikut setelah perubahan besar:

- **Rekrutmen** dan **Master Karyawan** untuk pilihan penempatan awal;
- **Mutasi Karyawan** untuk target site, Departemen, Jabatan, dan mapping;
- **Pengaturan Sistem > Kontrak Karyawan** untuk target per Bagian Produksi;
- **Master Produksi** untuk pekerjaan serta assignment pekerja;
- dokumen dan laporan yang menampilkan snapshot penempatan.

Perubahan master tidak boleh digunakan untuk menulis ulang histori penempatan
karyawan yang sudah berlaku.

## 12. Solusi masalah umum

| Kondisi | Tindakan |
|---|---|
| Tombol simpan ditolak untuk site | Periksa apakah akun memiliki akses site dan site masih aktif. |
| Site tidak dapat diubah | Site Departemen dan Modul memang immutable setelah dibuat. |
| Jabatan tidak dapat dikelola | Pembuatan dan perubahan Jabatan global hanya untuk Super Admin. |
| Tidak dapat menonaktifkan Departemen/Jabatan | Mutasikan karyawan Aktif yang masih memakai master tersebut. |
| Tidak dapat menghapus | Baca pesan referensi yang masih memakai data; pertahankan histori dan gunakan Nonaktif bila sesuai. |
| Bagian tidak muncul pada penempatan | Pastikan Bagian dan mapping ke Modul terkait sama-sama Aktif. |
| Target kontrak belum muncul | Pastikan struktur dan mapping produksi aktif, lalu periksa Pengaturan Sistem. |

## 13. Checklist perubahan master

- [ ] Kode dan nama mengikuti istilah operasional perusahaan.
- [ ] Site dipilih dengan benar sebelum menyimpan.
- [ ] Tidak ada duplikasi fungsi master.
- [ ] Mapping Modul dan Bagian sudah lengkap.
- [ ] Referensi karyawan aktif diperiksa sebelum menonaktifkan.
- [ ] Data historis dipertahankan.
- [ ] Dampak ke kontrak dan penempatan Produksi sudah diperiksa.

## 14. Navigasi KBase Administrasi Sistem

- Kembali ke [Indeks Administrasi Sistem](../../KBASE_ADMINISTRASI_SISTEM.md).
- Sebelumnya: [User & Hak Akses](./KBASE_USER_DAN_HAK_AKSES.md).
- Lanjut ke [Audit Trail](./KBASE_AUDIT_TRAIL.md).
- Lihat juga [Pengaturan Sistem](./KBASE_PENGATURAN_SISTEM.md).

