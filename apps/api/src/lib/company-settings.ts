import { z } from 'zod'

const optionalText = (maximum: number) => z.string().trim().max(maximum)

export const companyProfileInput = z
  .object({
    companyName: z.string().trim().min(1).max(150),
    legalAddress: z.string().trim().min(1).max(500),
    phone: optionalText(30),
    email: z.union([z.literal(''), z.string().trim().email().max(191)]),
    website: z.union([z.literal(''), z.string().trim().url().max(255)]),
    taxNumber: optionalText(50),
    logoFileUid: z.string().uuid().nullable(),
  })
  .strict()

export type CompanyProfileInput = z.infer<typeof companyProfileInput>

export function matchesCompanyLogoSignature(
  buffer: Buffer,
  mimeType: string
) {
  if (mimeType === 'image/jpeg') {
    return buffer.length >= 3 && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  }
  if (mimeType === 'image/png') {
    return (
      buffer.length >= 8 &&
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    )
  }
  if (mimeType === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    )
  }
  return false
}
