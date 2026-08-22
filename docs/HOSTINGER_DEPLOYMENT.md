# Deployment Hostinger Managed Node.js

Dokumen ini untuk deployment satu domain: Express melayani API `/api` sekaligus hasil build React/Vite.

## Konfigurasi aplikasi

| Pengaturan Hostinger | Nilai |
| --- | --- |
| Framework | Express |
| Root directory | `./` |
| Branch | branch deployment, biasanya `main` |
| Node.js | `22.x` |
| Package manager | npm |
| Entry file | `server.js` |

Pada tampilan hPanel ini tidak ada field untuk mengetik build command. Hostinger
membaca script `build` dari `package.json`, lalu menjalankan install dan build
secara otomatis. Production dikunci oleh `package-lock.json`. Konfigurasi
`workspaces` pada `package.json` memastikan dependency backend di `apps/api`
ikut dipasang oleh npm. `pnpm-lock.yaml` tetap dipakai untuk development lokal.

Log instalasi harus tetap menampilkan devDependencies karena build membutuhkan
TypeScript dan Vite. `.npmrc` memaksa devDependencies ikut fase build dan
memakai resolusi peer dependency yang konsisten. Awal script `build` menjalankan
helper yang kompatibel dengan npm dan pnpm untuk memastikan binary esbuild dapat
dieksekusi.

Jangan memakai `vite preview` sebagai server production. Frontend dilayani
Express dari `dist`. Backend dibangun ke `dist-server/server.js`; jangan arahkan
entry ke `apps/api/dist/server.js`. Entry panel tetap `server.js`, yaitu file
tipis yang memuat artefak backend tersebut. Tahap akhir build memverifikasi
`dist/index.html` dan `dist-server/server.js` agar kegagalan terdeteksi saat
build, bukan baru menjadi 503 ketika startup.

## Environment variables

Masukkan nilai melalui panel Hostinger. Jangan upload `.env` production ke Git.

```env
NODE_ENV=production
TRUST_PROXY=1
FRONTEND_ORIGIN=https://hris.example.com
VITE_API_BASE_URL=/api
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
JWT_ACCESS_SECRET=GANTI_DENGAN_SECRET_RANDOM_MINIMAL_32_KARAKTER
JWT_ACCESS_TTL_MINUTES=15
REFRESH_TOKEN_TTL_DAYS=7
CONTRACT_LIFECYCLE_CRON_SECRET=GANTI_DENGAN_SECRET_RANDOM_MINIMAL_32_KARAKTER
ATTENDANCE_GO_LIVE_DATE=2026-08-01
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=...
R2_PUBLIC_BASE_URL=https://cdn.example.com
R2_KEY_PREFIX=hris-rsia/
```

Biarkan Hostinger menyediakan `PORT`. `TRUST_PROXY=1` dipakai karena aplikasi
berada di belakang reverse proxy. `VITE_API_BASE_URL` dibaca saat build sehingga
perubahannya memerlukan redeploy.

## Validasi sebelum push

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test:smoke:production
```

Validasi lokal tetap memakai pnpm. Hostinger menjalankan padanannya melalui npm
dan `package-lock.json`. Script build memanggil binary project langsung sehingga
tidak bergantung pada perintah pnpm di runtime Hostinger.

## Validasi setelah deploy

1. Buka `/api/health` dan pastikan respons `200` dengan `{"status":"ok"}`.
2. Refresh deep-link seperti `/attendance/monitoring-harian` dan pastikan tidak `404`.
3. Endpoint API yang tidak ada harus memberi `404` JSON, bukan halaman frontend.
4. Uji login, cookie HTTPS, akses per site, upload R2, ekspor, dan cetak.
5. Periksa Runtime Log setelah pengujian.

## Sinkronisasi database staging

Deployment aplikasi dan migration database adalah langkah terpisah. Backup
database staging lebih dulu, lalu jalankan audit read-only
`db/checks/20260822_staging_migration_status.sql`. Untuk staging yang terakhir
sinkron sebelum fase Produksi Borongan, jalankan hanya file yang berstatus belum,
satu per satu, dan hentikan bila ada yang gagal:

1. `db/migrations/20260821_attendance_classification_reversal.sql`
2. `db/migrations/20260821_production_foundation.sql`
3. `db/migrations/20260821_production_transaction_revisions.sql`
4. `db/migrations/20260821_production_recap_export_permission.sql`
5. `db/migrations/20260822_production_exception_integrity.sql`

Migration 2D wajib setelah migration revisi transaksi. Jangan mengulang
migration struktur yang sudah berhasil karena sebagian `ALTER TABLE` dirancang
satu kali jalan. `20260821_contract_number_format.sql` bukan migration struktur
wajib; file itu mengubah nomor kontrak dan snapshot cetak data demo, sehingga
hanya dijalankan setelah backup bila staging memang perlu perubahan tersebut.

Verifikasi minimal bahwa permission `production.export`, kolom
`production_transactions.entry_source`, kolom
`employee_job_assignments.status`, dan tabel
`employee_job_assignment_revisions` tersedia. Seed/reset tidak termasuk langkah
deployment normal.

## Jika deployment sebelumnya memakai pnpm

Ubah package manager hPanel menjadi npm, pastikan root `./`, Node.js `22.x`, dan
entry `server.js`, lalu deploy ulang dari commit terbaru. Bersihkan cache build
bila log masih membaca konfigurasi lama. Instalasi yang benar membaca
`package-lock.json` dan memakai `@zxing/library@0.21.3`, bukan 0.23.0.

Jika esbuild gagal dengan `spawnSync ... EACCES`, pastikan commit memuat
`scripts/prepare-esbuild-binaries.mjs`. Bila helper sudah berjalan tetapi Vite
tetap EACCES, minta Hostinger membersihkan dependency cache atau memeriksa mount
`noexec`; itu masalah permission filesystem hosting.
