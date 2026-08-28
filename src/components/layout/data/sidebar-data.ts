import {
  BadgeDollarSign,
  Building2,
  CalendarClock,
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
          anyOfPermissions: ['employees.view'],
          items: [
            { title: 'Data Karyawan', url: '/karyawan/data-karyawan' },
            { title: 'Mutasi Karyawan', url: '/karyawan/riwayat-mutasi' },
            { title: 'Kontrak Karyawan', url: '/karyawan/pkwt-dokumen' },
            {
              title: 'ID Card & Label Barcode',
              url: '/karyawan/cetak-id-card',
            },
          ],
        },
        {
          title: 'Attendance',
          icon: CalendarClock,
          items: [
            {
              title: 'Scan Attendance',
              url: '/attendance/scan',
              anyOfPermissions: ['attendance.scan'],
            },
            {
              title: 'Monitoring Harian',
              url: '/attendance/monitoring-harian',
              anyOfPermissions: ['attendance.view'],
            },
            {
              title: 'Tindak Lanjut Attendance',
              url: '/attendance/tindak-lanjut',
              anyOfPermissions: ['attendance.correct', 'attendance.approve'],
            },
            {
              title: 'Rekap Attendance',
              url: '/attendance/rekap',
              anyOfPermissions: ['attendance.view'],
            },
            {
              title: 'Master Shift',
              url: '/attendance/master-shift',
              anyOfPermissions: ['attendance.manage_shift'],
            },
            {
              title: 'Master Perangkat',
              url: '/attendance/master-perangkat',
              anyOfPermissions: ['attendance.manage_device'],
            },
            {
              title: 'Kalender Kerja',
              url: '/attendance/kalender-kerja',
              anyOfPermissions: ['attendance.view'],
            },
          ],
        },
        {
          title: 'Produksi Borongan',
          icon: ScanLine,
          anyOfPermissions: [
            'production.view',
            'production.scan',
            'production.correct',
            'production.manage_master',
          ],
          items: [
            {
              title: 'Terminal Setoran',
              url: '/produksi/terminal-setoran',
              anyOfPermissions: ['production.scan'],
            },
            {
              title: 'Transaksi Produksi',
              url: '/produksi/transaksi',
              anyOfPermissions: ['production.view'],
            },
            {
              title: 'Rekap Produksi',
              url: '/produksi/rekap',
              anyOfPermissions: ['production.view'],
            },
            {
              title: 'Master Pekerjaan',
              url: '/produksi/master-pekerjaan',
              anyOfPermissions: ['production.view'],
            },
            {
              title: 'Tarif per Site',
              url: '/produksi/tarif-site',
              anyOfPermissions: ['production.view'],
            },
          ],
        },
        {
          title: 'Payroll',
          icon: WalletCards,
          anyOfPermissions: ['payroll.view'],
          items: [
            {
              title: 'Skema Upah & Tarif',
              url: '/payroll/skema-upah',
              anyOfPermissions: ['payroll.view'],
            },
            {
              title: 'Periode Payroll',
              url: '/payroll/periode',
              anyOfPermissions: ['payroll.view'],
            },
            {
              title: 'Simulasi Payroll',
              url: '/payroll/simulasi',
              anyOfPermissions: ['payroll.view'],
            },
            {
              title: 'Approval & Closing',
              url: '/payroll/approval-closing',
              anyOfPermissions: ['payroll.view'],
            },
            {
              title: 'Riwayat Payroll',
              url: '/payroll/riwayat',
              anyOfPermissions: ['payroll.view'],
            },
            {
              title: 'Slip Gaji',
              url: '/payroll/slip-gaji',
              anyOfPermissions: ['payroll.view'],
            },
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
