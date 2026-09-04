import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import { Calendar as CalendarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

type DatePickerProps = {
  id?: string
  selected: Date | undefined
  onSelect: (date: Date | undefined) => void
  placeholder?: string
  disabled?: boolean
  fromYear?: number
  toYear?: number
  disabledDates?: (date: Date) => boolean
  triggerClassName?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

export function DatePicker({
  id,
  selected,
  onSelect,
  placeholder = 'Pilih tanggal',
  disabled = false,
  fromYear = 1900,
  toYear = new Date().getFullYear() + 20,
  disabledDates,
  triggerClassName,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}: DatePickerProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant='outline'
          disabled={disabled}
          data-empty={!selected}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn(
            'w-full justify-start text-start font-normal data-[empty=true]:text-muted-foreground',
            triggerClassName
          )}
        >
          {selected ? (
            format(selected, 'd MMMM yyyy', { locale: idLocale })
          ) : (
            <span>{placeholder}</span>
          )}
          <CalendarIcon className='ms-auto h-4 w-4 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0'>
        <Calendar
          mode='single'
          captionLayout='dropdown'
          selected={selected}
          onSelect={onSelect}
          fromYear={fromYear}
          toYear={toYear}
          disabled={disabledDates}
        />
      </PopoverContent>
    </Popover>
  )
}
