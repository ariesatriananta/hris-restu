# Knowledge Base - Audit Trail

> Modul: Administrasi Sistem
>
> Bagian: Audit Trail
>
> Audiens: Super Admin, auditor internal, HR, dan pengguna dengan izin audit
>
> Terakhir diverifikasi: 8 September 2026
>
> Status: aktif; halaman bersifat read-only

Panduan ini menjelaskan cara menelusuri aktivitas penting dan perubahan data
melalui **Administrasi Sistem > Audit Trail**.

## 1. Tujuan Audit Trail

Audit Trail membantu menjawab:

- tindakan apa yang dilakukan;
- siapa pelakunya atau apakah tindakan berasal dari sistem;
- kapan tindakan terjadi;
- site mana yang terkait;
- record atau referensi apa yang berubah;
- nilai sebelum dan sesudah yang memang dicatat;
- alasan dan informasi teknis permintaan bila tersedia.

Audit Trail bukan alat untuk mengedit, menghapus, atau mengembalikan data.
Perbaikan tetap dilakukan melalui workflow modul sumber.

## 2. Hak akses dan cakupan data

Halaman memerlukan permission `audit.view`.

- Super Admin dapat melihat aktivitas seluruh site serta aktivitas global.
- Pengguna non-Super Admin hanya menerima aktivitas yang terkait dengan site
  pada akses akunnya.
- Aktivitas global tanpa site tidak ditampilkan kepada pengguna non-Super Admin
  pada implementasi saat ini.

Backend menerapkan scope tersebut pada daftar, pilihan filter, dan detail.
Menyalin UID aktivitas dari akun lain tidak dapat melewati batas site.

## 3. Membaca daftar aktivitas

Daftar diurutkan dari aktivitas terbaru dan menampilkan:

| Kolom | Arti |
|---|---|
| Waktu | Waktu aktivitas yang dicatat aplikasi. |
| Aktivitas | Deskripsi dan alasan bila tersedia. |
| Modul | Domain sumber seperti Karyawan, Attendance, Produksi, Payroll, atau Administrasi Sistem. |
| Aksi | Jenis tindakan, misalnya Membuat, Mengubah, Menyetujui, Ekspor, atau Mencetak. |
| Pelaku | Nama akun atau **Sistem** untuk proses otomatis. |
| Site | Site terkait atau **Global** bila tidak terikat site. |

Label aksi yang tersedia meliputi Membuat, Mengubah, Menghapus, Membatalkan,
Menyetujui, Menolak, Masuk, Keluar, Ekspor, Mencetak, Menutup periode/proses,
dan Aktivitas lain.

## 4. Pencarian dan filter

Gunakan pencarian untuk mencocokkan deskripsi, alasan, nama tabel, UID referensi,
nama pelaku, atau username. Anda juga dapat memfilter berdasarkan:

- satu atau beberapa modul;
- satu atau beberapa aksi;
- satu atau beberapa site;
- satu pelaku;
- tanggal awal dan tanggal akhir.

Rentang tanggal bersifat inklusif terhadap tanggal akhir. Tanggal awal tidak
boleh melewati tanggal akhir. Filter disimpan pada URL sehingga kondisi
penelusuran dapat dibagikan kepada pengguna yang memiliki izin setara.

## 5. Membaca rincian aktivitas

Klik aksi **Lihat rincian aktivitas** atau kartu pada tampilan seluler. Panel
rincian menampilkan tiga kelompok informasi:

1. **Informasi aktivitas**: waktu, pelaku, site, dan referensi.
2. **Perubahan data**: nilai sebelum dan sesudah yang disimpan.
3. **Informasi teknis**: request ID, alamat IP, dan jenis perangkat/peramban.

Jika panel menyatakan aktivitas tidak mengubah nilai atau rinciannya tidak
disimpan, itu tidak berarti aktivitas gagal. Beberapa event hanya mencatat
kejadian tanpa snapshot field.

## 6. Perlindungan data sensitif

Backend menyembunyikan field yang namanya mengindikasikan kata sandi, hash,
token, secret, cookie, authorization, credential, API key, private key, atau
session. Nilainya tampil sebagai **Informasi rahasia** dan tidak dikirim sebagai
nilai asli ke halaman.

Penyembunyian ini tidak berarti semua isi bebas dibagikan. Detail audit tetap
merupakan data internal dan dapat memuat identitas, alasan, alamat IP, atau
referensi proses.

## 7. Cara melakukan investigasi

1. Tentukan rentang waktu sesempit mungkin.
2. Pilih modul dan site yang terkait.
3. Cari nomor referensi, nama karyawan, atau nama pelaku.
4. Buka detail aktivitas sebelum dan sesudah kejadian utama.
5. Cocokkan request ID dan waktu bila ada beberapa aksi berdekatan.
6. Periksa workflow sumber untuk kondisi record saat ini.
7. Catat temuan tanpa menyalin data sensitif yang tidak diperlukan.

Satu aktivitas tidak selalu menjelaskan keseluruhan kejadian. Contohnya,
perubahan role dapat memicu pencabutan sesi, sedangkan proses cron dapat
menjalankan beberapa perubahan lifecycle dalam satu eksekusi.

## 8. Audit Trail dan Laporan Audit

Audit Trail dipakai untuk investigasi detail interaktif. Jika membutuhkan
keluaran laporan yang lebih ringkas, gunakan **Laporan > Audit Aktivitas
Pengguna** sesuai permission yang tersedia. Jangan menganggap laporan ringkas
memuat seluruh detail sebelum/sesudah dari panel Audit Trail.

## 9. Solusi masalah umum

| Kondisi | Tindakan |
|---|---|
| Menu tidak terlihat atau akses ditolak | Pastikan akun memiliki `audit.view`, lalu login kembali jika permission baru diubah. |
| Aktivitas tidak ditemukan | Perlebar tanggal, reset filter, periksa site, dan cari dengan nomor referensi atau pelaku. |
| Aktivitas global tidak terlihat | Pengguna non-Super Admin hanya melihat aktivitas site yang diizinkan. Gunakan Super Admin bila investigasi memang berwenang. |
| Nilai tampil sebagai Informasi rahasia | Nilai sengaja disembunyikan dan tidak dapat dibuka dari halaman. |
| Tidak ada perubahan data | Event mungkin hanya mencatat aktivitas, atau snapshot perubahan tidak disimpan. |
| Ingin membatalkan perubahan | Buka modul sumber dan gunakan workflow koreksi yang tersedia; Audit Trail tidak memiliki rollback. |

## 10. Checklist investigasi

- [ ] Permission dan scope site sesuai.
- [ ] Rentang tanggal benar.
- [ ] Modul, aksi, dan pelaku sudah difilter.
- [ ] Referensi dan request ID diperiksa.
- [ ] Aktivitas sebelum dan sesudah kejadian dibaca.
- [ ] Kondisi record terkini diperiksa pada modul sumber.
- [ ] Data rahasia tidak disalin ke kanal yang tidak aman.

## 11. Navigasi KBase Administrasi Sistem

- Kembali ke [Indeks Administrasi Sistem](../../KBASE_ADMINISTRASI_SISTEM.md).
- Sebelumnya: [Master Data](./KBASE_MASTER_DATA.md).
- Lanjut ke [Monitoring Cron](./KBASE_MONITORING_CRON.md).
- Lihat juga [User & Hak Akses](./KBASE_USER_DAN_HAK_AKSES.md).

