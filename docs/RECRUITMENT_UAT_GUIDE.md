# Panduan UAT Rekrutmen

Panduan ini dipakai untuk memeriksa alur Rekrutmen dari Form Data Pelamar
sampai kandidat masuk ke Master Karyawan. Gunakan database development atau
staging. Jangan memakai identitas orang sungguhan untuk data percobaan.

## Tujuan akhir

Alur dinyatakan siap apabila:

1. Pelamar dapat membuka tautan site, mengisi data, dan menerima nomor bukti.
2. HR hanya melihat kandidat dari site yang menjadi kewenangannya.
3. HR dapat mengubah tahap Baru menjadi Diproses lalu Lolos atau Tidak Lolos.
4. Kandidat Lolos dapat dilengkapi menjadi karyawan Nonaktif.
5. Foto, KTP, KK, histori status, dan Audit Trail tersimpan lengkap.
6. Klik ganda, data ganda, berkas tidak sah, dan akses tanpa izin ditolak.

## Pemeriksaan otomatis

Jalankan dari folder utama project:

```powershell
pnpm uat:recruitment
```

Perintah tersebut:

- memeriksa konfigurasi tiga tautan site tanpa menampilkan token;
- memeriksa Turnstile dan penyimpanan dokumen privat;
- membaca struktur serta konsistensi database tanpa mengubah data;
- menjalankan tes API publik, proses HR, keamanan, dan konversi kandidat;
- menjalankan tes form publik dan form Master Karyawan.

Hasil `FAIL` harus diperbaiki. Hasil `WARN` berarti sistem aman dilanjutkan,
tetapi data nyata untuk membuktikan alur tersebut belum tersedia.

## Persiapan tautan site

`RECRUITMENT_SITE_TOKENS_JSON` wajib berisi tepat satu token acak untuk setiap
site. Setiap token terdiri dari 24 sampai 100 huruf, angka, garis bawah, atau
garis sambung. Jangan memakai kode pendek seperti `smg`, `slo`, atau `kds`
karena mudah ditebak dan akan ditolak server.

Formatnya:

```text
{
  "TOKEN_ACAK_SEMARANG": "SEMARANG",
  "TOKEN_ACAK_KLATEN": "KLATEN",
  "TOKEN_ACAK_JEPARA": "JEPARA"
}
```

Setelah diperbarui, restart API. Tautan yang diperiksa:

```text
/form-data-pelamar/TOKEN_ACAK_SEMARANG
/form-data-pelamar/TOKEN_ACAK_KLATEN
/form-data-pelamar/TOKEN_ACAK_JEPARA
```

Jangan menaruh token pada screenshot, dokumen publik, atau percakapan umum.
Token hanya disampaikan melalui QR atau tautan resmi untuk site terkait.

## Data percobaan

Siapkan identitas fiktif yang jelas diberi nama `UAT REKRUTMEN`. NIK dan nomor
KK harus berupa 16 angka yang tidak dipakai karyawan maupun kandidat lain.
Gunakan foto contoh buatan sendiri, bukan KTP atau KK orang sungguhan.

Untuk pengujian pendaftaran ulang, siapkan identitas fiktif kedua. Jangan
menghapus kandidat Tidak Lolos karena data tersebut memang menjadi arsip.

## Skenario 1 - Form publik pada HP

1. Buka QR site dari browser HP.
2. Pastikan logo, nama perusahaan, dan nama site tampil dengan benar.
3. Pastikan pelamar tidak dapat mengganti site.
4. Isi pemeriksaan identitas lalu lanjutkan ke biodata.
5. Ambil foto diri, KTP contoh, dan KK contoh menggunakan kamera.
6. Periksa pratinjau dan coba ganti salah satu foto.
7. Centang persetujuan data, lalu tekan **Kirim data pelamar** satu kali.
8. Pastikan tombol tidak dapat ditekan berulang selama proses berjalan.
9. Catat nomor bukti yang tampil dan pastikan tidak ada alamat dokumen privat.

Ulangi pemeriksaan dasar pada desktop. Form harus tetap rapi, tidak melebar
keluar layar, dan seluruh tombol dapat dijangkau.

## Skenario 2 - Tiga site dan hak akses

1. Buka masing-masing tautan Semarang, Klaten, dan Jepara.
2. Pastikan setiap tautan menampilkan site yang sesuai.
3. Masuk sebagai HR Officer salah satu site.
4. Pastikan kandidat site tersebut terlihat di menu **Karyawan > Rekrutmen**.
5. Coba membuka alamat detail kandidat dari site lain.
6. Sistem harus menampilkan tidak ditemukan dan tidak membuka foto kandidat.
7. Masuk sebagai Super Admin dan pastikan ketiga site dapat dilihat.

## Skenario 3 - Proses kandidat

1. Buka kandidat berstatus **Baru**.
2. Pastikan NIK lengkap hanya tampil pada detail, bukan pada daftar.
3. Buka foto diri, KTP, dan KK. Semua harus tampil setelah login.
4. Simpan catatan internal dan pastikan catatan tidak terlihat di form publik.
5. Ubah tahap menjadi **Diproses**, kemudian **Lolos**.
6. Muat ulang halaman dan pastikan histori berurutan serta nama petugas tampil.
7. Tekan aksi yang sama dua kali dengan cepat. Histori tidak boleh ganda.

## Skenario 4 - Tidak Lolos dan mendaftar kembali

1. Gunakan kandidat percobaan lain dan ubah menjadi **Tidak Lolos**.
2. Isi alasan yang aman dibaca pelamar dan catatan internal yang berbeda.
3. Daftar lagi memakai NIK, nomor KK, tanggal lahir, dan site yang sama.
4. Form harus memberi tahu bahwa pelamar pernah Tidak Lolos dan hanya
   menampilkan alasan untuk pelamar.
5. Catatan internal HR tidak boleh muncul.
6. Pendaftaran baru tetap dapat dikirim dan mendapat nomor bukti baru.

## Skenario 5 - Penolakan data ganda

Periksa tiga keadaan berikut:

- NIK masih memiliki lamaran Baru, Diproses, atau Lolos;
- NIK sudah menjadi karyawan;
- dua tab mengirim NIK yang sama hampir bersamaan.

Semua keadaan harus ditolak dengan pesan umum. Respons publik tidak boleh
memberi tahu nama karyawan, nomor karyawan, site lain, atau catatan HR.

## Skenario 6 - Berkas dan keamanan

1. Coba kirim tanpa salah satu dari tiga foto.
2. Coba unggah file teks yang namanya diganti menjadi `.jpg`.
3. Coba unggah file lebih dari 5 MB.
4. Coba buka alamat dokumen kandidat tanpa login.
5. Coba buka sebagai akun tanpa izin Rekrutmen.
6. Coba buka sebagai HR dari site lain.

Seluruh percobaan harus ditolak. Lokasi penyimpanan dokumen tidak boleh muncul
pada respons maupun pesan kesalahan.

## Skenario 7 - Konversi menjadi Master Karyawan

1. Buka kandidat **Lolos**, lalu pilih **Lengkapi data karyawan**.
2. Pastikan biodata pelamar sudah terisi dan site tidak dapat diganti.
3. Lengkapi jenis karyawan, penempatan, bagian produksi, dan tanggal bergabung.
4. Simpan dan pastikan diarahkan ke detail karyawan yang baru dibuat.
5. Pastikan status karyawan masih **Nonaktif**.
6. Periksa foto profil, dokumen KTP dan KK, serta histori penempatan awal.
7. Kembali ke Rekrutmen. Kandidat harus berstatus **Sudah menjadi karyawan**
   dan menyediakan tombol untuk membuka data karyawan.
8. Periksa Audit Trail untuk pembuatan karyawan dan perubahan kandidat.
9. Coba kirim ulang proses yang sama. Karyawan kedua tidak boleh terbentuk.

Aktivasi karyawan tetap dilakukan melalui kontrak. Konversi Rekrutmen tidak
boleh melewati proses kontrak atau langsung mengaktifkan karyawan.

## Bukti UAT

Catat untuk setiap perangkat:

| Pemeriksaan | Perangkat/Akun | Hasil | Catatan |
| --- | --- | --- | --- |
| Form publik desktop |  |  |  |
| Form publik HP dan kamera |  |  |  |
| Tautan Semarang |  |  |  |
| Tautan Klaten |  |  |  |
| Tautan Jepara |  |  |  |
| HR terbatas satu site |  |  |  |
| Super Admin seluruh site |  |  |  |
| Proses sampai Lolos |  |  |  |
| Tidak Lolos dan daftar ulang |  |  |  |
| Konversi ke Master Karyawan |  |  |  |
| Dokumen privat dan Audit Trail |  |  |  |

Simpan nomor bukti dan nomor karyawan percobaan. Jangan memasukkan NIK, nomor
KK, token site, atau foto identitas ke screenshot laporan UAT.
