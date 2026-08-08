import type { EmployeeIdCardItem } from '../domain'
import { ProductionLabelFace } from './production-label'

export const productionLabelCopies = 5
export const productionLabelEmployeesPerPage = 9

export function ProductionLabelPrintSheet({
  items,
  generatedAt,
}: {
  items: EmployeeIdCardItem[]
  generatedAt: string
}) {
  const pages = chunk(items, productionLabelEmployeesPerPage)

  return (
    <div
      className='production-label-print-root hidden'
      data-generated-at={generatedAt}
      aria-hidden='true'
    >
      {pages.map((page, pageIndex) => (
        <section
          key={`${pageIndex}-${page[0]?.uid ?? 'empty'}`}
          className='production-label-print-page'
        >
          {page.map((employee) => (
            <div key={employee.uid} className='production-label-print-row'>
              {Array.from({ length: productionLabelCopies }, (_, copyIndex) => (
                <ProductionLabelFace
                  key={`${employee.uid}-${copyIndex}`}
                  employee={employee}
                />
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function chunk<T>(items: T[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size)
  )
}
