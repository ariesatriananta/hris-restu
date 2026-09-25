# Knowledge Base - Skema Upah dan Tarif

> Modul: Payroll
>
> Bagian: Skema Upah & Tarif
>
> Audiens: Super Admin, Payroll Finance, dan pengguna Payroll read-only
>
> Terakhir diverifikasi: 17 September 2026

Panduan ini menjelaskan aturan Payroll, tarif harian, gaji pokok, master UMK,
serta kebijakan dan kepesertaan BPJS pada **Payroll > Skema Upah & Tarif**.

## 1. Kapan panduan ini digunakan

- menyiapkan aturan Payroll per site dan jenis karyawan;
- menambahkan atau memperbaiki tarif Harian dan Training;
- menambahkan atau memperbaiki gaji pokok Bulanan;
- mencatat Upah Minimum Kabupaten/Kota (UMK) per site dan tahun;
- mengatur persentase, switch program, dan kepesertaan BPJS Borongan;
- memahami mengapa periode tidak menemukan aturan atau nominal yang sesuai.

## 2. Hak akses

- Pengguna dengan akses Payroll dapat membuka halaman ini.
- Hanya **Super Admin** yang dapat membuat atau membatalkan policy.
- Pengelolaan tarif harian dan gaji pokok memerlukan hak kelola tarif Payroll.
- Pengelolaan UMK menggunakan hak kelola tarif Payroll yang sama.
- Data tetap dibatasi menurut site pengguna. Super Admin dapat bekerja lintas site.
- Nominal dapat disamarkan jika akun tidak memiliki kewenangan melihat nilai.

Jika tombol tambah, koreksi, atau batalkan tidak terlihat, periksa hak akses akun
sebelum menganggap aplikasi bermasalah.

## 3. Memahami empat skema

| Jenis | Dasar dan frekuensi | Cara dasar dihitung |
|---|---|---|
| Borongan | `PIECE_RATE`, periode fleksibel maksimal 31 hari | Jumlah snapshot bruto transaksi Produksi `POSTED` |
| Harian | `TIME_BASED`, Senin-Minggu | Tarif harian untuk setiap Attendance final `PRESENT` |
| Training | `TIME_BASED`, Senin-Minggu | Tarif harian untuk setiap Attendance final `PRESENT` |
| Bulanan | `TIME_BASED`, bulanan | Gaji pokok yang dapat diprorata dan dipotong Alpha/Izin |

Hasil Produksi karyawan Training tetap dapat dicatat untuk monitoring, tetapi
nilai brutonya tidak menambah upah dasar, bruto, atau neto Payroll Training.

## 4. Tab Kebijakan

Kebijakan menentukan identitas dan aturan periode Payroll untuk kombinasi site dan
jenis karyawan. Setiap kombinasi hanya memiliki satu konfigurasi saat ini.

Informasi utamanya meliputi site, jenis karyawan, dasar upah, frekuensi bayar,
cutoff, prorata, aturan Attendance, pembagi potongan, pembulatan, dan mata uang.

### 4.1 Mengatur kebijakan

1. Buka tab **Kebijakan**.
2. Pilih **Atur aturan**.
3. Pilih site dan jenis karyawan.
4. Periksa preview periode dan aturan yang dibentuk sistem.
5. Isi alasan atau catatan perubahan dengan jelas.
6. Simpan setelah seluruh informasi benar.

Nilai terakhir yang disimpan langsung menjadi aturan aktif untuk proses Payroll
berikutnya. Periode yang sudah dibuat menyimpan salinan aturan yang dipilih;
hasil perhitungan yang sudah tersimpan tidak berubah diam-diam.

### 4.2 Membatalkan kebijakan

Pembatalan wajib beralasan dan tersimpan pada histori revisi. Setelah dibatalkan,
site dan jenis karyawan tersebut tidak mempunyai aturan aktif sampai aturan
disimpan kembali.

## 5. Tab Tarif harian

Tarif harian digunakan oleh karyawan **Harian** dan **Training**. Hanya hari
dengan Attendance final berstatus Hadir yang membentuk upah dasar.

### 5.1 Menambah tarif

1. Pilih tab **Tarif harian**.
2. Pilih karyawan yang eligible.
3. Isi nominal dalam IDR.
4. Periksa site dan jenis karyawan.
5. Simpan tarif.

Setiap karyawan hanya mempunyai satu tarif saat ini, tanpa memilih tanggal
efektif. Tarif yang hilang,
nonaktif, atau memakai mata uang selain IDR menjadi blocker.

### 5.2 Mengoreksi atau membatalkan tarif

Gunakan **Koreksi** untuk mengganti nominal saat ini. Gunakan **Batalkan** jika
tarif tidak boleh digunakan. Kedua tindakan membutuhkan alasan dan tetap
tercatat di audit. Jika dilakukan setelah simulasi, jalankan **Hitung ulang**.

## 6. Tab Gaji pokok

Gaji pokok hanya digunakan untuk karyawan **Bulanan**.

- Setiap karyawan hanya mempunyai satu gaji pokok saat ini, tanpa tanggal efektif.
- Nilai terakhir yang disimpan dipakai pada proses Payroll berikutnya.
- Join atau resign di tengah periode diprorata berdasarkan hari kalender eligible.

Gunakan **Koreksi** atau **Batalkan** dengan alasan. Jejak perubahan tetap tersedia
di audit meskipun master hanya menyimpan kondisi terkini.

## 7. Tab UMK Site

UMK disimpan satu kali untuk setiap kombinasi **site dan tahun kalender**.
Nominal ini menjadi dasar perhitungan BPJS Borongan ketika periode mengaktifkan
**Potong BPJS**. UMK bukan pengganti hasil Produksi dan tidak menambah bruto.

1. Pilih tab **UMK Site**.
2. Gunakan **Tambah UMK**, lalu pilih site dan tahun.
3. Isi nominal IDR, referensi regulasi bila tersedia, dan alasan perubahan.
4. Gunakan **Koreksi** bila nominal atau referensinya salah.
5. Gunakan **Batalkan** untuk menonaktifkan data yang tidak berlaku, atau
   **Aktifkan kembali** bila pembatalan perlu dipulihkan.

Site dan tahun menjadi identitas tetap setelah data dibuat. Perubahan selalu
memerlukan alasan serta dicatat pada revision log dan audit trail. Data tidak
dihapus permanen. Nilai UMK boleh dilihat pengguna `payroll.view` sesuai scope
site karena merupakan nilai regulasi wilayah, bukan gaji pribadi karyawan.

## 8. Tab Kebijakan BPJS

Tab ini terdiri dari dua lapisan pengaturan:

1. **Kebijakan global per tahun** untuk persentase Kesehatan, JHT, JKK, JKM,
   dan JP, unit pembulatan, serta switch bagian perusahaan/karyawan.
2. **Kepesertaan karyawan Borongan** dengan pilihan **Ikuti kebijakan global**
   atau **Gunakan pengaturan khusus**. Mode khusus menyediakan delapan switch:
   Kesehatan perusahaan/karyawan, JHT perusahaan/karyawan, JKK perusahaan,
   JKM perusahaan, dan JP perusahaan/karyawan.

Karyawan baru atau karyawan yang belum memiliki pengaturan khusus mengikuti
delapan switch kebijakan global pada tahun Payroll. Pada mode khusus, setiap
switch menjadi keputusan akhir untuk karyawan tersebut: pilihan `YA` tetap aktif
meskipun global nonaktif, dan pilihan `TIDAK` tetap nonaktif meskipun global
aktif. Persentase iuran tetap berasal dari kebijakan global dan tidak dapat
diubah per karyawan. UMK otomatis mengikuti site dan tahun bulan iuran.

Potongan bagian karyawan dibulatkan ke Rp1.000 terdekat per program. Kontribusi
perusahaan dihitung dan disimpan terpisah, sehingga tidak mengurangi neto.
Perubahan konfigurasi membutuhkan alasan dan berlaku pada perhitungan berikutnya;
hasil lama tetap dapat ditelusuri.

Nomor BPJS Kesehatan atau Ketenagakerjaan yang kosong akan ditampilkan sebagai
peringatan, tetapi tidak memblokir simulasi. Pastikan identitas tersebut
dilengkapi sebelum proses operasional resmi.

### 8.1 Memperbarui banyak kepesertaan melalui Excel

1. Atur filter site atau pencarian karyawan pada tabel kepesertaan.
2. Pilih **Import Excel**, lalu **Unduh template**. Template sudah berisi
   karyawan Borongan sesuai filter tersebut beserta status efektif saat ini.
3. Isi `MODE` dengan `GLOBAL` atau `KHUSUS`. Pada mode `KHUSUS`, isi delapan
   kolom porsi dengan `YA`/`TIDAK`. Pada mode `GLOBAL`, delapan kolom tersebut
   hanya menjadi informasi karena hasilnya selalu mengikuti kebijakan global.
4. Unggah kembali file dan periksa preview validasi.
5. Pilih **Simpan** setelah seluruh baris berstatus Valid.

Import dibatasi 2.000 karyawan dan diproses sekaligus. Jika satu baris tidak
valid, seluruh import dibatalkan agar tidak meninggalkan pembaruan parsial.
Kolom Employee ID, nama, dan site merupakan identitas acuan dan tidak boleh
diubah. Nomor peserta BPJS tetap dikelola melalui Master Karyawan.

## 9. Rumus penting skema Bulanan

**Gaji setelah prorata = gaji pokok x hari kalender eligible / hari kalender periode**

**Potongan Alpha = gaji pokok / hari kerja terjadwal periode x hari Alpha**

**Potongan Izin = gaji pokok / hari kerja terjadwal periode x hari Izin**

Alpha dan Izin disimpan sebagai komponen sistem terpisah dan dibulatkan
`HALF_UP` ke Rp1 per komponen. Sakit, Cuti, hari libur, dan hari nonkerja tidak
membentuk potongan otomatis saat ini.

## 10. Pemeriksaan sebelum membuat periode

- [ ] Satu aturan aktif tersedia untuk site dan jenis karyawan.
- [ ] Tarif Harian/Training aktif tersedia untuk setiap karyawan eligible.
- [ ] Gaji pokok Bulanan aktif tersedia.
- [ ] Mata uang nominal adalah IDR.
- [ ] Perubahan master memiliki alasan dan jejak audit.
- [ ] Perubahan master tidak ditujukan untuk mengubah Payroll final lama.
- [ ] Untuk Potong BPJS: kebijakan BPJS tahun dan UMK site sudah aktif.
- [ ] Bulan iuran belum pernah dipakai untuk karyawan yang sama pada periode lain.

## 11. Solusi masalah umum

| Kondisi | Tindakan |
|---|---|
| Aturan Payroll tidak ditemukan | Simpan aturan untuk site dan jenis karyawan terkait. |
| Tarif dasar belum tersedia | Tambahkan atau aktifkan kembali tarif karyawan. |
| Gaji pokok belum tersedia | Tambahkan atau aktifkan kembali gaji pokok karyawan. |
| Nominal tidak terlihat | Periksa kewenangan nominal dan akses site akun. |
| Hasil perhitungan tertinggal dari master | Jalankan Hitung ulang dan gunakan hasil terbaru. |
| UMK site dan tahun sudah ada | Buka data yang ada lalu koreksi atau aktifkan kembali; jangan membuat duplikat. |
| Potongan BPJS nol | Periksa switch Potong BPJS periode, bulan iuran, UMK site, kebijakan global, serta mode dan porsi khusus karyawan. |
| Bulan iuran sudah dipotong | Pilih periode tanpa Potong BPJS atau gunakan bulan iuran yang benar; satu karyawan hanya boleh satu settlement per bulan. |
| Nomor peserta BPJS belum lengkap | Lengkapi data karyawan. Kondisi ini peringatan dan tidak menghentikan kalkulasi. |

## 12. Navigasi KBase Payroll

- Kembali ke [Indeks Payroll](../../KBASE_PAYROLL.md).
- Lanjut ke [Periode dan Kesiapan Payroll](./KBASE_PERIODE_DAN_KESIAPAN_PAYROLL.md).
- Buka [Simulasi dan Komponen Payroll](./KBASE_SIMULASI_DAN_KOMPONEN_PAYROLL.md).
