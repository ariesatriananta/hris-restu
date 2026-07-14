# Progress Frontend HRIS PT Restu

Pembaruan terakhir: 13 Juli 2026.

| Area | Status | Catatan |
|---|---|---|
| Application shell dan branding | selesai | Shell responsif, sidebar/drawer, breadcrumb, theme, user menu, dan identitas PT Restu telah diverifikasi. |
| Auth dan protected route | selesai | Login/logout/me memakai cookie httpOnly API; bootstrap sesi dan refresh sekali dari Axios telah diterapkan. |
| Dashboard operasional | selesai | Data mock async, filter site, KPI, chart, tabel/kartu mobile, aktivitas, alert, serta state loading/error/empty telah diverifikasi. |
| Master Karyawan (Eksekusi 4) | selesai | CRUD, lookup, filter/pagination, histori/mutasi atomik, PKWT, dokumen, foto, ID card, upload R2, RBAC/scope site, dan audit log memakai HTTP API/MySQL. Runtime mock karyawan telah dihapus; seed hanya berisi data fiktif. Form tambah/edit memakai halaman penuh. |
| Attendance dan shift | placeholder | Route tersedia, proses bisnis belum dikerjakan. |
| Produksi borongan dan tarif | placeholder | Route tersedia, proses bisnis belum dikerjakan. |
| Payroll | placeholder | Route tersedia, proses bisnis belum dikerjakan. |
| Laporan | placeholder | Route tersedia, laporan belum dikerjakan. |
| Administrasi sistem | placeholder | Route tersedia, user/permission/audit/pengaturan belum dikerjakan. |
| Backend foundation | selesai | Workspace Express, MySQL, JWT cookie, session rotation, RBAC/site context, upload R2, serta kontrak API Master Karyawan tersedia. |

## Kondisi dan blocker

- Logo resmi tersedia di `public/brand/restu-logo.jpeg`; UI tetap memiliki fallback teks `RESTU` jika asset gagal dimuat.
- Repository Git aktif pada branch `main`; perubahan dapat diaudit melalui status dan diff Git.
- Schema database tidak diubah.
- File HR memakai CDN R2 publik sesuai keputusan produk; URL yang diperoleh pihak lain dapat dibuka.
- Upload terkait karyawan memakai struktur key R2 `hris-rsia/employees/{employeeUid}/...` (prefix aktual mengikuti `R2_KEY_PREFIX`).
- Smoke API nonvisual terakhir mencakup login, list karyawan, riwayat, PKWT, dokumen, upload R2 berfolder karyawan, dan logout. Uji visual browser tetap dijalankan manual oleh Bos sesuai kesepakatan.

## Lanjutan yang direkomendasikan

Prioritas berikutnya adalah Eksekusi 5: Attendance dan shift (frontend + backend), lalu Produksi Borongan dan Payroll.
