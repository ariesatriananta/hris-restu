import type { NavigateFn } from '@/hooks/use-table-url-state'
import { ProductionRecapPage } from '@/features/production/production-recap-page'

export function ProductionReportPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  return (
    <ProductionRecapPage
      search={search}
      navigate={navigate}
      presentation={{
        eyebrow: 'Pusat Laporan',
        title: 'Laporan Produksi Borongan',
        description:
          'Ringkas hasil kerja, pekerjaan, jumlah setoran, dan nilai bruto per karyawan.',
      }}
    />
  )
}
