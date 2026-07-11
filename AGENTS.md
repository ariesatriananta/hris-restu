# AGENTS.md - HRIS PT Restu Sejati Inti Abadi

## Bahasa kerja

- Gunakan Bahasa Indonesia untuk komunikasi, rencana, laporan hasil, komentar bisnis, label UI, pesan validasi, empty state, dan error yang dilihat pengguna.
- Istilah teknis di source code boleh menggunakan Bahasa Inggris yang konsisten.
- Jelaskan keputusan penting secara ringkas dan jujur. Jangan mengklaim selesai sebelum verifikasi dijalankan.

## Konteks produk

Project ini adalah HRIS internal PT Restu Sejati Inti Abadi untuk tiga site operasional: Jepara, Semarang, dan Klaten. Fokus utama sesuai PRD:

- master dan histori karyawan;
- PKWT, ID card, dan dokumen karyawan;
- attendance masuk/pulang melalui scan barcode di browser HP;
- setoran produksi borongan melalui scanner barcode USB;
- tarif pekerjaan borongan yang berbeda dan memiliki histori per site;
- payroll borongan, simulasi, approval, closing, snapshot, slip gaji, dan histori;
- fondasi shift dan payroll bulanan untuk staff/non-produksi;
- role-based access, site-based access, dan audit trail.

Jumlah pekerja borongan diperkirakan sekitar 400 orang per site. Halaman operasional harus cepat, jelas, tahan terhadap input berulang, dan nyaman digunakan pada jam kerja.

## Sumber kebenaran

- Baca `db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql` sebelum mengerjakan fitur yang bergantung pada data atau proses bisnis.
- Struktur tabel, relasi, enum/status, constraint, dan seed di file SQL tersebut adalah sumber kebenaran database saat ini.
- Jangan mengubah, menambah, atau menghapus tabel, kolom, index, constraint, atau seed tanpa konfirmasi eksplisit dari pengguna.
- Jika schema tidak cukup untuk kebutuhan fitur, jelaskan gap, dampak, dan usulan perubahan. Tunggu persetujuan sebelum mengedit file SQL.
- Jangan mengarang field API/data yang bertentangan dengan schema. Field khusus tampilan boleh berupa hasil komposisi atau view model dan harus jelas asalnya.

## Stack dan fondasi repo

- React + Vite + TypeScript.
- Tailwind CSS dan shadcn/ui dari starter `shadcn-admin`.
- Pertahankan TanStack Router dan file-based routing bawaan template. Jangan migrasi ke React Router.
- Gunakan TanStack Query untuk server-state, termasuk mock async repository pada fase frontend-only.
- Gunakan React Hook Form dan Zod untuk form dan validasi.
- Gunakan package manager yang sudah dikunci repo. Jika `pnpm-lock.yaml` tersedia, gunakan `pnpm`.
- Pertahankan konfigurasi lint, format, alias, dan pola komponen starter selama masih relevan.
- Jangan menambahkan dependency baru jika kemampuan yang sama sudah tersedia di repo.

## Referensi UI wajib: shadcn-admin

- Repository starter ini diturunkan dari `satnaing/shadcn-admin`. Pola, primitive, hook, dan public API yang sudah ada di repository lokal adalah standar UI utama yang wajib dipertahankan.
- Referensi upstream: `https://github.com/satnaing/shadcn-admin`. Gunakan upstream hanya untuk memahami pola atau memulihkan file yang hilang; jangan mencampur versi upstream baru secara serampangan ke dependency/struktur starter lokal.
- Sebelum membuat komponen UI baru, periksa terlebih dahulu `src/components/`, `src/components/data-table/`, `src/hooks/`, dan feature demo bawaan yang masih tersedia atau ada di histori Git.
- Jangan membuat design system, data table, pagination, toolbar, filter, dialog, drawer, column header, atau komponen form versi sendiri jika starter sudah menyediakan pola yang setara.
- Jika suatu komponen starter sempat terhapus tetapi dibutuhkan kembali, pulihkan pola/API yang sama dari baseline starter atau dari versi upstream yang sesuai, lalu adaptasikan domain dan copy-nya ke HRIS.

### Standar wajib untuk data table dan filter

- Semua daftar data operasional yang membutuhkan tabel harus mengikuti ekosistem starter: TanStack Table + `useTableUrlState` + `DataTableToolbar` + `DataTableFacetedFilter` + `DataTableColumnHeader` + `DataTablePagination` + `DataTableViewOptions` dan `DataTableBulkActions` bila aksi massal memang diperlukan.
- Gunakan `src/components/data-table/` dan `src/hooks/use-table-url-state.ts` yang sudah ada. Jangan membuat table wrapper, filter bar, dropdown filter, pagination, atau query-state hook baru yang menduplikasi perilaku komponen tersebut.
- Search, faceted filter, pagination, dan page size harus tersinkron ke route search params melalui schema TanStack Router. Filter yang berubah harus mengembalikan user ke halaman pertama dan filter aktif harus dapat di-reset melalui toolbar bawaan.
- Bentuk feature mengikuti pola starter: `{feature}-table.tsx`, `{feature}-columns.tsx`, `{feature}-provider.tsx`, `{feature}-dialogs.tsx`, dan komponen row/bulk action hanya jika kebutuhan modul memang ada.
- Kolom sortable wajib memakai `DataTableColumnHeader`; filter multi-pilihan wajib memakai `DataTableFacetedFilter`; pagination wajib memakai `DataTablePagination`.
- Adaptasi yang diperbolehkan hanya pada domain model, column definition, label Bahasa Indonesia, opsi filter bisnis, dan aksi yang relevan. Layout, state management, interaksi, dan UX table harus tetap terasa seperti shadcn-admin.
- Jangan menambahkan filter yang tidak punya tujuan operasional nyata. Untuk setiap filter, jelaskan field schema dan kebutuhan bisnis yang mendasarinya.
- Sebelum menyatakan halaman tabel selesai, bandingkan implementasi dengan pola tabel starter yang relevan dan pastikan tidak ada komponen custom duplikat.

## Arsitektur frontend

- Organisasikan kode bisnis per feature di `src/features/`.
- Gunakan `src/routes/` untuk deklarasi route dan komposisi halaman, bukan tempat menumpuk seluruh business logic.
- Gunakan komponen generik di `src/components/` hanya jika benar-benar digunakan lintas feature.
- Letakkan mock repository/service dan mock data secara terpusat. Jangan menaruh array dummy berulang langsung di page component.
- Akses data dari page melalui service/query layer agar mock dapat diganti API tanpa menulis ulang UI.
- Pertahankan pemisahan type/domain model, schema validasi, service/repository, query hooks, komponen, dan page jika kompleksitas feature membutuhkannya.
- Jangan mengedit `routeTree.gen.ts` secara manual. Gunakan mekanisme generator TanStack Router yang berlaku di repo.
- Gunakan identifier publik `uid` pada URL dan kontrak frontend. Jangan mengekspos `id` internal sebagai identifier route jika tidak diperlukan.

## Aturan UI dan UX

- Aplikasi bernama `HRIS PT Restu`.
- Gunakan identitas visual logo perusahaan dengan primary navy `#0E2459` dan secondary green `#2B902E`.
- Terapkan warna melalui design tokens/CSS variables, bukan hardcode berulang di komponen.
- Pertahankan kontras, focus state, keyboard navigation, label form, dan ukuran target sentuh yang layak.
- Prioritaskan kenyamanan operasional harian dibanding dekorasi.
- Desktop menjadi tampilan utama administrasi, tetapi seluruh halaman harus layak pada tablet dan HP.
- Halaman scan harus memiliki input autofocus, feedback sukses/gagal yang sangat jelas, pencegahan submit ganda, dan alur dengan klik seminimal mungkin.
- Data table harus mendukung loading, empty state, error state, pencarian, filter, pagination, dan tampilan mobile yang masuk akal sesuai kebutuhan fitur.
- Hindari dashboard penuh kartu dekoratif tanpa informasi yang dapat ditindaklanjuti.
- Gunakan format lokal Indonesia untuk tanggal, waktu, angka, dan Rupiah.

## Auth, role, dan scope site

- Backend dan JWT belum diimplementasikan pada fase frontend awal kecuali prompt aktif secara eksplisit meminta implementasinya.
- Jangan membuat role impersonation switcher atau site impersonation switcher.
- Mock auth awal boleh menggunakan satu user Super Admin tetap agar navigasi dapat dikembangkan.
- Filter site pada dashboard adalah filter data, bukan pergantian identitas atau authorization context.
- Saat backend tersedia, authorization harus mempertimbangkan kombinasi role, akses site user, dan site milik resource. Menyembunyikan menu di frontend saja tidak cukup.

## Aturan bisnis penting

- Jenis karyawan awal: `BORONGAN` dan `BULANAN`.
- Attendance merupakan syarat setoran produksi pada business date yang sama.
- Pekerja borongan dibayar berdasarkan hasil produksi, bukan durasi kerja.
- Satu karyawan dapat melakukan setoran produksi lebih dari satu kali dalam sehari.
- Tarif pekerjaan berbeda per site dan memiliki periode berlaku.
- Transaksi produksi menyimpan snapshot tarif agar histori tidak berubah saat tarif diperbarui.
- Payroll draft/simulasi dapat dihitung ulang. Payroll yang sudah closing bersifat immutable.
- Koreksi setelah payroll closing tidak termasuk scope saat ini.
- Semua aksi penting dan koreksi harus dapat ditelusuri melalui audit trail.

## Mock data

- Gunakan data Indonesia yang realistis tetapi fiktif.
- Gunakan site Jepara, Semarang, dan Klaten.
- Jangan menggunakan NIK, rekening, nomor telepon, atau data pribadi nyata.
- Jenis pekerjaan produksi boleh realistis tetapi tetap generik dan tidak mengungkap merek/rahasia produksi.
- Bentuk mock entity dan relasinya harus mengikuti schema SQL.
- Simulasikan request secara asynchronous dan sediakan state loading/error/empty yang dapat diuji.

## Cara kerja setiap tugas

1. Baca `AGENTS.md`, `package.json`, struktur feature/route terkait, dan bagian schema SQL yang relevan.
2. Periksa kondisi working tree. Jangan menimpa perubahan pengguna yang tidak berkaitan.
3. Nyatakan pemahaman scope dan rencana singkat sebelum perubahan besar.
4. Kerjakan hanya scope prompt aktif. Jangan diam-diam membangun modul lanjutan.
5. Reuse pola dan komponen repo sebelum membuat abstraksi baru.
6. Setelah implementasi, jalankan formatter/lint/typecheck/test/build yang tersedia dan relevan.
7. Perbaiki error yang disebabkan perubahan sendiri.
8. Laporkan file utama yang berubah, hasil verifikasi, asumsi, dan pekerjaan lanjutan yang sengaja belum dikerjakan.

## Progress dan dokumentasi

- Jika tersedia, perbarui `docs/FRONTEND_PROGRESS.md` setelah milestone selesai.
- Tandai status sebagai `selesai`, `sebagian`, `belum dikerjakan`, atau `terblokir` secara faktual.
- Jangan mengubah status modul menjadi selesai jika hanya route placeholder yang tersedia.
- Catat keputusan teknis yang memengaruhi pekerjaan berikutnya agar sesi Codex baru dapat melanjutkan tanpa menebak.

## Verifikasi minimum

- Jalankan script yang tersedia di `package.json`; utamakan lint dan build untuk perubahan frontend.
- Pastikan tidak ada error TypeScript baru.
- Pastikan seluruh route yang ditambah dapat diakses tanpa runtime crash.
- Periksa minimal viewport desktop dan mobile untuk UI yang diubah.
- Jangan menghapus test atau menonaktifkan lint rule hanya agar verifikasi lolos tanpa alasan kuat dan persetujuan.

## Larangan

- Jangan membangun backend/API pada task frontend-only.
- Jangan menghubungkan frontend langsung ke MySQL.
- Jangan menampilkan data sensitif pada log, fixture, screenshot, atau error message.
- Jangan mengubah schema tanpa konfirmasi.
- Jangan mengganti TanStack Router, shadcn/ui, atau struktur utama starter hanya karena preferensi pribadi.
- Jangan melakukan rewrite besar jika perubahan terarah sudah cukup.
