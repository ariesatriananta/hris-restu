import {
  BadgeDollarSign,
  Building2,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Database,
  FileBarChart,
  Fingerprint,
  IdCard,
  LayoutDashboard,
  ReceiptText,
  ScanLine,
  ServerCog,
  Settings,
  ShieldCheck,
  UserRoundCog,
  Users,
  WalletCards,
} from 'lucide-react'
import type { SidebarData } from '../types'

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'Ringkasan',
      items: [{ title: 'Dashboard', url: '/', icon: LayoutDashboard }],
    },
    {
      title: 'Operasional HR',
      items: [
        {
          title: 'Karyawan',
          icon: Users,
          items: [
            { title: 'Data Karyawan', url: '/karyawan/data-karyawan' },
            { title: 'Mutasi Karyawan', url: '/karyawan/riwayat-mutasi' },
            { title: 'Kontrak Karyawan', url: '/karyawan/pkwt-dokumen' },
            { title: 'Cetak ID Card', url: '/karyawan/cetak-id-card' },
          ],
        },
        {
          title: 'Attendance',
          icon: CalendarClock,
          items: [
            {
              title: 'Monitoring Harian',
              url: '/attendance/monitoring-harian',
              anyOfPermissions: ['attendance.view'],
            },
            {
              title: 'Scan Attendance',
              url: '/attendance/scan',
              anyOfPermissions: ['attendance.scan'],
            },
            {
              title: 'Rekap Attendance',
              url: '/attendance/rekap',
              anyOfPermissions: ['attendance.view'],
            },
            {
              title: 'Koreksi Attendance',
              url: '/attendance/koreksi',
              anyOfPermissions: ['attendance.correct', 'attendance.approve'],
            },
            {
              title: 'Klasifikasi Attendance',
              url: '/attendance/klasifikasi',
              anyOfPermissions: ['attendance.correct', 'attendance.approve'],
            },
            {
              title: 'Master Shift',
              url: '/attendance/master-shift',
              anyOfPermissions: ['attendance.manage_shift'],
            },
            {
              title: 'Kalender Kerja & Libur',
              url: '/attendance/kalender-kerja',
              icon: CalendarDays,
              anyOfPermissions: ['attendance.view'],
            },
            {
              title: 'Master Perangkat',
              url: '/attendance/master-perangkat',
              anyOfPermissions: ['attendance.manage_device'],
            },
          ],
        },
        {
          title: 'Produksi Borongan',
          icon: ScanLine,
          items: [
            { title: 'Terminal Setoran', url: '/produksi/terminal-setoran' },
            { title: 'Transaksi Produksi', url: '/produksi/transaksi' },
            { title: 'Rekap Produksi', url: '/produksi/rekap' },
            { title: 'Master Pekerjaan', url: '/produksi/master-pekerjaan' },
            { title: 'Tarif per Site', url: '/produksi/tarif-site' },
          ],
        },
        {
          title: 'Payroll',
          icon: WalletCards,
          items: [
            { title: 'Periode Payroll', url: '/payroll/periode' },
            { title: 'Simulasi Payroll', url: '/payroll/simulasi' },
            { title: 'Approval & Closing', url: '/payroll/approval-closing' },
            { title: 'Riwayat Payroll', url: '/payroll/riwayat' },
            { title: 'Slip Gaji', url: '/payroll/slip-gaji' },
          ],
        },
      ],
    },
    {
      title: 'Kontrol',
      items: [
        { title: 'Laporan', url: '/laporan', icon: FileBarChart },
        {
          title: 'Administrasi Sistem',
          icon: Settings,
          items: [
            {
              title: 'User & Hak Akses',
              url: '/administrasi/user-hak-akses',
              icon: UserRoundCog,
            },
            {
              title: 'Master Data',
              url: '/administrasi/master-data',
              icon: Database,
            },
            {
              title: 'Template Dokumen',
              url: '/administrasi/template-dokumen',
              icon: ReceiptText,
            },
            {
              title: 'Audit Trail',
              url: '/administrasi/audit-trail',
              icon: Fingerprint,
            },
            {
              title: 'Monitoring Cron',
              url: '/administrasi/monitoring-cron',
              icon: ServerCog,
            },
            {
              title: 'Pengaturan',
              url: '/administrasi/pengaturan',
              icon: Building2,
              superAdminOnly: true,
            },
          ],
        },
      ],
    },
  ],
}

export const moduleIcons = {
  employees: IdCard,
  attendance: ClipboardCheck,
  production: BadgeDollarSign,
  payroll: WalletCards,
  administration: ShieldCheck,
}
