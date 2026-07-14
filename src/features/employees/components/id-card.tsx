import { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'
import { Download, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { APP_NAME } from '@/lib/app-branding'
import { Button } from '@/components/ui/button'
import type { Employee } from '../domain'

const NAVY = '#0E2459'
const GREEN = '#2B902E'

export function EmployeeIdCard({ employee }: { employee: Employee }) {
  const barcodeRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (barcodeRef.current) renderBarcode(barcodeRef.current, employee.barcode)
  }, [employee.barcode])

  async function download() {
    try {
      const logo = await imageToDataUrl('/brand/restu-logo.jpeg')
      const photo = employee.photo?.temporaryUrl
        ? await imageToDataUrl(employee.photo.temporaryUrl).catch(() => '')
        : ''
      const barcode = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'svg'
      )
      JsBarcode(barcode, employee.barcode, {
        format: 'CODE128',
        displayValue: true,
        fontSize: 18,
        height: 74,
        margin: 0,
        background: '#ffffff',
        lineColor: NAVY,
      })
      barcode.setAttribute('x', '248')
      barcode.setAttribute('y', '355')
      const initials = getInitials(employee.fullName)
      const avatar = photo
        ? `<image href="${photo}" x="49" y="185" width="150" height="150" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatarClip)" />`
        : `<circle cx="124" cy="260" r="75" fill="#ffffff" fill-opacity="0.18"/><text x="124" y="280" text-anchor="middle" font-family="Arial" font-size="52" font-weight="700" fill="#ffffff">${escapeXml(initials)}</text>`
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="856" height="540" viewBox="0 0 856 540">
        <defs><clipPath id="avatarClip"><circle cx="124" cy="260" r="75"/></clipPath></defs>
        <rect width="856" height="540" rx="28" fill="#ffffff"/>
        <rect width="240" height="540" rx="28" fill="${NAVY}"/>
        <rect x="212" width="28" height="540" fill="${NAVY}"/>
        <image href="${logo}" x="74" y="45" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>
        ${avatar}
        <text x="120" y="475" text-anchor="middle" font-family="Arial" font-size="15" font-weight="700" letter-spacing="2" fill="#ffffff">${APP_NAME}</text>
        <text x="280" y="82" font-family="Arial" font-size="20" font-weight="700" fill="${GREEN}">KARTU IDENTITAS KARYAWAN</text>
        <text x="280" y="158" font-family="Arial" font-size="38" font-weight="700" fill="${NAVY}">${escapeXml(employee.fullName)}</text>
        <text x="280" y="205" font-family="Arial" font-size="23" fill="#334155">${escapeXml(employee.employeeNumber)} · Site ${escapeXml(employee.site)}</text>
        <text x="280" y="247" font-family="Arial" font-size="21" fill="#64748b">${escapeXml(employee.position ?? 'Karyawan')}</text>
        <line x1="280" y1="292" x2="802" y2="292" stroke="#dbe3ef" stroke-width="2"/>
        ${barcode.outerHTML}
      </svg>`
      const url = URL.createObjectURL(
        new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `id-card-${employee.employeeNumber}.svg`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      toast.success('ID card SVG berhasil diunduh.')
    } catch {
      toast.error('ID card belum dapat diunduh.')
    }
  }

  return (
    <div className='id-card-print-root space-y-4'>
      <div
        id={`id-card-${employee.uid}`}
        className='employee-id-card mx-auto grid aspect-[1.586/1] max-w-xl grid-cols-[112px_1fr] overflow-hidden rounded-2xl border-4 border-primary bg-white text-slate-900 shadow-lg'
      >
        <div className='flex flex-col items-center justify-between bg-primary p-4 text-center text-white'>
          <img
            src='/brand/restu-logo.jpeg'
            alt={`Logo ${APP_NAME}`}
            className='size-14 rounded-full bg-white object-contain p-1'
          />
          {employee.photo?.temporaryUrl ? (
            <img
              src={employee.photo.temporaryUrl}
              alt={`Foto ${employee.fullName}`}
              className='size-16 rounded-full border-2 border-white/50 object-cover'
            />
          ) : (
            <div className='flex size-16 items-center justify-center rounded-full bg-white/20 text-2xl font-bold'>
              {getInitials(employee.fullName)}
            </div>
          )}
          <span className='text-[9px] font-semibold tracking-wider'>
            {APP_NAME}
          </span>
        </div>
        <div className='flex flex-col justify-between p-5'>
          <div>
            <p className='text-xs font-semibold text-positive'>
              KARTU IDENTITAS KARYAWAN
            </p>
            <h2 className='mt-2 text-2xl font-bold'>{employee.fullName}</h2>
            <p className='text-sm'>
              {employee.employeeNumber} · Site {employee.site}
            </p>
            <p className='mt-1 text-sm text-slate-600'>
              {employee.position ?? 'Karyawan'}
            </p>
          </div>
          <svg
            ref={barcodeRef}
            aria-label={`Barcode ${employee.barcode}`}
            className='max-w-full self-end'
          />
        </div>
      </div>
      <div className='id-card-actions flex flex-wrap justify-center gap-2'>
        <Button variant='outline' onClick={() => window.print()}>
          <Printer /> Cetak ID card
        </Button>
        <Button onClick={() => void download()}>
          <Download /> Unduh SVG
        </Button>
      </div>
    </div>
  )
}

function renderBarcode(target: SVGSVGElement, value: string) {
  JsBarcode(target, value, {
    format: 'CODE128',
    displayValue: true,
    fontSize: 12,
    height: 42,
    margin: 2,
    background: '#ffffff',
    lineColor: NAVY,
  })
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (character) => {
    const entities: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    }
    return entities[character]
  })
}

async function imageToDataUrl(source: string) {
  const response = await fetch(source)
  if (!response.ok) throw new Error('Gambar tidak dapat dibaca.')
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
