import { describe, expect, it } from 'vitest'
import { klatenLegacySourceHash } from './employee-archive-policy.js'
import { recruitmentLegacy, recruitmentLegacyDefaults, recruitmentLegacyNumber, recruitmentFile, recruitmentMissingFields } from './recruitment-legacy.js'

const legacy = (number = 'PSLO-9901-01001') => ({
  sourceHash: klatenLegacySourceHash,
  sourceEmployee: { employee_number:number, notes:JSON.stringify({legacyImport:{sourceHash:klatenLegacySourceHash}}),
    join_date:'2025-06-21',join_date_training:'2025-06-01',join_date_borong:'2025-06-21',bank_name:'Bank Contoh' },
})

describe('trusted recruitment legacy provenance', () => {
  it('accepts exact approved source and requires the original employee provenance', () => {
    expect(recruitmentLegacy(JSON.stringify(legacy()))).toBeDefined()
    for (const value of [null,'bad json',{}, {...legacy(),sourceHash:'other'}, {...legacy(),sourceEmployee:{notes:'catatan'}}]) expect(recruitmentLegacy(value)).toBeUndefined()
  })
  it('reuses valid original numbers while placeholders receive a fresh normal number', () => {
    expect(recruitmentLegacyNumber(legacy())).toBe('PSLO-9901-01001')
    expect(recruitmentLegacyNumber(legacy('LEG-KLT-1234'))).toBeNull()
    expect(recruitmentLegacyNumber(legacy('PSLO-invalid'))).toBeNull()
  })
  it('preserves personal defaults but does not infer actual employment dates from unverified archives', () => {
    expect(recruitmentLegacyDefaults(legacy())).toEqual(expect.objectContaining({bankName:'Bank Contoh',joinDate:null,joinDateTraining:null,joinDateBorong:null}))
    expect(recruitmentLegacyDefaults(null)).toEqual({})
  })
  it('exposes canonical Drive preview without fake uploaded metadata', () => {
    expect(recruitmentFile({uid:'doc',kind:'KTP',externalUrl:'https://drive.google.com/open?id=abcdefghijk'})).toEqual(expect.objectContaining({sourceType:'GOOGLE_DRIVE',previewUrl:'https://drive.google.com/file/d/abcdefghijk/preview',externalUrl:'https://drive.google.com/file/d/abcdefghijk/view',sizeBytes:0}))
    expect(recruitmentFile({uid:'file',kind:'PHOTO',mimeType:'image/jpeg',sizeBytes:10})).toEqual(expect.objectContaining({sourceType:'UPLOAD',externalUrl:null,previewUrl:null,sizeBytes:10}))
  })
  it('reports unknown core fields as missing, without inventing privacy consent', () => {
    expect(recruitmentMissingFields({nationalIdNumber:'1234567890123456',phone:'080000000'})).toEqual(['familyCardNumber','gender','birthPlace','birthDate','educationLevel','address'])
  })
})
