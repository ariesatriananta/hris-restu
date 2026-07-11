# Progress Frontend HRIS PT Restu

Pembaruan terakhir: 11 Juli 2026.

| Area | Status | Catatan |
|---|---|---|
| Application shell dan branding | selesai | Shell responsif, sidebar/drawer, breadcrumb, theme, user menu, dan identitas PT Restu telah diverifikasi. |
| Mock auth dan protected route | selesai | Login/logout/session mock dan guard route telah diverifikasi; bukan auth production. |
| Dashboard operasional | selesai | Data mock async, filter site, KPI, chart, tabel/kartu mobile, aktivitas, alert, serta state loading/error/empty telah diverifikasi. |
| Karyawan dan dokumen | selesai | CRUD mock, detail dengan data sensitif tersamarkan, mutasi append-only, PKWT, metadata dokumen, serta cetak/unduh ID card Code128 telah diverifikasi. |
| Attendance dan shift | placeholder | Route tersedia, proses bisnis belum dikerjakan. |
| Produksi borongan dan tarif | placeholder | Route tersedia, proses bisnis belum dikerjakan. |
| Payroll | placeholder | Route tersedia, proses bisnis belum dikerjakan. |
| Laporan | placeholder | Route tersedia, laporan belum dikerjakan. |
| Administrasi sistem | placeholder | Route tersedia, user/permission/audit/pengaturan belum dikerjakan. |
| Backend, API, JWT, upload, dan MySQL | belum dikerjakan | Sengaja di luar scope Eksekusi 1 dan 2. |

## Kondisi dan blocker

- Logo resmi tersedia di `public/brand/restu-logo.jpeg`; UI tetap memiliki fallback teks `RESTU` jika asset gagal dimuat.
- Repository Git aktif pada branch `main`; perubahan Eksekusi 2 dapat diaudit melalui status dan diff Git.
- Schema database tidak diubah.

## Lanjutan yang direkomendasikan

Prioritas berikutnya adalah Backend Foundation: Express, Drizzle, MySQL, JWT, upload, RBAC, dan penggantian repository mock menjadi HTTP API.
