# Hasil UAT Pusat Laporan - 31 Agustus 2026

## Lingkup

- Database: `hris_pt_restu_2` pada host lokal `Arie`.
- Periode rekonsiliasi: 1 Januari 2026 sampai 31 Agustus 2026.
- Metode: transaksi baca saja dengan snapshot database yang konsisten.
- Tidak menjalankan migration, seed, finalisasi Attendance, simulasi, closing
  Payroll, ataupun perubahan data lainnya.

## Hasil utama

Hasil pemeriksaan terakhir: **17 PASS, 2 WARN, 0 FAIL**.

Angka lintas laporan yang berhasil dicocokkan:

- Karyawan Aktif awal: 448.
- Karyawan Aktif akhir: 1.175.
- Karyawan masuk: 328.
- Aktif kembali: 592.
- Resign: 1.
- Menjadi nonaktif: 192.
- Perkiraan jumlah akhir: `448 + 328 + 592 - 1 - 192 = 1.175`.
- Mutasi lintas site: 2 dan seluruhnya tercatat sebagai Transfer.
- Histori kerja ambigu pada awal/akhir periode: 0/0.
- Record Attendance: 20.070.
- Setoran Produksi Posted: 1.589 dengan total kuantitas 120.073 dan nilai
  bruto Rp130.116.675.

Seluruh pemeriksaan hubungan data berikut lulus:

- klasifikasi terapan terhadap fakta Attendance;
- koreksi terapan terhadap penanda koreksi Attendance;
- scan sukses terhadap karyawan dan site Attendance;
- setoran Produksi Posted terhadap status Hadir dan scan masuk sukses;
- struktur Payroll Closed/Final serta duplikasi hasil karyawan;
- status historis dan tumpang tindih kontrak;
- site pada Audit Trail.

## Peringatan yang belum menutup UAT

1. Finalisasi Attendance baru berstatus berhasil pada 35 dari 66 kombinasi
   tanggal-site yang mempunyai record Attendance. Rekap untuk kombinasi yang
   belum berhasil tetap bersifat sementara sampai difinalisasi. Rinciannya:
   Jepara 16 tanggal, Klaten 7 tanggal, dan Semarang 8 tanggal.
2. Belum ada periode Payroll berstatus Closed. Struktur Laporan Payroll Final
   dan pengamanannya lulus pengujian otomatis, tetapi angka hasil Payroll resmi
   belum dapat diuji terhadap data Closed nyata.

## Cakupan data yang tersedia

- Attendance: 1 sampai 26 Agustus 2026.
- Produksi: 20 sampai 21 Agustus 2026.
- Kontrak: 1.371 record.
- Penugasan shift: 1.291 record.
- Pengajuan klasifikasi: 885 record.
- Pengajuan koreksi: 986 record.
- Aktivitas scan: 32.667 record.
- Audit Trail: 3.644 record.

## Kesimpulan

Tidak ditemukan selisih angka lintas laporan atau hubungan data yang rusak pada
data yang sudah tersedia. Pusat Laporan layak dilanjutkan ke UAT manual tampilan
dan ekspor. Laporan Attendance belum boleh dianggap resmi untuk kombinasi
tanggal-site yang belum difinalisasi, dan Laporan Payroll Final perlu diuji
ulang setelah tersedia satu periode Closed yang sah.
