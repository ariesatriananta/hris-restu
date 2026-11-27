# Pemeriksaan refresh Klaten cutoff 26 November 2026

Status: pemeriksaan DB aplikasi read-only; paket SQL disiapkan dan diuji pada MariaDB lokal terisolasi. Belum cleansing/import DB aplikasi.
Owner menyatakan backup selesai dan menyetujui penghapusan data operasional lama.
Master, user, konfigurasi, metadata aset dan sequence tetap dipertahankan.

## Sumber

- File: `docs/excel-source/Database Klaten - 20261126.xlsx`.
- SHA256 versi tersimpan ulang: `23072fdc7ad10b231390dd2ba71c54407d56aefc2042e67c177757dbaf4613da`.
- Hash pemeriksaan awal `bc1493fa589fcb8c9d3084b484f387c70d5854dd205f4e90bd80804ebd4f17a6` berubah setelah Excel disimpan ulang. Owner mengonfirmasi hanya buka/simpan ulang tanpa mengubah isi; jumlah dan mapping diperiksa kembali. Generator menolak hash yang berbeda dari versi terakhir ini.
- DATABASE KARYAWAN: 3.095 record; ID kolom B seluruhnya terisi dan unik.
- REKRUTMEN: 690 record berisi nama; sisa baris terformat tidak menjadi kandidat.
- Semua record bersite Klaten.
- Employee join date: TRAINING memakai J; BORONG memakai K; HARIAN/BULANAN memakai L.

| Status sumber karyawan | Borong | Training | Bulanan | Harian | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| AKTIF | 395 | 123 | 14 | 11 | 543 |
| TIDAK AKTIF | 771 | 1.773 | 0 | 0 | 2.544 |
| RESIGN | 0 | 0 | 2 | 6 | 8 |

## Keputusan Owner setelah pemeriksaan

- 2.544 TIDAK AKTIF tetap pada master karyawan sebagai arsip INACTIVE sesuai sumber baru; tidak dipindahkan ke Rekrutmen. Delapan RESIGN tetap arsip RESIGNED.
- 518 aktif Borong/Training memakai shift 06:00-15:00 Senin-Jumat.
- Jabatan staf mengikuti Excel; master yang belum tersedia disiapkan. Staf tanpa modul tidak dipaksa masuk modul produksi.
- Borong memakai PKWT 12 bulan berantai. Training disamakan durasi 12 bulan berantai, dengan jenis kontrak TRAINING mengikuti kesepakatan jenis sebelumnya; tidak mengubah jenis karyawan menjadi Borong.
- Tiga staf dengan hubungan kerja PKWTT mengikuti sumber. Sebanyak 22 staf dengan hubungan kerja kosong memakai PKWT.
- Dua belas kandidat dengan NIK cocok karyawan AKTIF ditahan dari import, disertakan dalam daftar review berbasis nomor baris. Target kandidat sebelum validasi lain: 678, bukan 690.
- Tanggal arsip kosong/bertentangan dipertahankan dalam snapshot sumber; tidak mengarang tanggal agar lolos constraint. Nilai operasional yang tidak dapat direpresentasikan secara valid disimpan NULL dengan alasan pemetaan yang tercatat.
- Baseline penempatan, shift dan pekerjaan: 23 November 2026. Seluruh 543 aktif termasuk 25 staf menggunakan 06:00-15:00 Senin-Jumat.
- Tanggal join tetap sesuai fase/kolom sumber, termasuk join setelah baseline. Periode kontrak ditentukan terhadap cutoff 26 November agar kontrak pegawai yang baru join setelah tanggal 23 tetap dapat dibentuk; baseline penugasan tidak mengganti join date.

## Catatan pemeriksaan awal

1. Semua 2.544 TIDAK AKTIF memiliki ID yang pada Excel sebelumnya berstatus RESIGN. Owner memilih INACTIVE sesuai sumber baru; keputusan NON AKTIF sumber lama (calon belum bekerja) tidak diterapkan pada label baru.
2. Owner memilih baseline efektif shift/pekerjaan 23 November 2026, terpisah dari cutoff 26 November.
3. Ada 518 aktif produksi (395 Borong + 123 Training), bermodul A-E. Shift 06:00-15:00 Senin-Jumat telah disetujui untuk kelompok ini.
4. Ada 25 aktif non-Borong/Training (14 Bulanan + 11 Harian), tanpa modul. Departemen sumber Produksi SKT dipetakan ke Produksi; variasi Kantor & Umum/Kantor dan Umum disatukan sebagai Kantor & Umum. Jabatan mengikuti Excel dan dibuatkan master yang diperlukan. Shift 06:00-15:00 Senin-Jumat telah disetujui; tidak ada penugasan pekerjaan produksi bagi staf ini.
5. Kontrak Borong dan Training disetujui berdurasi 12 bulan berantai. Tiga aktif Bulanan eksplisit PKWTT; 22 staf lainnya disetujui PKWT.
6. Rekrutmen memiliki 28 kelompok NIK duplikat dan 77 baris dengan NIK juga ditemukan pada sheet karyawan. Dua belas baris cocok dengan karyawan AKTIF: 4, 10, 11, 86, 179, 298, 317, 348, 402, 498, 499, 643. Jangan merge/hapus identitas berdasarkan nama saja.

## Kualitas data arsip

- Dua karyawan RESIGN Harian tidak mempunyai tanggal join di J/K/L: baris 3090 dan 3094. Pertahankan unknown sebagai NULL jika disetujui; bukan tanggal import.
- Training setelah Borong: baris 983 dan 1157, keduanya TIDAK AKTIF. Constraint fase tanggal melarang pasangan ini; perlu koreksi sumber atau persetujuan menyimpan nilai konflik hanya pada snapshot asal.
- Join terpilih setelah end date: 24 baris, seluruhnya perlu review sebelum membentuk riwayat otomatis: 30, 139, 141, 213, 221, 987, 988, 993, 995, 1007, 1009, 1021, 1027, 1037, 1039, 1043, 1057, 1064, 1069, 1071, 1083, 1090, 1141, 1155.
- Seluruh 543 aktif memiliki join date terpilih dan NIK valid 16 digit, tanpa duplikat NIK antarkaryawan aktif.
- Pemeriksaan generator menemukan satu gender kosong pada baris 3096 (aktif, Quality in-line packer). Owner mengonfirmasi Perempuan; generator menerapkan FEMALE hanya pada baris/hash sumber ini dan mencatat approvedOverrides pada provenance. Nilai sumber asli tetap kosong dalam snapshot.
- Ada NIK kosong/tidak valid dan duplikat pada arsip; simpan sumber utuh, jangan mengarang nomor identitas.
- Karyawan: 2.722 tautan KTP, 2.721 KK. Rekrutmen: masing-masing 623 KTP/KK. Tautan Drive tetap eksternal, tanpa migrasi fisik R2.
- Setelah 12 kandidat ditahan: 678 kandidat, 612 KTP + 612 KK = 1.224 tautan. Ada 79 NIK operasional menjadi NULL (14 tidak valid dan 65 anggota kelompok duplikat), serta 82 KK tidak valid menjadi NULL; data asli tetap dalam snapshot.
- ID numerik staf pada kolom B harus dipertahankan sebagai teks, termasuk leading zero; jangan diganti helper ID kolom AS.

## Snapshot DB sebelum refresh

- 3.003 karyawan, 722 kandidat, 5.199 dokumen karyawan, 1.436 dokumen kandidat.
- 585 kontrak dan 585 lifecycle event; masing-masing 395 histori employment, shift, pekerjaan.
- Satu attendance terbuka tanggal operasional 23 November 2026 dan satu scan event. Termasuk scope reset operasional yang disetujui Owner; belum dihapus.
- Produksi/payroll kosong. Tidak ada cron RUNNING pada pemeriksaan.
- 11 audit log dan 120 cron log; usulan dipertahankan dengan marker refresh baru.
- Seluruh dokumen karyawan/kandidat yang sekarang tersimpan menggunakan sumber Drive. Satu metadata `files` tetap dipertahankan.

## Persiapan implementasi

- Buat SQL refresh baru dengan PREVIEW/EXECUTE, guard database/sumber, pemeriksaan FK, transaksi dan verifikasi jumlah. Jangan menjalankan ulang cleansing demo 22 November begitu saja.
- Dukungan arsip karyawan dan kandidat legacy saat ini mengenali hash/struktur sumber lama. Tambahkan provenance sumber baru yang tervalidasi; jangan memalsukan hash lama.
- Pertahankan master/config/users/aset dan sequence; rekonsiliasi nomor sumber tanpa menurunkan sequence.
- Seluruh keputusan disepakati. Artifact karyawan berhasil digenerate: 3.095 karyawan, 760 kontrak (543 aktif/217 expired), 543 shift/employment, 518 pekerjaan utama, 5.443 dokumen Drive. Artifact Rekrutmen: 678 NEW dan 1.224 dokumen.
- Rehearsal payload aktual kedua artifact lolos pada MariaDB lokal terisolasi, termasuk preview, commit, replay, provenance dan override gender; dataset rehearsal dibuang setelah tes. Tidak ada perubahan pada DB aplikasi. Lihat runbook `EMPLOYEE_KLATEN_REFRESH_RUNBOOK_20261127.md`.
