import { z } from 'zod'

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum)
const contractTargetInput = z.object({
  siteCode: requiredText(30),
  sectionCode: requiredText(50),
  value: z.number().positive().max(999_999_999),
  unit: requiredText(100),
})

export const contractSettingsInput = z
  .object({
    firstParty: z
      .object({
        companyName: requiredText(150),
        directorName: requiredText(150),
        directorTitle: requiredText(100),
        headOfficeAddress: requiredText(500),
      })
      .optional(),
    targets: z.array(contractTargetInput).max(500).default([]),
  })
  .superRefine((input, context) => {
    if (!input.firstParty && input.targets.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Tidak ada perubahan pengaturan untuk disimpan.',
      })
    }
    const seen = new Set<string>()
    input.targets.forEach((target, index) => {
      const key = `${target.siteCode.toUpperCase()}:${target.sectionCode.toUpperCase()}`
      if (seen.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['targets', index],
          message: 'Target site dan bagian produksi tidak boleh duplikat.',
        })
      }
      seen.add(key)
    })
  })
