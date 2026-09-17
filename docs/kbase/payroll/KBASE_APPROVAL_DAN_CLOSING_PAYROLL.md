# Knowledge Base - Persetujuan dan Penutupan Payroll

> Modul: Payroll
>
> Bagian: Proses Payroll - Persetujuan & penutupan
>
> Audiens: Payroll Finance, Direksi, Super Admin, dan auditor internal
>
> Terakhir diverifikasi: 17 September 2026

Panduan ini menjelaskan pengajuan, penarikan, persetujuan, penolakan, dan
penutupan hasil perhitungan terbaru melalui **Payroll > Proses Payroll >
Persetujuan & penutupan**. Pilihan periode dibawa otomatis dari tahap sebelumnya.

## 1. Alur dan pemisahan tugas

| Tahap | Tindakan | Pelaksana umum |
|---|---|---|
| Siap diajukan | Ajukan Payroll | Payroll Finance atau pengguna dengan hak hitung |
| Menunggu keputusan | Setujui/Tolak | Direksi atau pengguna dengan hak approval |
| Menunggu keputusan | Tarik pengajuan | Payroll Finance atau pengguna dengan hak hitung |
| Disetujui | Tutup periode | Payroll Finance/pengguna dengan hak closing |

Pengguna biasa tidak boleh menyetujui hasil yang dihitung atau diajukannya sendiri.
**Super Admin** boleh melakukan self-approval untuk recovery, tetapi tindakan itu
ditandai sebagai override pada audit trail.

## 2. Sebelum mengajukan

Pastikan:

- periode berstatus `CALCULATED`;
- perhitungan terbaru berstatus `COMPLETED` dan merupakan hasil yang ingin disahkan;
- hasil tidak kosong dan neto tidak negatif;
- kesiapan dan integritas hasil tidak memiliki masalah yang menghalangi proses;
- perubahan sumber sudah diikuti Hitung ulang;
- peringatan telah diperiksa.

Halaman detail menampilkan ringkasan periode, perhitungan, jumlah karyawan, nominal,
hasil pemeriksaan integritas, serta histori tindakan.

## 3. Membaca panel Langkah berikutnya

Panel **Langkah berikutnya** menampilkan satu tindakan utama sesuai status,
integritas, dan hak akses akun. Urutannya: **Hitung Payroll** → **Ajukan
Payroll** → **Setujui Payroll** → **Tutup periode** → **Lihat slip gaji**.

Jika akun belum berhak bertindak, panel menjelaskan pihak yang perlu
melanjutkan. **Tolak pengajuan** dan **Tarik pengajuan** tersedia di menu
**Tindakan lain** ketika diizinkan. Jika data berubah selama pengajuan Pending,
tindakan korektif yang diizinkan tampil sebagai tombol utama terlebih dahulu;
pengajuan harus diselesaikan sebelum hasil bisa dihitung ulang.

## 4. Mengajukan Payroll

1. Gunakan filter **Siap diajukan** atau cari periode yang sudah dihitung.
2. Buka detail periode.
3. Periksa nomor perhitungan terbaru dan ringkasan nominal.
4. Pastikan panel integritas tidak meminta Hitung ulang.
5. Klik **Ajukan Payroll**.
6. Periksa dialog konfirmasi lalu klik **Ajukan Payroll**.

Periode tetap `CALCULATED` selama pengajuan berstatus Pending. Approval menunjuk
perhitungan tertentu; hasil lama dalam periode yang sama tidak ikut diajukan.

## 5. Rekening belum lengkap bukan penghalang persetujuan

Pesan **Snapshot rekening pembayaran belum lengkap** ditampilkan sebagai
peringatan. Kondisi ini:

- tidak mengubah hak upah atau nominal karyawan;
- tidak memblokir submit, approval, atau closing;
- membuat Daftar Pembayaran ditolak bila snapshot nama bank, nomor rekening,
  atau nama pemilik rekening salah satu karyawan belum lengkap, karena layar
  saat ini mengekspor seluruh hasil run.

Jika file pembayaran diperlukan, pilihan paling aman adalah melengkapi rekening,
kembali ke tahap **Perhitungan**, dan Hitung ulang sebelum mengajukan atau menutup periode.
Setelah periode Closed, snapshot final tidak dapat dihitung ulang.

## 6. Menyetujui pengajuan

1. Buka antrean pengajuan Pending.
2. Buka detail dan cocokkan site, periode, perhitungan, populasi, serta nominal.
3. Periksa peringatan dan histori tindakan.
4. Klik **Setujui Payroll**.
5. Konfirmasi keputusan.

Persetujuan mengubah status periode menjadi `APPROVED`. Persetujuan belum
menetapkan hasil sebagai FINAL dan belum menerbitkan slip resmi.

## 7. Menolak pengajuan

Pilih **Tindakan lain > Tolak pengajuan** jika sumber, komponen, populasi, atau
nominal belum benar. Jika integritas berubah dan akun berhak menolak, tombol
utama menjadi **Tolak untuk diperbaiki**. Alasan penolakan wajib diisi.

Hasil yang ditolak tidak diajukan ulang secara langsung. Payroll Finance harus:

1. memperbaiki sumber atau komponen;
2. menjalankan Hitung ulang;
3. memeriksa hasil baru;
4. mengajukan perhitungan terbaru.

Aturan ini mempertahankan jejak run dan keputusan lama.

## 8. Menarik pengajuan

Pengajuan Pending dapat ditarik oleh pengguna yang berwenang menghitung Payroll.

1. Buka detail pengajuan.
2. Klik **Tindakan lain > Tarik pengajuan**. Jika integritas berubah dan akun
   berhak menarik, gunakan tombol utama **Tarik untuk diperbaiki**.
3. Isi alasan minimal lima karakter.
4. Konfirmasi penarikan.

Setelah ditarik, hasil tersebut tidak diajukan ulang. Jalankan Hitung ulang dan
ajukan hasil baru.

## 9. Menutup periode

Closing hanya tersedia jika:

- periode berstatus `APPROVED`;
- persetujuan perhitungan terbaru berstatus Approved;
- perhitungan terbaru masih `COMPLETED` dan konsisten;
- pengguna memiliki hak closing;
- profil perusahaan memiliki nama dan alamat yang diperlukan untuk slip resmi.

Langkah closing:

1. Periksa kembali site, periode, nomor perhitungan, jumlah karyawan, dan neto.
2. Pastikan tidak ada perubahan sumber atau blocker baru.
3. Klik **Tutup periode**.
4. Baca peringatan permanen.
5. Klik **Tutup Permanen**.

Dalam satu transaksi sistem akan mengubah periode menjadi `CLOSED`, mengubah
perhitungan terbaru dari `SIMULATION` menjadi `FINAL`, dan menyimpan salinan profil
perusahaan untuk slip resmi.

## 10. Dampak penutupan

Setelah closing:

- perhitungan terbaru menjadi satu-satunya hasil FINAL untuk periode tersebut;
- perhitungan lama tetap berjenis Simulasi;
- slip dari hasil FINAL dapat diterbitkan tanpa penanda SIMULASI;
- Daftar Pembayaran tersedia sesuai izin dan kelengkapan rekening;
- data final dapat muncul pada Laporan Payroll Final;
- periode tidak dapat diedit atau dihitung ulang melalui alur normal;
- sumber Attendance dan Produksi terkait tetap terkunci sesuai aturan Payroll.

Closing **tidak berarti** dana sudah ditransfer atau diterima karyawan. Sistem
saat ini belum memiliki workflow status pembayaran.

Super Admin memiliki tindakan terpisah **Reset & hapus periode** di detail
periode, termasuk pada periode Ditutup. Tindakan itu menghapus periode beserta
hasil Payroll turunannya agar bisa dibuat ulang; bukan pembukaan ulang hasil
resmi secara diam-diam. Gunakan hanya bila memang perlu memulai dari awal.

## 11. Perubahan sumber setelah perhitungan

Sistem memeriksa ulang konsistensi sebelum submit, approval, dan closing. Tindakan
dapat diblokir jika berubah:

- transaksi atau total Produksi;
- Attendance, shift, atau kalender;
- tarif harian atau gaji pokok;
- policy periode;
- komponen Payroll;
- populasi atau rekening;
- total run terhadap hasil per karyawan.

Jika panel menampilkan **Perlu hitung ulang**, kembali ke tahap Perhitungan.
Namun, jika pengajuan masih Pending, tolak atau tarik terlebih dahulu sesuai
hak akses. Jika periode sudah Disetujui dan integritas berubah, panel mengarahkan
ke detail periode untuk ditinjau; jangan menganggap tombol Hitung ulang selalu
tersedia pada status itu.

## 12. Histori tindakan

Histori menyimpan siapa dan kapan melakukan:

- Submit;
- Withdraw;
- Approve;
- Reject;
- Close.

Alasan penarikan atau penolakan dan penanda Super Admin override ikut disimpan.
Gunakan histori ini saat memeriksa perubahan keputusan, bukan catatan di luar
sistem saja.

## 13. Jika tombol tidak tersedia

| Tombol | Penyebab umum tidak tersedia |
|---|---|
| Ajukan Payroll | Bukan perhitungan terbaru yang selesai, integritas tidak valid, sudah ada pengajuan, atau tidak memiliki hak hitung. |
| Tarik pengajuan | Pengajuan tidak Pending atau tidak memiliki hak hitung; periksa menu Tindakan lain. |
| Setujui Payroll | Tidak memiliki hak persetujuan, pemisahan tugas gagal, atau integritas tidak valid. |
| Tolak pengajuan | Pengajuan tidak Pending atau tidak memiliki hak persetujuan; periksa menu Tindakan lain. |
| Tutup periode | Periode belum Approved, approval bukan Approved, run/integritas invalid, atau tidak memiliki hak closing. |

Jika tidak ada tindakan yang tersedia, baca status periode, status approval,
panel integritas, dan hak akses akun secara bersamaan. Jika closing menyebut
profil perusahaan belum lengkap, lengkapi nama dan alamat pada **Administrasi
Sistem > Pengaturan**, lalu ulangi closing.

## 14. Checklist penutupan

- [ ] Periode, site, jenis Payroll, dan perhitungan terbaru benar.
- [ ] Persetujuan menunjuk perhitungan terbaru yang sama.
- [ ] Tidak ada neto negatif atau blocker integritas.
- [ ] Peringatan rekening sudah diputuskan tindak lanjutnya.
- [ ] Profil perusahaan memuat nama dan alamat.
- [ ] Rekap dan beberapa detail karyawan sudah diverifikasi.
- [ ] Pengguna memahami closing permanen dan bukan status pembayaran.

## 15. Navigasi KBase Payroll

- Kembali ke [Indeks Payroll](../../KBASE_PAYROLL.md).
- Sebelumnya: [Perhitungan dan Komponen Payroll](./KBASE_SIMULASI_DAN_KOMPONEN_PAYROLL.md).
- Lanjut ke [Riwayat, Ekspor, dan Slip Payroll](./KBASE_RIWAYAT_EKSPOR_DAN_SLIP_PAYROLL.md).
