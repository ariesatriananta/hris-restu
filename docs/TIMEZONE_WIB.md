# Waktu UTC dan tanggal operasional WIB

Keputusan Owner 23 November 2026: timestamp sistem UTC; tampilan dan hari
operasional Asia/Jakarta. Hostinger boleh tetap memakai OS timezone UTC.

## Penyebab dan bukti

- Koneksi lama memakai `mysql.createPool(DATABASE_URL)` tanpa timezone driver
  atau session SQL. DB yang dibaca mempunyai system timezone UTC dan session
  SYSTEM. Pada 22 November 20.05 UTC, waktu bisnis sudah 23 November 03.05 WIB.
- Status penugasan Produksi memakai `CURDATE()`. Penugasan mulai 23 November
  menjadi UPCOMING selama tujuh jam pertama tanggal 23 WIB.
- Penugasan UID karyawan yang dilaporkan dibaca read-only: effective_from
  2026-11-23, effective_to NULL, status tersimpan ACTIVE. Query WIB menghasilkan
  ACTIVE. Tanggal SQL import benar; tidak perlu mengulang import.
- Rekrutmen mengirim tanggal/jam tanpa offset. Audit dan beberapa metadata
  lain memberi label +07:00 pada DATETIME yang ditulis session UTC. Frontend
  sebagian mengandalkan timezone browser. Ketiganya menyebabkan tampilan salah.

## Kontrak data

| Data | Penyimpanan / respons | Pemakaian |
| --- | --- | --- |
| Timestamp teknis: audit, rekrutmen, approval, revisi, cron, created/updated | DATETIME UTC; API ISO dengan Z | UI dan export memakai WIB |
| Token updatedAt Rekrutmen | String mentah enam digit pecahan, tanpa konversi | Opaque optimistic-lock token, bukan waktu tampilan |
| DATE: join, kontrak, penugasan, business_date | YYYY-MM-DD, tidak ditambah/dikurangi jam | Kalender bisnis WIB |
| TIME shift | HH:mm:ss, tidak digeser | Jadwal lokal WIB |
| Clock Attendance, scan event dan transaction_at Produksi | Kontrak wall-clock WIB lama dipertahankan; API +07:00 | Perhitungan kerja tetap WIB; bukan timestamp teknis UTC |
| asOf pembanding shift/finalisasi | Wall-clock WIB eksplisit | Jangan dibandingkan dengan NOW UTC mentah |

Kontrak operasional lama tidak dikonversi massal menjadi UTC pada patch ini,
agar jam scan, histori, business_date dan perhitungan upah tidak berubah.

- Pool menetapkan driver `timezone=Z` dan session `time_zone='+00:00'` pada
  setiap koneksi baru. Gagal inisialisasi menutup koneksi tersebut.
- Status tanggal menggunakan UTC_TIMESTAMP yang dikonversi eksplisit ke WIB.
- Filter audit/rekrutmen 23 November adalah rentang UTC 22 November 17.00
  sampai sebelum 23 November 17.00. Kolom sumber tidak dibungkus fungsi agar
  indeks tanggal tetap dapat digunakan.
- Respons finalisasi langsung juga membawa offset/UTC; tidak mengirim jam WIB
  tanpa penanda timezone. last_seen_at perangkat baru ditulis UTC pada kedua
  terminal; nilai lama yang campuran tidak digeser tanpa verifikasi sumber.

## Verifikasi dan rollout

- Suite API: 131 file lulus, 1 dilewati; 1.349 tes lulus, 2 dilewati.
- Tes formatter frontend dengan TZ=UTC: 7 tes lulus. UTC dan offset +07
  untuk instant yang sama harus menampilkan hari/jam WIB yang sama.
- SQL clock terminal asli dijalankan hanya sebagai SELECT dengan clock tetap:
  UTC 22 Nov 16:59:59 menjadi WIB 22 Nov 23:59:59; UTC 17:00 menjadi WIB
  23 Nov 00:00; UTC 20:00 menjadi WIB 23 Nov 03:00.
- DB aplikasi hanya dibaca. Tidak menjalankan scan, cron, aktivasi, import,
  simulasi Payroll, ALTER atau UPDATE data sebagai pengujian.
- Deploy API dan frontend bersama, kemudian restart proses API dan refresh
  browser. Tidak perlu mengganti timezone OS/setting global DB atau env baru.
- Cek detail karyawan: penugasan mulai 23 November harus Aktif saat 23 November
  WIB. Cek tabel/detail Rekrutmen dan Audit Trail; filter harinya harus sama
  dengan tanggal WIB yang ditampilkan. Export audit memakai jam berlabel WIB.

## Batasan histori

DATETIME tidak menyimpan asal timezone. Timestamp default dari session UTC
dibaca UTC. Beberapa SQL maintenance/import Owner lama memakai
`SET time_zone='+07:00'`; metadata yang dihasilkan script tersebut bisa berisi
wall-clock WIB, misalnya marker audit import. Jangan mengurangi/menambah tujuh
jam ke seluruh tabel: baris yang benar akan ikut rusak.

Patch tidak mengubah timestamp historis. Jika marker maintenance lama perlu
dirapikan, scope harus berdasarkan UID/sumber script yang diketahui, dengan
preview dan SQL Owner terpisah. Tanggal efektif import tidak terpengaruh.
