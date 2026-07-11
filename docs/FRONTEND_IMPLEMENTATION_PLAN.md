# Rencana Implementasi Frontend HRIS PT Restu

Dokumen ini menjadi urutan kerja frontend setelah fondasi awal. Database tetap mengikuti `db/HRIS_PT_RESTU_SCHEMA_MYSQL.sql`; perubahan schema memerlukan persetujuan eksplisit.

## Milestone 1 — Fondasi frontend

- Branding, application shell responsif, mock auth, protected route, dan error state.
- Navigasi seluruh modul dan placeholder yang dapat diakses.
- Dashboard operasional dengan repository mock async dan TanStack Query.
- Fondasi state loading, error, empty, format lokal, dan dokumentasi teknis.

## Milestone 2 — Master karyawan dan dokumen

- Data karyawan, detail, filter, histori penempatan/mutasi, dan status kerja.
- PKWT, dokumen karyawan, template, peringatan masa berlaku, dan cetak ID card.
- Menggunakan `uid` pada URL serta repository yang siap diganti HTTP API.

Ketergantungan: milestone 1 dan kontrak API karyawan yang mengikuti schema.

## Milestone 3 — Attendance dan shift

- Master shift dan penugasan karyawan.
- Terminal scan masuk/pulang untuk browser HP.
- Monitoring, rekap, koreksi, approval, idempotensi, dan audit event scan.

Ketergantungan: master karyawan/site serta kontrak backend untuk waktu server dan perangkat scan.

## Milestone 4 — Produksi borongan dan tarif

- Master pekerjaan, satuan, penugasan pekerjaan, dan histori tarif per site.
- Terminal setoran scanner USB, validasi attendance, transaksi, revisi, dan void.
- Snapshot tarif dan rekap produksi.

Ketergantungan: attendance aktif pada business date yang sama dan kontrak backend idempotensi.

## Milestone 5 — Payroll

- Periode, simulasi, perhitungan ulang, validasi, dan hasil per karyawan.
- Approval, closing immutable, snapshot produksi/attendance, riwayat, dan slip gaji.
- Fondasi payroll bulanan tetap mengikuti basis karyawan pada schema.

Ketergantungan: data karyawan, attendance, produksi, tarif, dan workflow approval backend.

## Milestone 6 — Laporan, administrasi, integrasi API, dan final QA

- Laporan lintas modul, ekspor, user/role/permission, akses site, pengaturan, dan audit trail.
- Ganti seluruh repository mock dengan HTTP repository tanpa menulis ulang page.
- Uji authorization role + site pada backend dan frontend, aksesibilitas, performa, keamanan, serta UAT tiga site.

Ketergantungan: seluruh kontrak API stabil dan environment deployment tersedia.

## Keputusan teknis

- TanStack Router file-based tetap menjadi router utama; `routeTree.gen.ts` tidak diedit manual.
- TanStack Query menangani seluruh server-state, termasuk repository mock.
- RHF + Zod digunakan untuk form dan validasi.
- URL publik memakai `uid`, bukan numeric internal ID.
- Filter dashboard adalah filter data, bukan authorization context.
- Session Eksekusi 1 hanyalah marker localStorage melalui `AuthRepository`, bukan JWT production.
- Warna brand diterapkan melalui design token, bukan hardcode berulang pada feature.
- Eksekusi 2 menggunakan `EmployeeRepository` mock async dengan sessionStorage; histori mutasi append-only dan file hanya metadata mock.
- ID card menggunakan Code128 SVG client-side melalui `jsbarcode`, lalu dapat dicetak lewat browser atau diunduh sebagai SVG.
- Daftar karyawan mengikuti ekosistem tabel starter: TanStack Table, URL search params, faceted filter, sortable column, pagination, dan view options; tampilan mobile menggunakan kartu dari dataset yang sama.
- Eksekusi 3 menyediakan backend foundation Express, Drizzle/MySQL, JWT cookie httpOnly, RBAC/site context, serta upload Cloudflare R2.
- Urutan lanjutan dikunci: Eksekusi 4 integrasi API Master Karyawan; Eksekusi 5 Attendance; Eksekusi 6 Produksi Borongan; Eksekusi 7 Payroll.
