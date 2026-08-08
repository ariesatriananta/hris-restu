import { useState } from 'react'
import { isAxiosError } from 'axios'
import {
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { DatePicker } from '@/components/date-picker'
import {
  useCreateShiftAssignments,
  useSaveShift,
  useShiftAssignmentCandidates,
} from './data/queries'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'
import type {
  AttendanceEmployeeType,
  AttendanceProductionModuleLookup,
  AttendanceProductionSectionLookup,
  AttendanceSiteCode,
  Shift,
  ShiftAssignmentCandidate,
  ShiftInput,
} from './domain'

const fallbackSiteOptions: { value: AttendanceSiteCode; label: string }[] = [
  { value: 'JEPARA', label: 'Jepara' },
  { value: 'SEMARANG', label: 'Semarang' },
  { value: 'KLATEN', label: 'Klaten' },
]
const employeeTypeOptions: { value: AttendanceEmployeeType; label: string }[] =
  [
    { value: 'BORONGAN', label: 'Borongan' },
    { value: 'HARIAN', label: 'Harian' },
    { value: 'BULANAN', label: 'Bulanan' },
    { value: 'TRAINING', label: 'Training' },
  ]
const weekdays = [
  { value: 1, label: 'Sen' },
  { value: 2, label: 'Sel' },
  { value: 3, label: 'Rab' },
  { value: 4, label: 'Kam' },
  { value: 5, label: 'Jum' },
  { value: 6, label: 'Sab' },
  { value: 7, label: 'Min' },
]

const emptyShift = (): ShiftInput => ({
  siteCode: 'JEPARA',
  code: '',
  name: '',
  startTime: '06:00',
  endTime: '15:00',
  lateToleranceMinutes: 15,
  earlyLeaveToleranceMinutes: 15,
  isActive: true,
})

export function ShiftDialog({
  value,
  open,
  onOpenChange,
  siteOptions = fallbackSiteOptions,
}: {
  value?: Shift
  open: boolean
  onOpenChange: (open: boolean) => void
  siteOptions?: { value: AttendanceSiteCode; label: string }[]
}) {
  const [form, setForm] = useState<ShiftInput>(() =>
    value
      ? {
          siteCode: value.site,
          code: value.code,
          name: value.name,
          startTime: value.startTime.slice(0, 5),
          endTime: value.endTime.slice(0, 5),
          lateToleranceMinutes: value.lateToleranceMinutes,
          earlyLeaveToleranceMinutes: value.earlyLeaveToleranceMinutes,
          isActive: value.isActive,
        }
      : emptyShift()
  )
  const save = useSaveShift()
  const locked = Boolean(value?.hasAttendance)
  const valid =
    form.code.trim() &&
    form.name.trim() &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(form.startTime) &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(form.endTime) &&
    form.startTime !== form.endTime &&
    form.lateToleranceMinutes >= 0 &&
    form.lateToleranceMinutes <= 720 &&
    form.earlyLeaveToleranceMinutes >= 0 &&
    form.earlyLeaveToleranceMinutes <= 720
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!valid) return
    save.mutate(
      {
        uid: value?.uid,
        input: {
          ...form,
          code: form.code.trim().toUpperCase(),
          name: form.name.trim(),
        },
      },
      {
        onSuccess: () => {
          toast.success(
            value ? 'Shift berhasil diperbarui.' : 'Shift berhasil dibuat.'
          )
          onOpenChange(false)
        },
        onError: (error) =>
          toast.error(apiMessage(error, 'Shift gagal disimpan.')),
      }
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{value ? 'Ubah Shift' : 'Tambah Shift'}</DialogTitle>
          <DialogDescription>
            Atur jam kerja dan toleransi attendance. Status lintas hari dihitung
            otomatis oleh server.
          </DialogDescription>
        </DialogHeader>
        {locked && (
          <div className='rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm'>
            Shift ini sudah dipakai pada attendance. Nama dan status masih dapat
            diubah, sedangkan site, kode, jam, dan toleransi dikunci untuk
            menjaga histori.
          </div>
        )}
        <form
          id='shift-form'
          className='grid gap-4 sm:grid-cols-2'
          onSubmit={submit}
        >
          <Field label='Site'>
            <Select
              value={form.siteCode}
              disabled={locked}
              onValueChange={(siteCode: AttendanceSiteCode) =>
                setForm({ ...form, siteCode })
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {siteOptions.map((site) => (
                  <SelectItem key={site.value} value={site.value}>
                    {site.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label='Kode shift'>
            <Input
              value={form.code}
              disabled={locked}
              maxLength={30}
              autoCapitalize='characters'
              onChange={(event) =>
                setForm({ ...form, code: event.target.value.toUpperCase() })
              }
              required
            />
          </Field>
          <Field label='Nama shift' className='sm:col-span-2'>
            <Input
              value={form.name}
              maxLength={100}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              required
            />
          </Field>
          <Field label='Jam mulai'>
            <Input
              type='time'
              value={form.startTime}
              disabled={locked}
              onChange={(event) =>
                setForm({ ...form, startTime: event.target.value })
              }
              required
            />
          </Field>
          <Field label='Jam selesai'>
            <Input
              type='time'
              value={form.endTime}
              disabled={locked}
              onChange={(event) =>
                setForm({ ...form, endTime: event.target.value })
              }
              required
            />
          </Field>
          <Field label='Toleransi terlambat (menit)'>
            <Input
              type='number'
              min={0}
              max={720}
              disabled={locked}
              value={form.lateToleranceMinutes}
              onChange={(event) =>
                setForm({
                  ...form,
                  lateToleranceMinutes: Number(event.target.value),
                })
              }
              required
            />
          </Field>
          <Field label='Toleransi pulang awal (menit)'>
            <Input
              type='number'
              min={0}
              max={720}
              disabled={locked}
              value={form.earlyLeaveToleranceMinutes}
              onChange={(event) =>
                setForm({
                  ...form,
                  earlyLeaveToleranceMinutes: Number(event.target.value),
                })
              }
              required
            />
          </Field>
          <div className='flex items-center justify-between rounded-lg border p-3 sm:col-span-2'>
            <div>
              <Label htmlFor='shift-active'>Shift aktif</Label>
              <p className='text-xs text-muted-foreground'>
                Shift nonaktif tidak dapat dipilih untuk penugasan baru.
              </p>
            </div>
            <Switch
              id='shift-active'
              checked={form.isActive}
              onCheckedChange={(isActive) => setForm({ ...form, isActive })}
            />
          </div>
          {value?.isActive && !form.isActive && (
            <p className='text-sm text-warning-foreground sm:col-span-2'>
              Menonaktifkan shift dapat ditolak jika masih ada penugasan aktif.
              Server tetap menjadi pemeriksaan terakhir.
            </p>
          )}
        </form>
        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Batal
          </Button>
          <Button
            type='submit'
            form='shift-form'
            disabled={!valid || save.isPending}
          >
            {save.isPending && <LoaderCircle className='animate-spin' />} Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ShiftAssignmentDialog({
  open,
  onOpenChange,
  shifts,
  siteOptions = fallbackSiteOptions,
  productionModules = [],
  productionSections = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  shifts: Shift[]
  siteOptions?: { value: AttendanceSiteCode; label: string }[]
  productionModules?: AttendanceProductionModuleLookup[]
  productionSections?: AttendanceProductionSectionLookup[]
}) {
  const [query, setQuery] = useState('')
  const [site, setSite] = useState<AttendanceSiteCode | ''>('')
  const [employeeType, setEmployeeType] = useState<
    AttendanceEmployeeType | 'ALL'
  >('ALL')
  const [productionModule, setProductionModule] = useState('')
  const [productionSection, setProductionSection] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<
    Map<string, ShiftAssignmentCandidate>
  >(new Map())
  const [shiftUid, setShiftUid] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(todayJakarta)
  const [effectiveTo, setEffectiveTo] = useState('')
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [confirm, setConfirm] = useState(false)
  const candidates = useShiftAssignmentCandidates(
    {
      query: query.trim() || undefined,
      site: site ? [site] : undefined,
      employeeType: employeeType === 'ALL' ? undefined : [employeeType],
      productionModule: productionModule.trim()
        ? [productionModule.trim()]
        : undefined,
      productionSection: productionSection.trim()
        ? [productionSection.trim()]
        : undefined,
      page,
      pageSize: 50,
    },
    open && Boolean(site)
  )
  const create = useCreateShiftAssignments()
  const items = candidates.data?.items ?? []
  const selectedVisible = items.filter((item) => selected.has(item.uid)).length
  const allVisible = items.length > 0 && selectedVisible === items.length
  const selectedCandidates = [...selected.values()]
  const minimumEffectiveFrom = selectedMinimumDate(selectedCandidates)
  const firstAssignmentCount = selectedCandidates.filter(
    (candidate) => !candidate.hasAssignmentHistory
  ).length
  const replacementCount = selectedCandidates.filter(
    (candidate) => candidate.hasAssignmentHistory
  ).length
  const backdateEligibleCount = selectedCandidates.filter(
    (candidate) => candidate.canBackdateFirstAssignment
  ).length
  const valid =
    Boolean(site) &&
    selected.size > 0 &&
    selected.size <= 500 &&
    shiftUid &&
    effectiveFrom &&
    effectiveFrom >= minimumEffectiveFrom &&
    workDays.length > 0 &&
    (!effectiveTo || effectiveTo >= effectiveFrom)
  const moduleOptions = dedupeByUid(
    productionModules.filter((module) => !site || module.site === site)
  )
  const sectionOptions = dedupeByUid(
    productionSections.filter(
      (section) =>
        (!site || section.site === site) &&
        (!productionModule || section.moduleUid === productionModule)
    )
  )
  const applySelection = (next: Map<string, ShiftAssignmentCandidate>) => {
    setSelected(next)
    const minimum = selectedMinimumDate([...next.values()])
    if (next.size > 0 && effectiveFrom < minimum) {
      setEffectiveFrom(minimum)
      toast.info(
        `Tanggal mulai disesuaikan ke ${formatDateShort(minimum)} mengikuti batas kandidat terpilih.`
      )
    }
  }
  const toggleCandidate = (
    candidate: ShiftAssignmentCandidate,
    checked: boolean
  ) => {
    const next = new Map(selected)
    if (checked) {
      if (next.size >= 500) {
        toast.error('Maksimal 500 karyawan per penugasan.')
        return
      }
      next.set(candidate.uid, candidate)
    } else next.delete(candidate.uid)
    applySelection(next)
  }
  const toggleVisibleCandidates = (checked: boolean) => {
    const next = new Map(selected)
    if (checked) {
      const available = Math.max(0, 500 - next.size)
      const unselected = items.filter((candidate) => !next.has(candidate.uid))
      unselected.slice(0, available).forEach((candidate) => {
        next.set(candidate.uid, candidate)
      })
      if (unselected.length > available) {
        toast.error('Maksimal 500 karyawan per penugasan.')
      }
    } else {
      items.forEach((candidate) => next.delete(candidate.uid))
    }
    applySelection(next)
  }
  const submit = () => {
    if (!valid) return
    create.mutate(
      {
        shiftUid,
        employeeUids: [...selected.keys()],
        effectiveFrom,
        effectiveTo: effectiveTo || undefined,
        workDays: [...workDays].sort(),
      },
      {
        onSuccess: (result) => {
          toast.success(
            `Shift berhasil disimpan untuk ${result.createdCount} karyawan.${result.backdatedFirstAssignmentCount ? ` ${result.backdatedFirstAssignmentCount} penugasan pertama memakai tanggal lampau.` : ''}${result.invalidatedFinalizationCount > 0 ? ` ${result.invalidatedFinalizationCount} tanggal finalisasi ditandai perlu dijalankan ulang.` : ''}`
          )
          setConfirm(false)
          onOpenChange(false)
        },
        onError: (error) => {
          setConfirm(false)
          toast.error(
            apiMessage(
              error,
              'Penugasan shift gagal disimpan. Tidak ada data yang diubah.'
            )
          )
        },
      }
    )
  }
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className='max-h-[92vh] overflow-y-auto sm:max-w-4xl'>
          <DialogHeader>
            <DialogTitle>Atur / Ganti Shift Karyawan</DialogTitle>
            <DialogDescription>
              Pilih maksimal 500 karyawan. Karyawan yang sudah memiliki shift
              akan diganti mulai tanggal efektif tanpa menghapus histori lama.
            </DialogDescription>
          </DialogHeader>
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
            <Field label='Cari karyawan' className='lg:col-span-2'>
              <div className='relative'>
                <Search className='absolute top-2.5 left-3 size-4 text-muted-foreground' />
                <Input
                  className='pl-9'
                  value={query}
                  placeholder='Nama atau nomor...'
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setPage(1)
                  }}
                />
              </div>
            </Field>
            <SelectField
              label='Site'
              value={site}
              onChange={(value) => {
                setSite(value as typeof site)
                setSelected(new Map())
                setShiftUid('')
                setProductionModule('')
                setProductionSection('')
                setPage(1)
              }}
              options={[
                { value: '__none', label: 'Pilih site' },
                ...siteOptions,
              ]}
              normalizeNone
            />
            <SelectField
              label='Jenis karyawan'
              value={employeeType}
              onChange={(value) => {
                setEmployeeType(value as typeof employeeType)
                setPage(1)
              }}
              options={[
                { value: 'ALL', label: 'Semua jenis' },
                ...employeeTypeOptions,
              ]}
            />
            <div className='hidden lg:block' />
            <SelectField
              label='Modul produksi'
              value={productionModule}
              onChange={(value) => {
                setProductionModule(value)
                setProductionSection('')
                setPage(1)
              }}
              options={[
                { value: '__none', label: 'Semua modul' },
                ...moduleOptions.map((option) => ({
                  value: option.uid,
                  label: `${option.code} · ${option.name}`,
                })),
              ]}
              normalizeNone
            />
            <SelectField
              label='Bagian produksi'
              value={productionSection}
              onChange={(value) => {
                setProductionSection(value)
                setPage(1)
              }}
              options={[
                { value: '__none', label: 'Semua bagian' },
                ...sectionOptions.map((option) => ({
                  value: option.uid,
                  label: `${option.code} · ${option.name}`,
                })),
              ]}
              normalizeNone
            />
          </div>
          <div className='rounded-lg border'>
            <div className='flex items-center justify-between border-b bg-muted/40 px-3 py-2 text-sm'>
              <label className='flex items-center gap-2 font-medium'>
                <Checkbox
                  checked={
                    allVisible
                      ? true
                      : selectedVisible > 0
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(checked) =>
                    toggleVisibleCandidates(checked === true)
                  }
                  aria-label='Pilih semua karyawan pada halaman ini'
                />
                Pilih halaman ini
              </label>
              <span>{selected.size}/500 dipilih</span>
            </div>
            <div className='max-h-64 divide-y overflow-y-auto'>
              {!site ? (
                <p className='p-6 text-center text-sm text-muted-foreground'>
                  Pilih satu site untuk memuat kandidat karyawan.
                </p>
              ) : candidates.isPending ? (
                <p className='p-6 text-center text-sm text-muted-foreground'>
                  Memuat kandidat...
                </p>
              ) : candidates.isError ? (
                <div className='p-6 text-center text-sm'>
                  <p>Kandidat gagal dimuat.</p>
                  <Button
                    size='sm'
                    variant='outline'
                    className='mt-2'
                    onClick={() => void candidates.refetch()}
                  >
                    Coba lagi
                  </Button>
                </div>
              ) : !items.length ? (
                <p className='p-6 text-center text-sm text-muted-foreground'>
                  <Users className='mx-auto mb-2' />
                  Tidak ada karyawan aktif yang sesuai.
                </p>
              ) : (
                items.map((employee) => (
                  <label
                    key={employee.uid}
                    className='flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-muted/40'
                  >
                    <Checkbox
                      checked={selected.has(employee.uid)}
                      onCheckedChange={(checked) =>
                        toggleCandidate(employee, checked === true)
                      }
                      aria-label={`Pilih ${employee.fullName}`}
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='flex min-w-0 flex-wrap items-baseline gap-x-2 leading-5'>
                        <span className='font-medium'>{employee.fullName}</span>
                        <span className='text-xs text-muted-foreground'>
                          {employee.currentShiftName
                            ? `Shift saat ini: ${employee.currentShiftName}${employee.currentShiftEffectiveFrom ? ` sejak ${employee.currentShiftEffectiveFrom}` : ''}`
                            : 'Belum memiliki shift aktif'}
                        </span>
                      </span>
                      <span className='block text-xs text-muted-foreground'>
                        {employee.employeeNumber} · {employee.site} ·{' '}
                        {employee.employeeType}
                        {employee.productionModule
                          ? ` · ${employee.productionModule}`
                          : ''}
                        {employee.productionSection
                          ? ` · ${employee.productionSection}`
                          : ''}
                        <span
                          className={
                            employee.canBackdateFirstAssignment
                              ? 'text-positive'
                              : undefined
                          }
                        >
                          {employee.canBackdateFirstAssignment
                            ? ` · Penugasan pertama ≥ ${formatDateShort(employee.minimumEffectiveFrom)}`
                            : employee.hasAssignmentHistory
                              ? ` · Penggantian shift ≥ ${formatDateShort(employee.minimumEffectiveFrom)}`
                              : ' · Penugasan pertama, tanggal lampau tidak tersedia'}
                        </span>
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
            <div className='flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground'>
              <span>
                Halaman {candidates.data?.page ?? page} dari{' '}
                {Math.max(1, Math.ceil((candidates.data?.total ?? 0) / 50))}
              </span>
              <div className='flex gap-1'>
                <Button
                  size='icon'
                  variant='outline'
                  className='size-8'
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                  aria-label='Halaman kandidat sebelumnya'
                >
                  <ChevronLeft />
                </Button>
                <Button
                  size='icon'
                  variant='outline'
                  className='size-8'
                  disabled={
                    page >= Math.ceil((candidates.data?.total ?? 0) / 50)
                  }
                  onClick={() => setPage((value) => value + 1)}
                  aria-label='Halaman kandidat berikutnya'
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </div>
          <div className='grid gap-4 sm:grid-cols-3'>
            <SelectField
              label='Shift'
              value={shiftUid}
              onChange={setShiftUid}
              options={[
                { value: '__none', label: 'Pilih shift' },
                ...shifts
                  .filter((shift) => shift.isActive && shift.site === site)
                  .map((shift) => ({
                    value: shift.uid,
                    label: `${shift.name} (${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)})`,
                  })),
              ]}
              normalizeNone
            />
            <Field label='Berlaku mulai'>
              <DatePicker
                selected={dateOnlyFromInput(effectiveFrom)}
                onSelect={(date) => {
                  const next = dateOnlyToInput(date)
                  if (!next) return
                  setEffectiveFrom(next)
                  if (effectiveTo && effectiveTo < next) setEffectiveTo(next)
                }}
                disabledDates={(date) => {
                  const minimum = dateOnlyFromInput(minimumEffectiveFrom)
                  return Boolean(minimum && date < minimum)
                }}
              />
              {selected.size > 0 && (
                <p className='text-xs text-muted-foreground'>
                  Batas batch: {formatDateShort(minimumEffectiveFrom)}.
                </p>
              )}
            </Field>
            <Field label='Berlaku sampai (opsional)'>
              <DatePicker
                selected={dateOnlyFromInput(effectiveTo)}
                placeholder='Tanpa tanggal akhir'
                onSelect={(date) => setEffectiveTo(dateOnlyToInput(date))}
                disabledDates={(date) => {
                  const minimum = dateOnlyFromInput(effectiveFrom)
                  return Boolean(minimum && date < minimum)
                }}
              />
            </Field>
          </div>
          <Field label='Hari kerja'>
            <div className='flex flex-wrap gap-2'>
              {weekdays.map((day) => (
                <Button
                  key={day.value}
                  type='button'
                  size='sm'
                  variant={workDays.includes(day.value) ? 'default' : 'outline'}
                  aria-pressed={workDays.includes(day.value)}
                  onClick={() =>
                    setWorkDays((current) =>
                      current.includes(day.value)
                        ? current.filter((value) => value !== day.value)
                        : [...current, day.value]
                    )
                  }
                >
                  {day.label}
                </Button>
              ))}
            </div>
          </Field>
          <div className='flex items-start gap-2 rounded-lg border border-positive/30 bg-positive/5 p-3 text-sm'>
            <ShieldCheck className='mt-0.5 size-4 shrink-0 text-positive' />
            <div>
              <p className='font-medium'>Histori penugasan tetap aman</p>
              <p className='text-muted-foreground'>
                {backdateEligibleCount > 0 && (
                  <>
                    {backdateEligibleCount} penugasan pertama dapat memakai
                    tanggal lampau sesuai batas kandidat.{' '}
                  </>
                )}
                {replacementCount > 0 && (
                  <>
                    {replacementCount} penggantian mengikuti batas tanggal aman
                    dari server.{' '}
                  </>
                )}
                Penugasan berjalan ditutup otomatis H-1; benturan jadwal akan
                menolak seluruh batch.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button disabled={!valid} onClick={() => setConfirm(true)}>
              Tinjau {selected.size} perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title='Konfirmasi atur / ganti shift'
        desc={`Terapkan shift kepada ${selected.size} karyawan mulai ${effectiveFrom}${effectiveTo ? ` sampai ${effectiveTo}` : ''}? ${firstAssignmentCount} penugasan pertama, ${replacementCount} penggantian. Jika satu kandidat melanggar batas tanggal atau bentrok, seluruh batch dibatalkan.`}
        confirmText='Ya, simpan perubahan'
        isLoading={create.isPending}
        handleConfirm={submit}
      />
    </>
  )
}

function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`grid gap-1.5 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  normalizeNone,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  normalizeNone?: boolean
}) {
  return (
    <Field label={label}>
      <Select
        value={value || (normalizeNone ? '__none' : value)}
        onValueChange={(next) =>
          onChange(normalizeNone && next === '__none' ? '' : next)
        }
      >
        <SelectTrigger className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function todayJakarta() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function selectedMinimumDate(candidates: ShiftAssignmentCandidate[]) {
  if (!candidates.length) return todayJakarta()
  const today = todayJakarta()
  return candidates.reduce(
    (minimum, candidate) => {
      const candidateMinimum = candidate.canBackdateFirstAssignment
        ? candidate.minimumEffectiveFrom
        : today
      return candidateMinimum > minimum ? candidateMinimum : minimum
    },
    candidates[0]?.canBackdateFirstAssignment
      ? candidates[0].minimumEffectiveFrom
      : today
  )
}

function formatDateShort(value?: string) {
  const date = dateOnlyFromInput(value ?? todayJakarta())
  if (!date) return value ?? todayJakarta()
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date)
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data.message ?? fallback)
    : fallback
}

function dedupeByUid<T extends { uid: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.uid, item])).values()]
}
