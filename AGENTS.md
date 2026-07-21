# AGENTS.md - HRIS PT Restu Sejati Inti Abadi

## Aturan bisnis penting
Lihat di file : `docs/HRIS_BUSINESS_RULES.md`

## Aturan UI dan UX
Lihat di file : `docs/UI_STANDARDS.md`

## Standar data table lengkap
Lihat di file : `docs/UI_TABLE_STANDARD.md`

## Sumber kebenaran
- Baca `db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql` sebelum mengerjakan fitur yang bergantung pada data atau proses bisnis.
- Struktur tabel, relasi, enum/status, constraint, dan seed di file SQL tersebut adalah sumber kebenaran database saat ini.

## Stack dan fondasi repo
- React + Vite + TypeScript.
- Tailwind CSS dan shadcn/ui dari starter `shadcn-admin`.

## Larangan Penting
- Jangan menghubungkan frontend langsung ke MySQL.
- Jangan menampilkan data sensitif pada log, fixture, screenshot, atau error message.
- Jangan mengubah schema tanpa konfirmasi.
- Jangan mengedit `routeTree.gen.ts` secara manual. Gunakan mekanisme generator TanStack Router yang berlaku di repo.
- Jangan mengekspos `id` internal sebagai identifier route jika tidak diperlukan, Gunakan identifier publik `uid` pada URL dan kontrak frontend


- Gunakan `pnpm` sebagai package manager di env lokal
- Gunakan `npm` sebagai package manager di env production
