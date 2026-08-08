import type { EmployeeIdCardItem } from '../domain'
import { EmployeeIdCardFace } from './id-card'

const cardsPerPage = 5

export function IdCardPrintSheet({
  items,
  generatedAt,
}: {
  items: EmployeeIdCardItem[]
  generatedAt: string
}) {
  const pages = chunk(items, cardsPerPage)
  return (
    <div
      className='id-card-batch-print-root hidden'
      data-generated-at={generatedAt}
      aria-hidden='true'
    >
      {pages.map((page, pageIndex) => (
        <section
          key={`${pageIndex}-${page[0]?.uid ?? 'empty'}`}
          className='id-card-print-page'
        >
          <div className='id-card-print-row'>
            {page.map((employee) => (
              <div key={employee.uid} className='id-card-print-slot'>
                <EmployeeIdCardFace
                  employee={employee}
                  className='shadow-none'
                />
              </div>
            ))}
          </div>
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
