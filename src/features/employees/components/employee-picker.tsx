import { useState } from 'react'
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
import { useEmployee, useEmployeeList } from '../data/queries'
import type { Employee } from '../domain'

export function EmployeePicker({
  value,
  onChange,
  onSelectEmployee,
  locked = false,
}: {
  value: string
  onChange: (value: string) => void
  onSelectEmployee?: (employee: Employee) => void
  locked?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = useEmployee(value)
  const results = useEmployeeList({ query, page: 1, pageSize: 20 })
  const label = selected.data
    ? `${selected.data.fullName} · ${selected.data.employeeNumber}`
    : value
      ? 'Memuat karyawan...'
      : 'Pilih karyawan'
  return (
    <div className='grid gap-1 text-sm'>
      <span>Karyawan</span>
      {locked ? (
        <div className='flex h-9 items-center rounded-md border bg-muted px-3 text-muted-foreground'>
          {label}
        </div>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type='button'
              variant='outline'
              role='combobox'
              aria-expanded={open}
              className='justify-between font-normal'
            >
              {label}
              <ChevronsUpDown className='opacity-50' />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align='start'
            className='w-[min(28rem,calc(100vw-2rem))] p-0'
          >
            <Command shouldFilter={false}>
              <CommandInput
                placeholder='Cari nama atau nomor karyawan...'
                value={query}
                onValueChange={setQuery}
              />
              <CommandList>
                <CommandEmpty>
                  {results.isPending
                    ? 'Mencari...'
                    : 'Karyawan tidak ditemukan.'}
                </CommandEmpty>
                <CommandGroup>
                  {(results.data?.items ?? []).map((employee) => (
                    <CommandItem
                      key={employee.uid}
                      value={employee.uid}
                      onSelect={() => {
                        onChange(employee.uid)
                        onSelectEmployee?.(employee)
                        setOpen(false)
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2',
                          value === employee.uid ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {employee.fullName} · {employee.employeeNumber}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}
