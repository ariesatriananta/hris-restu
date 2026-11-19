# Koreksi Transaksi Produksi

Form Koreksi yang sudah ada dipakai untuk memperbaiki jumlah, brand, berat dan defect tanpa menghapus histori transaksi awal. Tidak ada migrasi atau perubahan data lama.

## Alur operasional

1. Buka Detail Transaksi Produksi, pilih Koreksi.
2. Jumlah dan data QC terisi dari snapshot transaksi. Ubah bagian yang salah. Bagian Ubah pekerja/pekerjaan tertutup secara default untuk setoran tunggal.
3. Pilih Preview perubahan, periksa hasil, isi alasan minimal 5 karakter, lalu Terapkan koreksi.
4. Perubahan input membatalkan preview sebelumnya. Respons preview yang terlambat tidak boleh mengaktifkan simpan untuk input baru.

Selain HR_OFFICER/SUPER_ADMIN, koreksi dan void hanya tersedia pada tanggal bisnis yang sama dengan hari ini di Asia/Jakarta. Tanggal lampau dan masa depan ditolak di API dan UI. HR/Superadmin tetap wajib memenuhi permission, scope site/modul, status POSTED, serta kunci Payroll.

## Histori, QC dan pasangan

- Transaksi awal menjadi VOID dan transaksi pengganti menjadi POSTED dalam satu transaksi database, beserta histori revisi. Tanggal bisnis dan waktu awal tetap dipertahankan.
- Jumlah tidak harus berubah jika QC benar-benar berubah. Request tanpa perubahan ditolak.
- Payload `qc` yang tidak dikirim mempertahankan mekanisme salin QC lama; koreksi jumlah pada data lama tanpa QC tidak diwajibkan mengisi QC baru.
- Jika `qc` dikirim, objek tersebut merupakan pengganti QC lengkap, bukan patch parsial. API menerima objek kosong untuk menghapus QC secara eksplisit; form operasional memakai validasi pengisian QC scanner ketika operator mengubah QC.
- Master brand/defect yang sudah dipakai transaksi asal tetap dapat dipertahankan meskipun dinonaktifkan. Nama/kode/urutan memakai snapshot asal. Pilihan baru harus aktif dan brand harus sesuai site. Defect yang tidak diedit tidak boleh hilang dari draft.
- Berat dan defect hanya untuk Linting. Perubahan defect tidak mengurangi jumlah setoran maupun mengubah rumus upah.
- Pasangan Linting/Batil tetap mempertahankan kedua pekerja dan pekerjaan. Jumlah berlaku untuk keduanya. Edit brand/QC melalui anggota Linting; brand pengganti disalin ke Batil, sedangkan berat dan defect tetap khusus Linting.
- Jika salah satu anggota terkunci Payroll atau berada di luar scope QC, seluruh koreksi ditolak. Kegagalan penyimpanan salah satu anggota membatalkan seluruh proses.
- Retry dengan idempotency key dan QC yang sama mengembalikan hasil sebelumnya; QC berbeda dengan key yang sama ditolak. Normalisasi berat dan urutan defect mencegah duplikasi karena format input.
- Histori menyimpan QC sebelum/sesudah perubahan. Informasi upah, jumlah dibayar, potongan PCS dan Adjustment tetap mengikuti pembatasan HR/Superadmin.

## Pemeriksaan setelah deploy

- QC/Admin Produksi: koreksi hari ini berhasil; tanggal lain ditolak, termasuk pemanggilan API langsung. HR/Superadmin dapat mengoreksi tanggal lampau jika belum terkunci Payroll.
- Ubah hanya brand/berat/defect dengan jumlah tetap; preview dan transaksi pengganti harus sesuai, snapshot lama tetap utuh.
- Koreksi jumlah data lama tanpa/parsial QC; simpan tanpa dipaksa mengisi QC baru.
- Coba snapshot master nonaktif, pasangan Klaten, transaksi terkunci Payroll, klik simpan ganda dan perubahan input saat preview masih berjalan.

Tes otomatis menggunakan mock database dan browser. Tidak ada migrasi, penulisan database nyata, atau deploy yang dijalankan oleh perubahan ini.
