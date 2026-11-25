import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { RecruitmentConversionPage } from './recruitment-conversion-page'

const state = vi.hoisted(() => ({
  files: [] as Array<{
    uid: string
    kind: 'PHOTO' | 'KTP' | 'KK'
    sourceType: 'UPLOAD' | 'GOOGLE_DRIVE'
    originalName: string
    mimeType: string
    sizeBytes: number
  }>,
  legacy: true,
  blobCalls: [] as Array<string | undefined>,
}))
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}))
vi.mock('@/features/employees/components/employee-form', () => ({
  EmployeeForm: () => <div>Form siap dilengkapi</div>,
}))
vi.mock('@/features/recruitment/data', () => ({
  useRecruitmentConversionPrefill: () => ({
    isPending: false,
    isError: false,
    data: {
      candidate: {
        files: state.files,
        legacyImport: state.legacy,
        applicationNumber: 'LEG-TEST',
        updatedAt: '2026-11-25T00:00:00Z',
      },
      employeeInput: {},
    },
  }),
  useConvertRecruitmentCandidate: () => ({ isPending: false }),
  useRecruitmentFileBlob: (_candidateUid: string, uid?: string) => {
    state.blobCalls.push(uid)
    return { isPending: true, isError: false }
  },
}))

beforeEach(() => {
  state.files = []
  state.legacy = true
  state.blobCalls = []
})
describe('Konversi calon migrasi', () => {
  it('membuka form tanpa loading abadi ketika hanya memiliki KTP dan KK Drive', async () => {
    state.files = (['KTP', 'KK'] as const).map((kind) => ({
      uid: `drive-${kind}`,
      kind,
      sourceType: 'GOOGLE_DRIVE',
      originalName: kind,
      mimeType: 'application/octet-stream',
      sizeBytes: 0,
    }))
    const screen = await render(
      <RecruitmentConversionPage candidateUid='legacy-candidate' />
    )
    await expect.element(screen.getByText('Form siap dilengkapi')).toBeVisible()
    expect(state.blobCalls.every((uid) => uid === undefined)).toBe(true)
  })
  it('memberi tindakan melengkapi dokumen untuk calon tanpa KTP dan KK', async () => {
    const screen = await render(
      <RecruitmentConversionPage candidateUid='legacy-candidate' />
    )
    await expect
      .element(
        screen.getByRole('heading', { name: 'Dokumen perlu dilengkapi' })
      )
      .toBeVisible()
    await expect
      .element(screen.getByText(/Lengkapi dokumen melalui detail pelamar/))
      .toBeVisible()
  })
  it('tetap memerlukan PHOTO pada kandidat biasa', async () => {
    state.legacy = false
    state.files = (['KTP', 'KK'] as const).map((kind) => ({
      uid: `upload-${kind}`,
      kind,
      sourceType: 'UPLOAD',
      originalName: kind,
      mimeType: 'image/jpeg',
      sizeBytes: 1,
    }))
    const screen = await render(
      <RecruitmentConversionPage candidateUid='normal-candidate' />
    )
    await expect
      .element(screen.getByText(/Belum tersedia: Foto pelamar/))
      .toBeVisible()
    expect(state.blobCalls).toContain('upload-KTP')
  })
})

