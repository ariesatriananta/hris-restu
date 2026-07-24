import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Main } from '@/components/layout/main'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/lib/api-client'

type Paginated<T> = {
  items: T[]
}

type Unit = {
  uid: string
  code: string
  name: string
}

type Position = {
  uid: string
  code: string
  name: string
}

type Job = {
  uid: string
  code: string
  name: string
  defaultUnitUid: string
  defaultUnitName: string
  positionName?: string | null
}

type Rate = {
  uid: string
  site: string
  jobName: string
  unitName: string
  effectiveFrom: string
  effectiveTo?: string
  rateAmount: number
  status: string
}

const sites = ['JEPARA', 'SEMARANG', 'KLATEN']

function useProductionData() {
  const units = useQuery({
    queryKey: ['work-units'],
    queryFn: async () =>
      (await apiClient.get<Unit[]>('/production-structure/work-units')).data,
  })
  const jobs = useQuery({
    queryKey: ['production-jobs'],
    queryFn: async () =>
      (await apiClient.get<Job[]>('/production-structure/jobs')).data,
  })
  const positions = useQuery({
    queryKey: ['positions', 'production'],
    queryFn: async () =>
      (
        await apiClient.get<Paginated<Position>>(
          '/production-structure/positions?category=PRODUCTION&pageSize=500&isActive=true'
        )
      ).data.items,
  })

  return { units, jobs, positions }
}

function Save({
  path,
  body,
  onDone,
}: {
  path: string
  body: unknown
  onDone: () => void
}) {
  const mutation = useMutation({
    mutationFn: () => apiClient.post(path, body),
    onSuccess: onDone,
    onError: () => toast.error('Penyimpanan gagal. Periksa data yang diisi.'),
  })

  return (
    <Button
      type='button'
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      Simpan
    </Button>
  )
}

export function ProductionJobMasterPage() {
  const qc = useQueryClient()
  const { units, jobs, positions } = useProductionData()
  const [unit, setUnit] = useState({ code: '', name: '' })
  const [job, setJob] = useState({
    code: '',
    name: '',
    defaultUnitUid: '',
    positionUid: '',
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['work-units'] })
    qc.invalidateQueries({ queryKey: ['production-jobs'] })
    toast.success('Data tersimpan.')
  }

  return (
    <Main>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold'>Master Pekerjaan</h1>
        <p className='text-muted-foreground'>
          Kelola satuan dan pekerjaan yang dapat diberi tarif produksi.
        </p>
      </div>

      <div className='grid gap-5 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Tambah satuan</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3'>
            <Input
              placeholder='Kode, contoh PCS'
              value={unit.code}
              onChange={(event) =>
                setUnit({ ...unit, code: event.target.value })
              }
            />
            <Input
              placeholder='Nama satuan'
              value={unit.name}
              onChange={(event) =>
                setUnit({ ...unit, name: event.target.value })
              }
            />
            <Save path='/production-structure/work-units' body={unit} onDone={refresh} />
            <List
              rows={units.data ?? []}
              render={(row: Unit) => (
                <>
                  {row.code} - {row.name}
                </>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tambah pekerjaan</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-3'>
            <Input
              placeholder='Kode pekerjaan'
              value={job.code}
              onChange={(event) => setJob({ ...job, code: event.target.value })}
            />
            <Input
              placeholder='Nama pekerjaan'
              value={job.name}
              onChange={(event) => setJob({ ...job, name: event.target.value })}
            />
            <select
              className='h-9 rounded-md border bg-background px-3 text-sm'
              value={job.defaultUnitUid}
              onChange={(event) =>
                setJob({ ...job, defaultUnitUid: event.target.value })
              }
            >
              <option value=''>Pilih satuan</option>
              {(units.data ?? []).map((row) => (
                <option key={row.uid} value={row.uid}>
                  {row.name}
                </option>
              ))}
            </select>
            <select
              className='h-9 rounded-md border bg-background px-3 text-sm'
              value={job.positionUid}
              onChange={(event) =>
                setJob({ ...job, positionUid: event.target.value })
              }
            >
              <option value=''>Pilih jabatan</option>
              {(positions.data ?? []).map((row) => (
                <option key={row.uid} value={row.uid}>
                  {row.name}
                </option>
              ))}
            </select>
            <Save
              path='/production-structure/jobs'
              body={{ ...job, positionUid: job.positionUid || undefined }}
              onDone={refresh}
            />
            <List
              rows={jobs.data ?? []}
              render={(row: Job) => (
                <>
                  {row.code} - {row.name}{' '}
                  <span className='text-muted-foreground'>
                    ({row.defaultUnitName}
                    {row.positionName ? `, ${row.positionName}` : ''})
                  </span>
                </>
              )}
            />
          </CardContent>
        </Card>
      </div>
    </Main>
  )
}

export function ProductionRatePage() {
  const qc = useQueryClient()
  const { units, jobs } = useProductionData()
  const rates = useQuery({
    queryKey: ['production-rates'],
    queryFn: async () =>
      (await apiClient.get<Rate[]>('/production-structure/rates')).data,
  })
  const [form, setForm] = useState({
    site: 'JEPARA',
    jobUid: '',
    unitUid: '',
    effectiveFrom: '',
    effectiveTo: '',
    rateAmount: '',
  })
  const done = () => {
    qc.invalidateQueries({ queryKey: ['production-rates'] })
    toast.success('Tarif tersimpan.')
  }

  return (
    <Main>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold'>Tarif per Site</h1>
        <p className='text-muted-foreground'>
          Tarif aktif tidak boleh memiliki periode yang bertumpang-tindih.
        </p>
      </div>

      <Card className='mb-5'>
        <CardHeader>
          <CardTitle>Tambah tarif</CardTitle>
        </CardHeader>
        <CardContent className='grid gap-3 md:grid-cols-3'>
          <select
            className='h-9 rounded-md border bg-background px-3 text-sm'
            value={form.site}
            onChange={(event) => setForm({ ...form, site: event.target.value })}
          >
            {sites.map((site) => (
              <option key={site}>{site}</option>
            ))}
          </select>
          <select
            className='h-9 rounded-md border bg-background px-3 text-sm'
            value={form.jobUid}
            onChange={(event) =>
              setForm({ ...form, jobUid: event.target.value })
            }
          >
            <option value=''>Pilih pekerjaan</option>
            {(jobs.data ?? []).map((row) => (
              <option key={row.uid} value={row.uid}>
                {row.name}
              </option>
            ))}
          </select>
          <select
            className='h-9 rounded-md border bg-background px-3 text-sm'
            value={form.unitUid}
            onChange={(event) =>
              setForm({ ...form, unitUid: event.target.value })
            }
          >
            <option value=''>Pilih satuan</option>
            {(units.data ?? []).map((row) => (
              <option key={row.uid} value={row.uid}>
                {row.name}
              </option>
            ))}
          </select>
          <Input
            type='date'
            value={form.effectiveFrom}
            onChange={(event) =>
              setForm({ ...form, effectiveFrom: event.target.value })
            }
          />
          <Input
            type='date'
            value={form.effectiveTo}
            onChange={(event) =>
              setForm({ ...form, effectiveTo: event.target.value })
            }
          />
          <Input
            type='number'
            placeholder='Tarif Rupiah'
            value={form.rateAmount}
            onChange={(event) =>
              setForm({ ...form, rateAmount: event.target.value })
            }
          />
          <Save
            path='/production-structure/rates'
            body={{
              ...form,
              effectiveTo: form.effectiveTo || undefined,
              rateAmount: Number(form.rateAmount),
            }}
            onDone={done}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className='p-0'>
          <List
            rows={rates.data ?? []}
            render={(rate: Rate) => (
              <div className='flex justify-between gap-3'>
                <span>
                  {rate.site} - {rate.jobName} - {rate.unitName}
                </span>
                <span>
                  Rp {Number(rate.rateAmount).toLocaleString('id-ID')} (
                  {rate.effectiveFrom}
                  {rate.effectiveTo ? `-${rate.effectiveTo}` : ''})
                </span>
              </div>
            )}
          />
        </CardContent>
      </Card>
    </Main>
  )
}

function List<T>({
  rows,
  render,
}: {
  rows: T[]
  render: (row: T) => ReactNode
}) {
  return (
    <div className='divide-y rounded-md border'>
      {rows.length ? (
        rows.map((row, index) => (
          <div key={index} className='p-3 text-sm'>
            {render(row)}
          </div>
        ))
      ) : (
        <p className='p-3 text-sm text-muted-foreground'>Belum ada data.</p>
      )}
    </div>
  )
}
