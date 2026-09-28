import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  mutationImportTemplateHeaders,
  parseMutationImportWorkbook,
} from './mutation-import-workbook'

function workbookFile(rows: unknown[][]) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    'Mutasi'
  )
  const content = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new File([content], 'mutasi.xlsx')
}

describe('parseMutationImportWorkbook', () => {
  it('menerima tanggal DD/MM/YYYY dan header bertanda wajib', async () => {
    const result = await parseMutationImportWorkbook(
      workbookFile([
        mutationImportTemplateHeaders,
        [
          'PKDS-001',
          'Budi',
          'semarang',
          '',
          'SMG-MOD-A',
          'JAHIT',
          '06/09/2026',
        ],
      ])
    )

    expect(result).toEqual([
      {
        employeeNumber: 'PKDS-001',
        employeeName: 'Budi',
        targetSite: 'SEMARANG',
        targetDepartmentCode: undefined,
        targetProductionModuleCode: 'SMG-MOD-A',
        targetProductionSectionCode: 'JAHIT',
        effectiveFrom: '2026-09-06',
      },
    ])
  })

  it('menerima tanggal serial Excel', async () => {
    const result = await parseMutationImportWorkbook(
      workbookFile([
        mutationImportTemplateHeaders,
        ['PKDS-002', '', 'JEPARA', 'PROD', 'KDS-MOD-A', 'PACKING', 46371],
      ])
    )

    expect(result[0]?.effectiveFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
