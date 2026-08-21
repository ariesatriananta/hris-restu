import { useEffect, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useProductionEligibleEmployees } from './data/queries'
import type { ProductionEligibleEmployee, ProductionSite } from './domain'

type SelectedEmployee = Pick<
  ProductionEligibleEmployee,
  'uid' | 'fullName' | 'employeeNumber' | 'employeeType' | 'site'
>

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timeout)
  }, [delay, value])
  return debounced
}

export function ProductionEmployeePicker({
  site,
  asOf,
  value,
  selected,
  onChange,
}: {
  site: ProductionSite
  asOf: string
  value: string
  selected?: SelectedEmployee
  onChange: (employee: ProductionEligibleEmployee) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query.trim())
  const employees = useProductionEligibleEmployees(
    {
      site,
      asOf,
      query: debouncedQuery || undefined,
      page: 1,
      pageSize: 20,
    },
    open
  )
  const label = selected
    ? `${selected.fullName} · ${selected.employeeNumber}`
    : value
      ? 'Karyawan terpilih'
      : 'Pilih karyawan eligible'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={!asOf}
          className='w-full justify-between font-normal'
        >
          <span className='truncate'>
            {asOf ? label : 'Pilih tanggal efektif terlebih dahulu'}
          </span>
          <ChevronsUpDown className='shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-[min(32rem,calc(100vw-2rem))] p-0'
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder='Cari nama atau nomor karyawan...'
          />
          <CommandList>
            <CommandEmpty>
              {employees.isPending ? (
                'Mencari karyawan eligible...'
              ) : employees.isError ? (
                <div className='flex flex-col items-center gap-2 py-2'>
                  <span>Daftar karyawan gagal dimuat.</span>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => void employees.refetch()}
                  >
                    Coba lagi
                  </Button>
                </div>
              ) : (
                'Karyawan eligible tidak ditemukan.'
              )}
            </CommandEmpty>
            <CommandGroup>
              {(employees.data?.items ?? []).map((employee) => (
                <CommandItem
                  key={employee.uid}
                  value={employee.uid}
                  onSelect={() => {
                    onChange(employee)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 size-4',
                      value === employee.uid ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className='min-w-0'>
                    <p className='truncate font-medium'>
                      {employee.fullName} · {employee.employeeNumber}
                    </p>
                    <p className='truncate text-xs text-muted-foreground'>
                      {employee.employeeType} ·{' '}
                      {employee.productionSection?.name ??
                        'Bagian belum diatur'}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
