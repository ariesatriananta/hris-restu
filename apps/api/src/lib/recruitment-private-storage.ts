import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { env } from '../config.js'
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

export async function putPrivateRecruitmentObject(input: {
  key: string
  body: Buffer
  contentType: string
}) {
  await client.send(
    new PutObjectCommand({
      Bucket: privateRecruitmentBucket(),
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    })
  )
}

export async function deletePrivateRecruitmentObject(key: string) {
  await client.send(
    new DeleteObjectCommand({
      Bucket: privateRecruitmentBucket(),
      Key: key,
    })
  )
}

export function recruitmentObjectKey(candidateUid: string, fileUid: string) {
  return `${privateRecruitmentPrefix()}${candidateUid}/${fileUid}.jpg`
}
