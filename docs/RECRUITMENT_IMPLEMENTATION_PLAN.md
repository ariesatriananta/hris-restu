# Rencana Implementasi Modul Rekrutmen

Dokumen ini menjadi pegangan implementasi lintas sesi untuk fitur Rekrutmen
HRIS RSIA. Kerjakan milestone secara berurutan dan jangan melanjutkan milestone
berikutnya sebelum milestone aktif sudah diuji.

## Tujuan

Menyediakan Form Data Pelamar yang sederhana, aman, dan nyaman digunakan dari
HP, kemudian membantu HR memproses kandidat sampai data yang lolos siap dibuat
menjadi karyawan melalui alur Master Karyawan yang sudah ada.

```text
Form Data Pelamar
        |
        v
Baru -> Diproses -> Lolos / Tidak Lolos
                         |
                         v
               Lengkapi data karyawan
                         |
                         v
              Master Karyawan (Nonaktif)
                         |
                         v
                  Kontrak dan aktivasi
```

## Keputusan yang sudah dikunci

1. Halaman publik bernama **Form Data Pelamar** dan menampilkan logo serta nama
   perusahaan pada header dengan tampilan sederhana dan elegan.
2. Setiap site mempunyai QR atau tautan sendiri. Site tujuan otomatis dikunci
   oleh tautan dan nama site tetap terlihat pada form.
3. Tahap manual hanya **Baru**, **Diproses**, **Lolos**, dan **Tidak Lolos**.
   Penanda **Sudah menjadi karyawan** diberikan otomatis oleh sistem.
4. Pelamar tidak memilih lowongan, jabatan, modul, atau bagian produksi. HR
   melengkapi penempatan ketika kandidat dinyatakan Lolos.
5. Status Lolos tidak langsung membuat karyawan. HR membuka aksi **Lengkapi
   data karyawan**, memeriksa data, lalu menyimpan form Master Karyawan.
6. Kandidat Tidak Lolos boleh mendaftar kembali. Form memberikan pemberitahuan
   tentang lamaran lama dan alasan yang aman untuk dibaca pelamar.
7. Alasan untuk pelamar harus dipisahkan dari catatan internal HR. Catatan
   internal tidak pernah dikirim oleh endpoint publik.
8. Seluruh data kandidat Tidak Lolos dipertahankan sebagai arsip dan tidak
   dihapus otomatis.
9. Foto hanya menerima JPG, PNG, atau WebP dengan batas 5 MB per berkas.
10. Fase awal hanya memberi nomor bukti pendaftaran. Tidak ada portal publik
    untuk melihat status lamaran.
11. Nomor HP/WhatsApp wajib dan email opsional.
12. Migration boleh ditambahkan, tetapi hanya pemilik sistem yang menjalankan
    migration pada database tujuan.

## Data Form Publik

### Isian wajib

- Site tujuan, berasal dari QR/tautan dan tidak dapat diganti.
- Nama lengkap sesuai KTP.
- NIK 16 digit.
- Nomor KK 16 digit.
- Jenis kelamin.
- Tempat lahir.
- Tanggal lahir.
- Alamat sesuai KTP dalam satu kolom.
- Nomor HP/WhatsApp.
- Foto diri.
- Foto KTP.
- Foto KK.
- Persetujuan penggunaan data untuk proses rekrutmen.

### Isian opsional

- Email.

## Status dan Perpindahan

| Status | Diubah oleh | Perpindahan yang diperbolehkan |
| --- | --- | --- |
| `NEW` | Sistem setelah form dikirim | `IN_PROGRESS`, `REJECTED` |
| `IN_PROGRESS` | HR | `PASSED`, `REJECTED` |
| `PASSED` | HR | `IN_PROGRESS`, `REJECTED`, `CONVERTED` oleh sistem |
| `REJECTED` | HR | Status akhir untuk lamaran tersebut; pelamar boleh membuat lamaran baru |
| `CONVERTED` | Sistem | Status akhir setelah karyawan berhasil dibuat |

Setiap perubahan wajib menambah histori status. Histori tidak boleh ditimpa
atau dihapus dari halaman operasional.

## Aturan Pendaftaran Ulang

- NIK yang masih memiliki lamaran `NEW`, `IN_PROGRESS`, atau `PASSED` tidak
  boleh membuat lamaran aktif baru.
- NIK dengan lamaran terakhir `REJECTED` boleh mendaftar kembali.
- Pemberitahuan publik hanya memakai alasan yang disiapkan untuk pelamar.
- Pengecekan publik harus memakai gabungan identitas yang cukup dan responsnya
  tidak boleh membocorkan catatan internal, data kandidat lain, atau keberadaan
  seorang karyawan.
- NIK yang sudah terhubung dengan Master Karyawan tidak boleh membuat lamaran
  baru melalui form publik.

## Hak Akses

- `recruitment.view`: melihat daftar, detail, histori, dan dokumen kandidat
  sesuai cakupan site.
- `recruitment.manage`: mengubah tahap, mengisi alasan, dan memulai pelengkapan
  data karyawan sesuai cakupan site.
- HR Officer mendapat kedua permission untuk site aksesnya.
- Super Admin mendapat kedua permission untuk seluruh site.
- Endpoint publik tidak memakai permission internal, tetapi wajib dilindungi
  validasi server, pembatasan kiriman, dan pemeriksaan bot.

## Aturan Berkas

- Jenis berkas kandidat hanya `PHOTO`, `KTP`, dan `KK`; masing-masing tepat satu
  berkas aktif per lamaran pada fase awal.
- Berkas disimpan dengan nama acak dan visibility privat.
- API tidak boleh mengirim alamat penyimpanan atau URL permanen kepada publik.
- Pengguna internal membuka berkas melalui endpoint terautentikasi dengan
  pemeriksaan permission dan site.
- Server wajib memeriksa jenis dan isi berkas, ukuran maksimal 5 MB, serta
  membersihkan metadata foto sebelum penyimpanan final.

## Milestone

### M1 - Fondasi data dan aturan

Status: **Selesai dan terverifikasi pada database aktif**

- Tambahkan tabel kandidat, penghubung berkas, dan histori status.
- Gunakan UID publik untuk kandidat dan histori.
- Hubungkan kandidat ke site dan, setelah konversi, ke karyawan.
- Tambahkan constraint satu lamaran aktif per NIK.
- Pisahkan alasan untuk pelamar dari catatan internal HR.
- Tambahkan permission `recruitment.view` dan `recruitment.manage`.
- Berikan permission awal kepada HR Officer dan Super Admin.
- Sinkronkan migration, schema utama, dan aturan bisnis.
- Jangan membuat endpoint atau UI pada milestone ini.

Artefak M1:

- `db/migrations/20260904_recruitment_foundation.sql`
- Bagian Rekrutmen pada `db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql`
- Aturan Rekrutmen pada `docs/HRIS_BUSINESS_RULES.md`
- Dokumen milestone ini.

Catatan kompatibilitas MariaDB: constraint konversi hanya memeriksa pasangan
status dan waktu konversi. Keharusan `employee_id` serta `converted_by` akan
dikunci oleh transaksi service pada M5 karena kolom foreign key dengan aksi
referensial tidak aman dimasukkan ke CHECK pada MariaDB yang dipakai project.

Kriteria selesai:

- Migration aman dijalankan ulang setelah DDL parsial.
- Schema utama dan migration konsisten.
- Status, relasi, indeks, permission, dan constraint tervalidasi.
- Tidak ada perubahan atau eksekusi pada database aktif.

### M2 - API publik dan keamanan

Status: **Selesai di source code; menunggu konfigurasi environment tujuan**

- Endpoint konfigurasi form berdasarkan token/link site.
- Endpoint pengecekan pendaftaran ulang yang tidak membocorkan data sensitif.
- Endpoint submit biodata dan tiga foto.
- Nomor bukti pendaftaran dan perlindungan submit ganda.
- Turnstile yang diverifikasi server dan rate limit.
- Pipeline berkas privat: pemeriksaan isi, ukuran, dimensi, metadata, dan orphan.
- Integration test untuk duplikat, bot, file tidak valid, dan kegagalan parsial.

Endpoint M2:

- `GET /api/public/recruitment/:siteToken/config` mengambil identitas
  perusahaan, site yang dikunci oleh tautan, versi persetujuan privasi, batas
  berkas, dan site key Turnstile yang memang aman dikirim ke browser.
- `POST /api/public/recruitment/:siteToken/check` memeriksa apakah pengisian
  boleh dilanjutkan. Pemeriksaan riwayat Tidak Lolos memakai gabungan NIK,
  nomor KK, tanggal lahir, dan site agar alasan milik orang lain tidak bocor.
- `POST /api/public/recruitment/:siteToken/submit` menerima biodata dan tepat
  satu foto diri, KTP, serta KK. Respons hanya berisi nomor bukti dan pesan
  umum; ID database serta lokasi berkas tidak pernah dikirim.

Konfigurasi yang wajib diisi pada environment API tujuan sebelum form dibuka:

- `RECRUITMENT_SITE_TOKENS_JSON`: pasangan token acak dan kode site. Token
  berbeda digunakan untuk QR atau tautan setiap site.
- `RECRUITMENT_TURNSTILE_SITE_KEY`: kunci publik Turnstile untuk browser.
- `RECRUITMENT_TURNSTILE_SECRET_KEY`: kunci rahasia yang hanya berada di API.
- `RECRUITMENT_TURNSTILE_EXPECTED_HOSTNAME`: nama host form publik yang sah.
- `RECRUITMENT_R2_BUCKET_NAME`: bucket privat khusus dokumen Rekrutmen.
- `RECRUITMENT_R2_KEY_PREFIX`: awalan folder objek privat Rekrutmen.

Aturan teknis M2 yang harus dipertahankan pada milestone berikutnya:

- Turnstile diverifikasi oleh API sebelum file diproses. Pada production,
  endpoint ditutup apabila konfigurasi Turnstile atau bucket privat belum
  lengkap.
- Rate limit dipisahkan untuk konfigurasi, pemeriksaan identitas, dan submit.
- File maksimal 5 MB per unggahan, isi aslinya wajib JPG, PNG, atau WebP, dan
  gambar maksimal 25 juta piksel. Server memproses ulang gambar menjadi JPG
  agar metadata perangkat dan lokasi tidak ikut disimpan.
- Bucket Rekrutmen tidak memakai alamat publik. Tabel `files` hanya menyimpan
  lokasi internal dengan visibility `INTERNAL`.
- Satu NIK dikunci selama submit untuk mencegah dua proses bersamaan. Kunci
  idempotensi yang sama hanya boleh mengembalikan nomor bukti lama jika seluruh
  biodata dan checksum ketiga gambar juga sama.
- Kegagalan database membatalkan seluruh transaksi dan objek yang sudah
  terunggah dibersihkan agar tidak menjadi berkas yatim.

### M3 - Form Data Pelamar

Status: **Selesai di source code; menunggu konfigurasi environment dan UAT nyata**

- Route publik di luar layout login.
- Header logo, nama perusahaan, dan nama site.
- Form mobile-first dengan input kamera dan preview foto.
- Validasi ringan dalam Bahasa Indonesia.
- Persetujuan data, indikator proses, pencegahan klik ganda, dan halaman sukses.
- Meta `noindex` dan UAT pada HP.

Artefak dan perilaku M3:

- Form publik tersedia pada `/form-data-pelamar/:siteToken` dan tidak memakai
  layout maupun pemeriksaan login pengguna internal.
- Header mengambil logo dan nama perusahaan dari API serta selalu menampilkan
  site yang dikunci oleh token tautan.
- Pengisian dibagi menjadi tiga tahap ringan: pemeriksaan identitas, pelengkapan
  biodata dan foto, lalu bukti pendaftaran.
- Foto dapat diambil dengan kamera HP atau dipilih dari perangkat. Pelamar
  mendapat pratinjau serta dapat mengganti atau menghapus foto sebelum submit.
- Hasil pemeriksaan identitas dibatalkan apabila NIK, nomor KK, atau tanggal
  lahir diubah. Challenge Turnstile diperbarui setelah setiap percobaan gagal
  karena token keamanan hanya boleh dipakai satu kali.
- Klik kirim ganda dicegah. Percobaan ulang tanpa perubahan memakai kunci
  pengiriman yang sama, sedangkan perubahan biodata atau foto membuat kunci
  pengiriman baru.
- Halaman sukses hanya menampilkan nomor bukti pendaftaran dan imbauan keamanan;
  tidak menyediakan portal status publik.
- Halaman memasang `noindex`, `nofollow`, dan `noarchive` selama route aktif.

Validasi source M3:

- Tes validasi dan kontrak API frontend: 2 file, 5 skenario lulus.
- ESLint file Rekrutmen publik lulus.
- Build frontend dan pembentukan route TanStack lulus.
- UAT nyata dengan Turnstile, bucket privat, kamera HP, dan submit ke database
  tetap dilakukan setelah environment Rekrutmen tujuan dikonfigurasi.

### M4 - Halaman Rekrutmen internal

Status: **Belum dikerjakan**

- Menu **Karyawan > Rekrutmen**.
- DataTable standar dengan URL-backed search, filter site, status, dan tanggal.
- Ringkasan Baru, Diproses, serta Lolos yang belum menjadi karyawan.
- Detail kandidat, dokumen privat, histori status, dan catatan HR.
- Aksi Mulai proses, Nyatakan lolos, Tidak lolos, dan Lengkapi data karyawan.
- Permission, pembatasan site, audit, responsive mobile, dan `returnTo`.

### M5 - Konversi ke Master Karyawan

Status: **Belum dikerjakan**

- Prefill form Master Karyawan dari data kandidat.
- HR melengkapi jenis karyawan, penempatan, tanggal bergabung, dan data wajib.
- Periksa kembali NIK dan status kandidat tepat sebelum penyimpanan.
- Buat karyawan Nonaktif, nomor karyawan, histori INITIAL, foto, dan dokumen KTP
  serta KK dalam satu proses yang aman terhadap pengulangan.
- Tandai kandidat `CONVERTED` hanya setelah seluruh proses berhasil.
- Kontrak dan aktivasi tetap memakai alur existing.

### M6 - UAT end-to-end

Status: **Belum dikerjakan**

- Uji desktop dan HP, termasuk penggunaan kamera.
- Uji QR ketiga site dan pembatasan akses lintas site.
- Uji NIK aktif, pernah ditolak, sudah menjadi karyawan, dan submit bersamaan.
- Uji file rusak, ekstensi palsu, file besar, retry, dan orphan file.
- Uji histori, audit, konversi, kegagalan transaksi, dan klik ganda.
- Pastikan dokumen privat tidak dapat dibuka tanpa login dan permission.

## Di luar scope versi pertama

- Master lowongan dan posisi yang dilamar.
- Jadwal interview dan undangan otomatis.
- Psikotes, scoring, ranking, atau rekomendasi otomatis.
- Portal akun pelamar dan pengecekan status publik.
- Email atau WhatsApp otomatis.
- Penghapusan otomatis arsip kandidat.

## Catatan untuk sesi berikutnya

Sebelum melanjutkan, baca dokumen ini, `docs/HRIS_BUSINESS_RULES.md`,
`docs/UI_STANDARDS.md`, `docs/UI_TABLE_STANDARD.md`, dan
`db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql`. Periksa migration M1 dan status database
secara read-only; jangan menganggap migration sudah dijalankan hanya karena
filenya tersedia.
