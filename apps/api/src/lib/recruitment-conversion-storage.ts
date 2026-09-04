import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { env } from '../config.js'

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

export function employeeRecruitmentObjectKey(
  employeeUid: string,
  fileUid: string,
  extension: string
) {
  const prefix = env.R2_KEY_PREFIX.replace(/^\/+|\/+$/g, '')
  const safeExtension = extension.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
  return [
    prefix,
    'employees',
    employeeUid,
    'recruitment',
    `${fileUid}.${safeExtension}`,
  ]
    .filter(Boolean)
    .join('/')
}

export async function putEmployeeRecruitmentObject(input: {
  key: string
  body: Buffer
  contentType: string
}) {
  await client.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    })
  )
}

export async function deleteEmployeeRecruitmentObject(key: string) {
  await client.send(
    new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key })
  )
}
