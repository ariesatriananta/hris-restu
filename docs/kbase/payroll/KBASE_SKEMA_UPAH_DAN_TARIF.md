# Knowledge Base - Skema Upah dan Tarif

> Modul: Payroll
>
> Bagian: Skema Upah & Tarif
>
> Audiens: Super Admin, Payroll Finance, dan pengguna Payroll read-only
>
> Terakhir diverifikasi: 7 September 2026

Panduan ini menjelaskan policy Payroll, tarif harian, gaji pokok, dan pemeriksaan
histori Training yang tersedia pada **Payroll > Skema Upah & Tarif**.

## 1. Kapan panduan ini digunakan

- menyiapkan policy Payroll per site dan jenis karyawan;
- menambahkan atau memperbaiki tarif Harian dan Training;
- menambahkan atau memperbaiki gaji pokok Bulanan;
- memeriksa apakah histori Training lama aman memakai skema berbasis waktu;
- memahami mengapa periode tidak menemukan policy atau nominal yang sesuai.

## 2. Hak akses

- Pengguna dengan akses Payroll dapat membuka halaman ini.
- Hanya **Super Admin** yang dapat membuat atau membatalkan policy.
- Pengelolaan tarif harian dan gaji pokok memerlukan hak kelola tarif Payroll.
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

Policy menentukan identitas dan aturan periode Payroll untuk kombinasi site dan
jenis karyawan. Policy bersifat versioned dan effective-dated: perubahan tidak
menimpa histori lama.

Informasi utamanya meliputi site, jenis karyawan, dasar upah, frekuensi bayar,
cutoff, prorata, aturan Attendance, pembagi potongan, pembulatan, mata uang, dan
rentang tanggal berlaku.

### 4.1 Membuat versi policy

1. Buka tab **Kebijakan**.
2. Pilih **Buat versi policy**.
3. Pilih site, jenis karyawan, dan tanggal mulai berlaku.
4. Periksa preview periode dan aturan yang dibentuk sistem.
5. Isi alasan atau catatan perubahan dengan jelas.
6. Simpan versi baru setelah seluruh informasi benar.

Policy baru hanya berlaku untuk periode baru yang tercakup tanggal efektifnya.
Perubahan tidak boleh mengubah Payroll yang sudah diajukan, disetujui, atau
ditutup.

### 4.2 Membatalkan policy

Pembatalan wajib beralasan dan tersimpan pada histori revisi. Sistem dapat
memulihkan akhir masa berlaku versi sebelumnya jika memenuhi aturan. Jangan
mengubah policy untuk memaksa hasil Payroll lama berubah; periode yang sudah
memiliki snapshot tetap menggunakan policy snapshot miliknya.

## 5. Tab Tarif harian

Tarif harian digunakan oleh karyawan **Harian** dan **Training**. Hanya hari
dengan Attendance final berstatus Hadir yang membentuk upah dasar.

### 5.1 Menambah tarif

1. Pilih tab **Tarif harian**.
2. Pilih karyawan yang eligible dan tanggal mulai tarif.
3. Isi nominal dalam IDR.
4. Periksa site dan jenis karyawan.
5. Simpan histori tarif.

Tarif harus mencakup setiap tanggal eligible yang akan dihitung. Tarif hilang,
bertumpang tindih, nonaktif, atau memakai mata uang selain IDR menjadi blocker.

### 5.2 Mengoreksi atau membatalkan tarif

Gunakan **Koreksi** jika tanggal atau nominal histori salah. Gunakan **Batalkan**
jika histori tidak seharusnya berlaku. Kedua tindakan membutuhkan alasan dan
tidak menghapus jejak perubahan. Jika dilakukan setelah simulasi, jalankan
**Hitung ulang**.

## 6. Tab Gaji pokok

Gaji pokok hanya digunakan untuk karyawan **Bulanan**.

- Gaji pertama karyawan baru boleh mulai pada tanggal awal eligibility walaupun
  karyawan bergabung di tengah periode.
- Perubahan gaji berikutnya harus efektif tepat pada awal periode Payroll.
- Lebih dari satu segmen gaji pokok dalam satu periode Bulanan menjadi blocker.
- Join atau resign di tengah periode diprorata berdasarkan hari kalender eligible.

Gunakan **Koreksi** atau **Batalkan** dengan alasan. Jangan menimpa atau menghapus
nilai lama secara langsung.

## 7. Tab Preflight Training

Preflight Training memeriksa data lama sebelum skema Training dipakai sebagai
Payroll berbasis waktu.

- Status aman berarti histori dapat mengikuti tarif harian tanpa menghapus fakta Produksi.
- Status terblokir dapat berarti Payroll lama yang sudah disetujui atau ditutup
  masih memperlakukan Training sebagai upah hasil.

Jika terblokir, jangan memperbaiki tabel secara manual. Catat site dan data yang
ditunjukkan lalu koordinasikan remediasi historis dengan Administrator.

## 8. Rumus penting skema Bulanan

**Gaji setelah prorata = gaji pokok x hari kalender eligible / hari kalender periode**

**Potongan Alpha = gaji pokok / hari kerja terjadwal periode x hari Alpha**

**Potongan Izin = gaji pokok / hari kerja terjadwal periode x hari Izin**

Alpha dan Izin disimpan sebagai komponen sistem terpisah dan dibulatkan
`HALF_UP` ke Rp1 per komponen. Sakit, Cuti, hari libur, dan hari nonkerja tidak
membentuk potongan otomatis saat ini.

## 9. Pemeriksaan sebelum membuat periode

- [ ] Tepat satu policy aktif mencakup site, jenis karyawan, dan rentang periode.
- [ ] Tarif Harian/Training mencakup seluruh tanggal eligible tanpa overlap.
- [ ] Gaji pokok Bulanan tersedia dan tidak berubah di tengah periode.
- [ ] Mata uang nominal adalah IDR.
- [ ] Histori yang dikoreksi memiliki alasan dan jejak revisi.
- [ ] Perubahan master tidak ditujukan untuk mengubah Payroll final lama.

## 10. Solusi masalah umum

| Kondisi | Tindakan |
|---|---|
| Policy aktif tidak ditemukan | Periksa site, jenis karyawan, dan cakupan tanggal efektif policy. |
| Policy ambigu | Rapikan versi policy sampai resolusinya tunggal. |
| Tarif dasar belum mencakup periode | Tambahkan atau koreksi histori tarif pada tanggal yang hilang. |
| Tarif dasar bertumpang tindih | Koreksi rentang agar hanya satu tarif berlaku per tanggal. |
| Gaji berubah di tengah periode | Mulai perubahan pada awal periode yang benar, kecuali gaji pertama karyawan baru. |
| Nominal tidak terlihat | Periksa kewenangan nominal dan akses site akun. |
| Hasil simulasi tertinggal dari master | Jalankan Hitung ulang dan gunakan current run terbaru. |

## 11. Navigasi KBase Payroll

- Kembali ke [Indeks Payroll](../../KBASE_PAYROLL.md).
- Lanjut ke [Periode dan Kesiapan Payroll](./KBASE_PERIODE_DAN_KESIAPAN_PAYROLL.md).
- Buka [Simulasi dan Komponen Payroll](./KBASE_SIMULASI_DAN_KOMPONEN_PAYROLL.md).
