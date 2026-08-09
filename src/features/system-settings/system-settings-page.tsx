import { useEffect, useMemo, useState } from 'react'
import { isAxiosError } from 'axios'
import {
  BellRing,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileText,
  Info,
  Save,
  WalletCards,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-mobile'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Main } from '@/components/layout/main'
import { AttendanceSettingsContent } from './attendance-settings'
import { CompanyProfileSettingsContent } from './company-profile-settings'
import { useContractSettings, useUpdateContractSettings } from './data/queries'
import type {
  ContractFirstPartySettings,
  ContractSettings,
  ContractTargetSettings,
  SystemSettingsTab,
  UpdateContractSettingsInput,
} from './domain'

const tabItems: Array<{
  value: SystemSettingsTab
  label: string
  icon: React.ElementType
}> = [
  { value: 'kontrak', label: 'Kontrak Karyawan', icon: BriefcaseBusiness },
  { value: 'profil-perusahaan', label: 'Profil Perusahaan', icon: Building2 },
  { value: 'attendance', label: 'Attendance', icon: CalendarClock },
  { value: 'payroll', label: 'Payroll', icon: WalletCards },
  {
    value: 'notifikasi-integrasi',
    label: 'Notifikasi & Integrasi',
    icon: BellRing,
  },
]

const placeholders: Record<
  Exclude<SystemSettingsTab, 'kontrak' | 'profil-perusahaan' | 'attendance'>,
  { title: string; description: string; scope: string; items: string[] }
> = {
  payroll: {
    title: 'Payroll',
    description:
      'Konfigurasi payroll yang tetap mengikuti aturan closing resmi.',
    scope: 'Per Site',
    items: ['Periode default', 'Komponen penghasilan', 'Format slip gaji'],
  },
  'notifikasi-integrasi': {
    title: 'Notifikasi & Integrasi',
    description: 'Pengaturan kanal notifikasi dan integrasi layanan eksternal.',
    scope: 'Global',
    items: ['Kanal notifikasi', 'Penerima operasional', 'Status integrasi'],
  },
}

type FirstPartyDraft = Omit<
  ContractFirstPartySettings,
  'configured' | 'updatedAt'
>
type TargetDraft = { value: string; unit: string }

export function SystemSettingsPage({
  tab,
  onTabChange,
}: {
  tab: SystemSettingsTab
  onTabChange: (tab: SystemSettingsTab) => void
}) {
  const isMobile = useIsMobile()

  return (
    <Main>
      <div className='space-y-0.5'>
        <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
          Pengaturan Sistem
        </h1>
        <p className='text-muted-foreground'>
          Kelola konfigurasi operasional yang berlaku di seluruh aplikasi.
        </p>
      </div>
      <Separator className='my-4 lg:my-6' />
      <Tabs
        value={tab}
        orientation={isMobile ? 'horizontal' : 'vertical'}
        onValueChange={(value) => onTabChange(value as SystemSettingsTab)}
        className='gap-6 md:flex-row md:items-start lg:gap-10'
      >
        <div className='w-full overflow-x-auto pb-1 md:sticky md:top-4 md:w-64 md:shrink-0 md:overflow-visible'>
          <TabsList className='h-auto min-w-max justify-start gap-1 bg-transparent p-0 md:flex md:w-full md:min-w-0 md:flex-col md:items-stretch'>
            {tabItems.map((item) => (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className='h-10 flex-none justify-start px-4 data-[state=active]:bg-muted data-[state=active]:shadow-none md:w-full'
              >
                <item.icon />
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value='kontrak' className='min-w-0 flex-1'>
          <ContractSettingsContent
            onOpenCompanyProfile={() => onTabChange('profil-perusahaan')}
          />
        </TabsContent>
        <TabsContent value='profil-perusahaan' className='min-w-0 flex-1'>
          <CompanyProfileSettingsContent />
        </TabsContent>
        <TabsContent value='attendance' className='min-w-0 flex-1'>
          <AttendanceSettingsContent />
        </TabsContent>
        {(Object.keys(placeholders) as Array<keyof typeof placeholders>).map(
          (value) => (
            <TabsContent key={value} value={value} className='min-w-0 flex-1'>
              <SettingsPlaceholder {...placeholders[value]} />
            </TabsContent>
          )
        )}
      </Tabs>
    </Main>
  )
}

function ContractSettingsContent({
  onOpenCompanyProfile,
}: {
  onOpenCompanyProfile: () => void
}) {
  const settings = useContractSettings()
  const update = useUpdateContractSettings()
  const [firstParty, setFirstParty] = useState<FirstPartyDraft>(emptyFirstParty)
  const [targets, setTargets] = useState<Record<string, TargetDraft>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!settings.data) return
    // State draft mengikuti snapshot query terbaru setelah simpan/refetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFirstParty(firstPartyDraft(settings.data))
    setTargets(targetDrafts(settings.data.targets))
  }, [settings.data])

  const changes = useMemo(
    () => getChanges(settings.data, firstParty, targets),
    [firstParty, settings.data, targets]
  )
  const errors = validateChanges(changes, firstParty)
  const groupedTargets = useMemo(
    () => groupTargets(settings.data?.targets ?? []),
    [settings.data?.targets]
  )

  if (settings.isPending) return <SettingsSkeleton />
  if (settings.isError || !settings.data) {
    return (
      <Alert variant='destructive'>
        <Info />
        <AlertTitle>Pengaturan gagal dimuat</AlertTitle>
        <AlertDescription>
          <p>Periksa koneksi layanan lalu coba kembali.</p>
          <Button
            size='sm'
            variant='outline'
            onClick={() => void settings.refetch()}
          >
            Coba lagi
          </Button>
        </AlertDescription>
      </Alert>
    )
  }

  const handleSave = () => {
    if (errors.length > 0 || changes.total === 0) return
    setConfirmOpen(true)
  }

  const submit = () => {
    const payload: UpdateContractSettingsInput = {
      ...(changes.firstPartyChanged ? { firstParty } : {}),
      targets: changes.targets.map((target) => ({
        siteCode: target.siteCode,
        sectionCode: target.sectionCode,
        value: Number(target.draft.value),
        unit: target.draft.unit.trim(),
      })),
    }
    update.mutate(payload, {
      onSuccess: ({ updatedCount }) => {
        setConfirmOpen(false)
        toast.success(
          updatedCount > 0
            ? `${updatedCount} pengaturan berhasil diperbarui.`
            : 'Tidak ada nilai yang berubah.'
        )
      },
      onError: (error) => {
        const message = isAxiosError(error)
          ? error.response?.data?.message
          : undefined
        toast.error(message ?? 'Pengaturan belum dapat disimpan.')
      },
    })
  }

  return (
    <div className='space-y-6'>
      <div>
        <h2 className='text-xl font-semibold'>Kontrak Karyawan</h2>
        <p className='text-sm text-muted-foreground'>
          Atur sumber data legal dan target produksi untuk template kontrak.
        </p>
      </div>

      <Alert className='border-sky-500/40 bg-sky-500/5'>
        <Info className='text-sky-700' />
        <AlertTitle>Snapshot kontrak lama tetap aman</AlertTitle>
        <AlertDescription>
          Perubahan hanya digunakan pada snapshot cetak yang dibuat setelah
          pengaturan disimpan. Snapshot kontrak lama tidak ikut berubah.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Pihak Pertama</CardTitle>
          <CardDescription>
            Identitas perusahaan dan direktur yang tampil dalam template PKWT.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-4 sm:grid-cols-2'>
          <SettingsField
            label='Nama perusahaan'
            error={fieldError(errors, 'companyName')}
          >
            <Input value={firstParty.companyName} readOnly />
            <button
              type='button'
              className='w-fit text-xs font-medium text-primary underline-offset-4 hover:underline'
              onClick={onOpenCompanyProfile}
            >
              Ubah di Profil Perusahaan
            </button>
          </SettingsField>
          <SettingsField
            label='Nama direktur'
            error={fieldError(errors, 'directorName')}
          >
            <Input
              value={firstParty.directorName}
              maxLength={150}
              onChange={(event) =>
                setFirstParty((current) => ({
                  ...current,
                  directorName: event.target.value,
                }))
              }
            />
          </SettingsField>
          <SettingsField
            label='Jabatan direktur'
            error={fieldError(errors, 'directorTitle')}
          >
            <Input
              value={firstParty.directorTitle}
              maxLength={100}
              onChange={(event) =>
                setFirstParty((current) => ({
                  ...current,
                  directorTitle: event.target.value,
                }))
              }
            />
          </SettingsField>
          <SettingsField
            label='Alamat kantor pusat'
            error={fieldError(errors, 'headOfficeAddress')}
            className='sm:col-span-2'
          >
            <Textarea value={firstParty.headOfficeAddress} rows={3} readOnly />
            <button
              type='button'
              className='w-fit text-xs font-medium text-primary underline-offset-4 hover:underline'
              onClick={onOpenCompanyProfile}
            >
              Ubah di Profil Perusahaan
            </button>
          </SettingsField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Target Produksi</CardTitle>
          <CardDescription>
            Nilai target kontrak ditentukan per site dan bagian produksi aktif.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          {groupedTargets.length === 0 ? (
            <p className='rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground'>
              Belum ada bagian produksi aktif yang dapat dikonfigurasi.
            </p>
          ) : (
            groupedTargets.map((group) => (
              <section key={group.siteCode} className='space-y-3'>
                <div className='flex items-center gap-2'>
                  <h3 className='font-semibold'>{group.siteName}</h3>
                  <Badge variant='outline'>{group.siteCode}</Badge>
                </div>
                <div className='overflow-hidden rounded-md border'>
                  {group.targets.map((target, index) => {
                    const key = targetKey(target)
                    const draft = targets[key] ?? { value: '', unit: '' }
                    const error = errors.find(
                      (item) => item.key === key
                    )?.message
                    return (
                      <div
                        key={key}
                        className={cn(
                          'grid gap-3 p-4 lg:grid-cols-[minmax(220px,1fr)_170px_minmax(200px,1fr)] lg:items-start',
                          index > 0 && 'border-t'
                        )}
                      >
                        <div className='min-w-0'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <p className='font-medium'>{target.sectionName}</p>
                            {!target.configured && (
                              <Badge variant='destructive'>Belum diatur</Badge>
                            )}
                          </div>
                          <p className='mt-1 text-xs text-muted-foreground'>
                            Modul: {target.moduleNames.join(', ') || '-'}
                          </p>
                        </div>
                        <label className='grid gap-1.5 text-sm font-medium'>
                          Nilai target
                          <Input
                            type='number'
                            min='0.01'
                            step='any'
                            value={draft.value}
                            aria-invalid={Boolean(error)}
                            onChange={(event) =>
                              setTargets((current) => ({
                                ...current,
                                [key]: { ...draft, value: event.target.value },
                              }))
                            }
                          />
                        </label>
                        <label className='grid gap-1.5 text-sm font-medium'>
                          Satuan
                          <Input
                            value={draft.unit}
                            maxLength={100}
                            aria-invalid={Boolean(error)}
                            placeholder='Contoh: batang per-jam kerja'
                            onChange={(event) =>
                              setTargets((current) => ({
                                ...current,
                                [key]: { ...draft, unit: event.target.value },
                              }))
                            }
                          />
                          {error && (
                            <span className='text-xs text-destructive'>
                              {error}
                            </span>
                          )}
                        </label>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jenis Template Kontrak</CardTitle>
          <CardDescription>
            Ketersediaan template cetak berdasarkan jenis kontrak dan karyawan.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid gap-3 sm:grid-cols-2'>
          <TemplateStatus label='PKWT Borongan' available />
          <TemplateStatus label='PKWT Harian' />
          <TemplateStatus label='PKWT Bulanan' />
          <TemplateStatus label='Training' />
          <TemplateStatus label='PKWTT' />
        </CardContent>
      </Card>

      <div className='sticky bottom-3 z-10 flex flex-col gap-2 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between'>
        <p className='text-sm text-muted-foreground'>
          {changes.total > 0
            ? `${changes.total} bagian memiliki perubahan yang belum disimpan.`
            : 'Semua perubahan sudah tersimpan.'}
        </p>
        <Button
          disabled={
            changes.total === 0 || errors.length > 0 || update.isPending
          }
          onClick={handleSave}
        >
          <Save /> Simpan perubahan
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => !update.isPending && setConfirmOpen(open)}
        title='Simpan pengaturan kontrak?'
        desc={
          <p>
            {changes.firstPartyChanged ? 'Identitas pihak pertama dan ' : ''}
            {changes.targets.length} target produksi akan diperbarui. Snapshot
            kontrak lama tidak ikut berubah.
          </p>
        }
        confirmText='Simpan perubahan'
        isLoading={update.isPending}
        handleConfirm={submit}
      />
    </div>
  )
}

function SettingsPlaceholder({
  title,
  description,
  scope,
  items,
}: {
  title: string
  description: string
  scope: string
  items: string[]
}) {
  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-center gap-2'>
          <CardTitle>{title}</CardTitle>
          <Badge variant='secondary'>Belum tersedia</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-center gap-2 text-sm'>
          <span className='text-muted-foreground'>Cakupan:</span>
          <Badge variant='outline'>{scope}</Badge>
        </div>
        <div className='rounded-md border border-dashed p-4'>
          <p className='mb-3 text-sm font-medium'>Rencana konfigurasi</p>
          <ul className='space-y-2 text-sm text-muted-foreground'>
            {items.map((item) => (
              <li key={item} className='flex items-center gap-2'>
                <FileText className='size-4' /> {item}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

function SettingsField({
  label,
  error,
  className,
  children,
}: {
  label: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn('grid gap-1.5 text-sm font-medium', className)}>
      {label}
      {children}
      {error && <span className='text-xs text-destructive'>{error}</span>}
    </label>
  )
}

function TemplateStatus({
  label,
  available = false,
}: {
  label: string
  available?: boolean
}) {
  return (
    <div className='flex items-center justify-between gap-3 rounded-md border p-3'>
      <div className='flex items-center gap-2'>
        {available ? (
          <CheckCircle2 className='size-4 text-emerald-600' />
        ) : (
          <FileText className='size-4 text-muted-foreground' />
        )}
        <span className='text-sm font-medium'>{label}</span>
      </div>
      <Badge variant={available ? 'default' : 'secondary'}>
        {available ? 'Tersedia' : 'Belum tersedia'}
      </Badge>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-14 w-72 max-w-full' />
      <Skeleton className='h-64 w-full' />
      <Skeleton className='h-80 w-full' />
    </div>
  )
}

const emptyFirstParty: FirstPartyDraft = {
  companyName: '',
  directorName: '',
  directorTitle: '',
  headOfficeAddress: '',
}

function firstPartyDraft(settings: ContractSettings): FirstPartyDraft {
  const {
    configured: _configured,
    updatedAt: _updatedAt,
    ...draft
  } = settings.firstParty
  return draft
}

function targetKey(
  target: Pick<ContractTargetSettings, 'siteCode' | 'sectionCode'>
) {
  return `${target.siteCode}:${target.sectionCode}`
}

function targetDrafts(items: ContractTargetSettings[]) {
  return Object.fromEntries(
    items.map((target) => [
      targetKey(target),
      { value: target.value?.toString() ?? '', unit: target.unit },
    ])
  )
}

function groupTargets(items: ContractTargetSettings[]) {
  const groups = new Map<
    string,
    { siteCode: string; siteName: string; targets: ContractTargetSettings[] }
  >()
  items.forEach((target) => {
    const group = groups.get(target.siteCode) ?? {
      siteCode: target.siteCode,
      siteName: target.siteName,
      targets: [],
    }
    group.targets.push(target)
    groups.set(target.siteCode, group)
  })
  return [...groups.values()]
}

function getChanges(
  settings: ContractSettings | undefined,
  firstParty: FirstPartyDraft,
  targets: Record<string, TargetDraft>
) {
  if (!settings) {
    return { firstPartyChanged: false, targets: [], total: 0 }
  }
  const originalFirstParty = firstPartyDraft(settings)
  const firstPartyChanged =
    JSON.stringify(originalFirstParty) !== JSON.stringify(firstParty)
  const targetChanges = settings.targets.flatMap((target) => {
    const draft = targets[targetKey(target)] ?? { value: '', unit: '' }
    const original = {
      value: target.value?.toString() ?? '',
      unit: target.unit,
    }
    return draft.value !== original.value || draft.unit !== original.unit
      ? [{ ...target, draft }]
      : []
  })
  return {
    firstPartyChanged,
    targets: targetChanges,
    total: Number(firstPartyChanged) + targetChanges.length,
  }
}

type ValidationError = { key: string; message: string }

function validateChanges(
  changes: ReturnType<typeof getChanges>,
  firstParty: FirstPartyDraft
) {
  const errors: ValidationError[] = []
  if (changes.firstPartyChanged) {
    const fields = [
      ['companyName', 'Nama perusahaan wajib diisi.'],
      ['directorName', 'Nama direktur wajib diisi.'],
      ['directorTitle', 'Jabatan direktur wajib diisi.'],
      ['headOfficeAddress', 'Alamat kantor pusat wajib diisi.'],
    ] as const
    fields.forEach(([key, message]) => {
      if (!firstParty[key].trim()) errors.push({ key, message })
    })
  }
  changes.targets.forEach((target) => {
    const value = Number(target.draft.value)
    if (!target.draft.value || !Number.isFinite(value) || value <= 0) {
      errors.push({
        key: targetKey(target),
        message: 'Target harus lebih dari 0.',
      })
    } else if (!target.draft.unit.trim()) {
      errors.push({
        key: targetKey(target),
        message: 'Satuan target wajib diisi.',
      })
    }
  })
  return errors
}

function fieldError(errors: ValidationError[], key: string) {
  return errors.find((error) => error.key === key)?.message
}
