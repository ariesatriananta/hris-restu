# Attendance Rate - kapasitas harian per site

## Keputusan dan milestone

Keputusan Bos, 19 November 2026. Halaman baru di kategori Ringkasan, setelah Dashboard; akses hanya HR_OFFICER/SUPER_ADMIN. Implementasi bertahap:

1. **M1 - kategori**: master modul dan brand Reguler/Premium, histori tanggal efektif, pemetaan eksplisit data lama. Tersedia dalam perubahan kode ini; migrasi dijalankan Owner.
2. **M2 - Training**: selesai pada kode. Eligibility Produksi memakai jenis Borongan/Training, dengan isolasi nominal Payroll dan kunci snapshot Training.
3. **M3 - agregasi**: selesai pada kode backend. Roster, attendance, AVG minggu sebelumnya dan estimasi box tersedia melalui API read-only dengan validasi scope/role.
4. **M4 - UI**: selesai pada kode. Menu Attendance Rate di Ringkasan setelah Dashboard, dashboard compact per site/tanggal dengan mode screenshot.
5. **M5 - audit**: rekonsiliasi angka, role, histori, pergantian minggu dan alur koreksi/void.

M1 tidak menambahkan dashboard/API angka attendance, tidak mengubah eligibility Training, transaksi Produksi, Attendance atau Payroll.

## Fondasi kategori (M1)

- Kode kategori: `REGULER` atau `PREMIUM`; label UI Reguler/Premium. Kode `REGULAR` tidak digunakan.
- Master Modul Produksi dan Brand memakai atribut `production_category` nullable. Master baru default **Reguler**, termasuk histori mulai hari ini WIB. Data lama yang belum dipetakan tetap NULL sampai dipetakan melalui form atau SQL Owner. Tidak ada tebakan berdasarkan nama modul/brand atau site.
- Kategori modul menjadi sumber pengelompokan roster/karyawan. Satu modul diasumsikan tidak mencampur Reguler/Premium dalam satu hari. Kategori brand menjadi sumber pengelompokan fakta hasil produksi yang memiliki brand. Belum ada aturan yang memaksa modul dan seluruh brand di site memiliki kategori sama; M3 harus melaporkan data tidak terpetakan/konflik, bukan mengarang kategorinya.
- Histori per master disimpan terpisah pada `production_module_category_histories` dan `production_brand_category_histories`. Periode inklusif: `effective_from <= tanggal` dan `effective_to IS NULL OR effective_to >= tanggal`.
- Atribut kategori pada master adalah cache kategori saat ini; laporan tanggal lampau wajib membaca histori. Jangan memakai kategori saat ini untuk seluruh transaksi/penempatan lama.
- Pemetaan pertama boleh dimulai pada tanggal lampau atau hari ini menurut WIB. Owner/operator harus memilih tanggal berdasarkan kondisi lapangan yang diketahui. Tanggal sebelum pemetaan tetap **Belum dipetakan**, tanpa fallback ke kategori sekarang.
- Kategori dan tanggal efektif periode terakhir dapat diedit, termasuk hari yang sama atau backdate. Perubahan kategori dengan tanggal setelah awal periode terakhir membuat periode baru dan menutup sebelumnya H-1. Koreksi kategori pada awal periode yang sama/lebih awal, atau perubahan tanggal saja, memperbarui periode terakhir; akhir periode sebelumnya ikut disesuaikan. Awal periode terakhir wajib setelah awal periode sebelumnya. Tanggal masa depan ditolak.
- Menyimpan kategori sama tanpa perubahan tanggal tidak membuat histori baru. Mengosongkan kategori yang sudah dipetakan tidak didukung. Koreksi kategori/tanggal dapat mengubah pengelompokan laporan lampau; audit master mencatat keadaan sebelum/sesudah dalam transaksi yang sama.
- UI menampilkan tanggal efektif saat kategori terpilih, memakai tanggal tersimpan ketika edit. Kategori dan tanggal dapat diedit tanpa kunci hari yang sama. Master baru default Reguler; master lama NULL tetap Belum dipetakan sampai pengguna memetakannya.
- Master yang memiliki histori kategori tidak dapat dihapus secara fisik; gunakan nonaktifkan. Relasi histori memakai `ON DELETE RESTRICT`. Pemindahan site master yang sudah mempunyai histori kategori harus ditolak untuk menjaga interpretasi histori per site.
- Hak kelola mengikuti permission master yang sudah berlaku (`employees.manage` pada modul, `production.manage_master` pada brand), dengan pembatasan site/QC tetap utuh. Akses dashboard HR/Superadmin ditegakkan terpisah pada M3/M4.

## Kontrak master

Create/update menerima field opsional:

```json
{"productionCategory":"REGULER","categoryEffectiveFrom":"2026-11-01"}
```

`categoryEffectiveFrom` hanya boleh disertakan bersama kategori. Jika tanggal dihilangkan, server memakai hari ini WIB untuk kategori baru/perubahan. PATCH tanpa dua field ini tidak mengubah kategori. POST tanpa kategori memakai Reguler dan mencatat histori hari ini WIB. Field ini khusus modul/brand; Defect tidak memiliki kategori.

List master mengirim `productionCategory` dan `categoryEffectiveFrom` (awal kategori yang sedang berlaku). Penyimpanan perubahan master, histori kategori dan audit memakai transaksi yang sama. Identitas API tetap UID publik.

Helper `apps/api/src/lib/production-category.ts` menyediakan pemetaan bertanggal dan lookup as-of. Histori bertumpang-tindih/inkonsisten harus ditolak; tidak boleh memilih kategori arbitrer. Tidak ada seed kategori global.

## Migrasi dan pemetaan oleh Owner

1. Backup database. Jalankan **sekali** [20261119_production_categories.sql](../db/migrations/20261119_production_categories.sql) sebelum deploy kode M1. DDL MySQL/MariaDB tidak transactional; jika sebagian sukses, lanjutkan hanya dari statement yang gagal. Jangan menjalankan ulang semua statement.
2. File tersebut hanya menambah dua kolom dan dua tabel histori. Tidak menambah/mengubah data kategori lama, kuantitas, Attendance atau Payroll.
3. Untuk default Reguler yang disepakati setelah migrasi awal, backup lalu jalankan [20261119_production_categories_default_reguler.sql](../db/migrations/20261119_production_categories_default_reguler.sql). Jangan mengulang migrasi awal. Script mengubah default kolom dan mengisi master NULL tanpa histori; Premium/Reguler yang sudah dipetakan dipertahankan. Tanggal baseline default hari ini WIB; ubah variabel tanggal hanya jika kondisi historisnya diketahui. SQL ini dijalankan Owner, bukan aplikasi.
4. Melalui Master Modul Produksi, petakan setiap modul sesuai kesepakatan site, lalu tanggal pemetaan pertama. Jangan otomatis menyimpulkan A/B/C Reguler dan D/E Premium untuk semua site.
5. Melalui Master Brand, petakan Reguler/Premium dan tanggal mulai berdasarkan histori yang diketahui.
6. Agar AVG minggu sebelumnya kelak dapat dihitung, tanggal awal pemetaan harus mencakup periode sumber yang benar-benar diketahui. Tanggal yang belum bisa dipastikan tetap tidak terpetakan; jangan mengisi tanggal terlalu lama hanya agar dashboard terlihat penuh.
7. Schema kanonik sudah disesuaikan untuk instalasi baru; jangan menjalankan file schema penuh pada database yang sudah berisi data.

## Rumus yang dikunci untuk M3

- Attendance hadir = status final `PRESENT`, satu orang sekali per tanggal; tidak harus menunggu scan pulang. Roster mencakup hari libur.
- Site, jenis karyawan, modul dan pekerjaan utama mengikuti histori efektif tanggal yang dihitung. Pekerjaan utama tidak ada/ambigu masuk peringatan belum terpetakan; total attendance tetap distinct karyawan.
- AVG per pekerjaan/jenis/kategori = total PCS POSTED minggu sebelumnya dibagi total hari-orang hadir pada kelompok tersebut. Hadir tanpa hasil setor tetap masuk pembagi. AVG total dihitung dari jumlah numerator dan denominator, bukan rata-rata sederhana dari AVG kelompok.
- Minggu sumber Senin-Minggu sebelumnya: tanggal 16-22 November memakai 9-15 November; tanggal 15 November memakai 2-8 November.
- Estimasi = jumlah `hadir tanggal terpilih x AVG` Training dan Borong, dibagi 9.600 PCS/box untuk Linting, 800 PCS/box untuk Packing. Packing memakai AVG Packing sendiri. Ini estimasi kapasitas, bukan hasil aktual/netto maupun upah.
- Sumber AVG belum tersedia/denominator nol ditampilkan Belum ada data, bukan kapasitas nol. Defect tidak mengurangi hasil setor untuk rumus ini.

## Uji M1

Tes otomatis memakai mock database/browser: kategori valid, data lama belum dipetakan, lookup tanggal lampau, batas periode, edit kategori/tanggal hari sama dan backdate, penolakan tanggal yang menabrak periode sebelumnya/future, default Reguler, status aktif modul boolean, scope/permission, rollback histori, form modul/brand dan Defect tanpa atribut kategori. Belum mengeksekusi SQL atau menulis data database nyata.

## Pencatatan Produksi Training (M2)

- Scanner, input susulan, import satu/banyak baris dan input batch demo menerima jenis `BORONGAN` atau `TRAINING` dari histori employment ACTIVE efektif pada tanggal setoran. `TIME_BASED` bukan alasan penolakan Training; jenis Harian/Bulanan tetap tidak eligible Produksi.
- Attendance final PRESENT beserta bukti scan Masuk/koreksi approved, scope site/modul, assignment, job, satuan, tarif aktif, kuantitas, QC, idempotensi dan validasi pasangan Klaten tetap wajib. Training memakai pekerjaan/tarif Produksi yang sudah ada, bukan jenis pekerjaan baru.
- Hasil raw PCS, deduction, payable dan nominal transaksi tetap menggunakan perhitungan Produksi yang sama. Nominal ini tidak menjadi sumber upah Training; akses melihatnya tetap hanya HR/Superadmin. AVG M3 memakai raw quantity POSTED.
- Pergantian employment dan kelanjutan penugasan setelah perpanjangan kontrak mengenali kedua jenis tersebut. Histori CANCELLED tidak menjadi dasar mempertahankan assignment. Mekanisme onboarding tidak diubah; M2 tidak memperbaiki assignment/data lama secara otomatis.
- Referensi import dan filter jenis karyawan Rekap Produksi mencakup Training.
- Payroll Borongan hanya mengambil fakta yang pada tanggal/site transaksi memiliki histori ACTIVE `BORONGAN` dengan basis PIECE_RATE. Readiness, populasi simulasi, nominal detail dan pemeriksaan integritas approval mengikuti scope yang sama. Perubahan Training menjadi Borongan di tengah minggu tidak memasukkan hasil Training ke upah Borongan.
- Payroll berbasis waktu tetap menghitung Training dari attendance dan tarif harian. Snapshot `payroll_training_production_details` hanya monitoring kuantitas; sumbernya harus memiliki histori ACTIVE Training, bukan sumber nominal.
- Lock Payroll Borongan yang sudah berlaku tetap dipertahankan. Periode TIME_BASED Training CALCULATED/APPROVED/CLOSED atau run PROCESSING juga memblokir perubahan/input setoran Training dalam cakupan periode terkait. Snapshot monitoring Training mengunci transaksi sumber, termasuk pasangan, dan ditampilkan sebagai alasan penolakan sebelum koreksi/void.
- Tidak memerlukan migrasi tambahan M2, tidak menjalankan perubahan database atau backfill fakta lama.

Uji otomatis M2 mencakup scanner Training TIME_BASED, penolakan Harian/Bulanan, attendance wajib Hadir, import single/bulk dan penyimpanan, pasangan batch Training, kategori/permission QC, lifecycle assignment, isolasi Payroll pada pergantian jenis dalam minggu yang sama, serta kunci periode/snapshot Training. SQL scope diuji dengan SQLite dalam memori; integrasi API memakai mock database, bukan MySQL nyata.

Uji Owner setelah deploy: pilih Training dengan histori efektif, assignment/tarif dan attendance Hadir; scan serta simpan setoran. Pastikan hasil tercatat di Ringkasan/Transaksi. Periksa Payroll Training tetap memakai hari hadir dan tarif harian. Pada karyawan yang berubah ke Borongan, hanya setoran sejak tanggal Borongan yang masuk detail upah Borongan. Coba koreksi/void setoran yang sudah tersnapshot Payroll Training: harus ditolak.

## Backend agregasi (M3, 20 November 2026)

### Akses dan endpoint

- `GET /api/attendance-rate/options`: daftar site aktif yang boleh diakses dan `serverToday` (Asia/Jakarta).
- `GET /api/attendance-rate?site=KLATEN&date=2026-11-19`: tepat satu site wajib; tanggal default hari ini WIB, tanggal masa depan/format tidak valid ditolak. Batas teknis tanggal minimal 1000-01-15 agar seluruh minggu sumber masih valid dalam DATE MySQL.
- Role HR_OFFICER wajib memiliki permission `attendance.view` dan `production.view` sekaligus akses site. SUPER_ADMIN dapat memilih seluruh site aktif. Role lain ditolak; QC yang digabung HR tetap dibatasi menurut kebijakan QC repo (SUPER_ADMIN tetap memiliki prioritas global).
- Respons memakai `Cache-Control: private, no-store`. Query sumber dijalankan dalam satu transaksi read-only REPEATABLE READ dengan consistent snapshot. Tujuh bulk query sumber ditambah pencarian site, tanpa query per karyawan. Kegagalan melepaskan koneksi dan membatalkan transaksi baca.
- Tidak memerlukan migrasi/seed tambahan. Tidak mengubah Attendance, transaksi Produksi, tarif atau Payroll. Menu dan UI baru dikerjakan M4.

### Definisi hitung

1. Roster per tanggal hanya dari tepat satu histori employment berstatus ACTIVE, status karyawan ACTIVE dan jenis TRAINING/BORONGAN pada site terpilih. Histori lintas site ikut diperiksa agar transfer yang overlap tidak dihitung dua kali. Data `employees.current_*`, status aktif saat ini dan jadwal shift tidak menjadi fallback atau filter roster hari lampau.
2. Hari libur tetap memiliki denominator roster. Hadir hanya attendance final PRESENT di site/tanggal yang sama; satu orang sekali per tanggal, tanpa syarat scan pulang.
3. Pekerjaan utama harus tepat satu assignment ACTIVE/is_primary efektif, sesuai site. Assignment tambahan tidak masuk breakdown/AVG. Tanpa pekerjaan utama yang valid, karyawan tetap masuk total attendance, masuk `unassigned` jika kategori diketahui, dan muncul peringatan.
4. Kategori roster mengikuti histori Modul efektif pada hari tersebut; atribut kategori terkini dan status aktif master tidak menimpa histori. Kategori tidak diketahui masuk `unmapped`, tetap dihitung dalam total Training/Borong/semua karyawan.
5. Minggu referensi selalu Senin-Minggu sebelumnya. Contoh: 19 dan 22 November 2026 memakai 9-15 November; 15 November memakai 2-8 November; 23 November memakai 16-22 November. Sumber hari ini tidak masuk AVG.
6. AVG terpisah untuk Linting/Packing, Training/Borong dan Reguler/Premium. Numerator raw `quantity` PCS POSTED pada pekerjaan utama; VOID, pekerjaan tambahan, hasil di site lain, potongan dan payable quantity tidak ikut. Denominator person-days PRESENT pada kelompok historis yang sama, termasuk hari hadir tanpa hasil setor. AVG Total memakai jumlah numerator dibagi jumlah denominator, bukan rata-rata dari dua AVG.
7. Jika transaksi memiliki brand, histori kategori brand wajib tersedia, sesuai site dan sama dengan kategori modul hari tersebut. Konflik, kategori brand hilang/overlap atau snapshot modul berbeda ditandai dan hasil AVG terkait dianggap tidak lengkap. Untuk transaksi tanpa brand (misalnya Packing), kategori berasal dari histori modul, bukan kategori master saat ini. Snapshot modul NULL pada transaksi lama boleh menggunakan histori employment yang tunggal; snapshot non-NULL yang bertentangan tidak boleh diabaikan.
8. Estimasi per pekerjaan/kategori = jumlah `(hadir Training x AVG Training) + (hadir Borong x AVG Borong)` dibagi kapasitas box. Konstanta sementara sesuai persetujuan: `BORONGAN-LINTING` 9.600 PCS/box, `BORONGAN-PACKING` 800 PCS/box. Packing memakai AVG Packing, bukan AVG Linting. Total estimasi menjumlahkan kontribusi tepat sebelum pembulatan akhir.
9. Perhitungan quantity dan rasio memakai integer BigInt, tanpa floating point. AVG/estimasi PCS memiliki 4 desimal; persen attendance dan box 2 desimal, HALF_UP. Jangan menghitung ulang estimasi dari AVG tampilan yang sudah dibulatkan.
10. Denominator nol atau sama sekali tidak ada hasil produksi sumber memberikan AVG `null/NO_DATA`. Data tidak lengkap memberikan `null/INCOMPLETE`. Jika ada pekerja Hadir yang membutuhkan AVG belum tersedia, estimasi `null`, bukan nol. Jika tidak ada pekerja Hadir dan tidak ada klasifikasi ambigu pada hari terpilih, estimasi benar-benar `0.00` walaupun AVG belum ada.

### Kontrak respons untuk M4

Envelope `{data, meta: {serverToday}}`; `data` berisi:

- `date`, `site: {uid,code,name}`, `referenceWeek: {from,to}`.
- `groups`: empat kelompok, urutan Training Reguler/Premium lalu Borongan Reguler/Premium. Setiap kelompok berisi `present`, `roster`, `ratePercent`, daftar modul publik, breakdown `jobs` dan `unassigned`. Job mengandung UID/code/name publik dan jumlah Hadir/roster. Rate `null` jika roster nol.
- `unmapped`: jumlah karyawan/present tanpa kategori per jenis. Total tidak boleh dihitung hanya dengan menjumlah empat kartu karena kelompok ini tetap ada.
- `totals`: Training, Borongan dan TOTAL, dihitung dari orang berbeda pada roster yang valid.
- `averages`: Linting dan Packing, masing-masing per jenis dan kategori REGULER/PREMIUM/TOTAL; field `quantityPcs`, `presentDays`, `transactions`, `averagePcs`, `complete`, `status` (AVAILABLE/NO_DATA/INCOMPLETE).
- `estimates`: per job, `pcsPerBox` dan `categories` REGULER/PREMIUM/TOTAL; field `present`, `estimatedPcs`, `boxes`, `complete`. Semua angka desimal berupa string; `null` wajib ditampilkan sebagai belum tersedia/perlu pemetaan, bukan dikonversi menjadi nol.
- `warnings`: `{scope,code,count,message}` tanpa identitas pribadi. Scope DAY menghitung orang terkait; REFERENCE_WEEK untuk pemetaan/attendance menghitung person-days, untuk produksi menghitung transaksi. UI harus menampilkan peringatan data belum lengkap sebelum angka dipakai untuk laporan.

Kategori baru yang hanya berlaku mulai hari ini tidak cukup untuk AVG minggu lampau. Owner perlu menyesuaikan tanggal efektif berdasarkan fakta yang diketahui jika pemetaan tersebut memang sudah berlaku pada minggu sumber; jangan otomatis memundurkan histori agar angka terisi.

### Verifikasi M3

Tes unit perhitungan dan integrasi API memakai fixture/mock database. Mencakup pergantian minggu/tahun, jenis/mutasi/kategori efektif, roster hari libur, attendance distinct, pekerjaan utama saja, person-days tanpa hasil, AVG Total tertimbang, kuantitas mentah, Packing tanpa brand, konflik snapshot/kategori, histori overlap, estimasi presisi, sumber tidak tersedia vs kapasitas nol, role/permission/site, rollback/release dan respons tanpa nominal/identitas pribadi/internal ID.

Belum mengeksekusi query pada MySQL/MariaDB nyata atau menguji melalui browser. Uji M5 harus merekonsiliasi satu site/tanggal: roster histori, attendance PRESENT, raw PCS POSTED dan person-days minggu referensi. Nilai AVG dapat berubah jika data sumber minggu lalu dikoreksi; tidak berubah hanya karena memilih hari lain dalam minggu referensi yang sama.

## Halaman operasional (M4, 20 November 2026)

- Menu **Ringkasan > Attendance Rate**, URL `/attendance-rate`. Sidebar, guard route dan halaman mengikuti aturan role/permission API M3. Menu tersembunyi bagi QC/admin Produksi/role lain yang tidak memenuhi akses; URL langsung juga ditolak.
- Filter satu Site dan Tanggal disimpan di URL. Default memakai site aktif pertama dari daftar yang diizinkan dan tanggal `serverToday` API. Tanggal masa depan tidak dapat dipilih. Site tunggal dikunci jika valid; URL dengan site yang tidak tersedia tetap dapat diperbaiki ke opsi yang diizinkan.
- Susunan report mengikuti kebutuhan screenshot: empat kartu Training Reguler/Premium dan Borong Reguler/Premium (modul dan Hadir/roster per pekerjaan), tiga rate gabungan, enam AVG Linting, lalu estimasi box Linting/Packing per kategori dan Total. Estimasi Packing tetap memakai AVG Packing dari server; enam kartu AVG utama menampilkan Linting seperti contoh sistem lama.
- Site, tanggal dan minggu sumber selalu tertulis di report. Total mengikuti hasil API, termasuk roster belum dipetakan; tidak dihitung ulang dari empat kartu. Peringatan/pemetaan yang belum lengkap tampil ringkas dan bisa dibuka rinciannya. Nilai `null` tampil tanda pisah dengan keterangan belum tersedia/perlu periksa data; nol sah tetap nol.
- Tombol **Mode Screenshot** membuka report penuh tanpa sidebar, filter dan header aplikasi. Konteks laporan serta peringatan tetap terlihat. Tutup dengan tombol X atau Escape; dialog menjaga fokus keyboard. Mode screenshot hanya mengatur tampilan, tidak mengambil/mengirim gambar atau menyimpan data ke localStorage.
- Layout responsif: empat kolom pada desktop lebar, dua pada tablet, satu pada HP. Warna menggunakan token tema aplikasi dan mendukung light/dark. Tombol **Refresh** memuat ulang manual; tidak ada polling otomatis atau retry request berulang.
- Query membawa AbortSignal, dipisah per identitas/role/permission/site pengguna serta site/tanggal laporan. Angka lama disembunyikan selama fetch, saat error, atau bila identitas respons tidak cocok dengan filter; opsi dan laporan memiliki loading/error/empty state.
- Route tree diperbarui melalui generator TanStack Router, bukan diedit manual. M4 tidak mengubah API, rumus, database atau Payroll.

Uji manual M4: login HR dengan dua permission dan akses site, buka Ringkasan > Attendance Rate; pilih site/tanggal, cek URL serta konteks report. Coba Refresh, buka rincian peringatan, lalu Mode Screenshot dan Escape. Pada HP pastikan semua kartu dapat dibaca dengan scroll vertikal. Role QC/admin Produksi tidak boleh melihat menu atau membuka URL. Rekonsiliasi angka pada database nyata tetap menjadi M5.

Verifikasi kode M4: 38 tes browser (halaman baru dan kebijakan akses Produksi), targeted ESLint, TypeScript frontend serta build Vite lulus. Tampilan fixture diperiksa pada desktop 1440x900 dan lebar HP 375px; mode screenshot desktop memuat report dalam satu layar pada fixture enam pekerjaan. Tes memakai API mock tanpa data pribadi; koneksi database nyata dan rekonsiliasi angka tetap M5.
