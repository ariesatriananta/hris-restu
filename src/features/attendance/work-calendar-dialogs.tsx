import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { LoaderCircle } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'
import {
  useAssignCollectiveLeaveSites,
  useCancelWorkCalendar,
  useCreateWorkCalendarRule,
  useWorkCalendarResolution,
  useUpdateWorkCalendarRule,
} from './data/work-calendar-queries'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'
import type { AttendanceSite, AttendanceSiteCode } from './domain'
import type {
  WorkCalendarEntry,
  WorkCalendarSiteRuleInput,
} from './work-calendar-domain'
import { dateLabel, workCalendarTypeLabel } from './work-calendar-utils'

export function WorkCalendarRuleDialog({
  open,
  onOpenChange,
  sites,
  value,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sites: AttendanceSite[]
  value?: WorkCalendarEntry
}) {
  const create = useCreateWorkCalendarRule()
  const update = useUpdateWorkCalendarRule()
  const [calendarType, setCalendarType] = useState<
    WorkCalendarSiteRuleInput['calendarType']
  >(
    value?.calendarType === 'WORKDAY_OVERRIDE'
      ? 'WORKDAY_OVERRIDE'
      : 'SITE_HOLIDAY'
  )
  const [siteCode, setSiteCode] = useState<AttendanceSiteCode | ''>(
    value?.sites[0] ?? ''
  )
  const [businessDate, setBusinessDate] = useState(value?.businessDate ?? '')
  const [name, setName] = useState(value?.name ?? '')
  const [reason, setReason] = useState('')

  const editing = Boolean(value)
  const pending = create.isPending || update.isPending
  const resolution = useWorkCalendarResolution(
    editing ? '' : siteCode,
    editing ? '' : businessDate
  )
  const valid =
    name.trim().length >= 3 &&
    reason.trim().length >= 5 &&
    (editing || (Boolean(siteCode) && Boolean(businessDate)))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!valid) return
    const callbacks = {
      onSuccess: () => {
        toast.success(
          editing
            ? 'Aturan kalender berhasil diperbarui.'
            : 'Aturan kalender berhasil ditambahkan.'
        )
        onOpenChange(false)
      },
      onError: (error: Error) =>
        toast.error(apiMessage(error, 'Aturan kalender gagal disimpan.')),
    }
    if (value) {
      update.mutate(
        { uid: value.uid, input: { name: name.trim(), reason: reason.trim() } },
        callbacks
      )
      return
    }
    create.mutate(
      {
        calendarType,
        siteCode: siteCode as AttendanceSiteCode,
        businessDate,
        name: name.trim(),
        reason: reason.trim(),
      },
      callbacks
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Ubah aturan kalender' : 'Tambah aturan kalender site'}
          </DialogTitle>
          <DialogDescription>
            Libur Nasional dan Cuti Bersama berasal dari kalender resmi dan
            tidak dibuat melalui form ini.
          </DialogDescription>
        </DialogHeader>
        <form id='work-calendar-form' className='grid gap-4' onSubmit={submit}>
          {editing && value ? (
            <div className='rounded-md border bg-muted/40 p-3 text-sm'>
              <p className='font-medium'>
                {workCalendarTypeLabel(value.calendarType)} ·{' '}
                {dateLabel(value.businessDate)}
              </p>
              <p className='text-muted-foreground'>
                {value.sites.join(', ') || 'Semua site'}
              </p>
            </div>
          ) : (
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field label='Jenis aturan'>
                <Select
                  value={calendarType}
                  onValueChange={(
                    next: WorkCalendarSiteRuleInput['calendarType']
                  ) => setCalendarType(next)}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='SITE_HOLIDAY'>Libur Site</SelectItem>
                    <SelectItem value='WORKDAY_OVERRIDE'>
                      Hari Kerja Pengganti
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label='Site'>
                <Select
                  value={siteCode}
                  onValueChange={(next: AttendanceSiteCode) =>
                    setSiteCode(next)
                  }
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue placeholder='Pilih site' />
                  </SelectTrigger>
                  <SelectContent>
                    {sites.map((site) => (
                      <SelectItem key={site.uid} value={site.code}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label='Tanggal' className='sm:col-span-2'>
                <DatePicker
                  selected={dateOnlyFromInput(businessDate)}
                  onSelect={(date) => {
                    const next = dateOnlyToInput(date)
                    if (next) setBusinessDate(next)
                  }}
                />
              </Field>
            </div>
          )}
          <Field label='Nama/keterangan'>
            <Input
              value={name}
              maxLength={150}
              placeholder='Contoh: Libur operasional site'
              onChange={(event) => setName(event.target.value)}
              required
            />
          </Field>
          <Field label={editing ? 'Alasan perubahan' : 'Alasan'}>
            <Textarea
              value={reason}
              maxLength={500}
              placeholder='Minimal 5 karakter untuk audit trail.'
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </Field>
          {!editing && calendarType === 'WORKDAY_OVERRIDE' && (
            <p className='rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm'>
              Hari Kerja Pengganti menimpa status libur efektif hanya pada site
              yang dipilih. Aturan libur asal tetap tersimpan.
            </p>
          )}
          {!editing && siteCode && businessDate && (
            <div
              className='rounded-md border bg-muted/40 p-3 text-sm'
              role='status'
            >
              {resolution.isPending
                ? 'Memeriksa status efektif tanggal...'
                : resolution.isError
                  ? 'Preview status belum dapat dimuat. Validasi tetap dilakukan saat disimpan.'
                  : resolution.data?.dayType
                    ? `Status saat ini: ${resolution.data.dayType === 'HOLIDAY' ? 'Libur' : 'Hari kerja'}${resolution.data.name ? ` · ${resolution.data.name}` : ''}.`
                    : 'Belum ada aturan kalender aktif pada site dan tanggal ini.'}
            </div>
          )}
        </form>
        <DialogFooter>
          <Button
            variant='outline'
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type='submit'
            form='work-calendar-form'
            disabled={!valid || pending}
          >
            {pending && <LoaderCircle className='animate-spin' />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CollectiveLeaveSitesDialog({
  open,
  onOpenChange,
  value,
  sites,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value?: WorkCalendarEntry
  sites: AttendanceSite[]
}) {
  const save = useAssignCollectiveLeaveSites()
  const [selected, setSelected] = useState<AttendanceSiteCode[]>(
    value?.sites ?? []
  )
  const [reason, setReason] = useState('')

  const changed = useMemo(
    () =>
      [...selected].sort().join(',') !==
      [...(value?.sites ?? [])].sort().join(','),
    [selected, value?.sites]
  )
  const valid = changed && reason.trim().length >= 5

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Atur site Cuti Bersama</DialogTitle>
          <DialogDescription>
            {value ? `${value.name} · ${dateLabel(value.businessDate)}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid gap-2' role='group' aria-label='Site berlaku'>
            {sites.map((site) => {
              const siteCode = site.code as AttendanceSiteCode
              const checked = selected.includes(siteCode)
              return (
                <label
                  key={site.uid}
                  className='flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 text-sm'
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(next) =>
                      setSelected((current) =>
                        next
                          ? [...current, siteCode]
                          : current.filter((code) => code !== siteCode)
                      )
                    }
                  />
                  {site.name}
                </label>
              )
            })}
          </div>
          <Field label='Alasan perubahan'>
            <Textarea
              value={reason}
              maxLength={500}
              placeholder='Minimal 5 karakter untuk audit trail.'
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={!valid || save.isPending}
            onClick={() => {
              if (!value || !valid) return
              save.mutate(
                {
                  eventUid: value.uid,
                  siteCodes: selected,
                  reason: reason.trim(),
                },
                {
                  onSuccess: () => {
                    toast.success('Site Cuti Bersama berhasil diperbarui.')
                    onOpenChange(false)
                  },
                  onError: (error) =>
                    toast.error(
                      apiMessage(error, 'Site Cuti Bersama gagal diperbarui.')
                    ),
                }
              )
            }}
          >
            {save.isPending && <LoaderCircle className='animate-spin' />}
            Simpan site
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CancelWorkCalendarDialog({
  open,
  onOpenChange,
  value,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  value?: WorkCalendarEntry
}) {
  const cancel = useCancelWorkCalendar()
  const [reason, setReason] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Batalkan aturan kalender?</DialogTitle>
          <DialogDescription>
            Aturan {value?.name ?? ''} akan berhenti berlaku. Histori dan audit
            tetap dipertahankan.
          </DialogDescription>
        </DialogHeader>
        <Field label='Alasan pembatalan'>
          <Textarea
            value={reason}
            maxLength={500}
            placeholder='Minimal 5 karakter.'
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        {Boolean(value?.attendanceCount) && (
          <p className='rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm'>
            Ada {value?.attendanceCount} attendance pada tanggal ini. Data scan
            tidak akan dihapus atau diubah.
          </p>
        )}
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Kembali
          </Button>
          <Button
            variant='destructive'
            disabled={reason.trim().length < 5 || cancel.isPending}
            onClick={() => {
              if (!value) return
              cancel.mutate(
                { uid: value.uid, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success('Aturan kalender berhasil dibatalkan.')
                    onOpenChange(false)
                  },
                  onError: (error) =>
                    toast.error(
                      apiMessage(error, 'Aturan kalender gagal dibatalkan.')
                    ),
                }
              )
            }}
          >
            {cancel.isPending && <LoaderCircle className='animate-spin' />}
            Batalkan aturan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <label className={`grid gap-1.5 text-sm font-medium ${className ?? ''}`}>
      {label}
      {children}
    </label>
  )
}

function apiMessage(error: unknown, fallback: string) {
  return isAxiosError(error) &&
    typeof error.response?.data?.message === 'string'
    ? error.response.data.message
    : fallback
}
