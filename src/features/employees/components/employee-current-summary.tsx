import type { ReactNode } from 'react'
import {
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleUserRound,
  FileCheck2,
  MapPin,
  ShieldAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useShiftAssignments } from '@/features/attendance/data/queries'
import { useProductionAssignments } from '@/features/production/data/queries'
import type { Employee, EmployeeContract, EmployeeDocument } from '../domain'
import {
  contractStatusBadgeClassName,
  contractStatusBadgeVariant,
  employeeStatusBadgeClassName,
  employeeStatusBadgeVariant,
  formatDate,
  statusLabel,
} from '../utils'

type EmployeeCurrentSummaryProps = {
  employee: Employee
  contracts?: EmployeeContract[]
  contractsPending: boolean
  contractsError: boolean
  documents?: EmployeeDocument[]
  documentsPending: boolean
  documentsError: boolean
  canViewShiftAssignments: boolean
  canViewProductionAssignments: boolean
}

export function EmployeeCurrentSummary({
  employee,
  contracts,
  contractsPending,
  contractsError,
  documents,
  documentsPending,
  documentsError,
  canViewShiftAssignments,
  canViewProductionAssignments,
}: EmployeeCurrentSummaryProps) {
  const activeContract = contracts?.find(isContractCurrentlyValid)
  const latestContract = contracts
    ?.slice()
    .sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0]
  const displayedContract = activeContract ?? latestContract
  const placement = [employee.productionModule, employee.productionSection]
    .filter(Boolean)
    .join(' · ')
  const completeness = employeeCompleteness(employee, documents)

  return (
    <div className='space-y-4'>
      <CurrentCondition
        employee={employee}
        contracts={contracts}
        contractsPending={contractsPending}
        contractsError={contractsError}
      />

      <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
        <MetricCard
          icon={<CircleUserRound className='size-4' />}
          label='Status karyawan'
          value={statusLabel(employee.employeeStatus)}
          detail={statusLabel(employee.employeeType)}
        />
        <MetricCard
          icon={<FileCheck2 className='size-4' />}
          label='Kondisi kontrak'
          value={
            contractsPending
              ? 'Memuat...'
              : activeContract
                ? 'Aktif berlaku'
                : 'Tidak aktif berlaku'
          }
          detail={
            displayedContract?.contractNumber ?? 'Tidak ada nomor kontrak'
          }
        />
        <MetricCard
          icon={<MapPin className='size-4' />}
          label='Penempatan saat ini'
          value={`Site ${employee.site}`}
          detail={employee.position ?? employee.department ?? 'Belum lengkap'}
        />
        <MetricCard
          icon={<CheckCircle2 className='size-4' />}
          label='Kelengkapan utama'
          value={
            documentsError
              ? 'Gagal diperiksa'
              : documentsPending
                ? 'Memuat...'
                : `${completeness.done}/${completeness.total} lengkap`
          }
          detail={
            documentsError
              ? 'Informasi dokumen tidak tersedia'
              : documentsPending
                ? 'Memeriksa identitas dan kontak'
                : completeness.missing.length
                  ? `Perlu: ${completeness.missing.slice(0, 2).join(', ')}`
                  : 'Identitas dan kontak tersedia'
          }
        />
      </div>

      <div className='grid gap-4 xl:grid-cols-2'>
        <SnapshotCard
          icon={<Building2 className='size-5 text-primary' />}
          title='Penempatan saat ini'
        >
          <SnapshotRows
            rows={[
              ['Site', employee.site],
              ['Departemen', employee.department],
              ['Jabatan', employee.position],
              ['Bagian Produksi', placement],
              ['Kelompok kerja', employee.workGroup],
              ['Jenis karyawan', statusLabel(employee.employeeType)],
              ['Tanggal bergabung', formatDate(employee.joinDate)],
            ]}
          />
        </SnapshotCard>

        <SnapshotCard
          icon={<FileCheck2 className='size-5 text-primary' />}
          title='Kontrak saat ini'
        >
          {contractsPending ? (
            <SummarySkeleton />
          ) : contractsError ? (
            <p className='text-sm text-destructive'>
              Informasi kontrak gagal dimuat.
            </p>
          ) : displayedContract ? (
            <div className='space-y-3'>
              <div className='flex flex-wrap items-center gap-2'>
                <p className='font-semibold break-all'>
                  {displayedContract.contractNumber}
                </p>
                <Badge
                  variant={contractStatusBadgeVariant(displayedContract.status)}
                  className={contractStatusBadgeClassName(
                    displayedContract.status
                  )}
                >
                  {statusLabel(displayedContract.status)}
                </Badge>
                {!activeContract && (
                  <Badge variant='outline'>Kontrak terakhir</Badge>
                )}
              </div>
              <SnapshotRows
                rows={[
                  ['Jenis kontrak', displayedContract.contractType],
                  [
                    'Periode',
                    `${formatDate(displayedContract.startDate)} — ${formatDate(displayedContract.endDate)}`,
                  ],
                  [
                    'Penempatan kontrak',
                    [
                      displayedContract.siteNameSnapshot,
                      displayedContract.positionNameSnapshot,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  ],
                  ['Kontrak ke', String(displayedContract.sequenceNumber)],
                ]}
              />
            </div>
          ) : (
            <div className='flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-foreground'>
              <ShieldAlert className='mt-0.5 size-4 shrink-0' />
              <p>Belum ada kontrak yang tercatat untuk karyawan ini.</p>
            </div>
          )}
        </SnapshotCard>
      </div>

      {(canViewShiftAssignments || canViewProductionAssignments) && (
        <SnapshotCard
          icon={<CalendarClock className='size-5 text-primary' />}
          title='Kesiapan operasional saat ini'
          description='Shift dan pekerjaan aktif yang menentukan kesiapan karyawan untuk bekerja.'
        >
          <div className='grid gap-3 md:grid-cols-2'>
            {canViewShiftAssignments && (
              <CurrentShiftSnapshot employee={employee} />
            )}
            {canViewProductionAssignments && (
              <CurrentProductionSnapshot employee={employee} />
            )}
          </div>
        </SnapshotCard>
      )}
    </div>
  )
}

function CurrentCondition({
  employee,
  contracts,
  contractsPending,
  contractsError,
}: {
  employee: Employee
  contracts?: EmployeeContract[]
  contractsPending: boolean
  contractsError: boolean
}) {
  const message = contractsError
    ? 'Status karyawan tersedia, tetapi informasi kontrak gagal dimuat.'
    : employmentCondition(employee, contracts)
  const healthy =
    employee.employeeStatus === 'ACTIVE' &&
    contracts?.some(isContractCurrentlyValid)
  const warning =
    employee.employeeStatus === 'ACTIVE' &&
    !contractsPending &&
    !contractsError &&
    !healthy

  return (
    <Card
      className={`gap-0 rounded-lg py-0 ${
        warning
          ? 'border-warning/50 bg-warning/5'
          : healthy
            ? 'border-positive/40 bg-positive/5'
            : ''
      }`}
    >
      <CardContent className='flex items-center gap-2 px-3 py-2.5'>
        <div className='flex min-w-0 flex-1 items-center gap-2'>
          <div
            className={`flex size-7 shrink-0 items-center justify-center rounded-md ${
              warning
                ? 'bg-warning/15 text-warning-foreground'
                : healthy
                  ? 'bg-positive/10 text-positive'
                  : 'bg-primary/10 text-primary'
            }`}
          >
            {warning ? (
              <ShieldAlert className='size-4' />
            ) : (
              <CheckCircle2 className='size-4' />
            )}
          </div>
          <div className='min-w-0 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-2'>
            <p className='text-xs leading-5 font-semibold'>
              Kondisi karyawan saat ini
            </p>
            <p className='text-xs leading-5 break-words text-muted-foreground'>
              {message}
            </p>
          </div>
        </div>
        <Badge
          variant={employeeStatusBadgeVariant(employee.employeeStatus)}
          className={`shrink-0 ${employeeStatusBadgeClassName(employee.employeeStatus)}`}
        >
          {statusLabel(employee.employeeStatus)}
        </Badge>
      </CardContent>
    </Card>
  )
}

function MetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <Card className='min-h-[68px] rounded-lg'>
      <CardContent className='flex items-start gap-3 px-3 py-2.5'>
        <div className='mt-0.5 rounded-md bg-primary/10 p-1.5 text-primary'>
          {icon}
        </div>
        <div className='min-w-0'>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='truncate text-sm font-semibold' title={value}>
            {value}
          </p>
          <p className='truncate text-xs text-muted-foreground' title={detail}>
            {detail}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function SnapshotCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex items-start gap-2'>
          {icon}
          <div>
            <CardTitle className='text-base'>{title}</CardTitle>
            {description && (
              <p className='mt-1 text-sm text-muted-foreground'>
                {description}
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function SnapshotRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className='grid gap-2.5 text-sm'>
      {rows.map(([label, value]) => (
        <div
          key={label}
          className='grid grid-cols-[minmax(100px,140px)_1fr] gap-3'
        >
          <dt className='text-muted-foreground'>{label}</dt>
          <dd className='min-w-0 font-medium break-words'>{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

function CurrentShiftSnapshot({ employee }: { employee: Employee }) {
  const assignments = useShiftAssignments({
    query: employee.employeeNumber,
    status: ['CURRENT'],
    page: 1,
    pageSize: 50,
  })
  const current = assignments.data?.items.find(
    (item) => item.employeeUid === employee.uid && item.status === 'CURRENT'
  )

  return (
    <OperationalItem
      icon={<CalendarClock className='size-5 text-primary' />}
      title='Shift aktif'
      pending={assignments.isPending}
      error={assignments.isError}
      value={current?.shiftName}
      detail={
        current
          ? `${current.startTime.slice(0, 5)}–${current.endTime.slice(0, 5)} · mulai ${formatDate(current.effectiveFrom)}`
          : undefined
      }
      empty='Belum ada Shift aktif.'
    />
  )
}

function CurrentProductionSnapshot({ employee }: { employee: Employee }) {
  const assignments = useProductionAssignments({
    query: employee.employeeNumber,
    status: ['ACTIVE'],
    page: 1,
    pageSize: 50,
  })
  const current = assignments.data?.items
    .filter(
      (item) => item.employee.uid === employee.uid && item.status === 'ACTIVE'
    )
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0]

  return (
    <OperationalItem
      icon={<BriefcaseBusiness className='size-5 text-primary' />}
      title='Pekerjaan aktif'
      pending={assignments.isPending}
      error={assignments.isError}
      value={current?.job.name}
      detail={
        current
          ? `${current.job.code}${current.isPrimary ? ' · pekerjaan utama' : ''} · mulai ${formatDate(current.effectiveFrom)}`
          : undefined
      }
      empty='Belum ada pekerjaan aktif.'
    />
  )
}

function OperationalItem({
  icon,
  title,
  value,
  detail,
  empty,
  pending,
  error,
}: {
  icon: ReactNode
  title: string
  value?: string
  detail?: string
  empty: string
  pending: boolean
  error: boolean
}) {
  return (
    <div className='flex min-h-24 items-start gap-3 rounded-lg border p-3'>
      <div className='rounded-md bg-primary/10 p-2'>{icon}</div>
      <div className='min-w-0'>
        <p className='text-xs font-medium text-muted-foreground'>{title}</p>
        {pending ? (
          <div className='mt-2 space-y-2'>
            <Skeleton className='h-4 w-36' />
            <Skeleton className='h-3 w-48 max-w-full' />
          </div>
        ) : error ? (
          <p className='mt-1 text-sm text-destructive'>Gagal dimuat.</p>
        ) : value ? (
          <>
            <p className='mt-1 font-semibold'>{value}</p>
            <p className='mt-1 text-xs text-muted-foreground'>{detail}</p>
          </>
        ) : (
          <p className='mt-1 text-sm text-warning-foreground'>{empty}</p>
        )}
      </div>
    </div>
  )
}

function SummarySkeleton() {
  return (
    <div className='space-y-3'>
      <Skeleton className='h-5 w-52 max-w-full' />
      <Skeleton className='h-4 w-full' />
      <Skeleton className='h-4 w-3/4' />
    </div>
  )
}

function employeeCompleteness(
  employee: Employee,
  documents?: EmployeeDocument[]
) {
  const checks = [
    ['Foto', Boolean(employee.photo?.url || employee.photo?.temporaryUrl)],
    ['KTP', documents?.some((document) => document.documentType === 'KTP')],
    ['KK', documents?.some((document) => document.documentType === 'KK')],
    ['Telepon', Boolean(employee.phone)],
    ['Kontak darurat', Boolean(employee.emergencyContactPhone)],
    ['Rekening bank', Boolean(employee.bankAccountNumber)],
  ] as const
  return {
    done: checks.filter(([, available]) => available).length,
    total: checks.length,
    missing: checks
      .filter(([, available]) => !available)
      .map(([label]) => label),
  }
}

function employmentCondition(
  employee: Employee,
  contracts?: EmployeeContract[]
) {
  if (contracts === undefined) return 'Memuat kondisi kontrak karyawan...'
  if (employee.employeeStatus === 'RESIGNED') {
    return `Karyawan telah resign${employee.resignDate ? ` pada ${formatDate(employee.resignDate)}` : ''}.`
  }
  const active = contracts.find(isContractCurrentlyValid)
  if (active) {
    return `Aktif dengan kontrak ${active.contractNumber}${active.endDate ? ` sampai ${formatDate(active.endDate)}` : ''}.`
  }
  const latest = contracts
    .slice()
    .sort((a, b) => b.sequenceNumber - a.sequenceNumber)[0]
  if (employee.employeeStatus === 'ACTIVE') {
    return latest
      ? `Status karyawan aktif, tetapi kontrak terakhir berstatus ${statusLabel(latest.status)}. Perlu pemeriksaan HR.`
      : 'Status karyawan aktif, tetapi belum memiliki kontrak. Perlu pemeriksaan HR.'
  }
  if (latest) {
    return `Karyawan ${statusLabel(employee.employeeStatus).toLowerCase()} dengan kontrak terakhir berstatus ${statusLabel(latest.status)}.`
  }
  return `Karyawan berstatus ${statusLabel(employee.employeeStatus)} dan belum memiliki kontrak.`
}

function isContractCurrentlyValid(contract: EmployeeContract) {
  if (contract.status !== 'ACTIVE') return false
  const today = todayJakarta()
  return (
    contract.startDate <= today &&
    (!contract.endDate || contract.endDate >= today)
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
