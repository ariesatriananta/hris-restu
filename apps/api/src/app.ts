import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import { env } from './config.js'
import { errorHandler } from './lib/errors.js'
import { healthRouter } from './routes/health.js'
import { authRouter } from './routes/auth.js'
import { filesRouter } from './routes/files.js'
import { employeesRouter } from './routes/employees.js'
export const app = express()
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use('/api/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/files', filesRouter)
app.use('/api/employees', employeesRouter)
app.use(errorHandler)
