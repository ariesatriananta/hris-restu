# Knowledge Base - User & Hak Akses

> Modul: Administrasi Sistem
>
> Bagian: User & Hak Akses
>
> Audiens: Super Admin dan tim support yang berwenang
>
> Terakhir diverifikasi: 8 September 2026
>
> Status: aktif; pengelolaan hanya tersedia untuk Super Admin

Panduan ini menjelaskan cara mengelola akun, role, permission, status akun, dan
cakupan site melalui **Administrasi Sistem > User & Hak Akses**.

## 1. Hak akses halaman

Halaman dan seluruh API pengelolaannya hanya menerima akun dengan role
`SUPER_ADMIN`. Mengetahui URL halaman tidak memberi hak akses tambahan.

Halaman mempunyai dua tab:

- **Pengguna** untuk data akun, role, site, status, dan kata sandi awal;
- **Hak Akses** untuk melihat serta mengubah permission role sistem.

## 2. Memahami role, permission, dan site

| Istilah | Fungsi |
|---|---|
| Role | Kelompok kewenangan yang ditempelkan ke pengguna. Satu pengguna dapat memiliki lebih dari satu role. |
| Permission | Izin tindakan tertentu, misalnya melihat audit atau mengelola karyawan. |
| Akses site | Daftar site yang boleh dijangkau pengguna non-global. |
| Site utama | Site bawaan pengguna; harus termasuk dalam daftar akses site. |

Role `SUPER_ADMIN` dan `DIRECTOR` diperlakukan sebagai role global dalam
validasi cakupan site. Pengguna yang memiliki role non-global wajib memiliki
minimal satu akses site.

Permission tidak menggantikan scope site. Pengguna dapat memiliki permission
yang benar tetapi tetap ditolak ketika mengakses site di luar cakupannya.

## 3. Membuat pengguna

1. Buka tab **Pengguna**.
2. Klik **Tambah User**.
3. Isi nama lengkap dan username.
4. Isi email dan nomor telepon bila tersedia.
5. Pilih status akun.
6. Pilih minimal satu role.
7. Pilih akses site untuk role non-global, lalu tentukan site utama bila perlu.
8. Buat kata sandi awal.
9. Simpan dan sampaikan kredensial melalui kanal yang aman.

Aturan input utama:

- nama minimal 2 dan maksimal 150 karakter;
- username 3-100 karakter serta hanya memakai huruf, angka, titik, garis
  bawah, atau tanda hubung;
- email, bila diisi, harus valid dan unik;
- username harus unik;
- kata sandi 8-128 karakter serta mengandung huruf dan angka;
- role dan site yang dipilih harus aktif.

Pengguna baru diwajibkan mengganti kata sandi saat login berikutnya.

## 4. Mencari dan memeriksa pengguna

Daftar dapat dicari berdasarkan nama, username, atau email serta difilter
berdasarkan site, role, dan status. Tabel menampilkan pengguna, role, akses
site, login terakhir, dan status.

Pilih aksi **Lihat detail** untuk memeriksa:

- identitas dan kontak akun;
- status serta kewajiban mengganti kata sandi;
- role yang terpasang;
- akses site dan site utama;
- waktu login terakhir dan informasi penguncian akun yang tersedia.

## 5. Mengubah pengguna

1. Pilih aksi **Ubah user**.
2. Perbarui identitas, status, role, atau site.
3. Pastikan site utama tetap berada dalam daftar akses site.
4. Simpan perubahan.

Jika status, role, atau akses site berubah, sesi aktif pengguna terkait dicabut
agar kewenangan lama tidak terus dipakai. Pengguna mungkin harus login kembali.

Pengaman yang diterapkan sistem:

- akun yang sedang dipakai tidak dapat dinonaktifkan atau dikunci;
- role Super Admin tidak dapat dilepas dari akun Super Admin yang sedang dipakai;
- sistem harus selalu memiliki minimal satu Super Admin aktif.

## 6. Status akun

| Status | Arti operasional |
|---|---|
| Aktif (`ACTIVE`) | Akun dapat digunakan sesuai role, permission, dan site. Mengaktifkan kembali akun juga membersihkan penghitung kegagalan serta waktu lock. |
| Tidak aktif (`INACTIVE`) | Akun dinonaktifkan secara administratif. |
| Terkunci (`LOCKED`) | Akun tidak dapat dipakai sampai diaktifkan kembali oleh administrator. |

Jangan memakai status Tidak aktif sebagai pengganti pencabutan role bila akun
masih harus dapat login dengan kewenangan lain.

## 7. Reset kata sandi

Reset kata sandi tersedia untuk pengguna lain, bukan akun Super Admin yang
sedang melakukan tindakan.

1. Pilih aksi **Atur ulang password**.
2. Masukkan kata sandi baru yang memenuhi aturan.
3. Konfirmasi reset.
4. Kirim kata sandi sementara melalui kanal aman.

Reset akan mencabut sesi aktif pengguna, menghapus kondisi lock, dan mewajibkan
pengguna mengganti kata sandi pada login berikutnya. Gunakan **Profil Saya**
untuk mengganti kata sandi akun sendiri.

## 8. Mengatur permission role

1. Buka tab **Hak Akses**.
2. Periksa jumlah pengguna dan permission role.
3. Pilih **Lihat hak akses** untuk membaca rinciannya.
4. Untuk role yang dapat diubah, pilih **Ubah hak akses**.
5. Centang permission yang memang dibutuhkan lalu simpan.

Hanya role sistem yang dapat diperbarui melalui halaman ini. Permission role
`SUPER_ADMIN` selalu penuh dan tidak dapat diubah. Perubahan permission role
mencabut sesi aktif pengguna pada role tersebut, kecuali sesi administrator
yang sedang menyimpan, agar permission baru berlaku pada sesi berikutnya.

Halaman ini tidak membuat role baru dan tidak menghapus role.

## 9. Praktik keamanan

- Beri akun pribadi untuk setiap orang; jangan gunakan akun bersama.
- Hindari memberikan Super Admin untuk pekerjaan operasional harian.
- Periksa kembali role dan site ketika seseorang pindah unit atau site.
- Jangan memasukkan kata sandi ke catatan, screenshot, tiket publik, atau Audit
  Trail.
- Setelah reset, minta pengguna segera login dan mengganti kata sandi sementara.
- Periksa perubahan penting melalui [Audit Trail](./KBASE_AUDIT_TRAIL.md).

## 10. Solusi masalah umum

| Kondisi | Tindakan |
|---|---|
| Halaman tidak dapat dibuka | Pastikan akun memiliki role Super Admin, lalu login ulang bila role baru saja diubah. |
| Site tidak dapat dipilih | Pastikan site masih aktif. |
| Simpan ditolak karena site | Role non-global memerlukan minimal satu site; site utama juga harus ada di daftar akses. |
| Tidak dapat menonaktifkan akun sendiri | Gunakan Super Admin aktif lain. Pengaman ini memang disengaja. |
| Tidak dapat melepas Super Admin terakhir | Aktifkan atau siapkan Super Admin pengganti terlebih dahulu. |
| Pengguna mendadak keluar setelah perubahan | Perubahan akses atau reset kata sandi memang mencabut sesi lama. Minta pengguna login kembali. |
| Permission Super Admin tidak dapat diedit | Super Admin selalu memiliki akses penuh. Ini bukan error. |

## 11. Checklist akhir

- [ ] Username dan email tidak dipakai akun lain.
- [ ] Role sesuai tanggung jawab pengguna.
- [ ] Scope site tidak lebih luas dari kebutuhan.
- [ ] Site utama termasuk dalam akses site.
- [ ] Sedikitnya satu Super Admin tetap aktif.
- [ ] Kata sandi sementara disampaikan melalui kanal aman.
- [ ] Perubahan penting terverifikasi pada Audit Trail.

## 12. Navigasi KBase Administrasi Sistem

- Kembali ke [Indeks Administrasi Sistem](../../KBASE_ADMINISTRASI_SISTEM.md).
- Lanjut ke [Master Data](./KBASE_MASTER_DATA.md).
- Lihat juga [Audit Trail](./KBASE_AUDIT_TRAIL.md).

