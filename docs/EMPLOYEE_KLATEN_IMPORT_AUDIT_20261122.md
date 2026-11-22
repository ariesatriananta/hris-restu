# Audit persiapan import Klaten

Sumber: `docs/excel-source/DATABASE RSIA KLT 22.11.2026 - soft.xlsx`, Sheet1.
Pemeriksaan Excel dan database dilakukan read-only. Tidak ada import, perubahan
master, kontrak, assignment atau data pribadi yang dijalankan oleh agen.
Laporan hanya berisi agregat; identitas pribadi tidak dicetak.

## Keputusan yang sudah dikunci

- Import seluruh 3.725 karyawan. Hanya 395 aktif eligible untuk operasional;
  722 nonaktif dan 2.608 resign menjadi arsip.
- Employee ID/barcode berasal dari kolom B; kolom AQ diabaikan.
- Ada 3.040 ID terisi, semuanya sesuai pola generator dan tidak duplikat.
  Sebanyak 685 ID kosong memakai namespace arsip `LEG-KLT-...` yang terpisah.
- Jenis: BORONG -> BORONGAN; TRAINING tetap TRAINING; 685 jenis kosong
  menggunakan master khusus LEGACY_UNKNOWN dengan label `-`, tersembunyi dari
  pilihan operasional. Master ini belum dibuat pada tahap audit.
- join_date: Borong memakai tanggal borong, Training memakai tanggal training.
  Kedua tanggal sumber tetap disimpan. Tanggal kosong pada 685 arsip tetap NULL.
- Migration nullable join_date sudah terlihat berlaku pada DB target.

## Karyawan aktif dan master

Semua 395 aktif merupakan Borong. Tidak ada Training aktif.

| Bagian | Aktif | Pekerjaan utama |
| --- | ---: | --- |
| Linting | 239 | BORONGAN-LINTING |
| Batil | 64 | BORONGAN-BATIL |
| Packing | 67 | BORONGAN-PACKING |
| Slop | 5 | BORONGAN-SLOP |
| Kemas 1 | 8 | BORONGAN-KEMAS1 |
| Kemas 2 | 12 | BORONGAN-KEMAS2 |

Modul A 121, B 106, C 51, D 40, E 77. Seluruh pasangan modul/bagian aktif
memiliki mapping master aktif di Klaten. Seluruh enam pekerjaan mempunyai
tarif aktif saat audit; semua satuannya PCS. Prefix Employee ID Klaten saat ini SLO.

Shift Klaten yang tersedia: `BORONGAN_DEFAULT`, nama Shift Borongan,
06:00-15:00, toleransi masuk/pulang masing-masing 15 menit, aktif.
Hari kerja per minggu disimpan pada assignment, bukan di master shifts.
Excel tidak menyediakan hari kerja/jam/assignment shift.

## Blocker tanggal yang harus diperbaiki sebelum SQL import

Seluruh 395 aktif mempunyai tanggal training lebih awal daripada tanggal borong.
Tanggal borong aktif berkisar 22 Februari 2025 sampai 21 November 2026.

Constraint DB `chk_employees_training_join_date` masih mensyaratkan tanggal
training >= join_date. Zod registrasi/edit, pengecekan edit dan koreksi
registrasi juga memakai asumsi tersebut. Jika join_date dipilih dari tanggal
borong sesuai keputusan Owner, semua 395 aktif akan menabrak asumsi lama ini.
Migration nullable saja tidak mengubah constraint tersebut.

Rencana: selaraskan aturan fase Training -> Borong dengan makna join_date
yang disepakati; tanggal tetap wajib untuk input biasa. Jangan mematikan
CHECK/validasi atau menghilangkan tanggal training demi melewati import.

## Nomor karyawan dan sequence

Tanggal dalam ID lama berbeda dari join_date yang dipilih pada 449 orang,
termasuk seluruh 395 aktif. ID tetap dipertahankan sesuai keputusan Owner.
Dari 3.040 ID terisi, 2.977 cocok dengan tanggal training dan 63 tidak cocok;
ini bukan alasan untuk mengganti nomor historis.

Generator sekarang memeriksa maksimum suffix berdasarkan current_site_id dan
join_date sekaligus. Karena nomor historis tidak selalu mengikuti join_date
saat ini, import harus merekonsiliasi employee_number_sequences berdasarkan
prefix dan tanggal YANG DIKODEKAN DALAM ID, bukan hanya join_date pilihan.
ID legacy terpisah tidak mengambil slot generator normal. Perlu simulasi
reservasi nomor baru dan pemeriksaan uniqueness sebelum dinyatakan siap.

## NIK dan data arsip

- Ada 252 kelompok NIK berulang, melibatkan 533 baris (281 kemunculan berlebih).
- Sebanyak 66 kelompok juga memuat karyawan aktif. Tidak ada kelompok dengan
  lebih dari satu karyawan aktif; sumber aktif berada sebelum arsip di Excel.
- Ada 40 NIK tidak berformat 16 digit dan 26 kosong, seluruhnya pada arsip.
- Tidak ditemukan email duplikat dari nilai yang terisi.
- Database mempertahankan unique constraint national_id_number. Jangan dilepas
  hanya untuk menampung sumber legacy.
- Usulan yang perlu persetujuan: simpan sumber NIK pada catatan legacy; gunakan
  field NIK utama untuk record aktif pada kelompok campuran. Pada kelompok
  arsip-saja yang berkonflik, kosongkan field NIK utama dan pertahankan seluruh
  nilai mentah pada catatan masing-masing, tanpa menebak orang yang benar.
  NIK invalid arsip juga disimpan mentah pada catatan, field utama NULL.
- Ada 22 arsip resign bagian `KEMAS` tanpa penjelasan 1/2. Pertahankan teks
  sumber pada catatan; jangan otomatis menetapkan KEMAS1 atau KEMAS2. Jika
  mapping bagian tidak diketahui, jangan membuat assignment pekerjaan palsu.
- 685 arsip juga tidak memiliki modul/bagian. Tidak dibuatkan assignment
  shift/pekerjaan ataupun histori bertanggal karangan.

## Kontrak dan baseline operasional

Seluruh 3.725 kolom HUBUNGAN KERJA kosong. Excel tidak memberi jenis, nomor,
tanggal mulai/akhir kontrak yang dapat dijadikan sumber. END DATE pada baris
resign tidak otomatis berarti tanggal akhir kontrak.

Master contract_types tersedia: TRAINING, PKWT, PKWTT, PROJECT, RETAIN, OTHER.
Tidak boleh menyimpulkan kontrak PKWT/PKWTT atau masa berlakunya dari status Borong.
Perlu keputusan Owner/client sebelum membuat kontrak operasional.

Usulan baseline untuk current placement, shift dan pekerjaan: tanggal awal
pilot yang disepakati, bukan menganggap modul/pekerjaan sekarang sudah sama
sejak join_date. Status pekerjaan utama satu per orang, mengikuti bagian.
Assignment tambahan tidak dibuat tanpa kebutuhan yang dikonfirmasi.

279 karyawan aktif memiliki tanggal borong sebelum 1 Juli 2026. Tarif untuk
empat pekerjaan utama baru tersedia sejak 1 Juli 2026, sedangkan Kemas 1/2 sejak
1 Maret 2026. Maka membuat onboarding/assignment serentak mundur ke semua
tanggal borong bisa menabrak kelengkapan tarif dan mengarang histori.

Scanner Attendance memeriksa status/current site dan assignment shift efektif.
Scanner Produksi memeriksa histori employment efektif, jenis/status/site,
assignment pekerjaan/tarif serta aturan Attendance. Dua jalur scanner tidak
langsung mensyaratkan record kontrak aktif, tetapi workflow onboarding dan
lifecycle kontrak memiliki aturan terpisah. Menunda kontrak harus merupakan
keputusan eksplisit, bukan membuat kontrak fiktif agar indikator onboarding hijau.

## Keputusan akhir Owner — 23 November 2026

Bagian audit di atas mencatat temuan sebelum kuncian, bukan status pekerjaan terbaru.

1. Seluruh 395 aktif menggunakan Shift Borongan 06:00-15:00, Senin-Jumat,
   efektif 23 November 2026; akhir pekan tetap bisa scan melalui aturan non-workday.
2. Untuk aktif, rekonstruksi PKWT berantai 12 bulan dari join_date, akhir sehari
   sebelum awal kontrak selanjutnya. Kontrak sebelumnya EXPIRED, yang mencakup
   baseline ACTIVE. Training memakai TRAINING jika ada yang aktif; pada sumber ini
   tidak ada. Tidak membuat kontrak untuk arsip nonaktif/resign.
3. Owner menerima prioritas NIK aktif dan penyimpanan nilai sumber pada notes
   legacy untuk konflik/invalid arsip. Seluruh orang tetap diimport.
4. Satu pekerjaan utama sesuai bagian, penempatan/shift/pekerjaan mulai baseline,
   tanpa tanggal akhir. Pair dipilih pada transaksi, bukan pasangan permanen.

Implementasi dan SQL hasil generate: lihat [runbook](EMPLOYEE_KLATEN_IMPORT_RUNBOOK.md).
Payload pribadi ada di artifacts yang diabaikan Git. Hasil: 3.725 karyawan,
395 aktif, 585 kontrak (395 ACTIVE + 190 EXPIRED), masing-masing 395 assignment
shift/pekerjaan dan snapshot employment. Belum dieksekusi pada DB aplikasi.
