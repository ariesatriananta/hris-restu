import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import { env } from './config.js'
import { errorHandler } from './lib/errors.js'
import { registerProductionFrontend } from './lib/production-frontend.js'
import { attendanceRouter } from './routes/attendance.js'
import { authRouter } from './routes/auth.js'
import { employeesRouter } from './routes/employees.js'
import { filesRouter } from './routes/files.js'
import { healthRouter } from './routes/health.js'
import { internalRouter } from './routes/internal.js'
import { payrollApprovalsRouter } from './routes/payroll-approvals.js'
import { payrollConfigurationRouter } from './routes/payroll-configuration.js'
import { payrollHistoryRouter } from './routes/payroll-history.js'
import { payrollPeriodsRouter } from './routes/payroll-periods.js'
import { payrollSimulationsRouter } from './routes/payroll-simulations.js'
import { productionFoundationRouter } from './routes/production-foundation.js'
import { productionRecapsRouter } from './routes/production-recaps.js'
import { productionStructureRouter } from './routes/production-structure.js'
import { productionTransactionsRouter } from './routes/production-transactions.js'
import { reportsRouter } from './routes/reports.js'
import { systemAuditTrailRouter } from './routes/system-audit-trail.js'
import { systemUserAccessRouter } from './routes/system-user-access.js'
import { systemRouter } from './routes/system.js'

export const app = express()
if (env.NODE_ENV === 'production' && env.TRUST_PROXY) app.set('trust proxy', 1)
app.use(cors({ origin: env.FRONTEND_ORIGIN, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use('/api/health', healthRouter)
app.use('/api/auth', authRouter)
app.use('/api/files', filesRouter)
app.use('/api/employees', employeesRouter)
app.use('/api/internal', internalRouter)
app.use('/api/production-structure', productionFoundationRouter)
app.use('/api/production-structure', productionStructureRouter)
app.use('/api/production', productionTransactionsRouter)
app.use('/api/production', productionRecapsRouter)
app.use('/api/reports', reportsRouter)
app.use('/api/payroll', payrollPeriodsRouter)
app.use('/api/payroll', payrollSimulationsRouter)
app.use('/api/payroll', payrollApprovalsRouter)
app.use('/api/payroll', payrollHistoryRouter)
app.use('/api/payroll', payrollConfigurationRouter)
app.use('/api/system/access-management', systemUserAccessRouter)
app.use('/api/system/audit-trail', systemAuditTrailRouter)
app.use('/api/system', systemRouter)
app.use('/api/attendance', attendanceRouter)
app.use('/api', (_req, res) =>
  res.status(404).json({ message: 'Endpoint API tidak ditemukan.' })
)
if (env.NODE_ENV === 'production') registerProductionFrontend(app)
app.use(errorHandler)
