# Handoff Sesi HRIS RSIA - 5 September 2026

Dokumen ini dibuat agar sesi Codex berikutnya dapat langsung melanjutkan tanpa
meminta Bos menceritakan ulang seluruh konteks.

## Instruksi untuk sesi berikutnya

1. Baca file ini sampai selesai.
2. Baca `AGENTS.md`, `docs/HRIS_BUSINESS_RULES.md`, `docs/UI_STANDARDS.md`, dan
   `docs/UI_TABLE_STANDARD.md` sebelum mengubah alur bisnis atau UI.
3. Untuk pekerjaan berbasis data, jadikan
   `db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql` sebagai acuan schema, tetapi cocokkan
   kembali dengan database aktif secara baca-saja jika status migration penting.
4. Jangan menjalankan migration, seed, perubahan database aktif, deployment,
   atau perubahan production tanpa permintaan langsung dari Bos.
5. Pertahankan perubahan lokal yang belum di-commit. Jangan melakukan reset,
   checkout, atau merapikan file di luar scope.
6. Gunakan `pnpm` di lokal. Jangan mengedit `src/routeTree.gen.ts` secara manual.

## Ringkasan aplikasi

- Nama aplikasi: HRIS RSIA / PT Restu Sejati Inti Abadi.
- Frontend: React, Vite, TypeScript, Tailwind, shadcn/ui, TanStack Router,
  TanStack Query, dan TanStack Table.
- Backend: Express, TypeScript, MySQL/MariaDB, autentikasi cookie, permission,
  dan pembatasan akses site.
- Site operasional: Jepara, Klaten, dan Semarang.
- Modul utama: Karyawan, Rekrutmen, Kontrak, Mutasi, Attendance, Produksi
  Borongan, Payroll, Laporan, Pengaturan, User dan Hak Akses, Audit Trail, serta
  Knowledge Base.

## Status pekerjaan besar dalam rangkaian sesi ini

### 1. Attendance

Fitur yang sudah tersedia dan pernah diverifikasi dalam rangkaian sesi:

- Master Shift dan histori penugasan Shift.
- Koreksi historis penugasan Shift dengan preview dampak, rekonsiliasi
  Attendance, dan invalidasi finalisasi.
- Monitoring Harian, tindak lanjut koreksi/klasifikasi, Rekap Attendance,
  Kalender Kerja, dan Master Perangkat.
- Finalisasi per site dan tanggal.
- Bulk Finalisasi per site berdasarkan rentang atau seluruh tanggal tertunda,
  dengan preview tanggal dan alasan otomatis dari sistem.
- Pembatalan klasifikasi Attendance yang sudah disetujui melalui reversal yang
  tetap menjaga histori.
- Filter jenis karyawan dan Bagian Produksi pada halaman Attendance terkait.
- Navigasi nama karyawan dari Monitoring Harian ke detail karyawan.
- Kartu Kesiapan Attendance default tertutup.
- Daftar tanggal yang benar-benar masih memerlukan finalisasi ulang dihitung
  ulang terhadap histori, Shift, dan kalender terbaru. Marker invalidasi lama
  tetap menjadi jejak audit tetapi tidak lagi otomatis dianggap tugas tertunda.
- Badge perhatian sudah diperjelas. Contoh `2` sekarang tampil sebagai
  `2 perangkat belum siap`; jika penyebabnya campuran, rincian sumber masalah
  ditampilkan pada ringkasan.

Commit terbaru terkait Attendance:

- `9929cf647e1a2dadcc8ff107f7645a5b5cd63280`
  `feat(attendance): enhance attendance readiness panel with attention details and labels`

### 2. Produksi Borongan

- Fondasi satuan, pekerjaan, tarif per site, penugasan pekerjaan utama dan
  tambahan, Terminal Setoran, transaksi, rekap, serta koreksi/void transaksi
  sudah tersedia.
- Penugasan pekerjaan disimpan sebagai histori. Seorang karyawan boleh memiliki
  beberapa pekerjaan aktif, tetapi hanya satu pekerjaan utama efektif pada
  tanggal yang sama.
- Terminal Produksi mensyaratkan Attendance Hadir dan Scan Masuk sukses,
  pekerjaan utama yang tunggal, pekerjaan aktif, satuan aktif, serta tarif aktif
  tunggal pada site dan tanggal transaksi.
- Seed satu tanggal `db/seeds/20260821_production_seed_one_date.sql` hanya
  menambah fakta ke `production_transactions`; temporary table hanya hidup
  selama eksekusi.
- Jangan menjalankan seed tanpa permintaan Bos dan verifikasi environment.

### 3. Payroll

- Fondasi Payroll berbasis waktu dan borongan, simulasi, kesiapan periode,
  approval, closing, histori, ekspor, serta slip gaji sudah tersedia.
- Migration Payroll pernah diperiksa dan Bos menyatakan seluruh migration yang
  dibahas telah dijalankan. Untuk sesi baru, tetap verifikasi database aktif
  secara baca-saja jika keputusan bergantung pada status schema saat ini.
- Panduan operasional ada di `docs/PAYROLL_OPERATIONAL_UAT_GUIDE.md`.

### 4. Pusat Laporan

Halaman laporan sudah dibuat sebagai submenu langsung di bawah menu `Laporan`,
bukan sebagai kumpulan kartu pembuka. Label submenu tidak mengulang kata
`Laporan`.

Laporan yang tersedia:

- Karyawan.
- Kontrak.
- Mutasi.
- Attendance.
- Cuti, Sakit, dan Izin.
- Koreksi Attendance.
- Penugasan Shift.
- Perangkat dan Aktivitas Scan.
- Produksi Borongan.
- Payroll Final.
- Audit Aktivitas Pengguna.
- Perubahan Jumlah Karyawan.
- Masa Kerja dan Turnover.

Ekspor Excel dan pengujian silang antar-laporan sudah pernah dikerjakan. Panduan
UAT berada di `docs/REPORTS_CENTER_UAT_GUIDE.md`.

### 5. Rekrutmen

Rencana dan status lengkap ada di `docs/RECRUITMENT_IMPLEMENTATION_PLAN.md`.

Ringkasannya:

- M1 fondasi data dan permission: selesai.
- M2 API publik, file privat, Turnstile, rate limit, dan perlindungan submit
  ganda: selesai di source.
- M3 Form Data Pelamar publik: selesai di source.
- M4 halaman Rekrutmen internal: selesai di source.
- M5 konversi kandidat Lolos menjadi Master Karyawan: selesai di source.
- M6 UAT otomatis: lulus. UAT browser nyata, kamera HP, Turnstile pada hostname
  publik, dan alur dengan data percobaan tetap perlu dilakukan.

Aturan penting:

- Form publik berada di `/form-data-pelamar/:siteToken`.
- QR/tautan berbeda per site dan site dikunci oleh token.
- Status manual: Baru, Diproses, Lolos, dan Tidak Lolos. Status sudah menjadi
  karyawan diberikan otomatis setelah konversi berhasil.
- Status Lolos belum otomatis membuat karyawan. HR harus membuka `Lengkapi data
  karyawan`, melengkapi penempatan, lalu menyimpan.
- Foto pelamar, KTP, dan KK disimpan privat dan disalin ke data karyawan saat
  konversi berhasil.
- Turnstile boleh dilewati hanya pada environment lokal/development sesuai
  konfigurasi source; pada production wajib aktif dan diverifikasi server.
- Jangan menuliskan token site, secret Turnstile, credential R2, atau isi
  `apps/api/.env` ke chat, dokumentasi, log, maupun test fixture.
- Knowledge Base Rekrutmen berada di
  `docs/kbase/karyawan/KBASE_REKRUTMEN.md` sebagai subbab terpisah di bawah
  heading Karyawan.

### 6. Administrasi sistem dan profil

- Halaman Profil Saya tersedia dari dropdown avatar dan mendukung perubahan
  data akun serta password.
- Sidebar bawah memakai copyright perusahaan, bukan avatar pengguna.
- Kelola User dan Hak Akses serta Audit Trail sudah diimplementasikan.
- Menu Template Dokumen dihilangkan karena tidak digunakan.

## Perubahan paling baru

### Branding sidebar

Logo sidebar diarahkan ke `public/brand/restu-logo-2.png` melalui
`src/components/app-brand.tsx`.

Commit terbaru:

- `f61bc9a9e7d64c2e333d83838347fdbe56d028c5`
  `fix(app-brand): remove commented-out code and clean up JSX structure`

Namun kondisi working tree saat handoff berbeda dari commit tersebut:

- Seluruh isi visual di dalam `AppBrand` sedang dikomentari oleh edit lokal.
- Akibatnya sidebar brand menjadi kosong.
- `APP_LOGO_SRC`, `APP_SHORT_NAME`, `compact`, `imageFailed`, dan
  `setImageFailed` menjadi tidak terpakai dan pemeriksaan TypeScript penuh gagal
  dengan `TS6133`.
- Jangan otomatis membatalkan edit ini. Tanyakan kepada Bos apakah visual logo
  memang sengaja disembunyikan. Jika logo harus tampil, aktifkan kembali blok
  JSX dan pertahankan `APP_LOGO_SRC` yang menunjuk `restu-logo-2.png`.

### TanStack Devtools

Di `src/routes/__root.tsx`, import dan blok render React Query Devtools serta
TanStack Router Devtools sedang dikomentari. Tujuannya agar logo/tombol TanStack
tidak tampil di kanan atau kiri bawah saat development lokal.

### Infografis alur karyawan Borongan

Infografis alur dari Form Data Pelamar sampai Payroll telah dibuat dan disimpan
di:

`docs/assets/infografis-alur-karyawan-produksi-borongan.png`

File tersebut belum di-commit saat handoff. Belum dipasang ke halaman Knowledge
Base; lakukan hanya jika Bos meminta.

## Kondisi Git saat handoff

- Branch: `main`.
- Posisi: 2 commit di depan `origin/main`.
- Dua commit lokal teratas:
  - `f61bc9a` branding sidebar memakai `restu-logo-2.png`.
  - `9929cf6` penjelasan badge Kesiapan Attendance dan perbaikan finalisasi ulang.
- Perubahan belum di-commit:
  - `M src/components/app-brand.tsx`
  - `?? docs/assets/infografis-alur-karyawan-produksi-borongan.png`

Selalu jalankan `git status --short` lagi karena Bos dapat melakukan commit atau
edit setelah dokumen ini dibuat.

## Status validasi terakhir

- Perubahan Kesiapan Attendance: unit test khusus 2/2 lulus, ESLint lulus, dan
  build frontend production lulus sebelum commit.
- Branding sidebar dengan blok JSX aktif dan `restu-logo-2.png`: format, ESLint,
  dan build frontend pernah lulus.
- Kondisi working tree terkini belum build-clean karena blok JSX `AppBrand`
  sedang dikomentari, menghasilkan error TypeScript `TS6133` seperti dijelaskan
  di atas.
- Tidak ada migration, seed, perubahan database aktif, atau deployment yang
  dijalankan pada pekerjaan branding dan infografis terbaru.

## Aturan bisnis yang paling sering menimbulkan kebingungan

### Penugasan Shift

- Penugasan Shift menentukan jadwal masuk/pulang dan hari kerja Attendance.
- Penugasan pertama boleh dimundurkan paling awal ke tanggal terbesar antara
  go-live Attendance dan awal histori kerja aktif yang eligible pada site Shift.
- Setelah pernah mempunyai histori penugasan, form biasa hanya boleh dimulai
  hari ini atau masa depan.
- Perubahan historis memakai Koreksi Penugasan Shift, preview dampak, dan alasan;
  jangan menimpa atau menghapus histori secara manual.
- Penugasan berlaku seterusnya hanya aman untuk periode paling akhir, karyawan
  masih aktif pada site tersebut, serta tidak memiliki mutasi atau perubahan
  status terjadwal.
- Koreksi diblokir oleh Produksi `POSTED`, Payroll terkunci/snapshot, atau
  finalisasi yang sedang berjalan.

### Penugasan Pekerjaan

- Penugasan Pekerjaan menentukan pekerjaan Produksi yang boleh disetorkan.
- Beberapa pekerjaan tambahan boleh aktif, tetapi hanya satu pekerjaan utama
  boleh efektif pada tanggal yang sama.
- Pekerjaan utama menjadi pilihan awal Terminal Setoran.
- Penugasan, pekerjaan, satuan, dan tarif aktif harus sesuai site serta tanggal.
- Penugasan baru tidak otomatis menutup histori pekerjaan lama; gunakan Akhiri
  Penugasan atau Koreksi Histori.
- Koreksi diblokir jika membuat overlap, menghasilkan lebih dari satu pekerjaan
  utama, bertentangan dengan histori kerja, menyentuh Payroll terkunci, atau
  mengganti pekerjaan yang sudah dipakai transaksi `POSTED`.

## Langkah pertama paling aman pada sesi baru

1. Jalankan `git status --short`.
2. Baca diff `src/components/app-brand.tsx`.
3. Konfirmasi kepada Bos apakah brand sidebar harus ditampilkan menggunakan
   `restu-logo-2.png` atau memang sengaja dikosongkan.
4. Setelah keputusan jelas, rapikan `AppBrand` dan jalankan:

   ```bash
   pnpm exec prettier --check src/components/app-brand.tsx src/routes/__root.tsx
   pnpm exec eslint src/components/app-brand.tsx src/routes/__root.tsx
   pnpm build:frontend
   ```

5. Jika Bos ingin infografis muncul dalam aplikasi, pasang file dari
   `docs/assets/` ke Knowledge Base dalam perubahan terpisah.
6. Jika kembali ke Rekrutmen, prioritas paling waras adalah UAT browser nyata
   end-to-end dengan data percobaan pada hostname publik yang Turnstile-nya
   valid.

## Pesan singkat yang dapat ditempel ke sesi baru

```text
Jo, lanjutkan repo HRIS RSIA ini. Baca dulu docs/SESSION_HANDOFF_20260905.md
sampai selesai, lalu cek git status dan source terkini. Pertahankan semua
perubahan lokal, jangan jalankan migration/seed/database/deploy tanpa izin, dan
jangan edit routeTree.gen.ts manual. Setelah membaca handoff, jelaskan singkat
posisi repo dan rekomendasi tindakan pertama sebelum melakukan perubahan.
```
