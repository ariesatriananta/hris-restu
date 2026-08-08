import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import type { EmployeeKpiSummary } from '../domain'
import { EmployeeKpiCards } from './employee-kpi-cards'

const summary: EmployeeKpiSummary = {
  totalEmployees: 120,
  activeEmployees: 96,
  inactiveEmployees: 8,
  resignedEmployees: 12,
  activeTrainingEmployees: 7,
  incompletePlacementEmployees: 3,
}

describe('EmployeeKpiCards', () => {
  it('menampilkan enam KPI dengan nilai summary', async () => {
    const screen = await render(
      <EmployeeKpiCards data={summary} isPending={false} isError={false} />
    )

    await expect.element(screen.getByText('Total karyawan')).toBeInTheDocument()
    await expect.element(screen.getByText('Aktif bekerja')).toBeInTheDocument()
    await expect.element(screen.getByText('Tidak aktif')).toBeInTheDocument()
    await expect.element(screen.getByText('Resign')).toBeInTheDocument()
    await expect.element(screen.getByText('Training aktif')).toBeInTheDocument()
    await expect
      .element(screen.getByText('Penempatan perlu dilengkapi'))
      .toBeInTheDocument()
    await expect.element(screen.getByText('120')).toBeInTheDocument()
    await expect.element(screen.getByText('3')).toBeInTheDocument()
  })

  it('menampilkan error KPI tanpa menggantikan area tabel', async () => {
    const screen = await render(
      <EmployeeKpiCards isPending={false} isError={true} />
    )

    await expect
      .element(
        screen.getByText(
          'Ringkasan KPI karyawan belum dapat dimuat. Tabel karyawan tetap tersedia.'
        )
      )
      .toBeInTheDocument()
  })
})
