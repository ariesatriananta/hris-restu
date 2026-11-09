# Akses QC Produksi

Disetujui Bos pada 9 November 2026. Implementasi kode tersedia; migrasi dan uji operasional dilakukan Owner sebelum dipakai.

## Pengaturan pengguna

- Pilih role **QC**, lalu site yang boleh diakses.
- Di bawah pilihan site, pilih minimal satu **Modul Produksi aktif pada setiap site**. Boleh lebih dari satu site/modul.
- QC tidak digabung dengan role lain. Mengubah akses membatalkan sesi pengguna, sehingga perlu login kembali.
- Pilihan kosong tidak berarti semua modul: akses ditolak.

## Hak akses

QC boleh scan, melihat transaksi, koreksi, dan void dalam cakupan site **dan** modulnya. QC tidak boleh ekspor, hapus batch, import, input susulan, mengelola master/tarif/penugasan, atau membuka rekap Produksi. Setelah login QC diarahkan ke scanner.

Pilihan pekerjaan, pencarian karyawan untuk koreksi, dan opsi brand/defect hanya menjadi metadata pendukung scanner/transaksi. Endpoint pengelolaan tetap diblokir. Dashboard tidak menampilkan agregat seluruh site untuk QC.

Pembatasan berlaku di API dan UI, termasuk daftar, KPI, ringkasan scanner, transaksi terakhir, detail, preview, koreksi, dan void. Permission tambahan yang keliru diberikan pada role QC tidak membuka ekspor atau fitur lainnya.

## Modul transaksi dan penghitungan ulang

`production_transactions.production_module_id` menyimpan modul saat transaksi dibuat. Pindah modul karyawan atau mengubah histori penempatan tidak memindahkan akses transaksi lama. Koreksi pekerja yang sama mempertahankan modul sumber; koreksi ke pekerja berbeda memakai modul historis pekerja tujuan pada tanggal transaksi.

Pasangan Linting–Batil dan transaksi terkait koreksi wajib sama-sama berada dalam akses QC. Jika salah satu tidak tersedia, transaksi tidak dibuka untuk QC. Saat scan/koreksi/void menghitung ulang grup harian, seluruh transaksi yang terdampak wajib dapat diakses QC; jika tidak, operasi ditolak dan perlu ditangani admin Produksi.

Seluruh validasi lama tetap berjalan: site perangkat, eligibility karyawan, attendance, assignment, tarif, pasangan, kuantitas, idempotensi, dan penguncian Payroll.

## Migrasi Owner

Jalankan sekali [20261109_qc_module_access.sql](../db/migrations/20261109_qc_module_access.sql) **sebelum deploy kode ini**. SQL belum dijalankan oleh Jo. DDL MySQL/MariaDB tidak transaksional; siapkan backup terlebih dahulu.

Migrasi menambahkan tabel akses modul pengguna, kolom snapshot modul transaksi beserta indeks/FK, role QC dan tiga permission tetap. Pengisian modul transaksi lama hanya mengambil tepat satu histori kerja ACTIVE yang cocok site/tanggal dan memiliki modul pada site tersebut. Data ambigu atau tanpa histori valid tetap NULL, sehingga tidak terlihat oleh QC; role lama tetap dapat melihatnya tanpa filter modul. Tidak menebak dari penempatan sekarang dan tidak mengubah kuantitas/upah/status.

### Pemulihan migrasi yang berhenti pada `eh.status`

Pada 9 November 2026, SHOW CREATE TABLE dari Owner memastikan database belum memiliki empat kolom lifecycle histori: `status`, `cancelled_at`, `cancelled_by`, `cancellation_reason`, sedangkan schema repo memilikinya. Setelah CREATE tabel akses dan ALTER transaksi berhasil, gunakan [20261109_qc_module_access_resume.sql](../db/migrations/20261109_qc_module_access_resume.sql), bukan mengulang migrasi utama. Berkas ini menambahkan empat kolom lalu meneruskan backfill dan role/permission QC. SQL belum dieksekusi Jo.

Default ACTIVE menandai baris histori tetap valid sesuai perilaku database lama. Ini tidak mengaktifkan karyawan resign/nonaktif: `employee_status_id`, tanggal efektif, penempatan dan data upah tidak diubah. ALTER pemulihan hanya sekali; jika langkah berikutnya gagal, lanjutkan dari langkah yang gagal tersebut.

## Uji setelah migrasi/deploy

1. Buat QC dengan satu modul di Klaten; login dan pastikan masuk scanner.
2. Scan karyawan dalam akses dan di luar modul/site; hanya yang sesuai boleh diteruskan. Ulangi untuk pekerja Batil.
3. Bandingkan daftar/KPI, transaksi terakhir dan ringkasan scanner dengan transaksi modul yang diberikan; detail UID dari modul lain harus ditolak.
4. Koreksi dan void transaksi yang memenuhi syarat; transaksi terkunci Payroll tetap ditolak. Coba pasangan dan grup harian dengan anggota di luar akses.
5. Pastikan ekspor, batch, import, susulan, rekap, master dan tarif tidak dapat diakses, termasuk lewat URL/API langsung.
6. Ubah akses modul, pastikan sesi lama batal dan login berikutnya mengikuti akses baru. Periksa kembali role lama tanpa mengubah cakupannya.

Tes otomatis memakai database mock. Koneksi, DDL pada versi database tujuan, serta scan/perangkat nyata tetap memerlukan uji Owner.
