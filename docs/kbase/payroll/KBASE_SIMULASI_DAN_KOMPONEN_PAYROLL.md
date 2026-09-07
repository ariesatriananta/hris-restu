# Knowledge Base - Simulasi dan Komponen Payroll

> Modul: Payroll
>
> Bagian: Simulasi Payroll dan komponen manual
>
> Audiens: Payroll Finance, Super Admin, Direksi, dan pemeriksa Payroll
>
> Terakhir diverifikasi: 7 September 2026

Panduan ini menjelaskan cara menyiapkan komponen manual, menjalankan simulasi,
membaca hasil, menghitung ulang, dan menangani run yang gagal pada **Payroll >
Simulasi Payroll**.

## 1. Istilah nominal

| Istilah | Arti |
|---|---|
| **Hasil Produksi** | Jumlah snapshot `gross_amount` transaksi Produksi `POSTED` untuk Borongan. |
| **Upah dasar** | Tarif harian x hari Hadir yang dibayar untuk Harian/Training. |
| **Gaji prorata** | Bagian gaji pokok sesuai hari kalender eligible untuk Bulanan. |
| **Pendapatan tambahan** | Komponen earning di luar dasar upah. |
| **Bruto/Pendapatan kotor** | Dasar upah + pendapatan tambahan. |
| **Total potongan** | Komponen deduction manual/sistem yang berlaku. |
| **Neto/Gaji bersih** | Bruto - total potongan. |

Nilai bruto pada transaksi Produksi adalah nilai awal hasil kerja. Neto Payroll
baru terbentuk setelah seluruh komponen diterapkan.

## 2. Menyiapkan komponen manual

Komponen manual dipakai untuk bonus, pendapatan lain, penalti, pinjaman, atau
potongan lain yang hanya berlaku pada satu periode.

1. Pilih periode Draft atau Calculated.
2. Klik **Komponen manual**.
3. Pilih karyawan dan jenis komponen.
4. Isi nominal dan catatan.
5. Simpan.
6. Jalankan **Hitung** atau **Hitung ulang** agar perubahan masuk ke snapshot.

Dalam satu periode, satu karyawan hanya boleh memiliki satu komponen manual aktif
untuk jenis komponen yang sama.

### 2.1 Koreksi dan pembatalan komponen

- Gunakan **Koreksi** untuk memperbaiki nominal atau catatan.
- Gunakan **Batalkan** jika komponen tidak lagi berlaku.
- Keduanya wajib memiliki alasan dan jejak revisi.
- Run lama tidak berubah. Hasil baru hanya muncul setelah Hitung ulang.

Pada Borongan, komponen tetap/berulang yang efektif mengenai minimal satu hari
periode diterapkan penuh satu kali. Pada Harian dan Training mingguan, komponen
berulang belum diterapkan; gunakan komponen manual agar nilai mingguan tidak
terbayar berulang tanpa aturan yang jelas.

## 3. Menjalankan simulasi

1. Pilih periode.
2. Periksa banner kesiapan.
3. Jika **Perhitungan masih diblokir**, buka detail pada Periode Payroll dan
   selesaikan blocker.
4. Jika **Data siap dihitung** atau **Data dapat dihitung dengan perhatian**,
   klik **Hitung**.
5. Tunggu status run selesai.
6. Periksa KPI, daftar karyawan, dan beberapa detail hasil.

Jangan menekan Hitung berulang ketika run masih `PROCESSING`.

## 4. Cara hitung Borongan

Dasar Borongan berasal dari snapshot transaksi Produksi `POSTED`:

**Neto = hasil Produksi + komponen pendapatan - komponen potongan**

Payroll memakai nilai bruto yang sudah tersimpan pada transaksi. Sistem tidak
mengalikan ulang kuantitas dengan tarif master terbaru. Transaksi `VOID` tidak
dihitung.

Karyawan yang sudah resign tetap masuk jika memiliki transaksi eligible dalam
periode. Karyawan tanpa transaksi hanya dapat masuk jika memiliki komponen yang
memang membuatnya menjadi populasi Payroll.

Attendance Borongan disimpan sebagai informasi readiness dan snapshot. Alpha,
terlambat, atau pulang awal tidak otomatis memotong upah; potongan harus memakai
komponen eksplisit yang dapat diaudit.

## 5. Cara hitung Harian dan Training

**Neto = jumlah tarif pada hari Attendance final Hadir + komponen manual pendapatan - komponen manual potongan**

- Seluruh karyawan eligible tetap ditampilkan.
- Karyawan tanpa hari Hadir memiliki upah dasar Rp0.
- Hadir pada hari nonkerja tetap dibayar dan ditandai sebagai peringatan.
- Upah harian dijumlahkan lalu dibulatkan satu kali `HALF_UP` ke Rp1.
- Hasil Produksi Training hanya menjadi informasi kuantitas dan tidak menambah nominal.

Detail karyawan menampilkan ledger per tanggal: Attendance, tipe hari, tarif,
apakah hari dibayar, nominal, dan peringatan hari nonkerja.

## 6. Cara hitung Bulanan

Dasar Bulanan adalah gaji pokok setelah prorata join/resign. Sistem kemudian
menerapkan potongan sistem Alpha dan Izin serta komponen manual.

**Neto = gaji pokok prorata + pendapatan tambahan - seluruh potongan**

Detail menampilkan:

- gaji pokok penuh dan gaji setelah prorata;
- hari kalender eligible dan total hari periode;
- hari kerja terjadwal;
- jumlah serta nominal potongan Alpha dan Izin;
- ledger Attendance per tanggal dan jenis dampaknya.

Sakit dan Cuti tidak otomatis memotong gaji pokok pada tahap ini.

## 7. Membaca hasil simulasi

KPI menyesuaikan skema dan menampilkan jumlah karyawan, nilai dasar, pendapatan
tambahan, potongan, bruto, dan neto. Daftar karyawan dapat difilter lalu dibuka
untuk melihat:

- snapshot identitas dan penempatan;
- rincian Produksi atau ledger waktu;
- ringkasan Attendance;
- komponen Payroll;
- status rekening;
- jejak formula dan nilai neto.

Nomor rekening dapat disamarkan sesuai kewenangan akun. Semua hasil pada halaman
ini masih simulasi dan belum menjadi bukti pembayaran.

## 8. Snapshot dan Hitung ulang

Setiap hitung membentuk run tersendiri. **Hitung ulang** membuat nomor run baru,
menjadikannya current run, dan mempertahankan histori run sebelumnya.

Hitung ulang diperlukan setelah perubahan seperti:

- transaksi Produksi;
- Attendance, shift, atau kalender;
- populasi, kontrak, atau penempatan;
- tarif harian atau gaji pokok;
- komponen manual/berulang;
- policy periode;
- data rekening karyawan.

Jangan mengajukan run lama hanya karena nominalnya terlihat cocok. Gunakan current
run terbaru yang sudah konsisten dengan sumber.

## 9. Neto negatif dan rekening belum lengkap

Neto negatif tetap disimpan dan ditampilkan agar sumber masalah dapat ditemukan.
Run boleh selesai, tetapi pengajuan, persetujuan, dan closing diblokir sampai
komponen diperbaiki dan hasil dihitung ulang.

Rekening belum lengkap hanya menjadi peringatan. Simulasi dan workflow tetap
dapat dilanjutkan. Namun, jika Daftar Pembayaran bank dibutuhkan, lengkapi nama
bank, nomor rekening, dan nama pemilik rekening, lalu Hitung ulang **sebelum
closing** agar snapshot final ikut lengkap.

## 10. Jika run gagal atau macet

- Run gagal tidak menjadi current hasil aktif dan tidak meninggalkan snapshot
  setengah jadi.
- Jika browser terputus, buka kembali periode dan periksa status run.
- Jika `PROCESSING` terlalu lama, pengguna dengan hak hitung dapat menjalankan
  tindakan pemulihan agar run ditandai gagal, lalu mencoba Hitung kembali.
- Catat pesan error pertama; biasanya pesan tersebut menunjukkan blocker yang
  harus diselesaikan.

## 11. Pemeriksaan sebelum mengajukan

- [ ] Current run berstatus Selesai dan merupakan run terbaru.
- [ ] Tidak ada blocker integritas atau pesan Hitung ulang.
- [ ] Tidak ada karyawan dengan neto negatif.
- [ ] Nilai dasar, tambahan, potongan, bruto, dan neto sudah dicocokkan.
- [ ] Detail beberapa karyawan sudah diperiksa terhadap dokumen kerja.
- [ ] Peringatan rekening dipahami; snapshot dilengkapi jika ekspor pembayaran diperlukan.
- [ ] Perbedaan dengan run sebelumnya masuk akal.

## 12. Solusi masalah umum

| Kondisi | Tindakan |
|---|---|
| Tombol Hitung tidak tersedia | Periksa hak hitung, status periode, dan apakah ada run Processing. |
| Readiness BLOCKED | Selesaikan blocker melalui menu tindakan pada detail periode. |
| Hasil Produksi berbeda dari tarif terbaru | Payroll memakai bruto snapshot transaksi, bukan menghitung ulang tarif master. |
| Komponen baru belum masuk hasil | Jalankan Hitung ulang. |
| Run lama masih terlihat | Normal; histori run dipertahankan untuk audit dan perbandingan. |
| Neto negatif | Koreksi atau batalkan komponen penyebab, lalu Hitung ulang. |
| Rekening masih kosong pada hasil | Lengkapi master rekening dan Hitung ulang untuk membuat snapshot baru. |
| Run Processing terlalu lama | Gunakan pemulihan run jika tombol tersedia, lalu hitung kembali. |

## 13. Navigasi KBase Payroll

- Kembali ke [Indeks Payroll](../../KBASE_PAYROLL.md).
- Sebelumnya: [Periode dan Kesiapan Payroll](./KBASE_PERIODE_DAN_KESIAPAN_PAYROLL.md).
- Lanjut ke [Approval dan Closing Payroll](./KBASE_APPROVAL_DAN_CLOSING_PAYROLL.md).
