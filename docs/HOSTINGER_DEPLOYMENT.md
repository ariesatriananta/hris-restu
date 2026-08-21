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
| Entry file | `dist-server/server.js` |

Pada tampilan hPanel ini tidak ada field untuk mengetik build command. Hostinger
membaca script `build` dan `start` langsung dari `package.json`, lalu menjalankan
proses install, build, dan start secara otomatis saat deployment. Versi pnpm
dikunci melalui `packageManager: pnpm@11.9.0` agar sama dengan runner Hostinger,
sedangkan dependency dikunci oleh
`pnpm-lock.yaml`; jangan memakai `package-lock.json` untuk deployment ini.
Log instalasi Hostinger harus tetap menampilkan devDependencies karena build
membutuhkan TypeScript dan Vite. `pnpm-workspace.yaml` memakai `allowBuilds`
pnpm 11: build native `argon2` diizinkan, sedangkan postinstall `esbuild`
dinonaktifkan karena filesystem build Hostinger dapat kehilangan permission
execute. Awal script `build` menjalankan helper Node untuk memulihkan permission
binary esbuild yang sudah dikunci di lockfile.

Jangan memakai `vite preview` sebagai server production. Deep-link frontend dan asset production dilayani langsung oleh Express dari folder `dist`.
Backend TypeScript dibangun ke `dist-server/server.js` pada root repository agar
artefaknya ikut dipindahkan ke runtime Managed Node.js. Jangan arahkan entry ke
`apps/api/dist/server.js`; folder build workspace tersebut tidak dijamin ikut
runtime bundle Hostinger. Server mencari frontend dari `dist` relatif terhadap
root proses aplikasi, sehingga backend dan SPA tetap dapat dijalankan dari dua
folder build root yang terpisah. Tahap terakhir script `build` memverifikasi
kedua artefak tersebut; deployment harus gagal saat build bila salah satunya
tidak terbentuk, bukan baru gagal sebagai 503 ketika startup.

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

Jika log berhenti pada postinstall esbuild dengan `spawnSync ... EACCES`, pastikan
commit sudah memuat `scripts/prepare-esbuild-binaries.mjs` dan konfigurasi
`allowBuilds` yang menolak postinstall esbuild. Log tahap build selanjutnya harus
menampilkan jumlah binary esbuild yang permission-nya disiapkan. Bila helper
sudah berjalan tetapi Vite tetap menghasilkan `EACCES`, minta Hostinger
membersihkan dependency cache atau memeriksa mount `noexec`; itu sudah merupakan
masalah permission filesystem hosting, bukan dependency aplikasi.
