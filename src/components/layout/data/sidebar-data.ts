import {
  BadgeDollarSign,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileBarChart,
  Fingerprint,
  IdCard,
  LayoutDashboard,
  ReceiptText,
  ScanLine,
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
            { title: 'Riwayat Mutasi', url: '/karyawan/riwayat-mutasi' },
            { title: 'PKWT & Dokumen', url: '/karyawan/pkwt-dokumen' },
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
            },
            { title: 'Scan Attendance', url: '/attendance/scan' },
            { title: 'Rekap Attendance', url: '/attendance/rekap' },
            { title: 'Koreksi Attendance', url: '/attendance/koreksi' },
            { title: 'Master Shift', url: '/attendance/master-shift' },
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
              title: 'Pengaturan',
              url: '/administrasi/pengaturan',
              icon: Building2,
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
