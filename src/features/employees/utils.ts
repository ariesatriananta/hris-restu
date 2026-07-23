export const formatDate = (value?: string) => {
  if (!value) return '—'

  // MySQL DATE dapat sampai sebagai YYYY-MM-DD atau ISO datetime dari API.
  // Jangan menempelkan waktu ke ISO datetime karena menghasilkan Invalid Date.
  const date = new Date(value.includes('T') ? value : `${value}T00:00:00+07:00`)

  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(date)
}
export const maskValue = (value?: string, keep = 4) =>
  value
    ? `${'•'.repeat(Math.max(4, value.length - keep))}${value.slice(-keep)}`
    : 'Belum diisi'
export const statusLabel = (value: string) =>
  ({
    ACTIVE: 'Aktif',
    LEAVE: 'Cuti',
    RESIGNED: 'Resign',
    INACTIVE: 'Nonaktif',
    DRAFT: 'Draft',
    SCHEDULED: 'Dijadwalkan',
    EXPIRED: 'Berakhir',
    TERMINATED: 'Dihentikan',
    CANCELLED: 'Dibatalkan',
    MISSING: 'Belum ada kontrak',
    APPLIED: 'Diterapkan',
    FAILED: 'Gagal',
    REVOKED: 'Dicabut',
    ARCHIVED: 'Diarsipkan',
    BORONGAN: 'Borongan',
    BULANAN: 'Bulanan',
    TRAINING: 'Training',
    JEPARA: 'Jepara',
    SEMARANG: 'Semarang',
    KLATEN: 'Klaten',
    INITIAL: 'Penempatan awal',
    TRANSFER: 'Mutasi site',
    PROMOTION: 'Promosi',
    DEMOTION: 'Demosi',
    STATUS_CHANGE: 'Perubahan status',
    TYPE_CHANGE: 'Perubahan jenis',
    DEPARTMENT_CHANGE: 'Perubahan departemen',
    GROUP_CHANGE: 'Perubahan kelompok',
    PRODUCTION_ASSIGNMENT_CHANGE: 'Perubahan penempatan produksi',
    OTHER: 'Lainnya',
  })[value] ?? value
