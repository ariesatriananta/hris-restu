import type { Pool } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { readProductionQcBatch } from './production-qc-storage.js'

describe('batched production QC snapshots', () => {
  it('reads 500 transactions in two queries, keeping optional fields and saved labels', async () => {
    const ids = Array.from({length:500}, (_,index) => index+1)
    const query = vi.fn()
      .mockResolvedValueOnce([[
        {id:91,transactionId:1,brandUid:'brand',brandCode:'BR-OLD',brandName:'Saved brand',weight1Grams:'71.29',weight2Grams:null},
        {id:92,transactionId:2,brandUid:null,weight1Grams:null,weight2Grams:'70.05'},
      ]])
      .mockResolvedValueOnce([[
        {qcId:91,uid:'defect-a',code:'DF-OLD',name:'Saved defect',sortOrder:2,quantity:3},
        {qcId:92,uid:'defect-b',code:'DF-B',name:'Other defect',sortOrder:5,quantity:0},
      ]])
    const result = await readProductionQcBatch({query} as unknown as Pool, ids)
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls[0][1]).toEqual(ids)
    expect(query.mock.calls[1][1]).toEqual([91,92])
    expect(result.get(1)).toEqual({brand:{uid:'brand',code:'BR-OLD',name:'Saved brand'},weight1Grams:'71.29',weight2Grams:null,defects:[{uid:'defect-a',code:'DF-OLD',name:'Saved defect',sortOrder:2,quantity:3}]})
    expect(result.get(2)).toMatchObject({brand:null,weight1Grams:null,weight2Grams:'70.05',defects:[{quantity:0}]})
    expect(result.has(3)).toBe(false)
    expect(query.mock.calls[0][0]).toContain('qc.brand_name_snapshot')
    expect(query.mock.calls[1][0]).toContain('detail.defect_name_snapshot')
    expect(query.mock.calls[1][0]).toContain('ORDER BY detail.sort_order_snapshot,detail.id')
  })

  it('skips reads for empty pages and skips defects when no QC exists', async () => {
    const query = vi.fn().mockResolvedValue([[]])
    const conn = {query} as unknown as Pool
    expect((await readProductionQcBatch(conn, [])).size).toBe(0)
    expect(query).not.toHaveBeenCalled()
    expect((await readProductionQcBatch(conn, [1,2])).size).toBe(0)
    expect(query).toHaveBeenCalledTimes(1)
  })
})
