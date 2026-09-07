# Knowledge Base - Pengaturan Sistem

> Modul: Administrasi Sistem
>
> Bagian: Pengaturan
>
> Audiens: Super Admin dan tim support yang berwenang
>
> Terakhir diverifikasi: 8 September 2026
>
> Status: aktif; pengelolaan hanya tersedia untuk Super Admin

Panduan ini menjelaskan tiga tab pada **Administrasi Sistem > Pengaturan**:
**Profil Perusahaan**, **Kontrak Karyawan**, dan **Attendance**.

## 1. Hak akses dan sumber data

Halaman hanya tersedia untuk Super Admin dengan permission `settings.manage`.
Konfigurasi tersimpan yang dapat diedit dicatat pada `system_settings`, sedangkan
sebagian nilai teknis Attendance berasal dari environment atau kebijakan tetap
aplikasi.

Setiap kartu Attendance menampilkan label sumber agar Anda tidak salah mencari
tombol simpan untuk nilai yang memang dikelola di tempat lain.

## 2. Profil Perusahaan

Tab Profil Perusahaan menyimpan satu identitas global yang digunakan fitur dan
dokumen baru yang membaca Pengaturan Sistem.

### 2.1 Field profil

| Kelompok | Field | Aturan |
|---|---|---|
| Identitas Legal | Nama perusahaan | Wajib, maksimal 150 karakter. |
| Identitas Legal | Alamat kantor pusat | Wajib, maksimal 500 karakter. |
| Identitas Legal | NPWP | Opsional, maksimal 50 karakter. |
| Kontak Resmi | Nomor telepon | Opsional, maksimal 30 karakter. |
| Kontak Resmi | Email | Opsional; jika diisi harus berupa email valid. |
| Kontak Resmi | Website | Opsional; jika diisi harus berupa URL lengkap `http` atau `https`. |
| Logo Perusahaan | Logo | JPG, PNG, atau WebP, maksimal 10 MB. |

Gunakan logo berlatar transparan agar hasil dokumen lebih rapi. Memilih **Hapus
logo** baru mengubah draft; perubahan efektif setelah profil disimpan.

### 2.2 Menyimpan profil

1. Perbarui field yang diperlukan.
2. Pilih atau hapus logo bila perlu.
3. Periksa pesan validasi.
4. Klik **Simpan perubahan**.
5. Konfirmasi penyimpanan.

Halaman melindungi draft yang belum disimpan ketika Anda mencoba berpindah.
Perubahan profil disinkronkan ke identitas pihak pertama kontrak untuk nama
perusahaan dan alamat kantor pusat.

## 3. Dampak profil terhadap dokumen

Perubahan profil digunakan oleh fitur yang mengambil identitas perusahaan
setelah perubahan disimpan. Dokumen lama yang sudah menjadi snapshot tetap
mempertahankan identitas saat snapshot tersebut dibuat.

Jangan mengharapkan perubahan logo atau alamat menulis ulang file atau snapshot
kontrak lama.

## 4. Kontrak Karyawan - Pihak Pertama

Kartu **Pihak Pertama** mengatur identitas yang tampil pada template PKWT:

- nama perusahaan, dibaca dari Profil Perusahaan;
- nama direktur;
- jabatan direktur;
- alamat kantor pusat, dibaca dari Profil Perusahaan.

Nama perusahaan dan alamat bersifat read-only pada tab Kontrak. Gunakan tautan
**Ubah di Profil Perusahaan** untuk memperbaruinya. Nama serta jabatan direktur
dapat diubah dari tab Kontrak.

Seluruh field Pihak Pertama wajib terisi saat bagian ini diubah.

## 5. Kontrak Karyawan - Target Produksi

Target kontrak ditentukan per kombinasi site dan Bagian Produksi aktif. Daftar
juga menampilkan Modul yang memakai Bagian tersebut.

1. Cari site dan Bagian yang akan dikonfigurasi.
2. Isi nilai target lebih dari `0`.
3. Isi satuan target, misalnya `batang per-jam kerja`.
4. Periksa jumlah perubahan pada panel bawah.
5. Simpan dan konfirmasi.

Jika Bagian yang dibutuhkan tidak muncul, periksa Modul, Bagian, dan mapping
aktif pada [Master Data](./KBASE_MASTER_DATA.md).

Target yang belum dikonfigurasi ditandai **Belum diatur**. Data tersebut dapat
menjadi penghambat ketika aplikasi membuat snapshot cetak PKWT Borongan untuk
Bagian terkait.

## 6. Ketersediaan template kontrak

Halaman saat ini menampilkan status berikut:

| Jenis template | Status |
|---|---|
| PKWT Borongan | Tersedia |
| PKWT Harian | Belum tersedia |
| PKWT Bulanan | Belum tersedia |
| Training | Belum tersedia |
| PKWTT | Belum tersedia |

Label **Belum tersedia** adalah informasi, bukan kontrol yang dapat diaktifkan.
Jangan menjanjikan hasil cetak untuk template yang belum ditandai tersedia.

## 7. Attendance - Konfigurasi Efektif

Tab Attendance bersifat read-only dan menampilkan:

| Nilai | Sumber | Arti |
|---|---|---|
| Mulai berlaku | Environment | Batas awal data Attendance yang diproses aplikasi, berasal dari `ATTENDANCE_GO_LIVE_DATE`. |
| Zona waktu | Kebijakan aplikasi | Acuan business date dan waktu scan, yaitu `Asia/Jakarta`. |
| Tenggang finalisasi | Kebijakan tetap | Jeda setelah akhir shift sebelum Alpha dapat dibentuk. |
| Kehadiran Produksi | Pengaturan sistem | Nilai kebijakan apakah kehadiran diwajibkan untuk transaksi Produksi. |

Perubahan tanggal go-live memerlukan pembaruan environment serta restart atau
redeploy layanan API agar nilai baru dibaca proses. Master Shift, Kalender
Kerja, dan Perangkat tetap dikelola melalui menu Attendance masing-masing.

> Catatan: pada build yang diverifikasi, kartu Kehadiran Produksi masih dapat
> menampilkan penanda **direncanakan** dari metadata Pengaturan. Operasional
> Setoran Produksi saat ini sudah menerapkan gate Hadir dan scan Masuk terminal
> sukses. Gunakan perilaku Terminal Produksi dan panduan Attendance sebagai
> acuan operasional, bukan penanda metadata tersebut.

## 8. Pemeriksaan kesiapan Attendance

Tab Attendance juga menampilkan panel kesiapan konfigurasi. Gunakan tombol
tindakan yang tersedia untuk membuka:

- Master Shift;
- Kalender Kerja;
- Master Perangkat.

Panel ini membantu menemukan konfigurasi dasar yang belum lengkap. Panel tidak
menggantikan Monitoring Harian, penyelesaian koreksi/klasifikasi, atau
finalisasi Attendance.

## 9. Solusi masalah umum

| Kondisi | Tindakan |
|---|---|
| Halaman tidak dapat dibuka | Pastikan akun adalah Super Admin dan memiliki `settings.manage`, lalu login ulang jika akses baru diubah. |
| Profil tidak dapat disimpan | Pastikan nama dan alamat terisi; validasi format email dan URL. |
| Logo ditolak | Gunakan JPG/PNG/WebP maksimal 10 MB dan pastikan layanan penyimpanan file tersedia. |
| Nama perusahaan pada Kontrak tidak dapat diketik | Field membaca Profil Perusahaan. Gunakan tautan Ubah di Profil Perusahaan. |
| Bagian target tidak muncul | Aktifkan struktur dan mapping pada Master Data. |
| Target ditolak | Nilai harus lebih dari 0 dan satuan wajib diisi. |
| Tanggal go-live tidak dapat diedit | Nilai berasal dari environment, bukan form database. |
| Nilai environment sudah diubah tetapi UI masih lama | Restart/redeploy API lalu muat ulang; periksa environment pada proses yang benar. |
| Dokumen lama tidak berubah | Snapshot lama memang dipertahankan. Buat snapshot baru bila workflow mengizinkan. |

## 10. Checklist sebelum menyimpan

- [ ] Nama legal dan alamat kantor pusat sudah benar.
- [ ] Kontak opsional memakai format valid.
- [ ] Logo sesuai format dan ukuran.
- [ ] Nama dan jabatan direktur benar.
- [ ] Seluruh target Bagian yang dipakai kontrak sudah terisi.
- [ ] Dampak hanya untuk keluaran baru sudah dipahami.
- [ ] Konfigurasi Attendance dibaca dari sumber yang benar.

## 11. Navigasi KBase Administrasi Sistem

- Kembali ke [Indeks Administrasi Sistem](../../KBASE_ADMINISTRASI_SISTEM.md).
- Sebelumnya: [Monitoring Cron](./KBASE_MONITORING_CRON.md).
- Lihat juga [Master Data](./KBASE_MASTER_DATA.md).
- Lihat juga [Pengaturan Attendance](../attendance/KBASE_PENGATURAN_ATTENDANCE.md).

