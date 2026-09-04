import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { employeeKeys } from '../data/queries'
import type { Employee } from '../domain'
import { RegistrationCorrectionDialog } from './registration-correction-dialog'

describe('RegistrationCorrectionDialog', () => {
  it('menampilkan tanggal bergabung pada koreksi registrasi', async () => {
    const employee = {
      uid: 'ca0a0392-71e3-4c52-af44-0c83c8296ee1',
      employeeNumber: 'PSMG-2607-11001',
      barcode: 'PSMG-2607-11001',
      fullName: 'Karyawan Fiktif',
      employeeType: 'BORONGAN',
      employeeStatus: 'INACTIVE',
      site: 'SEMARANG',
      productionModuleUid: 'd42fc166-b62e-4cea-b89e-04f434d079f0',
      productionModule: 'Modul A',
      productionModuleSectionUid: '1514bce8-dab7-4d40-a217-5c6471134aca',
      productionSection: 'Packing',
      joinDate: '2026-07-11',
      gender: 'LAKI-LAKI',
    } satisfies Employee
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    client.setQueryData(employeeKeys.lookups(), {
      sites: [],
      departments: [],
      positions: [],
      workGroups: [],
      productionModules: [],
      productionModuleSections: [],
      contractTypes: [],
    })
    const screen = await render(
      <QueryClientProvider client={client}>
        <RegistrationCorrectionDialog
          employee={employee}
          open
          onOpenChange={() => {}}
        />
      </QueryClientProvider>
    )

    await expect.element(screen.getByText('11 Juli 2026')).toBeVisible()
    await expect
      .element(
        screen.getByText(
          'Tanggal ini juga menjadi awal histori penempatan karyawan.'
        )
      )
      .toBeVisible()
  })
})
