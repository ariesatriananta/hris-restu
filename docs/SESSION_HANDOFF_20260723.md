# Handoff Sesi — Master Karyawan dan Lifecycle Kontrak

Dokumen ini adalah konteks kerja untuk sesi Codex berikutnya. Baca sebelum mengubah modul Karyawan, PKWT, Mutasi, cron reconcile, atau Master Data.

## Konteks repository

- Aplikasi: **HRIS RSIA**, internal PT Restu Sejati Inti Abadi.
- Frontend: React, Vite, TypeScript, Tailwind, shadcn/ui, TanStack Router, TanStack Query, TanStack Table.
- Backend: `apps/api`, Express, MySQL/MariaDB, Drizzle schema sebagai mapping, cookie auth dan RBAC berbasis site.
- Local package manager: `pnpm`. Production memakai `npm`.
- `pnpm dev` menjalankan frontend Vite dan API bersamaan. Port lokal yang digunakan saat handoff: Vite `5173`, API `3001`.
- Jangan mengedit `src/routeTree.gen.ts` manual. Gunakan UID publik untuk route/API, bukan ID internal.
- Jangan mengubah schema atau menjalankan migration pada database aktif tanpa izin Bos.
- Sumber aturan wajib: `AGENTS.md`, `docs/HRIS_BUSINESS_RULES.md`, `docs/UI_STANDARDS.md`, `docs/UI_TABLE_STANDARD.md`, dan `db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql`.

## Standar UI yang sudah dikunci

- Gaya starter wajib mengikuti `satnaing/shadcn-admin` dan primitive lokal.
- Semua data table: TanStack Table, `useTableUrlState`, `DataTableToolbar`, faceted filter, `DataTableColumnHeader`, `DataTablePagination`, dan `DataTableActionButton` untuk action icon + tooltip.
- Toolbar berdiri langsung pada halaman; jangan bungkus toolbar+tabel+pagination dengan `Card`.
- Table global: horizontal padding lega, row compact, secondary text kecil/rapat, default **100 rows/page**, opsi `100/200/300/400/500`.
- Pagination/filter/search harus tersinkron ke URL. List master dengan `created_at` default `created_at DESC`; histori boleh memakai kronologi bisnis.
- Tab shadcn: Lucide icon, `h-10 px-4`, ada gap, `sm:w-fit`, horizontal scroll pada mobile. Ini telah dipakai pada PKWT, Riwayat Mutasi, dan Master Data.
- Action table urutan: lihat detail → ubah → aksi bisnis/lifecycle. Semua action icon memakai tooltip.

## Branding dan data keamanan

- Branding saat ini `HRIS RSIA`, navy primary `#0E2459`, green `#2B902E`.
- File HR tetap memakai CDN R2 publik atas keputusan produk; jangan mengubah tanpa keputusan baru.
- Jangan menampilkan data sensitif di log/error/screenshot.

## Status implementasi utama

### Master Karyawan

- CRUD employee sudah memakai API nyata, bukan mock.
- Form panjang memakai halaman penuh dan sticky action bar; dialog dipakai untuk workflow ringkas.
- Foto employee, KTP, KK memakai `files`/R2 dan tersedia preview di form/detail.
- Employee ID dibuat server dengan format `P{site-prefix}-{YYMM}-{DD}{urut-3-digit}`. Prefix: Jepara `KDS`, Semarang `SMG`, Klaten `SLO`.
- Barcode adalah generated column dari `employee_number`, identik dan tidak dapat diedit.
- Create employee default `INACTIVE`; employee menjadi `ACTIVE` melalui lifecycle kontrak.
- `current_work_group_id` tetap ada di database tetapi disembunyikan dari UI sementara.
- Field UI: alamat, RT/RW, kelurahan, kecamatan, email, dan detail pribadi. `join_date_training` dan `join_date_borong` tersedia di API/database tetapi belum ditampilkan di form.
- Gender dan marital status mendukung redaksi KTP baru, data legacy tetap dibaca.

### Jenis employee, Modul, dan Bagian

- Jenis resmi saat ini: `BORONGAN`, `TRAINING`, `BULANAN`.
- `TRAINING` saat ini mengikuti perilaku penempatan Borongan: Modul–Bagian wajib.
- Struktur penempatan produksi: `Site → production_modules → production_module_sections → production_sections`.
- `production_sections` adalah proses reusable (Linting, Packing, Slop); berbeda dari `production_jobs`, yang nanti adalah definisi pekerjaan berbayar/tarif produksi.
- Borongan dan Training wajib mapping Modul–Bagian aktif; Bulanan bernilai `NULL`.
- Perubahan Modul/Bagian/site/jenis melalui Mutasi agar histori penempatan konsisten.
- Master Data sudah memiliki tab: Modul Produksi, Bagian Produksi, Pemetaan Modul & Bagian, Departemen, dan Jabatan.
- Master menggunakan soft deactivate; hard delete hanya bila backend memastikan belum direferensikan tabel apa pun.

### Departemen dan Jabatan

- `departments` berlaku untuk semua jenis employee dan kode diisi manual, uppercase, unik dalam site.
- Departemen tidak boleh dinonaktifkan bila masih dipakai employee `ACTIVE`; HR harus memutasi employee dulu.
- Jabatan (`positions`) sudah memiliki UI master; hard delete Jabatan hanya Super Admin dan ditolak jika masih dipakai histori/employee.

### Mutasi penempatan

- `employee_employment_histories.change_type`: `INITIAL`, `TRANSFER`, `PROMOTION`, `DEMOTION`, `STATUS_CHANGE`, `TYPE_CHANGE`, `DEPARTMENT_CHANGE`, `GROUP_CHANGE`, `PRODUCTION_ASSIGNMENT_CHANGE`, `OTHER` (OTHER disembunyikan dari form baru).
- Mutasi tidak mengubah status kerja `ACTIVE/INACTIVE/RESIGNED`.
- Single mutation dari detail employee memakai field target enable/disable sesuai change type.
- Mutasi batch dari Riwayat Mutasi mendukung maksimal 25 employee, target/tanggal per row, all-or-nothing, konfirmasi summary sebelum simpan.
- Tanggal hari ini diterapkan langsung; tanggal masa depan masuk `scheduled_employee_mutations`; tanggal lampau ditolak.
- Satu employee maksimum satu scheduled mutation unresolved (`SCHEDULED` atau `FAILED`).
- Scheduled mutation harus gagal bila base history berubah atau target master/mapping tidak lagi valid; tidak diulang otomatis.

## Lifecycle kontrak dan status kerja

### Aturan kontrak baru

- Kontrak lifecycle: `DRAFT → SCHEDULED → ACTIVE → EXPIRED`, dengan terminal `TERMINATED` dan `CANCELLED`.
- Kontrak baru selalu `DRAFT`; nomor dan sequence dibuat server.
- Kontrak final (`EXPIRED`, `TERMINATED`, `CANCELLED`) immutable.
- ACTIVE hanya boleh koreksi terbatas sesuai hardening yang sudah dibuat.
- Tidak boleh overlap periode `DRAFT`, `SCHEDULED`, atau `ACTIVE` untuk employee yang sama.
- Tipe kontrak baru harus konsisten keras:
  - `BORONGAN → PKWT`
  - `TRAINING → TRAINING`
  - `BULANAN → PKWTT`
  - `PROJECT`, `RETAIN`, `OTHER` hanya legacy baca; tidak tersedia untuk create baru.
- `TYPE_CHANGE` ditolak bila masih memiliki kontrak terbuka `DRAFT/SCHEDULED/ACTIVE`.
- Tanggal mulai kontrak wajib sama dengan atau setelah `employees.join_date`.

### Status employee

- Slogan bisnis: **Tidak ada karyawan aktif tanpa dasar kontrak**.
- ACTIVE hanya dihasilkan lifecycle kontrak aktif yang berlaku, bukan Mutasi.
- Terminasi kontrak ACTIVE membuat employee `INACTIVE` bila tidak ada kontrak aktif valid lain.
- Resign membuat contract ACTIVE menjadi `TERMINATED` dan employee `RESIGNED`.
- Kontrak yang melewati tanggal akhir menjadi `EXPIRED`; **cron tidak lagi otomatis membuat employee INACTIVE**. Employee ACTIVE tanpa kontrak aktif berlaku menjadi conflict/alert agar HR membuat kontrak pengganti atau mengambil keputusan status kerja.
- Untuk kontrak EXPIRED terakhir saat employee masih ACTIVE tersedia aksi Terminasi karyawan atau Catat resign. Kontrak tetap EXPIRED; hanya status employee + `STATUS_CHANGE` + audit yang berubah.
- Kontrak `ACTIVE` yang diedit menjalankan sinkronisasi status atomik sesuai aturan aktif valid.

### Perpanjangan kontrak

- Kontrak expired terakhir atau ACTIVE yang berakhir ≤7 hari mendapat action icon Perpanjang Kontrak.
- Action membuka `/karyawan/pkwt/tambah` dengan employee sudah terkunci.
- Untuk kontrak dokumen baru: buat kontrak baru tanpa overlap, misalnya kontrak lama berakhir 31 Juli dan baru mulai 1 Agustus.

### Scheduled status work (fitur terbaru)

- Migration baru: `db/migrations/20260723_scheduled_employee_status_changes.sql`.
- Tabel: `scheduled_employee_status_changes`; aksi `TERMINATE` atau `RESIGN`; status `SCHEDULED`, `APPLIED`, `FAILED`, `CANCELLED`.
- Hanya efektif setelah hari ini; alasan wajib.
- Satu employee hanya satu scheduled status change unresolved (`SCHEDULED/FAILED`).
- Jadwal status kerja dan scheduled mutation saling memblokir.
- Aksi terminasi/resign langsung diblok bila ada scheduled status unresolved.
- Jadwal dimulai dari kontrak ACTIVE terakhir, atau EXPIRED terakhir jika employee masih ACTIVE.
- Saat cron jatuh tempo:
  1. lock jadwal, employee, kontrak ACTIVE, dan histori;
  2. semua kontrak yang masih ACTIVE menjadi `TERMINATED`;
  3. employee menjadi `INACTIVE` untuk TERMINATE atau `RESIGNED` untuk RESIGN;
  4. kontrak yang sudah EXPIRED tetap EXPIRED;
  5. lifecycle event, `STATUS_CHANGE`, dan audit sistem dibuat atomik;
  6. jadwal menjadi `APPLIED`.
- Jika employee sudah tidak ACTIVE atau terjadi error, jadwal menjadi `FAILED` dan harus ditinjau HR; cron tidak retry otomatis.
- Jika sebelum tanggal efektif muncul kontrak ACTIVE baru, cron tetap menghentikannya sesuai keputusan HR.
- UI: tab ketiga **Status Kerja Terjadwal** di `Karyawan → PKWT & Dokumen`, dengan search/filter Site/Status/Aksi/pagination dan action Ubah/Batalkan/Jadwalkan ulang.
- Tidak ada tombol tambah global; jadwal selalu dimulai dari kontrak agar konteks employee/kontrak jelas.
- Di drawer detail kontrak kini ada empat action jelas: Terminasi, Catat resign, Jadwalkan terminasi, Jadwalkan resign. Di data table keempatnya diringkas ke satu dropdown action ber-tooltip.

## Cron reconcile

- Endpoint internal: `POST /api/internal/contracts/reconcile`, header `X-Cron-Secret` dari `CONTRACT_LIFECYCLE_CRON_SECRET`.
- Endpoint browser Super Admin: `POST /api/employees/contracts/reconcile` dan tombol **Jalankan rekonsiliasi** di PKWT.
- Cron memakai business date Asia/Jakarta, advisory lock MySQL `hris:contracts:reconcile`, dan `cron_runs`.
- Urutan saat ini:
  1. aktifkan kontrak Scheduled yang sudah mulai;
  2. ubah kontrak Active yang berakhir menjadi Expired tanpa mengubah employee menjadi Inactive;
  3. sinkronisasi employee terhadap kontrak aktif valid dan tandai legacy conflicts;
  4. proses Scheduled Mutation jatuh tempo;
  5. proses Scheduled Status Work jatuh tempo.
- Respons cron mencakup summary contracts, `scheduledMutations`, dan `scheduledStatusChanges`, termasuk maksimal 50 kegagalan per antrean.
- Rekomendasi jadwal server: setiap hari 00:05 WIB.
- Hit manual lokal: `powershell -ExecutionPolicy Bypass -File .\scripts\run-contract-reconcile.ps1`.

## Data migrasi employee yang sudah dilakukan Bos

- Employee dan employment history awal telah dimigrasikan dari data HR. Target aktual yang pernah dikunci: 1.345 employee.
- Kontrak awal dibuat sebagai 1.180 PKWT Borongan dan 165 Training, tanpa file/dokumen fiktif; HR akan upload dokumen fisik asli.
- Ada empat Borongan legacy tanpa kontrak yang sengaja dibiarkan sebagai alert; jangan auto-inactive atau ubah histori mereka tanpa keputusan baru.
- Untuk data lama, Employee ID yang tanggalnya tidak cocok dengan join date boleh dipertahankan.

## Migration penting

Jalankan hanya sesuai status database aktif dan setelah backup:

- `20260714_employee_number_generation.sql`
- `20260714_employee_barcode_from_number.sql`
- `20260715_contract_types.sql`
- `20260715_additional_contract_types.sql`
- `20260715_contract_lifecycle.sql`
- `20260716_production_modules_sections.sql`
- `20260722_department_change_mutation_type.sql`
- `20260722_cron_runs.sql`
- **`20260723_scheduled_employee_status_changes.sql`** (terbaru)

### Kondisi database pada pengecekan terakhir

Pada 23 Juli 2026, API dan UI Status Kerja Terjadwal gagal karena database aktif **belum memiliki** tabel `scheduled_employee_status_changes`. Tabel `cron_runs` dan `scheduled_employee_mutations` ada. Jalankan migration `20260723_scheduled_employee_status_changes.sql`, restart `pnpm dev`, lalu cek ulang tab dan rekonsiliasi.

## Verifikasi terakhir

- `pnpm format:check` lulus.
- `pnpm lint` lulus tanpa error; masih ada lima warning Fast Refresh lama di route form.
- `pnpm --filter @hris-restu/api test` lulus: 15 test.
- API build lulus.
- Frontend `tsc -b` lulus. Vite production build menghasilkan `dist`; wrapper tool sempat timeout menunggu child build pada satu run, tetapi proses Vite selesai.
- Browser smoke tidak dijalankan oleh Codex sesuai preferensi Bos; Bos melakukan smoke fisik.

## Langkah aman setelah membuka sesi baru

1. Baca dokumen ini dan `AGENTS.md`.
2. Pastikan migration terbaru sudah dieksekusi dengan query `information_schema.tables` tanpa membocorkan kredensial.
3. Jika akan mengubah Karyawan/PKWT/Mutasi/Cron, baca `apps/api/src/lib/contract-lifecycle.ts`, `apps/api/src/lib/cron-reconcile.ts`, `apps/api/src/lib/scheduled-mutations.ts`, dan `apps/api/src/lib/scheduled-status-changes.ts` lebih dahulu.
4. Jangan membangun Attendance, Produksi, atau Payroll sebelum Bos meminta; fokus produk terakhir masih Master Karyawan dan lifecycle PKWT.
5. Jangan menghapus atau mereset perubahan lain di working tree; repository sedang dirty karena rangkaian implementasi besar yang belum tentu semua sudah di-commit.
