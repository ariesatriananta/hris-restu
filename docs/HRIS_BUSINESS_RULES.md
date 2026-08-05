## Konteks produk
Project ini adalah HRIS internal PT Restu Sejati Inti Abadi untuk tiga site operasional: Jepara, Semarang, dan Klaten. Fokus utama sesuai PRD:
- master dan histori karyawan;
- PKWT, ID card, dan dokumen karyawan;
- attendance masuk/pulang melalui scan barcode di browser HP;
- setoran produksi borongan melalui scanner barcode USB;
- tarif pekerjaan borongan yang berbeda dan memiliki histori per site;
- payroll borongan, simulasi, approval, closing, snapshot, slip gaji, dan histori;
- fondasi shift dan payroll bulanan untuk staff/non-produksi;
- role-based access, site-based access, dan audit trail.
Jumlah pekerja borongan diperkirakan sekitar 400 orang per site. Halaman operasional harus cepat, jelas, tahan terhadap input berulang, dan nyaman digunakan pada jam kerja.

## Aturan bisnis penting
- Jenis karyawan operasional: `BORONGAN`, `HARIAN`, `BULANAN`, dan `TRAINING`.
- Semua jenis karyawan wajib memiliki penempatan Modul dan Bagian produksi pada registrasi dan mutasi.
- Jenis kontrak `TRAINING`, `PKWT`, dan `PKWTT` dipilih sesuai kebijakan HR dan tidak ditentukan otomatis dari jenis karyawan.
- Cetak template kontrak produksi tahap pertama hanya untuk kombinasi karyawan `BORONGAN` dengan kontrak `PKWT`.
- Kontrak `ACTIVE` tidak dapat dikoreksi periodenya. Salah aktivasi hanya dapat dibatalkan menjadi `CANCELLED` bila belum memiliki tanda tangan/lampiran dan belum digunakan oleh attendance, produksi, payroll, histori lanjutan, atau status kerja terjadwal; selain itu gunakan Terminasi lalu buat kontrak baru.
- Attendance merupakan syarat setoran produksi pada business date yang sama.
- Pekerja borongan dibayar berdasarkan hasil produksi, bukan durasi kerja.
- Satu karyawan dapat melakukan setoran produksi lebih dari satu kali dalam sehari.
- Tarif pekerjaan berbeda per site dan memiliki periode berlaku.
- Transaksi produksi menyimpan snapshot tarif agar histori tidak berubah saat tarif diperbarui.
- Payroll draft/simulasi dapat dihitung ulang. Payroll yang sudah closing bersifat immutable.
- Koreksi setelah payroll closing tidak termasuk scope saat ini.
- Semua aksi penting dan koreksi harus dapat ditelusuri melalui audit trail.
