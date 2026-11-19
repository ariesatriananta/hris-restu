import { format } from 'date-fns'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/date-picker'
import {
  productionCategoryToday,
  type ProductionCategory,
} from './production-category'

export function ProductionCategoryFields({
  value,
  previousValue,
  effectiveFrom,
  onChange,
  onDateChange,
  disabled,
  allowUnmapped = true,
}: {
  value?: ProductionCategory | null
  previousValue?: ProductionCategory | null
  effectiveFrom: string
  onChange: (value: ProductionCategory | null) => void
  onDateChange: (value: string) => void
  disabled?: boolean
  allowUnmapped?: boolean
}) {
  const today = productionCategoryToday()
  const alreadyMapped = Boolean(previousValue)
  return (
    <div className='space-y-2'>
      <Label htmlFor='production-category'>Kategori Produksi</Label>
      <Select
        value={value ?? 'UNMAPPED'}
        disabled={disabled}
        onValueChange={(next) =>
          onChange(next === 'UNMAPPED' ? null : (next as ProductionCategory))
        }
      >
        <SelectTrigger id='production-category' className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {!alreadyMapped && allowUnmapped && (
            <SelectItem value='UNMAPPED'>Belum dipetakan</SelectItem>
          )}
          <SelectItem value='REGULER'>Reguler</SelectItem>
          <SelectItem value='PREMIUM'>Premium</SelectItem>
        </SelectContent>
      </Select>
      {value && (
        <div className='space-y-2'>
          <Label htmlFor='production-category-effective-from'>
            Berlaku mulai
          </Label>
          <DatePicker
            id='production-category-effective-from'
            selected={
              effectiveFrom ? new Date(`${effectiveFrom}T00:00:00`) : undefined
            }
            onSelect={(date) =>
              onDateChange(date ? format(date, 'yyyy-MM-dd') : '')
            }
            disabled={disabled}
            disabledDates={(date) => format(date, 'yyyy-MM-dd') > today}
          />
          <p className='text-xs text-muted-foreground'>
            {alreadyMapped
              ? 'Perubahan tanggal/kategori dapat mengubah pengelompokan laporan pada periode terkait.'
              : 'Pemetaan awal boleh berlaku sejak tanggal lampau. Data sebelum tanggal ini tetap belum dipetakan.'}
          </p>
        </div>
      )}
      {!value && (
        <p className='text-xs text-muted-foreground'>
          Belum masuk kelompok Reguler/Premium pada laporan Attendance Rate.
        </p>
      )}
    </div>
  )
}
