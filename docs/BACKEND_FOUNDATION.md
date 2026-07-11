# Backend Foundation HRIS PT Restu

API berada di `apps/api`, memakai Express, Drizzle/MySQL, JWT cookie httpOnly, RBAC dari database, dan Cloudflare R2.

## Menjalankan lokal

1. Import `db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql` ke database kosong.
2. Salin `apps/api/.env.example` menjadi `apps/api/.env` dan isi seluruh secret.
3. Buat hash Argon2id di lingkungan tepercaya, lalu insert user Super Admin secara manual ke `users` dan `user_roles`. Jangan menyimpan password plaintext di repository.
4. Jalankan `pnpm dev:api`; health check tersedia di `GET /api/health`.

## Kontrak fondasi

- `POST /api/auth/sign-in`, `/refresh`, `/sign-out`, dan `GET /api/auth/me`.
- `POST /api/files` menerima multipart field `file`, maksimal 10 MB, dengan permission `documents.manage`.
- Cookie `hris_access` dan `hris_refresh` bersifat httpOnly. Refresh token hanya disimpan sebagai SHA-256 hash di `user_sessions` dan dirotasi saat refresh.
- Authorization backend memuat role, permission, dan akses site. Super Admin melewati pemeriksaan permission; endpoint resource berikutnya wajib tetap memeriksa scope site.

## Risiko R2 publik

Sesuai keputusan produk, URL file dibentuk dari `R2_PUBLIC_BASE_URL`. Siapa pun yang mendapatkan URL dapat membuka file. Database tetap mencatat provider `S3` dan visibility `INTERNAL` karena enum schema tidak menyediakan nilai public.

Integrasi API Master Karyawan sengaja menjadi Eksekusi 4. Attendance, Produksi Borongan, dan Payroll belum memiliki endpoint bisnis pada fondasi ini.
