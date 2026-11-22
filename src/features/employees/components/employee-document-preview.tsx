import { useState } from 'react'
import { Download, ExternalLink, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { EmployeeDocument } from '../domain'

export function EmployeeDocumentPreview({
  document,
}: {
  document: Pick<
    EmployeeDocument,
    'name' | 'file' | 'externalUrl' | 'externalPreviewUrl'
  >
}) {
  const [open, setOpen] = useState(false)
  const url = document.externalUrl ?? document.file?.url
  const preview = document.externalPreviewUrl
  const isDrive = Boolean(document.externalUrl)
  if (!url) return null
  return (
    <>
      <Button
        type='button'
        size='sm'
        variant='outline'
        onClick={() => setOpen(true)}
      >
        <Eye /> Preview
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-h-[95svh] overflow-y-auto sm:max-w-4xl'>
          <DialogHeader>
            <DialogTitle>{document.name}</DialogTitle>
            <DialogDescription>
              {isDrive
                ? 'Dokumen Google Drive. Jika preview tidak tersedia, buka langsung di Google Drive.'
                : 'Pratinjau dokumen karyawan.'}
            </DialogDescription>
          </DialogHeader>
          {isDrive && preview ? (
            <iframe
              title={`Preview ${document.name}`}
              src={preview}
              referrerPolicy='no-referrer'
              allow='fullscreen'
              className='h-[60svh] w-full rounded-md border'
            />
          ) : document.file?.mimeType.startsWith('image/') ? (
            <img
              src={url}
              alt={document.name}
              className='max-h-[60svh] w-full object-contain'
            />
          ) : document.file?.mimeType === 'application/pdf' ? (
            <iframe
              title={`Preview ${document.name}`}
              src={url}
              className='h-[60svh] w-full rounded-md border'
            />
          ) : (
            <p className='text-sm text-muted-foreground'>
              Preview tidak tersedia untuk dokumen ini.
            </p>
          )}
          <Button asChild variant='outline'>
            <a href={url} target='_blank' rel='noopener noreferrer'>
              <ExternalLink /> {isDrive ? 'Buka di Google Drive' : 'Buka file'}
            </a>
          </Button>
          {!isDrive && (
            <Button asChild variant='outline'>
              <a href={url} download>
                <Download /> Unduh file
              </a>
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
