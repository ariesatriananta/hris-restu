import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { id } from 'date-fns/locale'
import { Download, LoaderCircle, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DatePicker } from '@/components/date-picker'
import {
  exportPayrollHandover,
  recordPayrollHandoverPrint,
  usePayrollHandoverPreview,
} from './data/queries'
import type { PayrollHandoverPreview } from './domain'
import { formatDecimalString } from './money'

function rupiah(value: string | number) {
  return formatDecimalString(value, {
    currency: true,
    maximumFractionDigits: 0,
  })
}

function bodyAmount(value: string | number) {
  return Number(value) === 0 ? '-' : rupiah(value)
}

function dateLabel(value: string) {
  return format(parseISO(value), 'd MMM yyyy', { locale: id })
}

function dayLabel(value: string) {
  return format(parseISO(value), 'dd MMM', { locale: id })
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character
  )
}

function printableHtml(
  data: PayrollHandoverPreview,
  mandor: string,
  handoverDate: string
) {
  const sectionName =
    data.sections.find((section) => section.uid === data.selectedSectionUid)
      ?.name ?? '-'
  const moduleName =
    data.modules.find((module) => module.uid === data.selectedModuleUid)
      ?.name ?? '-'
  const headers = data.dates
    .map((date) => `<th>${escapeHtml(dayLabel(date))}</th>`)
    .join('')
  const amounts = (daily: Record<string, string>, dashZero = false) =>
    data.dates
      .map(
        (date) =>
          `<td class="num">${escapeHtml(dashZero ? bodyAmount(daily[date] ?? '0') : rupiah(daily[date] ?? '0'))}</td>`
      )
      .join('')
  const rows = data.rows
    .map(
      (row, index) =>
        `<tr><td class="row-number">${index + 1}</td><td>${escapeHtml(row.employeeNumber)}</td><td>${escapeHtml(row.fullName)}</td><td>${escapeHtml(row.employeeType)}</td><td>${escapeHtml(row.moduleName)}</td>${amounts(row.dailyAmounts, true)}<td class="num">${escapeHtml(bodyAmount(row.bpjsEmployeeDeduction))}</td><td class="num strong">${escapeHtml(bodyAmount(row.netPay))}</td><td class="signature"></td></tr>`
    )
    .join('')
  const total = data.totals
  const documentStatus = !data.run.isCurrent
    ? 'RUN HISTORIS - BUKAN HASIL AKTIF'
    : data.run.periodStatus === 'CLOSED'
      ? 'DOKUMEN FINAL'
      : 'HASIL PERHITUNGAN - BELUM DISAHKAN'
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Daftar upah - ${escapeHtml(data.run.periodCode)}</title><style>
    @page{size:A4 landscape;margin:8mm}body{font:9px Arial,sans-serif;color:#111;margin:0}h1{font-size:14px;text-align:center;margin:0 0 9px}.head{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.7fr) 255px;gap:16px;align-items:start;margin-bottom:8px}.meta{display:grid;grid-template-columns:max-content 1fr;gap:3px 10px}.meta b{white-space:nowrap}.approval{border-collapse:collapse;width:255px;table-layout:fixed;text-align:center}.approval td{border:1px solid #333;height:56px;vertical-align:top;padding:3px}.approval small{display:block;border-top:1px solid #333;margin-top:28px;padding-top:3px}.wages{width:100%;border-collapse:collapse;table-layout:auto}.wages th,.wages td{border:1px solid #333;padding:2px 3px;height:16px;vertical-align:middle}.wages th{background:#eef2f6;text-align:center}.wages td.num{text-align:right;white-space:nowrap}.wages td.row-number{width:20px;min-width:20px;text-align:center}.strong{font-weight:bold}.signature{min-width:65px}tfoot td{font-weight:bold;background:#f0f4f1}.note{margin-top:8px;color:#555}
  </style></head><body><h1>DAFTAR UPAH TENAGA KERJA SKT ${escapeHtml(sectionName.toUpperCase())} - SERAH KE MANDOR</h1><div class="head"><div class="meta"><b>Tanggal dari</b><span>${escapeHtml(dateLabel(data.run.periodStart))}</span><b>Sampai</b><span>${escapeHtml(dateLabel(data.run.periodEnd))}</span><b>Mandor</b><span>${escapeHtml(mandor)}</span><b>Modul</b><span>${escapeHtml(moduleName)}</span></div><div class="meta"><b>Tanggal serah</b><span>${escapeHtml(dateLabel(handoverDate))}</span><b>Lokasi</b><span>RSIA</span></div><table class="approval"><tr><td>Aproval<small>Ops Manager</small></td><td>Diserahkan<small>HRD</small></td><td>Diterima<small>Roller Leader</small></td></tr></table></div><p class="note">${documentStatus}</p><table class="wages"><thead><tr><th style="width:20px">No</th><th>ID</th><th>Nama</th><th>Status</th><th>Modul</th>${headers}<th>Pot BPJS</th><th>Total Upah</th><th>TTD Penerima</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="5">TOTAL</td>${amounts(total.dailyAmounts)}<td class="num">${escapeHtml(rupiah(total.bpjsEmployeeDeduction))}</td><td class="num">${escapeHtml(rupiah(total.netPay))}</td><td></td></tr></tfoot></table><p class="note">Total upah mengikuti hasil Payroll, termasuk tambahan atau potongan lain yang dirinci pada Excel. Dokumen ini tidak otomatis menandai upah telah dibayarkan.</p></body></html>`
}

export function PayrollHandoverDialog({
  runUid,
  canPrint,
  canExport,
  onClose,
}: {
  runUid?: string
  canPrint: boolean
  canExport: boolean
  onClose: () => void
}) {
  const [moduleUid, setModuleUid] = useState('ALL')
  const [sectionUid, setSectionUid] = useState('ALL')
  const [mandor, setMandor] = useState('')
  const [handoverDate, setHandoverDate] = useState<Date | undefined>(new Date())
  const [busy, setBusy] = useState<'PRINT' | 'EXCEL' | null>(null)
  const preview = usePayrollHandoverPreview(
    runUid,
    moduleUid === 'ALL' ? undefined : moduleUid,
    sectionUid === 'ALL' ? undefined : sectionUid
  )
  const data = preview.data
  const sectionName =
    data?.sections.find((section) => section.uid === sectionUid)?.name ??
    'Semua Bagian Produksi'
  const moduleName =
    data?.modules.find((module) => module.uid === moduleUid)?.name ??
    'Semua Modul'
  const previewMatchesFilters =
    data?.selectedSectionUid === (sectionUid === 'ALL' ? null : sectionUid) &&
    data?.selectedModuleUid === (moduleUid === 'ALL' ? null : moduleUid)
  const readyPrint = Boolean(
    runUid &&
    sectionUid !== 'ALL' &&
    moduleUid !== 'ALL' &&
    mandor &&
    handoverDate &&
    previewMatchesFilters &&
    data?.rows.length
  )
  const readyExcel = Boolean(
    runUid && handoverDate && previewMatchesFilters && data?.rows.length
  )

  const payload = () => ({
    moduleUid,
    sectionUid,
    foremanName: mandor,
    handoverDate: format(handoverDate!, 'yyyy-MM-dd'),
  })

  const excelPayload = () => ({
    ...(moduleUid === 'ALL' ? {} : { moduleUid }),
    ...(sectionUid === 'ALL' ? {} : { sectionUid }),
    ...(mandor ? { foremanName: mandor } : {}),
    handoverDate: format(handoverDate!, 'yyyy-MM-dd'),
  })

  const doPrint = async () => {
    if (!runUid || !data || !readyPrint || !canPrint) return
    const popup = window.open('', '_blank')
    if (!popup) {
      toast.error('Izinkan pop-up agar lembar dapat dicetak.')
      return
    }
    popup.document.write(
      '<!doctype html><title>Menyiapkan cetakan...</title><p>Menyiapkan cetakan...</p>'
    )
    try {
      setBusy('PRINT')
      await recordPayrollHandoverPrint(runUid, payload())
      popup.document.open()
      popup.document.write(
        printableHtml(data, mandor, format(handoverDate!, 'yyyy-MM-dd'))
      )
      popup.document.close()
      popup.focus()
      popup.print()
    } catch {
      popup.close()
      toast.error('Cetak daftar upah gagal. Coba lagi.')
    } finally {
      setBusy(null)
    }
  }

  const doExcel = async () => {
    if (!runUid || !readyExcel || !canExport) return
    try {
      setBusy('EXCEL')
      await exportPayrollHandover(runUid, excelPayload())
      toast.success('Daftar upah Excel berhasil diunduh.')
    } catch {
      toast.error('Download Excel gagal. Coba lagi.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={Boolean(runUid)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='flex max-h-[94vh] w-[calc(100vw-1.5rem)] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw] xl:max-w-[94vw]'>
        <DialogHeader className='border-b px-5 py-4'>
          <DialogTitle>Daftar upah tunai</DialogTitle>
          <DialogDescription>
            Atur identitas serah terima di kiri, periksa hasil run aktif di
            kanan. Isian ini hanya berlaku untuk cetakan sekarang.
          </DialogDescription>
        </DialogHeader>
        <div className='grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[280px_minmax(0,1fr)] lg:overflow-hidden'>
          <aside className='space-y-5 border-b bg-muted/20 p-5 lg:overflow-y-auto lg:border-r lg:border-b-0'>
            <div>
              <p className='font-semibold'>Pengaturan dokumen</p>
              <p className='text-xs text-muted-foreground'>
                Tidak disimpan ke periode Payroll.
              </p>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='handover-section'>Bagian Produksi</Label>
              <Select
                value={sectionUid}
                onValueChange={(value) => {
                  setSectionUid(value)
                  setModuleUid('ALL')
                }}
              >
                <SelectTrigger id='handover-section' className='w-full'>
                  <SelectValue placeholder='Pilih bagian produksi' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>ALL</SelectItem>
                  {data?.sections.map((section) => (
                    <SelectItem key={section.uid} value={section.uid}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='handover-module'>Modul</Label>
              <Select value={moduleUid} onValueChange={setModuleUid}>
                <SelectTrigger id='handover-module' className='w-full'>
                  <SelectValue placeholder='Pilih modul' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='ALL'>ALL</SelectItem>
                  {data?.modules.map((module) => (
                    <SelectItem key={module.uid} value={module.uid}>
                      {module.uid === 'UNASSIGNED'
                        ? 'Tanpa modul'
                        : module.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className='text-xs text-muted-foreground'>
                Berdasarkan penempatan terakhir dalam periode.
              </p>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='handover-mandor'>Nama mandor</Label>
              <Select value={mandor} onValueChange={setMandor}>
                <SelectTrigger id='handover-mandor' className='w-full'>
                  <SelectValue placeholder='Pilih mandor' />
                </SelectTrigger>
                <SelectContent>
                  {data?.foremen.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!data?.foremen.length && !preview.isPending && (
                <p className='text-xs text-amber-700'>
                  Daftar mandor belum diatur di pengaturan sistem.
                </p>
              )}
            </div>
            <div className='space-y-2'>
              <Label>Tanggal serah terima</Label>
              <DatePicker
                selected={handoverDate}
                onSelect={setHandoverDate}
                placeholder='Pilih tanggal'
              />
            </div>
            <div className='rounded-lg border bg-background p-3 text-xs text-muted-foreground'>
              Excel bisa diunduh untuk semua pekerja tanpa memilih mandor. Untuk
              cetak, pilih Bagian Produksi, Modul, dan Mandor. Keduanya tidak
              mengubah status pembayaran karyawan.
            </div>
          </aside>
          <section
            className='min-w-0 space-y-4 p-5 lg:overflow-y-auto'
            aria-label='Pratinjau daftar upah tunai'
          >
            {preview.isPending ? (
              <Skeleton className='h-96 w-full' />
            ) : preview.isError ? (
              <div className='rounded-lg border border-dashed p-8 text-center text-sm'>
                <p>Pratinjau gagal dimuat.</p>
                <Button
                  variant='outline'
                  size='sm'
                  className='mt-3'
                  onClick={() => preview.refetch()}
                >
                  Coba lagi
                </Button>
              </div>
            ) : data ? (
              <>
                <h3 className='text-center text-sm font-bold tracking-wide'>
                  DAFTAR UPAH TENAGA KERJA SKT {sectionName.toUpperCase()} -
                  SERAH KE MANDOR
                </h3>
                <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_16rem] lg:items-start'>
                  <dl className='grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[11px]'>
                    <dt className='font-semibold'>Tanggal dari</dt>
                    <dd>{dateLabel(data.run.periodStart)}</dd>
                    <dt className='font-semibold'>Sampai</dt>
                    <dd>{dateLabel(data.run.periodEnd)}</dd>
                    <dt className='font-semibold'>Mandor</dt>
                    <dd>{mandor || '-'}</dd>
                    <dt className='font-semibold'>Modul</dt>
                    <dd>{moduleName}</dd>
                  </dl>
                  <dl className='grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-[11px]'>
                    <dt className='font-semibold'>Tanggal serah</dt>
                    <dd>
                      {handoverDate
                        ? format(handoverDate, 'd MMM yyyy', { locale: id })
                        : '-'}
                    </dd>
                    <dt className='font-semibold'>Lokasi</dt>
                    <dd>RSIA</dd>
                  </dl>
                  <div className='flex justify-end'>
                    <div className='grid w-full grid-cols-3 border border-foreground/60 text-center text-[10px] sm:text-xs'>
                      {[
                        ['Aproval', 'Ops Manager'],
                        ['Diserahkan', 'HRD'],
                        ['Diterima', 'Roller Leader'],
                      ].map(([title, role]) => (
                        <div
                          key={role}
                          className='border-r border-foreground/60 p-1 last:border-r-0'
                        >
                          <div>{title}</div>
                          <div className='mt-9 border-t border-foreground/60 pt-1'>
                            {role}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <p className='text-[10px] text-muted-foreground'>
                  {!data.run.isCurrent
                    ? 'RUN HISTORIS - BUKAN HASIL AKTIF'
                    : data.run.periodStatus === 'CLOSED'
                      ? 'DOKUMEN FINAL'
                      : 'HASIL PERHITUNGAN - BELUM DISAHKAN'}
                </p>
                {data.rows.length ? (
                  <div className='overflow-x-auto rounded-md border'>
                    <table className='w-full min-w-[900px] border-collapse text-[10px]'>
                      <thead className='bg-muted/60'>
                        <tr className='border-b'>
                          <th className='w-7 px-1 py-1 text-center'>No</th>
                          <th className='px-2 py-2 text-left'>ID</th>
                          <th className='px-2 py-2 text-left'>Nama</th>
                          <th className='px-2 py-2 text-left'>Status</th>
                          {sectionUid === 'ALL' && (
                            <th className='px-2 py-2 text-left'>
                              Bagian Produksi
                            </th>
                          )}
                          <th className='px-2 py-2 text-left'>Modul</th>
                          {data.dates.map((date) => (
                            <th key={date} className='px-2 py-2 text-right'>
                              {dayLabel(date)}
                            </th>
                          ))}
                          <th className='px-2 py-2 text-right'>Pot BPJS</th>
                          <th className='bg-emerald-50 px-2 py-2 text-right dark:bg-emerald-950/30'>
                            Total Upah
                          </th>
                          <th className='px-2 py-2 text-left'>TTD Penerima</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.rows.map((row, index) => (
                          <tr
                            key={row.employeeUid}
                            className='border-b last:border-0'
                          >
                            <td className='w-7 px-1 py-1 text-center'>
                              {index + 1}
                            </td>
                            <td className='px-2 py-1 font-medium whitespace-nowrap'>
                              {row.employeeNumber}
                            </td>
                            <td className='px-2 py-1 whitespace-nowrap'>
                              {row.fullName}
                            </td>
                            <td className='px-2 py-1 whitespace-nowrap'>
                              {row.employeeType}
                            </td>
                            {sectionUid === 'ALL' && (
                              <td className='px-2 py-1 whitespace-nowrap'>
                                {row.sectionName}
                              </td>
                            )}
                            <td className='px-2 py-1 whitespace-nowrap'>
                              {row.moduleName}
                            </td>
                            {data.dates.map((date) => (
                              <td
                                key={date}
                                className='px-2 py-1 text-right whitespace-nowrap'
                              >
                                {bodyAmount(row.dailyAmounts[date] ?? '0')}
                              </td>
                            ))}
                            <td className='px-2 py-1 text-right whitespace-nowrap'>
                              {bodyAmount(row.bpjsEmployeeDeduction)}
                            </td>
                            <td className='bg-emerald-50 px-2 py-1 text-right font-bold whitespace-nowrap dark:bg-emerald-950/30'>
                              {bodyAmount(row.netPay)}
                            </td>
                            <td className='min-w-20 px-2 py-1' />
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className='border-t bg-muted/40 font-semibold'>
                        <tr>
                          <td
                            colSpan={sectionUid === 'ALL' ? 6 : 5}
                            className='px-2 py-2'
                          >
                            TOTAL
                          </td>
                          {data.dates.map((date) => (
                            <td
                              key={date}
                              className='px-2 py-2 text-right whitespace-nowrap'
                            >
                              {rupiah(data.totals.dailyAmounts[date] ?? '0')}
                            </td>
                          ))}
                          <td className='px-2 py-2 text-right whitespace-nowrap'>
                            {rupiah(data.totals.bpjsEmployeeDeduction)}
                          </td>
                          <td className='px-2 py-2 text-right whitespace-nowrap'>
                            {rupiah(data.totals.netPay)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className='rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground'>
                    Belum ada pekerja pada modul ini di run aktif.
                  </p>
                )}
                <p className='text-xs text-muted-foreground'>
                  Total upah mengikuti hasil Payroll, termasuk tambahan atau
                  potongan lain yang dirinci pada Excel. Dokumen ini tidak
                  otomatis menandai upah telah dibayarkan.
                </p>
              </>
            ) : null}
          </section>
        </div>
        <div className='flex flex-wrap items-center justify-end gap-2 border-t bg-background px-5 py-3'>
          <Button variant='outline' onClick={onClose}>
            Tutup
          </Button>
          {canExport && (
            <Button
              variant='outline'
              disabled={!readyExcel || Boolean(busy)}
              onClick={doExcel}
            >
              {busy === 'EXCEL' ? (
                <LoaderCircle className='mr-2 size-4 animate-spin' />
              ) : (
                <Download className='mr-2 size-4' />
              )}
              Download Excel
            </Button>
          )}
          {canPrint && (
            <Button disabled={!readyPrint || Boolean(busy)} onClick={doPrint}>
              {busy === 'PRINT' ? (
                <LoaderCircle className='mr-2 size-4 animate-spin' />
              ) : (
                <Printer className='mr-2 size-4' />
              )}
              Cetak
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
