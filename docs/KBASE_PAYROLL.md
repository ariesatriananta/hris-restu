# Knowledge Base - Payroll

> Modul: Payroll
>
> Audiens: Payroll Finance, Direksi, Super Admin, HR, dan pengguna laporan
>
> Terakhir diverifikasi: 5 September 2026
>
> Status: aktif; panduan dibagi berdasarkan pekerjaan pada aplikasi

Knowledge Base Payroll membantu Anda menyiapkan skema upah, membuat periode,
memeriksa kesiapan data, menghitung simulasi, mengesahkan hasil, dan menerbitkan
keluaran Payroll. Buka panduan yang sesuai dengan tahap kerja Anda.

## Pilih panduan

| Panduan | Gunakan ketika |
|---|---|
| [Skema Upah dan Tarif](./kbase/payroll/KBASE_SKEMA_UPAH_DAN_TARIF.md) | Menyiapkan policy Payroll, tarif Harian/Training, gaji pokok Bulanan, atau memeriksa kesiapan histori Training. |
| [Periode dan Kesiapan Payroll](./kbase/payroll/KBASE_PERIODE_DAN_KESIAPAN_PAYROLL.md) | Membuat periode Borongan atau berbasis waktu, membaca status kesiapan, menyelesaikan blocker, atau membatalkan Draft. |
| [Simulasi dan Komponen Payroll](./kbase/payroll/KBASE_SIMULASI_DAN_KOMPONEN_PAYROLL.md) | Menambah komponen manual, menghitung atau menghitung ulang, membaca rumus dan hasil per karyawan, atau memulihkan run yang macet. |
| [Approval dan Closing Payroll](./kbase/payroll/KBASE_APPROVAL_DAN_CLOSING_PAYROLL.md) | Mengajukan, menarik, menyetujui, menolak, atau menutup Payroll secara permanen. |
| [Riwayat, Ekspor, dan Slip Payroll](./kbase/payroll/KBASE_RIWAYAT_EKSPOR_DAN_SLIP_PAYROLL.md) | Membandingkan run, mengunduh rekap atau Daftar Pembayaran, mencetak slip, atau membaca Laporan Payroll Final. |

## Alur kerja utama

1. Siapkan policy dan nominal pada **Payroll > Skema Upah & Tarif**.
2. Buat dan periksa periode pada **Payroll > Periode Payroll**.
3. Selesaikan seluruh blocker Attendance, Produksi, penempatan, tarif, atau gaji.
4. Hitung serta periksa hasil pada **Payroll > Simulasi Payroll**.
5. Ajukan, setujui, dan tutup current run melalui **Payroll > Approval & Closing**.
6. Gunakan **Riwayat Payroll**, **Slip Gaji**, atau **Laporan > Payroll Final** sesuai kebutuhan.

Status normal periode adalah:

**Draft -> Calculated -> Approved -> Closed**

Status **Cancelled** hanya dapat berasal dari Draft. Hitung ulang membuat run
baru tanpa menghapus run sebelumnya. Closing menetapkan current run menjadi
**FINAL** dan tidak dapat dibuka kembali.

## Jenis Payroll yang tersedia

| Jenis karyawan | Dasar upah | Frekuensi | Sumber utama |
|---|---|---|---|
| Borongan | Hasil kerja (`PIECE_RATE`) | Rentang fleksibel, maksimal 31 hari | Transaksi Produksi berstatus Tercatat/`POSTED` |
| Harian | Waktu (`TIME_BASED`) | Senin-Minggu | Attendance final Hadir dan tarif harian |
| Training | Waktu (`TIME_BASED`) | Senin-Minggu | Attendance final Hadir dan tarif harian; hasil Produksi hanya informasi |
| Bulanan | Waktu (`TIME_BASED`) | Bulanan sesuai cutoff policy | Gaji pokok, prorata, serta potongan Alpha dan Izin |

## Prinsip yang wajib diingat

- Periode Draft belum menghitung gaji.
- Simulasi menyimpan snapshot. Perubahan sumber setelah simulasi dapat
  mewajibkan hitung ulang.
- Rekening yang belum lengkap merupakan **peringatan**, bukan blocker hak atau
  nominal Payroll. Namun, layar saat ini mengekspor seluruh run sehingga satu
  snapshot rekening yang belum lengkap akan menolak Daftar Pembayaran.
- Neto negatif tetap terlihat pada simulasi, tetapi memblokir pengajuan,
  persetujuan, dan closing.
- Hanya current run `FINAL` pada periode `CLOSED` yang menghasilkan slip resmi
  tanpa penanda **SIMULASI**.
- Status `CLOSED`, file Daftar Pembayaran, dan slip resmi tidak menyatakan dana
  sudah ditransfer atau diterima karyawan.
- Data Payroll final bersifat immutable. Koreksi setelah closing belum tersedia
  pada tahap sistem saat ini.
- Akses site dan izin tindakan selalu diperiksa kembali oleh backend.

## Batas sistem saat ini

Sistem belum menghitung pajak atau BPJS secara otomatis, belum mencatat status
transfer sebagai workflow pembayaran, belum menyimpan PDF slip secara permanen,
dan belum memakai tanda tangan elektronik pada slip. Kebutuhan tersebut tidak
boleh disimpulkan dari status periode atau file keluaran Payroll.

## Urutan baca yang disarankan

1. [Skema Upah dan Tarif](./kbase/payroll/KBASE_SKEMA_UPAH_DAN_TARIF.md)
2. [Periode dan Kesiapan Payroll](./kbase/payroll/KBASE_PERIODE_DAN_KESIAPAN_PAYROLL.md)
3. [Simulasi dan Komponen Payroll](./kbase/payroll/KBASE_SIMULASI_DAN_KOMPONEN_PAYROLL.md)
4. [Approval dan Closing Payroll](./kbase/payroll/KBASE_APPROVAL_DAN_CLOSING_PAYROLL.md)
5. [Riwayat, Ekspor, dan Slip Payroll](./kbase/payroll/KBASE_RIWAYAT_EKSPOR_DAN_SLIP_PAYROLL.md)
