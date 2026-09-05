# Knowledge Base - Periode dan Kesiapan Payroll

> Modul: Payroll
>
> Bagian: Periode Payroll dan readiness
>
> Audiens: Payroll Finance, Super Admin, Direksi, HR, dan tim support
>
> Terakhir diverifikasi: 5 September 2026

Panduan ini menjelaskan cara membuat periode, memahami status, membaca hasil
pemeriksaan kesiapan, dan membatalkan periode Draft melalui **Payroll > Periode
Payroll**.

## 1. Sebelum membuat periode

Pastikan site dan jenis Payroll sudah benar. Siapkan lebih dahulu:

- policy aktif yang mencakup seluruh rentang;
- histori employment dan kontrak yang tidak ambigu;
- Attendance yang sudah difinalisasi untuk tanggal yang wajib diproses;
- keputusan koreksi dan klasifikasi Attendance yang masih Pending;
- transaksi Produksi `POSTED` untuk Borongan;
- tarif Harian/Training atau gaji pokok Bulanan yang lengkap;
- shift dan kalender kerja untuk skema berbasis waktu.

Membuat periode belum menghitung nominal dan belum menerbitkan slip.

## 2. Membuat periode Borongan

Periode Borongan memakai rentang tanggal yang dipilih sendiri.

1. Klik **Buat periode**.
2. Pilih site.
3. Pilih jenis Payroll **Borongan**.
4. Isi **Dari tanggal** dan **Sampai tanggal**.
5. Klik **Periksa kesiapan**.
6. Periksa policy, populasi, blocker, dan peringatan.
7. Isi tanggal pembayaran, nama periode, dan catatan jika diperlukan.
8. Simpan periode.

Rentang maksimal adalah 31 hari termasuk tanggal awal dan akhir. Rentang
Borongan tidak harus Senin-Minggu dan boleh melintasi pergantian bulan.

## 3. Membuat periode Harian, Training, atau Bulanan

Jenis berbasis waktu menggunakan tanggal acuan.

1. Pilih site dan jenis Payroll.
2. Pilih satu **Tanggal acuan periode**.
3. Sistem mencari policy yang berlaku pada tanggal tersebut.
4. Sistem menentukan awal dan akhir periode.
5. Klik **Periksa kesiapan** sebelum menyimpan.

Harian dan Training dibuat sebagai periode terpisah walaupun sama-sama memakai
rentang Senin-Minggu. Bulanan mengikuti cutoff policy; konfigurasi awal memakai
tanggal 1 sampai akhir bulan.

Jangan memecah periode mingguan hanya karena melewati pergantian bulan.

## 4. Tanggal pembayaran dan identitas periode

- Tanggal pembayaran boleh dikosongkan.
- Jika diisi, tanggal pembayaran tidak boleh sebelum tanggal akhir periode.
- Nama periode boleh dikosongkan; sistem membuat nama otomatis.
- Kode periode dibuat sistem dan memuat site, jenis Payroll, rentang, serta
  bagian identitas unik.

Tanggal pembayaran adalah rencana administratif. Nilai tersebut tidak berarti
transfer sudah dijalankan.

## 5. Aturan overlap

Periode aktif tidak boleh bertumpang tindih dengan periode non-Cancelled lain
pada site dan identitas skema yang sama. Site atau jenis Payroll yang berbeda
dapat memiliki rentang tanggal yang sama bila policy dan datanya sah.

Jika site, jenis, atau tanggal salah, batalkan periode saat masih Draft lalu
buat periode pengganti. Periode Draft tidak diedit agar histori tetap jelas.

## 6. Memahami status periode

| Status | Arti operasional |
|---|---|
| **Draft** | Periode sudah dibuat, belum memiliki hasil hitung, dan masih dapat dibatalkan. |
| **Calculated** | Current run simulasi berhasil dihitung. Periode dapat diperiksa dan diajukan. |
| **Approved** | Current run sudah disetujui dan siap ditutup jika integritas tetap valid. |
| **Closed** | Current run sudah menjadi FINAL dan periode terkunci permanen. Belum tentu dibayar. |
| **Cancelled** | Periode Draft dibatalkan dan tidak diproses lebih lanjut. |

## 7. Memahami status kesiapan

Kesiapan membaca data terbaru. Kesiapan bukan hasil hitung dan bukan snapshot
run.

| Status kesiapan | Arti |
|---|---|
| **Siap** | Tidak ada masalah yang menghalangi perhitungan. |
| **Perlu perhatian** | Ada peringatan yang perlu diperiksa, tetapi perhitungan boleh dilanjutkan. |
| **Belum siap** | Ada blocker yang harus diselesaikan sebelum menghitung. |

### 7.1 Blocker umum

- tanggal akhir periode belum lewat;
- finalisasi Attendance belum lengkap, gagal, atau masih berjalan;
- koreksi atau klasifikasi Attendance masih Pending;
- histori employment, kontrak, shift, atau sumber populasi tidak valid;
- tidak ada populasi atau transaksi yang dapat dihitung;
- transaksi Produksi terkunci atau sudah dipakai secara tidak sesuai;
- policy, tarif harian, gaji pokok, atau mata uang tidak valid;
- formula komponen belum didukung;
- periode lain masih memproses sumber yang sama.

### 7.2 Peringatan umum

- rekening pembayaran karyawan belum lengkap;
- karyawan Borongan masuk karena komponen tetapi tidak memiliki transaksi Produksi;
- ditemukan Alpha, terlambat, atau pulang awal;
- Attendance Hadir terjadi pada hari nonkerja untuk Harian/Training.

Rekening belum lengkap adalah peringatan. Kondisi itu tidak menghilangkan hak
upah dan tidak memblokir hitung, submit, approval, atau closing. Dampaknya baru
menjadi pembatas ketika membuat Daftar Pembayaran bank. Karena layar saat ini
mengekspor seluruh run, satu snapshot rekening yang belum lengkap akan menolak
file tersebut.

## 8. Membaca preview kesiapan berbasis waktu

Preview Harian, Training, dan Bulanan dapat menampilkan:

- rentang eligibility per karyawan;
- hari Hadir yang dapat dibayar;
- Hadir pada hari nonkerja;
- hari Alpha, Izin, dan hari kerja terjadwal;
- cakupan tarif atau gaji pokok;
- estimasi bruto, potongan, dan neto;
- masalah per karyawan serta menu tindak lanjut.

Preview ini tidak membuat run dan belum menjadi hasil finansial resmi.

## 9. Tindak lanjut blocker

Ikuti tautan tindakan pada pesan kesiapan bila tersedia:

- masalah Attendance: selesaikan monitoring, koreksi, klasifikasi, finalisasi,
  atau Rekap Attendance;
- masalah Produksi: periksa transaksi, pekerjaan, penugasan, dan tarif Produksi;
- masalah kontrak atau penempatan: perbaiki melalui workflow Karyawan;
- masalah policy, tarif harian, atau gaji pokok: buka **Skema Upah & Tarif**.

Muat ulang kesiapan setelah sumber diperbaiki. Jangan mengubah data langsung di
database untuk melewati blocker.

## 10. Membatalkan periode

Periode hanya dapat dibatalkan saat berstatus **Draft**.

1. Buka detail periode.
2. Pilih **Batalkan periode**.
3. Isi alasan minimal lima karakter.
4. Konfirmasi pembatalan.

Pembatalan tidak menghapus Attendance, Produksi, policy, atau histori karyawan.
Rentang periode yang dibatalkan dapat digunakan untuk periode pengganti.

## 11. Pemeriksaan akhir sebelum menghitung

- [ ] Site, jenis Payroll, dan rentang tanggal benar.
- [ ] Policy snapshot sesuai jenis periode.
- [ ] Tanggal pembayaran tidak dibaca sebagai status pembayaran.
- [ ] Seluruh blocker sudah nol.
- [ ] Semua peringatan sudah dipahami dan dicatat bila perlu.
- [ ] Pending koreksi dan klasifikasi Attendance sudah diselesaikan.
- [ ] Data rekening diperiksa jika Daftar Pembayaran bank akan dibutuhkan.

## 12. Solusi masalah umum

| Kondisi | Tindakan |
|---|---|
| Tombol Buat periode tidak terlihat | Periksa hak hitung Payroll dan akses site akun. |
| Policy aktif belum tersedia | Lengkapi policy yang mencakup seluruh rentang pada Skema Upah & Tarif. |
| Periode overlap | Cari periode aktif pada site dan skema yang sama; batalkan Draft yang salah. |
| Periode belum siap karena Attendance | Finalisasi tanggal-site dan selesaikan seluruh workflow Pending. |
| Populasi kosong | Periksa histori employment, kontrak, jenis karyawan, serta sumber Produksi/Attendance. |
| Tanggal pembayaran ditolak | Pilih tanggal yang sama dengan atau setelah tanggal akhir periode. |
| Rekening tidak lengkap | Boleh lanjut Payroll, tetapi lengkapi lalu hitung ulang sebelum closing jika Daftar Pembayaran dibutuhkan. |
| Periode salah tetapi tidak dapat dibatalkan | Pembatalan hanya untuk Draft; periode yang sudah dihitung mengikuti workflow Payroll. |

## 13. Navigasi KBase Payroll

- Kembali ke [Indeks Payroll](../../KBASE_PAYROLL.md).
- Sebelumnya: [Skema Upah dan Tarif](./KBASE_SKEMA_UPAH_DAN_TARIF.md).
- Lanjut ke [Simulasi dan Komponen Payroll](./KBASE_SIMULASI_DAN_KOMPONEN_PAYROLL.md).
