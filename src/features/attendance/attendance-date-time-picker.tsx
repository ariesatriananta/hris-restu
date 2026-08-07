import { useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/date-picker'
import { dateOnlyFromInput, dateOnlyToInput } from './date-only'

const hours = Array.from({ length: 24 }, (_, value) =>
  String(value).padStart(2, '0')
)
const minutes = Array.from({ length: 60 }, (_, value) =>
  String(value).padStart(2, '0')
)

export function AttendanceDateTimePicker({
  value,
  defaultDate,
  onChange,
}: {
  value: string
  defaultDate: string
  onChange: (value: string) => void
}) {
  const [draftDate, setDraftDate] = useState(value.slice(0, 10) || defaultDate)
  const [draftHour, setDraftHour] = useState(value.slice(11, 13))
  const [draftMinute, setDraftMinute] = useState(value.slice(14, 16))
  const nextBusinessDate = addDays(defaultDate, 1)

  const emit = (date: string, hour: string, minute: string) => {
    onChange(date && hour && minute ? `${date}T${hour}:${minute}` : '')
  }

  return (
    <div className='grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_5.5rem_5.5rem]'>
      <div className='col-span-2 sm:col-span-1'>
        <DatePicker
          selected={dateOnlyFromInput(draftDate)}
          onSelect={(date) => {
            const next = dateOnlyToInput(date)
            if (!next) return
            setDraftDate(next)
            emit(next, draftHour, draftMinute)
          }}
          disabledDates={(date) => {
            const current = dateOnlyToInput(date)
            return current < defaultDate || current > nextBusinessDate
          }}
        />
      </div>
      <Select
        value={draftHour}
        onValueChange={(hour) => {
          const minute = draftMinute || '00'
          setDraftHour(hour)
          setDraftMinute(minute)
          emit(draftDate, hour, minute)
        }}
      >
        <SelectTrigger aria-label='Jam'>
          <SelectValue placeholder='Jam' />
        </SelectTrigger>
        <SelectContent>
          {hours.map((hour) => (
            <SelectItem key={hour} value={hour}>
              {hour}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={draftMinute}
        disabled={!draftHour}
        onValueChange={(minute) => {
          setDraftMinute(minute)
          emit(draftDate, draftHour, minute)
        }}
      >
        <SelectTrigger aria-label='Menit'>
          <SelectValue placeholder='Menit' />
        </SelectTrigger>
        <SelectContent>
          {minutes.map((minute) => (
            <SelectItem key={minute} value={minute}>
              {minute}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function addDays(value: string, days: number) {
  const date = dateOnlyFromInput(value)
  if (!date) return value
  date.setDate(date.getDate() + days)
  return dateOnlyToInput(date)
}
