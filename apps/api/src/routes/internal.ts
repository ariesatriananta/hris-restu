import { Router } from 'express'
import { env } from '../config.js'
import { ApiError } from '../lib/errors.js'
import { reconcileContracts } from '../lib/contract-lifecycle.js'
import { reconcileScheduledMutations } from '../lib/scheduled-mutations.js'
export const internalRouter = Router()
internalRouter.post('/contracts/reconcile', async (req,res,next)=>{ try { if(req.get('x-cron-secret')!==env.CONTRACT_LIFECYCLE_CRON_SECRET) throw new ApiError(401,'Secret cron tidak valid.'); const contracts=await reconcileContracts(); const scheduledMutations=await reconcileScheduledMutations(); res.json({ ...contracts, scheduledMutations }) } catch(error){next(error)} })
