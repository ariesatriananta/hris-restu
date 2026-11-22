# Rencana konsistensi arsip migrasi dan antrean operasional

Status: implementasi kode selesai, verifikasi 23 November 2026; DB aplikasi hanya dibaca.
Persetujuan arah bisnis Owner: 23 November 2026.

## Sasaran

Arsip legacy tetap bisa dicari dan dibuka, tetapi tidak dianggap registrasi baru
yang memerlukan kontrak/onboarding/penempatan. Karyawan operasional hasil migrasi
tetap menjalani pemeriksaan kelengkapan normal. Pelanggaran nyata dan hak atas
transaksi/histori periode lama tidak boleh disembunyikan.

Snapshot audit read-only: 395 aktif Borongan sudah memiliki masing-masing satu
histori, shift dan pekerjaan; 3.330 arsip tidak memiliki histori, shift,
pekerjaan, attendance, produksi, komponen payroll atau hasil payroll.
Arsip nonaktif: 621 LEGACY_UNKNOWN + 101 Training. Arsip resign: 64
LEGACY_UNKNOWN + 2.544 Training. Jangan mengandalkan jenis saja atau mengubah
Training historis menjadi LEGACY_UNKNOWN.

## Aturan bersama

1. LEGACY_UNKNOWN adalah jenis arsip internal, selalu di luar antrean onboarding
   dan pilihan operasional. Jika salah menjadi Aktif, jangan membiarkannya scan
   atau menghitung payroll; laporkan anomali data, bukan ajakan onboarding biasa.
2. Arsip migrasi berjenis operasional dikenali dari metadata import terverifikasi
   dan status sumber asli nonaktif/resign, bersama kondisi saat ini. Sumber
   Klaten telah memiliki hash, sourceRow, baseline dan raw status Excel dalam
   employees.notes. Tidak memakai prefix nomor/nama/tanggal NULL sebagai tebakan.
3. Karyawan yang aktif saat cutoff, atau sudah masuk kerja kembali melalui alur
   operasional, tidak boleh dikecualikan hanya karena mempunyai metadata import.
   Draft/jadwal kontrak baru pada arsip berjenis operasional adalah pekerjaan
   nyata yang harus ditampilkan, bukan dihilangkan oleh flag asal data.
4. Arsip tanpa kontrak bukan konflik atau kekurangan kontrak. Namun kontrak
   aktif bertentangan dengan status arsip, kontrak aktif ganda, overlap dan
   persoalan payroll/transaksi nyata tetap diperiksa dan ditampilkan.
5. Tidak mengecualikan data historis berdasarkan status karyawan hari ini.
   Attendance/Produksi/Payroll historis memakai eligibility pada periode kerja.
6. Metadata import harus bertahan saat catatan diedit. Endpoint update sekarang
   menulis employees.notes dari input, sehingga penanda dapat hilang. Parser
   dan penyimpanan catatan harus memisahkan teks operasional dari metadata
   terproteksi; client tidak bisa menghapus, memalsukan atau mengubah penanda.
   Periksa juga registration-correction/import/update lain yang menulis notes.
   Tidak perlu menambah kolom sebelum pendekatan ini diuji.

## Paket implementasi dan titik perubahan

### A. Kebijakan arsip dan metadata

- Helper bersama untuk klasifikasi arsip, SQL predicate dan pelestarian metadata.
- Baca bentuk JSON/string dari driver dengan aman; notes biasa, NULL dan JSON
  rusak tidak boleh menyebabkan query/error global.
- Metadata yang tidak dikenali tidak langsung diberi exemption. Laporkan
  sebagai data yang perlu ditinjau, jangan menebak bahwa semua nonaktif arsip.
- Lindungi metadata dalam endpoint update tanpa mengubah validasi tanggal
  registrasi/profil yang sebelumnya diminta Owner tetap wajib. Jangan mengisi
  tanggal/kontrak fiktif untuk melewati validasi.

### B. Data Karyawan

- employees.ts /onboarding-readiness: exclusion di query sebelum LIMIT 500,
  bukan filter hasil di frontend. Counts dan daftar berasal dari populasi sama.
- Banner, tombol per baris dan dialog onboarding menggunakan hasil yang sama.
- employee-summary.ts: hanya KPI pekerjaan penempatan mengecualikan arsip;
  total/nonaktif/resign tetap merepresentasikan data yang disimpan.
- Kebutuhan bagian produksi hanya berlaku untuk jenis yang memang memerlukannya;
  HARIAN/BULANAN tidak ditandai kurang lengkap hanya karena tidak punya modul.
- Tooltip KPI menjelaskan cakupan. Jangan menyebut jumlah nonaktif sebagai
  jumlah orang yang wajib dibuatkan kontrak.
- Data Karyawan/detail tetap menampilkan arsip dengan jenis/status tersimpan;
  catatan tidak menampilkan metadata teknis import. Tidak menambah status baru.

### C. Kontrak dan cron

- employees.ts /contracts/summary: KPI Perlu Kontrak mengecualikan arsip tanpa
  kewajiban onboarding, tetapi tetap menghitung karyawan operasional bermasalah.
- /contracts dengan coverage ACTIVE_WITHOUT_VALID_CONTRACT memakai predicate
  yang sama dengan KPI, termasuk scope site/modul/bagian dan periode.
- /contracts/conflicts: kecualikan hanya kondisi semu onboarding tanpa kontrak;
  jangan membuang seluruh baris arsip sebelum memeriksa konflik kontrak nyata.
- contract-lifecycle.ts runContractsReconcile dan policy: keputusan yang sama
  dengan endpoint alert; arsip tanpa kontrak tidak menambah legacyConflicts,
  tidak diaktifkan, tidak diubah status dan tidak dibuatkan kontrak/histori.
- Cek jalur batch/manual activation, rehire dan rekonsiliasi agar pengguna tidak
  dapat memulai onboarding LEGACY_UNKNOWN melalui URL/API langsung.

### D. Attendance/Produksi/Payroll

- Attendance terminal, batch, penugasan dan picker: jenis operasional saja;
  LEGACY_UNKNOWN tetap ditolak walaupun status sengaja salah diset Aktif.
- Produksi: pertahankan whitelist Borongan/Training dan histori efektif;
  pengecekan server berlaku scan/manual/batch, bukan menyembunyikan opsi saja.
- Payroll: pertahankan cakupan histori, tipe periode dan transaksi; arsip tidak
  masuk populasi baru karena master employee_types payroll_basis=TIME_BASED.
  Tolak LEGACY_UNKNOWN di konfigurasi/pemilihan operasional, tanpa menghilangkan
  hasil payroll atau hak historis yang benar dari karyawan operasional.
- Attendance Rate/rekap: roster berdasarkan histori tanggal; bukan seluruh
  employees dan bukan filter currentStatus untuk periode historis.

## Kriteria penerimaan dan pengujian

| Skenario | Hasil wajib |
| --- | --- |
| Nonaktif LEGACY_UNKNOWN, tanpa kontrak | Arsip terlihat; tidak ada antrean/Perlu Kontrak/konflik onboarding |
| Arsip migrasi Training nonaktif, tanpa kontrak | Sama; tidak bergantung jenis LEGACY_UNKNOWN |
| Arsip resign, tanpa tanggal join | Dapat dilihat tanpa onboarding atau error parser |
| Registrasi baru nonaktif Training, tanpa marker | Tetap Perlu Kontrak dan antrean onboarding |
| Aktif hasil import, shift/pekerjaan hilang | Kekurangan tetap terdeteksi sesuai jenis/status |
| Aktif tanpa kontrak yang berlaku | Tetap Perlu Kontrak/konflik cakupan |
| Arsip punya kontrak aktif atau aktif ganda | Konflik nyata tetap tampil; cron tidak mengaktifkan diam-diam |
| Arsip operasional dibuatkan draft untuk masuk kembali | Draft/onboarding eksplisit tetap terlihat |
| LEGACY_UNKNOWN dipaksa Aktif | Scan/setoran/payroll baru tertolak; anomali tidak tersembunyi |
| Edit catatan arsip Training | Metadata bertahan; arsip tidak muncul kembali di antrean |
| Payload client mencoba mengubah marker | Tidak dapat memperoleh exemption atau mengubah asal import |
| Notes NULL/teks biasa/JSON rusak | Tidak menyebabkan query gagal; tidak mendapat exemption sembarang |
| HARIAN/BULANAN tanpa bagian produksi | Tidak dihitung kurang penempatan produksi semata |
| Site/modul/bagian difilter | Angka KPI dan daftar hasil klik menggunakan cakupan identik |
| >500 arsip sebelum kandidat operasional | Arsip tidak menghabiskan limit antrean sehingga kandidat hilang |
| Payroll/attendance historis karyawan yang kini resign | Histori sah tetap dihitung sesuai tanggal |

Gunakan data sintetis untuk uji query/policy/API dan browser untuk banner/tombol,
KPI serta navigasi filter. DB aplikasi hanya dibaca; jangan menjalankan cron,
scan, aktivasi atau simulasi payroll sebagai pengujian terhadap DB aktif.

Snapshot penerimaan Klaten (jika data tidak berubah): arsip tidak menyumbang
antrean onboarding, KPI kekurangan penempatan, Perlu Kontrak, atau konflik
onboarding kosong. Total/resign/nonaktif tetap utuh. Tidak mengasumsikan semua
KPI harus nol bila muncul perubahan operasional baru selama implementasi.

## Selesai bila

Policy diterapkan konsisten pada query, API aksi, UI dan cron; test di atas lolos;
kompilasi/lint bersih; hasil agregat DB dibandingkan read-only; perubahan aturan
dicatat di HRIS_BUSINESS_RULES. Tidak mengubah master/status/tanggal atau
mengisi kontrak/penempatan palsu untuk menurunkan angka KPI.

## Hasil verifikasi implementasi

- Suite API lengkap: 127 file lulus, 1 file dilewati; 1.321 tes lulus dan 2
  dilewati. Tambahan terakhir menguji KPI penempatan melalui SQL endpoint asli:
  13 tes pada suite kontrak/KPI lulus (termasuk satu skenario tambahan).
- Tes mencakup arsip Training/LEGACY_UNKNOWN, registrasi nonaktif biasa,
  konflik kontrak aktif pada arsip, draft rehire, metadata notes, scan dan
  penugasan/import Attendance. Fixtures seluruhnya sintetis.
- Kompilasi API/frontend dan lint file perubahan lulus. Tidak menjalankan cron,
  scan, aktivasi kontrak atau simulasi Payroll terhadap DB aplikasi.
- Agregat read-only DB pada 23 November: 3.725 karyawan, 395 aktif, 3.330 arsip
  sumber asli nonaktif/resign. Arsip yang masuk populasi tindakan = 0;
  kekurangan penempatan = 0; kebutuhan kontrak = 0; jumlah kontrak tetap 585.
- Tidak ada migrasi atau SQL data tambahan. Restart API yang belum memakai
  kode terbaru, lalu refresh browser. Pemeriksaan visual browser belum dilakukan.
- Batasan sesuai keputusan Owner sebelumnya: form/PATCH profil membutuhkan
  tanggal bergabung. Arsip dengan join_date=NULL tetap terbaca dan dikecualikan
  dari antrean, tetapi belum bisa disimpan melalui edit profil biasa tanpa
  tanggal yang benar. Metadata dipertahankan ketika PATCH lolos validasi;
  tidak mengisi tanggal fiktif atau melonggarkan registrasi.

### Cek layar setelah API dimuat ulang

1. Buka Data Karyawan, ubah filter dari Aktif ke Tidak Aktif/Resign. Arsip tetap
   terbaca; baris arsip tanpa workflow tidak mempunyai aksi lanjut onboarding.
2. KPI Penempatan perlu dilengkapi tidak menghitung arsip tersebut. Total,
   Tidak Aktif dan Resign tetap memperlihatkan seluruh data sesuai scope.
3. Buka Kontrak Karyawan. Dengan snapshot di atas, Perlu Kontrak = 0 dan alert
   onboarding kosong dari arsip tidak tampil. Kontrak aktif/historis tetap ada.
4. Saat ada registrasi baru atau draft masuk kembali sungguhan, antrean harus
   tetap muncul sesuai prasyarat. Uji aksi tulis memakai lingkungan uji, bukan
   menambah data coba-coba pada DB yang sudah dibersihkan.
