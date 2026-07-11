import { createHash, randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Router } from 'express'
import multer from 'multer'
import type { ResultSetHeader } from 'mysql2'
import { env } from '../config.js'
import { pool } from '../db.js'
import { authenticate, requirePermission, type AuthContext } from '../middleware/authenticate.js'
import { ApiError } from '../lib/errors.js'

const client = new S3Client({ region:'auto', endpoint:`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials:{ accessKeyId:env.R2_ACCESS_KEY_ID, secretAccessKey:env.R2_SECRET_ACCESS_KEY } })
const allowed = new Set(['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
const upload = multer({ storage:multer.memoryStorage(), limits:{ fileSize:10*1024*1024 }, fileFilter:(_req,file,cb)=>cb(null,allowed.has(file.mimetype)) })
export const filesRouter = Router()
filesRouter.post('/',authenticate,requirePermission('documents.manage'),upload.single('file'),async(req,res,next)=>{ try { if(!req.file) throw new ApiError(400,'File wajib diisi dan formatnya harus didukung.'); const auth=res.locals.auth as AuthContext; const uid=randomUUID(), extension=extname(req.file.originalname).replace('.','').toLowerCase(), storedName=`${uid}${extension?`.${extension}`:''}`, key=`${env.R2_KEY_PREFIX.replace(/\/?$/,'/')}${storedName}`; await client.send(new PutObjectCommand({Bucket:env.R2_BUCKET_NAME,Key:key,Body:req.file.buffer,ContentType:req.file.mimetype})); const checksum=createHash('sha256').update(req.file.buffer).digest('hex'); await pool.execute<ResultSetHeader>(`INSERT INTO files(uid,storage_provider,storage_path,original_name,stored_name,mime_type,extension,size_bytes,checksum_sha256,visibility,uploaded_by,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,'INTERNAL',?,?,?)`,[uid,'S3',key,req.file.originalname,storedName,req.file.mimetype,extension||null,req.file.size,checksum,auth.id,auth.id,auth.id]); res.status(201).json({uid,originalName:req.file.originalname,mimeType:req.file.mimetype,sizeBytes:req.file.size,extension:extension||undefined,url:`${env.R2_PUBLIC_BASE_URL.replace(/\/$/,'')}/${key}`}) } catch(e){ next(e) } })
