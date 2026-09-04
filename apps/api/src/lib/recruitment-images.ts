import sharp, { type Metadata } from 'sharp'
import { ApiError } from './errors.js'

const MAX_PIXELS = 25_000_000
const supportedFormats = new Set(['jpeg', 'png', 'webp'])

export type RecruitmentImage = {
  buffer: Buffer
  mimeType: 'image/jpeg'
  extension: 'jpg'
  sizeBytes: number
}

export async function sanitizeRecruitmentImage(
  file: Express.Multer.File
): Promise<RecruitmentImage> {
  let image = sharp(file.buffer, {
    failOn: 'error',
    limitInputPixels: MAX_PIXELS,
    animated: false,
  })
  let metadata: Metadata
  try {
    metadata = await image.metadata()
  } catch {
    throw new ApiError(422, 'Salah satu foto rusak atau bukan gambar yang valid.')
  }
  if (
    !metadata.format ||
    !supportedFormats.has(metadata.format) ||
    !metadata.width ||
    !metadata.height ||
    metadata.width * metadata.height > MAX_PIXELS ||
    (metadata.pages ?? 1) > 1
  ) {
    throw new ApiError(422, 'Foto harus berupa JPG, PNG, atau WebP yang valid.')
  }

  try {
    image = image.rotate()
    const buffer = await image.jpeg({ quality: 88, mozjpeg: true }).toBuffer()
    if (buffer.byteLength > 5 * 1024 * 1024) {
      throw new ApiError(422, 'Ukuran foto setelah diproses melebihi 5 MB.')
    }
    return {
      buffer,
      mimeType: 'image/jpeg',
      extension: 'jpg',
      sizeBytes: buffer.byteLength,
    }
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(422, 'Salah satu foto tidak dapat diproses.')
  }
}
