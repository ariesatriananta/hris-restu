# Deployment Hostinger Managed Node.js

Dokumen ini untuk deployment satu domain: Express melayani API `/api` sekaligus hasil build React/Vite.

## Konfigurasi aplikasi

| Pengaturan Hostinger | Nilai |
| --- | --- |
| Framework | Express |
| Root directory | `./` |
| Branch | branch deployment, biasanya `main` |
| Node.js | `22.x` |
| Package manager | pnpm |
| Entry file | `server.js` |

Pada tampilan hPanel ini tidak ada field untuk mengetik build command. Hostinger
membaca script `build` dan `start` langsung dari `package.json`, lalu menjalankan
proses install, build, dan start secara otomatis saat deployment. Versi pnpm
dikunci melalui `packageManager: pnpm@11.9.0` agar sama dengan runner Hostinger,
sedangkan dependency dikunci oleh
`pnpm-lock.yaml`; jangan memakai `package-lock.json` untuk deployment ini.
File `.npmrc` menjaga devDependencies (TypeScript dan Vite) tetap terpasang pada
tahap build walaupun `NODE_ENV=production`, sedangkan `pnpm-workspace.yaml`
hanya mengizinkan build script dependency yang dibutuhkan (`argon2` dan
`esbuild`).

Jangan memakai `vite preview` sebagai server production. Deep-link frontend dan asset production dilayani langsung oleh Express dari folder `dist`.

## Environment variables

Masukkan nilai melalui panel Hostinger. Jangan upload file `.env` production ke Git.

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

Biarkan Hostinger menyediakan `PORT`. Jika runtime tidak menyediakannya, aplikasi
memakai port `3000`, sesuai default Managed Node.js Hostinger. Isi manual hanya
jika panel memang meminta nilai port tertentu. `TRUST_PROXY=1` hanya dipakai
karena aplikasi berada di belakang reverse proxy Hostinger.

`VITE_API_BASE_URL` dibaca saat proses build. Perubahan nilainya memerlukan build dan redeploy, bukan hanya restart aplikasi.

## Validasi sebelum push

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test:smoke:production
```

Script `build` sengaja memanggil `tsc` dan `vite` secara langsung. Tidak ada
pemanggilan pnpm bertingkat di dalam build production, sehingga sesuai dengan
runner Hostinger yang sudah menangani package manager di level deployment.

Smoke production memakai `.env` lokal API, membuka server pada port acak, memeriksa health API, deep-link SPA, respons `404` API berbentuk JSON, lalu menutup server otomatis.

## Validasi setelah deploy

1. Buka `/api/health` dan pastikan respons `200` dengan `{"status":"ok"}`.
2. Buka lalu refresh deep-link seperti `/attendance/monitoring-harian` dan pastikan tidak `404`.
3. Buka endpoint API yang tidak ada dan pastikan mendapat `404` JSON, bukan halaman frontend.
4. Uji login, cookie HTTPS, akses HR per site, upload file R2, export, dan cetak.
5. Periksa Runtime Log Hostinger setelah smoke test.

Import schema dan migration database tetap dilakukan terkontrol oleh operator. Jangan menjalankan seed demo/reset pada database production.

## Jika deployment sebelumnya memakai npm

Ubah package manager pada hPanel menjadi `pnpm`, simpan, lalu lakukan deploy
ulang dari commit terbaru. Jika log masih diawali perintah npm atau masih
menyebut versi dependency lama, hapus cache deployment/build dari hPanel bila
opsinya tersedia, kemudian deploy ulang. Log instalasi yang benar harus membaca
`pnpm-lock.yaml` dan tidak memasang `@zxing/library@0.23.0`; project ini mengunci
`@zxing/library@0.21.3`, yang kompatibel dengan Node.js 22.
