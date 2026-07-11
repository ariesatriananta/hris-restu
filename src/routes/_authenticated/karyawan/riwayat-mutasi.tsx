import { createFileRoute } from '@tanstack/react-router'
import { ModulePlaceholder } from '@/features/placeholders/module-placeholder'

export const Route = createFileRoute('/_authenticated/karyawan/riwayat-mutasi')(
  { component: () => <ModulePlaceholder path='/karyawan/riwayat-mutasi' /> }
)
