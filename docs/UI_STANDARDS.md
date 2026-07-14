## Aturan UI dan UX
- Aplikasi bernama `HRIS RSIA`.
- Gunakan identitas visual logo perusahaan dengan primary navy `#0E2459` dan secondary green `#2B902E`.
- Terapkan warna melalui design tokens/CSS variables, bukan hardcode berulang di komponen.
- Pertahankan kontras, focus state, keyboard navigation, label form, dan ukuran target sentuh yang layak.
- Prioritaskan kenyamanan operasional harian dibanding dekorasi.
- Desktop menjadi tampilan utama administrasi, tetapi seluruh halaman harus layak pada tablet dan HP.
- Halaman scan harus memiliki input autofocus, feedback sukses/gagal yang sangat jelas, pencegahan submit ganda, dan alur dengan klik seminimal mungkin.
- Data table harus mendukung loading, empty state, error state, pencarian, filter, pagination, dan tampilan mobile yang masuk akal sesuai kebutuhan fitur.
- Hindari dashboard penuh kartu dekoratif tanpa informasi yang dapat ditindaklanjuti.
- Gunakan format lokal Indonesia untuk tanggal, waktu, angka, dan Rupiah.


## Referensi UI wajib: shadcn-admin
- Repository starter ini diturunkan dari `satnaing/shadcn-admin`. Pola, primitive, hook, dan public API yang sudah ada di repository lokal adalah standar UI utama yang wajib dipertahankan.
- Referensi upstream: `https://github.com/satnaing/shadcn-admin`. Gunakan upstream hanya untuk memahami pola atau memulihkan file yang hilang; jangan mencampur versi upstream baru secara serampangan ke dependency/struktur starter lokal.
- Sebelum membuat komponen UI baru, periksa terlebih dahulu `src/components/`, `src/components/data-table/`, `src/hooks/`, dan feature demo bawaan yang masih tersedia atau ada di histori Git.
- Jangan membuat design system, data table, pagination, toolbar, filter, dialog, drawer, column header, atau komponen form versi sendiri jika starter sudah menyediakan pola yang setara.
- Jika suatu komponen starter sempat terhapus tetapi dibutuhkan kembali, pulihkan pola/API yang sama dari baseline starter atau dari versi upstream yang sesuai, lalu adaptasikan domain dan copy-nya ke HRIS.
