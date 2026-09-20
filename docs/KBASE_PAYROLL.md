# Knowledge Base - Payroll

> Modul: Payroll
>
> Audiens: Payroll Finance, Direksi, Super Admin, HR, dan pengguna laporan
>
> Terakhir diverifikasi: 17 September 2026
>
> Status: aktif; panduan dibagi berdasarkan pekerjaan pada aplikasi

Knowledge Base Payroll membantu Anda menyiapkan skema upah, menjalankan tiga
tahap **Proses Payroll**, lalu membaca hasil resmi. Buka panduan yang sesuai
dengan pekerjaan Anda; lima artikel di bawah adalah materi, bukan lima menu
terpisah di sidebar.

## Pilih panduan

| Panduan | Gunakan ketika |
|---|---|
| [Skema Upah dan Tarif](./kbase/payroll/KBASE_SKEMA_UPAH_DAN_TARIF.md) | Mengatur kebijakan Payroll, tarif, gaji pokok, UMK, serta BPJS Borongan. |
| [Periode dan Kesiapan Payroll](./kbase/payroll/KBASE_PERIODE_DAN_KESIAPAN_PAYROLL.md) | Tahap 1: membuat periode dan menyelesaikan masalah kesiapan data. |
| [Perhitungan dan Komponen Payroll](./kbase/payroll/KBASE_SIMULASI_DAN_KOMPONEN_PAYROLL.md) | Tahap 2: menambah komponen manual, menghitung, dan memeriksa hasil per karyawan. |
| [Persetujuan dan Penutupan Payroll](./kbase/payroll/KBASE_APPROVAL_DAN_CLOSING_PAYROLL.md) | Tahap 3: mengajukan, menyetujui/menolak, menarik, dan menutup periode. |
| [Riwayat, Ekspor, dan Slip Payroll](./kbase/payroll/KBASE_RIWAYAT_EKSPOR_DAN_SLIP_PAYROLL.md) | Membandingkan perhitungan, mengunduh rekap/Daftar Pembayaran, dan mencetak slip resmi. |

## Alur kerja utama

1. Siapkan kebijakan dan nominal pada **Payroll > Skema Upah & Tarif**.
2. Buka **Payroll > Proses Payroll**. Tahap **Periode & kesiapan**: buat periode dan selesaikan masalah yang harus diperbaiki.
3. Tahap **Perhitungan**: hitung dan cocokkan hasil beberapa karyawan; bila perlu, atur komponen manual dan hitung ulang.
4. Tahap **Persetujuan & penutupan**: ajukan, setujui, lalu tutup periode sesuai hak akses. Panel **Langkah berikutnya** menunjukkan tindakan utama yang tersedia.
5. Setelah ditutup, buka **Riwayat Payroll**, **Slip Gaji**, atau **Laporan > Payroll Final** sesuai kebutuhan.

Periode yang dipilih ikut terbawa saat berpindah tahap. Jika tidak punya hak
untuk tindakan berikutnya, halaman tetap memperlihatkan status dan siapa yang
perlu melanjutkan.

Status normal periode adalah:

**Draft -> Siap diajukan -> Disetujui -> Ditutup**

Status **Dibatalkan** hanya dapat berasal dari Draft. Hitung ulang membuat
perhitungan baru tanpa menghapus yang lama. Penutupan menetapkan perhitungan
terbaru sebagai **FINAL**. Dalam alur operasional normal, periode tertutup tidak
dihitung ulang; **Reset & hapus periode** khusus Super Admin menghapus periode
dan hasil turunannya untuk dibuat ulang, dengan konfirmasi serta audit.

## Jenis Payroll yang tersedia

| Jenis karyawan | Dasar upah | Frekuensi | Sumber utama |
|---|---|---|---|
| Borongan | Hasil kerja (`PIECE_RATE`) | Rentang fleksibel, maksimal 31 hari | Transaksi Produksi berstatus Tercatat/`POSTED` |
| Harian | Waktu (`TIME_BASED`) | Senin-Minggu | Attendance final Hadir dan tarif harian |
| Training | Waktu (`TIME_BASED`) | Senin-Minggu | Attendance final Hadir dan tarif harian; hasil Produksi hanya informasi |
| Bulanan | Waktu (`TIME_BASED`) | Bulanan sesuai aturan tanggal tutup buku | Gaji pokok, prorata, serta potongan Alpha dan Izin |

## Prinsip yang wajib diingat

- Periode Draft belum menghitung gaji.
- Simulasi menyimpan snapshot. Perubahan sumber setelah simulasi dapat
  mewajibkan hitung ulang.
- Rekening yang belum lengkap merupakan **peringatan**, bukan blocker hak atau
  nominal Payroll. Daftar Pembayaran tetap dapat diekspor; kolom rekening
  kosong diberi tanda `-` dan harus diperiksa sebelum transfer.
- Neto negatif tetap terlihat pada simulasi, tetapi memblokir pengajuan,
  persetujuan, dan closing.
- Menu **Slip Gaji** hanya menawarkan periode **Ditutup** dengan perhitungan
  terbaru `FINAL`; hasil simulasi tetap dapat ditelusuri melalui riwayat.
- Status `CLOSED`, file Daftar Pembayaran, dan slip resmi tidak menyatakan dana
  sudah ditransfer atau diterima karyawan.
- Perubahan pada hasil resmi tidak dilakukan dengan mengeditnya. Reset khusus
  Super Admin dapat menghapus periode dan hasil turunannya untuk diproses ulang.
- Akses site dan izin tindakan selalu diperiksa kembali oleh backend.

## Batas sistem saat ini

Sistem belum menghitung pajak secara otomatis, belum mencatat status
transfer sebagai workflow pembayaran, belum menyimpan PDF slip secara permanen,
dan belum memakai tanda tangan elektronik pada slip. Kebutuhan tersebut tidak
boleh disimpulkan dari status periode atau file keluaran Payroll.

BPJS otomatis saat ini terbatas pada Payroll Borongan dan hanya dijalankan pada
periode yang mengaktifkan **Potong BPJS** serta memilih bulan iuran.

## Urutan baca yang disarankan

1. [Skema Upah dan Tarif](./kbase/payroll/KBASE_SKEMA_UPAH_DAN_TARIF.md)
2. [Periode dan Kesiapan Payroll](./kbase/payroll/KBASE_PERIODE_DAN_KESIAPAN_PAYROLL.md)
3. [Perhitungan dan Komponen Payroll](./kbase/payroll/KBASE_SIMULASI_DAN_KOMPONEN_PAYROLL.md)
4. [Persetujuan dan Penutupan Payroll](./kbase/payroll/KBASE_APPROVAL_DAN_CLOSING_PAYROLL.md)
5. [Riwayat, Ekspor, dan Slip Payroll](./kbase/payroll/KBASE_RIWAYAT_EKSPOR_DAN_SLIP_PAYROLL.md)
