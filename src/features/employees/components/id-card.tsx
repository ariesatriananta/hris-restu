import { useRef } from 'react'
import { Download, Printer } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { APP_LOGO_SRC, APP_NAME } from '@/lib/app-branding'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Employee, EmployeeIdCardItem } from '../domain'

type IdCardEmployee = Employee | EmployeeIdCardItem

export function EmployeeIdCard({ employee }: { employee: IdCardEmployee }) {
  return (
    <div className='id-card-print-root space-y-4'>
      <EmployeeIdCardFace employee={employee} />
      <IdCardActions employee={employee} />
    </div>
  )
}

export function EmployeeIdCardFace({
  employee,
  className,
}: {
  employee: IdCardEmployee
  className?: string
}) {
  const training = employee.employeeType === 'TRAINING'
  const photoUrl = employeePhotoUrl(employee)
  const qrPayload = machineReadablePayload(employee)
  const role = employee.productionSection || employee.position || 'Karyawan'
  const secondaryRole = employee.productionSection
    ? employee.productionModule
    : undefined

  return (
    <article
      id={`id-card-${employee.uid}`}
      aria-label={`ID Card ${employee.fullName}`}
      className={cn(
        'employee-id-card relative h-[85.6mm] w-[54mm] shrink-0 overflow-hidden rounded-[3.2mm] border bg-white text-slate-900 shadow-md',
        training ? 'border-slate-300' : 'border-primary/30',
        className
      )}
    >
      {training ? <TrainingDecoration /> : <EmployeeDecoration />}
      <div className='relative z-10 flex h-full flex-col items-center px-3 pt-3 pb-2 text-center'>
        <div className='flex w-full items-start justify-between gap-2'>
          <div className='flex size-9 items-center justify-center rounded-full border border-white/70 bg-white p-1 shadow-sm'>
            <img
              src={APP_LOGO_SRC}
              alt={`Logo ${APP_NAME}`}
              className='size-full object-contain'
            />
          </div>
          <div
            className={cn(
              'rounded-full border px-2 py-0.5 text-[8px] font-bold tracking-[0.12em] uppercase',
              training
                ? 'border-primary/20 bg-primary/5 text-primary'
                : 'border-white/40 bg-white/15 text-white'
            )}
          >
            {training ? 'Training' : 'Karyawan'}
          </div>
        </div>

        {training ? (
          <div className='mt-4'>
            <p className='text-[24px] leading-none font-black tracking-[0.16em] text-primary uppercase'>
              Training
            </p>
            <p className='mt-1 text-[7px] font-semibold tracking-[0.22em] text-positive uppercase'>
              Kartu Identitas
            </p>
          </div>
        ) : (
          <div className='mt-2 flex size-[76px] items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-primary text-white shadow-sm'>
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={`Foto ${employee.fullName}`}
                className='size-full object-cover'
              />
            ) : (
              <span className='text-2xl font-bold'>
                {getInitials(employee.fullName)}
              </span>
            )}
          </div>
        )}

        <div className={cn('w-full min-w-0', training ? 'mt-5' : 'mt-2')}>
          <h2
            className='line-clamp-2 text-[14px] leading-[1.05] font-bold text-primary uppercase'
            title={employee.fullName}
          >
            {employee.fullName}
          </h2>
          <p className='mt-1 line-clamp-2 text-[9px] leading-tight font-medium text-slate-600'>
            {role}
          </p>
          {secondaryRole && (
            <p className='truncate text-[8px] text-slate-500'>
              {secondaryRole}
            </p>
          )}
        </div>

        <div className='mt-2 w-full'>
          <p className='text-[11px] leading-none font-bold tracking-wide text-primary'>
            {employee.employeeNumber}
          </p>
          <p className='mt-1 text-[8px] font-medium text-slate-500'>
            Site {employee.site} · {APP_NAME}
          </p>
        </div>

        <div className='mt-auto rounded-md border border-slate-200 bg-white p-1'>
          <QRCodeSVG
            value={qrPayload}
            size={62}
            level='M'
            marginSize={0}
            bgColor='#ffffff'
            fgColor='#0E2459'
            aria-label={`QR ${employee.employeeNumber}`}
          />
        </div>
        <p className='mt-0.5 max-w-full truncate font-mono text-[7px] tracking-wide text-slate-500'>
          {qrPayload}
        </p>
      </div>
    </article>
  )
}

function EmployeeDecoration() {
  return (
    <svg
      aria-hidden='true'
      viewBox='0 0 204 324'
      preserveAspectRatio='none'
      className='absolute inset-0 size-full'
    >
      <rect width='204' height='324' fill='#f8fafc' />
      <path
        d='M0 0h204v78c-38 18-70 19-102 4C69 66 38 67 0 91Z'
        fill='#0E2459'
      />
      <path
        d='M0 63c38-22 72-19 104-3 31 16 63 16 100-5v17c-39 21-73 22-105 6C68 62 36 61 0 82Z'
        fill='#2B902E'
        opacity='.95'
      />
      <path
        d='M0 276c45-17 82-12 112 4 29 16 58 18 92 4v40H0Z'
        fill='#0E2459'
        opacity='.07'
      />
      <path d='M70 324c44-30 89-33 134-14v14Z' fill='#2B902E' />
    </svg>
  )
}

function TrainingDecoration() {
  return (
    <svg
      aria-hidden='true'
      viewBox='0 0 204 324'
      preserveAspectRatio='none'
      className='absolute inset-0 size-full'
    >
      <rect width='204' height='324' fill='#ffffff' />
      <rect width='204' height='6' fill='#2B902E' />
      <path
        d='M204 0v75c-27 8-51 5-72-9-19-13-39-16-61-10 34-37 78-56 133-56Z'
        fill='#0E2459'
        opacity='.055'
      />
      <path d='M20 310h164' stroke='#0E2459' strokeOpacity='.18' />
    </svg>
  )
}

function IdCardActions({ employee }: { employee: IdCardEmployee }) {
  const qrContainerRef = useRef<HTMLDivElement>(null)
  const qrPayload = machineReadablePayload(employee)

  async function download() {
    try {
      const qrSource = qrContainerRef.current?.querySelector('svg')
      if (!qrSource) throw new Error('QR belum siap.')
      const logo = await imageToDataUrl(APP_LOGO_SRC)
      const photoUrl = employeePhotoUrl(employee)
      const photo = photoUrl
        ? await imageToDataUrl(photoUrl).catch(() => '')
        : ''
      const qr = qrSource.cloneNode(true) as SVGSVGElement
      qr.setAttribute('x', '165')
      qr.setAttribute('y', '535')
      qr.setAttribute('width', '210')
      qr.setAttribute('height', '210')
      const training = employee.employeeType === 'TRAINING'
      const role = employee.productionSection || employee.position || 'Karyawan'
      const photoMarkup = training
        ? ''
        : photo
          ? `<image href="${photo}" x="175" y="115" width="190" height="190" preserveAspectRatio="xMidYMid slice" clip-path="url(#photoClip)"/>`
          : `<circle cx="270" cy="210" r="95" fill="#0E2459"/><text x="270" y="232" text-anchor="middle" font-family="Arial" font-size="64" font-weight="700" fill="#ffffff">${escapeXml(getInitials(employee.fullName))}</text>`
      const decoration = training
        ? `<rect width="540" height="856" fill="#ffffff"/><rect width="540" height="15" fill="#2B902E"/><path d="M540 0v198c-72 21-135 13-190-24-50-34-104-43-162-27C278 49 395 0 540 0Z" fill="#0E2459" fill-opacity=".055"/><line x1="54" y1="820" x2="486" y2="820" stroke="#0E2459" stroke-opacity=".18"/>`
        : `<rect width="540" height="856" fill="#f8fafc"/><path d="M0 0h540v206c-100 48-185 51-270 10C183 174 100 177 0 240Z" fill="#0E2459"/><path d="M0 166c101-57 191-50 276-8 82 43 166 42 264-13v45c-103 56-193 58-278 15C180 163 95 161 0 216Z" fill="#2B902E"/><path d="M0 730c119-45 217-32 296 11 77 43 154 47 244 10v105H0Z" fill="#0E2459" fill-opacity=".07"/><path d="M185 856c117-79 236-87 355-37v37Z" fill="#2B902E"/>`
      const nameFontSize =
        employee.fullName.length > 24
          ? 22
          : employee.fullName.length > 18
            ? 26
            : 31
      const identityY = training ? 265 : 360
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="856" viewBox="0 0 540 856">
        <defs><clipPath id="photoClip"><circle cx="270" cy="210" r="95"/></clipPath></defs>
        ${decoration}
        <rect x="28" y="28" width="76" height="76" rx="38" fill="#ffffff" stroke="#dbe3ef"/>
        <image href="${logo}" x="38" y="38" width="56" height="56" preserveAspectRatio="xMidYMid meet"/>
        <text x="500" y="76" text-anchor="end" font-family="Arial" font-size="18" font-weight="700" letter-spacing="3" fill="${training ? '#0E2459' : '#ffffff'}">${training ? 'TRAINING' : 'KARYAWAN'}</text>
        ${training ? '<text x="270" y="180" text-anchor="middle" font-family="Arial" font-size="58" font-weight="900" letter-spacing="9" fill="#0E2459">TRAINING</text><text x="270" y="215" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" letter-spacing="5" fill="#2B902E">KARTU IDENTITAS</text>' : ''}
        ${photoMarkup}
        <text x="270" y="${identityY}" text-anchor="middle" font-family="Arial" font-size="${nameFontSize}" font-weight="700" fill="#0E2459">${escapeXml(employee.fullName.toUpperCase())}</text>
        <text x="270" y="${identityY + 40}" text-anchor="middle" font-family="Arial" font-size="21" fill="#475569">${escapeXml(role)}</text>
        <text x="270" y="${identityY + 82}" text-anchor="middle" font-family="Arial" font-size="25" font-weight="700" fill="#0E2459">${escapeXml(employee.employeeNumber)}</text>
        <text x="270" y="${identityY + 112}" text-anchor="middle" font-family="Arial" font-size="16" fill="#64748b">Site ${escapeXml(employee.site)} · ${APP_NAME}</text>
        ${qr.outerHTML}
        <text x="270" y="772" text-anchor="middle" font-family="monospace" font-size="13" fill="#64748b">${escapeXml(qrPayload)}</text>
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
    <>
      <div className='sr-only' ref={qrContainerRef} aria-hidden='true'>
        <QRCodeSVG value={qrPayload} size={200} level='M' marginSize={0} />
      </div>
      <div className='id-card-actions flex flex-wrap justify-center gap-2'>
        <Button variant='outline' onClick={() => window.print()}>
          <Printer /> Cetak ID card
        </Button>
        <Button onClick={() => void download()}>
          <Download /> Unduh SVG
        </Button>
      </div>
    </>
  )
}

function machineReadablePayload(employee: IdCardEmployee) {
  return 'machineReadable' in employee
    ? employee.machineReadable.qrPayload
    : employee.barcode
}

function employeePhotoUrl(employee: IdCardEmployee) {
  const photo = employee.photo
  if (!photo) return undefined
  return photo.url ?? ('temporaryUrl' in photo ? photo.temporaryUrl : undefined)
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
