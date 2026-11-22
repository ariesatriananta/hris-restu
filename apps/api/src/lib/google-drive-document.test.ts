import { describe, expect, it } from 'vitest'
import { googleDriveDocument } from './google-drive-document.js'
describe('Drive file URLs', () => {
  it('normalizes file/open/uc links and preserves resource keys', () => {
    for (const path of ['/file/d/synthetic_123456/view?usp=sharing', '/open?id=synthetic_123456', '/uc?id=synthetic_123456&export=download']) {
      expect(googleDriveDocument(`https://drive.google.com${path}`)?.url).toBe('https://drive.google.com/file/d/synthetic_123456/view')
    }
    expect(googleDriveDocument('https://drive.google.com/file/d/synthetic_123456/view?resourcekey=0-test')?.previewUrl).toBe('https://drive.google.com/file/d/synthetic_123456/preview?resourcekey=0-test')
  })
  it.each(['javascript:alert(1)', 'http://drive.google.com/file/d/synthetic_123456/view', 'https://drive.google.com.evil.test/open?id=synthetic_123456', 'https://evil@drive.google.com/open?id=synthetic_123456', 'https://drive.google.com/drive/folders/synthetic_123456', 'https://drive.google.com/open?id=../bad'])('rejects %s', value => expect(googleDriveDocument(value)).toBeUndefined())
})
