# Audit modul Karyawan - 20 November 2026

## Kesimpulan

Audit awal menemukan dua masalah integritas lifecycle berprioritas tinggi, satu risiko privasi bersyarat konfigurasi storage, serta empat masalah operasional. Temuan 1, 2, 4, 5, 6 dan 7 telah diperbaiki pada kode sesuai batas pengaman di bawah; temuan 3 ditunda atas arahan Owner. Ini bukan pernyataan bebas bug atau sertifikasi seluruh skenario produksi.

## Status setelah perbaikan lifecycle

Perbaikan kode 20 November 2026, atas instruksi Owner setelah audit. Uraian temuan di bawah tetap dipertahankan sebagai catatan kondisi sebelum perbaikan.

| No. | Temuan | Status |
| --- | --- | --- |
| 1 | Batas tanggal kontrak Expired | Selesai pada kode: SQL DATE diproyeksikan sebagai YYYY-MM-DD; tanggal sebelum akhir kontrak atau setelah hari ini ditolak. |
| 2 | Hapus mutasi membuka assignment tanpa batas | Selesai dengan pengaman: UPDATE pembuka assignment dihapus. Jika ada assignment H-1/pekerjaan masa depan batal yang asalnya tidak dapat dibuktikan, seluruh penghapusan ditolak tanpa perubahan data. Mutasi tanpa dependensi tetap dapat dihapus. |
| 3 | Risiko URL publik KTP/KK | Ditunda atas arahan Owner; kebijakan bucket aktual juga belum diverifikasi. |
| 4 | Kontrak batal menghalangi kontrak sebelumnya | Selesai pada kode: flag latest, coverage, penjadwalan status, dan penutupan Expired mengabaikan kontrak CANCELLED; arsip batal tetap tersedia. |
| 5 | Nomor dokumen tidak sinkron saat edit NIK/KK | Selesai pada alur form Edit Karyawan: nomor disinkronkan tanpa upload ulang pada satu dokumen aktif milik karyawan; metadata/file dipertahankan, arsip tidak dipilih, kasus aktif ganda diblokir sebelum perubahan nomor/file. |
| 6 | Retry dokumen dapat menduplikasi | Selesai pada kode: create memakai key stabil dan unique UID; replay identik mengembalikan record lama, metadata berbeda ditolak; CREATE/UPDATE dan audit atomik. |
| 7 | Rate limit rekrutmen pada IP bersama | Selesai pada kode: batas IP lebih longgar + kuota per NIK setelah Turnstile, retry idempotency key sama tidak menambah slot NIK. |

Perbaikan ini tidak mengubah schema dan tidak memperbaiki data historis secara otomatis. Tidak ada penulisan database atau storage nyata. Pemulihan assignment otomatis dengan tanggal akhir asli membutuhkan bukti perubahan yang belum tersimpan pada mutasi lama; pengaman nomor 2 sengaja menolak pemulihan ambigu, bukan mengarang tanggal pengganti.

Verifikasi patch lifecycle: **266 tes backend lulus pada 24 file**, termasuk 37 kasus tambahan untuk tanggal kontrak, hapus mutasi dan kontrak terakhir. Tes query kontrak/assignment menggunakan SQL aplikasi terhadap SQLite dalam memori; tes tanggal mewakili perilaku DATE mysql2 melalui mock. TypeScript API, lint file yang berubah dan diff check lulus. Review tambahan tidak menemukan blocker pada patch. Belum melakukan penutupan kontrak atau penghapusan mutasi terhadap database nyata.

Verifikasi patch rate limit: **46 tes rekrutmen lulus pada 6 file**. Mencakup banyak pelamar berbeda dalam satu IP, batas IP sebelum Turnstile, batas per NIK lintas IP, retry tanpa slot baru termasuk saat kuota habis, Turnstile gagal tetap ditolak dan tidak memakan kuota NIK, reset window serta batas memori limiter. Turnstile production tetap wajib; tes verifikasi Cloudflare memakai mock, bukan mengirim pelamar ke layanan nyata. Batas masih lokal per proses seperti sebelumnya; rincian nilai dan batas deployment ada pada `RECRUITMENT_IMPLEMENTATION_PLAN.md`.

Perbaikan dokumen nomor 6: POST menerima `idempotencyKey` UUID opsional untuk kompatibilitas; seluruh form aplikasi mengirim key stabil saat create. Key tersebut menjadi UID publik dokumen pada INSERT (unique index yang sudah ada), tanpa schema tambahan. API memeriksa metadata, file dan target employee sebelum mengembalikan UID yang sama (200 untuk replay, 201 untuk create); penggunaan key dengan payload berbeda ditolak 409. Lock parent karyawan menyelaraskan create/update dengan scope mutasi dan penghapusan. Dokumen + audit memakai koneksi/transaksi yang sama. Form Tambah Dokumen menyimpan hasil upload dalam memori agar retry tidak mengunggah file yang sama lagi, dan menampilkan error agar dapat dicoba kembali.

Batas perbaikan: key/progres form tidak bertahan setelah reload; ikuti aturan melanjutkan melalui detail/edit karyawan yang sudah ada. Caller API eksternal harus mengirim kembali key yang sama untuk memperoleh jaminan idempotensi; caller lama tanpa key tetap memiliki transaksi dokumen/audit, tetapi tidak dijamin idempoten setelah respons hilang. Key tidak boleh diganti setelah hasil operasi ambigu hanya untuk melewati konflik. Jika data pada form sudah berubah setelah commit yang responsnya hilang, muat ulang record tersimpan dan gunakan Edit. Tidak menambah constraint satu dokumen per jenis dan tidak membersihkan duplikat historis.

Verifikasi patch dokumen: **288 tes backend pada 25 file lulus**, termasuk 15 regresi API dokumen menggunakan SQLite sintetis (respons hilang, retry paralel dengan isolasi transaksi yang diemulasi, rollback audit create/update, key reuse berbeda, permission/site dan file tidak valid, serta arsip sejenis yang sah). **12 tes browser pada 3 file lulus**, termasuk retry registrasi dan form Tambah Dokumen memakai file/key yang sama. TypeScript frontend/API, lint file berubah dan diff check lulus. Tidak mengunggah file atau membuat dokumen pada database nyata.

Perbaikan nomor 5 pada helper registrasi/edit: tanpa file baru, dokumen aktif yang terpilih diperbarui melalui UID lama dengan file dan metadata lain tetap. Nilai kosong dianggap setara agar tidak ada PATCH berulang yang tidak perlu; pengosongan nomor secara sengaja ikut disinkronkan. Hasil update dicatat pada progres form sehingga ketika update KK gagal, retry tidak mengulang KTP yang sudah selesai. Pilihan dokumen kini dibatasi employee UID, jenis KTP/KK dan status ACTIVE yang tunggal. Beberapa dokumen aktif sejenis menghasilkan petunjuk perbaikan dan memblokir perubahan nomor/file tersebut sebelum profil disimpan, tanpa memblokir edit nama/profil lain. Helper juga menolak dokumen lintas karyawan/nonaktif yang diberikan langsung kepadanya.

Verifikasi nomor 5: **24 tes browser pada tiga file lulus**, mencakup update nomor KTP/KK tanpa upload, mempertahankan metadata/file, nilai kosong/pengosongan, tanpa dokumen aktif, retry parsial, seleksi arsip/employee lain, aktif ganda, dan alur halaman edit. Ini perubahan frontend pada alur form yang ada; tidak membuat sinkronisasi otomatis untuk caller PATCH profil di luar form, tidak mengubah transaksi backend, dan tidak memperbaiki data lama secara massal. Jika profil tersimpan tetapi update dokumen gagal, gunakan peringatan penyimpanan parsial dan retry yang sudah ada.

Audit ini membaca kode dan schema kanonik, menjalankan tes dengan database/storage mock, serta satu SELECT tanggal sintetis pada database lokal dalam transaksi READ ONLY. Tidak mengubah kode aplikasi, schema, file storage atau data bisnis. Ini bukan sertifikasi keamanan, uji beban server live, maupun UAT seluruh alur dengan akun pengguna nyata.

## Cakupan

- Rekrutmen internal/publik: scope site, status, rate limit, berkas privat dan konversi.
- Registrasi individual, edit profil, koreksi registrasi, nomor karyawan, retry foto/KTP/KK.
- Import karyawan dan mutasi: validasi ulang, transaksi dan konflik jenis karyawan/kontrak.
- Mutasi individual/batch/terjadwal, batas shift site lama dan pembatalan mutasi.
- Kontrak: draft, penjadwalan, aktivasi, perpanjangan, pembatalan dan penutupan Expired.
- Daftar/ringkasan karyawan, dokumen, ID card, preview dan penghapusan individual/batch.
- Persinggungan histori penempatan dengan assignment, Attendance dan pengaman Payroll. Audit ini tidak memeriksa ulang seluruh mesin Payroll.

## Temuan

### 1. P1 - Batas tanggal penutupan kontrak Expired tidak bekerja dengan tipe DATE driver

Lokasi: `apps/api/src/lib/contract-lifecycle.ts:1099,1122`; konfigurasi pool `apps/api/src/db.ts:4`.

Query mengambil `c.end_date` mentah, lalu membandingkan `effectiveDate < contract.end_date`. Driver mysql2 pada konfigurasi lokal mengembalikan DATE sebagai objek JavaScript Date. Perbandingan ISO string dengan Date tersebut menghasilkan false, termasuk ketika tanggal yang diminta lebih awal dari akhir kontrak.

Reproduksi baca saja pada koneksi lokal: `SELECT CAST('2026-11-19' AS DATE) end_date` menghasilkan Date; ekspresi `'2026-11-01' < end_date` bernilai false, padahal seharusnya ditolak. Request penutupan kontrak Expired dapat melewati batas bawah tanggal, selama pengaman lainnya mengizinkan, dan mengubah histori status sebelum kontrak berakhir.

Saran: normalisasi tanggal SQL menjadi `YYYY-MM-DD` sebelum validasi, konsisten dengan query lain. Tambahkan regresi yang mewakili tipe DATE driver nyata.

### 2. P1 - Hapus mutasi memulihkan tanggal akhir assignment menjadi tanpa batas

Lokasi: `apps/api/src/routes/employees.ts:3379-3430`, khususnya UPDATE restore shift dan pekerjaan.

Pemulihan memilih assignment berdasarkan tanggal akhir H-1 dan `updated_by` yang sama dengan pembuat mutasi. Keduanya tidak membuktikan assignment tersebut dipangkas oleh mutasi. Tanggal akhir selalu diubah menjadi NULL.

Contoh: HR A sudah menjadwalkan assignment berakhir 18 November, lalu HR A membuat mutasi 19 November. Saat mutasi dihapus sebelum ada fakta operasional, assignment yang memang berakhir 18 November bisa ikut dibuka kembali. Assignment yang sebelumnya berakhir 30 November lalu dipangkas menjadi 18 November juga akan pulih menjadi tanpa batas, bukan 30 November.

Saran: pemulihan harus memiliki bukti assignment mana yang diubah dan tanggal akhir sebelumnya. Jika bukti tidak tersedia, tolak pemulihan yang ambigu dan arahkan koreksi assignment. Perubahan schema untuk menyimpan bukti memerlukan persetujuan Owner; audit ini tidak mengubah schema.

### 3. P1 bersyarat - Berkas identitas menggunakan URL permanen storage reguler

Lokasi: `apps/api/src/lib/recruitment-conversion-storage.ts:47`, `apps/api/src/routes/recruitment.ts:657`, `apps/api/src/routes/employees.ts:622,5321`, `apps/api/src/routes/files.ts` respons upload.

Konversi menyalin PHOTO/KTP/KK dari bucket privat rekrutmen ke bucket reguler. Dokumen karyawan kemudian memperoleh URL berbasis `R2_PUBLIC_BASE_URL`. Label `INTERNAL` di database bukan pemeriksaan akses terhadap object storage.

Jika bucket/domain reguler memang publik, tautan KTP/KK yang diperoleh pengguna berizin dapat digunakan kembali tanpa login, bahkan setelah akses site dicabut. Audit ini memastikan jalur kode, tetapi tidak menguji ACL bucket atau membuka dokumen nyata; kebocoran aktual belum dikonfirmasi.

Saran: simpan berkas identitas di storage privat, layani melalui endpoint berizin dan scope site atau signed URL sementara. Foto ID card dapat memiliki kebutuhan penyajian berbeda; jangan menyamakan akses foto dengan KTP/KK.

### 4. P2 - Kontrak batal menghalangi aksi atas kontrak sebelumnya

Lokasi: `apps/api/src/routes/employees.ts:5205` dibandingkan `renewalSourceSelect` sekitar baris 4290; konsumen UI `employee-detail.tsx:492` dan `records-table.tsx:624`.

`isLatestForEmployee` menghitung kontrak CANCELLED sebagai kontrak yang lebih baru, sementara validasi renewal backend mengabaikannya. Kontrak A Expired, buat draft perpanjangan B, kemudian batalkan B: A kehilangan tombol perpanjangan dan tidak dapat dipilih untuk batch melalui UI, walaupun validator renewal backend mengizinkannya.

Pemeriksaan kontrak terakhir pada penjadwalan status dan penutupan Expired juga menghitung kontrak batal.

Saran: seragamkan definisi kontrak terakhir yang relevan untuk lifecycle dengan mengabaikan CANCELLED. Riwayat kontrak batal tetap ditampilkan sebagai arsip.

### 5. P2 - Mengubah NIK/KK tanpa file baru tidak menyinkronkan nomor dokumen

Lokasi: `src/features/employees/components/employee-registration-save.ts:99`.

Helper melewati dokumen ketika tidak ada File baru. Edit NIK/KK pada profil tetap tersimpan, tetapi `employee_documents.document_number` dapat berisi nomor lama. Reproduksi memakai helper asli dengan mock sintetis: perubahan nomor pada existing KTP tanpa file baru menghasilkan nol pemanggilan update dokumen.

Saran: ketika nomor berubah dan dokumen sudah ada, perbarui dokumen tersebut menggunakan file lama; tidak perlu meminta upload ulang.

### 6. P2 - Retry penyimpanan dokumen masih bisa membuat duplikat

Lokasi: `apps/api/src/routes/employees.ts:5120-5149`, `src/features/employees/components/employee-registration-save.ts:116`.

INSERT dokumen menggunakan autocommit, lalu audit ditulis terpisah. Bila audit gagal atau respons POST hilang setelah INSERT, frontend tidak mendapatkan UID dokumen dan retry membuat INSERT baru. Schema tidak menyediakan idempotency untuk operasi tersebut. Reproduksi helper asli dengan simulasi INSERT berhasil lalu error, kemudian retry, menghasilkan dua dokumen.

Saran: transaksi dokumen + audit, serta idempotency untuk menangani respons jaringan yang hilang. Jangan menambahkan constraint satu dokumen per jenis secara sembarang karena modul mendukung arsip dokumen.

### 7. P2 - Rate limit rekrutmen memblokir pelamar berbeda pada koneksi bersama

Lokasi: `apps/api/src/routes/public-recruitment.ts:76-85`, `apps/api/src/lib/recruitment-rate-limit.ts:20`.

Submission dibatasi lima kali per jam berdasarkan IP saja. Pada WiFi pabrik/NAT bersama, pelamar keenam terkena 429 meski NIK berbeda. Retry/permintaan invalid juga memakai kuota. Pemeriksaan identitas memiliki batas sepuluh kali per 15 menit per IP.

Saran: tetap pertahankan perlindungan abuse/Turnstile, tetapi pisahkan batas percobaan identitas dari batas agregat IP yang sesuai rekrutmen bersama. Jangan hanya menghapus rate limit.

## Hal yang perlu keputusan atau penguatan tambahan

- Transfer efektif hari ini dapat dijalankan setelah fakta Attendance/Produksi tercatat di site asal, sedangkan pengaman mutasi historis berhenti untuk tanggal hari ini. Perlu aturan eksplisit: menolak ketika sudah dipakai, atau mendukung perpindahan intrahari. Ini belum diklasifikasikan sebagai bug pasti karena kebijakan perpindahan intrahari belum dikunci.
- Hapus individual tidak memakai pemeriksaan proses Payroll PROCESSING/finalisasi RUNNING dan lifecycle advisory lock yang sudah dimiliki hapus batch. Dependensi fakta tetap diperiksa dan FK melindungi relasi, tetapi konsistensi pengaman proses paralel perlu diseragamkan; tidak dilakukan simulasi race terhadap database nyata.
- Preview hapus batch melakukan tiga pembacaan dependensi/proses per karyawan, sampai sekitar 600 query untuk 200 orang. Ini kandidat optimasi bulk query, bukan bukti bottleneck live; belum dilakukan benchmark server produksi.

## Pengaman yang sudah baik

- Employee create, histori INITIAL dan audit menggunakan transaksi; penomoran memiliki locking dan constraint.
- Import direvalidasi saat eksekusi, bukan hanya mempercayai preview; jalur batch memakai transaksi.
- Pembatasan perubahan jenis dengan kontrak terbuka diterapkan pada mutasi individual, batch/import, jadwal dan eksekusi jadwal.
- Transfer menutup shift dari site lama, dengan pemeriksaan konflik assignment yang mulai pada/setelah batas transfer.
- Retry registrasi mengingat UID karyawan sebelum follow-up GET dan upload, sehingga kegagalan upload tidak otomatis membuat karyawan baru.
- Hapus batch dibatasi Super Admin, target eksplisit, maksimal 200, validasi ulang dependensi dan transaksi seluruh batch.
- Rekrutmen memiliki pemisahan kandidat/master karyawan, scope site, penguncian konversi, idempotency dan akses berkas kandidat melalui endpoint berizin sebelum konversi.

## Verifikasi

- Backend: 22 file, **229 tes lulus**, memakai environment dummy, database/storage mock. Filter tes: employees, recruitment, contract, scheduled-mutations, employee-number, employee-shift-site-boundary. Dua timeout pada percobaan paralel awal hilang ketika dijalankan dengan maksimal dua worker dan timeout 15 detik; bukan assertion gagal.
- Reproduksi sintetis helper registrasi memastikan dua celah dokumen di atas; tidak membuat file/record nyata.
- Pemeriksaan tipe DATE menggunakan SELECT konstanta pada koneksi lokal READ ONLY, lalu rollback; tidak membaca data pribadi.
- Frontend: tujuh file, **26 tes browser lulus** untuk form karyawan, registrasi/retry, workbook import, hapus individual/batch dan input kontrak batch.
- Tes yang lulus membuktikan skenario yang dicakup fixture, bukan bahwa tujuh temuan ini sudah diperbaiki.

## Urutan perbaikan yang disarankan

1. Normalisasi validasi tanggal kontrak dan pengaman restore assignment saat hapus mutasi.
2. Pastikan kebijakan akses storage identitas, kemudian tutup jalur URL publik jika bucket publik.
3. Seragamkan kontrak terakhir untuk lifecycle, sinkronisasi nomor KTP/KK dan idempotency dokumen.
4. Sesuaikan rate limit rekrutmen untuk koneksi bersama, lalu UAT lintas alur dengan data lokal yang disetujui Owner.
