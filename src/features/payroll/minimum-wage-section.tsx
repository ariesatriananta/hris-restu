import { useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import { format, parseISO } from 'date-fns'
import { type ColumnDef } from '@tanstack/react-table'
import { id } from 'date-fns/locale'
import {
  CircleOff,
  LoaderCircle,
  PencilLine,
  Plus,
  RotateCcw,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  siteScopeLabel,
  useSiteScopeFilter,
} from '@/hooks/use-site-scope-filter'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { Textarea } from '@/components/ui/textarea'
import {
  DataTableActionButton,
  DataTableColumnHeader,
} from '@/components/data-table'
import { SiteScopeFilter } from '@/components/site-scope-filter'
import { ConfigurationDataTable } from './configuration-data-table'
import {
  useChangePayrollMinimumWageStatus,
  useCorrectPayrollMinimumWage,
  useCreatePayrollMinimumWage,
  type PayrollMinimumWageInput,
} from './data/queries'
import type { PayrollMinimumWage, PayrollSite } from './domain'
import { formatDecimalString } from './money'

type DialogState = {
  mode: 'create' | 'correct' | 'cancel' | 'reactivate'
  item?: PayrollMinimumWage
} | null

function apiMessage(error: unknown) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data?.message ?? 'Perubahan master UMK gagal disimpan.')
    : 'Perubahan master UMK gagal disimpan.'
}

function createKey(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`
}

function rupiah(value: string) {
  return formatDecimalString(value, {
    currency: true,
    maximumFractionDigits: 0,
  })
}

export function MinimumWageSection({
  queryState,
  sites,
  site,
  year,
  status,
  canManage,
  onFilter,
  search,
  navigate,
}: {
  queryState: ReturnType<typeof import('./data/queries').usePayrollMinimumWages>
  sites: PayrollSite[]
  site: string
  year?: number
  status: string
  page: number
  pageSize: number
  canManage: boolean
  onFilter: (value: Record<string, unknown>) => void
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const [dialog, setDialog] = useState<DialogState>(null)
  const { lockedSite } = useSiteScopeFilter<string>()
  const data = queryState.data
  const sortBy =
    search.sortBy === 'site' ||
    search.sortBy === 'amount' ||
    search.sortBy === 'status' ||
    search.sortBy === 'updatedAt'
      ? search.sortBy
      : 'wageYear'
  const sortDirection = search.sortDirection === 'asc' ? 'asc' : 'desc'
  const columns = useMemo<ColumnDef<PayrollMinimumWage>[]>(
    () => [
      {
        id: 'site',
        accessorFn: (item) => item.site.name,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Site' />
        ),
        cell: ({ row }) => (
          <div className='min-w-36'>
            <p className='font-medium'>{row.original.site.name}</p>
            <p className='text-xs text-muted-foreground'>
              {row.original.site.code}
            </p>
          </div>
        ),
      },
      {
        id: 'wageYear',
        accessorFn: (item) => item.wageYear,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Tahun' />
        ),
        cell: ({ row }) => (
          <span className='font-medium tabular-nums'>
            {row.original.wageYear}
          </span>
        ),
      },
      {
        id: 'amount',
        accessorFn: (item) => item.amount,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Nominal UMK' />
        ),
        cell: ({ row }) => (
          <span className='font-semibold whitespace-nowrap tabular-nums'>
            {rupiah(row.original.amount)}
          </span>
        ),
      },
      {
        id: 'regulationReference',
        accessorFn: (item) => item.regulationReference,
        header: 'Referensi regulasi',
        cell: ({ row }) => (
          <span
            className='block max-w-72 truncate text-sm text-muted-foreground'
            title={row.original.regulationReference ?? undefined}
          >
            {row.original.regulationReference || '—'}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'status',
        accessorFn: (item) => item.status,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Status' />
        ),
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === 'ACTIVE' ? 'default' : 'secondary'}
          >
            {row.original.status === 'ACTIVE' ? 'Aktif' : 'Dibatalkan'}
          </Badge>
        ),
      },
      {
        id: 'updatedAt',
        accessorFn: (item) => item.updatedAt,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title='Terakhir diubah' />
        ),
        cell: ({ row }) => (
          <span className='text-xs whitespace-nowrap text-muted-foreground'>
            {format(parseISO(row.original.updatedAt), 'd MMM yyyy, HH.mm', {
              locale: id,
            })}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className='sr-only'>Aksi</span>,
        cell: ({ row }) =>
          canManage ? (
            <div className='flex justify-end gap-1'>
              {row.original.status === 'ACTIVE' ? (
                <>
                  <DataTableActionButton
                    label='Koreksi UMK'
                    onClick={() =>
                      setDialog({ mode: 'correct', item: row.original })
                    }
                  >
                    <PencilLine />
                  </DataTableActionButton>
                  <DataTableActionButton
                    label='Batalkan UMK'
                    className='text-destructive'
                    onClick={() =>
                      setDialog({ mode: 'cancel', item: row.original })
                    }
                  >
                    <CircleOff />
                  </DataTableActionButton>
                </>
              ) : (
                <DataTableActionButton
                  label='Aktifkan ulang UMK'
                  onClick={() =>
                    setDialog({ mode: 'reactivate', item: row.original })
                  }
                >
                  <RotateCcw />
                </DataTableActionButton>
              )}
            </div>
          ) : null,
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [canManage]
  )

  const filters = (
    <div className='flex max-w-full flex-wrap gap-2'>
      {lockedSite ? (
        <SiteScopeFilter
          siteLabel={siteScopeLabel(
            lockedSite,
            sites.map((item) => ({ value: item.code, label: item.name }))
          )}
        />
      ) : (
        <Select
          value={site || 'ALL'}
          onValueChange={(value) =>
            onFilter({
              site: value === 'ALL' ? undefined : value,
              page: undefined,
            })
          }
        >
          <SelectTrigger className='h-8 w-full sm:w-44'>
            <SelectValue placeholder='Semua site' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='ALL'>Semua site</SelectItem>
            {sites.map((item) => (
              <SelectItem key={item.uid} value={item.code}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Input
        key={year ?? 'all-years'}
        type='number'
        min={2000}
        max={2100}
        defaultValue={year ?? ''}
        placeholder='Semua tahun'
        className='h-8 w-full sm:w-36'
        onBlur={(event) => {
          const value = event.target.value
          if (!value) {
            onFilter({ year: undefined, page: undefined })
            return
          }
          const parsed = Number(value)
          if (Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100) {
            onFilter({ year: parsed, page: undefined })
          } else {
            toast.error('Tahun UMK harus antara 2000 sampai 2100.')
            event.target.value = year ? String(year) : ''
          }
        }}
      />
      <Select
        value={status || 'ALL'}
        onValueChange={(value) =>
          onFilter({
            status: value === 'ALL' ? undefined : value,
            page: undefined,
          })
        }
      >
        <SelectTrigger className='h-8 w-full sm:w-40'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='ALL'>Semua status</SelectItem>
          <SelectItem value='ACTIVE'>Aktif</SelectItem>
          <SelectItem value='CANCELLED'>Dibatalkan</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>UMK Site</h2>
          <p className='text-sm text-muted-foreground'>
            Upah Minimum Kabupaten/Kota per site dan tahun sebagai fondasi
            perhitungan BPJS.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setDialog({ mode: 'create' })}>
            <Plus className='size-4' />
            Tambah UMK
          </Button>
        )}
      </div>

      <ConfigurationDataTable
        data={data?.data ?? []}
        columns={columns}
        search={search}
        navigate={navigate}
        total={data?.meta.total ?? 0}
        totalPages={data?.meta.totalPages ?? 1}
        isPending={queryState.isPending}
        isError={queryState.isError}
        onRetry={() => queryState.refetch()}
        sortBy={sortBy}
        sortDirection={sortDirection}
        searchPlaceholder='Cari site atau referensi regulasi...'
        emptyMessage='Belum ada UMK yang sesuai filter.'
        additionalFilters={filters}
        hasAdditionalFilters={Boolean(site || year || status)}
        onResetAdditionalFilters={() =>
          onFilter({
            site: undefined,
            year: undefined,
            status: undefined,
            page: undefined,
          })
        }
        getRowId={(item) => item.uid}
        mobileCard={(item) => (
          <article key={item.uid} className='rounded-md border p-3'>
            <div className='flex items-start justify-between gap-2'>
              <div>
                <p className='font-medium'>{item.site.name}</p>
                <p className='text-xs text-muted-foreground'>
                  {item.site.code} · {item.wageYear}
                </p>
              </div>
              <Badge
                variant={item.status === 'ACTIVE' ? 'default' : 'secondary'}
              >
                {item.status === 'ACTIVE' ? 'Aktif' : 'Dibatalkan'}
              </Badge>
            </div>
            <div className='mt-3 flex items-end justify-between gap-2'>
              <div>
                <p className='font-semibold tabular-nums'>
                  {rupiah(item.amount)}
                </p>
                <p className='max-w-56 truncate text-xs text-muted-foreground'>
                  {item.regulationReference || 'Tanpa referensi regulasi'}
                </p>
              </div>
              {canManage && (
                <div className='flex gap-1'>
                  <DataTableActionButton
                    label={
                      item.status === 'ACTIVE'
                        ? 'Koreksi UMK'
                        : 'Aktifkan ulang UMK'
                    }
                    onClick={() =>
                      setDialog({
                        mode:
                          item.status === 'ACTIVE' ? 'correct' : 'reactivate',
                        item,
                      })
                    }
                  >
                    {item.status === 'ACTIVE' ? <PencilLine /> : <RotateCcw />}
                  </DataTableActionButton>
                  {item.status === 'ACTIVE' && (
                    <DataTableActionButton
                      label='Batalkan UMK'
                      className='text-destructive'
                      onClick={() => setDialog({ mode: 'cancel', item })}
                    >
                      <CircleOff />
                    </DataTableActionButton>
                  )}
                </div>
              )}
            </div>
          </article>
        )}
      />

      <MinimumWageDialog
        key={dialog ? `${dialog.mode}-${dialog.item?.uid ?? 'new'}` : 'closed'}
        state={dialog}
        sites={sites}
        defaultSiteCode={site}
        onClose={() => setDialog(null)}
      />
    </>
  )
}

function MinimumWageDialog({
  state,
  sites,
  defaultSiteCode,
  onClose,
}: {
  state: DialogState
  sites: PayrollSite[]
  defaultSiteCode: string
  onClose: () => void
}) {
  const selected = state?.item
  const [siteUid, setSiteUid] = useState(
    selected?.site.uid ??
      sites.find((item) => item.code === defaultSiteCode)?.uid ??
      ''
  )
  const [wageYear, setWageYear] = useState(
    String(selected?.wageYear ?? new Date().getFullYear())
  )
  const [amount, setAmount] = useState(selected?.amount ?? '')
  const [reference, setReference] = useState(
    selected?.regulationReference ?? ''
  )
  const [notes, setNotes] = useState(selected?.notes ?? '')
  const [reason, setReason] = useState('')
  const create = useCreatePayrollMinimumWage()
  const correct = useCorrectPayrollMinimumWage()
  const changeStatus = useChangePayrollMinimumWageStatus()
  const mode = state?.mode
  const isStatusAction = mode === 'cancel' || mode === 'reactivate'
  const isPending =
    create.isPending || correct.isPending || changeStatus.isPending
  const valid =
    reason.trim().length >= 5 &&
    (isStatusAction ||
      (Boolean(siteUid) &&
        Number(wageYear) >= 2000 &&
        Number(wageYear) <= 2100 &&
        Number(amount) > 0))

  const submit = async () => {
    if (!mode || !valid) return
    const common = {
      reason: reason.trim(),
      idempotencyKey: createKey(`umk-${mode}`),
    }
    try {
      if (mode === 'create') {
        const payload: PayrollMinimumWageInput = {
          siteUid,
          wageYear: Number(wageYear),
          amount,
          currency: 'IDR',
          regulationReference: reference.trim() || null,
          notes: notes.trim() || null,
          ...common,
        }
        await create.mutateAsync({ payload })
      } else if (mode === 'correct') {
        await correct.mutateAsync({
          uid: selected?.uid,
          payload: {
            amount,
            currency: 'IDR',
            regulationReference: reference.trim() || null,
            notes: notes.trim() || null,
            ...common,
          },
        })
      } else {
        await changeStatus.mutateAsync({
          uid: selected?.uid,
          payload: { action: mode, ...common },
        })
      }
      toast.success(
        mode === 'create'
          ? 'Master UMK berhasil ditambahkan.'
          : mode === 'correct'
            ? 'Master UMK berhasil dikoreksi.'
            : mode === 'cancel'
              ? 'Master UMK dibatalkan.'
              : 'Master UMK diaktifkan ulang.'
      )
      onClose()
    } catch (error) {
      toast.error(apiMessage(error))
    }
  }

  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? 'Tambah UMK Site'
              : mode === 'correct'
                ? 'Koreksi UMK Site'
                : mode === 'cancel'
                  ? 'Batalkan UMK Site'
                  : 'Aktifkan Ulang UMK Site'}
          </DialogTitle>
          <DialogDescription>
            {isStatusAction
              ? `${selected?.site.name} · ${selected?.wageYear} · ${selected ? rupiah(selected.amount) : ''}`
              : 'Satu nilai berlaku untuk satu site dan satu tahun kalender.'}
          </DialogDescription>
        </DialogHeader>
        {!isStatusAction && (
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label>Site</Label>
              <Select
                value={siteUid}
                onValueChange={setSiteUid}
                disabled={mode === 'correct'}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder='Pilih site' />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((item) => (
                    <SelectItem key={item.uid} value={item.uid}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='umk-year'>Tahun</Label>
              <Input
                id='umk-year'
                type='number'
                min={2000}
                max={2100}
                value={wageYear}
                onChange={(event) => setWageYear(event.target.value)}
                disabled={mode === 'correct'}
              />
            </div>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor='umk-amount'>Nominal UMK</Label>
              <div className='relative'>
                <span className='absolute top-2.5 left-3 text-sm text-muted-foreground'>
                  Rp
                </span>
                <Input
                  id='umk-amount'
                  type='number'
                  min='1'
                  step='1'
                  className='pl-10'
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
            </div>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor='umk-reference'>
                Referensi regulasi{' '}
                <span className='font-normal text-muted-foreground'>
                  (opsional)
                </span>
              </Label>
              <Input
                id='umk-reference'
                maxLength={255}
                placeholder='Contoh: SK Gubernur Jawa Tengah No. ...'
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor='umk-notes'>
                Catatan{' '}
                <span className='font-normal text-muted-foreground'>
                  (opsional)
                </span>
              </Label>
              <Textarea
                id='umk-notes'
                maxLength={500}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>
        )}
        <div className='space-y-2'>
          <Label htmlFor='umk-reason'>Alasan perubahan</Label>
          <Textarea
            id='umk-reason'
            maxLength={500}
            placeholder='Minimal 5 karakter untuk audit trail.'
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            Batal
          </Button>
          <Button
            variant={mode === 'cancel' ? 'destructive' : 'default'}
            disabled={!valid || isPending}
            onClick={submit}
          >
            {isPending && <LoaderCircle className='size-4 animate-spin' />}
            {mode === 'cancel'
              ? 'Batalkan UMK'
              : mode === 'reactivate'
                ? 'Aktifkan kembali'
                : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
