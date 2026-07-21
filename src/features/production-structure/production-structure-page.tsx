import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Boxes, GitBranch, Layers3, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DataTableActionButton,
  DataTableColumnHeader,
} from '@/components/data-table'
import { Main } from '@/components/layout/main'
import { ProductionMasterTable } from './production-master-table'

type Module = {
  uid: string
  code: string
  name: string
  description?: string
  isActive: boolean
  site: string
}
type Section = {
  uid: string
  code: string
  name: string
  description?: string
  isActive: boolean
}
type Mapping = {
  uid: string
  isActive: boolean
  moduleUid: string
  moduleCode: string
  moduleName: string
  sectionUid: string
  sectionCode: string
  sectionName: string
  site: string
}
type List<T> = { items: T[]; total: number; page: number; pageSize: number }

const sites = ['JEPARA', 'SEMARANG', 'KLATEN']
const key = ['production-structure'] as const
const label = (active: boolean) => (active ? 'Aktif' : 'Nonaktif')

export function ProductionStructurePage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: (opts: { search: never; replace?: boolean }) => void
}) {
  const client = useQueryClient()
  const [tab, setTab] = useState('modules')
  const [module, setModule] = useState<Module>()
  const [section, setSection] = useState<Section>()
  const [mapping, setMapping] = useState<Mapping>()
  const params = {
    query: typeof search.filter === 'string' ? search.filter : undefined,
    site: Array.isArray(search.site) ? search.site.join(',') : undefined,
    isActive: Array.isArray(search.isActive)
      ? search.isActive.join(',')
      : undefined,
    page: typeof search.page === 'number' ? search.page : 1,
    pageSize: typeof search.pageSize === 'number' ? search.pageSize : 100,
  }
  const modules = useQuery({
    queryKey: [...key, 'modules', params],
    queryFn: async () =>
      (
        await apiClient.get<List<Module>>('/production-structure/modules', {
          params,
        })
      ).data,
  })
  const sections = useQuery({
    queryKey: [...key, 'sections', params],
    queryFn: async () =>
      (
        await apiClient.get<List<Section>>('/production-structure/sections', {
          params: { ...params, site: undefined },
        })
      ).data,
  })
  const mappings = useQuery({
    queryKey: [...key, 'mappings', params],
    queryFn: async () =>
      (
        await apiClient.get<List<Mapping>>(
          '/production-structure/module-sections',
          { params }
        )
      ).data,
  })
  const refresh = () => void client.invalidateQueries({ queryKey: key })
  return (
    <Main>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold'>Master Data</h1>
        <p className='text-muted-foreground'>
          Kelola struktur penempatan produksi untuk karyawan Borongan.
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab} className='space-y-4'>
        <TabsList className='h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1 sm:w-fit'>
          <TabsTrigger value='modules' className='h-10 flex-none gap-2 px-4'>
            <Boxes className='size-4' />
            Modul Produksi
          </TabsTrigger>
          <TabsTrigger value='sections' className='h-10 flex-none gap-2 px-4'>
            <Layers3 className='size-4' />
            Bagian Produksi
          </TabsTrigger>
          <TabsTrigger value='mappings' className='h-10 flex-none gap-2 px-4'>
            <GitBranch className='size-4' />
            Mapping Modul & Bagian
          </TabsTrigger>
        </TabsList>
        <TabsContent value='modules'>
          <MasterHeader
            title='Modul Produksi'
            description='Line/area produksi yang spesifik untuk setiap site.'
            onAdd={() =>
              setModule({
                uid: '',
                code: '',
                name: '',
                site: 'JEPARA',
                isActive: true,
              })
            }
          />
          <ProductionMasterTable
            data={modules.data}
            columns={moduleColumns(setModule)}
            search={search}
            navigate={navigate as never}
            isPending={modules.isPending}
            isFetching={modules.isFetching}
            isError={modules.isError}
            onRetry={() => void modules.refetch()}
            searchPlaceholder='Cari kode atau nama Modul...'
            hasSite
          />
          {tab === '__legacy' && (
            <>
              <div className='overflow-x-auto rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama modul</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='w-14' />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {modules.data?.items.map((item) => (
                      <TableRow key={item.uid}>
                        <TableCell>{item.site}</TableCell>
                        <TableCell>{item.code}</TableCell>
                        <TableCell>
                          <p className='font-medium'>{item.name}</p>
                          <p className='text-[11px] leading-3 text-muted-foreground'>
                            {item.description || '—'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Status active={item.isActive} />
                        </TableCell>
                        <TableCell>
                          <DataTableActionButton
                            label={`Ubah Modul ${item.name}`}
                            onClick={() => setModule(item)}
                          >
                            <Pencil />
                          </DataTableActionButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value='sections'>
          <MasterHeader
            title='Bagian Produksi'
            description='Proses kerja reusable, misalnya Linting atau Packing.'
            onAdd={() =>
              setSection({ uid: '', code: '', name: '', isActive: true })
            }
          />
          <ProductionMasterTable
            data={sections.data}
            columns={sectionColumns(setSection)}
            search={search}
            navigate={navigate as never}
            isPending={sections.isPending}
            isFetching={sections.isFetching}
            isError={sections.isError}
            onRetry={() => void sections.refetch()}
            searchPlaceholder='Cari kode atau nama Bagian...'
          />
          {tab === '__legacy' && (
            <>
              <div className='overflow-x-auto rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Nama Bagian</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='w-14' />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sections.data?.items.map((item) => (
                      <TableRow key={item.uid}>
                        <TableCell>{item.code}</TableCell>
                        <TableCell>
                          <p className='font-medium'>{item.name}</p>
                          <p className='text-[11px] leading-3 text-muted-foreground'>
                            {item.description || '—'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Status active={item.isActive} />
                        </TableCell>
                        <TableCell>
                          <DataTableActionButton
                            label={`Ubah Bagian ${item.name}`}
                            onClick={() => setSection(item)}
                          >
                            <Pencil />
                          </DataTableActionButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value='mappings'>
          <MasterHeader
            title='Mapping Modul & Bagian'
            description='Menentukan Bagian mana yang dapat dipilih dalam setiap Modul.'
            onAdd={() =>
              setMapping({
                uid: '',
                moduleUid: '',
                moduleCode: '',
                moduleName: '',
                sectionUid: '',
                sectionCode: '',
                sectionName: '',
                site: '',
                isActive: true,
              })
            }
          />
          <ProductionMasterTable
            data={mappings.data}
            columns={mappingColumns(setMapping)}
            search={search}
            navigate={navigate as never}
            isPending={mappings.isPending}
            isFetching={mappings.isFetching}
            isError={mappings.isError}
            onRetry={() => void mappings.refetch()}
            searchPlaceholder='Cari Modul atau Bagian...'
            hasSite
          />
          {tab === '__legacy' && (
            <>
              <div className='overflow-x-auto rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Modul</TableHead>
                      <TableHead>Bagian</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='w-14' />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappings.data?.items.map((item) => (
                      <TableRow key={item.uid}>
                        <TableCell>{item.site}</TableCell>
                        <TableCell>{item.moduleName}</TableCell>
                        <TableCell>{item.sectionName}</TableCell>
                        <TableCell>
                          <Status active={item.isActive} />
                        </TableCell>
                        <TableCell>
                          <DataTableActionButton
                            label={`Ubah pemetaan ${item.moduleName} ${item.sectionName}`}
                            onClick={() => setMapping(item)}
                          >
                            <Pencil />
                          </DataTableActionButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>
      <ModuleDialog
        value={module}
        onClose={() => setModule(undefined)}
        onSaved={refresh}
      />
      <SectionDialog
        value={section}
        onClose={() => setSection(undefined)}
        onSaved={refresh}
      />
      <MappingDialog
        value={mapping}
        modules={modules.data?.items ?? []}
        sections={sections.data?.items ?? []}
        onClose={() => setMapping(undefined)}
        onSaved={refresh}
      />
    </Main>
  )
}

function MasterHeader({
  title,
  description,
  onAdd,
}: {
  title: string
  description: string
  onAdd: () => void
}) {
  return (
    <div className='mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end'>
      <div>
        <h2 className='text-lg font-semibold'>{title}</h2>
        <p className='text-sm text-muted-foreground'>{description}</p>
      </div>
      <Button onClick={onAdd}>
        <Plus /> Tambah
      </Button>
    </div>
  )
}
function Status({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? 'secondary' : 'outline'}>{label(active)}</Badge>
  )
}
function moduleColumns(onEdit: (value: Module) => void): ColumnDef<Module>[] {
  return [
    {
      accessorKey: 'site',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Site' />
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'code',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Kode' />
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Modul' />
      ),
      cell: ({ row }) => (
        <div>
          <p className='font-medium'>{row.original.name}</p>
          <p className='text-[11px] leading-3 text-muted-foreground'>
            {row.original.description || '—'}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'isActive',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => <Status active={row.original.isActive} />,
      filterFn: (row, id, value: string[]) =>
        value.includes(String(row.getValue(id))),
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) => (
        <DataTableActionButton
          label={`Ubah Modul ${row.original.name}`}
          onClick={() => onEdit(row.original)}
        >
          <Pencil />
        </DataTableActionButton>
      ),
    },
  ]
}
function sectionColumns(
  onEdit: (value: Section) => void
): ColumnDef<Section>[] {
  return [
    {
      accessorKey: 'code',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Kode' />
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Bagian' />
      ),
      cell: ({ row }) => (
        <div>
          <p className='font-medium'>{row.original.name}</p>
          <p className='text-[11px] leading-3 text-muted-foreground'>
            {row.original.description || '—'}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'isActive',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => <Status active={row.original.isActive} />,
      filterFn: (row, id, value: string[]) =>
        value.includes(String(row.getValue(id))),
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) => (
        <DataTableActionButton
          label={`Ubah Bagian ${row.original.name}`}
          onClick={() => onEdit(row.original)}
        >
          <Pencil />
        </DataTableActionButton>
      ),
    },
  ]
}
function mappingColumns(
  onEdit: (value: Mapping) => void
): ColumnDef<Mapping>[] {
  return [
    {
      accessorKey: 'site',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Site' />
      ),
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'moduleName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Modul' />
      ),
    },
    {
      accessorKey: 'sectionName',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Bagian' />
      ),
    },
    {
      accessorKey: 'isActive',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Status' />
      ),
      cell: ({ row }) => <Status active={row.original.isActive} />,
      filterFn: (row, id, value: string[]) =>
        value.includes(String(row.getValue(id))),
    },
    {
      id: 'actions',
      enableSorting: false,
      cell: ({ row }) => (
        <DataTableActionButton
          label={`Ubah pemetaan ${row.original.moduleName} ${row.original.sectionName}`}
          onClick={() => onEdit(row.original)}
        >
          <Pencil />
        </DataTableActionButton>
      ),
    },
  ]
}
function ModuleDialog({
  value,
  onClose,
  onSaved,
}: {
  value?: Module
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Module>()
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setForm(value), [value])
  const open = Boolean(value)
  const model = form ?? value
  const mutation = useMutation({
    mutationFn: async (body: Module) => {
      const payload = {
        site: body.site,
        code: body.code,
        name: body.name,
        description: body.description,
        isActive: body.isActive,
      }
      if (body.uid)
        await apiClient.patch(
          `/production-structure/modules/${body.uid}`,
          payload
        )
      else await apiClient.post('/production-structure/modules', payload)
    },
    onSuccess: () => {
      toast.success('Modul produksi disimpan.')
      onSaved()
      onClose()
    },
    onError: () => toast.error('Modul produksi gagal disimpan.'),
  })
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {value?.uid ? 'Ubah Modul' : 'Tambah Modul'}
          </DialogTitle>
          <DialogDescription>
            Modul hanya berlaku pada satu site.
          </DialogDescription>
        </DialogHeader>
        {model && (
          <form
            className='grid gap-3'
            onSubmit={(event) => {
              event.preventDefault()
              mutation.mutate(form ?? model)
            }}
          >
            <Select
              label='Site'
              value={model.site}
              onChange={(site) => setForm({ ...model, site })}
              options={sites.map((site) => ({ value: site, label: site }))}
              disabled={Boolean(value?.uid)}
            />
            <Text
              label='Kode'
              value={model.code}
              onChange={(code) => setForm({ ...model, code })}
            />
            <Text
              label='Nama Modul'
              value={model.name}
              onChange={(name) => setForm({ ...model, name })}
            />
            <Text
              label='Keterangan'
              value={model.description ?? ''}
              onChange={(description) => setForm({ ...model, description })}
            />
            <Active
              active={model.isActive}
              onChange={(isActive) => setForm({ ...model, isActive })}
            />
            <Button disabled={mutation.isPending}>Simpan</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
function SectionDialog({
  value,
  onClose,
  onSaved,
}: {
  value?: Section
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Section>()
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setForm(value), [value])
  const open = Boolean(value)
  const model = form ?? value
  const mutation = useMutation({
    mutationFn: async (body: Section) => {
      const payload = {
        code: body.code,
        name: body.name,
        description: body.description,
        isActive: body.isActive,
      }
      if (body.uid)
        await apiClient.patch(
          `/production-structure/sections/${body.uid}`,
          payload
        )
      else await apiClient.post('/production-structure/sections', payload)
    },
    onSuccess: () => {
      toast.success('Bagian produksi disimpan.')
      onSaved()
      onClose()
    },
    onError: () => toast.error('Bagian produksi gagal disimpan.'),
  })
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {value?.uid ? 'Ubah Bagian' : 'Tambah Bagian'}
          </DialogTitle>
          <DialogDescription>
            Bagian dapat dipakai oleh lebih dari satu Modul.
          </DialogDescription>
        </DialogHeader>
        {model && (
          <form
            className='grid gap-3'
            onSubmit={(event) => {
              event.preventDefault()
              mutation.mutate(form ?? model)
            }}
          >
            <Text
              label='Kode'
              value={model.code}
              onChange={(code) => setForm({ ...model, code })}
            />
            <Text
              label='Nama Bagian'
              value={model.name}
              onChange={(name) => setForm({ ...model, name })}
            />
            <Text
              label='Keterangan'
              value={model.description ?? ''}
              onChange={(description) => setForm({ ...model, description })}
            />
            <Active
              active={model.isActive}
              onChange={(isActive) => setForm({ ...model, isActive })}
            />
            <Button disabled={mutation.isPending}>Simpan</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
function MappingDialog({
  value,
  modules,
  sections,
  onClose,
  onSaved,
}: {
  value?: Mapping
  modules: Module[]
  sections: Section[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Mapping>()
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setForm(value), [value])
  const open = Boolean(value)
  const model = form ?? value
  const mutation = useMutation({
    mutationFn: async (body: Mapping) => {
      if (body.uid)
        await apiClient.patch(
          `/production-structure/module-sections/${body.uid}`,
          { isActive: body.isActive }
        )
      else
        await apiClient.post('/production-structure/module-sections', {
          moduleUid: body.moduleUid,
          sectionUid: body.sectionUid,
          isActive: body.isActive,
        })
    },
    onSuccess: () => {
      toast.success('Pemetaan Modul dan Bagian disimpan.')
      onSaved()
      onClose()
    },
    onError: () =>
      toast.error('Pemetaan gagal disimpan. Pastikan pasangan belum ada.'),
  })
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {value?.uid ? 'Ubah Pemetaan' : 'Tambah Pemetaan'}
          </DialogTitle>
          <DialogDescription>
            Hanya pasangan aktif yang dapat dipilih saat input karyawan
            Borongan.
          </DialogDescription>
        </DialogHeader>
        {model && (
          <form
            className='grid gap-3'
            onSubmit={(event) => {
              event.preventDefault()
              mutation.mutate(form ?? model)
            }}
          >
            <Select
              label='Modul'
              value={model.moduleUid}
              onChange={(moduleUid) => setForm({ ...model, moduleUid })}
              options={[
                { value: '', label: 'Pilih Modul' },
                ...modules
                  .filter((item) => item.isActive)
                  .map((item) => ({
                    value: item.uid,
                    label: `${item.site} • ${item.name}`,
                  })),
              ]}
              disabled={Boolean(value?.uid)}
            />
            <Select
              label='Bagian'
              value={model.sectionUid}
              onChange={(sectionUid) => setForm({ ...model, sectionUid })}
              options={[
                { value: '', label: 'Pilih Bagian' },
                ...sections
                  .filter((item) => item.isActive)
                  .map((item) => ({ value: item.uid, label: item.name })),
              ]}
              disabled={Boolean(value?.uid)}
            />
            <Active
              active={model.isActive}
              onChange={(isActive) => setForm({ ...model, isActive })}
            />
            <Button
              disabled={
                mutation.isPending ||
                (!model.uid && (!model.moduleUid || !model.sectionUid))
              }
            >
              Simpan
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
function Text({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className='grid gap-1 text-sm'>
      {label}
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={label !== 'Keterangan'}
      />
    </label>
  )
}
function Select({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  return (
    <label className='grid gap-1 text-sm'>
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className='h-9 rounded-md border bg-background px-3'
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
function Active({
  active,
  onChange,
}: {
  active: boolean
  onChange: (active: boolean) => void
}) {
  return (
    <label className='flex items-center gap-2 text-sm'>
      <input
        type='checkbox'
        checked={active}
        onChange={(event) => onChange(event.target.checked)}
      />{' '}
      Aktif
    </label>
  )
}
