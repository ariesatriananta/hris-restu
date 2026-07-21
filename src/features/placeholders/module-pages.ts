export const modulePages = {
  '/karyawan/data-karyawan': {
    group: 'Karyawan',
    title: 'Data Karyawan',
    description: 'Pusat data dan histori pekerja seluruh site.',
    features: [
      'Pencarian dan filter karyawan',
      'Profil serta histori penempatan',
      'Status dan jenis karyawan',
    ],
  },
  '/karyawan/riwayat-mutasi': {
    group: 'Karyawan',
    title: 'Riwayat Mutasi',
    description:
      'Pelacakan perpindahan site, unit, jabatan, dan kelompok kerja.',
    features: [
      'Timeline mutasi',
      'Periode berlaku penempatan',
      'Jejak perubahan data',
    ],
  },
  '/karyawan/pkwt-dokumen': {
    group: 'Karyawan',
    title: 'PKWT & Dokumen',
    description: 'Pengelolaan kontrak dan dokumen internal karyawan.',
    features: [
      'Status dan masa berlaku PKWT',
      'Dokumen karyawan',
      'Peringatan kontrak berakhir',
    ],
  },
  '/karyawan/cetak-id-card': {
    group: 'Karyawan',
    title: 'Cetak ID Card',
    description: 'Persiapan kartu identitas dan barcode karyawan.',
    features: [
      'Pemilihan karyawan',
      'Pratinjau template kartu',
      'Cetak kartu per site',
    ],
  },
  '/attendance/monitoring-harian': {
    group: 'Attendance',
    title: 'Monitoring Harian',
    description: 'Pantauan kehadiran masuk dan pulang pada hari berjalan.',
    features: [
      'Status hadir per site',
      'Attendance belum lengkap',
      'Pemantauan waktu scan',
    ],
  },
  '/attendance/scan': {
    group: 'Attendance',
    title: 'Scan Attendance',
    description: 'Terminal browser HP untuk scan masuk dan pulang.',
    features: [
      'Input barcode autofocus',
      'Feedback scan langsung',
      'Pencegahan submit ganda',
    ],
  },
  '/attendance/rekap': {
    group: 'Attendance',
    title: 'Rekap Attendance',
    description: 'Rekap attendance berdasarkan periode, site, dan karyawan.',
    features: ['Filter periode', 'Ringkasan status kehadiran', 'Ekspor data'],
  },
  '/attendance/koreksi': {
    group: 'Attendance',
    title: 'Koreksi Attendance',
    description: 'Pengajuan dan persetujuan koreksi data kehadiran.',
    features: ['Daftar pengajuan', 'Approval koreksi', 'Audit perubahan'],
  },
  '/attendance/master-shift': {
    group: 'Attendance',
    title: 'Master Shift',
    description: 'Konfigurasi shift kerja per site.',
    features: ['Jam kerja shift', 'Toleransi scan', 'Penugasan karyawan'],
  },
  '/produksi/terminal-setoran': {
    group: 'Produksi Borongan',
    title: 'Terminal Setoran',
    description:
      'Terminal cepat untuk input setoran produksi melalui scanner USB.',
    features: [
      'Scan barcode karyawan',
      'Validasi attendance',
      'Input pekerjaan dan kuantitas',
    ],
  },
  '/produksi/transaksi': {
    group: 'Produksi Borongan',
    title: 'Transaksi Produksi',
    description: 'Daftar transaksi setoran produksi harian.',
    features: [
      'Filter transaksi',
      'Snapshot tarif',
      'Void dan revisi terlacak',
    ],
  },
  '/produksi/rekap': {
    group: 'Produksi Borongan',
    title: 'Rekap Produksi',
    description: 'Ringkasan hasil borongan per pekerja, pekerjaan, dan site.',
    features: ['Agregasi produksi', 'Nilai bruto borongan', 'Ekspor rekap'],
  },
  '/produksi/master-pekerjaan': {
    group: 'Produksi Borongan',
    title: 'Master Pekerjaan',
    description: 'Daftar jenis pekerjaan produksi dan satuan hasil.',
    features: ['Kode pekerjaan', 'Satuan kerja', 'Status pekerjaan'],
  },
  '/produksi/tarif-site': {
    group: 'Produksi Borongan',
    title: 'Tarif per Site',
    description:
      'Histori tarif pekerjaan yang berlaku pada masing-masing site.',
    features: [
      'Periode berlaku tarif',
      'Tarif berbeda per site',
      'Status draft dan aktif',
    ],
  },
  '/payroll/periode': {
    group: 'Payroll',
    title: 'Periode Payroll',
    description: 'Pengaturan periode perhitungan payroll per site.',
    features: [
      'Periode borongan dan bulanan',
      'Status proses',
      'Kontrol closing',
    ],
  },
  '/payroll/simulasi': {
    group: 'Payroll',
    title: 'Simulasi Payroll',
    description: 'Perhitungan ulang payroll sebelum diajukan.',
    features: [
      'Simulasi per periode',
      'Validasi attendance dan produksi',
      'Ringkasan hasil',
    ],
  },
  '/payroll/approval-closing': {
    group: 'Payroll',
    title: 'Approval & Closing',
    description: 'Tahapan persetujuan dan penguncian payroll final.',
    features: [
      'Approval berjenjang',
      'Validasi sebelum closing',
      'Snapshot immutable',
    ],
  },
  '/payroll/riwayat': {
    group: 'Payroll',
    title: 'Riwayat Payroll',
    description: 'Histori payroll yang telah diproses dan ditutup.',
    features: ['Pencarian periode', 'Detail hasil karyawan', 'Status final'],
  },
  '/payroll/slip-gaji': {
    group: 'Payroll',
    title: 'Slip Gaji',
    description: 'Pratinjau dan pencetakan slip hasil payroll.',
    features: [
      'Template slip',
      'Rincian pendapatan dan potongan',
      'Cetak per karyawan',
    ],
  },
  '/laporan': {
    group: 'Kontrol',
    title: 'Laporan',
    description:
      'Laporan lintas modul untuk kebutuhan operasional dan manajemen.',
    features: [
      'Filter lintas site',
      'Laporan attendance dan produksi',
      'Ekspor terkontrol',
    ],
  },
  '/administrasi/user-hak-akses': {
    group: 'Administrasi Sistem',
    title: 'User & Hak Akses',
    description: 'Pengelolaan user, role, permission, dan akses site.',
    features: ['Daftar user', 'Role dan permission', 'Akses site'],
  },
  '/administrasi/template-dokumen': {
    group: 'Administrasi Sistem',
    title: 'Template Dokumen',
    description: 'Template internal untuk PKWT, ID card, dan slip gaji.',
    features: ['Template per site', 'Periode berlaku', 'Status aktif'],
  },
  '/administrasi/audit-trail': {
    group: 'Administrasi Sistem',
    title: 'Audit Trail',
    description: 'Jejak aksi penting dan perubahan data sistem.',
    features: [
      'Filter pelaku dan site',
      'Detail perubahan',
      'Waktu dan sumber aksi',
    ],
  },
  '/administrasi/master-data': {
    group: 'Administrasi Sistem',
    title: 'Master Data',
    description: 'Master referensi operasional yang digunakan lintas modul.',
    features: [
      'Modul Produksi per site',
      'Bagian Produksi',
      'Pemetaan Modul dan Bagian',
    ],
  },
  '/administrasi/pengaturan': {
    group: 'Administrasi Sistem',
    title: 'Pengaturan',
    description: 'Konfigurasi global dan pengaturan khusus site.',
    features: [
      'Pengaturan operasional',
      'Nilai global dan site',
      'Riwayat perubahan',
    ],
  },
} as const

export type ModulePath = keyof typeof modulePages

export const routeLabels: Record<string, string> = {
  '/': 'Dashboard',
  ...Object.fromEntries(
    Object.entries(modulePages).map(([path, page]) => [path, page.title])
  ),
}
