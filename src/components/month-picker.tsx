import { useState } from 'react'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type MonthPickerProps = {
  id?: string
  selected: Date | undefined
  onSelect: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  fromYear?: number
  toYear?: number
  triggerClassName?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

const monthIndexes = Array.from({ length: 12 }, (_, index) => index)

export function MonthPicker({
  id,
  selected,
  onSelect,
  placeholder = 'Pilih bulan',
  disabled = false,
  fromYear = 2020,
  toYear = new Date().getFullYear() + 6,
  triggerClassName,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: MonthPickerProps) {
  const [open, setOpen] = useState(false)
  const [displayYear, setDisplayYear] = useState(
    selected?.getFullYear() ?? new Date().getFullYear()
  )

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setDisplayYear(selected?.getFullYear() ?? new Date().getFullYear())
        }
        setOpen(nextOpen)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type='button'
          variant='outline'
          disabled={disabled}
          data-empty={!selected}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn(
            'w-full justify-start text-start font-normal capitalize data-[empty=true]:text-muted-foreground',
            triggerClassName
          )}
        >
          {selected ? (
            format(selected, 'MMMM yyyy', { locale: idLocale })
          ) : (
            <span>{placeholder}</span>
          )}
          <CalendarDays className='ms-auto size-4 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-72 p-3' align='start'>
        <div className='mb-3 flex items-center justify-between gap-2'>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            disabled={displayYear <= fromYear}
            aria-label='Tahun sebelumnya'
            onClick={() => setDisplayYear((year) => year - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className='text-sm font-semibold'>{displayYear}</span>
          <Button
            type='button'
            variant='ghost'
            size='icon'
            disabled={displayYear >= toYear}
            aria-label='Tahun berikutnya'
            onClick={() => setDisplayYear((year) => year + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className='grid grid-cols-3 gap-1.5'>
          {monthIndexes.map((month) => {
            const date = new Date(displayYear, month, 1)
            const isSelected =
              selected?.getFullYear() === displayYear &&
              selected.getMonth() === month

            return (
              <Button
                key={month}
                type='button'
                variant={isSelected ? 'default' : 'ghost'}
                size='sm'
                className='capitalize'
                aria-pressed={isSelected}
                onClick={() => {
                  onSelect(date)
                  setOpen(false)
                }}
              >
                {format(date, 'MMM', { locale: idLocale })}
              </Button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
