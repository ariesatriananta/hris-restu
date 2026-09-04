import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { env } from '../config.js'
import { ApiError } from './errors.js'
import {
  privateRecruitmentBucket,
  privateRecruitmentPrefix,
} from './recruitment-public-config.js'

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

export async function getPrivateRecruitmentObject(key: string) {
  if (!key.startsWith(privateRecruitmentPrefix())) {
    throw new ApiError(404, 'Dokumen kandidat tidak ditemukan.')
  }
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: privateRecruitmentBucket(), Key: key })
    )
    if (!response.Body) throw new Error('Empty object body')
    if ((response.ContentLength ?? 0) > 5 * 1024 * 1024) {
      throw new ApiError(422, 'Ukuran dokumen kandidat tidak valid.')
    }
    const body = Buffer.from(await response.Body.transformToByteArray())
    if (body.length > 5 * 1024 * 1024) {
      throw new ApiError(422, 'Ukuran dokumen kandidat tidak valid.')
    }
    return body
  } catch (error) {
    if (error instanceof ApiError) throw error
    const name = (error as { name?: string }).name
    if (name === 'NoSuchKey' || name === 'NotFound') {
      throw new ApiError(404, 'Dokumen kandidat tidak ditemukan.')
    }
    throw new ApiError(502, 'Dokumen kandidat belum dapat dibuka.')
  }
}
