### Standar wajib untuk data table dan filter

- Semua daftar data operasional yang membutuhkan tabel harus mengikuti ekosistem starter: TanStack Table + `useTableUrlState` + `DataTableToolbar` + `DataTableFacetedFilter` + `DataTableColumnHeader` + `DataTablePagination` + `DataTableViewOptions` dan `DataTableBulkActions` bila aksi massal memang diperlukan.
- Gunakan `src/components/data-table/` dan `src/hooks/use-table-url-state.ts` yang sudah ada. Jangan membuat table wrapper, filter bar, dropdown filter, pagination, atau query-state hook baru yang menduplikasi perilaku komponen tersebut.
- Search, faceted filter, pagination, dan page size harus tersinkron ke route search params melalui schema TanStack Router. Filter yang berubah harus mengembalikan user ke halaman pertama dan filter aktif harus dapat di-reset melalui toolbar bawaan.
- Toolbar/filter harus berdiri langsung pada halaman; jangan membungkus toolbar, filter, tabel, dan pagination dengan `Card`. Hanya grid tabel yang memakai border. Primitive `TableHead`/`TableCell` menyediakan padding horizontal dan row compact sebagai standar global.
- Tombol aksi ikon pada data table wajib memakai `DataTableActionButton` agar tooltip shadcn, label aksesibel, ukuran, dan interaksi konsisten. Urutan default aksi adalah **Lihat detail → Ubah → aksi bisnis/lifecycle**.
- Default pagination adalah 100 baris per halaman dengan opsi 100, 200, 300, 400, dan 500. Endpoint list yang mendukung tabel ini wajib memakai default 100 dan maksimum 500 agar UI, URL search params, dan API konsisten.
- Untuk daftar entitas/master yang memiliki `created_at`, urutan backend default wajib `created_at DESC` (tambahkan primary-key DESC sebagai tie-breaker). Jangan mengandalkan urutan client-side atau nama. Daftar histori/transaksi yang punya kronologi bisnis dapat memakai tanggal bisnisnya sebagai pengecualian eksplisit.
- Bentuk feature mengikuti pola starter: `{feature}-table.tsx`, `{feature}-columns.tsx`, `{feature}-provider.tsx`, `{feature}-dialogs.tsx`, dan komponen row/bulk action hanya jika kebutuhan modul memang ada.
- Kolom sortable wajib memakai `DataTableColumnHeader`; filter multi-pilihan wajib memakai `DataTableFacetedFilter`; pagination wajib memakai `DataTablePagination`.
- Adaptasi yang diperbolehkan hanya pada domain model, column definition, label Bahasa Indonesia, opsi filter bisnis, dan aksi yang relevan. Layout, state management, interaksi, dan UX table harus tetap terasa seperti shadcn-admin.
- Jangan menambahkan filter yang tidak punya tujuan operasional nyata. Untuk setiap filter, jelaskan field schema dan kebutuhan bisnis yang mendasarinya.
- Sebelum menyatakan halaman tabel selesai, bandingkan implementasi dengan pola tabel starter yang relevan dan pastikan tidak ada komponen custom duplikat.
