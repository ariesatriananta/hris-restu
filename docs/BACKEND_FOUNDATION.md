# Backend Foundation HRIS RSIA

API berada di `apps/api`, memakai Express, Drizzle/MySQL, JWT cookie httpOnly, RBAC dari database, dan Cloudflare R2.

## Menjalankan lokal

1. Import `db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql` ke database kosong.
2. Salin `apps/api/.env.example` menjadi `apps/api/.env` dan isi seluruh secret.
3. Untuk local testing, jalankan `apps/api/sql/create-local-super-admin.sql`. Untuk environment bersama, buat hash Argon2id baru dan jangan memakai kredensial development tersebut.
4. Jalankan `pnpm dev:api`; health check tersedia di `GET /api/health`.

## Kontrak fondasi

- `POST /api/auth/sign-in`, `/refresh`, `/sign-out`, dan `GET /api/auth/me`.
- `POST /api/files` menerima multipart field `file`, maksimal 10 MB, untuk user dengan `employees.manage` atau `documents.manage`. Field opsional `employeeKey` membuat object R2 tersimpan di `{R2_KEY_PREFIX}/employees/{employeeKey}/`; frontend mengirim `uid` karyawan untuk foto, PKWT, dan dokumen. Saat membuat karyawan baru, record dibuat lebih dulu agar foto tetap memakai folder `uid` final.
- Cookie `hris_access` dan `hris_refresh` bersifat httpOnly. Refresh token hanya disimpan sebagai SHA-256 hash di `user_sessions` dan dirotasi saat refresh.
- Authorization backend memuat role, permission, dan akses site. Super Admin melewati pemeriksaan permission; endpoint resource berikutnya wajib tetap memeriksa scope site.

## Risiko R2 publik

Sesuai keputusan produk, URL file dibentuk dari `R2_PUBLIC_BASE_URL`. Siapa pun yang mendapatkan URL dapat membuka file. Database tetap mencatat provider `S3` dan visibility `INTERNAL` karena enum schema tidak menyediakan nilai public.

## Kontrak Master Karyawan (Eksekusi 4)

- Lookup: `GET /api/employees/lookups`.
- Karyawan: `GET/POST /api/employees`, `GET/PATCH /api/employees/:uid`; list mendukung `query`, `site`, `employeeType`, `employeeStatus`, `page`, dan `pageSize`.
- Riwayat dan mutasi append-only: `GET /api/employees/histories`, `GET /api/employees/:uid/histories`, `POST /api/employees/:uid/mutations`.
- PKWT: `GET /api/employees/contracts`, `GET/POST /api/employees/:uid/contracts`, dan `PATCH /api/employees/contracts/:contractUid`.
- Dokumen: `GET /api/employees/documents`, `GET/POST /api/employees/:uid/documents`, dan `PATCH /api/employees/documents/:documentUid`.
- Aksi tulis Master Karyawan dan upload mencatat `audit_logs`. Semua resource memeriksa permission dan scope site di backend.

Seed pengujian dijalankan dengan `pnpm --filter @hris-restu/api db:seed-demo`; isinya sepenuhnya fiktif. Form tambah dan edit karyawan memakai halaman penuh agar form panjang tetap nyaman di desktop maupun mobile, sedangkan dialog dipertahankan untuk mutasi, PKWT, dan dokumen yang lebih ringkas. Attendance, Produksi Borongan, dan Payroll belum memiliki endpoint bisnis pada fondasi ini.

## Employee ID otomatis

- Jalankan sekali `db/migrations/20260714_employee_number_generation.sql` pada database yang sudah ada sebelum menjalankan API baru.
- Employee ID baru dibuat backend saat `POST /api/employees`; client tidak boleh mengirim `employeeNumber`.
- Formatnya `P{prefix-site}-{YYMM}-{DD}{urut-3-digit}`. Prefix saat ini: Jepara `KDS`, Semarang `SMG`, dan Klaten `SLO`.
- Nomor urut reset untuk setiap kombinasi site dan tanggal bergabung. Employee ID permanen: mutasi maupun koreksi tanggal bergabung tidak mengubahnya.
- Migration nomor awal tidak mengubah Employee ID lama. Jalankan juga `db/migrations/20260714_employee_barcode_from_number.sql`: barcode disimpan sebagai generated column dari `employee_number`, sehingga selalu sama dan tidak dapat diubah terpisah.

## Master tipe kontrak

- Jalankan sekali `db/migrations/20260715_contract_types.sql` pada database yang sudah ada, setelah migration Employee ID dan barcode.
- Migration membuat master `contract_types`, memasukkan tipe awal `PKWT`, `PKWTT`, dan `OTHER`, lalu memigrasikan kontrak lama dari kolom `employee_contracts.contract_type` ke relasi `contract_type_id`. Jalankan juga `db/migrations/20260715_additional_contract_types.sql` untuk menambahkan `TRAINING`, `PROJECT`, dan `RETAIN` pada database yang sudah ada.
- API hanya menerima tipe kontrak yang aktif dari master. `GET /api/employees/lookups` menyediakan `contractTypes` untuk form PKWT; UI administrasi master tipe kontrak sengaja belum dibuat.

## Lifecycle kontrak dan cron

- Jalankan `db/migrations/20260715_contract_lifecycle.sql` setelah migration master tipe kontrak.
- Cron memanggil `POST /api/internal/contracts/reconcile` setiap hari pukul 00:05 WIB dengan header `X-Cron-Secret` yang sama dengan `CONTRACT_LIFECYCLE_CRON_SECRET` pada API.
- Endpoint mengaktifkan kontrak `SCHEDULED`, mengakhiri kontrak `ACTIVE` yang sudah melewati tanggal akhir, lalu merekonsiliasi seluruh Master Karyawan. Karyawan `ACTIVE` tanpa kontrak aktif yang berlaku otomatis menjadi `INACTIVE`; karyawan non-resign dengan kontrak aktif yang berlaku otomatis menjadi `ACTIVE`. Karyawan `RESIGNED` atau legacy `LEAVE` yang masih memiliki kontrak aktif dicatat sebagai konflik dan tidak diaktifkan otomatis. Tidak ada dampak ke Attendance, Produksi, atau Payroll pada tahap ini.
- Karyawan baru selalu dibuat `INACTIVE`. Mutasi tidak dapat mengubah status kerja; status `ACTIVE`, `INACTIVE`, atau `RESIGNED` hanya berubah melalui lifecycle kontrak. Rekrut langsung wajib melalui pembuatan lalu aktivasi kontrak.
- Saat kontrak `ACTIVE` diedit, API menyinkronkan status karyawan dalam transaksi yang sama: kontrak yang masih berlaku mengaktifkan karyawan, sedangkan kontrak yang berakhir sebelum hari bisnis dipindahkan ke `EXPIRED` dan karyawan menjadi `INACTIVE`.
