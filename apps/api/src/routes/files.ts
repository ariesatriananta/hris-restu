import { createHash, randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Router, type RequestHandler } from 'express'
import multer from 'multer'
import type { ResultSetHeader } from 'mysql2'
import { env } from '../config.js'
import { pool } from '../db.js'
import { writeAudit } from '../lib/audit.js'
import { authenticate, type AuthContext } from '../middleware/authenticate.js'
import { ApiError } from '../lib/errors.js'

const client = new S3Client({ region:'auto', endpoint:`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials:{ accessKeyId:env.R2_ACCESS_KEY_ID, secretAccessKey:env.R2_SECRET_ACCESS_KEY } })
const allowed = new Set(['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
const upload = multer({ storage:multer.memoryStorage(), limits:{ fileSize:10*1024*1024 }, fileFilter:(_req,file,cb)=>cb(null,allowed.has(file.mimetype)) })
export const filesRouter = Router()
const mayUpload: RequestHandler = (_req, res, next) => {
  const auth = res.locals.auth as AuthContext
  if (auth.roles.includes('SUPER_ADMIN') || auth.permissions.includes('employees.manage') || auth.permissions.includes('documents.manage')) return next()
  return next(new ApiError(403, 'Anda tidak memiliki izin untuk mengunggah file.'))
}
filesRouter.post('/',authenticate,mayUpload,upload.single('file'),async(req,res,next)=>{ try { if(!req.file) throw new ApiError(400,'File wajib diisi dan formatnya harus didukung.'); const auth=res.locals.auth as AuthContext; const employeeKey=typeof req.body.employeeKey==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(req.body.employeeKey)?req.body.employeeKey:undefined; const uid=randomUUID(), extension=extname(req.file.originalname).replace('.','').toLowerCase(), storedName=`${uid}${extension?`.${extension}`:''}`, prefix=env.R2_KEY_PREFIX.replace(/\/?$/,'/'), key=`${prefix}${employeeKey?`employees/${employeeKey}/`:''}${storedName}`; await client.send(new PutObjectCommand({Bucket:env.R2_BUCKET_NAME,Key:key,Body:req.file.buffer,ContentType:req.file.mimetype})); const checksum=createHash('sha256').update(req.file.buffer).digest('hex'); const [inserted]=await pool.execute<ResultSetHeader>(`INSERT INTO files(uid,storage_provider,storage_path,original_name,stored_name,mime_type,extension,size_bytes,checksum_sha256,visibility,uploaded_by,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,'INTERNAL',?,?,?)`,[uid,'S3',key,req.file.originalname,storedName,req.file.mimetype,extension||null,req.file.size,checksum,auth.id,auth.id,auth.id]); await writeAudit({auth,request:req,action:'CREATE',table:'files',recordId:inserted.insertId,recordUid:uid,description:`Mengunggah file ${req.file.originalname}.`}); res.status(201).json({uid,originalName:req.file.originalname,mimeType:req.file.mimetype,sizeBytes:req.file.size,extension:extension||undefined,url:`${env.R2_PUBLIC_BASE_URL.replace(/\/$/,'')}/${key}`}) } catch(e){ next(e) } })
