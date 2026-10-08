import { useMemo, useState } from 'react'
import { Ban, Info, LoaderCircle, Plus, Percent } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/date-picker'
import {
  dateOnlyFromInput,
  dateOnlyToInput,
} from '@/features/attendance/date-only'
import {
  useProductionCommand,
  useProductionQuantityDeductionOptions,
  useProductionQuantityDeductionPolicies,
} from './data/queries'
import type {
  ProductionQuantityDeductionPolicy,
  ProductionSite,
} from './domain'

type Props = {
  canManage: boolean
  siteFilter: ProductionSite[]
}

const today = () => dateOnlyToInput(new Date())

function PolicyDialog() {
  const [open, setOpen] = useState(false)
  const options = useProductionQuantityDeductionOptions()
  const command = useProductionCommand()
  const [form, setForm] = useState({
    site: '' as ProductionSite | '',
    percentage: '3',
    effectiveFrom: today(),
    effectiveTo: '',
    notes: '',
  })
  const siteOptions = useMemo(
    () => [...new Set((options.data ?? []).map((item) => item.site))],
    [options.data]
  )
  const effectiveSite = form.site || siteOptions[0] || ''
  const percentage = Number(form.percentage.replace(',', '.'))
  const valid =
    Boolean(effectiveSite) &&
    Boolean(form.effectiveFrom) &&
    Number.isFinite(percentage) &&
    percentage >= 0 &&
    percentage < 100 &&
    (!form.effectiveTo || form.effectiveTo >= form.effectiveFrom)

  const save = () => {
    if (!valid || !effectiveSite) return
    command.mutate(
      {
        path: '/production-structure/quantity-deduction-policies',
        body: {
          site: effectiveSite,
          percentage: form.percentage.replace(',', '.'),
          effectiveFrom: form.effectiveFrom,
          effectiveTo: form.effectiveTo || null,
          notes: form.notes.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast.success('Potongan Hasil Linting berhasil disimpan.')
          setOpen(false)
          setForm((current) => ({
            ...current,
            percentage: '3',
            effectiveFrom: today(),
            effectiveTo: '',
            notes: '',
          }))
        },
        onError: () =>
          toast.error(
            'Kebijakan gagal disimpan. Periksa site dan periode potongan.'
          ),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size='sm'>
          <Plus /> Atur Potongan
        </Button>
      </DialogTrigger>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Atur Potongan Hasil Linting</DialogTitle>
          <DialogDescription>
            Berlaku untuk hasil pekerjaan Linting di site terpilih, apa pun
            bagian karyawannya. Site tanpa kebijakan tetap dihitung penuh.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='grid gap-2'>
            <Label>Site</Label>
            <Select
              value={effectiveSite}
              onValueChange={(site: ProductionSite) =>
                setForm((current) => ({
                  ...current,
                  site,
                }))
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue placeholder='Pilih site' />
              </SelectTrigger>
              <SelectContent>
                {siteOptions.map((site) => (
                  <SelectItem key={site} value={site}>
                    {site}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='grid gap-2'>
            <Label htmlFor='linting-deduction-percentage'>Potongan (%)</Label>
            <div className='relative'>
              <Input
                id='linting-deduction-percentage'
                inputMode='decimal'
                value={form.percentage}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    percentage: event.target.value,
                  }))
                }
                className='pe-9'
                placeholder='3'
              />
              <Percent className='pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
            </div>
            <p className='text-xs text-muted-foreground'>
              Isi 0 sampai kurang dari 100. Nilai 0% berarti tidak ada potongan
              pada periode tersebut.
            </p>
          </div>
          <div className='grid gap-2'>
            <Label>Berlaku mulai</Label>
            <DatePicker
              selected={dateOnlyFromInput(form.effectiveFrom)}
              onSelect={(date) =>
                setForm((current) => ({
                  ...current,
                  effectiveFrom: dateOnlyToInput(date),
                }))
              }
              placeholder='Pilih tanggal mulai'
            />
          </div>
          <div className='grid gap-2'>
            <Label>Berlaku sampai (opsional)</Label>
            <DatePicker
              selected={dateOnlyFromInput(form.effectiveTo)}
              onSelect={(date) =>
                setForm((current) => ({
                  ...current,
                  effectiveTo: dateOnlyToInput(date),
                }))
              }
              placeholder='Berlaku seterusnya'
            />
          </div>
          <div className='grid gap-2 sm:col-span-2'>
            <Label htmlFor='linting-deduction-notes'>Catatan</Label>
            <Textarea
              id='linting-deduction-notes'
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder='Opsional'
            />
          </div>
        </div>
        <div className='flex gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground'>
          <Info className='mt-0.5 size-4 shrink-0' />
          Potongan dihitung dari total PCS Linting harian. Tarif per PCS tidak
          berubah. Hari yang sudah memiliki setoran tetap memakai kebijakan
          sebelumnya.
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button disabled={!valid || command.isPending} onClick={save}>
            {command.isPending && <LoaderCircle className='animate-spin' />}
            Simpan Kebijakan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeactivatePolicyDialog({
  policy,
}: {
  policy: ProductionQuantityDeductionPolicy
}) {
  const [open, setOpen] = useState(false)
  const [effectiveTo, setEffectiveTo] = useState(today())
  const [reason, setReason] = useState('')
  const command = useProductionCommand()
  const valid =
    effectiveTo >= policy.effectiveFrom && reason.trim().length >= 10

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size='sm' variant='ghost'>
          <Ban /> Nonaktifkan
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Nonaktifkan Potongan</DialogTitle>
          <DialogDescription>
            Setelah tanggal selesai, setoran Linting kembali dihitung tanpa
            potongan jika tidak ada kebijakan pengganti.
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-4'>
          <div className='grid gap-2'>
            <Label>Tanggal terakhir berlaku</Label>
            <DatePicker
              selected={dateOnlyFromInput(effectiveTo)}
              onSelect={(date) => setEffectiveTo(dateOnlyToInput(date))}
              placeholder='Pilih tanggal'
            />
          </div>
          <div className='grid gap-2'>
            <Label htmlFor={`deduction-reason-${policy.uid}`}>Alasan</Label>
            <Textarea
              id={`deduction-reason-${policy.uid}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder='Minimal 10 karakter'
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            variant='destructive'
            disabled={!valid || command.isPending}
            onClick={() =>
              command.mutate(
                {
                  path: `/production-structure/quantity-deduction-policies/${policy.uid}/deactivate`,
                  body: { effectiveTo, reason: reason.trim() },
                },
                {
                  onSuccess: () => {
                    toast.success('Kebijakan potongan dinonaktifkan.')
                    setOpen(false)
                  },
                  onError: () =>
                    toast.error('Kebijakan potongan gagal dinonaktifkan.'),
                }
              )
            }
          >
            {command.isPending && <LoaderCircle className='animate-spin' />}
            Nonaktifkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

export function ProductionQuantityDeductionPolicyPanel({
  canManage,
  siteFilter,
}: Props) {
  const policies = useProductionQuantityDeductionPolicies({
    page: 1,
    pageSize: 500,
    site: siteFilter,
  })

  return (
    <Card>
      <CardHeader className='flex flex-row items-start justify-between gap-3 space-y-0 pb-3'>
        <div className='space-y-1'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Percent className='size-4 text-primary' /> Potongan Hasil Linting
          </CardTitle>
          <p className='text-sm text-muted-foreground'>
            Mengurangi PCS pekerjaan Linting yang dihitung sebagai upah, untuk
            semua bagian karyawan di site tersebut. Tanpa kebijakan, potongan
            0%.
          </p>
        </div>
        {canManage && <PolicyDialog />}
      </CardHeader>
      <CardContent className='space-y-3'>
        {policies.isFetching && (
          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
            <LoaderCircle className='size-3 animate-spin' /> Memperbarui
            kebijakan...
          </div>
        )}
        <div className='overflow-x-auto rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site & Pekerjaan</TableHead>
                <TableHead>Potongan</TableHead>
                <TableHead>Periode</TableHead>
                <TableHead>Status</TableHead>
                {canManage && (
                  <TableHead className='text-right'>Aksi</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {(policies.data?.items ?? []).map((policy) => (
                <TableRow key={policy.uid}>
                  <TableCell>
                    <div className='font-medium'>{policy.siteName}</div>
                    <div className='text-xs text-muted-foreground'>
                      {policy.site} · {policy.job.name}
                    </div>
                  </TableCell>
                  <TableCell className='font-semibold'>
                    {Number(policy.percentage).toLocaleString('id-ID', {
                      maximumFractionDigits: 4,
                    })}
                    %
                  </TableCell>
                  <TableCell className='whitespace-nowrap'>
                    {formatDate(policy.effectiveFrom)} –{' '}
                    {policy.effectiveTo
                      ? formatDate(policy.effectiveTo)
                      : 'seterusnya'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        policy.status === 'ACTIVE' ? 'default' : 'secondary'
                      }
                    >
                      {policy.status === 'ACTIVE' ? 'Aktif' : 'Tidak aktif'}
                    </Badge>
                  </TableCell>
                  {canManage && (
                    <TableCell className='text-right'>
                      {policy.status === 'ACTIVE' && (
                        <DeactivatePolicyDialog policy={policy} />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {!policies.isLoading && !policies.data?.items.length && (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 5 : 4}
                    className='h-20 text-center text-sm text-muted-foreground'
                  >
                    Belum ada potongan yang diatur. Seluruh hasil Linting masih
                    dihitung 100%.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
