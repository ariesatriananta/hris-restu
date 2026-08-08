import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { cn } from '@/lib/utils'
import type { EmployeeIdCardItem } from '../domain'

export function ProductionLabelFace({
  employee,
  className,
}: {
  employee: EmployeeIdCardItem
  className?: string
}) {
  const barcodeRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!barcodeRef.current) return
    JsBarcode(barcodeRef.current, employee.machineReadable.barcodePayload, {
      format: 'CODE128',
      width: 1.25,
      height: 34,
      margin: 0,
      displayValue: false,
      background: '#ffffff',
      lineColor: '#000000',
    })
  }, [employee.machineReadable.barcodePayload])

  return (
    <article
      className={cn(
        'production-label-face box-border flex h-[27mm] w-[38mm] shrink-0 flex-col overflow-hidden border border-slate-950 bg-white px-[1.4mm] py-[1.2mm] text-center font-sans text-black',
        className
      )}
      aria-label={`Label setoran produksi ${employee.fullName}`}
    >
      <p className='truncate text-[5.8px] leading-[7px] font-extrabold tracking-[0.01em]'>
        PT RESTU SEJATI INTI ABADI
      </p>
      <div className='my-[0.8mm] border-t border-slate-950' />
      <p className='truncate text-[6.5px] leading-[8px] font-extrabold'>
        {employee.employeeNumber}
      </p>
      <p className='truncate text-[5.2px] leading-[6.5px] font-bold uppercase'>
        {employee.fullName}
      </p>
      <p className='truncate text-[5.2px] leading-[6.5px] font-bold uppercase'>
        {employee.productionSection}
      </p>
      <div className='mt-auto flex min-h-0 flex-col items-center'>
        <svg
          ref={barcodeRef}
          className='production-label-barcode h-[7.2mm] w-full'
          role='img'
          aria-label={`Barcode ${employee.employeeNumber}`}
        />
        <p className='mt-[0.2mm] truncate text-[3.8px] leading-[4px] tracking-[0.08em]'>
          {employee.machineReadable.barcodePayload}
        </p>
      </div>
    </article>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function isProductionLabelEligible(employee: EmployeeIdCardItem) {
  return (
    employee.employeeStatus === 'ACTIVE' &&
    Boolean(employee.productionSection?.trim())
  )
}
