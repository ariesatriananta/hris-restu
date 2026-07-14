# Backend Foundation HRIS PT Restu

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
