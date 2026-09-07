# Knowledge Base - Administrasi Sistem

> Modul: Administrasi Sistem
>
> Audiens: Super Admin, HR Officer, administrator site, auditor internal, dan tim support HRIS
>
> Terakhir diverifikasi: 8 September 2026
>
> Status: aktif; panduan dibagi mengikuti menu Administrasi Sistem yang tersedia

Knowledge Base Administrasi Sistem membantu Anda mengelola akun dan kewenangan,
menjaga master organisasi, menelusuri aktivitas, memantau rekonsiliasi terjadwal,
serta mengatur identitas dan kebijakan global aplikasi. Gunakan panduan sesuai
tugas yang sedang Anda kerjakan.

## Pilih panduan

| Panduan | Gunakan ketika |
|---|---|
| [User & Hak Akses](./kbase/administrasi-sistem/KBASE_USER_DAN_HAK_AKSES.md) | Membuat atau memperbarui akun, menentukan role dan cakupan site, mereset kata sandi, atau mengatur permission role sistem. |
| [Master Data](./kbase/administrasi-sistem/KBASE_MASTER_DATA.md) | Mengelola Departemen, Jabatan, Modul Produksi, Bagian Produksi, atau mapping Modul dan Bagian. |
| [Audit Trail](./kbase/administrasi-sistem/KBASE_AUDIT_TRAIL.md) | Menelusuri aktivitas, pelaku, waktu, site, alasan, dan perubahan data yang dicatat aplikasi. |
| [Monitoring Cron](./kbase/administrasi-sistem/KBASE_MONITORING_CRON.md) | Memeriksa rekonsiliasi kontrak, mutasi terjadwal, perubahan status kerja, kegagalan proses, atau menjalankan rekonsiliasi manual. |
| [Pengaturan Sistem](./kbase/administrasi-sistem/KBASE_PENGATURAN_SISTEM.md) | Mengatur profil perusahaan, sumber template kontrak, target produksi kontrak, atau membaca konfigurasi efektif Attendance. |

## Peta menu dan kewenangan

| Menu | Kemampuan utama | Batas akses penting |
|---|---|---|
| User & Hak Akses | Kelola pengguna, role, permission, dan site | Hanya Super Admin. |
| Master Data | Kelola struktur organisasi dan penempatan produksi | Membaca memerlukan `employees.view`; perubahan memerlukan `employees.manage`. Sejumlah data global dibatasi lebih ketat. |
| Audit Trail | Cari dan baca aktivitas sistem | Memerlukan `audit.view`; pengguna non-Super Admin hanya melihat aktivitas dari site yang diizinkan. |
| Monitoring Cron | Pantau riwayat rekonsiliasi | Daftar memerlukan `audit.view`; eksekusi manual juga memerlukan `employees.manage` dan role Super Admin. |
| Pengaturan | Kelola identitas dan kebijakan global | Hanya Super Admin dengan `settings.manage`. |

Tampilan menu bukan pengaman satu-satunya. Backend tetap memeriksa role,
permission, dan scope site pada setiap permintaan.

## Alur administrasi yang disarankan

1. Siapkan struktur organisasi dan produksi pada **Master Data**.
2. Buat pengguna serta berikan role dan site secukupnya pada **User & Hak Akses**.
3. Lengkapi identitas dan kebijakan global pada **Pengaturan Sistem**.
4. Pantau proses lifecycle karyawan melalui **Monitoring Cron**.
5. Gunakan **Audit Trail** untuk memeriksa tindakan penting dan perubahan data.

Urutan tersebut bukan workflow yang mengunci layar. Urutan ini membantu
mencegah akun menerima akses sebelum master dan tanggung jawabnya jelas.

## Prinsip pengelolaan yang wajib dijaga

- Terapkan **least privilege**: berikan hanya permission dan site yang dibutuhkan.
- Jangan memakai satu akun untuk beberapa orang karena Audit Trail mencatat
  pelaku berdasarkan akun.
- Jangan menghapus master yang sudah mempunyai histori. Nonaktifkan bila data
  masih harus dipertahankan untuk referensi lama.
- Perubahan profil dan kontrak berlaku untuk keluaran baru. Snapshot dokumen
  lama tidak ditulis ulang.
- Status cron **Berhasil** berarti proses sistem selesai, bukan berarti semua
  konflik bisnis otomatis terselesaikan.
- Audit Trail membantu penelusuran, tetapi bukan tempat memperbaiki data.
- Jangan mengubah tabel langsung untuk melewati validasi aplikasi.

## Batas sistem saat ini

- Menu **Template Dokumen** tidak menjadi menu aktif Administrasi Sistem.
- Pengaturan jadwal atau ekspresi cron tidak tersedia dari antarmuka.
- Monitoring Cron saat ini berfokus pada rekonsiliasi lifecycle kontrak,
  mutasi terjadwal, dan perubahan status kerja terjadwal; bukan seluruh proses
  background aplikasi.
- Audit Trail tidak menyediakan tombol untuk mengembalikan perubahan.
- Dari jenis template kontrak yang ditampilkan, hanya **PKWT Borongan** yang
  ditandai tersedia pada halaman Pengaturan saat ini.
- Konfigurasi Attendance pada Pengaturan Sistem bersifat read-only; perubahan
  dilakukan pada sumber resmi yang disebutkan di halaman.

## Urutan baca yang disarankan

1. [Master Data](./kbase/administrasi-sistem/KBASE_MASTER_DATA.md)
2. [User & Hak Akses](./kbase/administrasi-sistem/KBASE_USER_DAN_HAK_AKSES.md)
3. [Pengaturan Sistem](./kbase/administrasi-sistem/KBASE_PENGATURAN_SISTEM.md)
4. [Monitoring Cron](./kbase/administrasi-sistem/KBASE_MONITORING_CRON.md)
5. [Audit Trail](./kbase/administrasi-sistem/KBASE_AUDIT_TRAIL.md)

