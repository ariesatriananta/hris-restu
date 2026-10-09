import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'
import type { Shift } from './domain'
import { ShiftAssignmentDialog } from './shift-dialogs'

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  apply: vi.fn(),
  create: vi.fn(),
  select: vi.fn(),
  blocked: false,
  holdPreview: false,
}))
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(
    new Date()
  )
const employeeUid = '11111111-1111-4111-8111-111111111111'
const candidates = {
  data: {
    total: 1,
    items: [
      {
        uid: employeeUid,
        employeeNumber: 'EMP-001',
        fullName: 'Karyawan Uji',
        site: 'SEMARANG',
        employeeType: 'BORONGAN',
        hasAssignmentHistory: true,
        minimumEffectiveFrom: today(),
        canBackdateFirstAssignment: false,
      },
    ],
  },
  isFetching: false,
}
vi.mock('@/features/attendance/data/queries', () => ({
  useShiftAssignmentCandidates: () => candidates,
  useCreateShiftAssignments: () => ({ mutate: mocks.create, isPending: false }),
  useApplyShiftBackdate: () => ({ mutate: mocks.apply, isPending: false }),
  useSelectShiftCandidates: () => ({ mutate: mocks.select, isPending: false }),
  useSaveShift: () => ({ mutate: vi.fn(), isPending: false }),
  usePreviewShiftBackdate: () => {
    const [data, setData] = useState<unknown>()
    const [isPending, setPending] = useState(false)
    return {
      data,
      isPending,
      mutate: (input: unknown, options: { onSuccess: () => void }) => {
        mocks.preview(input)
        if (mocks.holdPreview) {
          setPending(true)
          return
        }
        setData({
          previewToken: 'token',
          canApply: !mocks.blocked,
          items: [
            {
              employeeUid,
              employeeNumber: 'EMP-001',
              employeeName: 'Karyawan Uji',
              canApply: !mocks.blocked,
              attendanceCount: 5,
              blockers: mocks.blocked
                ? ['Karyawan belum eligible pada tanggal pilihan.']
                : [],
            },
          ],
        })
        options.onSuccess()
      },
    }
  },
}))
vi.mock('@/components/date-picker', () => ({
  DatePicker: ({
    selected,
    onSelect,
    placeholder,
    disabledDates,
  }: {
    selected?: Date
    onSelect: (date: Date | undefined) => void
    placeholder?: string
    disabledDates?: (date: Date) => boolean
  }) => (
    <input
      aria-label={placeholder ?? 'Tanggal mulai'}
      type='date'
      value={dateOnlyToInput(selected)}
      data-past-disabled={Boolean(
        disabledDates?.(dateOnlyFromInput('2026-08-03')!)
      )}
      onChange={(event) => onSelect(dateOnlyFromInput(event.target.value))}
    />
  ),
}))
const shift: Shift = {
  uid: '22222222-2222-4222-8222-222222222222',
  code: 'PAGI',
  name: 'Shift Pagi',
  site: 'SEMARANG',
  siteName: 'Semarang',
  startTime: '06:00',
  endTime: '15:00',
  crossesMidnight: false,
  lateToleranceMinutes: 0,
  earlyLeaveToleranceMinutes: 0,
  isActive: true,
  hasAttendance: true,
  assignmentCount: 1,
}
const employeeUids = [employeeUid]

describe('Atur/Ganti Shift backdate operasional', () => {
  beforeEach(() => {
    mocks.preview.mockReset()
    mocks.apply.mockReset()
    mocks.create.mockReset()
    mocks.select.mockReset()
    mocks.blocked = false
    mocks.holdPreview = false
  })

  it('hasil preview lama tidak bisa diterapkan selama preview ulang masih berjalan', async () => {
    const screen = await render(
      <ShiftAssignmentDialog
        open
        onOpenChange={() => {}}
        shifts={[shift]}
        initialEmployeeUids={employeeUids}
        backdateGoLiveDate='2026-08-01'
      />
    )
    await screen.getByText('Pilih shift', { exact: true }).click()
    await screen
      .getByRole('option', { name: 'Shift Pagi (06:00–15:00)' })
      .click()
    await screen.getByLabelText('Tanggal mulai').fill('2026-08-03')
    await screen
      .getByLabelText('Alasan perubahan')
      .fill('Perubahan jadwal tiga hari kerja.')
    await screen.getByRole('button', { name: 'Tinjau 1 perubahan' }).click()
    await expect
      .element(screen.getByRole('button', { name: 'Terapkan perubahan' }))
      .toBeEnabled()
    mocks.holdPreview = true
    await screen.getByRole('button', { name: 'Tinjau 1 perubahan' }).click()
    await expect
      .element(screen.getByRole('button', { name: 'Terapkan perubahan' }))
      .not.toBeInTheDocument()
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it('onboarding tanpa opsi operasional tetap memakai batas lama dan endpoint batch lama', async () => {
    const screen = await render(
      <ShiftAssignmentDialog
        open
        onOpenChange={() => {}}
        shifts={[shift]}
        initialEmployeeUids={employeeUids}
      />
    )
    await expect
      .element(screen.getByPlaceholder('Nama atau nomor...'))
      .toBeInTheDocument()
    await expect
      .element(screen.getByLabelText('Tanggal mulai'))
      .toHaveAttribute('data-past-disabled', 'true')
    await screen.getByText('Pilih shift', { exact: true }).click()
    await screen
      .getByRole('option', { name: 'Shift Pagi (06:00–15:00)' })
      .click()
    await screen.getByRole('button', { name: 'Tinjau 1 perubahan' }).click()
    await screen.getByRole('button', { name: 'Ya, simpan perubahan' }).click()
    expect(mocks.create).toHaveBeenCalled()
    expect(mocks.preview).not.toHaveBeenCalled()
    expect(mocks.apply).not.toHaveBeenCalled()
  })

  it.each([false, true])(
    'backdate memerlukan preview, alasan, dan seluruh kandidat siap: blocked=%s',
    async (blocked) => {
      mocks.blocked = blocked
      const screen = await render(
        <ShiftAssignmentDialog
          open
          onOpenChange={() => {}}
          shifts={[shift]}
          initialEmployeeUids={employeeUids}
          backdateGoLiveDate='2026-08-01'
        />
      )
      await expect
        .element(screen.getByLabelText('Tanggal mulai'))
        .toHaveAttribute('data-past-disabled', 'false')
      await screen
        .getByRole('button', { name: 'Pilih semua hasil filter' })
        .click()
      expect(mocks.select).toHaveBeenCalledWith(
        expect.objectContaining({ site: ['SEMARANG'], page: 1, pageSize: 500 }),
        expect.anything()
      )
      await screen.getByText('Pilih shift', { exact: true }).click()
      await screen
        .getByRole('option', { name: 'Shift Pagi (06:00–15:00)' })
        .click()
      await screen.getByLabelText('Tanggal mulai').fill('2026-08-03')
      await screen.getByRole('button', { name: 'Tinjau 1 perubahan' }).click()
      expect(mocks.preview).toHaveBeenCalledWith(
        expect.objectContaining({ effectiveFrom: '2026-08-03', employeeUids })
      )
      if (blocked) {
        await expect
          .element(screen.getByText(/Karyawan belum eligible/))
          .toBeInTheDocument()
        await expect
          .element(screen.getByRole('button', { name: 'Terapkan perubahan' }))
          .not.toBeInTheDocument()
      } else {
        await expect
          .element(screen.getByRole('button', { name: 'Terapkan perubahan' }))
          .toBeDisabled()
        await screen
          .getByLabelText('Alasan perubahan')
          .fill('Perubahan jadwal tiga hari kerja.')
        await screen.getByRole('button', { name: 'Terapkan perubahan' }).click()
        await screen
          .getByRole('button', { name: 'Ya, simpan perubahan' })
          .click()
        expect(mocks.apply).toHaveBeenCalledWith(
          expect.objectContaining({
            effectiveFrom: '2026-08-03',
            reason: 'Perubahan jadwal tiga hari kerja.',
            previewToken: 'token',
          }),
          expect.anything()
        )
        await screen
          .getByRole('button', { name: 'Cancel', exact: true })
          .click()
        await screen.getByLabelText('Tanggal mulai').fill('2026-08-04')
        await expect
          .element(screen.getByRole('button', { name: 'Terapkan perubahan' }))
          .not.toBeInTheDocument()
      }
      expect(mocks.create).not.toHaveBeenCalled()
    }
  )
})
