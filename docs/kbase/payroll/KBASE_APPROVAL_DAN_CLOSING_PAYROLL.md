# Knowledge Base - Approval dan Closing Payroll

> Modul: Payroll
>
> Bagian: Approval & Closing
>
> Audiens: Payroll Finance, Direksi, Super Admin, dan auditor internal
>
> Terakhir diverifikasi: 7 September 2026

Panduan ini menjelaskan pengajuan, penarikan, persetujuan, penolakan, dan closing
current run melalui **Payroll > Approval & Closing**.

## 1. Alur dan pemisahan tugas

| Tahap | Tindakan | Pelaksana umum |
|---|---|---|
| Calculated | Ajukan | Payroll Finance atau pengguna dengan hak hitung |
| Menunggu keputusan | Setujui/Tolak | Direksi atau pengguna dengan hak approval |
| Menunggu keputusan | Tarik pengajuan | Payroll Finance atau pengguna dengan hak hitung |
| Approved | Tutup periode | Payroll Finance/pengguna dengan hak closing |

Pengguna biasa tidak boleh menyetujui run yang dihitung atau diajukannya sendiri.
**Super Admin** boleh melakukan self-approval untuk recovery, tetapi tindakan itu
ditandai sebagai override pada audit trail.

## 2. Sebelum mengajukan

Pastikan:

- periode berstatus `CALCULATED`;
- current run berstatus `COMPLETED`;
- current run adalah hasil terbaru yang ingin disahkan;
- hasil tidak kosong dan neto tidak negatif;
- readiness dan integritas snapshot tidak memiliki blocker;
- perubahan sumber sudah diikuti Hitung ulang;
- peringatan telah diperiksa.

Halaman detail menampilkan ringkasan periode, run, jumlah karyawan, nominal,
hasil pemeriksaan integritas, serta histori tindakan.

## 3. Mengajukan Payroll

1. Gunakan filter **Siap diajukan** atau cari periode yang berstatus Calculated.
2. Buka detail periode.
3. Periksa nomor current run dan ringkasan nominal.
4. Pastikan panel integritas tidak meminta Hitung ulang.
5. Klik **Ajukan**.
6. Periksa dialog konfirmasi lalu klik **Ajukan Payroll**.

Periode tetap `CALCULATED` selama pengajuan berstatus Pending. Approval menunjuk
run tertentu; run lain dalam periode yang sama tidak ikut diajukan.

## 4. Rekening belum lengkap bukan blocker approval

Pesan **Snapshot rekening pembayaran belum lengkap** ditampilkan sebagai
peringatan. Kondisi ini:

- tidak mengubah hak upah atau nominal karyawan;
- tidak memblokir submit, approval, atau closing;
- membuat Daftar Pembayaran ditolak bila snapshot nama bank, nomor rekening,
  atau nama pemilik rekening salah satu karyawan belum lengkap, karena layar
  saat ini mengekspor seluruh hasil run.

Jika file pembayaran diperlukan, pilihan paling aman adalah melengkapi rekening,
kembali ke Simulasi Payroll, dan Hitung ulang sebelum mengajukan atau closing.
Setelah periode Closed, snapshot final tidak dapat dihitung ulang.

## 5. Menyetujui pengajuan

1. Buka antrean pengajuan Pending.
2. Buka detail dan cocokkan site, periode, run, populasi, serta nominal.
3. Periksa peringatan dan histori tindakan.
4. Klik **Setujui**.
5. Konfirmasi keputusan.

Persetujuan mengubah status periode menjadi `APPROVED`. Persetujuan tidak
mengubah run menjadi FINAL dan belum menerbitkan slip resmi.

## 6. Menolak pengajuan

Pilih **Tolak** jika sumber, komponen, populasi, atau nominal belum benar. Alasan
penolakan wajib diisi dengan jelas.

Run yang ditolak tidak diajukan ulang secara langsung. Payroll Finance harus:

1. memperbaiki sumber atau komponen;
2. menjalankan Hitung ulang;
3. memeriksa run baru;
4. mengajukan current run baru.

Aturan ini mempertahankan jejak run dan keputusan lama.

## 7. Menarik pengajuan

Pengajuan Pending dapat ditarik oleh pengguna yang berwenang menghitung Payroll.

1. Buka detail pengajuan.
2. Klik **Tarik pengajuan**.
3. Isi alasan minimal lima karakter.
4. Konfirmasi penarikan.

Setelah ditarik, run tersebut tidak diajukan ulang. Jalankan Hitung ulang dan
ajukan run baru.

## 8. Melakukan closing

Closing hanya tersedia jika:

- periode berstatus `APPROVED`;
- approval current run berstatus Approved;
- current run masih `COMPLETED` dan konsisten;
- pengguna memiliki hak closing;
- profil perusahaan memiliki nama dan alamat yang diperlukan untuk slip resmi.

Langkah closing:

1. Periksa kembali site, periode, nomor run, jumlah karyawan, dan neto.
2. Pastikan tidak ada perubahan sumber atau blocker baru.
3. Klik **Tutup periode**.
4. Baca peringatan permanen.
5. Klik **Tutup Permanen**.

Dalam satu transaksi sistem akan mengubah periode menjadi `CLOSED`, mengubah
current run dari `SIMULATION` menjadi `FINAL`, dan menyimpan snapshot profil
perusahaan untuk slip resmi.

## 9. Dampak closing

Setelah closing:

- current run menjadi satu-satunya run FINAL untuk periode tersebut;
- run lama tetap berjenis Simulasi;
- slip current run dapat diterbitkan tanpa watermark SIMULASI;
- Daftar Pembayaran tersedia sesuai izin dan kelengkapan rekening;
- data final dapat muncul pada Laporan Payroll Final;
- periode tidak dapat dibuka kembali atau dihitung ulang;
- sumber Attendance dan Produksi terkait tetap terkunci sesuai aturan Payroll.

Closing **tidak berarti** dana sudah ditransfer atau diterima karyawan. Sistem
saat ini belum memiliki workflow status pembayaran.

## 10. Perubahan sumber setelah simulasi

Sistem memeriksa ulang konsistensi sebelum submit, approval, dan closing. Tindakan
dapat diblokir jika berubah:

- transaksi atau total Produksi;
- Attendance, shift, atau kalender;
- tarif harian atau gaji pokok;
- policy periode;
- komponen Payroll;
- populasi atau rekening;
- total run terhadap hasil per karyawan.

Jika panel menampilkan **Perlu hitung ulang**, kembali ke Simulasi Payroll. Jangan
memaksa melanjutkan dengan run lama.

## 11. Histori tindakan

Histori menyimpan siapa dan kapan melakukan:

- Submit;
- Withdraw;
- Approve;
- Reject;
- Close.

Alasan penarikan atau penolakan dan penanda Super Admin override ikut disimpan.
Gunakan histori ini saat memeriksa perubahan keputusan, bukan catatan di luar
sistem saja.

## 12. Jika tombol tidak tersedia

| Tombol | Penyebab umum tidak tersedia |
|---|---|
| Ajukan | Bukan current run selesai, integritas invalid, sudah ada approval, atau tidak memiliki hak hitung. |
| Tarik pengajuan | Approval tidak Pending atau tidak memiliki hak hitung. |
| Setujui | Tidak memiliki hak approval, pemisahan tugas gagal, atau integritas invalid. |
| Tolak | Approval tidak Pending atau tidak memiliki hak approval. |
| Tutup periode | Periode belum Approved, approval bukan Approved, run/integritas invalid, atau tidak memiliki hak closing. |

Jika tidak ada tindakan yang tersedia, baca status periode, status approval,
panel integritas, dan hak akses akun secara bersamaan. Jika closing menyebut
profil perusahaan belum lengkap, lengkapi nama dan alamat pada **Administrasi
Sistem > Pengaturan**, lalu ulangi closing.

## 13. Checklist closing

- [ ] Periode, site, jenis Payroll, dan current run benar.
- [ ] Approval menunjuk current run yang sama.
- [ ] Tidak ada neto negatif atau blocker integritas.
- [ ] Peringatan rekening sudah diputuskan tindak lanjutnya.
- [ ] Profil perusahaan memuat nama dan alamat.
- [ ] Rekap dan beberapa detail karyawan sudah diverifikasi.
- [ ] Pengguna memahami closing permanen dan bukan status pembayaran.

## 14. Navigasi KBase Payroll

- Kembali ke [Indeks Payroll](../../KBASE_PAYROLL.md).
- Sebelumnya: [Simulasi dan Komponen Payroll](./KBASE_SIMULASI_DAN_KOMPONEN_PAYROLL.md).
- Lanjut ke [Riwayat, Ekspor, dan Slip Payroll](./KBASE_RIWAYAT_EKSPOR_DAN_SLIP_PAYROLL.md).
