import { useRef, useState } from 'react'
import {
  Check,
  Copy,
  Download,
  Link2,
  LoaderCircle,
  Printer,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useRecruitmentPublicLinks } from './data'
import type { RecruitmentPublicLink } from './domain'

export function RecruitmentPublicLinksDialog() {
  const [open, setOpen] = useState(false)
  const links = useRecruitmentPublicLinks(open)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Link2 /> Tautan Form Pelamar
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>Tautan Form Pelamar</DialogTitle>
          <DialogDescription>
            Bagikan tautan atau QR sesuai site tujuan pelamar. Setiap QR akan
            langsung membuka Form Data Pelamar untuk site tersebut.
          </DialogDescription>
        </DialogHeader>

        {links.isPending ? (
          <div
            role='status'
            className='flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground'
          >
            <LoaderCircle className='size-4 animate-spin' /> Memuat tautan...
          </div>
        ) : links.isError ? (
          <div className='grid min-h-40 place-items-center gap-3 rounded-lg border border-dashed p-6 text-center'>
            <p className='text-sm text-muted-foreground'>
              Tautan Form Pelamar gagal dimuat.
            </p>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => void links.refetch()}
            >
              Coba lagi
            </Button>
          </div>
        ) : links.data?.data.length ? (
          <div className='grid gap-3 sm:grid-cols-2'>
            {links.data.data.map((link) => (
              <PublicLinkCard key={link.site.uid} link={link} />
            ))}
          </div>
        ) : (
          <div className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
            Belum ada site yang dapat dibagikan oleh akun ini.
          </div>
        )}

        <p className='text-xs leading-relaxed text-muted-foreground'>
          Jangan mengubah token site setelah QR dibagikan. Perubahan token akan
          membuat tautan dan QR lama tidak dapat digunakan.
        </p>
      </DialogContent>
    </Dialog>
  )
}

function PublicLinkCard({ link }: { link: RecruitmentPublicLink }) {
  const qrRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    if (!link.url || !navigator.clipboard) {
      toast.error('Tautan belum dapat disalin dari browser ini.')
      return
    }
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      toast.success(`Tautan ${link.site.name} berhasil disalin.`)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Tautan gagal disalin. Silakan coba kembali.')
    }
  }

  const download = () => {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg || !link.url) {
      toast.error('QR belum siap diunduh.')
      return
    }
    const clone = svg.cloneNode(true) as SVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    const objectUrl = URL.createObjectURL(
      new Blob([clone.outerHTML], { type: 'image/svg+xml;charset=utf-8' })
    )
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = `form-pelamar-${link.site.code.toLowerCase()}.svg`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    toast.success(`QR ${link.site.name} berhasil diunduh.`)
  }

  const print = () => {
    const svg = qrRef.current?.querySelector('svg')
    if (!svg || !link.url) {
      toast.error('QR belum siap dicetak.')
      return
    }
    const popup = window.open('', '_blank', 'width=720,height=760')
    if (!popup) {
      toast.error('Jendela cetak diblokir oleh browser.')
      return
    }
    popup.opener = null
    popup.document.write(`<!doctype html>
      <html lang="id"><head><meta charset="utf-8"><title>QR Form Pelamar</title>
      <style>body{font-family:Arial,sans-serif;text-align:center;padding:48px;color:#0f172a}h1{font-size:24px;margin:0 0 8px}p{margin:0 0 28px;color:#475569}.qr{display:inline-block;padding:24px;border:1px solid #cbd5e1;border-radius:16px}.url{margin:24px auto 0;max-width:560px;font-size:12px;overflow-wrap:anywhere;color:#64748b}@media print{body{padding:20mm}.qr{break-inside:avoid}}</style>
      </head><body><h1>Form Data Pelamar</h1><p>${escapeHtml(link.site.name)}</p><div class="qr">${svg.outerHTML}</div><div class="url">${escapeHtml(link.url)}</div><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close()}</script></body></html>`)
    popup.document.close()
  }

  return (
    <section className='rounded-xl border p-4'>
      <div className='mb-3'>
        <h3 className='font-semibold'>{link.site.name}</h3>
        <p className='text-xs text-muted-foreground'>{link.site.code}</p>
      </div>

      {link.url ? (
        <>
          <div
            ref={qrRef}
            className='mx-auto mb-4 grid w-fit place-items-center rounded-xl border bg-white p-3'
          >
            <QRCodeSVG
              value={link.url}
              size={176}
              level='M'
              marginSize={1}
              aria-label={`QR Form Pelamar ${link.site.name}`}
            />
          </div>
          <div className='mb-3 rounded-md bg-muted px-3 py-2 text-xs break-all text-muted-foreground'>
            {link.url}
          </div>
          <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
            <Button type='button' variant='outline' size='sm' onClick={copy}>
              {copied ? <Check /> : <Copy />} {copied ? 'Disalin' : 'Salin'}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={download}
            >
              <Download /> Unduh
            </Button>
            <Button type='button' variant='outline' size='sm' onClick={print}>
              <Printer /> Cetak
            </Button>
          </div>
        </>
      ) : (
        <div className='rounded-lg border border-dashed p-4 text-sm text-muted-foreground'>
          Tautan site ini belum dikonfigurasi. Hubungi pengelola sistem.
        </div>
      )}
    </section>
  )
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character] ?? character
  )
}
