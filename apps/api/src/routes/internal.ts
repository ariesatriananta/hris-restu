import { Router } from 'express'
import { env } from '../config.js'
import { ApiError } from '../lib/errors.js'
import { runContractsReconcile } from '../lib/cron-reconcile.js'
export const internalRouter = Router()
internalRouter.post('/contracts/reconcile', async (req,res,next)=>{ try { if(req.get('x-cron-secret')!==env.CONTRACT_LIFECYCLE_CRON_SECRET) throw new ApiError(401,'Secret cron tidak valid.'); res.json(await runContractsReconcile()) } catch(error){next(error)} })
