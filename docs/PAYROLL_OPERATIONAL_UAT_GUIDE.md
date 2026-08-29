# Panduan UAT Operasional Payroll

Panduan ini dipakai pada environment development atau staging setelah seluruh
migration Payroll sampai M5C tersedia. M5E tidak mengubah rumus Payroll dan
tidak mencatat bahwa gaji sudah dibayar.

## 1. Urutan persiapan

1. Pastikan database yang dipakai bukan production.
2. Siapkan Attendance pada periode uji dan finalisasi seluruh hari kerja.
3. Untuk BORONGAN, siapkan master pekerjaan, tarif, penugasan, dan transaksi
   Produksi menggunakan seed Produksi yang sudah tersedia.
4. Jalankan `db/seeds/20260829_payroll_operational_uat.sql` setelah menyesuaikan
   site, periode yang sudah selesai, nominal demo, serta konfirmasi environment
   non-production pada bagian variable.
5. Jalankan `db/checks/20260829_payroll_operational_uat.sql`. Semua baris
   berstatus `BLOCKER` harus diselesaikan sebelum simulasi.

Seed M5E hanya menambahkan tarif harian atau gaji pokok yang benar-benar belum
memiliki histori bertumpang-tindih. Seed tidak mengisi rekening, tidak membuat
periode/run, dan tidak menutup Payroll.

## 2. Skenario wajib

| Skenario | Hasil yang diharapkan |
| --- | --- |
| BORONGAN mingguan | Nilai dasar berasal dari transaksi Produksi POSTED. |
| HARIAN mingguan | Hanya Attendance PRESENT yang dibayar tarif harian. |
| TRAINING mingguan | PRESENT dibayar tarif harian; hasil Produksi hanya informasi. |
| BULANAN penuh | Gaji pokok penuh dikurangi Alpha/Izin eksplisit. |
| BULANAN join/resign | Gaji pokok diprorata berdasarkan hari kalender eligible. |
| Mingguan lintas bulan | Periode tetap Senin-Minggu tanpa terpotong pergantian bulan. |
| Tanpa PRESENT | Karyawan tetap terlihat dengan upah dasar Rp0. |
| Neto negatif | Simulasi terlihat sebagai exception dan tidak boleh disahkan. |
| Data sumber berubah | Submit/approve/close diblokir dan user diminta hitung ulang. |

## 3. Alur pengujian per skema

1. Buka **Payroll > Periode Payroll** dan buat periode sesuai jenis karyawan.
2. Buka readiness. Pastikan populasi, policy, tarif/gaji, Attendance, serta
   rekening dapat dijelaskan dan blocker sudah nol.
3. Jalankan simulasi dan buka detail beberapa karyawan.
4. Cocokkan sumber dasar:
   - BORONGAN: transaksi dan nilai hasil Produksi;
   - HARIAN/TRAINING: tanggal PRESENT, tarif, dan upah harian;
   - BULANAN: gaji penuh, prorata, pembagi hari kerja, Alpha, dan Izin.
5. Tambahkan satu komponen manual demo, hitung ulang, lalu bandingkan kedua run.
6. Ajukan, setujui/tolak, tarik bila diperlukan, kemudian lakukan closing.
7. Unduh rekap. Pastikan rekening disamarkan.
8. Pada periode CLOSED, unduh Daftar Pembayaran dan periksa bahwa hanya current
   run FINAL yang digunakan.
9. Preview/cetak slip. Run simulasi harus memiliki watermark **SIMULASI**;
   slip resmi hanya berasal dari current run FINAL/CLOSED.

## 4. Uji permission

- Payroll Finance hanya melihat dan mengelola site yang diberikan.
- Director dapat menyetujui sesuai permission, tetapi tidak boleh menyetujui
  pengajuannya sendiri.
- Super Admin dapat menjalankan seluruh tindakan lintas site. Self-approval
  harus tetap menghasilkan catatan override audit.
- User tanpa permission ekspor, cetak, approval, atau closing tidak boleh lolos
  hanya dengan memanggil aksi secara langsung.

## 5. Uji source drift

Setelah satu simulasi selesai, ubah satu sumber melalui menu resminya, misalnya
Attendance, shift, tarif, gaji, policy future-effective, komponen, atau rekening.
Jangan mengubah tabel langsung. Saat submit/approve/close, sistem harus menolak
run lama dan meminta hitung ulang. Setelah hitung ulang, histori run lama tetap
utuh dan perbandingan menunjukkan selisihnya.

## 6. Kriteria selesai

UAT dinyatakan lulus bila seluruh skenario wajib selesai, tidak ada akses lintas
site, output resmi hanya berasal dari FINAL/CLOSED, seluruh blocker memiliki
tindakan yang jelas, dan hasil hitung sampel telah dicocokkan manual oleh owner.

Closing berarti hasil Payroll disahkan. Closing bukan bukti transfer atau
pembayaran gaji.
