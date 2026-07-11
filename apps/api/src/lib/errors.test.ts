import { describe, expect, it } from 'vitest'
import { ApiError } from './errors.js'
describe('ApiError',()=>{ it('menyimpan status dan pesan publik',()=>{ const error=new ApiError(403,'Ditolak'); expect(error.status).toBe(403); expect(error.message).toBe('Ditolak') }) })
