import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { EmployeeDocumentPreview } from './employee-document-preview'

it('loads the Drive viewer only on request and always offers a direct link', async () => {
  const url = 'https://drive.google.com/file/d/synthetic_file_123456/view'
  const previewUrl =
    'https://drive.google.com/file/d/synthetic_file_123456/preview'
  const screen = await render(
    <EmployeeDocumentPreview
      document={{
        name: 'KTP sintetis',
        externalUrl: url,
        externalPreviewUrl: previewUrl,
      }}
    />
  )
  expect(document.querySelector('iframe')).toBeNull()
  await screen.getByRole('button', { name: 'Preview', exact: true }).click()
  expect(document.querySelector('iframe')?.getAttribute('src')).toBe(previewUrl)
  expect(document.querySelector('iframe')?.getAttribute('referrerpolicy')).toBe(
    'no-referrer'
  )
  await expect
    .element(screen.getByRole('link', { name: 'Buka di Google Drive' }))
    .toHaveAttribute('href', url)
})

it('keeps R2 image preview, direct open and download', async () => {
  const url =
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
  const screen = await render(
    <EmployeeDocumentPreview
      document={{
        name: 'KTP upload',
        file: {
          uid: 'synthetic-upload',
          originalName: 'ktp.gif',
          mimeType: 'image/gif',
          sizeBytes: 42,
          url,
        },
      }}
    />
  )
  await screen.getByRole('button', { name: 'Preview', exact: true }).click()
  await expect
    .element(screen.getByRole('img', { name: 'KTP upload' }))
    .toHaveAttribute('src', url)
  await expect
    .element(screen.getByRole('link', { name: 'Buka file' }))
    .toHaveAttribute('href', url)
  await expect
    .element(screen.getByRole('link', { name: 'Unduh file' }))
    .toBeVisible()
})
