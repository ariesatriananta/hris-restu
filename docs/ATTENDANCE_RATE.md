# Attendance Rate - kapasitas harian per site

## Keputusan dan milestone

Keputusan Bos, 19 November 2026. Halaman baru di kategori Ringkasan, setelah Dashboard; akses hanya HR_OFFICER/SUPER_ADMIN. Implementasi bertahap:

1. **M1 - kategori**: master modul dan brand Reguler/Premium, histori tanggal efektif, pemetaan eksplisit data lama. Tersedia dalam perubahan kode ini; migrasi dijalankan Owner.
2. **M2 - Training**: perbaiki eligibility pencatatan produksi Training tanpa memasukkan hasil tersebut ke upah borongan.
3. **M3 - agregasi**: roster, attendance, AVG minggu sebelumnya dan estimasi box, dengan validasi scope/role.
4. **M4 - UI**: dashboard compact mengikuti susunan sistem lama, satu site/tanggal, mode screenshot.
5. **M5 - audit**: rekonsiliasi angka, role, histori, pergantian minggu dan alur koreksi/void.

M1 tidak menambahkan dashboard/API angka attendance, tidak mengubah eligibility Training, transaksi Produksi, Attendance atau Payroll.

## Fondasi kategori (M1)

- Kode kategori: `REGULER` atau `PREMIUM`; label UI Reguler/Premium. Kode `REGULAR` tidak digunakan.
- Master Modul Produksi dan Brand memakai atribut `production_category` nullable. Master baru default **Reguler**, termasuk histori mulai hari ini WIB. Data lama yang belum dipetakan tetap NULL sampai dipetakan melalui form atau SQL Owner. Tidak ada tebakan berdasarkan nama modul/brand atau site.
- Kategori modul menjadi sumber pengelompokan roster/karyawan. Satu modul diasumsikan tidak mencampur Reguler/Premium dalam satu hari. Kategori brand menjadi sumber pengelompokan fakta hasil produksi yang memiliki brand. Belum ada aturan yang memaksa modul dan seluruh brand di site memiliki kategori sama; M3 harus melaporkan data tidak terpetakan/konflik, bukan mengarang kategorinya.
- Histori per master disimpan terpisah pada `production_module_category_histories` dan `production_brand_category_histories`. Periode inklusif: `effective_from <= tanggal` dan `effective_to IS NULL OR effective_to >= tanggal`.
- Atribut kategori pada master adalah cache kategori saat ini; laporan tanggal lampau wajib membaca histori. Jangan memakai kategori saat ini untuk seluruh transaksi/penempatan lama.
- Pemetaan pertama boleh dimulai pada tanggal lampau atau hari ini menurut WIB. Owner/operator harus memilih tanggal berdasarkan kondisi lapangan yang diketahui. Tanggal sebelum pemetaan tetap **Belum dipetakan**, tanpa fallback ke kategori sekarang.
- Kategori dan tanggal efektif periode terakhir dapat diedit, termasuk hari yang sama atau backdate. Perubahan kategori dengan tanggal setelah awal periode terakhir membuat periode baru dan menutup sebelumnya H-1. Koreksi kategori pada awal periode yang sama/lebih awal, atau perubahan tanggal saja, memperbarui periode terakhir; akhir periode sebelumnya ikut disesuaikan. Awal periode terakhir wajib setelah awal periode sebelumnya. Tanggal masa depan ditolak.
- Menyimpan kategori sama tanpa perubahan tanggal tidak membuat histori baru. Mengosongkan kategori yang sudah dipetakan tidak didukung. Koreksi kategori/tanggal dapat mengubah pengelompokan laporan lampau; audit master mencatat keadaan sebelum/sesudah dalam transaksi yang sama.
- UI menampilkan tanggal efektif saat kategori terpilih, memakai tanggal tersimpan ketika edit. Kategori dan tanggal dapat diedit tanpa kunci hari yang sama. Master baru default Reguler; master lama NULL tetap Belum dipetakan sampai pengguna memetakannya.
- Master yang memiliki histori kategori tidak dapat dihapus secara fisik; gunakan nonaktifkan. Relasi histori memakai `ON DELETE RESTRICT`. Pemindahan site master yang sudah mempunyai histori kategori harus ditolak untuk menjaga interpretasi histori per site.
- Hak kelola mengikuti permission master yang sudah berlaku (`employees.manage` pada modul, `production.manage_master` pada brand), dengan pembatasan site/QC tetap utuh. Akses dashboard HR/Superadmin ditegakkan terpisah pada M3/M4.

## Kontrak master

Create/update menerima field opsional:

```json
{"productionCategory":"REGULER","categoryEffectiveFrom":"2026-11-01"}
```

`categoryEffectiveFrom` hanya boleh disertakan bersama kategori. Jika tanggal dihilangkan, server memakai hari ini WIB untuk kategori baru/perubahan. PATCH tanpa dua field ini tidak mengubah kategori. POST tanpa kategori memakai Reguler dan mencatat histori hari ini WIB. Field ini khusus modul/brand; Defect tidak memiliki kategori.

List master mengirim `productionCategory` dan `categoryEffectiveFrom` (awal kategori yang sedang berlaku). Penyimpanan perubahan master, histori kategori dan audit memakai transaksi yang sama. Identitas API tetap UID publik.

Helper `apps/api/src/lib/production-category.ts` menyediakan pemetaan bertanggal dan lookup as-of. Histori bertumpang-tindih/inkonsisten harus ditolak; tidak boleh memilih kategori arbitrer. Tidak ada seed kategori global.

## Migrasi dan pemetaan oleh Owner

1. Backup database. Jalankan **sekali** [20261119_production_categories.sql](../db/migrations/20261119_production_categories.sql) sebelum deploy kode M1. DDL MySQL/MariaDB tidak transactional; jika sebagian sukses, lanjutkan hanya dari statement yang gagal. Jangan menjalankan ulang semua statement.
2. File tersebut hanya menambah dua kolom dan dua tabel histori. Tidak menambah/mengubah data kategori lama, kuantitas, Attendance atau Payroll.
3. Untuk default Reguler yang disepakati setelah migrasi awal, backup lalu jalankan [20261119_production_categories_default_reguler.sql](../db/migrations/20261119_production_categories_default_reguler.sql). Jangan mengulang migrasi awal. Script mengubah default kolom dan mengisi master NULL tanpa histori; Premium/Reguler yang sudah dipetakan dipertahankan. Tanggal baseline default hari ini WIB; ubah variabel tanggal hanya jika kondisi historisnya diketahui. SQL ini dijalankan Owner, bukan aplikasi.
4. Melalui Master Modul Produksi, petakan setiap modul sesuai kesepakatan site, lalu tanggal pemetaan pertama. Jangan otomatis menyimpulkan A/B/C Reguler dan D/E Premium untuk semua site.
5. Melalui Master Brand, petakan Reguler/Premium dan tanggal mulai berdasarkan histori yang diketahui.
6. Agar AVG minggu sebelumnya kelak dapat dihitung, tanggal awal pemetaan harus mencakup periode sumber yang benar-benar diketahui. Tanggal yang belum bisa dipastikan tetap tidak terpetakan; jangan mengisi tanggal terlalu lama hanya agar dashboard terlihat penuh.
7. Schema kanonik sudah disesuaikan untuk instalasi baru; jangan menjalankan file schema penuh pada database yang sudah berisi data.

## Rumus yang dikunci untuk M3

- Attendance hadir = status final `PRESENT`, satu orang sekali per tanggal; tidak harus menunggu scan pulang. Roster mencakup hari libur.
- Site, jenis karyawan, modul dan pekerjaan utama mengikuti histori efektif tanggal yang dihitung. Pekerjaan utama tidak ada/ambigu masuk peringatan belum terpetakan; total attendance tetap distinct karyawan.
- AVG per pekerjaan/jenis/kategori = total PCS POSTED minggu sebelumnya dibagi total hari-orang hadir pada kelompok tersebut. Hadir tanpa hasil setor tetap masuk pembagi. AVG total dihitung dari jumlah numerator dan denominator, bukan rata-rata sederhana dari AVG kelompok.
- Minggu sumber Senin-Minggu sebelumnya: tanggal 16-22 November memakai 9-15 November; tanggal 15 November memakai 2-8 November.
- Estimasi = jumlah `hadir tanggal terpilih x AVG` Training dan Borong, dibagi 9.600 PCS/box untuk Linting, 800 PCS/box untuk Packing. Packing memakai AVG Packing sendiri. Ini estimasi kapasitas, bukan hasil aktual/netto maupun upah.
- Sumber AVG belum tersedia/denominator nol ditampilkan Belum ada data, bukan kapasitas nol. Defect tidak mengurangi hasil setor untuk rumus ini.

## Uji M1

Tes otomatis memakai mock database/browser: kategori valid, data lama belum dipetakan, lookup tanggal lampau, batas periode, edit kategori/tanggal hari sama dan backdate, penolakan tanggal yang menabrak periode sebelumnya/future, default Reguler, status aktif modul boolean, scope/permission, rollback histori, form modul/brand dan Defect tanpa atribut kategori. Belum mengeksekusi SQL atau menulis data database nyata.
