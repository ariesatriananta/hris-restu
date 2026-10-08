import { z } from 'zod'
import { productionSiteCode } from './production-foundation.js'

const fields = {
  name: z.string().trim().min(1).max(150),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(4294967295).default(0),
}
export const productionDefectInput = z.object(fields).strict()
export const productionBrandInput = z.object({ site: productionSiteCode, ...fields }).strict()
export const productionMasterUpdateInput = z.object({
  name: fields.name.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(4294967295).optional(),
}).strict().refine(value => Object.keys(value).length>0, 'Isi perubahan master.')
export const productionBrandUpdateInput = productionMasterUpdateInput

// Optional API metadata; all interactive forms require brand, only Linting requires weights.
const grams = z.union([z.string(), z.number()])
  .transform(value => String(value).trim().replace(',', '.'))
  .refine(value => /^\d{1,8}(\.\d{1,2})?$/.test(value) && Number(value)>0,
    'Berat harus positif dengan maksimal dua angka desimal.')
  .transform(value => Number(value).toFixed(2))
export const productionQcInput = z.object({
  brandUid: z.string().uuid().nullable().optional(),
  weight1Grams: grams.nullable().optional(),
  weight2Grams: grams.nullable().optional(),
  defects: z.array(z.object({
    defectUid: z.string().uuid(),
    quantity: z.number().int().min(0).max(4294967295),
  }).strict()).max(500).default([]),
}).strict().superRefine((value, context) => {
  if (new Set(value.defects.map(item => item.defectUid)).size !== value.defects.length) {
    context.addIssue({ code: 'custom', path: ['defects'], message: 'Defect tidak boleh berulang.' })
  }
})
