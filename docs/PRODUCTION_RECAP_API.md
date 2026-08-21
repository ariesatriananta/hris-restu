# API Rekap Produksi (Fase 2C)

Rekap Produksi bersifat **live dan read-only**. Hanya transaksi berstatus
`POSTED` yang masuk perhitungan. Transaksi sumber yang sudah `VOID` tidak
dihitung; transaksi penggantinya dihitung sebagai transaksi `POSTED` baru.

## Endpoint

### `GET /api/production/recaps`

Permission: `production.view`.

Query:

- `dateFrom`, `dateTo`: wajib valid, periode maksimal 31 hari;
- `site`, `jobUid`, `employeeType`, `productionSectionUid`, `workGroupUid`:
  nilai CSV;
- `query`: nama atau nomor karyawan;
- `page`, `pageSize`: pagination baris karyawan (maksimal 500).

Response memuat `summary`, `quantityTotals` yang selalu dipisah per satuan,
baris `employees` per karyawan dan site, agregat card `jobs`, serta `facets`.
Status Payroll menggunakan `NONE`, `PARTIAL`, atau `SNAPSHOTTED` berdasarkan
keberadaan snapshot pada `payroll_production_details`.

Jenis karyawan, jabatan, dan Bagian Produksi dibaca dari histori employment
efektif pada tanggal transaksi. Kelompok kerja menggunakan snapshot
`production_transactions.work_group_id` agar perpindahan berikutnya tidak
menulis ulang konteks transaksi lama.

### `GET /api/production/recaps/employees/:employeeUid`

Permission: `production.view`. Query `site` wajib agar identitas baris
karyawan-site tidak ambigu. Response memuat ringkasan, histori penempatan yang
bertumpang dengan periode, dan kronologi transaksi `POSTED`.

### `GET /api/production/recaps/jobs/:jobUid`

Permission: `production.view`. Response memuat ringkasan pekerjaan, kontribusi
karyawan, dan kronologi transaksi `POSTED` sesuai filter serta akses site.

### `POST /api/production/recaps/export`

Permission: `production.export`. Body memakai filter yang sama dengan endpoint
utama (array untuk filter multi-select). File Excel berisi empat sheet:

1. Ringkasan Karyawan;
2. Rincian Pekerjaan;
3. Transaksi POSTED;
4. Riwayat Revisi.

Setiap ekspor dicatat ke `audit_logs` per site yang berada dalam scope ekspor.

## Permission

Jalankan migration berikut setelah schema Fase 2B:

```text
db/migrations/20260821_production_recap_export_permission.sql
```

Migration aman dijalankan ulang dan memberikan `production.export` kepada
`SUPER_ADMIN`, `PRODUCTION_ADMIN`, `PAYROLL_FINANCE`, dan `DIRECTOR`.
Pembatasan site tetap ditegakkan oleh API untuk akun non-global.
